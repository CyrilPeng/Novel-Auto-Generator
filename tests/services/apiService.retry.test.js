import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiService } from '../../txtToWorldbook/services/apiService.js';
import { createProcessingService } from '../../txtToWorldbook/services/processingService.js';
import { createParserService } from '../../txtToWorldbook/services/parserService.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { APICaller } from '../../txtToWorldbook/infra/apiCaller.js';

it('does not replay an unknown host failure as a format fallback', async () => {
    const generateRaw = vi.fn().mockRejectedValue(new Error('internal parser failed'));
    vi.stubGlobal('SillyTavern', { getContext: () => ({ generateRaw }) });
    const { api } = setup();
    await expect(
        api.callSillyTavernAPI([
            { role: 'system', content: 's' },
            { role: 'user', content: 'u' },
        ]),
    ).rejects.toThrow('internal parser failed');
    expect(generateRaw).toHaveBeenCalledTimes(1);
});

it('falls back only for a recognized host argument signature mismatch', async () => {
    const generateRaw = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('prompt.trim is not a function'))
        .mockResolvedValue('OK');
    vi.stubGlobal('SillyTavern', { getContext: () => ({ generateRaw }) });
    const { api } = setup();
    await expect(
        api.callSillyTavernAPI([
            { role: 'system', content: 's' },
            { role: 'user', content: 'u' },
        ]),
    ).resolves.toBe('OK');
    expect(generateRaw).toHaveBeenCalledTimes(2);
    expect(typeof generateRaw.mock.calls[1][0]).toBe('string');
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup() {
    const AppState = createInitialAppState();
    AppState.settings = {
        useTavernApi: false,
        customApiProvider: 'gemini',
        customApiKey: 'synthetic-test-key',
        apiTimeout: 20,
    };
    AppState.memory.queue = [{ title: '第一章', content: '合成正文' }];
    const noop = () => {};
    const api = createApiService({
        AppState,
        APICaller,
        Logger: { warn: noop },
        debugLog: noop,
        updateStreamContent: noop,
        messagesToString: (messages) => messages.map((m) => m.content).join('\n'),
        convertToGeminiContents: (messages) => ({ contents: messages }),
        applyMessageChain: (content) => [{ role: 'user', content }],
    });
    const parser = createParserService({ AppState, debugLog: noop, getEnabledCategoryNames: () => ['角色'] });
    const processing = createProcessingService({
        AppState,
        callAPI: api.callAPI,
        updateMemoryQueueUI: noop,
        updateStreamContent: noop,
        debugLog: noop,
        getLanguagePrefix: () => '',
        buildSystemPrompt: () => '',
        getPreviousMemoryContext: () => '',
        getEnabledCategories: () => [{ name: '角色' }],
        isTokenLimitError: () => false,
        parseAIResponse: parser.parseAIResponse,
        postProcessResultWithChapterIndex: (value) => value,
    });
    return { AppState, api, processing };
}

const response = (text) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

describe('real API and chapter retry integration', () => {
    it('rejects JSON output explicitly truncated by the model without retrying transport', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }],
                }),
            ),
        );
        vi.stubGlobal('fetch', fetch);
        const { api } = setup();
        await expect(api.callCustomAPI([{ role: 'user', content: 'fixture' }])).rejects.toMatchObject({
            code: 'TOKEN_LIMIT',
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('joins all Gemini text parts and excludes thought parts', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        candidates: [
                            {
                                finishReason: 'STOP',
                                content: {
                                    parts: [{ text: '思考', thought: true }, { text: '前半' }, { text: '后半' }],
                                },
                            },
                        ],
                    }),
                ),
            ),
        );
        const { api } = setup();
        await expect(api.callCustomAPI([{ role: 'user', content: 'fixture' }])).resolves.toBe('前半后半');
    });

    it('cancels local waiting for an uncancellable host and cleans timers', async () => {
        vi.useFakeTimers();
        const generateRaw = vi.fn().mockReturnValue(new Promise(() => {}));
        vi.stubGlobal('SillyTavern', { getContext: () => ({ generateRaw }) });
        const controller = new AbortController();
        const { api } = setup();
        const result = api
            .callSillyTavernAPI([{ role: 'user', content: 'fixture' }], null, { signal: controller.signal })
            .catch((error) => error);
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        expect(await result).toMatchObject({ code: 'ABORTED' });
        expect(generateRaw).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('caps nested transport/processing retry at four physical calls', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('unavailable', { status: 503 })));
        vi.stubGlobal('fetch', fetch);
        const { processing } = setup();
        const result = processing.processMemoryChunkIndependent({ index: 0 }).catch((error) => error);
        await vi.runAllTimersAsync();
        expect(await result).toMatchObject({ httpStatus: 503 });
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('shares remaining budget with one invalid-content retry', async () => {
        vi.useFakeTimers();
        const update = { 角色: { 林舟: { 关键词: ['林舟'], 内容: '旅人' } } };
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response('busy', { status: 503 }))
            .mockResolvedValueOnce(new Response('busy', { status: 503 }))
            .mockResolvedValueOnce(response('{}'))
            .mockResolvedValueOnce(response(JSON.stringify(update)));
        vi.stubGlobal('fetch', fetch);
        const { processing } = setup();
        const result = processing.processMemoryChunkIndependent({ index: 0 });
        await vi.runAllTimersAsync();
        expect(await result).toEqual(update);
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('does not retry authorization failures at either layer', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response('network error', { status: 401 }));
        vi.stubGlobal('fetch', fetch);
        const { processing } = setup();
        await expect(processing.processMemoryChunkIndependent({ index: 0 })).rejects.toMatchObject({
            httpStatus: 401,
            retryable: false,
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a host timeout whose upstream request may still be active', async () => {
        vi.useFakeTimers();
        const generateRaw = vi.fn().mockReturnValue(new Promise(() => {}));
        vi.stubGlobal('SillyTavern', { getContext: () => ({ generateRaw }) });
        const { api } = setup();
        const result = api.callSillyTavernAPI([{ role: 'user', content: 'fixture' }]).catch((error) => error);
        await vi.runAllTimersAsync();
        expect(await result).toMatchObject({ code: 'HOST_TIMEOUT', retryable: false });
        expect(generateRaw).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});

it('keeps an uncancellable upstream slot until it settles', async () => {
    vi.useFakeTimers();
    let finish;
    const generateRaw = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise((r) => {
                    finish = r;
                }),
        )
        .mockResolvedValue('new');
    vi.stubGlobal('SillyTavern', { getContext: () => ({ generateRaw }) });
    const { api } = setup();
    const controller = new AbortController();
    const first = api
        .callSillyTavernAPI([{ role: 'user', content: 'old' }], null, { signal: controller.signal })
        .catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await first).code).toBe('ABORTED');
    const next = api.callSillyTavernAPI([{ role: 'user', content: 'next' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(generateRaw).toHaveBeenCalledTimes(1);
    finish('old');
    await expect(next).resolves.toBe('new');
    expect(generateRaw).toHaveBeenCalledTimes(2);
});

it('does not dispatch queued requests that already timed out', async () => {
    vi.useFakeTimers();
    let finish;
    const generateRaw = vi.fn(
        () =>
            new Promise((r) => {
                finish = r;
            }),
    );
    vi.stubGlobal('SillyTavern', { getContext: () => ({ generateRaw }) });
    const { api } = setup();
    const first = api.callSillyTavernAPI([{ role: 'user', content: 'old' }]).catch((e) => e);
    const next = api.callSillyTavernAPI([{ role: 'user', content: 'queued' }]).catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await first).code).toBe('HOST_TIMEOUT');
    expect((await next).code).toBe('HOST_TIMEOUT');
    finish('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(generateRaw).toHaveBeenCalledTimes(1);
});

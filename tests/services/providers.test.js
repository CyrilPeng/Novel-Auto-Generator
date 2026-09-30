import { afterEach, expect, it, vi } from 'vitest';
import { buildCustomApiRequest, extractCustomApiText } from '../../txtToWorldbook/infra/providers/customProviders.js';
import { createApiService } from '../../txtToWorldbook/services/apiService.js';
import { createPromptService } from '../../txtToWorldbook/services/promptService.js';
import { APICaller } from '../../txtToWorldbook/infra/apiCaller.js';

const messages = [
    { role: 'system', content: '规则' },
    { role: 'user', content: '正文' },
];
const convert = createPromptService({}).convertToGeminiContents;
afterEach(() => vi.unstubAllGlobals());
function setup(provider) {
    const settings = {
        customApiProvider: provider,
        customApiKey: 'fixture-key',
        customApiModel: 'fixture-model',
        apiTimeout: 1000,
    };
    const api = createApiService({
        AppState: { settings },
        APICaller,
        Logger: { warn: vi.fn() },
        updateStreamContent: vi.fn(),
        debugLog: vi.fn(),
        messagesToString: (m) => m.map((x) => x.content).join(''),
        convertToGeminiContents: convert,
        applyMessageChain: (text) => [
            { role: 'system', content: '规则' },
            { role: 'user', content: text },
        ],
    });
    return { settings, api };
}

it('uses Anthropic system field, custom endpoint and native credentials', () => {
    const request = buildCustomApiRequest(
        {
            customApiProvider: 'anthropic',
            customApiKey: 'key',
            customApiEndpoint: 'https://proxy.test/v1/messages?route=a',
        },
        messages,
        convert,
    );
    const body = JSON.parse(request.requestOptions.body);
    expect(body.system).toBe('规则');
    expect(body.messages).toEqual([messages[1]]);
    expect(request.requestUrl).toBe('https://proxy.test/v1/messages?route=a');
    expect(request.requestOptions.headers['x-api-key']).toBe('key');
});

it('builds Gemini model paths before query parameters and keeps credentials out of the URL', () => {
    const request = buildCustomApiRequest(
        {
            customApiProvider: 'gemini',
            customApiKey: 'fixture-key',
            customApiModel: 'models/gemini-x',
            customApiEndpoint: 'https://proxy.test/v1beta/models?route=a',
        },
        messages,
        convert,
    );
    expect(request.requestUrl).toBe('https://proxy.test/v1beta/models/gemini-x:generateContent?route=a');
    expect(request.requestOptions.headers['x-goog-api-key']).toBe('fixture-key');
    const body = JSON.parse(request.requestOptions.body);
    expect(body.systemInstruction.parts[0].text).toBe('规则');
    expect(body.contents[0].role).toBe('user');
});

it.each(['anthropic', 'gemini', 'openai-compatible'])(
    'tests %s through its production transport and parser',
    async (provider) => {
        const { api } = setup(provider);
        const fetch = vi.fn(async () =>
            provider === 'openai-compatible'
                ? new Response(
                      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
                  )
                : new Response(
                      JSON.stringify(
                          provider === 'gemini'
                              ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }
                              : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] },
                      ),
                  ),
        );
        vi.stubGlobal('fetch', fetch);
        const result = await api.handleQuickTestModel();
        expect(result.response).toBe('OK');
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, options] = fetch.mock.calls[0],
            body = JSON.parse(options.body);
        if (provider === 'openai-compatible') {
            expect(body.stream).toBe(true);
            expect(body.messages[0].role).toBe('system');
        }
        if (provider === 'anthropic') {
            expect(url).toContain('/v1/messages');
            expect(body.system).toBe('规则');
        }
        if (provider === 'gemini') {
            expect(url).toContain(':generateContent');
            expect(body.systemInstruction).toBeDefined();
        }
        expect(body.max_tokens || body.generationConfig?.maxOutputTokens).toBe(100);
    },
);

it('rejects truncated test responses instead of reporting success', async () => {
    const { api } = setup('anthropic');
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'OK' }] })),
        ),
    );
    await expect(api.handleQuickTestModel()).rejects.toMatchObject({ code: 'TOKEN_LIMIT' });
});

it('reads Gemini model pages using native auth and filters non-generation models', async () => {
    const { api } = setup('gemini');
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    models: [
                        { name: 'models/a', supportedGenerationMethods: ['generateContent'] },
                        { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
                    ],
                    nextPageToken: 'second',
                }),
            ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'models/b' }] })));
    vi.stubGlobal('fetch', fetch);
    expect(await api.handleFetchModelList()).toEqual(['a', 'b']);
    expect(fetch.mock.calls[1][0]).toContain('pageToken=second');
    expect(fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('fixture-key');
});

it('classifies provider errors and blocked generations', () => {
    expect(() => extractCustomApiText('gemini', { error: { code: 401, message: 'invalid key' } })).toThrow(
        expect.objectContaining({ retryable: false, httpStatus: 401 }),
    );
    expect(() => extractCustomApiText('gemini', { error: { code: 429, message: 'busy' } })).toThrow(
        expect.objectContaining({ retryable: true, httpStatus: 429 }),
    );
    expect(() => extractCustomApiText('gemini', { promptFeedback: { blockReason: 'SAFETY' } })).toThrow(
        expect.objectContaining({ code: 'GENERATION_BLOCKED' }),
    );
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { APICaller } from '../../txtToWorldbook/infra/apiCaller.js';
import { AbortedError, FatalError, RetryableError, isRetryable } from '../../txtToWorldbook/core/errors.js';
import { createRequestBudget } from '../../txtToWorldbook/core/requestPolicy.js';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('request retry policy', () => {
    it.each([408, 429, 500, 502, 503, 504, 529])('retries typed HTTP %s consistently', (httpStatus) => {
        const error = new RetryableError('接口暂不可用', { httpStatus });
        expect(APICaller.isRetryableError(error)).toBe(true);
        expect(isRetryable(error)).toBe(true);
    });

    it.each(['请求超时', '网络错误: Failed to fetch', 'fetch failed', 'ECONNRESET'])('recognizes %s', (message) => {
        expect(APICaller.isRetryableError(new Error(message))).toBe(true);
    });

    it.each([401, 403])('never retries HTTP %s even if body says network error', (httpStatus) => {
        const error = new FatalError('network error', { httpStatus });
        expect(error.httpStatus).toBe(httpStatus);
        expect(APICaller.isRetryableError(error)).toBe(false);
        expect(isRetryable(error)).toBe(false);
    });

    it('preserves HTTP status and bounded Retry-After', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('busy', { status: 429, headers: { 'Retry-After': '90' } })),
        );
        await expect(APICaller.request('https://fixture.invalid')).rejects.toMatchObject({
            httpStatus: 429,
            retryable: true,
            retryAfterMs: 30000,
        });
    });

    it('explicit nonretryable and cancellation beat fallback text', () => {
        expect(APICaller.isRetryableError(Object.assign(new Error('network error'), { retryable: false }))).toBe(false);
        expect(APICaller.isRetryableError(new AbortedError('network error'))).toBe(false);
        expect(APICaller.isRetryableError(Object.assign(new Error('timeout'), { name: 'AbortError' }))).toBe(false);
    });

    it('shares a total budget across nested retry loops', async () => {
        vi.useFakeTimers();
        const budget = createRequestBudget(4);
        const request = vi.fn().mockRejectedValue(new RetryableError('network error'));
        const run = APICaller.withRetry(() => APICaller.withRetry(request, { retries: 3, budget }), {
            retries: 3,
            shouldRetry: () => budget.remaining > 0,
        });
        const assertion = expect(run).rejects.toThrow('network error');
        await vi.runAllTimersAsync();
        await assertion;
        expect(request).toHaveBeenCalledTimes(4);
        expect(budget.remaining).toBe(0);
    });

    it('honors server delay and cancels during backoff without another request', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const request = vi.fn().mockRejectedValue(new RetryableError('busy', { retryAfterMs: 10000 }));
        const run = APICaller.withRetry(request, { retries: 3, signal: controller.signal });
        const assertion = expect(run).rejects.toMatchObject({ code: 'ABORTED' });
        await vi.advanceTimersByTimeAsync(9999);
        expect(request).toHaveBeenCalledTimes(1);
        controller.abort();
        await assertion;
        await vi.runAllTimersAsync();
        expect(request).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not begin a cancelled attempt', async () => {
        const controller = new AbortController();
        controller.abort();
        const request = vi.fn();
        await expect(APICaller.withRetry(request, { retries: 3, signal: controller.signal })).rejects.toMatchObject({
            code: 'ABORTED',
        });
        expect(request).not.toHaveBeenCalled();
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { APICaller } from '../../txtToWorldbook/infra/apiCaller.js';

const encoder = new TextEncoder();
const delta = (text) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`;
function streamResponse(parts, { close = true } = {}) {
    return new Response(
        new ReadableStream({
            start(controller) {
                for (const part of parts) controller.enqueue(typeof part === 'string' ? encoder.encode(part) : part);
                if (close) controller.close();
            },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
    );
}
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('stream completeness and lifecycle', () => {
    it('caps response bytes and releases the reader after rejection', async () => {
        const response = streamResponse([delta('a'.repeat(256))]);
        await expect(APICaller.parseSSEStream(response, { maxBytes: 64 })).rejects.toMatchObject({
            code: 'RESPONSE_TOO_LARGE',
        });
        expect(response.body.locked).toBe(false);
    });

    it('propagates a reader failure and clears every timeout', async () => {
        vi.useFakeTimers();
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.error(new Error('socket reset'));
                },
            }),
        );
        await expect(APICaller.parseSSEStream(response)).rejects.toMatchObject({ code: 'STREAM_READ_ERROR' });
        expect(response.body.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('uses EOF compatibility only when explicitly enabled', async () => {
        await expect(APICaller.parseSSEStream(streamResponse([delta('legacy')]), { allowEOF: true })).resolves.toBe(
            'legacy',
        );
        await expect(APICaller.parseSSEStream(streamResponse(['data: [DONE]\n\n']))).rejects.toMatchObject({
            code: 'EMPTY_RESPONSE',
        });
    });

    it('handles CRLF, split UTF-8 and data without an optional space', async () => {
        const raw = encoder.encode((delta('林舟') + 'data:[DONE]\n\n').replaceAll('\n', '\r\n'));
        const response = streamResponse(Array.from(raw, (byte) => new Uint8Array([byte])));
        await expect(APICaller.parseSSEStream(response)).resolves.toBe('林舟');
        expect(response.body.locked).toBe(false);
    });

    it('handles multiline data records and comments', async () => {
        const response = streamResponse([
            ':heartbeat\n\ndata: {"choices":\ndata: [{"delta":{"content":"正文"}}]}\n\ndata: [DONE]\n\n',
        ]);
        await expect(APICaller.parseSSEStream(response)).resolves.toBe('正文');
    });

    it('rejects a partial response followed by EOF', async () => {
        const response = streamResponse([delta('partial')]);
        await expect(APICaller.parseSSEStream(response)).rejects.toMatchObject({ code: 'INCOMPLETE_STREAM' });
        expect(response.body.locked).toBe(false);
    });

    it('rejects idle timeout rather than returning partial output', async () => {
        vi.useFakeTimers();
        const response = streamResponse([delta('partial')], { close: false });
        const result = APICaller.parseSSEStream(response, { inactivityTimeout: 20 }).catch((error) => error);
        await vi.advanceTimersByTimeAsync(21);
        expect(await result).toMatchObject({ code: 'STREAM_TIMEOUT' });
        expect(response.body.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('accepts a verified stop without waiting for the socket to close', async () => {
        vi.useFakeTimers();
        const response = streamResponse([delta('完成') + 'data: {"choices":[{"finish_reason":"stop"}]}\n\n'], {
            close: false,
        });
        await expect(APICaller.parseSSEStream(response)).resolves.toBe('完成');
        expect(response.body.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['length', 'content_filter', 'tool_calls'])('rejects %s even with valid text', async (reason) => {
        const response = streamResponse([
            delta('{}') + `data: {"choices":[{"finish_reason":"${reason}"}]}\n\ndata: [DONE]\n\n`,
        ]);
        await expect(APICaller.parseSSEStream(response)).rejects.toBeInstanceOf(Error);
    });

    it('rejects provider errors and invalid events', async () => {
        await expect(
            APICaller.parseSSEStream(
                streamResponse(['event: error\ndata: {"error":{"status":401,"message":"invalid key"}}\n\n']),
            ),
        ).rejects.toMatchObject({ code: 'STREAM_API_ERROR', httpStatus: 401, retryable: false });
        await expect(APICaller.parseSSEStream(streamResponse(['data: broken-json\n\n']))).rejects.toMatchObject({
            code: 'INVALID_STREAM',
        });
    });

    it('cancels an active body and distinguishes user cancellation', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const response = streamResponse([delta('partial')], { close: false });
        const result = APICaller.parseSSEStream(response, { signal: controller.signal }).catch((error) => error);
        await vi.advanceTimersByTimeAsync(1);
        controller.abort();
        expect(await result).toMatchObject({ code: 'ABORTED', retryable: false });
        expect(response.body.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps the request total timeout alive while reading JSON', async () => {
        vi.useFakeTimers();
        const response = streamResponse(['{"partial":'], { close: false });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        const result = APICaller.requestJSON('https://fixture.invalid', { timeout: 20 }).catch((error) => error);
        await vi.advanceTimersByTimeAsync(21);
        expect(await result).toMatchObject({ code: 'TIMEOUT' });
        expect(response.body.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('total deadline survives heartbeats and a caller signal is not overwritten', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        let bodyController;
        const response = new Response(
            new ReadableStream({
                start(value) {
                    bodyController = value;
                },
            }),
        );
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        const result = APICaller.requestStream('https://fixture.invalid', {
            timeout: 30,
            inactivityTimeout: 20,
            signal: controller.signal,
        }).catch((error) => error);
        await vi.advanceTimersByTimeAsync(10);
        bodyController.enqueue(encoder.encode(': heartbeat\n\n'));
        await vi.advanceTimersByTimeAsync(10);
        bodyController.enqueue(encoder.encode(': heartbeat\n\n'));
        await vi.advanceTimersByTimeAsync(11);
        expect(await result).toMatchObject({ code: 'TIMEOUT' });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not start a fetch for a pre-aborted request', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(
            APICaller.requestJSON('https://fixture.invalid', { signal: AbortSignal.abort() }),
        ).rejects.toMatchObject({ code: 'ABORTED' });
        expect(fetch).not.toHaveBeenCalled();
    });
});

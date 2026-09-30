import { AbortedError, FatalError, RetryableError } from '../core/errors.js';

const scopes = new WeakMap();

function createScope(signal, timeout = 120000) {
    const controller = new AbortController();
    let failure = null;
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
        rejectAbort = reject;
    });
    // A raw response may be returned before the caller starts consuming it.
    aborted.catch(() => {});
    const dispose = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error) => {
        if (failure) return;
        failure = error;
        controller.abort(error);
        rejectAbort(error);
        dispose();
    };
    const onAbort = () => fail(new AbortedError());
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(
        () => fail(new RetryableError('请求总时限已超时', { httpStatus: 408, code: 'TIMEOUT' })),
        timeout,
    );
    if (signal?.aborted) onAbort();
    return {
        signal: controller.signal,
        dispose,
        fail,
        async wait(operation) {
            // Promise.race always observes late failures of abandoned operations.
            const result = await Promise.race([operation, aborted]);
            if (failure) throw failure;
            return result;
        },
    };
}

export async function fetchManaged(url, options = {}, timeout = 120000) {
    const scope = createScope(options.signal, timeout);
    try {
        if (scope.signal.aborted) throw scope.signal.reason;
        const response = await scope.wait(fetch(url, { ...options, signal: scope.signal }));
        scopes.set(response, scope);
        return response;
    } catch (error) {
        scope.dispose();
        if (scope.signal.aborted) throw scope.signal.reason;
        if (error?.code) throw error;
        throw new RetryableError(`网络错误: ${error.message}`, { code: 'NETWORK_ERROR', cause: error });
    }
}

/** Consume through EOF or a verified protocol completion, then release all resources. */
export async function consumeBody(response, onBytes, options = {}) {
    const { inactivityTimeout = 120000, maxBytes = 16 * 1024 * 1024, isComplete = () => false } = options;
    const scope = scopes.get(response) || createScope(options.signal, options.timeout);
    let reader;
    let idleTimer;
    let bytes = 0;
    try {
        if (scope.signal.aborted) throw scope.signal.reason;
        if (!response.body) throw new RetryableError('响应正文不可用', { code: 'EMPTY_RESPONSE' });
        reader = response.body.getReader();
        while (!isComplete()) {
            idleTimer = setTimeout(
                () => scope.fail(new RetryableError('流式响应空闲超时', { code: 'STREAM_TIMEOUT', httpStatus: 408 })),
                inactivityTimeout,
            );
            const { done, value } = await scope.wait(reader.read());
            clearTimeout(idleTimer);
            if (done) return;
            bytes += value.byteLength;
            if (bytes > maxBytes) throw new FatalError('响应超过允许的大小', { code: 'RESPONSE_TOO_LARGE' });
            onBytes(value);
        }
    } catch (error) {
        if (scope.signal.aborted) throw scope.signal.reason;
        if (error?.code) throw error;
        throw new RetryableError(`响应读取失败: ${error.message}`, { code: 'STREAM_READ_ERROR', cause: error });
    } finally {
        clearTimeout(idleTimer);
        scope.dispose();
        scopes.delete(response);
        if (reader) {
            // Do not wait for an uncooperative remote cancellation to finish.
            try {
                Promise.resolve(reader.cancel()).catch(() => {});
            } catch {
                /* already closed */
            }
            try {
                reader.releaseLock();
            } catch {
                /* already released */
            }
        }
    }
}

export async function readResponseText(response, options = {}) {
    const decoder = new TextDecoder();
    let text = '';
    await consumeBody(
        response,
        (bytes) => {
            text += decoder.decode(bytes, { stream: true });
        },
        options,
    );
    return text + decoder.decode();
}

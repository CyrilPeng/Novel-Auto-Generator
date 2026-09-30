import { AbortedError, FatalError } from './errors.js';

/** One budget per logical operation, shared across transport and content retries. */
export function createRequestBudget(maxAttempts = 4) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1)
        throw new RangeError('maxAttempts must be a positive integer');
    let used = 0;
    return {
        get used() {
            return used;
        },
        get remaining() {
            return Math.max(0, maxAttempts - used);
        },
        consume() {
            if (used >= maxAttempts)
                throw new FatalError('请求次数已达到本次操作上限', { code: 'REQUEST_BUDGET_EXHAUSTED' });
            used++;
        },
    };
}

export function throwIfAborted(signal) {
    if (signal?.aborted) throw new AbortedError();
}

export function abortableDelay(ms, signal) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
            cleanup();
            reject(new AbortedError());
        };
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export function parseRetryAfter(value, now = Date.now()) {
    if (value == null || String(value).trim() === '') return undefined;
    const seconds = Number(value);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    return Number.isFinite(ms) ? Math.min(30000, Math.max(0, ms)) : undefined;
}

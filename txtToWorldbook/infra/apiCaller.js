import { Logger } from '../core/logger.js';
import { RetryableError, FatalError, isRetryable, isAborted, HTTP_RETRYABLE } from '../core/errors.js';
import { abortableDelay, throwIfAborted, parseRetryAfter } from '../core/requestPolicy.js';
import { fetchManaged, readResponseText, consumeBody } from './requestLifecycle.js';
import { createSSEParser } from './sseParser.js';

const APICaller = {
    async fetchWithTimeout(url, options = {}, timeout = 120000) {
        return fetchManaged(url, options, timeout);
    },

    async request(url, options = {}) {
        const { timeout, ...fetchOptions } = options;
        const response = await this.fetchWithTimeout(url, fetchOptions, timeout || 120000);
        if (!response.ok) {
            let text = '';
            try {
                text = await readResponseText(response, { maxBytes: 65536 });
            } catch (error) {
                if (isAborted(error)) throw error;
            }
            const ErrorClass = HTTP_RETRYABLE.has(response.status) ? RetryableError : FatalError;
            throw new ErrorClass(
                'API请求失败: ' +
                    response.status +
                    ' ' +
                    response.statusText +
                    (text ? ' - ' + text.slice(0, 200) : ''),
                {
                    httpStatus: response.status,
                    code: 'HTTP_' + response.status,
                    retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
                },
            );
        }
        return response;
    },

    async parseResponse(response, options = {}) {
        return readResponseText(response, options);
    },

    /**
     * extractJSON
     *
     * @param {*} text
     * @returns {*}
     */
    extractJSON(text) {
        try {
            return JSON.parse(text);
        } catch {}

        const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonBlockMatch) {
            try {
                return JSON.parse(jsonBlockMatch[1].trim());
            } catch {}
        }

        const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
            try {
                return JSON.parse(jsonObjectMatch[0]);
            } catch {}
        }

        throw new Error('无法从响应中提取有效的JSON');
    },

    async requestJSON(url, options = {}) {
        const response = await this.request(url, options);
        const text = await this.parseResponse(response, options);
        return this.extractJSON(text);
    },

    async requestText(url, options = {}) {
        const response = await this.request(url, options);
        return this.parseResponse(response, options);
    },

    async parseSSEStream(response, config = {}) {
        const parser = createSSEParser(config);
        await consumeBody(response, (bytes) => parser.push(bytes), { ...config, isComplete: () => parser.complete });
        return parser.finish();
    },

    async requestStream(url, options = {}) {
        const { onChunk, inactivityTimeout, allowEOF, maxBytes, ...requestOptions } = options;
        const response = await this.request(url, requestOptions);
        return this.parseSSEStream(response, {
            onChunk,
            inactivityTimeout,
            allowEOF,
            maxBytes,
            signal: options.signal,
        });
    },

    isRateLimitError(error) {
        if (isAborted(error) || error?.retryable === false) return false;
        const status = Number(error?.httpStatus ?? error?.status);
        if (status >= 400) return status === 429;
        const message = String(error?.responseText || error?.message || '').toLowerCase();
        return /resource_exhausted|rate limit/.test(message);
    },

    isRetryableError(error) {
        return (
            error?.code !== 'TOKEN_LIMIT' &&
            !String(error?.message || '').startsWith('TOKEN_LIMIT:') &&
            isRetryable(error)
        );
    },

    async withRetry(task, config = {}) {
        const { retries = 0, onRetry = null, shouldRetry = null, signal, budget } = config;
        let attempt = 0;
        while (true) {
            throwIfAborted(signal);
            budget?.consume();
            try {
                const result = await task(attempt);
                throwIfAborted(signal);
                return result;
            } catch (error) {
                throwIfAborted(signal);
                const canRetry =
                    !isAborted(error) &&
                    error?.retryable !== false &&
                    attempt < retries &&
                    (!budget || budget.remaining > 0) &&
                    (typeof shouldRetry === 'function' ? shouldRetry(error, attempt) : this.isRetryableError(error));
                if (!canRetry) throw error;
                const delay = Math.min(
                    30000,
                    Math.max(error.retryAfterMs || 0, 2 ** attempt * 1000 * (0.8 + Math.random() * 0.4)),
                );
                if (typeof onRetry === 'function') await onRetry(error, attempt + 1, delay);
                await abortableDelay(delay, signal);
                attempt++;
            }
        }
    },

    /**
     * handleError
     *
     * @param {*} error
     * @param {*} context
     * @returns {*}
     */
    handleError(error, context = '') {
        const prefix = context ? `[${context}] ` : '';
        Logger.error('APICaller', prefix + error.message);

        if (error.message.includes('超时')) {
            return { type: 'timeout', message: '请求超时，请稍后重试' };
        }
        if (error.message.includes('网络') || error.message.includes('fetch')) {
            return { type: 'network', message: '网络错误，请检查连接' };
        }
        if (error.message.includes('API Key')) {
            return { type: 'auth', message: 'API Key 无效或已过期' };
        }

        return { type: 'unknown', message: error.message };
    },

    /**
     * getJSON
     *
     * @param {*} url
     * @param {*} options
     * @returns {Promise<any>}
     */
    async getJSON(url, options = {}) {
        return this.requestJSON(url, options);
    },

    /**
     * getText
     *
     * @param {*} url
     * @param {*} options
     * @returns {Promise<any>}
     */
    async getText(url, options = {}) {
        return this.requestText(url, options);
    },
};

export { APICaller };

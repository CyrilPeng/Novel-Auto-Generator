/**
 * 项目错误类型层次结构
 *
 * 统一错误处理策略：
 * - UserError：用户操作或配置导致的错误，直接向用户提示，不自动重试
 * - RetryableError：瞬态/网络类错误，调用方应自动重试（指数退避）
 * - FatalError：不可恢复错误，停止当前任务流并通知用户
 * - AbortedError：用户主动中止操作，特殊控制流信号
 * - TokenLimitError：AI 响应超过 Token 限制，触发记忆分裂
 */

/**
 * 用户错误 - 配置/操作问题，不需要重试
 */
export class UserError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'UserError';
        this.userFacing = true;
        this.retryable = false;
        this.code = options.code || 'USER_ERROR';
    }
}

/**
 * 可重试错误 - 瞬态/网络问题，调用方应自动重试
 */
export class RetryableError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'RetryableError';
        this.userFacing = false;
        this.retryable = true;
        this.code = options.code || 'RETRYABLE_ERROR';
        this.retryCount = options.retryCount || 0;
        this.httpStatus = options.httpStatus;
        this.retryAfterMs = options.retryAfterMs;
        this.provider = options.provider;
        this.cause = options.cause;
    }
}

/**
 * 致命错误 - 不可恢复，停止当前任务流
 */
export class FatalError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'FatalError';
        this.userFacing = true;
        this.retryable = false;
        this.code = options.code || 'FATAL_ERROR';
        this.cause = options.cause;
        this.httpStatus = options.httpStatus;
        this.provider = options.provider;
    }
}

/**
 * 中止错误 - 用户主动中止，控制流信号
 */
export class AbortedError extends Error {
    constructor(message = '用户中止操作') {
        super(message);
        this.name = 'AbortedError';
        this.userFacing = false;
        this.retryable = false;
        this.code = 'ABORTED';
    }
}

/**
 * Token 超限错误 - AI 响应超出模型限制，触发记忆分裂
 */
export class TokenLimitError extends RetryableError {
    constructor(message, options = {}) {
        super(message || 'AI 响应超过 Token 限制', {
            ...options,
            code: 'TOKEN_LIMIT',
        });
        this.name = 'TokenLimitError';
        this.memoryIndex = options.memoryIndex;
    }
}

/**
 * 错误分类工具：判断错误是否可重试
 * @param {Error} error
 * @returns {boolean}
 */
export const HTTP_RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

export function isAborted(error) {
    return (
        error?.code === 'ABORTED' ||
        error?.name === 'AbortError' ||
        error?.name === 'AbortedError' ||
        error?.message === 'ABORTED'
    );
}

export function isRetryable(error) {
    if (!error || isAborted(error) || error.retryable === false) return false;
    const status = Number(error.httpStatus ?? error.status);
    if (status >= 400) return HTTP_RETRYABLE.has(status);
    if (error.retryable === true) return true;
    const message = String(error.responseText || error.message || '').toLowerCase();
    if (message.startsWith('token_limit:')) return true;
    return /rate limit|resource_exhausted|overloaded|server error|temporarily unavailable|econnreset|network error|failed to fetch|fetch failed|bad gateway|service unavailable|timeout|timed out|超时|网络错误/.test(
        message,
    );
}

/**
 * 错误分类工具：判断错误是否需要向用户展示
 * @param {Error} error
 * @returns {boolean}
 */
export function isUserFacing(error) {
    if (!error) return false;
    if (error.userFacing === true) return true;
    if (error.name === 'AbortedError') return false;
    return false;
}

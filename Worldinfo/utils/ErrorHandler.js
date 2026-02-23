/**
 * 错误处理工具类
 * 提供统一的错误处理、日志记录和上报功能
 */

import { debugLogger } from './DebugLogger.js';

/**
 * 错误类型枚举
 */
export const ErrorType = {
    API: 'API_ERROR',
    NETWORK: 'NETWORK_ERROR',
    PARSE: 'PARSE_ERROR',
    VALIDATION: 'VALIDATION_ERROR',
    DATABASE: 'DATABASE_ERROR',
    FILE: 'FILE_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * 自定义错误类
 */
export class AppError extends Error {
    constructor(message, type = ErrorType.UNKNOWN, cause = null, context = {}) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.cause = cause;
        this.context = context;
        this.timestamp = Date.now();
    }

    /**
     * 转换为日志格式
     */
    toLogString() {
        return `[${this.type}] ${this.message}${this.cause ? ` (原因：${this.cause.message})` : ''}`;
    }

    /**
     * 转换为对象
     */
    toObject() {
        return {
            name: this.name,
            type: this.type,
            message: this.message,
            cause: this.cause?.message,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
    constructor() {
        this.errorListeners = [];
        this.maxErrors = 100;
        this.errors = [];
    }

    /**
     * 处理错误
     * @param {Error|AppError} error - 错误对象
     * @param {string} context - 错误发生的上下文
     * @param {Object} options - 处理选项
     */
    handle(error, context = '', options = {}) {
        const {
            silent = false,
            throwAfterHandle = false,
            type = ErrorType.UNKNOWN
        } = options;

        // 转换为 AppError
        const appError = error instanceof AppError
            ? error
            : new AppError(error.message, type, error, { context });

        // 记录错误
        if (!silent) {
            this.logError(appError, context);
        }

        // 存储错误（限制数量）
        this.errors.push(appError.toObject());
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // 通知监听器
        this.notifyListeners(appError);

        // 如果需要重新抛出
        if (throwAfterHandle) {
            throw appError;
        }

        return appError;
    }

    /**
     * 记录错误日志
     */
    logError(error, context) {
        const prefix = context ? `[${context}] ` : '';
        const logMessage = `${prefix}${error.toLogString()}`;

        // 使用调试日志器记录
        debugLogger.error(logMessage);

        // 同时输出到控制台
        console.error(`[Worldinfo 错误] ${logMessage}`);
        if (error.stack) {
            console.error(error.stack);
        }
    }

    /**
     * 通知监听器
     */
    notifyListeners(error) {
        this.errorListeners.forEach(listener => {
            try {
                listener(error);
            } catch (e) {
                console.error('[错误监听器] 处理失败:', e);
            }
        });
    }

    /**
     * 添加错误监听器
     */
    addListener(listener) {
        if (typeof listener === 'function') {
            this.errorListeners.push(listener);
        }
    }

    /**
     * 移除错误监听器
     */
    removeListener(listener) {
        const index = this.errorListeners.indexOf(listener);
        if (index > -1) {
            this.errorListeners.splice(index, 1);
        }
    }

    /**
     * 获取错误历史
     */
    getErrors() {
        return [...this.errors];
    }

    /**
     * 清空错误历史
     */
    clearErrors() {
        this.errors = [];
    }

    /**
     * 创建特定类型的错误
     */
    static create(type, message, cause = null, context = {}) {
        return new AppError(message, type, cause, context);
    }

    /**
     * 创建 API 错误
     */
    static api(message, cause = null, context = {}) {
        return this.create(ErrorType.API, message, cause, context);
    }

    /**
     * 创建网络错误
     */
    static network(message, cause = null, context = {}) {
        return this.create(ErrorType.NETWORK, message, cause, context);
    }

    /**
     * 创建解析错误
     */
    static parse(message, cause = null, context = {}) {
        return this.create(ErrorType.PARSE, message, cause, context);
    }

    /**
     * 创建验证错误
     */
    static validation(message, context = {}) {
        return this.create(ErrorType.VALIDATION, message, null, context);
    }

    /**
     * 创建数据库错误
     */
    static database(message, cause = null, context = {}) {
        return this.create(ErrorType.DATABASE, message, cause, context);
    }

    /**
     * 创建文件错误
     */
    static file(message, cause = null, context = {}) {
        return this.create(ErrorType.FILE, message, cause, context);
    }

    /**
     * 创建超时错误
     */
    static timeout(timeoutMs, context = {}) {
        return this.create(
            ErrorType.NETWORK,
            `请求超时（${timeoutMs / 1000}秒）`,
            null,
            { timeout: timeoutMs, ...context }
        );
    }
}

/**
 * 创建全局错误处理器实例
 */
export const errorHandler = new ErrorHandler();

/**
 * 包装异步函数，自动处理错误
 * @param {Function} fn - 异步函数
 * @param {string} context - 上下文
 * @param {Object} options - 错误处理选项
 */
export async function withErrorHandling(fn, context = '', options = {}) {
    try {
        return await fn();
    } catch (error) {
        return errorHandler.handle(error, context, options);
    }
}

/**
 * 包装同步函数，自动处理错误
 * @param {Function} fn - 同步函数
 * @param {string} context - 上下文
 * @param {Object} options - 错误处理选项
 */
export function withErrorHandlingSync(fn, context = '', options = {}) {
    try {
        return fn();
    } catch (error) {
        return errorHandler.handle(error, context, options);
    }
}

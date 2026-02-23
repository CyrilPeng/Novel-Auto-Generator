/**
 * HTTP 请求工具类
 * 提供带超时、重试、错误处理的 fetch 封装
 */

import { errorHandler, ErrorType } from './ErrorHandler.js';

/**
 * 请求配置默认值
 */
const DEFAULT_CONFIG = {
    timeout: 120000, // 默认超时 2 分钟
    maxRetries: 3,   // 最大重试次数
    retryDelay: 1000, // 基础重试延迟（毫秒）
    useExponentialBackoff: true // 使用指数退避
};

/**
 * HTTP 请求工具类
 */
export class HttpClient {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.baseURL = config.baseURL || '';
        this.defaultHeaders = config.defaultHeaders || {};
    }

    /**
     * 发送 HTTP 请求
     * @param {string} url - 请求 URL
     * @param {Object} options - fetch 选项
     * @param {Object} retryConfig - 重试配置
     * @returns {Promise<Response>}
     */
    async request(url, options = {}, retryConfig = {}) {
        const {
            maxRetries = this.config.maxRetries,
            retryDelay = this.config.retryDelay,
            useExponentialBackoff = this.config.useExponentialBackoff,
            timeout = this.config.timeout
        } = retryConfig;

        const fullUrl = this.baseURL + url;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // 创建带超时的请求
                const response = await this.fetchWithTimeout(fullUrl, options, timeout);
                
                // 检查响应状态
                if (!response.ok) {
                    throw this.createHttpError(response);
                }

                return response;

            } catch (error) {
                lastError = error;

                // 如果是 AbortError（超时），直接重试
                if (error.name === 'AbortError') {
                    if (attempt < maxRetries) {
                        const delay = useExponentialBackoff
                            ? retryDelay * Math.pow(2, attempt)
                            : retryDelay;
                        
                        await this.sleep(delay);
                        continue;
                    }
                }

                // 如果是网络错误，尝试重试
                if (this.isNetworkError(error)) {
                    if (attempt < maxRetries) {
                        const delay = useExponentialBackoff
                            ? retryDelay * Math.pow(2, attempt)
                            : retryDelay;
                        
                        await this.sleep(delay);
                        continue;
                    }
                }

                // 其他错误不重试
                break;
            }
        }

        // 所有重试都失败
        throw lastError;
    }

    /**
     * 带超时的 fetch
     */
    async fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw errorHandler.timeout(timeout);
            }
            throw error;
        }
    }

    /**
     * 创建 HTTP 错误
     */
    createHttpError(response) {
        const status = response.status;
        const statusText = response.statusText;
        
        let message = `HTTP ${status}: ${statusText}`;
        let type = ErrorType.API;

        switch (status) {
            case 400:
                message = '请求参数错误';
                type = ErrorType.VALIDATION;
                break;
            case 401:
                message = '未授权，请检查 API 密钥';
                break;
            case 403:
                message = '禁止访问';
                break;
            case 404:
                message = '资源未找到';
                break;
            case 408:
                message = '请求超时';
                type = ErrorType.NETWORK;
                break;
            case 429:
                message = '请求过于频繁，请稍后再试';
                break;
            case 500:
                message = '服务器内部错误';
                break;
            case 502:
                message = '网关错误';
                type = ErrorType.NETWORK;
                break;
            case 503:
                message = '服务不可用';
                type = ErrorType.NETWORK;
                break;
            case 504:
                message = '网关超时';
                type = ErrorType.NETWORK;
                break;
        }

        return errorHandler.create(type, message, null, { status, statusText });
    }

    /**
     * 判断是否为网络错误
     */
    isNetworkError(error) {
        return (
            error.type === ErrorType.NETWORK ||
            error.message?.includes('network') ||
            error.message?.includes('fetch') ||
            error.message?.includes('timeout')
        );
    }

    /**
     * 延迟函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * GET 请求
     */
    async get(url, options = {}) {
        return this.request(url, {
            method: 'GET',
            headers: this.defaultHeaders,
            ...options
        });
    }

    /**
     * POST 请求
     */
    async post(url, data = {}, options = {}) {
        return this.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.defaultHeaders
            },
            body: JSON.stringify(data),
            ...options
        });
    }

    /**
     * PUT 请求
     */
    async put(url, data = {}, options = {}) {
        return this.request(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...this.defaultHeaders
            },
            body: JSON.stringify(data),
            ...options
        });
    }

    /**
     * DELETE 请求
     */
    async delete(url, options = {}) {
        return this.request(url, {
            method: 'DELETE',
            headers: this.defaultHeaders,
            ...options
        });
    }
}

/**
 * 创建全局 HTTP 客户端实例
 */
export const httpClient = new HttpClient();

/**
 * 便捷函数：发送 GET 请求
 */
export async function httpGet(url, options = {}) {
    return httpClient.get(url, options);
}

/**
 * 便捷函数：发送 POST 请求
 */
export async function httpPost(url, data = {}, options = {}) {
    return httpClient.post(url, data, options);
}

/**
 * 便捷函数：发送 PUT 请求
 */
export async function httpPut(url, data = {}, options = {}) {
    return httpClient.put(url, data, options);
}

/**
 * 便捷函数：发送 DELETE 请求
 */
export async function httpDelete(url, options = {}) {
    return httpClient.delete(url, options);
}

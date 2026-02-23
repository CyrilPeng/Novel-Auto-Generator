/**
 * SillyTavern API封装
 * 使用SillyTavern内置的API进行生成
 */
import { BaseAPI } from './BaseAPI.js';

export class TavernAPI extends BaseAPI {
    constructor(config = {}) {
        super(config);
    }

    /**
     * 获取SillyTavern上下文
     * @returns {Object|null} ST上下文
     */
    getContext() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                return SillyTavern.getContext();
            }
        } catch (e) {
            console.warn('[酒馆API] 获取上下文失败:', e.message);
        }
        return null;
    }

    /**
     * 获取请求头
     * @returns {Object} 请求头对象
     */
    getRequestHeaders() {
        try {
            const ctx = this.getContext();
            if (ctx && typeof ctx.getRequestHeaders === 'function') {
                return ctx.getRequestHeaders();
            }
        } catch (e) {
            console.warn('[酒馆API] 获取请求头失败:', e.message);
        }
        return { 'Content-Type': 'application/json' };
    }

    /**
     * 生成文本
     * @param {Array<Object>} messages - 消息数组
     * @returns {Promise<string>} 生成的文本
     */
    async generate(messages) {
        const ctx = this.getContext();
        if (!ctx) {
            throw new Error('无法获取SillyTavern上下文');
        }

        // 转换为消息数组格式
        const prompt = this.messagesToString(messages);
        
        try {
            // 优先使用generateRaw(支持消息数组)
            if (typeof ctx.generateRaw === 'function') {
                const response = await Promise.race([
                    ctx.generateRaw(messages),
                    this.createTimeoutPromise()
                ]);
                return this.filterResponseTags(response, this.config.filterResponseTags);
            }
            
            // 回退到普通生成
            if (typeof ctx.generate === 'function') {
                const response = await Promise.race([
                    ctx.generate(prompt),
                    this.createTimeoutPromise()
                ]);
                return this.filterResponseTags(response, this.config.filterResponseTags);
            }
            
            throw new Error('SillyTavern未提供可用的生成方法');
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * 流式生成文本
     * @param {Array<Object>} messages - 消息数组
     * @param {Function} onChunk - 数据块回调
     * @returns {Promise<string>} 完整文本
     */
    async streamGenerate(messages, onChunk) {
        const ctx = this.getContext();
        if (!ctx) {
            throw new Error('无法获取SillyTavern上下文');
        }

        let fullText = '';
        
        try {
            // 使用generateRaw的流式支持
            if (typeof ctx.generateRaw === 'function') {
                const response = await Promise.race([
                    ctx.generateRaw(messages, (chunk) => {
                        fullText += chunk;
                        if (onChunk) onChunk(chunk, fullText);
                    }),
                    this.createTimeoutPromise()
                ]);
                return this.filterResponseTags(response || fullText, this.config.filterResponseTags);
            }
            
            // 非流式回退
            const result = await this.generate(messages);
            if (onChunk) onChunk(result, result);
            return result;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * 将消息数组转换为字符串
     * @param {Array<Object>} messages - 消息数组
     * @returns {string} 拼接后的字符串
     */
    messagesToString(messages) {
        if (typeof messages === 'string') return messages;
        if (!Array.isArray(messages) || messages.length === 0) return '';
        if (messages.length === 1) return messages[0].content || '';
        
        return messages.map(m => {
            const roleLabel = m.role === 'system' ? '[系统]' : 
                             m.role === 'assistant' ? '[助手]' : '[用户]';
            return `${roleLabel}\n${m.content}`;
        }).join('\n\n');
    }
}

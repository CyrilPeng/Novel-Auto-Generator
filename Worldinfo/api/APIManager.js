/**
 * API管理器
 * 根据配置选择合适的API实现
 */
import { TavernAPI } from './TavernAPI.js';
import { GeminiAPI } from './GeminiAPI.js';
import { DeepSeekAPI } from './DeepSeekAPI.js';
import { OpenAICompat } from './OpenAICompat.js';

export class APIManager {
    /**
     * @param {Object} config - API配置
     * @param {string} config.provider - API提供商: 'tavern'|'gemini'|'deepseek'|'openai'
     */
    constructor(config = {}) {
        this.config = config;
        this.api = this.createAPI();
    }

    /**
     * 创建API实例
     * 根据provider配置创建对应的API实现
     * 
     * @returns {BaseAPI} API实例
     */
    createAPI() {
        const { provider } = this.config;
        
        switch (provider) {
            case 'tavern':
                return new TavernAPI(this.config);
            case 'gemini':
                return new GeminiAPI(this.config);
            case 'deepseek':
                return new DeepSeekAPI(this.config);
            case 'openai':
                return new OpenAICompat(this.config);
            default:
                console.warn(`[API管理器] 未知的提供商: ${provider}，使用酒馆API作为默认`);
                return new TavernAPI(this.config);
        }
    }

    /**
     * 重新配置API
     * @param {Object} config - 新配置
     */
    reconfigure(config) {
        this.config = { ...this.config, ...config };
        this.api = this.createAPI();
    }

    /**
     * 生成文本
     * @param {Array<Object>} messages - 消息数组
     * @returns {Promise<string>} 生成的文本
     */
    async generate(messages) {
        return this.api.generate(messages);
    }

    /**
     * 流式生成文本
     * @param {Array<Object>} messages - 消息数组
     * @param {Function} onChunk - 数据块回调
     * @returns {Promise<string>} 完整文本
     */
    async streamGenerate(messages, onChunk) {
        return this.api.streamGenerate(messages, onChunk);
    }

    /**
     * 获取当前API提供商
     * @returns {string} 提供商名称
     */
    getProvider() {
        return this.config.provider;
    }

    /**
     * 检查是否为Token限制错误
     * @param {Error} error - 错误对象
     * @returns {boolean} 是否为Token限制错误
     */
    isTokenLimitError(error) {
        return this.api.isTokenLimitError(error?.message || '');
    }
}

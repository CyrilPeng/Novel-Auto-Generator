/**
 * OpenAI兼容API实现
 * 支持任何OpenAI API格式的服务，包括本地模型
 */
import { BaseAPI } from './BaseAPI.js';

export class OpenAICompat extends BaseAPI {
    constructor(config = {}) {
        super(config);
        this.apiKey = config.apiKey || '';
        this.model = config.model || '';
        this.baseUrl = config.baseUrl || 'http://127.0.0.1:5000/v1';
    }

    /**
     * 生成文本
     * @param {Array<Object>} messages - 消息数组
     * @returns {Promise<string>} 生成的文本
     */
    async generate(messages) {
        const url = `${this.baseUrl}/chat/completions`;
        const body = {
            model: this.model,
            messages: messages,
            temperature: this.config.temperature ?? 0.7,
            max_tokens: this.config.maxTokens || 8192
        };

        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                }),
                this.createTimeoutPromise()
            ]);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API错误: ${error}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            return this.filterResponseTags(text, this.config.filterResponseTags);
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
        const url = `${this.baseUrl}/chat/completions`;
        const body = {
            model: this.model,
            messages: messages,
            temperature: this.config.temperature ?? 0.7,
            max_tokens: this.config.maxTokens || 8192,
            stream: true
        };

        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                }),
                this.createTimeoutPromise()
            ]);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API错误: ${error}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                fullText += delta;
                                if (onChunk) onChunk(delta, fullText);
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }

            return this.filterResponseTags(fullText, this.config.filterResponseTags);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * 获取可用模型列表
     * @returns {Promise<Array<string>>} 模型名称列表
     */
    async getModelList() {
        const url = `${this.baseUrl}/models`;
        const headers = {};
        
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error('获取模型列表失败');
            }
            
            const data = await response.json();
            return data.data?.map(m => m.id) || [];
        } catch (error) {
            console.warn('[API] 获取模型列表失败:', error.message);
            return [];
        }
    }

    /**
     * 测试API连接
     * @returns {Promise<boolean>} 是否连接成功
     */
    async testConnection() {
        try {
            // 发送简单测试请求
            await this.generate([
                { role: 'user', content: 'Hi' }
            ]);
            return true;
        } catch (error) {
            console.error('[API] 连接测试失败:', error.message);
            return false;
        }
    }
}

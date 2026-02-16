/**
 * DeepSeek API实现
 * 支持DeepSeek API调用
 */
import { BaseAPI } from './BaseAPI.js';

export class DeepSeekAPI extends BaseAPI {
    constructor(config = {}) {
        super(config);
        this.apiKey = config.apiKey;
        this.model = config.model || 'deepseek-chat';
        this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
    }

    /**
     * 生成文本
     * @param {Array<Object>} messages - 消息数组
     * @returns {Promise<string>} 生成的文本
     */
    async generate(messages) {
        if (!this.apiKey) {
            throw new Error('未配置DeepSeek API密钥');
        }

        const url = `${this.baseUrl}/chat/completions`;
        const body = {
            model: this.model,
            messages: messages,
            temperature: this.config.temperature ?? 0.7,
            max_tokens: this.config.maxTokens || 8192
        };

        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(body)
                }),
                this.createTimeoutPromise()
            ]);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`DeepSeek API错误: ${error}`);
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
        if (!this.apiKey) {
            throw new Error('未配置DeepSeek API密钥');
        }

        const url = `${this.baseUrl}/chat/completions`;
        const body = {
            model: this.model,
            messages: messages,
            temperature: this.config.temperature ?? 0.7,
            max_tokens: this.config.maxTokens || 8192,
            stream: true
        };

        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(body)
                }),
                this.createTimeoutPromise()
            ]);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`DeepSeek API错误: ${error}`);
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
}

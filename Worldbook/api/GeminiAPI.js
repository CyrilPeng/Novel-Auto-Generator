/**
 * Gemini API实现
 * 支持Google Gemini API调用
 */
import { BaseAPI } from './BaseAPI.js';

export class GeminiAPI extends BaseAPI {
    constructor(config = {}) {
        super(config);
        this.apiKey = config.apiKey;
        this.model = config.model || 'gemini-2.5-flash';
        this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    }

    /**
     * 生成文本
     * @param {Array<Object>} messages - 消息数组
     * @returns {Promise<string>} 生成的文本
     */
    async generate(messages) {
        if (!this.apiKey) {
            throw new Error('未配置Gemini API密钥');
        }

        const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
        const body = this.convertToGeminiFormat(messages);

        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }),
                this.createTimeoutPromise()
            ]);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Gemini API错误: ${error}`);
            }

            const data = await response.json();
            const text = this.extractTextFromResponse(data);
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
            throw new Error('未配置Gemini API密钥');
        }

        const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
        const body = this.convertToGeminiFormat(messages);

        try {
            const response = await Promise.race([
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }),
                this.createTimeoutPromise()
            ]);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Gemini API错误: ${error}`);
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
                    try {
                        const data = JSON.parse(line);
                        const text = this.extractTextFromResponse(data);
                        if (text) {
                            fullText += text;
                            if (onChunk) onChunk(text, fullText);
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }

            return this.filterResponseTags(fullText, this.config.filterResponseTags);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * 将标准消息格式转换为Gemini格式
     * Gemini使用systemInstruction + contents的格式
     * 
     * @param {Array<Object>} messages - 标准消息数组
     * @returns {Object} Gemini格式请求体
     */
    convertToGeminiFormat(messages) {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // Gemini要求contents中role交替出现，合并连续同角色消息
        const merged = [];
        for (const msg of nonSystemMsgs) {
            const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
            if (merged.length > 0 && merged[merged.length - 1].role === geminiRole) {
                merged[merged.length - 1].parts[0].text += '\n\n' + msg.content;
            } else {
                merged.push({ role: geminiRole, parts: [{ text: msg.content }] });
            }
        }

        // Gemini要求第一条必须是user
        if (merged.length > 0 && merged[0].role !== 'user') {
            merged.unshift({ role: 'user', parts: [{ text: '请根据以下对话执行任务。' }] });
        }

        const result = { contents: merged };
        
        if (systemMsgs.length > 0) {
            result.systemInstruction = {
                parts: [{ text: systemMsgs.map(m => m.content).join('\n\n') }]
            };
        }

        return result;
    }

    /**
     * 从Gemini响应中提取文本
     * @param {Object} data - API响应数据
     * @returns {string} 提取的文本
     */
    extractTextFromResponse(data) {
        if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];
            if (candidate.content && candidate.content.parts) {
                return candidate.content.parts.map(p => p.text).join('');
            }
        }
        return '';
    }
}

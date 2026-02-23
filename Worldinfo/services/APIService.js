/**
 * API 调用服务层
 * 封装酒馆 API 和自定义 API 的调用逻辑
 */

import { Config } from '../core/Config.js';

/**
 * API 服务配置
 */
export class APIServiceConfig {
    constructor({
        useTavernApi = true,
        customApiProvider = 'gemini',
        customApiKey = '',
        customApiEndpoint = '',
        customApiModel = 'gemini-2.5-flash',
        apiTimeout = 120000,
        filterResponseTags = 'thinking,/think',
        promptMessageChain = [{ role: 'user', content: '{PROMPT}', enabled: true }],
        debugMode = false
    } = {}) {
        this.useTavernApi = useTavernApi;
        this.customApiProvider = customApiProvider;
        this.customApiKey = customApiKey;
        this.customApiEndpoint = customApiEndpoint;
        this.customApiModel = customApiModel;
        this.apiTimeout = apiTimeout;
        this.filterResponseTags = filterResponseTags;
        this.promptMessageChain = promptMessageChain;
        this.debugMode = debugMode;
    }
}

/**
 * API 调用服务
 */
export class APIService {
    constructor(config = {}) {
        this.config = new APIServiceConfig(config);
        this.streamContent = '';
    }

    // ============================================================
    // 消息链处理
    // ============================================================

    /**
     * 应用消息链
     */
    applyMessageChain(prompt) {
        const chain = this.config.promptMessageChain;
        
        if (!Array.isArray(chain) || chain.length === 0) {
            return [{ role: 'user', content: prompt }];
        }
        
        const enabledMessages = chain.filter(m => m.enabled !== false);
        
        if (enabledMessages.length === 0) {
            return [{ role: 'user', content: prompt }];
        }
        
        return enabledMessages
            .map(msg => ({
                role: msg.role || 'user',
                content: (msg.content || '').replace(/\{PROMPT\}/g, prompt)
            }))
            .filter(m => m.content.trim().length > 0);
    }

    /**
     * 将消息数组转换为字符串
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

    /**
     * 转换为 Gemini 格式
     */
    convertToGeminiContents(messages) {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');
        
        // Gemini 要求 role 交替出现
        const merged = [];
        for (const msg of nonSystemMsgs) {
            const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
            if (merged.length > 0 && merged[merged.length - 1].role === geminiRole) {
                merged[merged.length - 1].parts[0].text += '\n\n' + msg.content;
            } else {
                merged.push({ role: geminiRole, parts: [{ text: msg.content }] });
            }
        }
        
        // Gemini 要求第一条必须是 user
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

    // ============================================================
    // 响应过滤
    // ============================================================

    /**
     * 过滤响应标签
     */
    filterResponseTags(text) {
        if (!text) return text;
        
        const filterTagsStr = this.config.filterResponseTags || 'thinking,/think';
        const filterTags = filterTagsStr.split(',').map(t => t.trim()).filter(t => t);
        
        let cleaned = text;
        
        for (const tag of filterTags) {
            if (tag.startsWith('/')) {
                // 闭合标签，移除之前的所有内容
                const tagName = tag.substring(1);
                cleaned = cleaned.replace(new RegExp(`^[\\s\\S]*?<\\/${tagName}>`, 'gi'), '');
            } else {
                // 完整标签对
                cleaned = cleaned.replace(
                    new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'),
                    ''
                );
                // 自闭合标签
                cleaned = cleaned.replace(
                    new RegExp(`<${tag}\\s*/?>`, 'gi'),
                    ''
                );
            }
        }
        
        return cleaned.trim();
    }

    // ============================================================
    // 酒馆 API 调用
    // ============================================================

    /**
     * 获取 SillyTavern 上下文
     */
    getContext() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                return SillyTavern.getContext();
            }
        } catch (e) {
            console.warn('[API 服务] 获取 ST 上下文失败:', e.message);
        }
        return null;
    }

    /**
     * 获取请求头
     */
    getRequestHeaders() {
        try {
            const ctx = this.getContext();
            if (ctx && typeof ctx.getRequestHeaders === 'function') {
                return ctx.getRequestHeaders();
            }
        } catch (e) { }
        return { 'Content-Type': 'application/json' };
    }

    /**
     * 调用酒馆 API
     */
    async callTavernAPI(messages, taskId = null, onStreamChunk = null) {
        const ctx = this.getContext();
        if (!ctx) {
            throw new Error('无法获取 SillyTavern 上下文');
        }
        
        const timeout = this.config.apiTimeout || 120000;
        const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
        
        console.log(`[API 服务] ${logPrefix} 发送请求到酒馆 API (${messages.length}条消息)...`);
        
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`API 请求超时 (${timeout / 1000}秒)`)), timeout);
            });
            
            let result;
            
            // 尝试使用 generateRaw（支持消息数组）
            if (typeof ctx.generateRaw === 'function') {
                try {
                    result = await Promise.race([
                        ctx.generateRaw(messages, onStreamChunk),
                        timeoutPromise
                    ]);
                } catch (rawError) {
                    // 回退到字符串格式
                    console.log('[API 服务] 消息数组格式不支持，回退字符串模式');
                    const prompt = this.messagesToString(messages);
                    result = await Promise.race([
                        ctx.generateRaw(prompt, onStreamChunk),
                        timeoutPromise
                    ]);
                }
            } else if (typeof ctx.generateQuietPrompt === 'function') {
                const prompt = this.messagesToString(messages);
                result = await Promise.race([
                    ctx.generateQuietPrompt(prompt, false, false),
                    timeoutPromise
                ]);
            } else {
                throw new Error('无法找到可用的生成函数');
            }
            
            // 过滤标签
            return this.filterResponseTags(result);
            
        } catch (error) {
            console.error(`[API 服务] ${logPrefix} 酒馆 API 出错:`, error.message);
            throw error;
        }
    }

    // ============================================================
    // 自定义 API 调用
    // ============================================================

    /**
     * 调用自定义 API
     */
    async callCustomAPI(messages, taskId = null, onStreamChunk = null) {
        const provider = this.config.customApiProvider;
        const apiKey = this.config.customApiKey;
        const endpoint = this.config.customApiEndpoint;
        const model = this.config.customApiModel;
        const timeout = this.config.apiTimeout || 120000;
        const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
        
        console.log(`[API 服务] ${logPrefix} 发送请求到自定义 API (${provider}, ${messages.length}条消息)...`);
        
        try {
            let requestUrl = endpoint;
            if (!requestUrl.includes('/chat/completions')) {
                if (requestUrl.endsWith('/v1')) {
                    requestUrl += '/chat/completions';
                } else {
                    requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
                }
            }
            
            if (!requestUrl.startsWith('http')) {
                requestUrl = 'http://' + requestUrl;
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            
            // 构建请求体
            let requestBody;
            
            if (provider === 'gemini') {
                // Gemini 原生格式
                const geminiContents = this.convertToGeminiContents(messages);
                requestBody = {
                    contents: geminiContents.contents,
                    generationConfig: {
                        maxOutputTokens: 8192,
                        temperature: 0.7
                    }
                };
                if (geminiContents.systemInstruction) {
                    requestBody.systemInstruction = geminiContents.systemInstruction;
                }
            } else if (provider === 'gemini-proxy') {
                // Gemini 代理（OpenAI 格式）
                requestBody = {
                    model: model,
                    messages: messages,
                    max_tokens: 8192,
                    temperature: 0.7
                };
            } else {
                // OpenAI 兼容格式
                requestBody = {
                    model: model,
                    messages: messages,
                    max_tokens: 8192,
                    temperature: 0.7
                };
            }
            
            // 创建超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 请求失败：${response.status} - ${errorText}`);
            }
            
            // 处理流式响应
            if (response.headers.get('content-type')?.includes('text/event-stream')) {
                return await this.handleStreamResponse(response, provider, onStreamChunk);
            }
            
            // 处理普通响应
            const data = await response.json();
            return this.extractResponseContent(data, provider);
            
        } catch (error) {
            console.error(`[API 服务] ${logPrefix} 自定义 API 出错:`, error.message);
            throw error;
        }
    }

    /**
     * 处理流式响应
     */
    async handleStreamResponse(response, provider, onStreamChunk = null) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';
        
        this.streamContent = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ') && trimmed.slice(6).trim() !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(trimmed.slice(6).trim());
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullContent += delta;
                            onStreamChunk?.(delta, fullContent);
                        }
                    } catch (e) { }
                }
            }
        }
        
        // 处理 buffer 中剩余数据
        if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data: ') && trimmed.slice(6).trim() !== '[DONE]') {
                try {
                    const parsed = JSON.parse(trimmed.slice(6).trim());
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) fullContent += delta;
                } catch (e) { }
            }
        }
        
        return fullContent;
    }

    /**
     * 提取响应内容
     */
    extractResponseContent(data, provider) {
        let result = '';
        
        if (provider === 'gemini') {
            result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (provider === 'gemini-proxy') {
            if (data.candidates) {
                result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } else if (data.choices) {
                result = data.choices?.[0]?.message?.content || '';
            }
        } else {
            // OpenAI 兼容格式
            result = data.choices?.[0]?.message?.content || '';
        }
        
        return this.filterResponseTags(result);
    }

    // ============================================================
    // 统一 API 调用入口
    // ============================================================

    /**
     * 调用 API（统一入口）
     */
    async callAPI(prompt, taskId = null, onStreamChunk = null) {
        const messages = this.applyMessageChain(prompt);
        
        if (this.config.useTavernApi) {
            return await this.callTavernAPI(messages, taskId, onStreamChunk);
        } else {
            return await this.callCustomAPI(messages, taskId, onStreamChunk);
        }
    }

    // ============================================================
    // 工具功能
    // ============================================================

    /**
     * 拉取模型列表
     */
    async fetchModelList() {
        const endpoint = this.config.customApiEndpoint || '';
        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }
        
        let modelsUrl = endpoint;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (modelsUrl.endsWith('/v1')) {
            modelsUrl = modelsUrl + '/models';
        } else if (!modelsUrl.endsWith('/models')) {
            modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
        }
        
        if (!modelsUrl.startsWith('http')) {
            modelsUrl = 'http://' + modelsUrl;
        }
        
        const headers = { 'Content-Type': 'application/json' };
        if (this.config.customApiKey) {
            headers['Authorization'] = `Bearer ${this.config.customApiKey}`;
        }
        
        const response = await fetch(modelsUrl, { headers });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`拉取模型列表失败：${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        let models = [];
        
        if (data.data && Array.isArray(data.data)) {
            models = data.data.map(m => m.id || m.name || m);
        } else if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
        } else if (data.models && Array.isArray(data.models)) {
            models = data.models.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
        }
        
        return models;
    }

    /**
     * 快速测试
     */
    async quickTest() {
        const endpoint = this.config.customApiEndpoint || '';
        const model = this.config.customApiModel || '';
        
        if (!endpoint) throw new Error('请先设置 API Endpoint');
        if (!model) throw new Error('请先设置模型名称');
        
        let requestUrl = endpoint;
        if (!requestUrl.includes('/chat/completions')) {
            if (requestUrl.endsWith('/v1')) {
                requestUrl += '/chat/completions';
            } else {
                requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
        }
        
        if (!requestUrl.startsWith('http')) {
            requestUrl = 'http://' + requestUrl;
        }
        
        const headers = { 'Content-Type': 'application/json' };
        if (this.config.customApiKey) {
            headers['Authorization'] = `Bearer ${this.config.customApiKey}`;
        }
        
        const startTime = Date.now();
        
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
                max_tokens: 100,
                temperature: 0.1
            })
        });
        
        const elapsed = Date.now() - startTime;
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`测试失败：${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        let responseText = data.choices?.[0]?.message?.content || '';
        
        if (!responseText) {
            responseText = data.response || data.content || data.text || data.output || data.generated_text || '';
        }
        
        return {
            success: true,
            elapsed,
            response: responseText.substring(0, 100)
        };
    }

    /**
     * 更新流式内容
     */
    updateStreamContent(content, clear = false) {
        if (clear) {
            this.streamContent = '';
        } else {
            this.streamContent += content;
        }
    }

    /**
     * 获取流式内容
     */
    getStreamContent() {
        return this.streamContent;
    }

    /**
     * 清空流式内容
     */
    clearStreamContent() {
        this.streamContent = '';
    }
}

// 导出单例
export const apiService = new APIService();

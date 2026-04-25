export function createApiService(deps = {}) {
    const {
        AppState,
        Logger,
        APICaller,
        updateStreamContent,
        debugLog,
        messagesToString,
        convertToGeminiContents,
        applyMessageChain,
    } = deps;

    async function callSillyTavernAPI(messages, taskId = null) {
        const timeout = AppState.settings.apiTimeout || 120000;
        const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
        const combinedPrompt = messagesToString(messages);
        updateStreamContent(`\n📤 ${logPrefix} 发送请求到酒馆API (${messages.length}条消息)...\n`);
        debugLog(`${logPrefix} 酒馆API开始调用, 消息数=${messages.length}, 总长度=${combinedPrompt.length}, 超时=${timeout / 1000}秒`);

        return APICaller.withRetry(async (attempt) => {
            if (attempt > 0) {
                updateStreamContent(`🔄 ${logPrefix} 酒馆API 重试 #${attempt}...\n`);
                debugLog(`${logPrefix} 酒馆API重试 #${attempt}`);
            }
            try {
                if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
                    throw new Error('无法访问SillyTavern上下文');
                }

                const context = SillyTavern.getContext();
                debugLog(`${logPrefix} 获取到SillyTavern上下文`);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`API请求超时 (${timeout / 1000}秒)`)), timeout);
                });

                let result;

                if (typeof context.generateRaw === 'function') {
                    try {
                        debugLog(`${logPrefix} 尝试generateRaw消息数组格式 (ST 1.13.2+)`);
                        result = await Promise.race([
                            context.generateRaw({ prompt: messages }),
                            timeoutPromise,
                        ]);
                        debugLog(`${logPrefix} generateRaw消息数组格式成功`);
                    } catch (rawError) {
                        if (rawError.message?.includes('超时') || rawError.message?.includes('timeout') ||
                            rawError.message?.includes('API') || rawError.message?.includes('limit')) {
                            throw rawError;
                        }
                        debugLog(`${logPrefix} 消息数组格式不支持(${rawError.message})，回退字符串模式`);
                        updateStreamContent(`⚠️ ${logPrefix} 酒馆不支持消息数组格式，已回退为字符串模式\n`);
                        result = await Promise.race([
                            context.generateRaw(combinedPrompt, '', false),
                            timeoutPromise,
                        ]);
                    }
                } else if (typeof context.generateQuietPrompt === 'function') {
                    debugLog(`${logPrefix} 使用generateQuietPrompt（字符串模式）`);
                    updateStreamContent(`ℹ️ ${logPrefix} 酒馆API: 使用generateQuietPrompt（字符串模式，消息角色不生效）\n`);
                    result = await Promise.race([
                        context.generateQuietPrompt(combinedPrompt, false, false),
                        timeoutPromise,
                    ]);
                } else {
                    throw new Error('无法找到可用的生成函数');
                }

                debugLog(`${logPrefix} 收到响应, 长度=${result.length}字符`);
                updateStreamContent(`📥 ${logPrefix} 收到响应 (${result.length}字符)\n`);
                return result;
            } catch (error) {
                debugLog(`${logPrefix} 酒馆API出错: ${error.message}`);
                updateStreamContent(`\n❌ ${logPrefix} 错误: ${error.message}\n`);
                throw error;
            }
        }, {
            retries: 2,
            shouldRetry: (error) => APICaller.isRetryableError(error),
            onRetry: async (error, nextAttempt, delay) => {
                Logger.warn('API', `${logPrefix} 酒馆API重试 #${nextAttempt}: ${error.message}`);
                updateStreamContent(`⏳ ${logPrefix} ${delay / 1000}秒后重试...\n`);
            },
        });
    }

    function buildCustomApiRequest(messages) {
        const provider = AppState.settings.customApiProvider;
        const apiKey = AppState.settings.customApiKey;
        const endpoint = AppState.settings.customApiEndpoint;
        const model = AppState.settings.customApiModel;
        const openaiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
        let requestUrl = '';
        let requestOptions = {};
        let isStreamRequest = false;

        switch (provider) {
            case 'anthropic': {
                if (!apiKey) throw new Error('Anthropic API Key 未设置');
                requestUrl = 'https://api.anthropic.com/v1/messages';
                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: model || 'claude-sonnet-4-20250514',
                        messages: openaiMessages,
                        temperature: 0.3,
                        max_tokens: 8192,
                    }),
                };
                break;
            }

            case 'gemini': {
                if (!apiKey) throw new Error('Gemini API Key 未设置');
                const geminiModel = model || 'gemini-2.5-flash';
                let geminiBaseUrl = endpoint ? endpoint.trim() : '';
                if (geminiBaseUrl) {
                    if (!geminiBaseUrl.startsWith('http')) geminiBaseUrl = 'https://' + geminiBaseUrl;
                    if (geminiBaseUrl.endsWith('/')) geminiBaseUrl = geminiBaseUrl.slice(0, -1);
                    if (geminiBaseUrl.includes('?')) {
                        requestUrl = `${geminiBaseUrl}/${geminiModel}:generateContent&key=${apiKey}`;
                    } else {
                        requestUrl = `${geminiBaseUrl}/${geminiModel}:generateContent?key=${apiKey}`;
                    }
                } else {
                    requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
                }
                const geminiData = convertToGeminiContents(messages);
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...geminiData,
                        generationConfig: { maxOutputTokens: 65536, temperature: 0.3 },
                        safetySettings: [
                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
                        ],
                    }),
                };
                break;
            }

            case 'openai-compatible': {
                let openaiEndpoint = endpoint || 'http://127.0.0.1:5000/v1/chat/completions';
                const openaiModel = model || 'local-model';

                if (!openaiEndpoint.includes('/chat/completions')) {
                    if (openaiEndpoint.endsWith('/v1')) {
                        openaiEndpoint += '/chat/completions';
                    } else {
                        openaiEndpoint = openaiEndpoint.replace(/\/$/, '') + '/chat/completions';
                    }
                }

                if (!openaiEndpoint.startsWith('http')) {
                    openaiEndpoint = 'http://' + openaiEndpoint;
                }

                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) {
                    headers.Authorization = `Bearer ${apiKey}`;
                }

                requestUrl = openaiEndpoint;
                requestOptions = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: openaiMessages,
                        temperature: 0.3,
                        max_tokens: 64000,
                        stream: true,
                    }),
                };
                isStreamRequest = true;
                break;
            }

            default:
                throw new Error(`不支持的API提供商: ${provider}`);
        }

        return { provider, requestUrl, requestOptions, isStreamRequest, model };
    }

    function extractCustomApiText(provider, data) {
        if (provider === 'gemini') {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        if (provider === 'anthropic') {
            return data.content?.[0]?.text || '';
        }
        return data.choices?.[0]?.message?.content || '';
    }

    async function callCustomAPI(messages) {
        const maxRetries = 3;
        const timeout = AppState.settings.apiTimeout || 120000;
        const requestConfig = buildCustomApiRequest(messages);
        const combinedPrompt = messagesToString(messages);

        updateStreamContent(`\n📤 发送请求到自定义API (${requestConfig.provider}, ${messages.length}条消息)...\n`);
        debugLog(`自定义API开始调用, provider=${requestConfig.provider}, model=${requestConfig.model}, 消息数=${messages.length}, 总长度=${combinedPrompt.length}`);

        try {
            return await APICaller.withRetry(async () => {
                debugLog(`自定义API请求目标: ${requestConfig.requestUrl.substring(0, 80)}...`);

                if (requestConfig.isStreamRequest) {
                    const result = await APICaller.requestStream(requestConfig.requestUrl, {
                        ...requestConfig.requestOptions,
                        timeout,
                        inactivityTimeout: Math.min(timeout, 120000),
                    });
                    debugLog(`自定义API流式读取完成, 结果长度=${result.length}字符`);
                    updateStreamContent(`📥 收到流式响应 (${result.length}字符)\n`);
                    return result;
                }

                const data = await APICaller.requestJSON(requestConfig.requestUrl, {
                    ...requestConfig.requestOptions,
                    timeout,
                });
                debugLog('自定义API JSON解析完成, 开始提取内容');
                const result = extractCustomApiText(requestConfig.provider, data);
                debugLog(`自定义API提取完成, 结果长度=${result.length}字符`);
                updateStreamContent(`📥 收到响应 (${result.length}字符)\n`);
                return result;
            }, {
                retries: maxRetries,
                shouldRetry: (error) => APICaller.isRetryableError(error),
                onRetry: async (error, nextAttempt, delay) => {
                    Logger.warn('API', `重试 #${nextAttempt}: ${error.message}`);
                    updateStreamContent(`⏳ 遇到瞬态错误，${delay / 1000}秒后重试...\n`);
                },
            });
        } catch (error) {
            const normalized = APICaller.handleError(error, '自定义API');
            debugLog(`自定义API出错: ${error.name || 'Error'} - ${error.message}`);
            if (normalized.type === 'timeout') {
                throw new Error(`API请求超时 (${timeout / 1000}秒)`);
            }
            throw error;
        }
    }

    async function handleFetchModelList() {
        const endpoint = AppState.settings.customApiEndpoint || '';
        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }

        let modelsUrl = endpoint;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (modelsUrl.endsWith('/v1')) {
            modelsUrl += '/models';
        } else if (!modelsUrl.endsWith('/models')) {
            modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
        }

        if (!modelsUrl.startsWith('http')) {
            modelsUrl = 'http://' + modelsUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (AppState.settings.customApiKey) {
            headers.Authorization = `Bearer ${AppState.settings.customApiKey}`;
        }

        Logger.info('API', '拉取模型列表: ' + modelsUrl);

        const data = await APICaller.getJSON(modelsUrl, { method: 'GET', headers });
        Logger.info('API', '模型列表响应: ' + JSON.stringify(data).substring(0, 200));

        let models = [];
        if (data.data && Array.isArray(data.data)) {
            models = data.data.map((m) => m.id || m.name || m);
        } else if (Array.isArray(data)) {
            models = data.map((m) => typeof m === 'string' ? m : (m.id || m.name || m));
        } else if (data.models && Array.isArray(data.models)) {
            models = data.models.map((m) => typeof m === 'string' ? m : (m.id || m.name || m));
        }

        return models;
    }

    async function handleQuickTestModel() {
        const endpoint = AppState.settings.customApiEndpoint || '';
        const model = AppState.settings.customApiModel || '';

        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }
        if (!model) {
            throw new Error('请先设置模型名称');
        }

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
        if (AppState.settings.customApiKey) {
            headers.Authorization = `Bearer ${AppState.settings.customApiKey}`;
        }

        Logger.info('API', `快速测试: ${requestUrl} 模型: ${model}`);

        const startTime = Date.now();
        const data = await APICaller.getJSON(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
                max_tokens: 100,
                temperature: 0.1,
            }),
        });

        const elapsed = Date.now() - startTime;
        Logger.info('API', '测试响应: ' + JSON.stringify(data).substring(0, 200));

        let responseText = '';

        if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.message && choice.message.content) {
                responseText = choice.message.content;
            } else if (choice.text) {
                responseText = choice.text;
            } else if (typeof choice.content === 'string') {
                responseText = choice.content;
            }
        } else if (data.response) {
            responseText = data.response;
        } else if (data.content) {
            responseText = data.content;
        } else if (data.text) {
            responseText = data.text;
        } else if (data.output) {
            responseText = data.output;
        } else if (data.generated_text) {
            responseText = data.generated_text;
        }

        if (!responseText || responseText.trim() === '') {
            Logger.warn('API', '无法解析响应，完整数据: ' + JSON.stringify(data, null, 2));

            const possibleFields = ['result', 'message', 'data', 'completion'];
            for (const field of possibleFields) {
                if (data[field]) {
                    if (typeof data[field] === 'string') {
                        responseText = data[field];
                        break;
                    } else if (typeof data[field] === 'object' && data[field].content) {
                        responseText = data[field].content;
                        break;
                    }
                }
            }
        }

        if (!responseText || responseText.trim() === '') {
            throw new Error(`API返回了无法解析的响应格式。\n响应数据: ${JSON.stringify(data).substring(0, 200)}`);
        }

        return {
            success: true,
            elapsed,
            response: responseText.substring(0, 100),
        };
    }

    async function callAPI(prompt, taskId = null) {
        const messages = applyMessageChain(prompt);
        debugLog(`callAPI: 消息链转换完成, ${messages.length}条消息, roles=[${messages.map((m) => m.role).join(',')}]`);
        if (AppState.settings.useTavernApi) {
            return callSillyTavernAPI(messages, taskId);
        }
        return callCustomAPI(messages);
    }

    return {
        callSillyTavernAPI,
        callCustomAPI,
        handleFetchModelList,
        handleQuickTestModel,
        callAPI,
    };
}

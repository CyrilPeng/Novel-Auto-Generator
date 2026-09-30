import { FatalError, UserError, RetryableError, TokenLimitError, AbortedError } from '../core/errors.js';
import { createRequestBudget } from '../core/requestPolicy.js';

/**
 * 构造 OpenAI 兼容 API 的 chat/completions 完整 URL
 *
 * 遵循 OpenAI SDK 标准行为：仅追加 /chat/completions 后缀。
 * 版本号路径由用户自行输入，不再做任何智能识别。
 *
 * 规则：
 *   - endpoint 为空时使用默认值 http://127.0.0.1:5000/v1
 *   - 去除末尾斜杠
 *   - 如 URL 已包含 /chat/completions，则不再追加（信任用户输入的完整 URL）
 *   - 否则追加 /chat/completions
 *   - 缺失协议前缀时补 http://
 *
 * @param {string} [endpoint] 用户输入的 endpoint
 * @returns {string}
 */
export function buildChatUrl(endpoint) {
    const suffix = '/chat/completions';
    let url = endpoint || 'http://127.0.0.1:5000/v1';
    url = url.replace(/\/+$/, '');
    if (!url.includes(suffix)) {
        url += suffix;
    }
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }
    return url;
}

/**
 * 构造 OpenAI 兼容 API 的 /models 完整 URL
 *
 * 遵循 OpenAI SDK 标准行为：
 *   - 若 URL 以 /chat/completions 结尾，替换为 /models
 *   - 若 URL 已以 /models 结尾，不修改
 *   - 否则追加 /models
 *
 * @param {string} endpoint 用户输入的 endpoint（可能带或不带 /chat/completions）
 * @returns {string}
 */
export function buildModelsUrl(endpoint) {
    const chatSuffix = '/chat/completions';
    const modelsSuffix = '/models';
    let url = endpoint.replace(/\/+$/, '');
    if (url.endsWith(chatSuffix)) {
        url = url.slice(0, -chatSuffix.length) + modelsSuffix;
    } else if (!url.endsWith(modelsSuffix)) {
        url += modelsSuffix;
    }
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }
    return url;
}

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

    // Keep the upstream slot occupied even after local timeout/cancellation.
    let hostTail = Promise.resolve();
    let tavernGenerateRawMode = null;
    let tavernArrayFallbackNotified = false;

    async function callSillyTavernAPI(messages, taskId = null, options = {}) {
        const budget = options.budget || createRequestBudget();
        const timeout = AppState.settings.apiTimeout || 120000;
        const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
        const combinedPrompt = messagesToString(messages);
        updateStreamContent(`\n📤 ${logPrefix} 发送请求到酒馆API (${messages.length}条消息)...\n`);
        debugLog(
            `${logPrefix} 酒馆API开始调用, 消息数=${messages.length}, 总长度=${combinedPrompt.length}, 超时=${timeout / 1000}秒`,
        );

        return APICaller.withRetry(
            async (attempt) => {
                if (attempt > 0) {
                    updateStreamContent(`🔄 ${logPrefix} 酒馆API 重试 #${attempt}...\n`);
                    debugLog(`${logPrefix} 酒馆API重试 #${attempt}`);
                }
                let timeoutId;
                let onAbort;
                let waiting = true;
                const invokeHost = (generate) => {
                    const request = hostTail.then(() => {
                        if (!waiting || options.signal?.aborted) throw new AbortedError();
                        return generate();
                    });
                    hostTail = request.catch(() => {});
                    return request;
                };
                try {
                    if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
                        throw new UserError('无法访问SillyTavern上下文');
                    }

                    const context = SillyTavern.getContext();
                    debugLog(`${logPrefix} 获取到SillyTavern上下文`);
                    const timeoutPromise = new Promise((_, reject) => {
                        onAbort = () => reject(new AbortedError());
                        options.signal?.addEventListener('abort', onAbort, { once: true });
                        if (options.signal?.aborted) onAbort();
                        timeoutId = setTimeout(
                            () =>
                                reject(
                                    new FatalError(`酒馆请求超时 (${timeout / 1000}秒)，请确认宿主生成已结束后再继续`, {
                                        code: 'HOST_TIMEOUT',
                                    }),
                                ),
                            timeout,
                        );
                    });

                    let result;

                    if (typeof context.generateRaw === 'function') {
                        try {
                            if (tavernGenerateRawMode === 'string' || messages.length === 1) {
                                debugLog(`${logPrefix} 使用generateRaw字符串模式`);
                                result = await Promise.race([
                                    invokeHost(() => context.generateRaw(combinedPrompt, '', false)),
                                    timeoutPromise,
                                ]);
                            } else {
                                debugLog(`${logPrefix} 尝试generateRaw消息数组格式 (ST 1.13.2+)`);
                                result = await Promise.race([
                                    invokeHost(() => context.generateRaw({ prompt: messages })),
                                    timeoutPromise,
                                ]);
                                tavernGenerateRawMode = 'messages';
                                debugLog(`${logPrefix} generateRaw消息数组格式成功`);
                            }
                        } catch (rawError) {
                            if (
                                rawError.retryable === false ||
                                rawError.httpStatus ||
                                rawError.status ||
                                APICaller.isRetryableError(rawError) ||
                                rawError.message?.includes('超时') ||
                                rawError.message?.includes('timeout') ||
                                rawError.message?.includes('API') ||
                                rawError.message?.includes('limit')
                            ) {
                                throw rawError;
                            }
                            tavernGenerateRawMode = 'string';
                            debugLog(`${logPrefix} 消息数组格式不支持(${rawError.message})，已缓存字符串模式`);
                            if (!tavernArrayFallbackNotified) {
                                updateStreamContent(
                                    `ℹ️ ${logPrefix} 当前酒馆不支持消息数组格式，已切换为字符串模式（后续不再提示）\n`,
                                );
                                tavernArrayFallbackNotified = true;
                            }
                            budget.consume();
                            result = await Promise.race([
                                invokeHost(() => context.generateRaw(combinedPrompt, '', false)),
                                timeoutPromise,
                            ]);
                        }
                    } else if (typeof context.generateQuietPrompt === 'function') {
                        debugLog(`${logPrefix} 使用generateQuietPrompt（字符串模式）`);
                        updateStreamContent(
                            `ℹ️ ${logPrefix} 酒馆API: 使用generateQuietPrompt（字符串模式，消息角色不生效）\n`,
                        );
                        result = await Promise.race([
                            invokeHost(() => context.generateQuietPrompt(combinedPrompt, false, false)),
                            timeoutPromise,
                        ]);
                    } else {
                        throw new UserError('无法找到可用的生成函数');
                    }

                    debugLog(`${logPrefix} 收到响应, 长度=${result.length}字符`);
                    updateStreamContent(`📥 ${logPrefix} 收到响应 (${result.length}字符)\n`);
                    return result;
                } catch (error) {
                    debugLog(`${logPrefix} 酒馆API出错: ${error.message}`);
                    updateStreamContent(`\n❌ ${logPrefix} 错误: ${error.message}\n`);
                    throw error;
                } finally {
                    waiting = false;
                    clearTimeout(timeoutId);
                    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
                }
            },
            {
                budget,
                signal: options.signal,
                retries: 3,
                shouldRetry: (error) => APICaller.isRetryableError(error),
                onRetry: async (error, nextAttempt, delay) => {
                    Logger.warn('API', `${logPrefix} 酒馆API重试 #${nextAttempt}: ${error.message}`);
                    updateStreamContent(`⏳ ${logPrefix} ${delay / 1000}秒后重试...\n`);
                },
            },
        );
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
                const openaiEndpoint = buildChatUrl(endpoint);
                const openaiModel = model || 'local-model';

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
        if (data.error)
            throw new RetryableError('API错误: ' + (data.error.message || '未知错误'), { code: 'API_ERROR' });
        const finish =
            provider === 'gemini'
                ? data.candidates?.[0]?.finishReason
                : provider === 'anthropic'
                  ? data.stop_reason
                  : data.choices?.[0]?.finish_reason;
        if (['MAX_TOKENS', 'max_tokens', 'length'].includes(finish)) {
            throw new TokenLimitError('Token limit exceeded: 模型输出被截断');
        }
        if (finish && !['STOP', 'end_turn', 'stop_sequence', 'stop'].includes(finish)) {
            throw new FatalError('模型未正常完成: ' + finish, { code: 'INVALID_FINISH_REASON' });
        }
        if (provider === 'gemini') {
            return (data.candidates?.[0]?.content?.parts || [])
                .filter((part) => !part.thought && typeof part.text === 'string')
                .map((part) => part.text)
                .join('');
        }
        if (provider === 'anthropic') {
            return (data.content || [])
                .filter((part) => (!part.type || part.type === 'text') && typeof part.text === 'string')
                .map((part) => part.text)
                .join('');
        }
        return data.choices?.[0]?.message?.content || '';
    }

    async function callCustomAPI(messages, options = {}) {
        const budget = options.budget || createRequestBudget();
        const maxRetries = 3;
        const timeout = AppState.settings.apiTimeout || 120000;
        const requestConfig = buildCustomApiRequest(messages);
        const combinedPrompt = messagesToString(messages);

        updateStreamContent(`\n📤 发送请求到自定义API (${requestConfig.provider}, ${messages.length}条消息)...\n`);
        debugLog(
            `自定义API开始调用, provider=${requestConfig.provider}, model=${requestConfig.model}, 消息数=${messages.length}, 总长度=${combinedPrompt.length}`,
        );

        try {
            return await APICaller.withRetry(
                async () => {
                    debugLog(`自定义API请求目标: ${requestConfig.requestUrl.substring(0, 80)}...`);

                    if (requestConfig.isStreamRequest) {
                        const result = await APICaller.requestStream(requestConfig.requestUrl, {
                            ...requestConfig.requestOptions,
                            timeout,
                            signal: options.signal,
                            inactivityTimeout: Math.min(timeout, 120000),
                        });
                        debugLog(`自定义API流式读取完成, 结果长度=${result.length}字符`);
                        updateStreamContent(`📥 收到流式响应 (${result.length}字符)\n`);
                        return result;
                    }

                    const data = await APICaller.requestJSON(requestConfig.requestUrl, {
                        ...requestConfig.requestOptions,
                        timeout,
                        signal: options.signal,
                    });
                    debugLog('自定义API JSON解析完成, 开始提取内容');
                    const result = extractCustomApiText(requestConfig.provider, data);
                    debugLog(`自定义API提取完成, 结果长度=${result.length}字符`);
                    updateStreamContent(`📥 收到响应 (${result.length}字符)\n`);
                    return result;
                },
                {
                    budget,
                    signal: options.signal,
                    retries: maxRetries,
                    shouldRetry: (error) => APICaller.isRetryableError(error),
                    onRetry: async (error, nextAttempt, delay) => {
                        Logger.warn('API', `重试 #${nextAttempt}: ${error.message}`);
                        updateStreamContent(`⏳ 遇到瞬态错误，${delay / 1000}秒后重试...\n`);
                    },
                },
            );
        } catch (error) {
            APICaller.handleError(error, '自定义API');
            debugLog(`自定义API出错: ${error.name || 'Error'} - ${error.message}`);
            throw error;
        }
    }

    async function handleFetchModelList() {
        const endpoint = AppState.settings.customApiEndpoint || '';
        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }

        const modelsUrl = buildModelsUrl(endpoint);

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
            models = data.map((m) => (typeof m === 'string' ? m : m.id || m.name || m));
        } else if (data.models && Array.isArray(data.models)) {
            models = data.models.map((m) => (typeof m === 'string' ? m : m.id || m.name || m));
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

        const requestUrl = buildChatUrl(endpoint);

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

    async function callAPI(prompt, taskId = null, options = {}) {
        const messages = applyMessageChain(prompt);
        debugLog(`callAPI: 消息链转换完成, ${messages.length}条消息, roles=[${messages.map((m) => m.role).join(',')}]`);
        if (AppState.settings.useTavernApi) {
            return callSillyTavernAPI(messages, taskId, options);
        }
        return callCustomAPI(messages, options);
    }

    return {
        callSillyTavernAPI,
        callCustomAPI,
        handleFetchModelList,
        handleQuickTestModel,
        callAPI,
    };
}

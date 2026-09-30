import { buildCustomApiRequest, extractCustomApiText, buildModelsRequest } from '../infra/providers/customProviders.js';
export { buildChatUrl, buildModelsUrl } from '../infra/providers/endpoints.js';
import { FatalError, UserError, AbortedError } from '../core/errors.js';
import { createRequestBudget } from '../core/requestPolicy.js';

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
                        const usesMessageArray = tavernGenerateRawMode !== 'string' && messages.length > 1;
                        try {
                            if (!usesMessageArray) {
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
                            const signatureMismatch =
                                rawError instanceof TypeError &&
                                /(?:prompt|messages|trim|replace|string)/i.test(rawError.message);
                            if (
                                !usesMessageArray ||
                                !signatureMismatch ||
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

    async function callCustomAPI(messages, options = {}) {
        const budget = options.budget || createRequestBudget();
        const maxRetries = 3;
        const timeout = AppState.settings.apiTimeout || 120000;
        const requestConfig = buildCustomApiRequest(AppState.settings, messages, convertToGeminiContents, options);
        const combinedPrompt = messagesToString(messages);

        updateStreamContent(`\n📤 发送请求到自定义API (${requestConfig.provider}, ${messages.length}条消息)...\n`);
        debugLog(
            `自定义API开始调用, provider=${requestConfig.provider}, model=${requestConfig.model}, 消息数=${messages.length}, 总长度=${combinedPrompt.length}`,
        );

        try {
            return await APICaller.withRetry(
                async () => {
                    debugLog(`自定义API请求目标: ${new URL(requestConfig.requestUrl).origin}`);

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

    async function handleFetchModelList(options = {}) {
        const settings = { ...AppState.settings };
        const request = buildModelsRequest(settings);
        const url = new URL(request.url);
        const models = [];
        const seen = new Set();
        for (let page = 0; page < 100; page++) {
            const data = await APICaller.requestJSON(url.toString(), {
                method: 'GET',
                headers: request.headers,
                timeout: settings.apiTimeout || 120000,
                signal: options.signal,
            });
            const batch = Array.isArray(data) ? data : data?.data || data?.models;
            if (!Array.isArray(batch)) throw new UserError('模型列表响应格式不正确');
            models.push(
                ...batch
                    .filter(
                        (model) =>
                            !model.supportedGenerationMethods ||
                            model.supportedGenerationMethods.includes('generateContent'),
                    )
                    .map((model) => (typeof model === 'string' ? model : model.id || model.name))
                    .filter((model) => typeof model === 'string')
                    .map((model) => (settings.customApiProvider === 'gemini' ? model.replace(/^models\//, '') : model)),
            );
            const next =
                settings.customApiProvider === 'gemini'
                    ? data.nextPageToken
                    : settings.customApiProvider === 'anthropic' && data.has_more
                      ? data.last_id
                      : null;
            if (!next) return [...new Set(models)];
            if (seen.has(next)) throw new UserError('模型列表分页重复，已停止读取');
            seen.add(next);
            url.searchParams.set(settings.customApiProvider === 'gemini' ? 'pageToken' : 'after_id', next);
        }
        throw new UserError('模型列表超过分页上限，请缩小查询范围');
    }

    async function handleQuickTestModel(options = {}) {
        const startTime = Date.now();
        const response = await callCustomAPI(applyMessageChain('Say "OK" if you can hear me.'), {
            ...options,
            maxOutputTokens: 100,
            temperature: 0.1,
        });
        if (typeof response !== 'string' || !response.trim()) throw new UserError('API 返回了空测试响应');
        return { success: true, elapsed: Date.now() - startTime, response: response.substring(0, 100) };
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

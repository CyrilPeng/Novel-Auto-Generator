import { FatalError, UserError, AbortedError } from '../../txtToWorldbook/core/errors.js';
import { createRequestBudget } from '../../txtToWorldbook/core/requestPolicy.js';
import { getSillyTavernContext } from './sillyTavern.js';

export function createHostGeneration({
    AppState,
    APICaller,
    Logger,
    updateStreamContent,
    debugLog,
    messagesToString,
    getContext = getSillyTavernContext,
}) {
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
                    if (!getContext()) {
                        throw new UserError('无法访问SillyTavern上下文');
                    }

                    const context = getContext();
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

    return { callSillyTavernAPI };
}

import { createRecoveryBudget } from '../core/recoveryBudget.js';
import { beginRun, captureRun, stopRun, pauseRun, finishRun, guardAwait, executeRun } from '../core/runContext.js';
import { isRetryable, isAborted, RetryableError } from '../core/errors.js';
import { createRequestBudget, abortableDelay, throwIfAborted } from '../core/requestPolicy.js';

export function createProcessingService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Semaphore,
        updateMemoryQueueUI,
        updateProgress,
        updateStreamContent,
        debugLog,
        callAPI,
        isTokenLimitError,
        parseAIResponse,
        postProcessResultWithChapterIndex,
        mergeWorldbookDataWithHistory,
        getChapterForcePrompt,
        getLanguagePrefix,
        buildSystemPrompt,
        getPreviousMemoryContext,
        getEnabledCategories,
        splitMemoryIntoTwo,
        handleStartNewVolume,
        showProgressSection,
        updateStopButtonVisibility,
        updateVolumeIndicator,
        updateStartButtonState,
        showResultSection,
        updateWorldbookPreview,
        applyDefaultWorldbookEntries,
        ErrorHandler,
        handleRepairMemoryWithSplit,
        setProcessingStatus,
        getProcessingStatus,
        buildWorldbookSummary,
        estimateTokenCount,
        setupAutoSave,
        clearAutoSave,
        quickDuplicateScan,
    } = deps;

    const transitionTo = (status) => {
        if (typeof setProcessingStatus === 'function') {
            setProcessingStatus(status);
            return;
        }
        const next = status || 'idle';
        AppState.processing.status = next;
        AppState.processing.isStopped = next === 'stopped';
        AppState.processing.isRerolling = next === 'rerolling';
        AppState.processing.isRepairing = next === 'repairing';
        AppState.processing.isRunning = next === 'running' || next === 'rerolling' || next === 'repairing';
    };

    const currentStatus = () => {
        if (typeof getProcessingStatus === 'function') return getProcessingStatus();
        return AppState.processing.status || 'idle';
    };

    const chapterTimings = [];

    function formatETA(ms) {
        if (!ms || ms < 0) return '';
        const totalSec = Math.ceil(ms / 1000);
        if (totalSec < 60) return `约${totalSec}秒`;
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return sec > 0 ? `约${min}分${sec}秒` : `约${min}分钟`;
    }

    function getETAText(remainingChapters) {
        if (chapterTimings.length === 0 || remainingChapters <= 0) return '';
        const recent = chapterTimings.slice(-10);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        return formatETA(avg * remainingChapters);
    }

    function parseMemoryUpdate(response, chapterIndex) {
        try {
            const update = postProcessResultWithChapterIndex(parseAIResponse(response), chapterIndex);
            const entryCount = ensureMeaningfulWorldbookUpdate(update, chapterIndex);
            return { update, entryCount };
        } catch (error) {
            throw new RetryableError(error.message, { code: 'INVALID_RESPONSE', cause: error });
        }
    }

    async function processMemoryChunkIndependent(options) {
        const {
            index,
            retryCount = 0,
            customPromptSuffix = '',
            worldbookSummaryContext = '',
            contentRetries = 0,
        } = options;
        const guard = options.guard || captureRun(AppState.processing);
        const signal = options.signal || guard.signal;
        const budget = options.budget || createRequestBudget();
        throwIfAborted(signal);
        const memory = AppState.memory.queue[index];
        const maxRetries = 3;
        const taskId = index + 1;
        const chapterIndex = index + 1;

        if (!AppState.processing.isRerolling && AppState.processing.isStopped) throw new Error('ABORTED');

        memory.processing = true;
        updateMemoryQueueUI();

        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + buildSystemPrompt();

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (index > 0 && AppState.memory.queue[index - 1].content) {
            prompt += `\n\n前文结尾（供参考）：\n---\n${AppState.memory.queue[index - 1].content.slice(-800)}\n---\n`;
        }

        prompt += `\n\n当前需要分析的内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        if (worldbookSummaryContext) {
            prompt += `\n${worldbookSummaryContext}\n`;
            prompt += '\n请根据以上已有条目，累积补充或更新世界书。已有的条目如需更新请保留原条目名。\n';
        }

        const enabledCatNamesList = getEnabledCategories().map((c) => c.name);
        if (AppState.settings.enablePlotOutline) enabledCatNamesList.push('剧情大纲');
        if (AppState.settings.enableLiteraryStyle) enabledCatNamesList.push('文风配置');

        const enabledCatNamesStr = enabledCatNamesList.join('、');

        prompt += `\n\n【输出限制】只允许输出以下分类：${enabledCatNamesStr}。禁止输出未列出的任何其他分类，直接输出JSON。`;

        if (AppState.settings.forceChapterMarker) {
            prompt += `\n\n【重要提醒】如果输出剧情大纲或剧情节点或章节剧情，条目名称必须包含"第${chapterIndex}章"！`;
            prompt += chapterForcePrompt;
        }

        if (customPromptSuffix) {
            prompt += `\n\n${customPromptSuffix}`;
        }

        if (AppState.settings.customSuffixPrompt && AppState.settings.customSuffixPrompt.trim()) {
            prompt += `\n\n${AppState.settings.customSuffixPrompt.trim()}`;
        }

        updateStreamContent(`\n🔄 [第${chapterIndex}章] 开始处理: ${memory.title}\n`);
        debugLog(`[第${chapterIndex}章] 开始, prompt长度=${prompt.length}字符, 重试=${retryCount}`);

        try {
            debugLog(`[第${chapterIndex}章] 调用API...`);
            const response = await guardAwait(guard, callAPI(prompt, taskId, { budget, signal }));

            if (!AppState.processing.isRerolling && AppState.processing.isStopped) {
                memory.processing = false;
                throw new Error('ABORTED');
            }

            debugLog(`[第${chapterIndex}章] 检查TokenLimit...`);
            if (isTokenLimitError(response)) throw new Error('Token limit exceeded');

            debugLog(`[第${chapterIndex}章] 解析AI响应...`);
            const { update: memoryUpdate, entryCount } = parseMemoryUpdate(response, chapterIndex);

            debugLog(`[第${chapterIndex}章] 处理完成, 有效条目=${entryCount}`);
            updateStreamContent(`✅ [第${chapterIndex}章] 处理完成（有效条目 ${entryCount} 个）\n`);
            return memoryUpdate;
        } catch (error) {
            guard.assert();
            memory.processing = false;
            if (isAborted(error)) throw error;

            updateStreamContent(`❌ [第${chapterIndex}章] 错误: ${error.message}\n`);

            if (isTokenLimitError(error.message)) throw new Error(`TOKEN_LIMIT:${index}`);

            if (
                retryCount < maxRetries &&
                budget.remaining > 0 &&
                isRetryable(error) &&
                (error.code !== 'INVALID_RESPONSE' || contentRetries < 1) &&
                !AppState.processing.isStopped
            ) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateStreamContent(`🔄 [第${chapterIndex}章] ${delay / 1000}秒后重试...\n`);
                await guardAwait(guard, abortableDelay(delay, signal));
                return processMemoryChunkIndependent({
                    index,
                    retryCount: retryCount + 1,
                    customPromptSuffix,
                    worldbookSummaryContext,
                    budget,
                    signal,
                    guard,
                    contentRetries: contentRetries + (error.code === 'INVALID_RESPONSE' ? 1 : 0),
                });
            }
            throw error;
        }
    }

    async function processMemoryChunksParallel(startIndex, endIndex, batchSummary = '') {
        if (AppState.processing.isStopped) return { tokenLimitIndices: [] };
        const guard = captureRun(AppState.processing);
        const tasks = [];
        const results = new Map();
        const tokenLimitIndices = [];

        for (let i = startIndex; i < endIndex && i < AppState.memory.queue.length; i++) {
            if (AppState.memory.queue[i].processed && !AppState.memory.queue[i].failed) continue;
            tasks.push({ index: i, memory: AppState.memory.queue[i] });
        }

        if (tasks.length === 0) return { tokenLimitIndices };

        updateStreamContent(`
🚀 并行处理 ${tasks.length} 个记忆块 (并发: ${AppState.config.parallel.concurrency})
${'='.repeat(50)}
`);
        debugLog(
            `并行处理开始: ${tasks.length}任务, 并发=${AppState.config.parallel.concurrency}, 范围=${startIndex}-${endIndex}`,
        );

        let completed = 0;
        let fatalError = null;
        const batchStartTime = Date.now();
        const semaphore = new Semaphore(AppState.config.parallel.concurrency);
        AppState.globalSemaphore = semaphore;

        const processOne = async (task) => {
            if (!guard.canDispatch()) return null;
            try {
                await semaphore.acquire();
            } catch (e) {
                if (e.message === 'ABORTED') return null;
                throw e;
            }
            if (!guard.canDispatch()) {
                semaphore.release();
                return null;
            }

            AppState.processing.activeTasks.add(task.index);

            try {
                debugLog(`[任务${task.index + 1}] 获取信号量成功, 开始处理`);
                const totalRemaining = AppState.memory.queue.length - startIndex - completed;
                const etaText = getETAText(totalRemaining);
                const etaSuffix = etaText ? ` | 预计剩余 ${etaText}` : '';
                updateProgress(
                    ((startIndex + completed) / AppState.memory.queue.length) * 100,
                    `🚀 并行处理中 (${completed}/${tasks.length})${etaSuffix}`,
                );
                const result = await guardAwait(
                    guard,
                    processMemoryChunkIndependent({
                        index: task.index,
                        worldbookSummaryContext: batchSummary,
                        guard,
                    }),
                );
                completed++;
                if (result) {
                    results.set(task.index, result);
                }
                updateMemoryQueueUI();
                return result;
            } catch (error) {
                guard.assert();
                completed++;
                task.memory.processing = false;

                if (error.message === 'ABORTED') {
                    updateMemoryQueueUI();
                    return null;
                }
                if (error.retryable === false) {
                    fatalError = error;
                    transitionTo('stopped');
                    semaphore.abort();
                }
                if (error.message.startsWith('TOKEN_LIMIT:')) {
                    tokenLimitIndices.push(parseInt(error.message.split(':')[1], 10));
                } else {
                    task.memory.failed = true;
                    task.memory.failedError = error.message;
                    task.memory.processed = true;
                    if (!AppState.memory.failedQueue.find((m) => m.index === task.index)) {
                        AppState.memory.failedQueue.push({
                            index: task.index,
                            memory: task.memory,
                            error: error.message,
                        });
                    }
                }
                updateMemoryQueueUI();
                return null;
            } finally {
                if (guard.owns()) AppState.processing.activeTasks.delete(task.index);
                semaphore.release();
            }
        };

        await Promise.allSettled(tasks.map((task) => processOne(task)));
        if (guard.owns()) {
            AppState.processing.activeTasks.clear();
            if (AppState.globalSemaphore === semaphore) AppState.globalSemaphore = null;
        }

        if (fatalError) throw fatalError;
        guard.assert();

        if (results.size > 0) {
            const avgPerChapter = (Date.now() - batchStartTime) / results.size;
            chapterTimings.push(avgPerChapter);
        }

        const orderedTasks = tasks.filter((task) => results.has(task.index)).sort((a, b) => a.index - b.index);
        for (const task of orderedTasks) {
            const result = results.get(task.index);
            task.memory.processed = true;
            task.memory.failed = false;
            task.memory.processing = false;
            task.memory.result = result;
            await guardAwait(
                guard,
                mergeWorldbookDataWithHistory({
                    target: AppState.worldbook.generated,
                    source: result,
                    memoryIndex: task.index,
                    memoryTitle: task.memory.title,
                }),
            );
            await guardAwait(guard, MemoryHistoryDB.saveRollResult(task.index, result));
        }

        if (fatalError) throw fatalError;
        updateMemoryQueueUI();
        updateStreamContent(`
${'='.repeat(50)}
📦 并行处理完成，成功: ${results.size}/${tasks.length}
`);
        return { tokenLimitIndices };
    }

    async function processMemoryChunk(index, retryCount = 0, options = {}) {
        const budget = options.budget || createRequestBudget();
        const guard = options.guard || captureRun(AppState.processing);
        const signal = options.signal || guard.signal;
        const { contentRetries = 0 } = options;
        const recovery = options.recovery || createRecoveryBudget();
        const continuation = { budget, guard, signal, recovery, contentRetries };
        if (AppState.processing.isStopped) return;
        throwIfAborted(signal);

        const memory = AppState.memory.queue[index];
        const progress = ((index + 1) / AppState.memory.queue.length) * 100;
        const maxRetries = 3;
        const chapterIndex = index + 1;
        const chunkStartTime = Date.now();

        const remaining = AppState.memory.queue.length - index - 1;
        const etaText = getETAText(remaining);
        const etaSuffix = etaText ? ` | 预计剩余 ${etaText}` : '';

        debugLog(`[串行][第${chapterIndex}章] 开始, 重试=${retryCount}`);
        updateProgress(
            progress,
            `正在处理: ${memory.title} (第${chapterIndex}章)${retryCount > 0 ? ` (重试 ${retryCount})` : ''}${etaSuffix}`,
        );

        memory.processing = true;
        updateMemoryQueueUI();

        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + buildSystemPrompt();

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (index > 0) {
            prompt += `\n\n上次阅读结尾：\n---\n${AppState.memory.queue[index - 1].content.slice(-500)}\n---\n`;
            const wbSummary = buildWorldbookSummary(AppState.worldbook.generated);
            if (wbSummary) {
                prompt += `\n${wbSummary}\n`;
                prompt += '\n请根据以上已有条目，累积补充或更新世界书。已有的条目如需更新请保留原条目名。\n';
            }
        }
        prompt += `\n现在阅读的部分（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        if (index === 0 || index === AppState.memory.startIndex) {
            prompt += '\n请开始分析小说内容。';
        } else if (AppState.processing.incrementalMode) {
            prompt += '\n请增量更新世界书，只输出变更的条目。';
        } else {
            prompt += '\n请累积补充世界书。';
        }

        if (AppState.settings.forceChapterMarker) {
            prompt += `\n\n【重要提醒】如果输出剧情大纲或剧情节点或章节剧情，条目名称必须包含"第${chapterIndex}章"！`;
            prompt += '\n直接输出JSON格式结果。';
            prompt += chapterForcePrompt;
        } else {
            prompt += '\n直接输出JSON格式结果。';
        }

        try {
            const estimatedTokens = estimateTokenCount(prompt);
            debugLog(`[串行][第${chapterIndex}章] 调用API, prompt长度=${prompt.length}, 预估token=${estimatedTokens}`);
            if (estimatedTokens > 100000) {
                updateStreamContent(`⚠️ [第${chapterIndex}章] 提示词预估 ${estimatedTokens} tokens，较大\n`);
            }
            const response = await guardAwait(guard, callAPI(prompt, null, { budget, signal }));
            memory.processing = false;

            if (AppState.processing.isStopped) {
                updateMemoryQueueUI();
                return;
            }

            debugLog(`[串行][第${chapterIndex}章] 检查TokenLimit...`);
            if (isTokenLimitError(response)) {
                if (AppState.processing.volumeMode) {
                    recovery.consume();
                    handleStartNewVolume();
                    await guardAwait(guard, MemoryHistoryDB.saveState(index));
                    await guardAwait(guard, processMemoryChunk(index, 0, continuation));
                    return;
                }
                recovery.consume();
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await guardAwait(guard, MemoryHistoryDB.saveState(index));
                    await guardAwait(guard, processMemoryChunk(index, 0, continuation));
                    await guardAwait(guard, processMemoryChunk(index + 1, 0, continuation));
                    return;
                }
            }

            debugLog(`[串行][第${chapterIndex}章] 解析AI响应...`);
            const { update: memoryUpdate, entryCount } = parseMemoryUpdate(response, chapterIndex);

            debugLog(`[串行][第${chapterIndex}章] 合并世界书...`);
            await guardAwait(
                guard,
                mergeWorldbookDataWithHistory({
                    target: AppState.worldbook.generated,
                    source: memoryUpdate,
                    memoryIndex: index,
                    memoryTitle: memory.title,
                }),
            );
            debugLog(`[串行][第${chapterIndex}章] 保存Roll结果...`);
            await guardAwait(guard, MemoryHistoryDB.saveRollResult(index, memoryUpdate));
            debugLog(`[串行][第${chapterIndex}章] 完成, 有效条目=${entryCount}`);

            memory.processed = true;
            memory.result = memoryUpdate;
            chapterTimings.push(Date.now() - chunkStartTime);
            updateMemoryQueueUI();
        } catch (error) {
            guard.assert();
            memory.processing = false;
            if (isAborted(error) || error.retryable === false) throw error;

            if (isTokenLimitError(error.message || '')) {
                if (AppState.processing.volumeMode) {
                    recovery.consume();
                    handleStartNewVolume();
                    await guardAwait(guard, MemoryHistoryDB.saveState(index));
                    await guardAwait(guard, new Promise((r) => setTimeout(r, 500)));
                    await guardAwait(guard, processMemoryChunk(index, 0, continuation));
                    return;
                }
                recovery.consume();
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await guardAwait(guard, MemoryHistoryDB.saveState(index));
                    await guardAwait(guard, new Promise((r) => setTimeout(r, 500)));
                    await guardAwait(guard, processMemoryChunk(index, 0, continuation));
                    await guardAwait(guard, processMemoryChunk(index + 1, 0, continuation));
                    return;
                }
            }

            if (
                retryCount < maxRetries &&
                budget.remaining > 0 &&
                isRetryable(error) &&
                (error.code !== 'INVALID_RESPONSE' || contentRetries < 1)
            ) {
                const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateProgress(progress, `处理失败，${retryDelay / 1000}秒后重试`);
                await guardAwait(guard, abortableDelay(retryDelay, signal));
                return processMemoryChunk(index, retryCount + 1, {
                    budget,
                    signal,
                    guard,
                    recovery,
                    contentRetries: contentRetries + (error.code === 'INVALID_RESPONSE' ? 1 : 0),
                });
            }

            memory.processed = true;
            memory.failed = true;
            memory.failedError = error.message;
            if (!AppState.memory.failedQueue.find((m) => m.index === index)) {
                AppState.memory.failedQueue.push({ index, memory, error: error.message });
            }
            updateMemoryQueueUI();
        }

        if (memory.processed) await guardAwait(guard, new Promise((r) => setTimeout(r, 1000)));
    }

    function handlePauseProcessing() {
        if (pauseRun(AppState.processing)) {
            updateStreamContent('\n⏳ 正在保存已发任务，完成后暂停\n');
        }
    }

    function handleStopProcessing() {
        stopRun(AppState.processing);
        transitionTo('stopped');
        if (typeof clearAutoSave === 'function') clearAutoSave();

        if (AppState.globalSemaphore) AppState.globalSemaphore.abort();
        AppState.processing.activeTasks.clear();
        AppState.memory.queue.forEach((m) => {
            if (m.processing) m.processing = false;
        });
        updateMemoryQueueUI();
        updateStreamContent('\n⏸️ 已暂停\n');
        updateStopButtonVisibility(false);
    }

    async function handleStartProcessing() {
        if (currentStatus() === 'running' || currentStatus() === 'repairing' || currentStatus() === 'rerolling') return;

        if (AppState.processing.run?.pending) return;
        const run = beginRun(AppState.processing);
        let failure = null;
        const guard = captureRun(AppState.processing);
        showProgressSection(true);
        transitionTo('running');

        if (typeof setupAutoSave === 'function') setupAutoSave();

        chapterTimings.length = 0;

        updateStopButtonVisibility(true);

        if (AppState.globalSemaphore) AppState.globalSemaphore.abort();
        AppState.processing.activeTasks.clear();

        updateStreamContent('', true);

        const enabledCatNames = getEnabledCategories()
            .map((c) => c.name)
            .join(', ');
        const chainDesc = (AppState.settings.promptMessageChain || []).filter((m) => m.enabled !== false);
        const chainSummary =
            chainDesc.length <= 1
                ? '默认(单条用户消息)'
                : `${chainDesc.length}条消息[${chainDesc.map((m) => (m.role === 'system' ? '系统' : m.role === 'assistant' ? 'AI' : '用户')).join('→')}]`;
        updateStreamContent(
            `🚀 开始处理...\n📊 处理模式: ${AppState.config.parallel.enabled ? `并行 (${AppState.config.parallel.concurrency}并发)` : '串行'}\n🔧 API模式: ${AppState.settings.useTavernApi ? '酒馆API' : '自定义API (' + AppState.settings.customApiProvider + ')'}\n📌 强制章节标记: ${AppState.settings.forceChapterMarker ? '开启' : '关闭'}\n💬 消息链: ${chainSummary}\n🏷️ 启用分类: ${enabledCatNames}\n${'='.repeat(50)}\n`,
        );
        debugLog('调试模式已开启 - 将记录每步耗时');

        const effectiveStartIndex =
            AppState.memory.userSelectedIndex !== null ? AppState.memory.userSelectedIndex : AppState.memory.startIndex;

        if (effectiveStartIndex === 0) {
            const hasProcessedMemories = AppState.memory.queue.some((m) => m.processed && !m.failed && m.result);
            if (!hasProcessedMemories) {
                AppState.worldbook.volumes = [];
                AppState.worldbook.currentVolumeIndex = 0;

                AppState.worldbook.generated = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
                applyDefaultWorldbookEntries();
            }
        }

        AppState.memory.userSelectedIndex = null;

        if (AppState.processing.volumeMode) updateVolumeIndicator();
        updateStartButtonState(true);

        try {
            if (AppState.config.parallel.enabled) {
                if (AppState.config.parallel.mode === 'independent') {
                    const { tokenLimitIndices } = await guardAwait(
                        guard,
                        processMemoryChunksParallel(effectiveStartIndex, AppState.memory.queue.length),
                    );
                    if (AppState.processing.isStopped) {
                        const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
                        updateProgress((processedCount / AppState.memory.queue.length) * 100, '⏸️ 已暂停');
                        await guardAwait(guard, MemoryHistoryDB.saveState(processedCount));
                        updateStartButtonState(false);
                        return;
                    }
                    if (tokenLimitIndices.length > 0) {
                        for (const idx of tokenLimitIndices.sort((a, b) => b - a)) {
                            splitMemoryIntoTwo(idx);
                        }
                        updateMemoryQueueUI();
                        for (let i = 0; i < AppState.memory.queue.length; i++) {
                            if (!guard.canDispatch()) break;
                            if (!AppState.memory.queue[i].processed || AppState.memory.queue[i].failed) {
                                await guardAwait(guard, processMemoryChunk(i));
                            }
                        }
                    }
                } else {
                    const batchSize = AppState.config.parallel.concurrency;
                    let i = effectiveStartIndex;
                    let batchWorldbookSummary = '';
                    if (Object.keys(AppState.worldbook.generated).length > 0) {
                        batchWorldbookSummary = buildWorldbookSummary(AppState.worldbook.generated);
                    }
                    while (i < AppState.memory.queue.length && guard.canDispatch()) {
                        const batchEnd = Math.min(i + batchSize, AppState.memory.queue.length);
                        const { tokenLimitIndices } = await guardAwait(
                            guard,
                            processMemoryChunksParallel(i, batchEnd, batchWorldbookSummary),
                        );
                        if (AppState.processing.isStopped) break;
                        batchWorldbookSummary = buildWorldbookSummary(AppState.worldbook.generated);
                        for (const idx of tokenLimitIndices.sort((a, b) => b - a)) splitMemoryIntoTwo(idx);
                        for (let j = i; j < batchEnd && j < AppState.memory.queue.length && guard.canDispatch(); j++) {
                            if (!AppState.memory.queue[j].processed || AppState.memory.queue[j].failed)
                                await guardAwait(guard, processMemoryChunk(j));
                        }
                        i = batchEnd;
                        await guardAwait(guard, MemoryHistoryDB.saveState(i));
                    }
                }
            } else {
                let i = effectiveStartIndex;
                while (i < AppState.memory.queue.length) {
                    if (!guard.canDispatch() && !AppState.processing.isStopped) break;
                    if (AppState.processing.isStopped) {
                        updateProgress((i / AppState.memory.queue.length) * 100, '⏸️ 已暂停');
                        await guardAwait(guard, MemoryHistoryDB.saveState(i));
                        updateStartButtonState(false);
                        return;
                    }
                    if (AppState.memory.queue[i].processed && !AppState.memory.queue[i].failed) {
                        i++;
                        continue;
                    }
                    const currentLen = AppState.memory.queue.length;
                    await guardAwait(guard, processMemoryChunk(i));
                    if (AppState.memory.queue.length > currentLen) i += AppState.memory.queue.length - currentLen;
                    i++;
                    await guardAwait(guard, MemoryHistoryDB.saveState(i));
                }
            }

            if (AppState.processing.isStopped) {
                const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
                updateProgress((processedCount / AppState.memory.queue.length) * 100, '⏸️ 已暂停');
                await guardAwait(guard, MemoryHistoryDB.saveState(processedCount));
                updateStartButtonState(false);
                return;
            }

            if (run.pauseRequested) {
                const next = AppState.memory.queue.findIndex((m) => !m.processed || m.failed);
                await guardAwait(guard, MemoryHistoryDB.saveState(next < 0 ? AppState.memory.queue.length : next));
                transitionTo('paused');
                updateStreamContent('\n⏸️ 已保存并暂停\n');
                return;
            }

            if (AppState.processing.volumeMode && Object.keys(AppState.worldbook.generated).length > 0) {
                AppState.worldbook.volumes.push({
                    volumeIndex: AppState.worldbook.currentVolumeIndex,
                    worldbook: JSON.parse(JSON.stringify(AppState.worldbook.generated)),
                    timestamp: Date.now(),
                });
            }

            const failedCount = AppState.memory.queue.filter((m) => m.failed).length;
            if (failedCount > 0) {
                updateProgress(100, `⚠️ 完成，但有 ${failedCount} 个失败`);
            } else {
                updateProgress(100, '✅ 全部完成！');
            }

            showResultSection(true);
            updateWorldbookPreview();
            updateStreamContent(`\n${'='.repeat(50)}\n✅ 处理完成！\n`);

            if (typeof quickDuplicateScan === 'function') {
                try {
                    const dupScan = quickDuplicateScan(AppState.worldbook.generated);
                    if (dupScan.totalSuspected > 0) {
                        const cats = dupScan.categories.map((c) => `${c.name}(${c.count}组)`).join('、');
                        updateStreamContent(
                            `\n💡 检测到 ${dupScan.totalSuspected} 组疑似重复条目（${cats}），建议使用"别名合并"功能处理\n`,
                        );
                    }
                } catch (e) {
                    debugLog(`去重扫描失败: ${e.message}`);
                }
            }

            await guardAwait(guard, MemoryHistoryDB.saveState(AppState.memory.queue.length));
            await guardAwait(guard, MemoryHistoryDB.clearState());
            transitionTo('idle');
            updateStartButtonState(false);
            updateStopButtonVisibility(false);
            if (typeof clearAutoSave === 'function') clearAutoSave();
        } catch (error) {
            if (!guard.owns() || isAborted(error)) return;
            failure = error;
            ErrorHandler.handle(error, 'startAIProcessing');
            updateProgress(0, `❌ 出错: ${error.message}`);
            updateStreamContent(`\n❌ 错误: ${error.message}\n`);
            if (currentStatus() !== 'stopped') transitionTo('idle');
            updateStopButtonVisibility(false);
            updateStartButtonState(false);
            if (typeof clearAutoSave === 'function') clearAutoSave();
        } finally {
            if (finishRun(AppState.processing, run, failure)) {
                AppState.processing.activeTasks.clear();
                AppState.memory.queue.forEach((memory) => {
                    memory.processing = false;
                });
                if (currentStatus() === 'running') transitionTo('idle');
                updateMemoryQueueUI();
                updateStartButtonState(false);
                updateStopButtonVisibility(false);
                if (typeof clearAutoSave === 'function') clearAutoSave();
            }
        }
    }

    async function repairFailedMemories(guard) {
        const failedMemories = AppState.memory.queue.filter((m) => m.failed);
        if (failedMemories.length === 0) {
            ErrorHandler.showUserError('没有需要修复的记忆');
            return;
        }

        transitionTo('repairing');

        if (typeof setupAutoSave === 'function') setupAutoSave();
        showProgressSection(true);
        updateStopButtonVisibility(true);
        updateProgress(0, `修复中 (0/${failedMemories.length})`);

        const stats = { successCount: 0, stillFailedCount: 0 };

        for (let i = 0; i < failedMemories.length; i++) {
            if (AppState.processing.isStopped) break;
            const memory = failedMemories[i];
            const memoryIndex = AppState.memory.queue.indexOf(memory);
            if (memoryIndex === -1) continue;
            updateProgress(((i + 1) / failedMemories.length) * 100, `修复: ${memory.title}`);
            await guardAwait(guard, handleRepairMemoryWithSplit(memoryIndex, stats));
        }

        AppState.memory.failedQueue = AppState.memory.failedQueue.filter(
            (item) => AppState.memory.queue[item.index]?.failed,
        );
        updateProgress(100, `修复完成: 成功 ${stats.successCount}, 仍失败 ${stats.stillFailedCount}`);
        await guardAwait(guard, MemoryHistoryDB.saveState(AppState.memory.queue.length));
        if (currentStatus() !== 'stopped') transitionTo('idle');

        ErrorHandler.showUserSuccess(`修复完成！成功: ${stats.successCount}, 仍失败: ${stats.stillFailedCount}`);
        updateMemoryQueueUI();
        updateStopButtonVisibility(false);
        if (typeof clearAutoSave === 'function') clearAutoSave();
    }

    async function handleRepairFailedMemories() {
        return executeRun(AppState.processing, 'repair', repairFailedMemories, {
            finish() {
                AppState.memory.queue.forEach((memory) => {
                    memory.processing = false;
                });
                if (currentStatus() !== 'stopped') transitionTo('idle');
                updateStopButtonVisibility(false);
                updateStartButtonState(false);
                updateMemoryQueueUI();
                if (typeof clearAutoSave === 'function') clearAutoSave();
            },
        });
    }

    return {
        processMemoryChunkIndependent,
        processMemoryChunksParallel,
        processMemoryChunk,
        handleStopProcessing,
        handlePauseProcessing,
        handleStartProcessing,
        handleRepairFailedMemories,
    };
}

function isWorldbookEntryLike(value) {
    return (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        ('内容' in value || 'content' in value || '关键词' in value)
    );
}

function hasMeaningfulWorldbookEntry(entry) {
    if (!isWorldbookEntryLike(entry)) return false;
    const content = entry['内容'] ?? entry.content;
    if (typeof content === 'string' && content.trim()) return true;
    return Array.isArray(entry['关键词']) && entry['关键词'].some((keyword) => String(keyword || '').trim());
}

export function countMeaningfulWorldbookEntries(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 0;
    if (isWorldbookEntryLike(data)) return hasMeaningfulWorldbookEntry(data) ? 1 : 0;

    let count = 0;
    for (const categoryData of Object.values(data)) {
        if (!categoryData || typeof categoryData !== 'object' || Array.isArray(categoryData)) continue;
        if (isWorldbookEntryLike(categoryData)) {
            if (hasMeaningfulWorldbookEntry(categoryData)) count++;
            continue;
        }
        for (const entry of Object.values(categoryData)) {
            if (hasMeaningfulWorldbookEntry(entry)) count++;
        }
    }
    return count;
}

function ensureMeaningfulWorldbookUpdate(memoryUpdate, chapterIndex) {
    const entryCount = countMeaningfulWorldbookEntries(memoryUpdate);
    if (entryCount === 0) {
        const error = new Error(
            `AI 返回了空世界书结果（第${chapterIndex}章没有有效条目），疑似未实际处理，请重试或检查模型/API配置`,
        );
        error.retryable = true;
        error.code = 'EMPTY_WORLDBOOK_UPDATE';
        throw error;
    }
    return entryCount;
}

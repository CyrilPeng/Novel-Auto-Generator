import { captureRun, guardAwait } from '../core/runContext.js';
import { createRecoveryBudget } from '../core/recoveryBudget.js';
import { abortableDelay } from '../core/requestPolicy.js';
export function createRepairService(deps = {}) {
    const {
        AppState,
        commitMemoryResult,
        MemoryHistoryDB,
        updateProgress,
        updateMemoryQueueUI,
        isTokenLimitError,
        getChapterForcePrompt,
        getLanguagePrefix,
        generateDynamicJsonTemplate,
        getPreviousMemoryContext,
        callAPI,
        parseAIResponse,
        postProcessResultWithChapterIndex,
        mergeWorldbookDataWithHistory,
        handleStartNewVolume,
        splitMemoryIntoTwo,
        buildWorldbookSummary,
        estimateTokenCount,
    } = deps;

    async function handleRepairSingleMemory(index) {
        const guard = captureRun(AppState.processing);
        guard.assert();
        const memory = AppState.memory.queue[index];
        const chapterIndex = index + 1;

        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += `${getLanguagePrefix()}你是世界书生成专家。请提取关键信息。

输出JSON格式：
${generateDynamicJsonTemplate()}
`;

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (Object.keys(AppState.worldbook.generated).length > 0) {
            const wbSummary = buildWorldbookSummary(AppState.worldbook.generated);
            if (wbSummary) {
                prompt += `${wbSummary}\n\n`;
                prompt += '请根据以上已有条目，补充或更新世界书。已有的条目如需更新请保留原条目名。\n\n';
            }
        }
        prompt += `阅读内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n\n请输出JSON。`;

        if (AppState.settings.forceChapterMarker) {
            prompt += chapterForcePrompt;
        }

        if (typeof estimateTokenCount === 'function') {
            const estimatedTokens = estimateTokenCount(prompt);
            if (estimatedTokens > 100000) {
                updateProgress(null, `⚠️ 修复[第${chapterIndex}章] 提示词预估 ${estimatedTokens} tokens，较大`);
            }
        }

        const response = await guardAwait(guard, callAPI(prompt, null, { signal: guard.signal }));
        let memoryUpdate = parseAIResponse(response);
        memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
        if (commitMemoryResult) {
            await guardAwait(guard, commitMemoryResult(index, memoryUpdate, guard, { operation: 'repair' }));
        } else {
            await guardAwait(
                guard,
                mergeWorldbookDataWithHistory({
                    target: AppState.worldbook.generated,
                    source: memoryUpdate,
                    memoryIndex: index,
                    memoryTitle: `修复-${memory.title}`,
                }),
            );
            await guardAwait(guard, MemoryHistoryDB.saveRollResult(index, memoryUpdate));
            memory.result = memoryUpdate;
        }
    }

    async function handleRepairMemoryWithSplit(memoryIndex, stats, recovery = createRecoveryBudget()) {
        const guard = captureRun(AppState.processing);
        guard.assert();
        const memory = AppState.memory.queue[memoryIndex];
        if (!memory) return;
        updateProgress((memoryIndex / AppState.memory.queue.length) * 100, `正在修复: ${memory.title}`);

        try {
            await guardAwait(guard, handleRepairSingleMemory(memoryIndex));
            memory.failed = false;
            memory.failedError = null;
            memory.processed = true;
            stats.successCount++;
            updateMemoryQueueUI();
            await guardAwait(
                guard,
                MemoryHistoryDB.saveState(AppState.memory.queue.filter((item) => item.processed).length),
            );
            await guardAwait(guard, abortableDelay(1000, guard.signal));
        } catch (error) {
            guard.assert();
            if (error.retryable === false) throw error;
            if (isTokenLimitError(error.message || '')) {
                recovery.consume();
                if (AppState.processing.volumeMode) {
                    handleStartNewVolume();
                    await guardAwait(
                        guard,
                        MemoryHistoryDB.saveState(AppState.memory.queue.filter((item) => item.processed).length),
                    );
                    await guardAwait(guard, abortableDelay(500, guard.signal));
                    await guardAwait(guard, handleRepairMemoryWithSplit(memoryIndex, stats, recovery));
                    return;
                }

                const splitResult = splitMemoryIntoTwo(memoryIndex, { allowDuringRun: true });
                if (splitResult) {
                    updateMemoryQueueUI();
                    await guardAwait(
                        guard,
                        MemoryHistoryDB.saveState(AppState.memory.queue.filter((item) => item.processed).length),
                    );
                    await guardAwait(guard, abortableDelay(500, guard.signal));
                    const part1Index = AppState.memory.queue.indexOf(splitResult.part1);
                    await guardAwait(guard, handleRepairMemoryWithSplit(part1Index, stats, recovery));
                    const part2Index = AppState.memory.queue.indexOf(splitResult.part2);
                    await guardAwait(guard, handleRepairMemoryWithSplit(part2Index, stats, recovery));
                } else {
                    stats.stillFailedCount++;
                    memory.failedError = error.message;
                }
            } else {
                stats.stillFailedCount++;
                memory.failedError = error.message;
                updateMemoryQueueUI();
                await guardAwait(guard, abortableDelay(1000, guard.signal));
            }
        }
    }

    return {
        handleRepairSingleMemory,
        handleRepairMemoryWithSplit,
    };
}

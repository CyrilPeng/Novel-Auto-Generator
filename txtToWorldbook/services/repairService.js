export function createRepairService(deps = {}) {
    const {
        AppState,
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

        const response = await callAPI(prompt);
        let memoryUpdate = parseAIResponse(response);
        memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
        await mergeWorldbookDataWithHistory({
            target: AppState.worldbook.generated,
            source: memoryUpdate,
            memoryIndex: index,
            memoryTitle: `修复-${memory.title}`,
        });
        await MemoryHistoryDB.saveRollResult(index, memoryUpdate);
        memory.result = memoryUpdate;
    }

    async function handleRepairMemoryWithSplit(memoryIndex, stats) {
        const memory = AppState.memory.queue[memoryIndex];
        if (!memory) return;
        updateProgress((memoryIndex / AppState.memory.queue.length) * 100, `正在修复: ${memory.title}`);

        try {
            await handleRepairSingleMemory(memoryIndex);
            memory.failed = false;
            memory.failedError = null;
            memory.processed = true;
            stats.successCount++;
            updateMemoryQueueUI();
            await MemoryHistoryDB.saveState(AppState.memory.queue.filter((item) => item.processed).length);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
            if (isTokenLimitError(error.message || '')) {
                if (AppState.processing.volumeMode) {
                    handleStartNewVolume();
                    await MemoryHistoryDB.saveState(AppState.memory.queue.filter((item) => item.processed).length);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    await handleRepairMemoryWithSplit(memoryIndex, stats);
                    return;
                }

                const splitResult = splitMemoryIntoTwo(memoryIndex);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(AppState.memory.queue.filter((item) => item.processed).length);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    const part1Index = AppState.memory.queue.indexOf(splitResult.part1);
                    await handleRepairMemoryWithSplit(part1Index, stats);
                    const part2Index = AppState.memory.queue.indexOf(splitResult.part2);
                    await handleRepairMemoryWithSplit(part2Index, stats);
                } else {
                    stats.stillFailedCount++;
                    memory.failedError = error.message;
                }
            } else {
                stats.stillFailedCount++;
                memory.failedError = error.message;
                updateMemoryQueueUI();
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    return {
        handleRepairSingleMemory,
        handleRepairMemoryWithSplit,
    };
}

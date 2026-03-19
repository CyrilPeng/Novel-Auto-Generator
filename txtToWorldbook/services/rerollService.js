import { runWithConcurrency } from '../core/concurrency.js';

export function createRerollService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        updateStopButtonVisibility,
        updateStreamContent,
        updateMemoryQueueUI,
        processMemoryChunkIndependent,
        mergeWorldbookDataWithHistory,
        updateWorldbookPreview,
        setProcessingStatus,
        getProcessingStatus,
        callAPI,
        parseAIResponse,
        getChapterForcePrompt,
        getLanguagePrefix,
        getPreviousMemoryContext,
        updateProgress,
        showProgressSection,
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

    function findEntrySourceMemories(category, entryName) {
        const sources = [];
        for (let i = 0; i < AppState.memory.queue.length; i++) {
            const memory = AppState.memory.queue[i];
            if (!memory.result || memory.failed) continue;
            if (memory.result[category] && memory.result[category][entryName]) {
                sources.push({
                    memoryIndex: i,
                    memory,
                    entry: memory.result[category][entryName],
                });
            }
        }
        return sources;
    }

    async function runRerollMemory(index, customPrompt = '', options = {}) {
        const { manageStatus = true } = options;
        const memory = AppState.memory.queue[index];
        if (!memory) return;

        if (manageStatus) {
            transitionTo('rerolling');
        }
        updateStopButtonVisibility(true);

        updateStreamContent(`\n🎲 开始重Roll: ${memory.title} (第${index + 1}章)\n`);

        try {
            memory.processing = true;
            updateMemoryQueueUI();

            const result = await processMemoryChunkIndependent({ index, retryCount: 0, customPromptSuffix: customPrompt });

            memory.processing = false;

            if (result) {
                await MemoryHistoryDB.saveRollResult(index, result);
                memory.result = result;
                memory.processed = true;
                memory.failed = false;
                await mergeWorldbookDataWithHistory({
                    target: AppState.worldbook.generated,
                    source: result,
                    memoryIndex: index,
                    memoryTitle: `${memory.title}-重Roll`,
                });
                updateStreamContent(`✅ 重Roll完成: ${memory.title}\n`);
                updateMemoryQueueUI();
                updateWorldbookPreview();
                return result;
            }
        } catch (error) {
            memory.processing = false;
            if (error.message !== 'ABORTED') {
                updateStreamContent(`❌ 重Roll失败: ${error.message}\n`);
            }
            updateMemoryQueueUI();
            throw error;
        } finally {
            if (manageStatus && currentStatus() !== 'stopped') transitionTo('idle');
        }
    }

    async function handleRerollMemory(index, customPrompt = '') {
        return runRerollMemory(index, customPrompt, { manageStatus: true });
    }

    async function handleRerollSingleEntry(options) {
        const { memoryIndex, category, entryName, customPrompt = '' } = options;
        const memory = AppState.memory.queue[memoryIndex];
        if (!memory) {
            throw new Error('找不到对应的章节');
        }

        transitionTo('rerolling');
        updateStopButtonVisibility(true);

        updateStreamContent(`\n🎯 开始单独重Roll条目: [${category}] ${entryName} (来自第${memoryIndex + 1}章)\n`);

        const chapterIndex = memoryIndex + 1;
        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix();

        const categoryConfig = AppState.persistent.customCategories.find(c => c.name === category);
        const contentGuide = categoryConfig ? categoryConfig.contentGuide : '';

        prompt += '\n你是一个专业的小说世界书条目生成助手。请根据以下原文内容，专门重新生成指定的条目。\n';
        prompt += '\n【任务说明】\n';
        prompt += `- 只需要生成一个条目：分类="${category}"，条目名称="${entryName}"\n`;
        prompt += '- 请基于原文内容重新分析并生成该条目的信息\n';
        prompt += `- 输出格式必须是JSON，结构为：{ "${category}": { "${entryName}": { "关键词": [...], "内容": "..." } } }\n`;

        if (contentGuide) {
            prompt += `\n【该分类的内容指南】\n${contentGuide}\n`;
        }

        const prevContext = getPreviousMemoryContext(memoryIndex);
        if (prevContext) {
            prompt += prevContext;
        }

        if (memoryIndex > 0 && AppState.memory.queue[memoryIndex - 1].content) {
            prompt += `\n\n前文结尾（供参考）：\n---\n${AppState.memory.queue[memoryIndex - 1].content.slice(-500)}\n---\n`;
        }

        prompt += `\n\n需要分析的原文内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        const currentEntry = memory.result?.[category]?.[entryName];
        if (currentEntry) {
            prompt += '\n\n【当前条目信息（供参考，请重新分析生成）】\n';
            prompt += JSON.stringify(currentEntry, null, 2);
        }

        prompt += '\n\n请重新分析原文，生成更准确、更详细的条目信息。';

        if (customPrompt) {
            prompt += `\n\n【用户额外要求】\n${customPrompt}`;
        }

        if (AppState.settings.forceChapterMarker && (category === '剧情大纲' || category === '剧情节点' || category === '章节剧情')) {
            prompt += `\n\n【重要提醒】条目名称必须包含"第${chapterIndex}章"！`;
        }

        if (AppState.settings.customSuffixPrompt && AppState.settings.customSuffixPrompt.trim()) {
            prompt += `\n\n${AppState.settings.customSuffixPrompt.trim()}`;
        }

        prompt += '\n\n直接输出JSON格式结果，不要有其他内容。';

        try {
            memory.processing = true;
            updateMemoryQueueUI();

            const response = await callAPI(prompt, memoryIndex + 1);

            memory.processing = false;

            if (AppState.processing.isStopped) {
                updateMemoryQueueUI();
                throw new Error('ABORTED');
            }

            let entryUpdate = parseAIResponse(response);

            if (!entryUpdate || !entryUpdate[category] || !entryUpdate[category][entryName]) {
                if (entryUpdate && entryUpdate[category]) {
                    const keys = Object.keys(entryUpdate[category]);
                    if (keys.length === 1) {
                        const returnedEntry = entryUpdate[category][keys[0]];
                        entryUpdate[category] = { [entryName]: returnedEntry };
                    }
                }
            }

            if (entryUpdate && entryUpdate[category] && entryUpdate[category][entryName]) {
                if (!memory.result) {
                    memory.result = {};
                }
                if (!memory.result[category]) {
                    memory.result[category] = {};
                }
                memory.result[category][entryName] = entryUpdate[category][entryName];

                await MemoryHistoryDB.saveRollResult(memoryIndex, memory.result);
                await MemoryHistoryDB.saveEntryRollResult(category, entryName, memoryIndex, entryUpdate[category][entryName], customPrompt);

                if (!AppState.worldbook.generated[category]) {
                    AppState.worldbook.generated[category] = {};
                }
                AppState.worldbook.generated[category][entryName] = entryUpdate[category][entryName];

                updateStreamContent(`✅ 条目重Roll完成: [${category}] ${entryName}\n`);
                updateMemoryQueueUI();
                updateWorldbookPreview();

                return entryUpdate[category][entryName];
            }

            throw new Error('AI返回的结果格式不正确，请重试');
        } catch (error) {
            memory.processing = false;
            if (error.message !== 'ABORTED') {
                updateStreamContent(`❌ 条目重Roll失败: ${error.message}\n`);
            }
            updateMemoryQueueUI();
            throw error;
        } finally {
            if (currentStatus() !== 'stopped') transitionTo('idle');
        }
    }

    async function batchRerollMemories(options = {}) {
        const {
            memoryIndices = [],
            customPrompt = '',
            useParallel = AppState.config.parallel.enabled && memoryIndices.length > 1,
            onStep,
        } = options;

        if (!Array.isArray(memoryIndices) || memoryIndices.length === 0) {
            return { success: 0, fail: 0, stopped: false };
        }

        showProgressSection(true);
        transitionTo('rerolling');

        let successCount = 0;
        let failCount = 0;
        let completed = 0;

        if (useParallel) {
            updateStreamContent(`\n🚀 批量重Roll开始 (并行模式, ${AppState.config.parallel.concurrency}并发)\n${'='.repeat(50)}\n`);

            await runWithConcurrency({
                items: memoryIndices,
                concurrency: AppState.config.parallel.concurrency,
                shouldStop: () => AppState.processing.isStopped,
                runItem: async (index) => {
                    try {
                        updateStreamContent(`🎲 [并行] 第${index + 1}章 开始重Roll...\n`);
                        const result = await runRerollMemory(index, customPrompt, { manageStatus: false });
                        if (result) {
                            successCount++;
                            updateStreamContent(`✅ [并行] 第${index + 1}章 完成\n`);
                        }
                    } catch (error) {
                        failCount++;
                        updateStreamContent(`❌ [并行] 第${index + 1}章 失败: ${error.message}\n`);
                    } finally {
                        completed++;
                        updateProgress((completed / memoryIndices.length) * 100, `批量重Roll中 (${completed}/${memoryIndices.length})`);
                        if (typeof onStep === 'function') {
                            onStep({ completed, total: memoryIndices.length, successCount, failCount });
                        }
                    }
                },
            });
        } else {
            updateStreamContent(`\n🔄 批量重Roll开始 (串行模式)\n${'='.repeat(50)}\n`);
            for (let i = 0; i < memoryIndices.length; i++) {
                if (AppState.processing.isStopped) break;
                const index = memoryIndices[i];
                try {
                    updateStreamContent(`\n🎲 [${i + 1}/${memoryIndices.length}] 第${index + 1}章...\n`);
                    await runRerollMemory(index, customPrompt, { manageStatus: false });
                    successCount++;
                } catch (error) {
                    failCount++;
                    updateStreamContent(`❌ 第${index + 1}章重Roll失败: ${error.message}\n`);
                } finally {
                    completed++;
                    updateProgress((completed / memoryIndices.length) * 100, `批量重Roll中 (${completed}/${memoryIndices.length})`);
                    if (typeof onStep === 'function') {
                        onStep({ completed, total: memoryIndices.length, successCount, failCount });
                    }
                }
            }
        }

        updateStreamContent(`\n${'='.repeat(50)}\n📦 批量重Roll完成: 成功 ${successCount}, 失败 ${failCount}\n`);
        updateProgress(100, `批量重Roll完成: 成功 ${successCount}, 失败 ${failCount}`);
        updateMemoryQueueUI();

        const stopped = AppState.processing.isStopped;
        if (!stopped) {
            transitionTo('idle');
        }

        return { success: successCount, fail: failCount, stopped };
    }

    return {
        findEntrySourceMemories,
        handleRerollMemory,
        handleRerollSingleEntry,
        batchRerollMemories,
    };
}




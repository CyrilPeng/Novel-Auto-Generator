import { createMergeService as createMergePlanner } from './mergeService.js';
import { createConsolidationService } from '../../src/worldbook/commands/consolidate.js';
export { isConsolidateErrorResponse } from '../../src/worldbook/commands/consolidate.js';
import { executeRun, captureRun, runConfiguration } from '../core/runContext.js';
import { clearProcessingStop } from '../../src/shared/tasks/lifecycle.js';

export function createMergeWorkflowService(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        createMergeService,
        mergeService,
        Logger,
        getAllVolumesWorldbook,
        defaultConsolidatePrompt,
        setProcessingStatus,
        showProgressSection,
        updateProgress,
        updateStreamContent,
        getProcessingStatus,
        updateWorldbookPreview,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
        filterResponseContent,
        Semaphore,
    } = deps;

    const mergedService =
        mergeService ||
        (createMergeService &&
            createMergeService({
                AppState,
                Logger,
                getAllVolumesWorldbook,
                getLanguagePrefix,
                updateStreamContent,
                Semaphore,
                callAPI,
                parseAIResponse,
            }));

    if (!mergedService) {
        throw new Error('createMergeWorkflowService requires mergeService or createMergeService deps');
    }

    const consolidation = createConsolidationService({
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
        filterResponseContent,
        defaultConsolidatePrompt,
    });

    let lastConsolidateFailedEntries = [];

    async function commitPlannedMerge(action, title) {
        return executeRun(
            AppState.processing,
            'merge',
            async (guard) => {
                clearProcessingStop(AppState.processing);
                setProcessingStatus('running');
                const draft = { ...AppState, worldbook: structuredClone(AppState.worldbook) };
                const planner = createMergePlanner({
                    ...deps,
                    AppState: draft,
                    getAllVolumesWorldbook: () => structuredClone(getAllVolumesWorldbook()),
                });
                const result = await action(planner);
                guard.assert();
                if (result?.success === false) throw new Error(result.error);
                if (!deps.commitWorldbook) throw new Error('缺少世界书提交仓储');
                await deps.commitWorldbook(draft.worldbook.generated, guard, title, {
                    volumes: draft.worldbook.volumes,
                });
                return result;
            },
            {
                finish: () => {
                    if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');
                },
            },
        );
    }

    async function consolidateEntry(category, entryName, promptTemplate) {
        const guard = captureRun(AppState.processing);
        const result = await consolidation.transformEntry(
            AppState.worldbook.generated[category]?.[entryName],
            promptTemplate,
            guard.signal,
        );
        guard.assert();
        if (result) AppState.worldbook.generated[category][entryName] = result;
    }

    async function consolidateSelectedEntries(entries) {
        try {
            await executeRun(
                AppState.processing,
                'consolidate',
                async (guard) => {
                    setProcessingStatus('running');
                    clearProcessingStop(AppState.processing);
                    showProgressSection(true);
                    const next = structuredClone(AppState.worldbook.generated);
                    const failedEntries = [];
                    const config = runConfiguration(AppState).config.parallel;
                    const limit = config.enabled === false ? 1 : Math.max(1, Math.min(16, config.concurrency || 1));
                    let cursor = 0,
                        completed = 0;
                    const worker = async () => {
                        while (cursor < entries.length) {
                            guard.assert();
                            const entry = entries[cursor++];
                            try {
                                const result = await consolidation.transformEntry(
                                    next[entry.category]?.[entry.name],
                                    entry.promptTemplate,
                                    guard.signal,
                                );
                                guard.assert();
                                if (result) next[entry.category][entry.name] = result;
                                completed++;
                            } catch (error) {
                                guard.assert();
                                failedEntries.push({
                                    category: entry.category,
                                    name: entry.name,
                                    error: error.message,
                                });
                            }
                            updateProgress(
                                ((completed + failedEntries.length) / entries.length) * 100,
                                `整理中：${completed} 成功，${failedEntries.length} 失败`,
                            );
                        }
                    };
                    await Promise.allSettled(Array.from({ length: Math.min(limit, entries.length) }, worker));
                    guard.assert();
                    if (!deps.commitWorldbook) throw new Error('缺少世界书提交仓储');
                    await deps.commitWorldbook(next, guard, '整理世界书');
                    lastConsolidateFailedEntries = failedEntries;
                    updateWorldbookPreview();
                    const message = `整理完成：${completed} 成功，${failedEntries.length} 失败`;
                    updateStreamContent(message);
                    if (failedEntries.length) ErrorHandler.showUserError(message);
                    else ErrorHandler.showUserSuccess(message);
                },
                {
                    finish: () => {
                        if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');
                    },
                },
            );
        } catch (error) {
            ErrorHandler.showUserError(error.message);
        }
    }

    function verifyDuplicatesWithAI(suspectedGroups, useParallel = true, threshold = 5, categoryName = '角色') {
        return mergedService.verifyDuplicatesWithAI(suspectedGroups, useParallel, threshold, categoryName);
    }

    function mergeConfirmedDuplicates(aiResult, categoryName = '角色') {
        return mergedService.mergeConfirmedDuplicates(aiResult, categoryName);
    }

    return {
        commitPlannedMerge,
        consolidateEntry,
        consolidateSelectedEntries,
        getLastConsolidateFailedEntries: () => lastConsolidateFailedEntries,
        getMergeService: () => mergedService,
        verifyDuplicatesWithAI,
        mergeConfirmedDuplicates,
        quickDuplicateScan: (wb) => mergedService.quickDuplicateScan(wb),
    };
}

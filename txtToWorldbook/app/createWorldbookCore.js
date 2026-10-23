import { createChunkCommitService } from '../../src/storage/chunkCommitService.js';
import { createRepairService } from '../../src/worldbook/commands/repair.js';
import { APICaller } from '../infra/apiCaller.js';
import { Semaphore, TokenCache, isTokenLimitError } from '../core/runtime.js';
import { buildWorldbookSummary, estimateTokenCount, naturalSortEntryNames } from '../core/utils.js';
import { createMemoryQueueActionsService } from '../services/memoryQueueActionsService.js';
import { createWorldbookRuntimeService } from '../services/worldbookRuntimeService.js';
import { createCoreServices } from './createCoreServices.js';

export function createWorldbookCore(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        ModalFactory,
        ListRenderer,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
        getEnabledCategories,
        generateDynamicJsonTemplate,
        getEnabledCategoryNames,
        debugLog,
        updateStreamContent,
        getCategoryLightState,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        getEntryConfig,
        setEntryConfig,
        confirmAction,
        saveCurrentSettings,
        updateMemoryQueueUI,
        updateStopButtonVisibility,
        updateStartButtonState,
        updateProgress,
        showProgressSection,
        showResultSection,
        setProcessingStatus,
        getProcessingStatus,
        getWorldbookView,
        getTaskStateService,
        getMergeWorkflowService,
    } = deps;

    let getEntryTotalTokens = () => 0;

    const coreServices = createCoreServices({
        promptDeps: {
            AppState,
            getEnabledCategories,
            generateDynamicJsonTemplate,
            defaultWorldbookPrompt,
            defaultPlotPrompt,
            defaultStylePrompt,
        },
        parserDeps: {
            AppState,
            debugLog,
            getEnabledCategoryNames,
        },
        apiDeps: {
            AppState,
            Logger,
            APICaller,
            updateStreamContent,
            debugLog,
            messagesToString: (...args) => coreServices.promptService.messagesToString(...args),
            convertToGeminiContents: (...args) => coreServices.promptService.convertToGeminiContents(...args),
            applyMessageChain: (...args) => coreServices.promptService.applyMessageChain(...args),
        },
        worldbookDeps: {
            getIncrementalMode: () => AppState.processing.incrementalMode,
            saveHistory: (...args) => MemoryHistoryDB.saveHistory(...args),
            debugLog,
            _getWorldbook: () => AppState.worldbook.generated,
        },
        tokenMetricsDeps: {
            tokenCacheGet: (text) => TokenCache.get(text),
        },
        exportFormatDeps: {
            AppState,
            naturalSortEntryNames,
            getCategoryLightState,
            getCategoryAutoIncrement,
            getCategoryBaseOrder,
            getEntryConfig,
        },
        processingDeps: ({ apiService, parserService }) => ({
            commitMemoryResult: (...args) => chunkCommitService.commit(...args),
            AppState,
            MemoryHistoryDB,
            Semaphore,
            updateMemoryQueueUI,
            updateProgress,
            updateStreamContent,
            debugLog,
            callAPI: apiService.callAPI,
            isTokenLimitError,
            parseAIResponse: parserService.parseAIResponse,
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
            updateWorldbookPreview: () => getWorldbookView().updateWorldbookPreview(),
            applyDefaultWorldbookEntries,
            ErrorHandler,
            handleRepairMemoryWithSplit,
            setProcessingStatus,
            getProcessingStatus,
            buildWorldbookSummary,
            estimateTokenCount,
            setupAutoSave: () => getTaskStateService().setupAutoSave(),
            clearAutoSave: () => getTaskStateService().clearAutoSave(),
            quickDuplicateScan: (wb) => getMergeWorkflowService().quickDuplicateScan(wb),
        }),
        rerollDeps: ({ apiService, parserService }) => ({
            commitMemoryResult: (...args) => chunkCommitService.commit(...args),
            AppState,
            MemoryHistoryDB,
            updateStopButtonVisibility,
            updateStreamContent,
            updateMemoryQueueUI,
            processMemoryChunkIndependent,
            mergeWorldbookDataWithHistory,
            updateWorldbookPreview: () => getWorldbookView().updateWorldbookPreview(),
            setProcessingStatus,
            getProcessingStatus,
            callAPI: apiService.callAPI,
            parseAIResponse: parserService.parseAIResponse,
            getChapterForcePrompt,
            getLanguagePrefix,
            getPreviousMemoryContext,
            Semaphore,
            updateProgress,
            showProgressSection,
        }),
        rerollModalsDeps: ({ parserService }) => ({
            AppState,
            ModalFactory,
            MemoryHistoryDB,
            ListRenderer,
            Logger,
            ErrorHandler,
            confirmAction,
            parseAIResponse: parserService.parseAIResponse,
            rebuildWorldbookFromMemories: (...args) => rebuildWorldbookFromMemories(...args),
            updateMemoryQueueUI: (...args) => updateMemoryQueueUI(...args),
            findEntrySourceMemories: (...args) => findEntrySourceMemories(...args),
            handleRerollMemory: (...args) => handleRerollMemory(...args),
            handleRerollSingleEntry: (...args) => handleRerollSingleEntry(...args),
            handleStopProcessing: (...args) => handleStopProcessing(...args),
            setProcessingStatus: (...args) => setProcessingStatus(...args),
            getProcessingStatus: (...args) => getProcessingStatus(...args),
            saveCurrentSettings: (...args) => saveCurrentSettings(...args),
            getEntryTotalTokens: (...args) => getEntryTotalTokens(...args),
            updateWorldbookPreview: () => getWorldbookView().updateWorldbookPreview(),
        }),
    });
    const {
        promptService,
        parserService,
        apiService,
        worldbookService,
        tokenMetricsService,
        exportFormatService,
        getProcessingService,
        getRerollService,
        getRerollModals,
    } = coreServices;
    const { buildSystemPrompt, getPreviousMemoryContext, getChapterForcePrompt, getLanguagePrefix } = promptService;
    const { filterResponseContent, parseAIResponse } = parserService;
    const { callSillyTavernAPI, callCustomAPI, handleFetchModelList, handleQuickTestModel, callAPI } = apiService;
    const { mergeWorldbookDataIncremental, mergeWorldbookDataWithHistory, saveWorldbookSnapshot } = worldbookService;
    const chunkCommitService = createChunkCommitService({ AppState, MemoryHistoryDB, worldbookService });
    const { convertToSillyTavernFormat } = exportFormatService;
    getEntryTotalTokens = (entry) => tokenMetricsService.getEntryTotalTokens(entry);

    const worldbookRuntimeService = createWorldbookRuntimeService({
        AppState,
        Logger,
        updateStreamContent,
        mergeWorldbookDataIncremental,
        setEntryConfig,
        renderVolumeIndicator: ({ currentVolumeIndex, volumeCount }) => {
            const indicator = document.getElementById('ttw-volume-indicator');
            if (!indicator) return;
            indicator.textContent = `当前: 第${currentVolumeIndex + 1}卷 | 已完成: ${volumeCount}卷`;
            indicator.style.display = 'block';
        },
    });
    const {
        postProcessResultWithChapterIndex,
        updateVolumeIndicator,
        handleStartNewVolume,
        getAllVolumesWorldbook,
        rebuildWorldbookFromMemories,
        applyDefaultWorldbookEntries,
    } = worldbookRuntimeService;
    const repairService = createRepairService({
        commitMemoryResult: (...args) => chunkCommitService.commit(...args),
        AppState,
        MemoryHistoryDB,
        updateProgress: (...args) => updateProgress(...args),
        updateMemoryQueueUI: (...args) => updateMemoryQueueUI(...args),
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
        splitMemoryIntoTwo: (...args) => splitMemoryIntoTwo(...args),
        buildWorldbookSummary,
        estimateTokenCount,
    });
    const { handleRepairMemoryWithSplit } = repairService;
    const memoryQueueActionsService = createMemoryQueueActionsService({
        AppState,
        ErrorHandler,
        confirmAction,
        updateMemoryQueueUI,
        updateStartButtonState,
    });
    const { splitMemoryIntoTwo, deleteMemoryAt, deleteSelectedMemories } = memoryQueueActionsService;

    // ========== 并行处理 ==========
    /**
     * 处理单个记忆块（独立模式，用于并行处理和重Roll）
     * @param {Object} options - 处理选项
     * @param {number} options.index - 记忆索引
     * @param {number} [options.retryCount=0] - 重试次数
     * @param {string} [options.customPromptSuffix=''] - 自定义提示词后缀
     * @returns {Promise<Object>} 处理结果
     */
    async function processMemoryChunkIndependent(options) {
        return getProcessingService().processMemoryChunkIndependent(options);
    }

    function handleStopProcessing() {
        return getProcessingService().handleStopProcessing();
    }

    // ========== 主处理流程 ==========
    async function handleStartProcessing() {
        return getProcessingService().handleStartProcessing();
    }

    /**
     * 修复失败的章节
     * @returns {Promise<any>}
     */
    async function handleRepairFailedMemories() {
        return getProcessingService().handleRepairFailedMemories();
    }

    const handleRerollMemory = (index, customPrompt = '') => getRerollService().handleRerollMemory(index, customPrompt);
    const findEntrySourceMemories = (category, entryName) =>
        getRerollService().findEntrySourceMemories(category, entryName);
    const handleRerollSingleEntry = (options) => getRerollService().handleRerollSingleEntry(options);
    const showRerollEntryModal = (category, entryName, callback) =>
        getRerollModals().showRerollEntryModal(category, entryName, callback);
    const showBatchRerollModal = (callback) => getRerollModals().showBatchRerollModal(callback);
    const showRollHistorySelector = (index) => getRerollModals().showRollHistorySelector(index);

    return {
        promptService,
        parserService,
        apiService,
        worldbookService,
        tokenMetricsService,
        exportFormatService,
        getProcessingService,
        getRerollService,
        getRerollModals,
        buildSystemPrompt,
        getPreviousMemoryContext,
        getChapterForcePrompt,
        getLanguagePrefix,
        filterResponseContent,
        parseAIResponse,
        callSillyTavernAPI,
        callCustomAPI,
        handleFetchModelList,
        handleQuickTestModel,
        callAPI,
        mergeWorldbookDataIncremental,
        mergeWorldbookDataWithHistory,
        saveWorldbookSnapshot,
        chunkCommitService,
        convertToSillyTavernFormat,
        getEntryTotalTokens,
        worldbookRuntimeService,
        postProcessResultWithChapterIndex,
        updateVolumeIndicator,
        handleStartNewVolume,
        getAllVolumesWorldbook,
        rebuildWorldbookFromMemories,
        applyDefaultWorldbookEntries,
        repairService,
        handleRepairMemoryWithSplit,
        memoryQueueActionsService,
        splitMemoryIntoTwo,
        deleteMemoryAt,
        deleteSelectedMemories,
        processMemoryChunkIndependent,
        handleStopProcessing,
        handleStartProcessing,
        handleRepairFailedMemories,
        handleRerollMemory,
        findEntrySourceMemories,
        handleRerollSingleEntry,
        showRerollEntryModal,
        showBatchRerollModal,
        showRollHistorySelector,
    };
}

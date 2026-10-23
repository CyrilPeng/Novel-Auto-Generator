import { createChunkCommitService } from '../../src/storage/chunkCommitService.js';
import {
    DEFAULT_CHAPTER_REGEX,
    DEFAULT_CATEGORY_LIGHT,
    DEFAULT_PLOT_OUTLINE_CONFIG,
    DEFAULT_PARALLEL_CONFIG,
    DEFAULT_WORLDBOOK_CATEGORIES,
    defaultWorldbookPrompt,
    defaultPlotPrompt,
    defaultStylePrompt,
    defaultMergePrompt,
    defaultConsolidatePrompt,
    defaultSettings,
} from '../core/constants.js';
import { Logger } from '../core/logger.js';
import { estimateTokenCount, naturalSortEntryNames, buildWorldbookSummary } from '../core/utils.js';
import { createErrorHandler } from '../core/errorHandler.js';
import { Semaphore, PerfUtils, TokenCache, isTokenLimitError } from '../core/runtime.js';
import { ModalFactory } from '../infra/modalFactory.js';
import { APICaller } from '../infra/apiCaller.js';
import { EventDelegate } from '../infra/eventDelegate.js';
import { createMergeService } from '../services/mergeService.js';
import { createCategoryPersistenceService } from '../services/categoryPersistenceService.js';
import { createWorldbookHelpers } from './createWorldbookHelpers.js';
import { createExportNameService } from '../ui/exportNameService.js';
import { createMemoryQueueActionsService } from '../services/memoryQueueActionsService.js';
import { createProcessingStateService } from '../services/processingStateService.js';
import { createRepairService } from '../../src/worldbook/commands/repair.js';
import { createWorldbookRuntimeService } from '../services/worldbookRuntimeService.js';
import { createAppContext } from './createApp.js';
import { createCoreServices } from './createCoreServices.js';
import { createPublicApi } from './publicApi.js';
import { createShellRuntimeConfig } from './createShellRuntimeConfig.js';
import { createFeatureServices } from './createFeatureServices.js';
import { createShellRuntime } from './createShellRuntime.js';
import {
    buildAliasCategorySelectModal,
    buildAliasGroupsListHtml,
    buildAliasPairResultsHtml,
    buildAliasMergePlanHtml,
} from '../ui/mergeModals.js';
import {
    bindActionEvents as bindActionEventsUI,
    bindCollapsePanelEvents as bindCollapsePanelEventsUI,
    bindExportEvents as bindExportEventsUI,
    bindFileEvents as bindFileEventsUI,
    bindMessageChainEvents as bindMessageChainEventsUI,
    bindModalBasicEvents as bindModalBasicEventsUI,
    bindPromptEvents as bindPromptEventsUI,
    bindSettingEvents as bindSettingEventsUI,
    bindStreamEvents as bindStreamEventsUI,
} from '../ui/eventBindings.js';
import { createListRenderer, escapeHtmlForDisplay, escapeAttrForDisplay } from '../ui/renderer.js';
import { buildModalHtml } from '../ui/settingsPanel.js';
import { createMemoryQueueView } from '../ui/memoryQueueView.js';
import { createStartButtonView } from '../ui/startButtonView.js';
import { createStopButtonView } from '../ui/stopButtonView.js';
import { createUiHelpers } from '../ui/createUiHelpers.js';
import { createWorldbookViewRuntime } from '../ui/createWorldbookViewRuntime.js';
import { ensureModalStyles } from '../ui/modalStyles.js';

export function createWorldbookApp() {
    // ========== AppState 统一状态对象 ==========
    const { AppState, MemoryHistoryDB } = createAppContext({
        defaultCategoryLight: DEFAULT_CATEGORY_LIGHT,
        defaultPlotOutlineConfig: DEFAULT_PLOT_OUTLINE_CONFIG,
        defaultParallelConfig: DEFAULT_PARALLEL_CONFIG,
        defaultChapterRegex: DEFAULT_CHAPTER_REGEX,
        defaultWorldbookCategories: DEFAULT_WORLDBOOK_CATEGORIES,
        defaultSettings,
        Logger,
    });

    let getEntryTotalTokens = () => 0;

    // ========== UI常量 ==========
    const UI = {
        ICON: {
            SUCCESS: '✅',
            FAILED: '❌',
            PROCESSING: '🔄',
            WARNING: '⚠️',
            INFO: 'ℹ️',
            DELETE: '🗑️',
            EDIT: '✏️',
            SAVE: '💾',
            CANCEL: '❌',
        },
    };

    // ========== ModalFactory 便捷方法 ==========
    const confirmAction = (message, options = {}) => ModalFactory.confirm({ message, ...options });
    const promptAction = (config, options = {}) =>
        typeof config === 'string'
            ? ModalFactory.prompt({ message: config, ...options })
            : ModalFactory.prompt(config || options);
    const alertAction = (config, options = {}) =>
        typeof config === 'string'
            ? ModalFactory.alert({ message: config, ...options })
            : ModalFactory.alert(config || options);

    const ErrorHandler = createErrorHandler({
        Logger,
        ModalFactory,
        confirmAction,
    });
    const startButtonView = createStartButtonView({
        AppState,
    });
    const { updateStartButtonState } = startButtonView;
    const stopButtonView = createStopButtonView();
    const { updateStopButtonVisibility } = stopButtonView;
    const processingStateService = createProcessingStateService({
        AppState,
    });
    const { setProcessingStatus, getProcessingStatus } = processingStateService;
    const exportNameService = createExportNameService({
        AppState,
    });
    const { getExportBaseName } = exportNameService;

    let saveCurrentSettings = () => settingsPersistenceService?.saveCurrentSettings();
    let loadSavedSettings = () => settingsPersistenceService?.loadSavedSettings();
    let _initializeModalState = () => modalLifecycle?.initializeModalState();
    let _restoreModalData = () => modalLifecycle?.restoreModalData();
    let shellRuntime = null;
    let _bindModalEvents = () => modalEventBinder?.bindModalEvents(shellRuntime?.getModalContainer?.());
    let closeModal = () => modalController?.closeModal();
    let open = () => modalController?.open();
    // ========== ListRenderer 列表渲染工具 ==========
    const ListRenderer = createListRenderer({
        smartUpdate: PerfUtils.smartUpdate,
        tokenCacheGet: (text) => TokenCache.get(text),
        estimateTokenCount,
        uiIcons: UI.ICON,
        getEntryConfig: (category, entryName) => getEntryConfig(category, entryName),
        getCategoryAutoIncrement: (category) => getCategoryAutoIncrement(category),
        getEntryTotalTokens: (entry) => getEntryTotalTokens(entry),
    });

    const memoryQueueView = createMemoryQueueView({
        AppState,
        ListRenderer,
        ModalFactory,
        PerfUtils,
        ErrorHandler,
        confirmAction,
        deleteMemoryAt: (index) => deleteMemoryAt(index),
        updateStartButtonState: (isProcessing) => updateStartButtonState(isProcessing),
        showRollHistorySelector: (index) => showRollHistorySelector(index),
    });
    const {
        updateMemoryQueueUI,
        toggleMultiSelectMode,
        showStartFromSelector,
        showMemoryContentModal,
        showProcessedResults,
    } = memoryQueueView;
    // ========== IndexedDB ==========
    const categoryPersistenceService = createCategoryPersistenceService({
        AppState,
        MemoryHistoryDB,
        Logger,
        defaultWorldbookCategories: DEFAULT_WORLDBOOK_CATEGORIES,
        extendedCategoryNames: ['剧情大纲', '知识书', '文风配置', '地图环境', '剧情节点'],
    });
    const {
        saveCustomCategories,
        loadCustomCategories,
        resetToDefaultCategories,
        resetSingleCategory,
        getEnabledCategories,
        generateDynamicJsonTemplate,
        getEnabledCategoryNames,
    } = categoryPersistenceService;

    /**
     * 更新实时输出流内容
     * @param {string} content
     * @param {boolean} [clear=false]
     */
    const {
        updateStreamContent,
        debugLog,
        getCategoryLightState,
        setCategoryLightState,
        loadCategoryLightSettings,
        getEntryConfig,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        setEntryConfig,
        setCategoryDefaultConfig,
    } = createWorldbookHelpers({
        AppState,
        getCategoryLightService: () => categoryLightService,
        getEntryConfigService: () => entryConfigService,
        saveSettings: (...args) => saveCurrentSettings(...args),
    });

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
            updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
            applyDefaultWorldbookEntries,
            ErrorHandler,
            handleRepairMemoryWithSplit,
            setProcessingStatus,
            getProcessingStatus,
            buildWorldbookSummary,
            estimateTokenCount,
            setupAutoSave: () => taskStateService.setupAutoSave(),
            clearAutoSave: () => taskStateService.clearAutoSave(),
            quickDuplicateScan: (wb) => mergeWorkflowService.quickDuplicateScan(wb),
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
            updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
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
            updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
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

    // ========== 导入JSON合并世界书 ==========
    async function importAndMergeWorldbook() {
        if (!importMergeService) return;
        return importMergeService.importAndMergeWorldbook();
    }

    const {
        renderMessageChainUI,
        updateSettingsUI,
        updateChapterRegexUI,
        renderCategoriesList,
        showAddCategoryModal,
        renderDefaultWorldbookEntriesUI,
        showAddDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
        testChapterRegex,
        handleUseTavernApiChange,
        handleProviderChange,
        handleFetchModels,
        handleQuickTest,
        showPromptPreview,
        showQueueSection,
        showProgressSection,
        showResultSection,
        updateProgress,
    } = createUiHelpers({
        AppState,
        ListRenderer,
        EventDelegate,
        PerfUtils,
        ModalFactory,
        ErrorHandler,
        Logger,
        DEFAULT_WORLDBOOK_CATEGORIES,
        saveCurrentSettings,
        saveCustomCategories,
        confirmAction,
        resetSingleCategory,
        setCategoryDefaultConfig,
        alertAction,
        buildSystemPrompt,
        getChapterForcePrompt,
        getEnabledCategories,
        handleFetchModelList,
        handleQuickTestModel,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
    });

    // ========== 初始化与导出 ==========
    // 模态框HTML构建已迁移至 ui/settingsPanel.js
    const worldbookView = createWorldbookViewRuntime({
        AppState,
        ListRenderer,
        naturalSortEntryNames,
        escapeHtmlForDisplay,
        escapeAttrForDisplay,
        EventDelegate,
        ModalFactory,
        getCategoryLightState,
        setCategoryLightState,
        getEntryConfig,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        getEntryTotalTokens,
        showCategoryConfigModal: (...args) => showCategoryConfigModal(...args),
        showEntryConfigModal: (...args) => showEntryConfigModal(...args),
        showRerollEntryModal: (...args) => showRerollEntryModal(...args),
        getAllVolumesWorldbook,
        showManualMergeUI: (...args) => showManualMergeUI(...args),
        showBatchRerollModal: (...args) => showBatchRerollModal(...args),
    });

    const {
        runtimeActionsFacade,
        importMergeService: featureImportMergeService,
        historyView,
        searchModal,
        replaceModal,
        helpModal,
        taskStateService,
        importExportService,
        mergeWorkflowService,
    } = createFeatureServices({
        commitWorldbook: (...args) => chunkCommitService.commitWorldbook(...args),

        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        ModalFactory,
        confirmAction,
        defaultSettings,
        defaultMergePrompt,
        defaultConsolidatePrompt,
        naturalSortEntryNames,
        EventDelegate,
        PerfUtils,
        estimateTokenCount,
        createMergeService,
        getEntryTotalTokens,
        getAllVolumesWorldbook,
        convertToSillyTavernFormat,
        getExportBaseName,
        saveCurrentSettings,
        saveCustomCategories,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
        rebuildWorldbookFromMemories,
        showQueueSection,
        updateMemoryQueueUI,
        updateVolumeIndicator,
        updateStartButtonState,
        showResultSection,
        updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
        setManualMergeHighlight: (category, name) => worldbookView.setManualMergeHighlight(category, name),
        setProcessingStatus,
        updateProgress,
        updateStreamContent,
        getProcessingStatus,
        showProgressSection,
        Semaphore,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
        filterResponseContent,
        handleStopProcessing,
        handleStartProcessing,
        handleRerollMemory,
        getRerollService,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        buildAliasCategorySelectModal,
        buildAliasGroupsListHtml,
        buildAliasPairResultsHtml,
        buildAliasMergePlanHtml,
        ListRenderer,
        promptAction,
        saveWorldbookSnapshot,
    });
    const importMergeService = featureImportMergeService;
    const showCleanTagsModal = runtimeActionsFacade.showCleanTagsModal;
    const showEntryConfigModal = runtimeActionsFacade.showEntryConfigModal;
    const showPlotOutlineConfigModal = runtimeActionsFacade.showPlotOutlineConfigModal;
    const showCategoryConfigModal = runtimeActionsFacade.showCategoryConfigModal;
    const handleStartConversion = runtimeActionsFacade.handleStartConversion;
    const showHistoryView = historyView.showHistoryView;
    const rollbackToHistory = historyView.rollbackToHistory;
    const showSearchModal = searchModal.showSearchModal;
    const showReplaceModal = replaceModal.showReplaceModal;
    const showHelpModal = helpModal.showHelpModal;
    const saveTaskState = taskStateService.saveTaskState;
    const loadTaskState = taskStateService.loadTaskState;
    const checkAndRestoreState = taskStateService.checkAndRestoreState;
    const restoreExistingState = taskStateService.restoreExistingState;
    const exportCharacterCard = importExportService.exportCharacterCard;
    const exportToSillyTavern = importExportService.exportToSillyTavern;
    const exportVolumes = importExportService.exportVolumes;
    const exportSettings = importExportService.exportSettings;
    const importSettings = importExportService.importSettings;
    const exportChangedEntries = importExportService.exportChangedEntries;
    const showConsolidateCategorySelector = mergeWorkflowService.showConsolidateCategorySelector;
    const showManualMergeUI = mergeWorkflowService.showManualMergeUI;
    const showAliasMergeUI = mergeWorkflowService.showAliasMergeUI;

    shellRuntime = createShellRuntime(
        createShellRuntimeConfig({
            AppState,
            MemoryHistoryDB,
            Logger,
            ErrorHandler,
            confirmAction,
            defaultSettings,
            worldbookView,
            updateSettingsUI,
            updateChapterRegexUI,
            handleProviderChange,
            ensureModalStyles,
            bindModalEvents: () => _bindModalEvents(),
            loadSavedSettings: () => loadSavedSettings(),
            loadCategoryLightSettings,
            loadCustomCategories,
            renderCategoriesList,
            renderDefaultWorldbookEntriesUI,
            checkAndRestoreState: (...args) => checkAndRestoreState(...args),
            setProcessingStatus,
            getGlobalSemaphore: () => AppState.globalSemaphore,
            buildModalHtml,
            initializeModalState: () => _initializeModalState(),
            restoreModalData: () => _restoreModalData(),
            restoreExistingState: (...args) => restoreExistingState(...args),
            bindModalBasicEventsUI,
            bindSettingEventsUI,
            bindCollapsePanelEventsUI,
            bindPromptEventsUI,
            bindMessageChainEventsUI,
            bindFileEventsUI,
            bindActionEventsUI,
            bindStreamEventsUI,
            bindExportEventsUI,
            EventDelegate,
            closeModal: (...args) => closeModal(...args),
            showHelpModal: (...args) => showHelpModal(...args),
            saveCurrentSettings: (...args) => saveCurrentSettings(...args),
            handleUseTavernApiChange,
            handleFetchModels,
            handleQuickTest,
            rechunkMemories: (...args) => rechunkMemories(...args),
            showAddCategoryModal,
            resetToDefaultCategories,
            showAddDefaultEntryModal,
            saveDefaultWorldbookEntriesUI,
            applyDefaultWorldbookEntries,
            showResultSection,
            testChapterRegex,
            renderMessageChainUI,
            handleFileSelect: (...args) => handleFileSelect(...args),
            handleClearFile: (...args) => handleClearFile(...args),
            handleStartConversion: (...args) => handleStartConversion(...args),
            handleStopProcessing: () =>
                AppState.processing.run?.operation === 'convert'
                    ? getProcessingService().handlePauseProcessing()
                    : getProcessingService().handleStopProcessing(),
            handleRepairFailedMemories,
            showStartFromSelector,
            showProcessedResults,
            toggleMultiSelectMode,
            deleteSelectedMemories,
            updateMemoryQueueUI,
            showSearchModal: (...args) => showSearchModal(...args),
            showReplaceModal: (...args) => showReplaceModal(...args),
            showHistoryView: (...args) => showHistoryView(...args),
            showConsolidateCategorySelector: (...args) => showConsolidateCategorySelector(...args),
            showCleanTagsModal: (...args) => showCleanTagsModal(...args),
            showManualMergeUI: (...args) => showManualMergeUI(...args),
            showAliasMergeUI: (...args) => showAliasMergeUI(...args),
            updateStreamContent,
            showPromptPreview: (...args) => showPromptPreview(...args),
            showPlotOutlineConfigModal: (...args) => showPlotOutlineConfigModal(...args),
            importAndMergeWorldbook,
            loadTaskState: (...args) => loadTaskState(...args),
            saveTaskState: (...args) => saveTaskState(...args),
            exportSettings: (...args) => exportSettings(...args),
            importSettings: (...args) => importSettings(...args),
            exportCharacterCard: (...args) => exportCharacterCard(...args),
            exportVolumes: (...args) => exportVolumes(...args),
            exportToSillyTavern: (...args) => exportToSillyTavern(...args),
            exportChangedEntries: (...args) => exportChangedEntries(...args),
            showMemoryContentModal,
            updateStartButtonState,
            showQueueSection,
            showProgressSection,
            onEntryConfigChanged: (...args) => saveCurrentSettings(...args),
            onHashFallback: () => Logger.warn('Hash', 'Crypto API 失败，回退到简易哈希'),
        }),
    );
    const settingsPersistenceService = shellRuntime.settingsPersistenceService;
    const categoryLightService = shellRuntime.categoryLightService;
    const entryConfigService = shellRuntime.entryConfigService;
    const modalLifecycle = shellRuntime.modalLifecycle;
    const modalController = shellRuntime.modalController;
    const modalEventBinder = shellRuntime.modalEventBinder;
    const handleFileSelect = shellRuntime.fileImportService.handleFileSelect;
    const handleClearFile = shellRuntime.fileImportService.handleClearFile;
    const rechunkMemories = shellRuntime.fileImportService.rechunkMemories;
    saveCurrentSettings = () => shellRuntime.modalRuntimeFacade.saveCurrentSettings();
    loadSavedSettings = () => shellRuntime.modalRuntimeFacade.loadSavedSettings();
    _initializeModalState = () => shellRuntime.modalRuntimeFacade.initializeModalState();
    _restoreModalData = () => shellRuntime.modalRuntimeFacade.restoreModalData();
    _bindModalEvents = () => shellRuntime.modalRuntimeFacade.bindModalEvents();
    closeModal = () => shellRuntime.modalRuntimeFacade.closeModal();
    open = () => shellRuntime.modalRuntimeFacade.open();

    // ========== 公开 API ==========
    const api = createPublicApi({
        open,
        closeModal,
        rollbackToHistory,
        AppState,
        getAllVolumesWorldbook,
        saveTaskState,
        loadTaskState,
        exportSettings,
        importSettings,
        handleRerollMemory,
        handleRerollSingleEntry,
        findEntrySourceMemories,
        showRerollEntryModal,
        showBatchRerollModal,
        showRollHistorySelector,
        importAndMergeWorldbook,
        setCategoryLightState,
        rebuildWorldbookFromMemories,
        applyDefaultWorldbookEntries,
        callCustomAPI,
        callSillyTavernAPI,
        showConsolidateCategorySelector,
        showAliasMergeUI,
        showManualMergeUI,
        getEnabledCategories,
        rechunkMemories,
        showSearchModal,
        showReplaceModal,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        MemoryHistoryDB,
    });

    Logger.info('Module', '📚 TxtToWorldbook 已加载');
    Logger.info(
        'Module',
        '架构重构: AppState统一状态 | Logger日志系统 | EventDelegate事件委托 | ModalFactory模态框工厂',
    );
    Logger.info('Module', '性能优化: TokenCache缓存 | PerfUtils防抖节流 | DOM批量更新');
    Logger.info('Module', '代码质量: ErrorHandler统一错误处理 | JSDoc完整文档 | 函数命名规范化');

    return { api, shellRuntime };
}

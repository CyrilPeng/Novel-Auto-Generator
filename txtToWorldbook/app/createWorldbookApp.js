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
import { estimateTokenCount, naturalSortEntryNames } from '../core/utils.js';
import { createErrorHandler } from '../core/errorHandler.js';
import { Semaphore, PerfUtils, TokenCache } from '../core/runtime.js';
import { ModalFactory } from '../infra/modalFactory.js';
import { EventDelegate } from '../infra/eventDelegate.js';
import { createMergeService } from '../services/mergeService.js';
import { createCategoryPersistenceService } from '../services/categoryPersistenceService.js';
import { createWorldbookHelpers } from './createWorldbookHelpers.js';
import { createExportNameService } from '../ui/exportNameService.js';
import { createProcessingStateService } from '../services/processingStateService.js';
import { createAppContext } from './createApp.js';
import { createWorldbookCore } from './createWorldbookCore.js';
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

    const core = createWorldbookCore({
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
        saveCurrentSettings: (...args) => saveCurrentSettings(...args),
        updateMemoryQueueUI,
        updateStopButtonVisibility,
        updateStartButtonState,
        updateProgress: (...args) => updateProgress(...args),
        showProgressSection: (...args) => showProgressSection(...args),
        showResultSection: (...args) => showResultSection(...args),
        setProcessingStatus,
        getProcessingStatus,
        getWorldbookView: () => worldbookView,
        getTaskStateService: () => taskStateService,
        getMergeWorkflowService: () => mergeWorkflowService,
    });
    getEntryTotalTokens = core.getEntryTotalTokens;
    const {
        buildSystemPrompt,
        getChapterForcePrompt,
        getLanguagePrefix,
        filterResponseContent,
        parseAIResponse,
        callSillyTavernAPI,
        callCustomAPI,
        handleFetchModelList,
        handleQuickTestModel,
        callAPI,
        saveWorldbookSnapshot,
        chunkCommitService,
        convertToSillyTavernFormat,
        updateVolumeIndicator,
        getAllVolumesWorldbook,
        rebuildWorldbookFromMemories,
        applyDefaultWorldbookEntries,
        deleteMemoryAt,
        deleteSelectedMemories,
        handleStopProcessing,
        handleStartProcessing,
        handleRepairFailedMemories,
        handleRerollMemory,
        findEntrySourceMemories,
        handleRerollSingleEntry,
        showRerollEntryModal,
        showBatchRerollModal,
        showRollHistorySelector,
        getProcessingService,
        getRerollService,
    } = core;

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

import { createEntryConfigModals } from '../ui/entryConfigModals.js';
import { createHistoryView } from '../ui/historyView.js';
import { createSearchModal } from '../ui/searchModal.js';
import { createReplaceModal } from '../ui/replaceModal.js';
import { createHelpModal } from '../ui/helpModal.js';
import { createReplaceAndCleanService } from '../ui/replaceAndCleanService.js';
import { createImportMergeService } from '../ui/importMergeService.js';
import { createTaskStateService } from '../ui/taskStateService.js';
import { createImportExportService } from '../ui/importExportService.js';
import { createMergeWorkflowService } from '../services/mergeWorkflowService.js';
import { createMergeWorkflowView } from '../ui/mergeWorkflowView.js';
import { createRuntimeActionsFacade } from './runtimeActionsFacade.js';

export function createFeatureServices(deps = {}) {
    const {
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
        updateWorldbookPreview,
        setProcessingStatus,
        updateProgress,
        updateStreamContent,
        getProcessingStatus,
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
        setManualMergeHighlight,
        saveWorldbookSnapshot,
    } = deps;

    const entryConfigModals = createEntryConfigModals({
        AppState,
        ModalFactory,
        ErrorHandler,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        saveCurrentSettings,
        saveCustomCategories,
        updateWorldbookPreview,
    });

    const replaceAndCleanService = createReplaceAndCleanService({
        commitWorldbook: deps.commitWorldbook,
        AppState,
        ModalFactory,
        ErrorHandler,
        confirmAction,
        updateWorldbookPreview,
    });

    const runtimeActionsFacade = createRuntimeActionsFacade({
        AppState,
        ErrorHandler,
        saveCurrentSettings,
        handleStartProcessing,
        replaceAndCleanService,
        entryConfigModals,
    });

    const importMergeService = createImportMergeService({
        commitWorldbook: deps.commitWorldbook,
        AppState,
        Logger,
        ErrorHandler,
        ModalFactory,
        defaultMergePrompt,
        saveCurrentSettings,
        showProgressSection: deps.showProgressSection,
        setProcessingStatus,
        updateProgress,
        updateStreamContent,
        getProcessingStatus,
        showResultSection,
        updateWorldbookPreview,
        Semaphore,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
    });

    const historyView = createHistoryView({
        AppState,
        ModalFactory,
        MemoryHistoryDB,
        confirmAction,
        ErrorHandler,
    });

    const searchModal = createSearchModal({
        AppState,
        ModalFactory,
        Logger,
        ErrorHandler,
        confirmAction,
        saveCurrentSettings,
        handleStopProcessing,
        handleRerollMemory,
        batchRerollMemories: (config) => getRerollService().batchRerollMemories(config),
        updateWorldbookPreview,
    });

    const replaceModal = createReplaceModal({
        commitWorldbook: deps.commitWorldbook,
        AppState,
        ModalFactory,
        ErrorHandler,
        confirmAction,
        updateWorldbookPreview,
        saveWorldbookSnapshot,
    });

    const helpModal = createHelpModal({
        ModalFactory,
    });

    const taskStateService = createTaskStateService({
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        confirmAction,
        defaultSettings,
        getExportBaseName,
        rebuildWorldbookFromMemories,
        showQueueSection,
        updateMemoryQueueUI,
        updateVolumeIndicator,
        updateStartButtonState,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
        showResultSection,
        updateWorldbookPreview,
    });

    const importExportService = createImportExportService({
        AppState,
        MemoryHistoryDB,
        ErrorHandler,
        defaultSettings,
        getAllVolumesWorldbook,
        convertToSillyTavernFormat,
        getExportBaseName,
        saveCurrentSettings,
        saveCustomCategories,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
    });

    const mergeWorkflowService = createMergeWorkflowService({
        commitWorldbook: deps.commitWorldbook,
        AppState,
        ErrorHandler,
        ModalFactory,
        getEntryTotalTokens,
        naturalSortEntryNames,
        EventDelegate,
        PerfUtils,
        estimateTokenCount,
        createMergeService,
        Logger,
        getAllVolumesWorldbook,
        defaultConsolidatePrompt,
        saveCurrentSettings,
        promptAction: deps.promptAction,
        confirmAction,
        showProgressSection: deps.showProgressSection,
        setProcessingStatus,
        updateProgress,
        updateStreamContent,
        Semaphore,
        getProcessingStatus,
        updateWorldbookPreview,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
        filterResponseContent,
        escapeHtml: ListRenderer.escapeHtml,
        buildAliasCategorySelectModal,
        buildAliasGroupsListHtml,
        buildAliasPairResultsHtml,
        buildAliasMergePlanHtml,
        handleStopProcessing,
        setManualMergeHighlight,
        saveWorldbookSnapshot,
    });
    const mergeWorkflowView = createMergeWorkflowView({
        AppState,
        ErrorHandler,
        ModalFactory,
        getEntryTotalTokens,
        naturalSortEntryNames,
        EventDelegate,
        PerfUtils,
        estimateTokenCount,
        defaultConsolidatePrompt,
        saveCurrentSettings,
        promptAction: deps.promptAction,
        confirmAction,
        updateStreamContent,
        updateWorldbookPreview,
        escapeHtml: ListRenderer.escapeHtml,
        buildAliasCategorySelectModal,
        buildAliasGroupsListHtml,
        buildAliasPairResultsHtml,
        buildAliasMergePlanHtml,
        handleStopProcessing,
        saveWorldbookSnapshot,
        workflow: mergeWorkflowService,
    });

    return {
        entryConfigModals,
        replaceAndCleanService,
        runtimeActionsFacade,
        importMergeService,
        historyView,
        searchModal,
        replaceModal,
        helpModal,
        taskStateService,
        importExportService,
        mergeWorkflowService: { ...mergeWorkflowService, ...mergeWorkflowView },
    };
}

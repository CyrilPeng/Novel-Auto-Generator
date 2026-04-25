export function createRerollBridge(deps = {}) {
    const {
        getRerollService,
        getRerollModals,
    } = deps;

    async function handleRerollMemory(index, customPrompt = '') {
        return getRerollService().handleRerollMemory(index, customPrompt);
    }

    function findEntrySourceMemories(category, entryName) {
        return getRerollService().findEntrySourceMemories(category, entryName);
    }

    async function handleRerollSingleEntry(options) {
        return getRerollService().handleRerollSingleEntry(options);
    }

    async function showRerollEntryModal(category, entryName, callback) {
        return getRerollModals().showRerollEntryModal(category, entryName, callback);
    }

    async function showBatchRerollModal(callback) {
        return getRerollModals().showBatchRerollModal(callback);
    }

    async function showRollHistorySelector(index) {
        return getRerollModals().showRollHistorySelector(index);
    }

    return {
        handleRerollMemory,
        findEntrySourceMemories,
        handleRerollSingleEntry,
        showRerollEntryModal,
        showBatchRerollModal,
        showRollHistorySelector,
    };
}

export function createFeatureBindings(featureServices = {}) {
    const {
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
        mergeWorkflowService,
    } = featureServices;

    return {
        entryConfigModals,
        replaceAndCleanService,
        importMergeService,
        showCleanTagsModal: runtimeActionsFacade.showCleanTagsModal,
        showEntryConfigModal: runtimeActionsFacade.showEntryConfigModal,
        showPlotOutlineConfigModal: runtimeActionsFacade.showPlotOutlineConfigModal,
        showCategoryConfigModal: runtimeActionsFacade.showCategoryConfigModal,
        handleStartConversion: runtimeActionsFacade.handleStartConversion,
        showHistoryView: historyView.showHistoryView,
        rollbackToHistory: historyView.rollbackToHistory,
        showSearchModal: searchModal.showSearchModal,
        showReplaceModal: replaceModal.showReplaceModal,
        showHelpModal: helpModal.showHelpModal,
        saveTaskState: taskStateService.saveTaskState,
        loadTaskState: taskStateService.loadTaskState,
        checkAndRestoreState: taskStateService.checkAndRestoreState,
        restoreExistingState: taskStateService.restoreExistingState,
        exportCharacterCard: importExportService.exportCharacterCard,
        exportToSillyTavern: importExportService.exportToSillyTavern,
        exportVolumes: importExportService.exportVolumes,
        exportSettings: importExportService.exportSettings,
        importSettings: importExportService.importSettings,
        exportChangedEntries: importExportService.exportChangedEntries,
        showConsolidateCategorySelector: mergeWorkflowService.showConsolidateCategorySelector,
        showManualMergeUI: mergeWorkflowService.showManualMergeUI,
        showAliasMergeUI: mergeWorkflowService.showAliasMergeUI,
    };
}

export function createShellRuntimeBindings(shellRuntime) {
    return {
        fileUtils: shellRuntime.fileUtils,
        settingsPersistenceService: shellRuntime.settingsPersistenceService,
        categoryLightService: shellRuntime.categoryLightService,
        entryConfigService: shellRuntime.entryConfigService,
        modalLifecycle: shellRuntime.modalLifecycle,
        modalController: shellRuntime.modalController,
        modalEventBinder: shellRuntime.modalEventBinder,
        handleFileSelect: shellRuntime.fileImportService.handleFileSelect,
        splitContentIntoMemory: shellRuntime.fileImportService.splitContentIntoMemory,
        handleClearFile: shellRuntime.fileImportService.handleClearFile,
        rechunkMemories: shellRuntime.fileImportService.rechunkMemories,
        saveCurrentSettings: () => shellRuntime.modalRuntimeFacade.saveCurrentSettings(),
        loadSavedSettings: () => shellRuntime.modalRuntimeFacade.loadSavedSettings(),
        initializeModalState: () => shellRuntime.modalRuntimeFacade.initializeModalState(),
        restoreModalData: () => shellRuntime.modalRuntimeFacade.restoreModalData(),
        bindModalEvents: () => shellRuntime.modalRuntimeFacade.bindModalEvents(),
        closeModal: () => shellRuntime.modalRuntimeFacade.closeModal(),
        open: () => shellRuntime.modalRuntimeFacade.open(),
    };
}

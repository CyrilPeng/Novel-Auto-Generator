export function createFeaturePlaceholders() {
    const noop = () => {};
    const noopAsync = async () => {};

    return {
        worldbookView: null,
        showCleanTagsModal: noop,
        showEntryConfigModal: noop,
        showPlotOutlineConfigModal: noop,
        showCategoryConfigModal: noop,
        handleStartConversion: noopAsync,
        showHistoryView: noop,
        rollbackToHistory: noopAsync,
        showSearchModal: noop,
        showReplaceModal: noop,
        showHelpModal: noop,
        saveTaskState: noopAsync,
        loadTaskState: noopAsync,
        checkAndRestoreState: noopAsync,
        restoreExistingState: noopAsync,
        exportCharacterCard: noop,
        exportToSillyTavern: noop,
        exportVolumes: noop,
        exportSettings: noop,
        importSettings: noop,
        exportChangedEntries: noopAsync,
        showConsolidateCategorySelector: noop,
        showManualMergeUI: noop,
        showAliasMergeUI: noop,
    };
}

export function createShellPlaceholders() {
    const noop = () => {};
    const noopAsync = async () => {};

    return {
        importMergeService: null,
        replaceAndCleanService: null,
        settingsPersistenceService: null,
        categoryPersistenceService: null,
        categoryLightService: null,
        entryConfigService: null,
        modalLifecycle: null,
        modalController: null,
        modalEventBinder: null,
        fileUtils: null,
        entryConfigModals: null,
        handleFileSelect: noopAsync,
        splitContentIntoMemory: noop,
        handleClearFile: noopAsync,
        rechunkMemories: noop,
    };
}

export function createCompatibilityAliases(deps = {}) {
    return {
        startAIProcessing: deps.handleStartProcessing,
        fetchModelList: deps.handleFetchModelList,
        quickTestModel: deps.handleQuickTestModel,
        startNewVolume: deps.handleStartNewVolume,
        repairSingleMemory: deps.handleRepairSingleMemory,
        repairMemoryWithSplit: deps.handleRepairMemoryWithSplit,
    };
}

export function createPublicApiConfig(deps = {}) {
    const {
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
    } = deps;

    return {
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
    };
}

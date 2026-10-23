export function createModalLifecycle(deps) {
    const {
        addModalStyles,
        bindModalEvents,
        loadSavedSettings,
        loadCategoryLightSettings,
        loadCustomCategories,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        checkAndRestoreState,
    } = deps;

    function initializeModalState() {
        addModalStyles();
        bindModalEvents();
        loadSavedSettings();
        loadCategoryLightSettings();
    }

    function restoreModalData() {
        const categoriesReady = loadCustomCategories().then(() => {
            // The page or test environment may be torn down while IndexedDB is still loading.
            if (typeof document === 'undefined') return;
            renderCategoriesList();
            renderDefaultWorldbookEntriesUI();
        });
        return Promise.all([categoriesReady, checkAndRestoreState()]);
    }

    return {
        initializeModalState,
        restoreModalData,
    };
}

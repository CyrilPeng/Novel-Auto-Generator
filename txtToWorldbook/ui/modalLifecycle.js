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
            renderCategoriesList();
            renderDefaultWorldbookEntriesUI();
        });
        checkAndRestoreState();
        return categoriesReady;
    }

    return {
        initializeModalState,
        restoreModalData,
    };
}

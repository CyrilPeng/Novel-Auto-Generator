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
        return Promise.all([categoriesReady, checkAndRestoreState()]);
    }

    return {
        initializeModalState,
        restoreModalData,
    };
}

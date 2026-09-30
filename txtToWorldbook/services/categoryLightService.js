export function createCategoryLightService(deps) {
    const { AppState, storageKey = 'txtToWorldbookSettings' } = deps;

    function saveCategoryLightSettings() {
        AppState.settings.categoryLightSettings = { ...AppState.config.categoryLight };
        try {
            localStorage.setItem(storageKey, JSON.stringify(AppState.settings));
        } catch {}
    }

    function loadCategoryLightSettings() {
        if (AppState.settings.categoryLightSettings) {
            AppState.config.categoryLight = {
                ...AppState.config.categoryLight,
                ...AppState.settings.categoryLightSettings,
            };
        }
    }

    return {
        saveCategoryLightSettings,
        loadCategoryLightSettings,
    };
}

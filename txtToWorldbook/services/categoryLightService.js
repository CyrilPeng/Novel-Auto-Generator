import { saveSettingsRecord } from '../../src/storage/settingsStore.js';
export function createCategoryLightService(deps) {
    const { AppState, storageKey = 'txtToWorldbookSettings' } = deps;

    function saveCategoryLightSettings() {
        AppState.settings.categoryLightSettings = { ...AppState.config.categoryLight };
        try {
            saveSettingsRecord(localStorage, AppState.settings, storageKey);
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

export function createModalRuntimeFacade(deps = {}) {
    const { settingsPersistenceService, modalLifecycle, modalEventBinder, modalController, getModalContainer } = deps;

    function initializeModalState() {
        if (!modalLifecycle) return;
        modalLifecycle.initializeModalState();
    }

    function restoreModalData() {
        if (!modalLifecycle) return;
        return modalLifecycle.restoreModalData();
    }

    function bindModalEvents() {
        if (!modalEventBinder) return;
        modalEventBinder.bindModalEvents(getModalContainer());
    }

    function saveCurrentSettings() {
        if (!settingsPersistenceService) return;
        settingsPersistenceService.saveCurrentSettings();
    }

    function loadSavedSettings() {
        if (!settingsPersistenceService) return;
        settingsPersistenceService.loadSavedSettings();
    }

    function closeModal() {
        if (!modalController) return;
        return modalController.closeModal();
    }

    function open() {
        if (!modalController) return;
        return modalController.open();
    }

    return {
        initializeModalState,
        restoreModalData,
        bindModalEvents,
        saveCurrentSettings,
        loadSavedSettings,
        closeModal,
        open,
    };
}

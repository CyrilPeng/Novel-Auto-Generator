import { createFileUtils } from '../core/fileUtils.js';
import { createFileImportService } from '../ui/fileImportService.js';
import { createSettingsPersistenceService } from '../ui/settingsPersistenceService.js';
import { createCategoryLightService } from '../services/categoryLightService.js';
import { createEntryConfigService } from '../services/entryConfigService.js';
import { createModalLifecycle } from '../ui/modalLifecycle.js';
import { createModalController } from '../ui/modalController.js';
import { createModalEventBinder } from '../ui/modalEventBinder.js';
import { createModalRuntimeFacade } from '../ui/modalRuntimeFacade.js';

export function createShellRuntime(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        confirmAction,
        defaultSettings,
        createWorldbookView,
        createSettingsPersistenceServiceDeps,
        createModalLifecycleDeps,
        createModalControllerDeps,
        createModalEventBinderDeps,
        fileImportDeps,
        worldbookViewDeps,
        categoryLightStorageKey = 'txtToWorldbookSettings',
        onEntryConfigChanged,
        onHashFallback,
    } = deps;

    let modalContainer = null;

    const worldbookView = createWorldbookView(worldbookViewDeps);

    const fileUtils = createFileUtils({
        onHashFallback,
    });

    const fileImportService = createFileImportService({
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        confirmAction,
        fileUtils,
        ...fileImportDeps,
    });

    const settingsPersistenceService = createSettingsPersistenceService({
        AppState,
        defaultSettings,
        ...createSettingsPersistenceServiceDeps,
    });

    const categoryLightService = createCategoryLightService({
        AppState,
        storageKey: categoryLightStorageKey,
    });

    const entryConfigService = createEntryConfigService({
        AppState,
        onConfigChanged: onEntryConfigChanged,
    });

    const modalLifecycle = createModalLifecycle(createModalLifecycleDeps);

    const modalController = createModalController({
        AppState,
        getModalContainer: () => modalContainer,
        setModalContainer: (value) => {
            modalContainer = value;
        },
        ...createModalControllerDeps,
    });

    const modalEventBinder = createModalEventBinder(createModalEventBinderDeps(modalController, () => modalContainer));

    const modalRuntimeFacade = createModalRuntimeFacade({
        settingsPersistenceService,
        modalLifecycle,
        modalEventBinder,
        modalController,
        getModalContainer: () => modalContainer,
    });

    return {
        worldbookView,
        fileUtils,
        fileImportService,
        settingsPersistenceService,
        categoryLightService,
        entryConfigService,
        modalLifecycle,
        modalController,
        modalEventBinder,
        modalRuntimeFacade,
        getModalContainer: () => modalContainer,
    };
}

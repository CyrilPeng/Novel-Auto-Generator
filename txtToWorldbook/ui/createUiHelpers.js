import { createMessageChainView } from './messageChainView.js';
import { createSettingsStateView } from './settingsStateView.js';
import { createCategoryListView } from './categoryListView.js';
import { createCategoryEditorModal } from './categoryEditorModal.js';
import { createDefaultEntriesView } from './defaultEntriesView.js';
import { createEditorActionsFacade } from './editorActionsFacade.js';
import { createChapterRegexView } from './chapterRegexView.js';
import { createPromptPreviewModal } from './promptPreviewModal.js';
import { createModelActionsView } from './modelActionsView.js';
import { createApiModeView } from './apiModeView.js';
import { createSettingsActionsFacade } from './settingsActionsFacade.js';
import { createProgressView } from './progressView.js';

export function createUiHelpers(deps = {}) {
    const {
        AppState,
        ListRenderer,
        EventDelegate,
        PerfUtils,
        ModalFactory,
        ErrorHandler,
        Logger,
        DEFAULT_WORLDBOOK_CATEGORIES,
        saveCurrentSettings,
        saveCustomCategories,
        confirmAction,
        resetSingleCategory,
        setCategoryDefaultConfig,
        buildSystemPrompt,
        getChapterForcePrompt,
        getEnabledCategories,
        handleFetchModelList,
        handleQuickTestModel,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
    } = deps;

    let apiModeView = null;
    let categoryEditorModal = null;

    const messageChainView = createMessageChainView({
        AppState,
        ListRenderer,
        EventDelegate,
        saveCurrentSettings,
        handleUseTavernApiChange: () => apiModeView?.handleUseTavernApiChange(),
    });
    const { renderMessageChainUI } = messageChainView;

    const settingsStateView = createSettingsStateView({
        AppState,
        handleUseTavernApiChange: () => apiModeView?.handleUseTavernApiChange(),
        handleProviderChange: () => apiModeView?.handleProviderChange(),
        renderMessageChainUI,
    });
    const {
        updateSettingsUI,
        updateChapterRegexUI,
    } = settingsStateView;

    const categoryListView = createCategoryListView({
        AppState,
        ListRenderer,
        EventDelegate,
        hasDefaultCategory: (name) => DEFAULT_WORLDBOOK_CATEGORIES.some((c) => c.name === name),
        saveCustomCategories,
        showEditCategoryModal: (index) => categoryEditorModal?.showEditCategoryModal(index),
        confirmAction,
        resetSingleCategory: (index) => resetSingleCategory(index),
    });
    const { renderCategoriesList } = categoryListView;

    categoryEditorModal = createCategoryEditorModal({
        AppState,
        ModalFactory,
        ErrorHandler,
        setCategoryDefaultConfig,
        saveCustomCategories,
        renderCategoriesList: () => renderCategoriesList(),
    });

    const defaultEntriesView = createDefaultEntriesView({
        AppState,
        ListRenderer,
        PerfUtils,
        EventDelegate,
        ModalFactory,
        ErrorHandler,
        saveCurrentSettings,
    });

    const editorActionsFacade = createEditorActionsFacade({
        categoryEditorModal,
        defaultEntriesView,
    });
    const {
        showAddCategoryModal,
        showEditCategoryModal,
        renderDefaultWorldbookEntriesUI,
        showAddDefaultEntryModal,
        showEditDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
    } = editorActionsFacade;

    const chapterRegexView = createChapterRegexView({
        AppState,
        ModalFactory,
        ErrorHandler,
        Logger,
    });
    const { testChapterRegex } = chapterRegexView;

    const promptPreviewModal = createPromptPreviewModal({
        AppState,
        ModalFactory,
        ErrorHandler,
        alertAction: deps.alertAction,
        buildSystemPrompt,
        getChapterForcePrompt,
        getEnabledCategories,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
        saveCurrentSettings,
    });

    const modelActionsView = createModelActionsView({
        saveCurrentSettings,
        handleFetchModelList,
        handleQuickTestModel,
        Logger,
    });

    apiModeView = createApiModeView({
        AppState,
        updateModelStatus: (text, type) => modelActionsView.updateModelStatus(text, type),
    });

    const settingsActionsFacade = createSettingsActionsFacade({
        apiModeView,
        modelActionsView,
        promptPreviewModal,
    });
    const {
        handleUseTavernApiChange,
        handleProviderChange,
        updateModelStatus,
        handleFetchModels,
        handleQuickTest,
        showPromptPreview,
    } = settingsActionsFacade;

    const progressView = createProgressView({
        AppState,
    });
    const {
        showQueueSection,
        showProgressSection,
        showResultSection,
        updateProgress,
    } = progressView;

    return {
        renderMessageChainUI,
        updateSettingsUI,
        updateChapterRegexUI,
        renderCategoriesList,
        showAddCategoryModal,
        showEditCategoryModal,
        renderDefaultWorldbookEntriesUI,
        showAddDefaultEntryModal,
        showEditDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
        testChapterRegex,
        handleUseTavernApiChange,
        handleProviderChange,
        updateModelStatus,
        handleFetchModels,
        handleQuickTest,
        showPromptPreview,
        showQueueSection,
        showProgressSection,
        showResultSection,
        updateProgress,
    };
}

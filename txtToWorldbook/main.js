/**
* TXT转世界书模块
*
* @file txtToWorldbook/main.js
* @version 1.5.0
* @author Novel-Auto-Generator
* @license MIT
*
* @description
* 将TXT小说文件转换为SillyTavern世界书格式
 *
 * @features
 * - 多API支持（酒馆/Gemini/DeepSeek/OpenAI兼容）
 * - 并行处理（独立模式/分批模式）
 * - 断点续传
 * - 历史回滚（Roll历史选择器）
 * - 条目合并与别名合并
 * - 自定义分类配置
 * - 默认世界书条目
 * - 条目配置（位置/深度/顺序/递归）
 * - Token计数缓存优化
 * - 事件委托性能优化
 *
 * @structure
 * - 第一区：配置与常量 (~200行)
 * - 第二区：应用状态 (~100行)
 * - 第三区：工具函数 (~500行) - 含PerfUtils/TokenCache/EventDelegate/Logger/ErrorHandler
 * - 第四区：数据持久层 (~400行)
 * - 第五区：API通信层 (~400行)
 * - 第六区：核心业务逻辑 (~1500行)
 * - 第七区：UI组件层 (~4000行)
 * - 第八区：初始化与导出 (~200行)
 *
 * @example
 * // 基本使用
 * window.TxtToWorldbook.open();
 *
 * // 获取世界书数据
 * const worldbook = window.TxtToWorldbook.getWorldbook();
 *
 * @typedef {Object} MemoryItem
 * @property {string} title - 记忆标题
 * @property {string} content - 记忆内容
 * @property {boolean} processed - 是否已处理
 * @property {boolean} failed - 是否失败
 * @property {boolean} processing - 是否正在处理
 * @property {string} [failedError] - 失败原因
 * @property {Object} [result] - 处理结果
 *
 * @typedef {Object} WorldbookEntry
 * @property {string[]} 关键词 - 关键词数组
 * @property {string} 内容 - 条目内容
 * @property {string} [comment] - 备注信息
 * @property {boolean} [enabled] - 是否启用
 * @property {number} [position] - 位置
 * @property {number} [depth] - 深度
 * @property {boolean} [recursive] - 是否递归
 *
 * @typedef {Object} CategoryConfig
 * @property {string} name - 分类名称
 * @property {string} description - 分类描述
 * @property {string} prompt - 分类提示词
 * @property {boolean} enabled - 是否启用
 * @property {string} color - 显示颜色
 */

import {
    DEFAULT_CHAPTER_REGEX,
    DEFAULT_CATEGORY_LIGHT,
    DEFAULT_PLOT_OUTLINE_CONFIG,
    DEFAULT_PARALLEL_CONFIG,
    DEFAULT_WORLDBOOK_CATEGORIES,
    defaultWorldbookPrompt,
    defaultPlotPrompt,
    defaultStylePrompt,
    defaultMergePrompt,
    defaultConsolidatePrompt,
    defaultSettings
} from './core/constants.js';
import { Logger } from './core/logger.js';
import { estimateTokenCount, naturalSortEntryNames, buildWorldbookSummary } from './core/utils.js';
import { createErrorHandler } from './core/errorHandler.js';
import { Semaphore, PerfUtils, TokenCache } from './core/runtime.js';
import { ModalFactory } from './infra/modalFactory.js';
import { APICaller } from './infra/apiCaller.js';
import { EventDelegate } from './infra/eventDelegate.js';
import { createMergeService } from './services/mergeService.js';
import { createCategoryPersistenceService } from './services/categoryPersistenceService.js';
import { createExportNameService } from './services/exportNameService.js';
import { createMemoryQueueActionsService } from './services/memoryQueueActionsService.js';
import { createProcessingStateService } from './services/processingStateService.js';
import { createRepairService } from './services/repairService.js';
import { createWorldbookRuntimeService } from './services/worldbookRuntimeService.js';
import { createAppContext } from './app/createApp.js';
import { createCoreServices } from './app/createCoreServices.js';
import { createFeatureServicesConfig } from './app/createFeatureServicesConfig.js';
import { createFeaturePlaceholders, createPublicApiConfig, createShellPlaceholders } from './app/createMainBindings.js';
import { createPublicApi } from './app/publicApi.js';
import { createFeatureBindings, createRerollBridge, createShellRuntimeBindings } from './app/createRuntimeBridges.js';
import { createShellRuntimeConfig } from './app/createShellRuntimeConfig.js';
import { createFeatureServices } from './app/createFeatureServices.js';
import { createShellRuntime } from './app/createShellRuntime.js';
import {
    buildAliasCategorySelectModal,
    buildAliasGroupsListHtml,
    buildAliasPairResultsHtml,
    buildAliasMergePlanHtml,
} from './ui/mergeModals.js';
import {
    bindActionEvents as bindActionEventsUI,
    bindCollapsePanelEvents as bindCollapsePanelEventsUI,
    bindExportEvents as bindExportEventsUI,
    bindFileEvents as bindFileEventsUI,
    bindMessageChainEvents as bindMessageChainEventsUI,
    bindModalBasicEvents as bindModalBasicEventsUI,
    bindPromptEvents as bindPromptEventsUI,
    bindSettingEvents as bindSettingEventsUI,
    bindStreamEvents as bindStreamEventsUI,
} from './ui/eventBindings.js';
import {
    createListRenderer,
    escapeHtmlForDisplay,
    escapeAttrForDisplay,
} from './ui/renderer.js';
import {
    buildModalHtml,
} from './ui/settingsPanel.js';
import { createMemoryQueueView } from './ui/memoryQueueView.js';
import { createStartButtonView } from './ui/startButtonView.js';
import { createStopButtonView } from './ui/stopButtonView.js';
import { createUiHelpers } from './ui/createUiHelpers.js';
import { createWorldbookViewRuntime } from './ui/createWorldbookViewRuntime.js';
import { ensureModalStyles } from './ui/modalStyles.js';

(function () {
'use strict';

// ============================================================
// 第一区：配置与常量
// ============================================================
// 第一区：配置与常量
// ============================================================
// - 版本信息
// - 默认配置对象
// - 常量定义
// - Semaphore 类

// ============================================================
// 第二区：应用状态
// ============================================================
// - AppState 统一状态对象
// - 兼容层 getter/setter
// - 运行时状态

// ========== AppState 统一状态对象 ==========
const { AppState, MemoryHistoryDB } = createAppContext({
    defaultCategoryLight: DEFAULT_CATEGORY_LIGHT,
    defaultPlotOutlineConfig: DEFAULT_PLOT_OUTLINE_CONFIG,
    defaultParallelConfig: DEFAULT_PARALLEL_CONFIG,
    defaultChapterRegex: DEFAULT_CHAPTER_REGEX,
    defaultWorldbookCategories: DEFAULT_WORLDBOOK_CATEGORIES,
    defaultSettings,
    Logger,
});

// ============================================================
// 第三区：工具函数
// ============================================================
// - Token 计数
// - 中文数字转换
// - 文件哈希
// - 编码检测
// - JSON 修复

let getEntryTotalTokens = () => 0;

// ============================================================
// 第三区-C：自然排序与中文数字处理
// ============================================================

// naturalSortEntryNames / chineseNumToInt 已抽离到 core/utils.js

// ============================================================
// 第三区-A：性能优化工具
// ============================================================
// - 防抖节流
// - DOM批量更新
// - Token计数缓存
// - 事件委托管理

// ============================================================
// 第三区-A2：错误处理与日志
// ============================================================
// - ErrorHandler: 统一错误处理
// - Logger: 日志系统

// Logger 已抽离到 core/logger.js

// ========== UI常量 ==========
const UI = {
	ICON: {
		SUCCESS: '✅',
		FAILED: '❌',
		PROCESSING: '🔄',
		WARNING: '⚠️',
		INFO: 'ℹ️',
		DELETE: '🗑️',
		EDIT: '✏️',
		SAVE: '💾',
		CANCEL: '❌'
	}
};

// ============================================================
// 第三区-B：工厂模式（模态框、API、列表渲染）
// ============================================================
// - ModalFactory: 统一模态框创建
// - APICaller: 统一API调用封装
// - ListRenderer: 列表渲染工具

// ========== ModalFactory 模态框工厂 ==========
async function confirmAction(message, options = {}) {
    return ModalFactory.confirm({ message, ...options });
}

async function promptAction(config, options = {}) {
    if (typeof config === 'string') {
        return ModalFactory.prompt({ message: config, ...options });
    }
    return ModalFactory.prompt(config || options);
}

async function alertAction(config, options = {}) {
    if (typeof config === 'string') {
        return ModalFactory.alert({ message: config, ...options });
    }
    return ModalFactory.alert(config || options);
}

const ErrorHandler = createErrorHandler({
    Logger,
    ModalFactory,
    confirmAction,
});
const startButtonView = createStartButtonView({
    AppState,
});
const {
    updateStartButtonState,
} = startButtonView;
const stopButtonView = createStopButtonView();
const {
    updateStopButtonVisibility,
} = stopButtonView;
const processingStateService = createProcessingStateService({
    AppState,
});
const {
    setProcessingStatus,
    getProcessingStatus,
} = processingStateService;
const exportNameService = createExportNameService({
    AppState,
});
const {
    getExportBaseName,
} = exportNameService;

let saveCurrentSettings = () => settingsPersistenceService?.saveCurrentSettings();
let loadSavedSettings = () => settingsPersistenceService?.loadSavedSettings();
let _initializeModalState = () => modalLifecycle?.initializeModalState();
let _restoreModalData = () => modalLifecycle?.restoreModalData();
let shellRuntime = null;
let _bindModalEvents = () => modalEventBinder?.bindModalEvents(shellRuntime?.getModalContainer?.());
let closeModal = () => modalController?.closeModal();
let open = () => modalController?.open();
let {
    importMergeService,
    replaceAndCleanService,
    settingsPersistenceService,
    categoryPersistenceService,
    categoryLightService,
    entryConfigService,
    modalLifecycle,
    modalController,
    modalEventBinder,
    fileUtils,
    entryConfigModals,
    handleFileSelect,
    splitContentIntoMemory,
    handleClearFile,
    rechunkMemories,
} = createShellPlaceholders();
// ========== ListRenderer 列表渲染工具 ==========
const ListRenderer = createListRenderer({
    smartUpdate: PerfUtils.smartUpdate,
    tokenCacheGet: (text) => TokenCache.get(text),
    estimateTokenCount,
    uiIcons: UI.ICON,
    getEntryConfig: (category, entryName) => getEntryConfig(category, entryName),
    getCategoryAutoIncrement: (category) => getCategoryAutoIncrement(category),
    getEntryTotalTokens: (entry) => getEntryTotalTokens(entry),
});

const memoryQueueView = createMemoryQueueView({
    AppState,
    ListRenderer,
    ModalFactory,
    PerfUtils,
    ErrorHandler,
    confirmAction,
    deleteMemoryAt: (index) => deleteMemoryAt(index),
    updateStartButtonState: (isProcessing) => updateStartButtonState(isProcessing),
    showRollHistorySelector: (index) => showRollHistorySelector(index),
});
const {
    updateMemoryQueueUI,
    toggleMultiSelectMode,
    showStartFromSelector,
    showMemoryContentModal,
    showProcessedResults,
} = memoryQueueView;
// ============================================================
// 第四区：数据持久层
// ============================================================
// - IndexedDB 封装 (MemoryHistoryDB)
// - LocalStorage 操作
// - 设置保存/加载
// - 自定义分类持久化

// ========== IndexedDB ==========
    categoryPersistenceService = createCategoryPersistenceService({
        AppState,
        MemoryHistoryDB,
        Logger,
        defaultWorldbookCategories: DEFAULT_WORLDBOOK_CATEGORIES,
        extendedCategoryNames: ['剧情大纲', '知识书', '文风配置', '地图环境', '剧情节点'],
    });
    const {
        saveCustomCategories,
        loadCustomCategories,
        resetToDefaultCategories,
        resetSingleCategory,
        getEnabledCategories,
        generateDynamicJsonTemplate,
        getEnabledCategoryNames,
    } = categoryPersistenceService;

    /**
     * isTokenLimitError
     * 
     * @param {*} errorMsg
     * @returns {*}
     */
    function isTokenLimitError(errorMsg) {
        if (!errorMsg) return false;
        const checkStr = String(errorMsg).substring(0, 800);
        const patterns = [
            /prompt is too long/i, /tokens? >\s*\d+\s*maximum/i, /max_prompt_tokens/i,
            /tokens?.*exceeded/i, /context.?length.*exceeded/i, /exceeded.*(?:token|limit|context|maximum)/i,
            /input tokens/i, /context_length/i, /too many tokens/i,
            /token limit/i, /maximum.*tokens/i, /20015.*limit/i, /INVALID_ARGUMENT/i,
            /request too large/i, /payload too large/i, /content.?length.?limit/i,
            /max.?context/i, /model.?(?:maximum|max).?(?:context|length)/i,
            /reduce.?(?:the|your).?(?:prompt|input)/i, /too.?(?:long|large).?(?:for|to)/i,
            /string_above_max_length/i, /over.?(?:the|token).?limit/i,
        ];
        return patterns.some(pattern => pattern.test(checkStr));
    }

    /**
     * updateStreamContent
     * 
     * @param {*} content
     * @param {*} clear
     * @returns {*}
     */
    function updateStreamContent(content, clear = false) {
        if (clear) {
            AppState.processing.streamContent = '';
        } else {
            AppState.processing.streamContent += content;
        }
        const streamEl = document.getElementById('ttw-stream-content');
        if (streamEl) {
            streamEl.textContent = AppState.processing.streamContent;
            streamEl.scrollTop = streamEl.scrollHeight;
        }
    }

    // 【新增】调试模式日志 - 带时间戳输出到实时输出面板
    function debugLog(msg) {
        if (!AppState.settings.debugMode) return;
        const now = new Date();
        const ts = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
        updateStreamContent(`[${ts}] 🔍 ${msg}\n`);
    }
    // ========== 分类灯状态管理 ==========
    function getCategoryLightState(category) {
        if (AppState.config.categoryLight.hasOwnProperty(category)) {
            return AppState.config.categoryLight[category];
        }
        return false;
    }

    /**
     * setCategoryLightState
     * 
     * @param {*} category
     * @param {*} isGreen
     * @returns {*}
     */
    function setCategoryLightState(category, isGreen) {
        AppState.config.categoryLight[category] = isGreen;
        saveCategoryLightSettings();
    }

    /**
     * saveCategoryLightSettings
     * 
     * @returns {*}
     */
    function saveCategoryLightSettings() {
        if (!categoryLightService) return;
        categoryLightService.saveCategoryLightSettings();
    }

    /**
     * loadCategoryLightSettings
     * 
     * @returns {*}
     */
    function loadCategoryLightSettings() {
        if (!categoryLightService) return;
        categoryLightService.loadCategoryLightSettings();
    }

    // ========== 新增：条目位置/深度/顺序配置管理 ==========
    function getEntryConfig(category, entryName) {
        if (entryConfigService) return entryConfigService.getEntryConfig(category, entryName);
        const key = `${category}::${entryName}`;
        if (AppState.config.entryPosition[key]) {
            return AppState.config.entryPosition[key];
        }
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return {
                position: AppState.config.plotOutline.position || 0,
                depth: AppState.config.plotOutline.depth || 4,
                order: AppState.config.plotOutline.order || 100,
                autoIncrementOrder: AppState.config.plotOutline.autoIncrementOrder || false
            };
        }
        // 优先从分类配置获取
        if (AppState.config.categoryDefault[category]) {
            return { ...AppState.config.categoryDefault[category] };
        }
        // 从自定义分类获取默认配置
        const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
        if (catConfig) {
            return {
                position: catConfig.defaultPosition || 0,
                depth: catConfig.defaultDepth || 4,
                order: catConfig.defaultOrder || 100,
                autoIncrementOrder: catConfig.autoIncrementOrder || false
            };
        }
        return { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
    }


    // 新增：获取分类是否自动递增顺序
    // 获取分类是否自动递增顺序
    function getCategoryAutoIncrement(category) {
        if (entryConfigService) return entryConfigService.getCategoryAutoIncrement(category);
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.autoIncrementOrder || false;
        }
        if (AppState.config.categoryDefault[category]?.autoIncrementOrder !== undefined) {
            return AppState.config.categoryDefault[category].autoIncrementOrder;
        }
        const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
        return catConfig?.autoIncrementOrder || false;
    }

    // 获取分类的起始顺序
    function getCategoryBaseOrder(category) {
        if (entryConfigService) return entryConfigService.getCategoryBaseOrder(category);
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.order || 100;
        }
        if (AppState.config.categoryDefault[category]?.order !== undefined) {
            return AppState.config.categoryDefault[category].order;
        }
        const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
        return catConfig?.defaultOrder || 100;
    }



    /**
     * setEntryConfig
     * 
     * @param {*} category
     * @param {*} entryName
     * @param {*} config
     * @returns {*}
     */
    function setEntryConfig(category, entryName, config) {
        if (entryConfigService) {
            entryConfigService.setEntryConfig(category, entryName, config);
            return;
        }
        const key = `${category}::${entryName}`;
        AppState.config.entryPosition[key] = { ...config };
        AppState.settings.entryPositionConfig = AppState.config.entryPosition;
        saveCurrentSettings();
    }

    /**
     * setCategoryDefaultConfig
     * 
     * @param {*} category
     * @param {*} config
     * @returns {*}
     */
    function setCategoryDefaultConfig(category, config) {
        if (entryConfigService) {
            entryConfigService.setCategoryDefaultConfig(category, config);
            return;
        }
        AppState.config.categoryDefault[category] = {
            position: config.position !== undefined ? config.position : 0,
            depth: config.depth !== undefined ? config.depth : 4,
            order: config.order !== undefined ? config.order : 100,
            autoIncrementOrder: config.autoIncrementOrder || false
        };
        AppState.settings.categoryDefaultConfig = AppState.config.categoryDefault;
        saveCurrentSettings();
}


// ============================================================
// 第五区：API通信层
// ============================================================
// - 酒馆 API 调用
// - Gemini API 调用
// - DeepSeek API 调用
// - OpenAI 兼容 API
// - 模型列表获取
// - 连接测试

// ============================================================
// 第六区：核心业务逻辑
// ============================================================
// - 内容分块
// - 记忆处理
// - 世界书生成
// - 条目合并
// - 历史回滚
// - 数据规范化

const coreServices = createCoreServices({
    promptDeps: {
        AppState,
        getEnabledCategories,
        generateDynamicJsonTemplate,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
    },
    parserDeps: {
        AppState,
        debugLog,
        getEnabledCategoryNames,
    },
    apiDeps: {
        AppState,
        Logger,
        APICaller,
        updateStreamContent,
        debugLog,
        messagesToString: (...args) => coreServices.promptService.messagesToString(...args),
        convertToGeminiContents: (...args) => coreServices.promptService.convertToGeminiContents(...args),
        applyMessageChain: (...args) => coreServices.promptService.applyMessageChain(...args),
    },
    worldbookDeps: {
        getIncrementalMode: () => AppState.processing.incrementalMode,
        saveHistory: (...args) => MemoryHistoryDB.saveHistory(...args),
        debugLog,
        _getWorldbook: () => AppState.worldbook.generated,
    },
    tokenMetricsDeps: {
        tokenCacheGet: (text) => TokenCache.get(text),
    },
    exportFormatDeps: {
        AppState,
        naturalSortEntryNames,
        getCategoryLightState,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        getEntryConfig,
    },
    processingDeps: ({ apiService, parserService }) => ({
        AppState,
        MemoryHistoryDB,
        Semaphore,
        updateMemoryQueueUI,
        updateProgress,
        updateStreamContent,
        debugLog,
        callAPI: apiService.callAPI,
        isTokenLimitError,
        parseAIResponse: parserService.parseAIResponse,
        postProcessResultWithChapterIndex,
        mergeWorldbookDataWithHistory,
        getChapterForcePrompt,
        getLanguagePrefix,
        buildSystemPrompt,
        getPreviousMemoryContext,
        getEnabledCategories,
        splitMemoryIntoTwo,
        handleStartNewVolume,
        showProgressSection,
        updateStopButtonVisibility,
        updateVolumeIndicator,
        updateStartButtonState,
        showResultSection,
        updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
        applyDefaultWorldbookEntries,
        ErrorHandler,
        handleRepairMemoryWithSplit,
        setProcessingStatus,
        getProcessingStatus,
        buildWorldbookSummary,
        estimateTokenCount,
        setupAutoSave: () => taskStateService.setupAutoSave(),
        clearAutoSave: () => taskStateService.clearAutoSave(),
        quickDuplicateScan: (wb) => mergeWorkflowService.quickDuplicateScan(wb),
    }),
    rerollDeps: ({ apiService, parserService }) => ({
        AppState,
        MemoryHistoryDB,
        updateStopButtonVisibility,
        updateStreamContent,
        updateMemoryQueueUI,
        processMemoryChunkIndependent,
        mergeWorldbookDataWithHistory,
        updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
        setProcessingStatus,
        getProcessingStatus,
        callAPI: apiService.callAPI,
        parseAIResponse: parserService.parseAIResponse,
        getChapterForcePrompt,
        getLanguagePrefix,
        getPreviousMemoryContext,
        Semaphore,
        updateProgress,
        showProgressSection,
    }),
    rerollModalsDeps: ({ parserService }) => ({
        AppState,
        ModalFactory,
        MemoryHistoryDB,
        ListRenderer,
        Logger,
        ErrorHandler,
        confirmAction,
        parseAIResponse: parserService.parseAIResponse,
        rebuildWorldbookFromMemories: (...args) => rebuildWorldbookFromMemories(...args),
        updateMemoryQueueUI: (...args) => updateMemoryQueueUI(...args),
        findEntrySourceMemories: (...args) => findEntrySourceMemories(...args),
        handleRerollMemory: (...args) => handleRerollMemory(...args),
        handleRerollSingleEntry: (...args) => handleRerollSingleEntry(...args),
        handleStopProcessing: (...args) => handleStopProcessing(...args),
        setProcessingStatus: (...args) => setProcessingStatus(...args),
        getProcessingStatus: (...args) => getProcessingStatus(...args),
        saveCurrentSettings: (...args) => saveCurrentSettings(...args),
        getEntryTotalTokens: (...args) => getEntryTotalTokens(...args),
        updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
    }),
});
const {
    promptService,
    parserService,
    apiService,
    worldbookService,
    tokenMetricsService,
    exportFormatService,
    getProcessingService,
    getRerollService,
    getRerollModals,
} = coreServices;
const {
    getLanguagePrefix,
    messagesToString,
    applyMessageChain,
    convertToGeminiContents,
    buildSystemPrompt,
    getPreviousMemoryContext,
    getChapterForcePrompt,
} = promptService;
const {
    filterResponseContent,
    parseAIResponse,
} = parserService;
const {
    callSillyTavernAPI,
    callCustomAPI,
    handleFetchModelList,
    handleQuickTestModel,
    callAPI,
} = apiService;
const {
    normalizeWorldbookEntry,
    normalizeWorldbookData,
    mergeWorldbookData,
    mergeWorldbookDataIncremental,
    findChangedEntries,
    mergeWorldbookDataWithHistory,
    saveWorldbookSnapshot,
} = worldbookService;
const {
    convertToSillyTavernFormat,
} = exportFormatService;
getEntryTotalTokens = (entry) => tokenMetricsService.getEntryTotalTokens(entry);

const worldbookRuntimeService = createWorldbookRuntimeService({
    AppState,
    Logger,
    updateStreamContent,
    mergeWorldbookDataIncremental,
    setEntryConfig,
    renderVolumeIndicator: ({ currentVolumeIndex, volumeCount }) => {
        const indicator = document.getElementById('ttw-volume-indicator');
        if (!indicator) return;
        indicator.textContent = `当前: 第${currentVolumeIndex + 1}卷 | 已完成: ${volumeCount}卷`;
        indicator.style.display = 'block';
    },
});
const {
    postProcessResultWithChapterIndex,
    updateVolumeIndicator,
    handleStartNewVolume,
    getAllVolumesWorldbook,
    rebuildWorldbookFromMemories,
    applyDefaultWorldbookEntries,
} = worldbookRuntimeService;
const repairService = createRepairService({
    AppState,
    MemoryHistoryDB,
    updateProgress: (...args) => updateProgress(...args),
    updateMemoryQueueUI: (...args) => updateMemoryQueueUI(...args),
    isTokenLimitError,
    getChapterForcePrompt,
    getLanguagePrefix,
    generateDynamicJsonTemplate,
    getPreviousMemoryContext,
    callAPI,
    parseAIResponse,
    postProcessResultWithChapterIndex,
    mergeWorldbookDataWithHistory,
    handleStartNewVolume,
    splitMemoryIntoTwo: (...args) => splitMemoryIntoTwo(...args),
    buildWorldbookSummary,
    estimateTokenCount,
});
const {
    handleRepairSingleMemory,
    handleRepairMemoryWithSplit,
} = repairService;
const memoryQueueActionsService = createMemoryQueueActionsService({
    AppState,
    ErrorHandler,
    confirmAction,
    updateMemoryQueueUI,
    updateStartButtonState,
});
const {
    splitMemoryIntoTwo,
    deleteMemoryAt,
    deleteSelectedMemories,
} = memoryQueueActionsService;

// ========== 并行处理 ==========
/**
 * 处理单个记忆块（独立模式，用于并行处理和重Roll）
 * @param {Object} options - 处理选项
 * @param {number} options.index - 记忆索引
 * @param {number} [options.retryCount=0] - 重试次数
 * @param {string} [options.customPromptSuffix=''] - 自定义提示词后缀
 * @returns {Promise<Object>} 处理结果
 */
async function processMemoryChunkIndependent(options) {
    return getProcessingService().processMemoryChunkIndependent(options);
}

    async function processMemoryChunksParallel(startIndex, endIndex, batchSummary) {
        return getProcessingService().processMemoryChunksParallel(startIndex, endIndex, batchSummary);
    }

// ============================================================
// 第六区：核心业务逻辑
// ============================================================
// - 内容分块
// - 记忆处理
// - 世界书生成
// - 条目合并
// - 历史回滚

/**
 * 处理单个记忆块（串行模式）
 * @param {number} index - 记忆索引
 * @param {number} [retryCount=0] - 重试次数
 * @returns {Promise<void>}
 * @throws {Error} 处理过程中发生错误
 */
async function processMemoryChunk(index, retryCount = 0) {
    return getProcessingService().processMemoryChunk(index, retryCount);
}

function handleStopProcessing() {
    return getProcessingService().handleStopProcessing();
}

    // ========== 主处理流程 ==========
    async function handleStartProcessing() {
        return getProcessingService().handleStartProcessing();
    }

/**
 * startRepairFailedMemories
 * 
 * @returns {Promise<any>}
 */
async function handleRepairFailedMemories() {
    return getProcessingService().handleRepairFailedMemories();
}

const rerollBridge = createRerollBridge({
    getRerollService,
    getRerollModals,
});
const {
    handleRerollMemory,
    findEntrySourceMemories,
    handleRerollSingleEntry,
    showRerollEntryModal,
    showBatchRerollModal,
    showRollHistorySelector,
} = rerollBridge;

// 第七区：UI组件层
// ============================================================
// - 模态框工厂
// - 表单处理
// - 事件绑定
// - UI 更新函数
// - 列表渲染

    // ========== 导入JSON合并世界书 ==========
    async function importAndMergeWorldbook() {
        if (!importMergeService) return;
        return importMergeService.importAndMergeWorldbook();
    }






const {
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
} = createUiHelpers({
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
    alertAction,
    buildSystemPrompt,
    getChapterForcePrompt,
    getEnabledCategories,
    handleFetchModelList,
    handleQuickTestModel,
    defaultWorldbookPrompt,
    defaultPlotPrompt,
    defaultStylePrompt,
});

    // ========== UI ==========
let {
    worldbookView,
    showCleanTagsModal,
    showEntryConfigModal,
    showPlotOutlineConfigModal,
    showCategoryConfigModal,
    handleStartConversion,
    showHistoryView,
    rollbackToHistory,
    showSearchModal,
    showReplaceModal,
    showHelpModal,
    saveTaskState,
    loadTaskState,
    checkAndRestoreState,
    restoreExistingState,
    exportCharacterCard,
    exportToSillyTavern,
    exportVolumes,
    exportSettings,
    importSettings,
    exportChangedEntries,
    showConsolidateCategorySelector,
    showManualMergeUI,
    showAliasMergeUI,
} = createFeaturePlaceholders();

// ============================================================
// 第八区：初始化与导出
// ============================================================
// - 初始化函数
// - 设置加载
// - 导出接口
// - 模态框创建
// - HTML模板构建函数

// ========== createModal 辅助函数：HTML模板构建 ==========
// 模态框HTML构建已迁移至 ui/settingsPanel.js
worldbookView = createWorldbookViewRuntime({
    AppState,
    ListRenderer,
    naturalSortEntryNames,
    escapeHtmlForDisplay,
    escapeAttrForDisplay,
    EventDelegate,
    ModalFactory,
    getCategoryLightState,
    setCategoryLightState,
    getEntryConfig,
    getCategoryAutoIncrement,
    getCategoryBaseOrder,
    getEntryTotalTokens,
    showCategoryConfigModal: (...args) => showCategoryConfigModal(...args),
    showEntryConfigModal: (...args) => showEntryConfigModal(...args),
    showRerollEntryModal: (...args) => showRerollEntryModal(...args),
    getAllVolumesWorldbook,
    showManualMergeUI: (...args) => showManualMergeUI(...args),
    showBatchRerollModal: (...args) => showBatchRerollModal(...args),
});

const {
    entryConfigModals: featureEntryConfigModals,
    replaceAndCleanService: featureReplaceAndCleanService,
    runtimeActionsFacade,
    importMergeService: featureImportMergeService,
    historyView,
    searchModal,
    replaceModal,
    helpModal,
    taskStateService,
    importExportService,
    mergeWorkflowService,
} = createFeatureServices({
    ...createFeatureServicesConfig({
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        ModalFactory,
        confirmAction,
        defaultSettings,
        defaultMergePrompt,
        defaultConsolidatePrompt,
        naturalSortEntryNames,
        EventDelegate,
        PerfUtils,
        estimateTokenCount,
        createMergeService,
        getEntryTotalTokens,
        getAllVolumesWorldbook,
        convertToSillyTavernFormat,
        getExportBaseName,
        saveCurrentSettings,
        saveCustomCategories,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
        rebuildWorldbookFromMemories,
        showQueueSection,
        updateMemoryQueueUI,
        updateVolumeIndicator,
        updateStartButtonState,
        showResultSection,
        worldbookView,
        setProcessingStatus,
        updateProgress,
        updateStreamContent,
        getProcessingStatus,
        showProgressSection,
        Semaphore,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
        filterResponseContent,
        handleStopProcessing,
        handleStartProcessing,
        handleRerollMemory,
        getRerollService,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        buildAliasCategorySelectModal,
        buildAliasGroupsListHtml,
        buildAliasPairResultsHtml,
        buildAliasMergePlanHtml,
        ListRenderer,
        promptAction,
        saveWorldbookSnapshot,
    }),
});
const featureBindings = createFeatureBindings({
    entryConfigModals: featureEntryConfigModals,
    replaceAndCleanService: featureReplaceAndCleanService,
    runtimeActionsFacade,
    importMergeService: featureImportMergeService,
    historyView,
    searchModal,
    replaceModal,
    helpModal,
    taskStateService,
    importExportService,
    mergeWorkflowService,
});
({
    entryConfigModals,
    replaceAndCleanService,
    importMergeService,
    showCleanTagsModal,
    showEntryConfigModal,
    showPlotOutlineConfigModal,
    showCategoryConfigModal,
    handleStartConversion,
    showHistoryView,
    rollbackToHistory,
    showSearchModal,
    showReplaceModal,
    showHelpModal,
    saveTaskState,
    loadTaskState,
    checkAndRestoreState,
    restoreExistingState,
    exportCharacterCard,
    exportToSillyTavern,
    exportVolumes,
    exportSettings,
    importSettings,
    exportChangedEntries,
    showConsolidateCategorySelector,
    showManualMergeUI,
    showAliasMergeUI,
} = featureBindings);

shellRuntime = createShellRuntime(createShellRuntimeConfig({
    AppState,
    MemoryHistoryDB,
    Logger,
    ErrorHandler,
    confirmAction,
    defaultSettings,
    worldbookView,
    updateSettingsUI,
    updateChapterRegexUI,
    handleProviderChange,
    ensureModalStyles,
    bindModalEvents: () => _bindModalEvents(),
    loadSavedSettings: () => loadSavedSettings(),
    loadCategoryLightSettings,
    loadCustomCategories,
    renderCategoriesList,
    renderDefaultWorldbookEntriesUI,
    checkAndRestoreState: (...args) => checkAndRestoreState(...args),
    setProcessingStatus,
    getGlobalSemaphore: () => AppState.globalSemaphore,
    buildModalHtml,
    initializeModalState: () => _initializeModalState(),
    restoreModalData: () => _restoreModalData(),
    restoreExistingState: (...args) => restoreExistingState(...args),
    bindModalBasicEventsUI,
    bindSettingEventsUI,
    bindCollapsePanelEventsUI,
    bindPromptEventsUI,
    bindMessageChainEventsUI,
    bindFileEventsUI,
    bindActionEventsUI,
    bindStreamEventsUI,
    bindExportEventsUI,
    EventDelegate,
    closeModal: (...args) => closeModal(...args),
    showHelpModal: (...args) => showHelpModal(...args),
    saveCurrentSettings: (...args) => saveCurrentSettings(...args),
    handleUseTavernApiChange,
    handleFetchModels,
    handleQuickTest,
    rechunkMemories: (...args) => rechunkMemories(...args),
    showAddCategoryModal,
    resetToDefaultCategories,
    showAddDefaultEntryModal,
    saveDefaultWorldbookEntriesUI,
    applyDefaultWorldbookEntries,
    showResultSection,
    testChapterRegex,
    renderMessageChainUI,
    handleFileSelect: (...args) => handleFileSelect(...args),
    handleClearFile: (...args) => handleClearFile(...args),
    handleStartConversion: (...args) => handleStartConversion(...args),
    handleStopProcessing,
    handleRepairFailedMemories,
    showStartFromSelector,
    showProcessedResults,
    toggleMultiSelectMode,
    deleteSelectedMemories,
    updateMemoryQueueUI,
    showSearchModal: (...args) => showSearchModal(...args),
    showReplaceModal: (...args) => showReplaceModal(...args),
    showHistoryView: (...args) => showHistoryView(...args),
    showConsolidateCategorySelector: (...args) => showConsolidateCategorySelector(...args),
    showCleanTagsModal: (...args) => showCleanTagsModal(...args),
    showAliasMergeUI: (...args) => showAliasMergeUI(...args),
    updateStreamContent,
    showPromptPreview: (...args) => showPromptPreview(...args),
    showPlotOutlineConfigModal: (...args) => showPlotOutlineConfigModal(...args),
    importAndMergeWorldbook,
    loadTaskState: (...args) => loadTaskState(...args),
    saveTaskState: (...args) => saveTaskState(...args),
    exportSettings: (...args) => exportSettings(...args),
    importSettings: (...args) => importSettings(...args),
    exportCharacterCard: (...args) => exportCharacterCard(...args),
    exportVolumes: (...args) => exportVolumes(...args),
    exportToSillyTavern: (...args) => exportToSillyTavern(...args),
    exportChangedEntries: (...args) => exportChangedEntries(...args),
    showMemoryContentModal,
    updateStartButtonState,
    showQueueSection,
    showProgressSection,
    onEntryConfigChanged: (...args) => saveCurrentSettings(...args),
    onHashFallback: () => Logger.warn('Hash', 'Crypto API 失败，回退到简易哈希'),
}));
const shellRuntimeBindings = createShellRuntimeBindings(shellRuntime);
({
    fileUtils,
    settingsPersistenceService,
    categoryLightService,
    entryConfigService,
    modalLifecycle,
    modalController,
    modalEventBinder,
    handleFileSelect,
    splitContentIntoMemory,
    handleClearFile,
    rechunkMemories,
} = shellRuntimeBindings);
saveCurrentSettings = shellRuntimeBindings.saveCurrentSettings;
loadSavedSettings = shellRuntimeBindings.loadSavedSettings;
_initializeModalState = shellRuntimeBindings.initializeModalState;
_restoreModalData = shellRuntimeBindings.restoreModalData;
_bindModalEvents = shellRuntimeBindings.bindModalEvents;
closeModal = shellRuntimeBindings.closeModal;
open = shellRuntimeBindings.open;

    // ========== 公开 API ==========
    window.TxtToWorldbook = createPublicApi(createPublicApiConfig({
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
    }));

	Logger.info('Module', '📚 TxtToWorldbook 已加载');
	Logger.info('Module', '架构重构: AppState统一状态 | Logger日志系统 | EventDelegate事件委托 | ModalFactory模态框工厂');
	Logger.info('Module', '性能优化: TokenCache缓存 | PerfUtils防抖节流 | DOM批量更新');
	Logger.info('Module', '代码质量: ErrorHandler统一错误处理 | JSDoc完整文档 | 函数命名规范化');
})();



let __txtToWorldbookInitPromise = null;

export async function initTxtToWorldbookBridge() {
    if (!__txtToWorldbookInitPromise) {
        __txtToWorldbookInitPromise = Promise.resolve({
            loadedFrom: 'txtToWorldbook/main.js',
            api: getTxtToWorldbookApi(),
        });
    }
    return __txtToWorldbookInitPromise;
}

export function getTxtToWorldbookApi() {
    if (typeof window === 'undefined') return null;
    return window.TxtToWorldbook || null;
}

export default {
    initTxtToWorldbookBridge,
    getTxtToWorldbookApi,
};








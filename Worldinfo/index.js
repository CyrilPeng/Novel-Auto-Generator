/**
 * Worldinfo 模块统一入口
 * 整合所有子模块，提供统一的 API
 * 
 * 功能：
 * - TXT 转世界书
 * - EPUB 转 TXT
 * - 世界书导出
 */

// 服务层
export { WorldbookService, worldbookService, APIService, apiService, APIServiceConfig } from './services/index.js';

// 应用
export { WorldinfoApp, createWorldinfoApp } from './app.js';
export { initWorldinfo, openWorldinfo, closeWorldinfo, getWorldinfoApp, destroyWorldinfo } from './main.js';

// 全局暴露 - 只在浏览器环境中
if (typeof window !== 'undefined' && !window.WorldinfoModule) {
    window.WorldinfoModule = {
        init: initWorldinfo,
        open: openWorldinfo,
        close: closeWorldinfo,
        getApp: getWorldinfoApp,
        destroy: destroyWorldinfo,
        version: '3.0.0'
    };
}

// 核心模块
export {
    Config,
    config,
    ConfigKeys,
    LogLevel,
    DefaultConfig,
    State,
    WorldbookProcessor,
    ParallelProcessor,
    ParallelConfig,
    TaskStatus,
    VolumeManager,
    Volume,
    VolumeConfig
} from './core/index.js';

// 数据库模块
export {
    Database,
    db,
    HistoryStore,
    StateStore,
    RollStore,
    FileMetaStore
} from './db/index.js';

// API 模块
export {
    BaseAPI,
    TavernAPI,
    GeminiAPI,
    DeepSeekAPI,
    OpenAICompat,
    APIManager
} from './api/index.js';

// 解析器模块
export {
    ContentSplitter,
    ChapterDetector,
    EpubParser,
    TxtParser
} from './parsers/index.js';

// 生成器模块
export {
    PromptBuilder,
    CategoryManager,
    EntryManager,
    parseAIResponse,
    filterResponseTags,
    isTokenLimitError,
    extractWorldbookData,
    validateWorldbookEntry
} from './generators/index.js';

// 导出器模块
export {
    BaseExporter,
    TavernExporter,
    JSONExporter,
    TXTExporter
} from './exporters/index.js';

// UI 模块
export {
    Modal,
    Button,
    ButtonConfig,
    ProgressBar,
    ProgressBarConfig,
    Card,
    CardConfig,
    Toast,
    ToastConfig,
    ToastManager,
    toastManager,
    showToast,
    showSuccess,
    showWarning,
    showError,
    showInfo,
    UIManager,
    UIManagerConfig,
    uiManager,
    createUIManager
} from './ui/index.js';

// 工具函数
export {
    // 文件操作
    downloadFile,
    downloadJSON,
    readFileAsText,
    readFileAsArrayBuffer,
    detectFileEncoding,
    getFileExtension,
    formatFileSize,
    validateFile,
    selectFile,
    
    // HTML 处理
    htmlToText,
    escapeHtml,
    unescapeHtml,
    stripHtml,
    
    // Token 估算
    estimateTokenCount,
    getEntryTotalTokens,
    getCategoryTotalTokens,
    getWorldbookTotalTokens,
    checkTokenLimit,
    truncateToTokenLimit,
    
    // 排序
    naturalSortCompare,
    naturalSort,
    chineseNumToInt,
    sortBy,
    
    // 哈希
    calculateHash,
    calculateSimpleHash,
    compareHash,
    generateId,
    shortenHash,
    
    // 正则
    DEFAULT_CHAPTER_REGEX,
    CHAPTER_REGEX_PRESETS,
    detectChapters,
    splitByChapters,
    splitBySize,
    testRegex,
    escapeRegex,
    
    // 通用工具
    sleep,
    formatDateTime,
    formatDuration,
    debounce,
    throttle,
    deepClone
} from './utils/index.js';

// ============================================================
// 全局 API
// ============================================================

/**
 * Worldinfo 模块主类
 */
class WorldinfoModule {
    constructor() {
        this.version = '3.0.0';
        this.isInitialized = false;
        this.processor = null;
        this.uiManager = null;
    }

    /**
     * 初始化模块
     */
    init() {
        if (this.isInitialized) return this;

        this.uiManager = new UIManager({ debugMode: false });
        this.processor = new WorldbookProcessor();
        
        this.isInitialized = true;
        console.log('[Worldinfo] 模块初始化完成 v' + this.version);
        return this;
    }

    /**
     * 打开主界面
     */
    open() {
        if (!this.isInitialized) this.init();
        this.uiManager?.emit('ui.open');
        return this;
    }

    /**
     * 关闭界面
     */
    close() {
        this.uiManager?.emit('ui.close');
        return this;
    }

    /**
     * 获取处理器实例
     * @returns {WorldbookProcessor} 处理器
     */
    getProcessor() {
        if (!this.processor) this.init();
        return this.processor;
    }

    /**
     * 获取 UI 管理器
     * @returns {UIManager} UI 管理器
     */
    getUIManager() {
        if (!this.uiManager) this.init();
        return this.uiManager;
    }

    /**
     * 销毁模块
     */
    destroy() {
        this.processor?.destroy?.();
        this.uiManager?.destroy();
        this.isInitialized = false;
    }
}

// 创建全局实例
export const worldinfo = new WorldinfoModule();

// 全局暴露
if (typeof window !== 'undefined') {
    window.WorldinfoModule = worldinfo;
    window.Worldinfo = worldinfo;
}

/**
 * 快速创建 Worldinfo 实例
 * @param {Object} options - 配置选项
 * @returns {WorldinfoModule} Worldinfo 实例
 */
export function createWorldinfo(options = {}) {
    const module = new WorldinfoModule();
    if (options.autoInit !== false) {
        module.init();
    }
    return module;
}

console.log('[Worldinfo] 模块已加载 v' + worldinfo.version);

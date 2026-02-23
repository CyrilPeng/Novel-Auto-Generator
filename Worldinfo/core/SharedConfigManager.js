/**
 * 共享配置管理器
 * 为 Novel Auto Generator 主插件和 Worldinfo 模块提供统一的配置存储
 */

const STORAGE_KEY = 'novel-auto-generator-settings';

/**
 * 默认配置
 */
const DEFAULT_SETTINGS = {
    // ========== Worldinfo 模块配置 ==========
    worldinfo: {
        // 分块设置
        chunkSize: 15000,
        useVolumeMode: false,
        chapterRegexPattern: '第 [零一二三四五六七八九十百千万 0-9]+[章回卷节部篇]',
        useCustomChapterRegex: false,
        forceChapterMarker: true,

        // API 设置
        useTavernApi: true,
        customApiProvider: 'gemini',
        customApiKey: '',
        customApiEndpoint: '',
        customApiModel: 'gemini-2.5-flash',
        apiTimeout: 120000,

        // 并行处理设置
        parallelEnabled: true,
        parallelConcurrency: 3,
        parallelMode: 'independent',

        // 世界书生成设置
        enablePlotOutline: false,
        enableLiteraryStyle: false,
        language: 'zh',

        // 自定义提示词
        customWorldbookPrompt: '',
        customPlotPrompt: '',
        customStylePrompt: '',
        customMergePrompt: '',
        customRerollPrompt: '',
        customSuffixPrompt: '',

        // 整理条目设置
        consolidatePromptPresets: [],
        consolidateCategoryPresetMap: {},

        // 默认世界书条目
        defaultWorldbookEntries: '',
        defaultWorldbookEntriesUI: [],

        // 分类灯状态
        categoryLightSettings: null,

        // 条目位置/深度/顺序配置
        entryPositionConfig: {},
        categoryDefaultConfig: {},
        plotOutlineExportConfig: {
            position: 0,
            depth: 4,
            order: 100,
            autoIncrementOrder: true
        },

        // 响应过滤设置
        filterResponseTags: 'thinking,/think',
        allowRecursion: false,
        debugMode: false
    },

    // ========== 主插件配置 ==========
    totalChapters: 1000,
    currentChapter: 0,
    prompt: "继续推进剧情，保证剧情流畅自然，注意人物性格一致性",
    isRunning: false,
    isPaused: false,

    // 发送检测设置
    enableSendToastDetection: true,
    sendToastWaitTimeout: 60000,
    sendPostToastWaitTime: 1000,

    // 回复等待设置
    replyWaitTime: 5000,
    stabilityCheckInterval: 1000,
    stabilityRequiredCount: 3,
    enableReplyToastDetection: true,
    replyToastWaitTimeout: 300000,
    replyPostToastWaitTime: 2000,

    // 生成设置
    autoSaveInterval: 50,
    maxRetries: 3,
    minChapterLength: 100,

    // 导出设置
    exportAll: true,
    exportStartFloor: 0,
    exportEndFloor: 99999,
    exportIncludeUser: false,
    exportIncludeAI: true,
    useRawContent: true,
    extractTags: '',
    extractMode: 'all',
    tagSeparator: '\n\n',

    // 面板折叠状态
    panelCollapsed: {
        generate: false,
        export: false,
        extract: true,
        advanced: true,
    }
};

/**
 * 配置管理器类
 */
export class SharedConfigManager {
    constructor() {
        this.settings = null;
        this.listeners = new Map();
    }

    /**
     * 初始化配置
     */
    init() {
        this.load();
        console.log('[SharedConfig] 配置管理器已初始化');
        return this;
    }

    /**
     * 从 localStorage 加载配置
     */
    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.settings = this.mergeDefaults(parsed);
                console.log('[SharedConfig] 配置已加载');
            } else {
                this.settings = { ...DEFAULT_SETTINGS };
                console.log('[SharedConfig] 使用默认配置');
            }
        } catch (error) {
            console.error('[SharedConfig] 加载配置失败:', error);
            this.settings = { ...DEFAULT_SETTINGS };
        }
        return this.settings;
    }

    /**
     * 保存配置到 localStorage
     */
    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
            this.notifyListeners('save', this.settings);
            console.log('[SharedConfig] 配置已保存');
        } catch (error) {
            console.error('[SharedConfig] 保存配置失败:', error);
        }
    }

    /**
     * 获取配置
     * @param {string} key - 配置键
     * @param {any} defaultValue - 默认值
     * @returns {any} 配置值
     */
    get(key, defaultValue = undefined) {
        if (!this.settings) {
            this.load();
        }

        // 支持点号访问嵌套属性
        const keys = key.split('.');
        let value = this.settings;
        for (const k of keys) {
            if (value && k in value) {
                value = value[k];
            } else {
                return defaultValue !== undefined ? defaultValue : this.getNestedDefault(key);
            }
        }
        return value;
    }

    /**
     * 设置配置
     * @param {string} key - 配置键
     * @param {any} value - 配置值
     */
    set(key, value) {
        if (!this.settings) {
            this.load();
        }

        const keys = key.split('.');
        let obj = this.settings;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in obj)) {
                obj[k] = {};
            }
            obj = obj[k];
        }
        obj[keys[keys.length - 1]] = value;
        this.save();
        this.notifyListeners('set', { key, value });
    }

    /**
     * 批量设置配置
     * @param {Object} values - 配置键值对
     */
    setMultiple(values) {
        if (!this.settings) {
            this.load();
        }

        for (const [key, value] of Object.entries(values)) {
            this.set(key, value);
        }
    }

    /**
     * 获取默认配置
     * @returns {Object} 默认配置对象
     */
    getDefaults() {
        return { ...DEFAULT_SETTINGS };
    }

    /**
     * 重置为默认配置
     */
    reset() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.save();
        this.notifyListeners('reset', this.settings);
        console.log('[SharedConfig] 配置已重置为默认');
    }

    /**
     * 导出配置
     * @returns {Object} 配置对象
     */
    export() {
        return JSON.parse(JSON.stringify(this.settings));
    }

    /**
     * 导入配置
     * @param {Object} data - 配置数据
     */
    import(data) {
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.error('[SharedConfig] 导入配置失败:', e.message);
                return;
            }
        }
        this.settings = this.mergeDefaults(data);
        this.save();
        this.notifyListeners('import', this.settings);
        console.log('[SharedConfig] 配置已导入');
    }

    /**
     * 添加配置变更监听器
     * @param {string} event - 事件类型：save|set|reset|import
     * @param {Function} callback - 回调函数
     */
    addListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * 移除配置变更监听器
     * @param {string} event - 事件类型
     * @param {Function} callback - 回调函数
     */
    removeListener(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 通知监听器
     * @param {string} event - 事件类型
     * @param {any} data - 事件数据
     */
    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('[SharedConfig] 监听器回调错误:', error);
                }
            });
        }
    }

    /**
     * 合并默认配置
     * @param {Object} custom - 自定义配置
     * @returns {Object} 合并后的配置
     */
    mergeDefaults(custom) {
        const merged = { ...DEFAULT_SETTINGS };

        // 递归合并对象
        const merge = (target, source) => {
            for (const key in source) {
                if (key in source) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        if (!target[key]) {
                            target[key] = {};
                        }
                        merge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
        };

        merge(merged, custom);
        return merged;
    }

    /**
     * 获取嵌套默认值
     * @param {string} key - 点号分隔的键
     * @returns {any} 默认值
     */
    getNestedDefault(key) {
        const keys = key.split('.');
        let value = DEFAULT_SETTINGS;
        for (const k of keys) {
            if (value && k in value) {
                value = value[k];
            } else {
                return undefined;
            }
        }
        return value;
    }
}

// 创建全局单例
export const sharedConfigManager = new SharedConfigManager();

// 便捷函数
export function initSharedConfig() {
    return sharedConfigManager.init();
}

export function getSharedConfig(key, defaultValue) {
    return sharedConfigManager.get(key, defaultValue);
}

export function setSharedConfig(key, value) {
    sharedConfigManager.set(key, value);
}

export function saveSharedConfig() {
    sharedConfigManager.save();
}

export function loadSharedConfig() {
    return sharedConfigManager.load();
}

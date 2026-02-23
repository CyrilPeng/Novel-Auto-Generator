/**
 * 配置管理类
 * 管理所有世界书处理相关的配置
 * 与主插件共享存储
 */
import { sharedConfigManager } from './SharedConfigManager.js';

// 配置键常量
export const ConfigKeys = {
    // 调试相关
    DEBUG_MODE: 'debugMode',
    DEBUG_LOG_LEVEL: 'debugLogLevel',
    
    // API相关
    API_URL: 'apiUrl',
    API_KEY: 'apiKey',
    API_TYPE: 'apiType',
    MODEL_NAME: 'modelName',
    CUSTOM_MODEL: 'customModel',
    
    // 文本处理相关
    MAX_DEPTH: 'maxDepth',
    CHUNK_SIZE: 'chunkSize',
    CHUNK_OVERLAP: 'chunkOverlap',
    
    // UI相关
    SHOW_ADVANCED_OPTIONS: 'showAdvancedOptions',
    AUTO_SCROLL: 'autoScroll',
    
    // 世界书生成相关
    DEFAULT_GROUP_NAME: 'defaultGroupName',
    MAX_ENTRIES_PER_GROUP: 'maxEntriesPerGroup',
    AUTO_CREATE_GROUPS: 'autoCreateGroups',
};

// 日志级别常量
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

// 默认配置
export const DefaultConfig = {
    [ConfigKeys.DEBUG_MODE]: false,
    [ConfigKeys.DEBUG_LOG_LEVEL]: LogLevel.INFO,
    [ConfigKeys.MAX_DEPTH]: 3,
    [ConfigKeys.CHUNK_SIZE]: 2000,
    [ConfigKeys.CHUNK_OVERLAP]: 200,
    [ConfigKeys.SHOW_ADVANCED_OPTIONS]: false,
    [ConfigKeys.AUTO_SCROLL]: true,
    [ConfigKeys.DEFAULT_GROUP_NAME]: '自动生成',
    [ConfigKeys.MAX_ENTRIES_PER_GROUP]: 100,
    [ConfigKeys.AUTO_CREATE_GROUPS]: true,
};

export class Config {
    constructor() {
        this.sharedManager = sharedConfigManager;
        // 初始化时确保共享配置已加载
        if (!this.sharedManager.settings) {
            this.sharedManager.load();
        }
    }

    /**
     * 从共享存储加载配置
     * @returns {Object} 配置对象
     */
    load() {
        return this.sharedManager.load();
    }

    /**
     * 保存配置到共享存储
     */
    save() {
        this.sharedManager.save();
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键
     * @param {any} defaultValue - 默认值
     * @returns {any} 配置值
     */
    get(key, defaultValue = undefined) {
        return this.sharedManager.get(key, defaultValue);
    }

    /**
     * 设置配置项
     * @param {string} key - 配置键
     * @param {any} value - 配置值
     */
    set(key, value) {
        this.sharedManager.set(key, value);
    }

    /**
     * 批量设置配置
     * @param {Object} values - 配置键值对
     */
    setMultiple(values) {
        this.sharedManager.setMultiple(values);
    }

    /**
     * 重置为默认配置
     */
    reset() {
        this.sharedManager.reset();
    }

    /**
     * 导出配置
     * @returns {Object} 配置对象
     */
    export() {
        return this.sharedManager.export();
    }

    /**
     * 导入配置
     * @param {Object} data - 配置数据
     */
    import(data) {
        this.sharedManager.import(data);
    }

    /**
     * 添加配置变更监听器
     * @param {string} event - 事件类型：save|set|reset|import
     * @param {Function} callback - 回调函数
     */
    addListener(event, callback) {
        this.sharedManager.addListener(event, callback);
    }

    /**
     * 移除配置变更监听器
     * @param {string} event - 事件类型
     * @param {Function} callback - 回调函数
     */
    removeListener(event, callback) {
        this.sharedManager.removeListener(event, callback);
    }
}

// 导出单例
export const config = new Config();

/**
 * 日志管理器
 * 统一控制调试日志输出，支持调试开关和日志级别
 */

/**
 * 日志级别常量
 */
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

/**
 * 日志级别名称映射
 */
const LogLevelNames = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.NONE]: 'NONE'
};

class Logger {
    constructor() {
        this.enabled = false;
        this.level = LogLevel.INFO;
        this.prefix = '[Worldinfo]';
        
        // 向后兼容
        this.debugEnabled = false;
    }

    /**
     * 设置日志级别
     * @param {number} level - 日志级别 (0-4)
     */
    setLevel(level) {
        if (level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
            this.level = level;
            if (this.enabled) {
                console.log(`${this.prefix} 日志级别已设置为 ${LogLevelNames[level]}`);
            }
        }
    }

    /**
     * 获取当前日志级别
     * @returns {number}
     */
    getLevel() {
        return this.level;
    }

    /**
     * 设置调试开关
     * @param {boolean} enabled - 是否启用
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        // 向后兼容
        this.debugEnabled = enabled;
        if (enabled) {
            console.log(`${this.prefix} 日志系统已启用，当前级别: ${LogLevelNames[this.level]}`);
        }
    }

    /**
     * 获取调试开关状态
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * 设置调试开关（向后兼容）
     * @param {boolean} enabled - 是否启用调试
     */
    setDebugEnabled(enabled) {
        this.setEnabled(enabled);
    }

    /**
     * 获取调试开关状态（向后兼容）
     * @returns {boolean}
     */
    isDebugEnabled() {
        return this.isEnabled();
    }

    /**
     * 检查是否应该输出指定级别的日志
     * @param {number} level - 日志级别
     * @returns {boolean}
     */
    shouldLog(level) {
        return this.enabled && level >= this.level;
    }

    /**
     * 格式化日志消息
     * @param {number} level - 日志级别
     * @param {Array} args - 日志参数
     * @returns {Array}
     */
    formatMessage(level, args) {
        const timestamp = new Date().toISOString();
        const levelName = LogLevelNames[level] || 'UNKNOWN';
        return [`[${timestamp}] [${levelName}] ${this.prefix}`, ...args];
    }

    /**
     * 调试日志
     * @param {...any} args
     */
    debug(...args) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(...this.formatMessage(LogLevel.DEBUG, args));
        }
    }

    /**
     * 信息日志
     * @param {...any} args
     */
    info(...args) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(...this.formatMessage(LogLevel.INFO, args));
        }
    }

    /**
     * 警告日志
     * @param {...any} args
     */
    warn(...args) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(...this.formatMessage(LogLevel.WARN, args));
        }
    }

    /**
     * 错误日志
     * @param {...any} args
     */
    error(...args) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(...this.formatMessage(LogLevel.ERROR, args));
        }
    }

    /**
     * 分组输出（仅在调试模式开启时）
     * @param {string} label
     */
    group(label) {
        if (this.enabled) {
            console.group(`${this.prefix} ${label}`);
        }
    }

    /**
     * 结束分组
     */
    groupEnd() {
        if (this.enabled) {
            console.groupEnd();
        }
    }

    /**
     * 表格输出（仅在调试模式开启时）
     * @param {any} data
     * @param {string[]} columns
     */
    table(data, columns) {
        if (this.enabled) {
            console.table(data, columns);
        }
    }

    /**
     * 计时开始
     * @param {string} label
     */
    time(label) {
        console.time(`${this.prefix} ${label}`);
    }

    /**
     * 计时结束
     * @param {string} label
     */
    timeEnd(label) {
        console.timeEnd(`${this.prefix} ${label}`);
    }
}

// 创建单例实例
export const logger = new Logger();

// 便捷导出
export const { 
    setLevel,
    getLevel,
    setEnabled,
    isEnabled,
    setDebugEnabled, 
    isDebugEnabled, 
    debug, 
    info, 
    warn, 
    error 
} = logger;

export default logger;

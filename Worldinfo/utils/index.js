/**
 * 工具函数统一入口
 * 导出所有工具模块的函数
 */

// 文件操作
export {
    downloadFile,
    downloadJSON,
    readFileAsText,
    readFileAsArrayBuffer,
    readFileAsDataURL,
    detectFileEncoding,
    getFileExtension,
    getFileNameWithoutExtension,
    formatFileSize,
    validateFile,
    selectFile
} from './file.js';

// HTML 处理
export {
    htmlToText,
    escapeHtml,
    unescapeHtml,
    stripHtml
} from './html.js';

// Token 估算
export {
    estimateTokenCount,
    getEntryTotalTokens,
    getCategoryTotalTokens,
    getWorldbookTotalTokens,
    checkTokenLimit,
    truncateToTokenLimit
} from './token.js';

// 排序算法
export {
    naturalSortCompare,
    naturalSort,
    chineseNumToInt,
    sortBy
} from './sort.js';

// 哈希计算
export {
    calculateHash,
    calculateFileHash,
    calculateSimpleHash,
    compareHash,
    generateId,
    shortenHash
} from './hash.js';

// 正则表达式
export {
    DEFAULT_CHAPTER_REGEX,
    CHAPTER_REGEX_PRESETS,
    detectChapters,
    splitByChapters,
    splitBySize,
    testRegex,
    escapeRegex
} from './regex.js';

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化日期时间
 * @param {Date|number} date - 日期对象或时间戳
 * @param {string} format - 格式字符串
 * @returns {string} 格式化后的日期时间
 */
export function formatDateTime(date = new Date(), format = 'YYYY-MM-DD HH:mm:ss') {
    const d = date instanceof Date ? date : new Date(date);
    const pad = (n) => n.toString().padStart(2, '0');

    return format
        .replace('YYYY', d.getFullYear())
        .replace('MM', pad(d.getMonth() + 1))
        .replace('DD', pad(d.getDate()))
        .replace('HH', pad(d.getHours()))
        .replace('mm', pad(d.getMinutes()))
        .replace('ss', pad(d.getSeconds()));
}

/**
 * 格式化时长
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化后的时长 (HH:MM:SS)
 */
export function formatDuration(ms) {
    if (!ms || ms < 0) return '--:--:--';
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * 防抖函数
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟毫秒数
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * 节流函数
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔毫秒数
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, interval = 300) {
    let lastTime = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastTime >= interval) {
            lastTime = now;
            fn.apply(this, args);
        }
    };
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// 调试日志
export {
    DebugLogger,
    debugLogger,
    enableDebug,
    disableDebug,
    debugLog
} from './DebugLogger.js';

// 任务管理
export {
    TaskData,
    TaskExporter,
    TaskImporter,
    TaskManager,
    taskManager
} from './TaskManager.js';

// 错误处理
export {
    ErrorType,
    AppError,
    ErrorHandler,
    errorHandler,
    withErrorHandling,
    withErrorHandlingSync
} from './ErrorHandler.js';

// HTTP 客户端
export {
    HttpClient,
    httpClient,
    httpGet,
    httpPost,
    httpPut,
    httpDelete
} from './HttpClient.js';

// API 密钥管理
export {
    CryptoUtils,
    ApiKeyManager,
    apiKeyManager
} from './ApiKeyManager.js';

// 日志管理器
export {
    Logger,
    logger,
    LogLevel,
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
} from './Logger.js';

// 文件流式读取
export {
    StreamReaderConfig,
    FileReaderStream,
    detectFileEncodingStream,
    readFileStream,
    readFileStreamMerged,
    processFileStream,
    isFileTooLarge
    // formatFileSize 已在 file.js 中导出，避免重复
} from './FileStream.js';

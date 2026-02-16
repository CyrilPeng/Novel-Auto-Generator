/**
 * 工具函数统一入口
 * 导出所有工具模块的函数
 */

// 文件操作
export { 
    downloadFile, 
    readFileAsText, 
    readFileAsArrayBuffer, 
    detectFileEncoding, 
    calculateFileHash,
    parseFilenameToTitle 
} from './file.js';

// HTML处理
export { 
    htmlToText, 
    escapeHtml, 
    unescapeHtml, 
    stripHtml 
} from './html.js';

// Token估算
export { 
    estimateTokenCount, 
    getEntryTokenCount, 
    getEntriesTotalTokenCount,
    formatTokenCount 
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
    calculateSHA256, 
    calculateSimpleHash, 
    calculateFileHash, 
    quickHash 
} from './hash.js';

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
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
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

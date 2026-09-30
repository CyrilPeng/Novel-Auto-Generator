/**
 * 国际化 (i18n) 基础设施
 *
 * 零依赖的简易国际化方案：
 * - 基于点分隔键查找：`t('errors.network')`
 * - 参数插值：`t('greeting', { name: 'X' })` → 'Hello X'
 * - 默认回落到 zh-CN（现有用户体验不受影响）
 * - 自动检测浏览器语言（navigator.language）
 * - 支持运行时切换，订阅者实时接收变更
 *
 * 用法：
 *   import { t, setLocale, getLocale, onLocaleChange } from '../core/i18n.js';
 *   t('common.confirm');                       // '确认'
 *   t('progress.completed', { count: 5 });     // '已完成 5 个'
 */

import zhCN from '../locales/zh-CN.js';
import enUS from '../locales/en-US.js';

const LOCALES = {
    'zh-CN': zhCN,
    zh: zhCN,
    'en-US': enUS,
    en: enUS,
};

let _currentLocale = 'zh-CN';
let _messages = zhCN;
const _listeners = new Set();

/**
 * 解析嵌套对象中的键（支持点分隔符）
 * @param {Object} obj
 * @param {string} path
 * @returns {string|undefined}
 */
function deepGet(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return typeof cur === 'string' ? cur : undefined;
}

/**
 * 翻译函数
 * @param {string} key - 点分隔键，如 'common.confirm'
 * @param {Object} [params] - 插值参数
 * @returns {string}
 */
export function t(key, params) {
    let text = deepGet(_messages, key);
    // 回落到中文默认
    if (text === undefined && _messages !== zhCN) {
        text = deepGet(zhCN, key);
    }
    // 仍找不到就返回 key（明显提示缺失）
    if (text === undefined) return key;

    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/**
 * 当前语言代码
 * @returns {string}
 */
export function getLocale() {
    return _currentLocale;
}

/**
 * 设置语言
 * @param {string} locale - 例如 'en-US', 'zh-CN'
 */
export function setLocale(locale) {
    const resolved = LOCALES[locale] ? locale : locale.split('-')[0];
    if (!LOCALES[resolved]) {
        // 未知语言，保持中文
        return;
    }
    _currentLocale = resolved;
    _messages = LOCALES[resolved];
    for (const listener of _listeners) {
        try {
            listener(_currentLocale);
        } catch {}
    }
}

/**
 * 订阅语言变更
 * @param {Function} fn - 回调 (locale) => void
 * @returns {Function} 取消订阅函数
 */
export function onLocaleChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

/**
 * 从浏览器语言自动检测并设置
 */
export function detectFromBrowser() {
    if (typeof navigator === 'undefined' || !navigator.language) return;
    const lang = navigator.language;
    setLocale(lang);
}

/**
 * 列出可用的语言
 * @returns {string[]}
 */
export function getAvailableLocales() {
    return Object.keys(LOCALES).filter((k) => !k.includes('-') || k === 'zh-CN' || k === 'en-US');
}

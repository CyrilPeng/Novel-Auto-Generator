/**
 * 哈希工具
 * 提供文件哈希计算功能
 */

/**
 * 计算字符串的 SHA-256 哈希
 * 使用浏览器 Crypto API
 * 
 * @param {string} content - 字符串内容
 * @returns {Promise<string>} 哈希值（16 进制）
 */
export async function calculateHash(content) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('[哈希工具] Crypto API 失败，回退到简易哈希');
        }
    }
    
    // 回退到简易哈希
    return calculateSimpleHash(content);
}

/**
 * 计算文件的 SHA-256 哈希
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 哈希值
 */
export async function calculateFileHash(file) {
    const content = await readFileAsText(file);
    return calculateHash(content);
}

/**
 * 简易哈希算法（非加密级别，仅用于文件比对）
 * @param {string} content - 字符串内容
 * @returns {string} 哈希值
 */
export function calculateSimpleHash(content) {
    if (!content) return 'hash-empty';
    
    // 采样：取开头、中间、末尾各 1000 字符
    const len = content.length;
    const sample = len < 100000 
        ? content 
        : content.slice(0, 1000) + 
          content.slice(Math.floor(len / 2), Math.floor(len / 2) + 1000) + 
          content.slice(-1000);
    
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
        hash = ((hash << 5) - hash) + sample.charCodeAt(i);
        hash = hash & hash; // 转换为 32 位整数
    }
    
    return 'simple-' + Math.abs(hash).toString(16) + '-' + len;
}

/**
 * 比较两个哈希值
 * @param {string} hash1 - 哈希值 1
 * @param {string} hash2 - 哈希值 2
 * @returns {boolean} 是否相同
 */
export function compareHash(hash1, hash2) {
    if (!hash1 || !hash2) return false;
    return hash1 === hash2;
}

/**
 * 生成唯一 ID
 * @returns {string} 唯一 ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 生成短哈希（用于显示）
 * @param {string} hash - 完整哈希
 * @param {number} length - 显示长度
 * @returns {string} 短哈希
 */
export function shortenHash(hash, length = 8) {
    if (!hash || hash.length <= length) return hash;
    return hash.slice(0, length);
}

// 导入依赖
import { readFileAsText } from './file.js';

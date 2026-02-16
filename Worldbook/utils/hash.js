/**
 * 哈希计算工具函数
 * 提供文件内容哈希计算功能
 */

/**
 * 计算字符串的SHA-256哈希
 * @param {string} content - 要计算哈希的内容
 * @returns {Promise<string>} 十六进制哈希值
 */
export async function calculateSHA256(content) {
    // 优先使用Web Crypto API
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('[哈希] Web Crypto API失败，使用简易哈希');
        }
    }
    
    // 回退到简易哈希
    return calculateSimpleHash(content);
}

/**
 * 计算简易哈希
 * 当Web Crypto不可用时使用
 * 
 * @param {string} content - 要计算哈希的内容
 * @returns {string} 哈希值
 */
export function calculateSimpleHash(content) {
    let hash = 0;
    const len = content.length;
    
    if (len === 0) return 'hash-empty';
    
    // 大文件采样计算
    const sample = len < 100000 
        ? content 
        : content.slice(0, 1000) + 
          content.slice(Math.floor(len / 2), Math.floor(len / 2) + 1000) + 
          content.slice(-1000);
    
    for (let i = 0; i < sample.length; i++) {
        hash = ((hash << 5) - hash) + sample.charCodeAt(i);
        hash = hash & hash;
    }
    
    return 'simple-' + Math.abs(hash).toString(16) + '-' + len;
}

/**
 * 计算文件的哈希
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 哈希值
 */
export async function calculateFileHash(file) {
    const content = await file.text();
    return calculateSHA256(content);
}

/**
 * 快速哈希（不等待Promise）
 * 同步计算简易哈希
 * 
 * @param {string} content - 要计算哈希的内容
 * @returns {string} 哈希值
 */
export function quickHash(content) {
    return calculateSimpleHash(content);
}

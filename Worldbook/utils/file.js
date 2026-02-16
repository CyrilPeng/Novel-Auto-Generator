/**
 * 文件操作工具函数
 * 提供文件读取、下载、编码检测等功能
 */

/**
 * 下载文件
 * @param {string|Blob} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME类型
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = content instanceof Blob 
        ? content 
        : new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[文件] 已下载: ${filename}`);
}

/**
 * 以指定编码读取文件为文本
 * @param {File} file - 文件对象
 * @param {string} encoding - 编码格式
 * @returns {Promise<string>} 文件内容
 */
export function readFileAsText(file, encoding = 'UTF-8') {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, encoding);
    });
}

/**
 * 读取文件为ArrayBuffer
 * @param {File} file - 文件对象
 * @returns {Promise<ArrayBuffer>} 文件内容
 */
export function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * 检测文件编码
 * 尝试多种编码，返回能正确解码的编码格式
 * @param {File} file - 文件对象
 * @returns {Promise<{encoding: string, content: string}>} 编码和内容
 */
export async function detectFileEncoding(file) {
    const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'Big5'];
    
    for (const encoding of encodings) {
        try {
            const content = await readFileAsText(file, encoding);
            // 检查是否有乱码字符
            if (!content.includes('�') && !content.includes('\uFFFD')) {
                return { encoding, content };
            }
        } catch (e) {
            continue;
        }
    }
    
    // 默认使用UTF-8
    const content = await readFileAsText(file, 'UTF-8');
    return { encoding: 'UTF-8', content };
}

/**
 * 计算文件哈希
 * 用于识别文件是否已更改
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 哈希值
 */
export async function calculateFileHash(file) {
    const content = await readFileAsText(file);
    
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
    let hash = 0;
    const len = content.length;
    if (len === 0) return 'hash-empty';
    
    // 采样计算哈希（大文件优化）
    const sample = len < 100000 
        ? content 
        : content.slice(0, 1000) + content.slice(Math.floor(len / 2), Math.floor(len / 2) + 1000) + content.slice(-1000);
    
    for (let i = 0; i < sample.length; i++) {
        hash = ((hash << 5) - hash) + sample.charCodeAt(i);
        hash = hash & hash;
    }
    
    return 'simple-' + Math.abs(hash).toString(16) + '-' + len;
}

/**
 * 解析文件名为标题
 * 去除扩展名，清理常见分隔符
 * @param {string} filename - 文件名
 * @returns {string} 标题
 */
export function parseFilenameToTitle(filename) {
    return filename
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .trim();
}

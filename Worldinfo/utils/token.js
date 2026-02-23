/**
 * Token 估算工具
 * 提供简单的 Token 数量估算功能
 */

/**
 * 估算文本的 Token 数量
 * 中文：约 1.5 token/字
 * 英文：约 1 token/词
 * 
 * @param {string} text - 文本内容
 * @returns {number} 估算的 Token 数
 */
export function estimateTokenCount(text) {
    if (!text) return 0;
    
    const str = String(text);
    let tokens = 0;
    
    // 中文字符计数 (约每个中文字符 1.5token)
    const chineseChars = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    tokens += chineseChars * 1.5;
    
    // 英文单词计数
    const englishWords = (str.match(/[a-zA-Z]+/g) || []).length;
    tokens += englishWords;
    
    // 数字
    const numbers = (str.match(/\d+/g) || []).length;
    tokens += numbers;
    
    // 标点和特殊字符
    const punctuation = (str.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g) || []).length;
    tokens += punctuation * 0.5;
    
    return Math.ceil(tokens);
}

/**
 * 计算世界书条目的 Token 总数
 * @param {Object} entry - 世界书条目
 * @returns {number} Token 总数
 */
export function getEntryTotalTokens(entry) {
    if (!entry || typeof entry !== 'object') return 0;
    
    let total = 0;
    
    // 计算关键词 tokens
    if (entry['关键词']) {
        const keywords = Array.isArray(entry['关键词']) 
            ? entry['关键词'].join(', ') 
            : entry['关键词'];
        total += estimateTokenCount(keywords);
    }
    
    // 计算内容 tokens
    if (entry['内容']) {
        total += estimateTokenCount(entry['内容']);
    }
    
    return total;
}

/**
 * 计算分类的 Token 总数
 * @param {Object} entries - 分类下的条目对象
 * @returns {number} Token 总数
 */
export function getCategoryTotalTokens(entries) {
    if (!entries || typeof entries !== 'object') return 0;
    
    let total = 0;
    for (const entry of Object.values(entries)) {
        total += getEntryTotalTokens(entry);
    }
    
    return total;
}

/**
 * 计算世界书的 Token 总数
 * @param {Object} worldbook - 世界书对象
 * @returns {number} Token 总数
 */
export function getWorldbookTotalTokens(worldbook) {
    if (!worldbook || typeof worldbook !== 'object') return 0;
    
    let total = 0;
    for (const entries of Object.values(worldbook)) {
        total += getCategoryTotalTokens(entries);
    }
    
    return total;
}

/**
 * 检查文本是否超过 Token 限制
 * @param {string} text - 文本内容
 * @param {number} limit - Token 限制
 * @returns {Object} 检查结果
 */
export function checkTokenLimit(text, limit = 4000) {
    const tokens = estimateTokenCount(text);
    return {
        tokens,
        limit,
        exceeded: tokens > limit,
        remaining: Math.max(0, limit - tokens),
        percentage: Math.min(100, (tokens / limit) * 100)
    };
}

/**
 * 截断文本以适应 Token 限制
 * @param {string} text - 文本内容
 * @param {number} limit - Token 限制
 * @param {string} suffix - 截断后的后缀
 * @returns {string} 截断后的文本
 */
export function truncateToTokenLimit(text, limit = 4000, suffix = '...') {
    const check = checkTokenLimit(text, limit);
    
    if (!check.exceeded) return text;
    
    // 简单二分法查找合适的截断点
    let left = 0;
    let right = text.length;
    let result = text;
    
    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        const truncated = text.slice(0, mid) + suffix;
        const tokens = estimateTokenCount(truncated);
        
        if (tokens <= limit) {
            result = truncated;
            left = mid + 1;
        } else {
            right = mid;
        }
    }
    
    return result;
}

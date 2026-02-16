/**
 * Token估算工具函数
 * 用于估算文本的Token数量
 */

/**
 * 估算文本的Token数量
 * 简单估算规则：
 * - 中文字符：约1.5个token
 * - 英文单词：约1个token
 * - 数字：约1个token
 * - 标点符号：约0.5个token
 * 
 * @param {string} text - 要估算的文本
 * @returns {number} Token数量（向上取整）
 */
export function estimateTokenCount(text) {
    if (!text) return 0;
    const str = String(text);
    let tokens = 0;
    
    // 中文字符计数
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
 * 计算世界书条目的总Token数
 * 包括关键词和内容两部分
 * 
 * @param {Object} entry - 世界书条目
 * @param {string|Array} entry.关键词 - 关键词列表
 * @param {string} entry.内容 - 条目内容
 * @returns {number} 总Token数
 */
export function getEntryTokenCount(entry) {
    if (!entry || typeof entry !== 'object') return 0;
    let total = 0;
    
    // 计算关键词tokens
    if (entry['关键词']) {
        const keywords = Array.isArray(entry['关键词']) 
            ? entry['关键词'].join(', ') 
            : entry['关键词'];
        total += estimateTokenCount(keywords);
    }
    
    // 计算内容tokens
    if (entry['内容']) {
        total += estimateTokenCount(entry['内容']);
    }
    
    return total;
}

/**
 * 计算多个条目的总Token数
 * @param {Array<Object>} entries - 条目数组
 * @returns {number} 总Token数
 */
export function getEntriesTotalTokenCount(entries) {
    if (!Array.isArray(entries)) return 0;
    return entries.reduce((sum, entry) => sum + getEntryTokenCount(entry), 0);
}

/**
 * 格式化Token数量显示
 * @param {number} count - Token数量
 * @returns {string} 格式化后的字符串
 */
export function formatTokenCount(count) {
    if (count >= 10000) {
        return (count / 10000).toFixed(1) + '万';
    }
    if (count >= 1000) {
        return (count / 1000).toFixed(1) + '千';
    }
    return String(count);
}

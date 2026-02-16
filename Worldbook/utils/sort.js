/**
 * 排序工具函数
 * 提供自然排序、中文数字排序等功能
 */

/**
 * 自然排序比较函数
 * 支持中文数字的智能排序
 * 
 * @param {string} a - 第一个字符串
 * @param {string} b - 第二个字符串
 * @returns {number} 比较结果
 */
export function naturalSortCompare(a, b) {
    // 提取章节号的正则：匹配"第X章"格式
    const chapterRegex = /第([零一二三四五六七八九十百千万\d]+)[章回卷节部篇]/;
    const matchA = a.match(chapterRegex);
    const matchB = b.match(chapterRegex);
    
    if (matchA && matchB) {
        const numA = chineseNumToInt(matchA[1]);
        const numB = chineseNumToInt(matchB[1]);
        if (numA !== numB) return numA - numB;
    }
    
    // 通用自然排序
    return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

/**
 * 自然排序数组
 * @param {Array<string>} items - 要排序的数组
 * @param {string} key - 如果是对象数组，指定排序字段
 * @returns {Array} 排序后的数组
 */
export function naturalSort(items, key = null) {
    if (!Array.isArray(items)) return [];
    
    return [...items].sort((a, b) => {
        const valA = key ? a[key] : a;
        const valB = key ? b[key] : b;
        return naturalSortCompare(String(valA), String(valB));
    });
}

/**
 * 中文数字转换为整数
 * 支持：零一二三四五六七八九十百千万
 * 
 * @param {string} str - 中文数字字符串
 * @returns {number} 对应的整数
 */
export function chineseNumToInt(str) {
    // 纯数字直接返回
    if (/^\d+$/.test(str)) return parseInt(str);
    
    const numMap = { 
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, 
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 
    };
    const unitMap = { 
        '十': 10, '百': 100, '千': 1000, '万': 10000 
    };
    
    let result = 0;
    let section = 0;
    let current = 0;
    
    for (const ch of str) {
        if (numMap[ch] !== undefined) {
            current = numMap[ch];
        } else if (unitMap[ch] !== undefined) {
            const unit = unitMap[ch];
            if (unit === 10000) {
                section = (current === 0 && section === 0) 
                    ? unit 
                    : (section + current) * unit;
                result += section;
                section = 0;
            } else {
                section += (current === 0 ? 1 : current) * unit;
            }
            current = 0;
        }
    }
    
    return result + section + current;
}

/**
 * 通用排序函数
 * @param {Array} items - 要排序的数组
 * @param {string} key - 排序字段
 * @param {string} order - 排序方向：'asc'升序，'desc'降序
 * @returns {Array} 排序后的数组
 */
export function sortBy(items, key, order = 'asc') {
    if (!Array.isArray(items)) return [];
    
    return [...items].sort((a, b) => {
        let valA = key ? a[key] : a;
        let valB = key ? b[key] : b;
        
        // 字符串比较
        if (typeof valA === 'string' && typeof valB === 'string') {
            const result = valA.localeCompare(valB, 'zh-CN');
            return order === 'asc' ? result : -result;
        }
        
        // 数字比较
        const result = valA - valB;
        return order === 'asc' ? result : -result;
    });
}

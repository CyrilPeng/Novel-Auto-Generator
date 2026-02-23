/**
 * 正则表达式工具
 * 提供章节检测、正则匹配等功能
 */

/**
 * 默认章节检测正则
 * 匹配：第 X 章、第 X 回、第 X 卷等格式
 */
export const DEFAULT_CHAPTER_REGEX = '第 [零一二三四五六七八九十百千万 0-9]+[章回卷节部篇]';

/**
 * 章节正则预设
 */
export const CHAPTER_REGEX_PRESETS = {
    standard: '第 [零一二三四五六七八九十百千万 0-9]+[章回卷节部篇]',
    withTitle: '第 [零一二三四五六七八九十百千万 0-9]+[章回卷节部篇].*',
    volume: '第 [零一二三四五六七八九十百千万 0-9]+[卷部]',
    custom: ''
};

/**
 * 检测文本中的章节标记
 * @param {string} content - 文本内容
 * @param {string} pattern - 正则表达式
 * @returns {Array<Object>} 章节匹配结果
 */
export function detectChapters(content, pattern = DEFAULT_CHAPTER_REGEX) {
    try {
        const regex = new RegExp(pattern, 'g');
        const matches = [...content.matchAll(regex)];
        
        return matches.map((match, index) => ({
            index,
            match: match[0],
            position: match.index,
            text: match[0]
        }));
    } catch (e) {
        console.error('[正则工具] 章节检测失败:', e.message);
        return [];
    }
}

/**
 * 按章节分割内容
 * @param {string} content - 文本内容
 * @param {string} pattern - 正则表达式
 * @returns {Array<Object>} 分割后的章节数组
 */
export function splitByChapters(content, pattern = DEFAULT_CHAPTER_REGEX) {
    const chapters = detectChapters(content, pattern);
    
    if (chapters.length === 0) {
        // 没有检测到章节，按固定大小分割
        return splitBySize(content, 15000);
    }
    
    const chunks = [];
    for (let i = 0; i < chapters.length; i++) {
        const current = chapters[i];
        const next = chapters[i + 1];
        
        const chunkContent = next
            ? content.slice(current.position, next.position)
            : content.slice(current.position);
        
        chunks.push({
            title: current.match,
            content: chunkContent.trim(),
            startPosition: current.position,
            endPosition: next ? next.position : content.length
        });
    }
    
    return chunks;
}

/**
 * 按固定大小分割内容
 * @param {string} content - 文本内容
 * @param {number} chunkSize - 每块大小
 * @returns {Array<Object>} 分割后的块数组
 */
export function splitBySize(content, chunkSize = 15000) {
    const chunks = [];
    const paragraphs = content.split(/\n+/);
    
    let currentChunk = '';
    let titleIndex = 1;
    
    for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
            chunks.push({
                title: `第${titleIndex}部分`,
                content: currentChunk.trim(),
                startPosition: content.indexOf(currentChunk),
                endPosition: content.indexOf(currentChunk) + currentChunk.length
            });
            currentChunk = paragraph;
            titleIndex++;
        } else {
            currentChunk += '\n' + paragraph;
        }
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push({
            title: `第${titleIndex}部分`,
            content: currentChunk.trim(),
            startPosition: content.indexOf(currentChunk),
            endPosition: content.length
        });
    }
    
    return chunks;
}

/**
 * 测试正则表达式
 * @param {string} content - 文本内容
 * @param {string} pattern - 正则表达式
 * @returns {Object} 测试结果
 */
export function testRegex(content, pattern) {
    try {
        const regex = new RegExp(pattern, 'g');
        const matches = [...content.matchAll(regex)];
        
        return {
            success: true,
            count: matches.length,
            samples: matches.slice(0, 10).map(m => m[0]),
            error: null
        };
    } catch (e) {
        return {
            success: false,
            count: 0,
            samples: [],
            error: e.message
        };
    }
}

/**
 * 转义正则表达式特殊字符
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

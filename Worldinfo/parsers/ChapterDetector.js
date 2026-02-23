/**
 * 章节检测器
 * 使用正则表达式检测文本中的章节标记
 */

import { DEFAULT_CHAPTER_REGEX, CHAPTER_REGEX_PRESETS, detectChapters, splitByChapters } from '../utils/regex.js';

/**
 * 章节检测配置
 */
export class ChapterDetectorConfig {
    constructor({
        pattern = DEFAULT_CHAPTER_REGEX,
        useCustomRegex = false,
        forceChapterMarker = true,
        minChapterLength = 100,
        maxChapterLength = 50000
    } = {}) {
        this.pattern = pattern;
        this.useCustomRegex = useCustomRegex;
        this.forceChapterMarker = forceChapterMarker;
        this.minChapterLength = minChapterLength;
        this.maxChapterLength = maxChapterLength;
    }
}

/**
 * 章节检测器
 */
export class ChapterDetector {
    constructor(config = {}) {
        this.config = new ChapterDetectorConfig(config);
        this.cachedMatches = null;
    }

    /**
     * 检测文本中的章节
     * @param {string} content - 文本内容
     * @returns {Array<Object>} 章节匹配结果
     */
    detect(content) {
        const pattern = this.config.useCustomRegex 
            ? this.config.pattern 
            : DEFAULT_CHAPTER_REGEX;
        
        this.cachedMatches = detectChapters(content, pattern);
        return this.cachedMatches;
    }

    /**
     * 按章节分割内容
     * @param {string} content - 文本内容
     * @param {string} titlePrefix - 标题前缀
     * @returns {Array<Object>} 分割后的章节数组
     */
    split(content, titlePrefix = '') {
        const pattern = this.config.useCustomRegex 
            ? this.config.pattern 
            : DEFAULT_CHAPTER_REGEX;
        
        let chunks = splitByChapters(content, pattern);
        
        // 如果没有检测到章节，按大小分割
        if (chunks.length === 0 || (chunks.length === 1 && chunks[0].title === '第 1 部分')) {
            chunks = this.splitBySize(content);
        }
        
        // 添加标题前缀
        if (titlePrefix) {
            chunks.forEach(chunk => {
                chunk.title = `${titlePrefix}${chunk.title}`;
            });
        }
        
        return chunks;
    }

    /**
     * 按大小分割内容
     * @param {string} content - 文本内容
     * @param {number} targetSize - 目标大小
     * @returns {Array<Object>} 分割后的块
     */
    splitBySize(content, targetSize = 15000) {
        const chunks = [];
        const paragraphs = content.split(/\n+/);
        
        let currentChunk = '';
        let chunkIndex = 1;
        
        for (const paragraph of paragraphs) {
            if (currentChunk.length + paragraph.length > targetSize && currentChunk.length > 0) {
                chunks.push({
                    title: `第${chunkIndex}部分`,
                    content: currentChunk.trim(),
                    startPosition: content.indexOf(currentChunk),
                    endPosition: content.indexOf(currentChunk) + currentChunk.length,
                    isAutoSplit: true
                });
                currentChunk = paragraph;
                chunkIndex++;
            } else {
                currentChunk += '\n' + paragraph;
            }
        }
        
        if (currentChunk.trim().length > 0) {
            chunks.push({
                title: `第${chunkIndex}部分`,
                content: currentChunk.trim(),
                startPosition: content.indexOf(currentChunk),
                endPosition: content.length,
                isAutoSplit: true
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
    testRegex(content, pattern = null) {
        const testPattern = pattern || this.config.pattern;
        
        try {
            const regex = new RegExp(testPattern, 'g');
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
     * 获取预设正则
     * @param {string} presetName - 预设名称
     * @returns {string} 正则表达式
     */
    getPresetRegex(presetName) {
        return CHAPTER_REGEX_PRESETS[presetName] || DEFAULT_CHAPTER_REGEX;
    }

    /**
     * 获取所有预设
     * @returns {Object} 预设对象
     */
    getPresets() {
        return CHAPTER_REGEX_PRESETS;
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this.cachedMatches = null;
    }

    /**
     * 获取缓存的匹配结果
     */
    getCachedMatches() {
        return this.cachedMatches || [];
    }

    /**
     * 获取章节数量
     * @param {string} content - 文本内容
     * @returns {number} 章节数量
     */
    countChapters(content) {
        const matches = this.detect(content);
        return matches.length;
    }

    /**
     * 验证分割结果
     * @param {Array} chunks - 分割后的章节数组
     * @returns {Object} 验证结果
     */
    validateChunks(chunks) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            stats: {
                total: chunks.length,
                tooShort: 0,
                tooLong: 0,
                autoSplit: 0
            }
        };
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const length = chunk.content.length;
            
            if (length < this.config.minChapterLength) {
                result.warnings.push(`第${i + 1}章过短 (${length}字)`);
                result.stats.tooShort++;
            }
            
            if (length > this.config.maxChapterLength) {
                result.warnings.push(`第${i + 1}章过长 (${length}字)`);
                result.stats.tooLong++;
            }
            
            if (chunk.isAutoSplit) {
                result.stats.autoSplit++;
            }
        }
        
        if (result.errors.length > 0) {
            result.valid = false;
        }
        
        return result;
    }
}

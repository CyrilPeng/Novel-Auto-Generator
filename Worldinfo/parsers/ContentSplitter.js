/**
 * 内容分割器
 * 将长文本分割为适当大小的块
 */
import { DEFAULT_CHAPTER_REGEX } from '../utils/regex.js';

/**
 * 分割器配置
 */
export class ContentSplitterConfig {
    constructor({
        chunkSize = 15000,
        useVolumeMode = false,
        chapterPattern = DEFAULT_CHAPTER_REGEX,
        minChapterLength = 100,
        maxChapterLength = 50000
    } = {}) {
        this.chunkSize = chunkSize;
        this.useVolumeMode = useVolumeMode;
        this.chapterPattern = chapterPattern;
        this.minChapterLength = minChapterLength;
        this.maxChapterLength = maxChapterLength;
    }
}

/**
 * 内容分割器
 */
export class ContentSplitter {
    constructor(options = {}) {
        this.config = new ContentSplitterConfig(options);
    }

    /**
     * 分割内容
     * @param {string} content - 要分割的内容
     * @param {string} titlePrefix - 标题前缀
     * @returns {Array} 分割后的块数组
     */
    split(content, titlePrefix = '') {
        // 首先尝试按章节分割
        const chapters = this.splitByChapters(content);

        if (chapters.length > 0) {
            if (titlePrefix) {
                chapters.forEach(ch => ch.title = `${titlePrefix}${ch.title}`);
            }
            return chapters;
        }

        // 如果章节分割失败，按字数分割
        const chunks = this.splitBySize(content);
        if (titlePrefix) {
            chunks.forEach(ch => ch.title = `${titlePrefix}${ch.title}`);
        }
        return chunks;
    }

    /**
     * 按章节分割
     * @param {string} content - 内容
     * @returns {Array} 章节数组
     */
    splitByChapters(content) {
        const chapters = [];
        const regex = new RegExp(this.config.chapterPattern + '[^\\n]*\\n', 'g');
        const matches = [...content.matchAll(regex)];
        
        if (matches.length === 0) {
            return [];
        }

        // 使用正则分割内容
        const parts = content.split(regex);

        // 处理序言/前言
        if (parts[0] && parts[0].trim().length > this.config.minChapterLength) {
            chapters.push({
                title: '序言',
                content: parts[0].trim(),
                index: 0,
                startPosition: 0,
                endPosition: parts[0].length
            });
        }

        // 处理章节
        let currentPosition = parts[0]?.length || 0;
        for (let i = 1; i < parts.length; i++) {
            const chapterContent = parts[i]?.trim();
            const match = matches[i - 1];
            
            if (chapterContent && chapterContent.length > this.config.minChapterLength) {
                const title = match?.[0]?.trim() || `第${i}章`;
                const startPosition = currentPosition;
                const endPosition = startPosition + match[0].length + chapterContent.length;

                // 如果章节太长，进一步分割
                if (chapterContent.length > this.config.maxChapterLength) {
                    const subChunks = this.splitLargeChapter(title, chapterContent);
                    chapters.push(...subChunks);
                } else {
                    chapters.push({
                        title,
                        content: chapterContent,
                        index: chapters.length,
                        startPosition,
                        endPosition
                    });
                }
                
                currentPosition = endPosition;
            }
        }

        return chapters;
    }

    /**
     * 分割大章节
     * @param {string} title - 章节标题
     * @param {string} content - 章节内容
     * @returns {Array} 分割后的块
     */
    splitLargeChapter(title, content) {
        const chunks = [];
        const paragraphs = content.split('\n');
        let currentChunk = '';
        let chunkIndex = 1;

        for (const paragraph of paragraphs) {
            if (currentChunk.length + paragraph.length > this.config.chunkSize) {
                if (currentChunk) {
                    chunks.push({
                        title: `${title} (${chunkIndex})`,
                        content: currentChunk.trim(),
                        index: chunkIndex,
                        isAutoSplit: true
                    });
                    chunkIndex++;
                }
                currentChunk = paragraph + '\n';
            } else {
                currentChunk += paragraph + '\n';
            }
        }

        // 添加最后一个块
        if (currentChunk.trim()) {
            chunks.push({
                title: `${title} (${chunkIndex})`,
                content: currentChunk.trim(),
                index: chunkIndex,
                isAutoSplit: true
            });
        }

        return chunks;
    }

    /**
     * 按字数分割
     * @param {string} content - 内容
     * @returns {Array} 块数组
     */
    splitBySize(content) {
        const chunks = [];
        const totalChunks = Math.ceil(content.length / this.config.chunkSize);

        // 尝试在段落边界分割
        const paragraphs = content.split(/\n+/);
        let currentChunk = '';
        let chunkIndex = 1;
        let currentPosition = 0;

        for (const paragraph of paragraphs) {
            if (currentChunk.length + paragraph.length > this.config.chunkSize && currentChunk.length > 0) {
                chunks.push({
                    title: `第${chunkIndex}/${totalChunks}块`,
                    content: currentChunk.trim(),
                    index: chunkIndex,
                    startPosition: currentPosition,
                    endPosition: currentPosition + currentChunk.length,
                    isAutoSplit: true
                });
                currentPosition += currentChunk.length;
                currentChunk = paragraph + '\n';
                chunkIndex++;
            } else {
                currentChunk += paragraph + '\n';
            }
        }

        // 添加最后一个块
        if (currentChunk.trim()) {
            chunks.push({
                title: `第${chunkIndex}/${totalChunks}块`,
                content: currentChunk.trim(),
                index: chunkIndex,
                startPosition: currentPosition,
                endPosition: content.length,
                isAutoSplit: true
            });
        }

        return chunks;
    }

    /**
     * 检测章节边界
     * @param {string} content - 内容
     * @returns {Array} 章节位置数组
     */
    detectChapterBoundaries(content) {
        const boundaries = [];
        const regex = new RegExp(this.config.chapterPattern, 'g');
        let match;

        while ((match = regex.exec(content)) !== null) {
            boundaries.push({
                index: match.index,
                title: match[0].trim()
            });
        }

        return boundaries;
    }

    /**
     * 验证分割结果
     * @param {Array} chunks - 分割后的块
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
                result.warnings.push(`第${i + 1}块过短 (${length}字)`);
                result.stats.tooShort++;
            }

            if (length > this.config.maxChapterLength) {
                result.warnings.push(`第${i + 1}块过长 (${length}字)`);
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

/**
 * 内容分割器
 * 将长文本分割为适当大小的块
 */
export class ContentSplitter {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 15000;
        this.useVolumeMode = options.useVolumeMode || false;
        this.chapterPattern = options.chapterPattern || /第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]/;
    }

    /**
     * 分割内容
     * @param {string} content - 要分割的内容
     * @returns {Array} 分割后的块数组
     */
    split(content) {
        // 首先尝试按章节分割
        const chapters = this.splitByChapters(content);
        
        if (chapters.length > 0) {
            return chapters;
        }
        
        // 如果章节分割失败，按字数分割
        return this.splitBySize(content);
    }

    /**
     * 按章节分割
     * @param {string} content - 内容
     * @returns {Array} 章节数组
     */
    splitByChapters(content) {
        const chapters = [];
        const regex = new RegExp(this.chapterPattern.source + '[^\\n]*\\n', 'g');
        const matches = content.match(regex);
        const parts = content.split(regex);
        
        // 处理序言/前言
        if (parts[0].trim().length > 100) {
            chapters.push({
                title: '序言',
                content: parts[0].trim(),
                index: 0
            });
        }
        
        // 处理章节
        for (let i = 1; i < parts.length; i++) {
            const chapterContent = parts[i].trim();
            if (chapterContent.length > 100) {
                const title = matches?.[i - 1]?.trim() || `第${i}章`;
                
                // 如果章节太长，进一步分割
                if (chapterContent.length > this.chunkSize * 1.5) {
                    const subChunks = this.splitLargeChapter(title, chapterContent);
                    chapters.push(...subChunks);
                } else {
                    chapters.push({
                        title: title,
                        content: chapterContent,
                        index: i
                    });
                }
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
            if (currentChunk.length + paragraph.length > this.chunkSize) {
                if (currentChunk) {
                    chunks.push({
                        title: `${title} (${chunkIndex})`,
                        content: currentChunk.trim(),
                        index: chunkIndex
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
                index: chunkIndex
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
        const totalChunks = Math.ceil(content.length / this.chunkSize);
        
        for (let i = 0; i < content.length; i += this.chunkSize) {
            const chunkIndex = Math.floor(i / this.chunkSize) + 1;
            chunks.push({
                title: `第${chunkIndex}/${totalChunks}块`,
                content: content.slice(i, i + this.chunkSize),
                index: chunkIndex
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
        const regex = new RegExp(this.chapterPattern.source, 'g');
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            boundaries.push({
                index: match.index,
                title: match[0].trim()
            });
        }
        
        return boundaries;
    }
}

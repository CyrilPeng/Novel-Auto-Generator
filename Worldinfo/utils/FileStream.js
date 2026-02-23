/**
 * 大文件流式读取工具
 * 支持分块读取大文件，避免内存溢出
 */

/**
 * 流式读取配置
 */
export class StreamReaderConfig {
    constructor({
        chunkSize = 1024 * 1024, // 默认 1MB 分块
        encoding = 'utf-8',
        onProgress = null
    } = {}) {
        this.chunkSize = chunkSize;
        this.encoding = encoding;
        this.onProgress = onProgress;
    }
}

/**
 * 文件流式读取器
 */
export class FileReaderStream {
    constructor(file, config = {}) {
        this.file = file;
        this.config = new StreamReaderConfig(config);
        this.position = 0;
        this.isReading = false;
        this.isCancelled = false;
    }

    /**
     * 读取整个文件（分块）
     * @returns {AsyncGenerator<string>} 文本块生成器
     */
    async *readChunks() {
        this.isReading = true;
        this.position = 0;

        while (this.position < this.file.size && !this.isCancelled) {
            const chunk = await this.readNextChunk();
            if (chunk) {
                yield chunk;
            }
        }

        this.isReading = false;
    }

    /**
     * 读取下一个分块
     * @returns {Promise<string|null>} 文本块
     */
    async readNextChunk() {
        if (this.position >= this.file.size) {
            return null;
        }

        const end = Math.min(this.position + this.config.chunkSize, this.file.size);
        const blob = this.file.slice(this.position, end);

        try {
            const text = await this.blobToText(blob);

            this.position = end;

            // 进度回调
            if (this.config.onProgress) {
                const progress = (this.position / this.file.size) * 100;
                this.config.onProgress(progress, this.position, this.file.size);
            }

            return text;
        } catch (error) {
            console.error('[文件流式读取] 读取分块失败:', error);
            throw error;
        }
    }

    /**
     * Blob 转文本
     * @param {Blob} blob - Blob 对象
     * @returns {Promise<string>} 文本
     */
    async blobToText(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                resolve(e.target.result);
            };

            reader.onerror = () => {
                reject(new Error('读取文件失败'));
            };

            reader.readAsText(blob, this.config.encoding);
        });
    }

    /**
     * 取消读取
     */
    cancel() {
        this.isCancelled = true;
    }

    /**
     * 重置读取位置
     */
    reset() {
        this.position = 0;
        this.isCancelled = false;
    }

    /**
     * 获取文件大小
     * @returns {number} 文件大小（字节）
     */
    getFileSize() {
        return this.file.size;
    }

    /**
     * 获取文件名
     * @returns {string} 文件名
     */
    getFileName() {
        return this.file.name;
    }

    /**
     * 获取文件类型
     * @returns {string} 文件类型
     */
    getFileType() {
        return this.file.type;
    }

    /**
     * 获取读取进度
     * @returns {number} 进度百分比 (0-100)
     */
    getProgress() {
        return (this.position / this.file.size) * 100;
    }
}

/**
 * 检测文件编码
 * 通过尝试不同编码来检测最佳编码
 * @param {File} file - 文件对象
 * @param {Array<string>} encodings - 要尝试的编码列表
 * @returns {Promise<Object>} 检测结果
 */
export async function detectFileEncodingStream(file, encodings = ['utf-8', 'gbk', 'gb2312', 'big5']) {
    const reader = new FileReaderStream(file, { chunkSize: 4096 }); // 读取 4KB 样本

    try {
        const sample = await reader.readNextChunk();

        for (const encoding of encodings) {
            // 检查是否包含乱码字符
            if (!sample.includes('') && !sample.includes('\uFFFD')) {
                return {
                    encoding,
                    sample: sample.substring(0, 1000)
                };
            }
        }

        // 默认返回 utf-8
        return {
            encoding: 'utf-8',
            sample: sample.substring(0, 1000)
        };
    } finally {
        reader.reset();
    }
}

/**
 * 流式读取文件为文本
 * @param {File} file - 文件对象
 * @param {Object} options - 选项
 * @returns {AsyncGenerator<{chunk: string, progress: number}>} 文本块和进度
 */
export async function* readFileStream(file, options = {}) {
    const reader = new FileReaderStream(file, options);
    let chunkIndex = 0;

    for await (const chunk of reader.readChunks()) {
        yield {
            chunk,
            progress: reader.getProgress(),
            chunkIndex: chunkIndex++
        };
    }
}

/**
 * 流式读取文件并合并
 * @param {File} file - 文件对象
 * @param {Object} options - 选项
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<string>} 完整文本
 */
export async function readFileStreamMerged(file, options = {}, onProgress = null) {
    const reader = new FileReaderStream(file, {
        ...options,
        onProgress
    });

    const chunks = [];

    for await (const chunk of reader.readChunks()) {
        chunks.push(chunk);
    }

    return chunks.join('');
}

/**
 * 流式读取大文件并处理
 * @param {File} file - 文件对象
 * @param {Function} processor - 处理函数 (chunk, index) => void
 * @param {Object} options - 选项
 */
export async function processFileStream(file, processor, options = {}) {
    const reader = new FileReaderStream(file, options);
    let chunkIndex = 0;

    try {
        for await (const chunk of reader.readChunks()) {
            await processor(chunk, chunkIndex++);
        }
    } finally {
        reader.reset();
    }
}

/**
 * 检查文件是否过大
 * @param {File} file - 文件对象
 * @param {number} maxSizeMB - 最大大小（MB）
 * @returns {boolean} 是否过大
 */
export function isFileTooLarge(file, maxSizeMB = 100) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size > maxSizeBytes;
}

// 注意：formatFileSize 已在 file.js 中定义，此处不再重复导出
// 请使用 import { formatFileSize } from './file.js';

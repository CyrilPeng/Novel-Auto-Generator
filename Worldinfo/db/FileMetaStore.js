/**
 * 文件元数据存储
 * 管理文件哈希、名称等元数据
 */
import { db } from './Database.js';

export class FileMetaStore {
    constructor() {
        this.storeName = 'fileMeta';
    }

    /**
     * 保存文件元数据
     * @param {Object} meta - 文件元数据
     * @param {string} meta.fileHash - 文件哈希
     * @param {string} meta.fileName - 文件名
     * @param {number} meta.fileSize - 文件大小
     * @param {string} meta.encoding - 文件编码
     * @param {number} meta.chunkCount - 分块数量
     * @param {number} meta.timestamp - 时间戳
     * @returns {Promise<void>}
     */
    async save(meta) {
        const data = {
            key: 'currentFile',
            ...meta,
            timestamp: Date.now()
        };
        await db.put(this.storeName, data);
    }

    /**
     * 获取文件元数据
     * @returns {Promise<Object|null>} 文件元数据
     */
    async get() {
        return db.get(this.storeName, 'currentFile');
    }

    /**
     * 检查文件是否变化
     * @param {string} newHash - 新文件哈希
     * @returns {Promise<boolean>} 文件是否变化
     */
    async isFileChanged(newHash) {
        const meta = await this.get();
        if (!meta || !meta.fileHash) return true;
        return meta.fileHash !== newHash;
    }

    /**
     * 清空文件元数据
     * @returns {Promise<void>}
     */
    async clear() {
        await db.delete(this.storeName, 'currentFile');
    }

    /**
     * 获取上次处理的文件信息
     * @returns {Promise<Object|null>} 文件信息
     */
    async getLastProcessedFile() {
        return this.get();
    }
}

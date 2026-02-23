/**
 * 历史记录存储
 * 管理世界书生成的历史记录和版本回滚
 */
import { db } from './Database.js';

export class HistoryStore {
    constructor() {
        this.storeName = 'history';
        // 最大历史记录数量限制，防止存储无限增长
        this.maxHistoryCount = 100;
    }

    /**
     * 保存历史记录
     * @param {Object} record - 历史记录
     * @param {number} record.memoryIndex - 记忆块索引
     * @param {string} record.memoryTitle - 记忆块标题
     * @param {Object} record.previousWorldbook - 之前的世界书状态
     * @param {Object} record.newWorldbook - 新的世界书状态
     * @param {Array} record.changedEntries - 变更的条目列表
     * @param {string} record.fileHash - 文件哈希
     * @returns {Promise<number>} 历史记录ID
     */
    async save(record) {
        // 检查并清理超出限制的历史记录
        await this.enforceHistoryLimit();
        
        const data = {
            timestamp: Date.now(),
            ...record
        };
        return db.add(this.storeName, data);
    }

    /**
     * 强制执行历史记录数量限制
     * 当历史记录数量超过限制时，删除最旧的记录
     * @private
     */
    async enforceHistoryLimit() {
        try {
            const allHistory = await this.getAll();
            if (allHistory.length >= this.maxHistoryCount) {
                // 删除最旧的记录（按时间戳升序排列，删除前N个）
                const toDeleteCount = allHistory.length - this.maxHistoryCount + 1;
                const sortedByOldest = allHistory.sort((a, b) => a.timestamp - b.timestamp);
                
                for (let i = 0; i < toDeleteCount; i++) {
                    if (sortedByOldest[i]?.id) {
                        await db.delete(this.storeName, sortedByOldest[i].id);
                    }
                }
                
                console.log(`[HistoryStore] 已清理 ${toDeleteCount} 条旧历史记录，当前限制: ${this.maxHistoryCount}`);
            }
        } catch (error) {
            console.warn('[HistoryStore] 清理历史记录失败:', error);
        }
    }

    /**
     * 获取所有历史记录
     * @returns {Promise<Array>} 历史记录列表(按时间倒序)
     */
    async getAll() {
        const records = await db.getAll(this.storeName);
        return records.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 根据ID获取历史记录
     * @param {number} id - 历史记录ID
     * @returns {Promise<Object|null>} 历史记录
     */
    async getById(id) {
        return db.get(this.storeName, id);
    }

    /**
     * 回滚到指定历史记录
     * 删除该记录之后的所有历史
     * 
     * @param {number} historyId - 目标历史记录ID
     * @returns {Promise<Object>} 被回滚的历史记录
     */
    async rollbackTo(historyId) {
        const history = await this.getById(historyId);
        if (!history) {
            throw new Error('找不到指定的历史记录');
        }

        const allHistory = await this.getAll();
        const toDelete = allHistory.filter(h => h.id >= historyId);

        for (const record of toDelete) {
            await db.delete(this.storeName, record.id);
        }

        return history;
    }

    /**
     * 清空所有历史记录
     * @returns {Promise<void>}
     */
    async clear() {
        await db.clear(this.storeName);
    }

    /**
     * 根据记忆块索引获取历史记录
     * @param {number} memoryIndex - 记忆块索引
     * @returns {Promise<Array>} 历史记录列表
     */
    async getByMemoryIndex(memoryIndex) {
        return db.getByIndex(this.storeName, 'memoryIndex', memoryIndex);
    }
}

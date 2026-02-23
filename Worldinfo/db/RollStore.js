/**
 * Roll历史存储
 * 保存记忆块和条目级别的重Roll历史
 */
import { db } from './Database.js';

export class RollStore {
    constructor() {
        this.rollStoreName = 'rolls';
        this.entryRollStoreName = 'entryRolls';
        // 每个记忆块/条目的最大 Roll 历史数量限制
        this.maxRollsPerEntry = 50;
    }

    /**
     * 保存记忆块级别的Roll结果
     * @param {number} memoryIndex - 记忆块索引
     * @param {Object} result - Roll结果
     * @returns {Promise<number>} Roll记录ID
     */
    async saveMemoryRoll(memoryIndex, result) {
        // 清理超出限制的旧记录
        await this.enforceRollLimit(this.rollStoreName, 'memoryIndex', memoryIndex);
        
        const data = {
            memoryIndex,
            result,
            timestamp: Date.now()
        };
        return db.add(this.rollStoreName, data);
    }

    /**
     * 获取记忆块的所有Roll结果
     * @param {number} memoryIndex - 记忆块索引
     * @returns {Promise<Array>} Roll结果列表(按时间倒序)
     */
    async getMemoryRolls(memoryIndex) {
        const results = await db.getByIndex(this.rollStoreName, 'memoryIndex', memoryIndex);
        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 清除记忆块的Roll历史
     * @param {number} memoryIndex - 记忆块索引
     * @returns {Promise<void>}
     */
    async clearMemoryRolls(memoryIndex) {
        const rolls = await this.getMemoryRolls(memoryIndex);
        for (const roll of rolls) {
            await db.delete(this.rollStoreName, roll.id);
        }
    }

    /**
     * 保存条目级别的Roll结果
     * @param {string} category - 分类名称
     * @param {string} entryName - 条目名称
     * @param {number} memoryIndex - 记忆块索引
     * @param {Object} result - Roll结果
     * @param {string} customPrompt - 自定义提示词(可选)
     * @returns {Promise<number>} Roll记录ID
     */
    async saveEntryRoll(category, entryName, memoryIndex, result, customPrompt = '') {
        const entryKey = `${category}:${entryName}`;
        
        // 清理超出限制的旧记录
        await this.enforceRollLimit(this.entryRollStoreName, 'entryKey', entryKey);
        
        const data = {
            entryKey,
            category,
            entryName,
            memoryIndex,
            result,
            customPrompt,
            timestamp: Date.now()
        };
        return db.add(this.entryRollStoreName, data);
    }

    /**
     * 强制执行 Roll 历史数量限制
     * 当指定条目/记忆块的 Roll 记录数量超过限制时，删除最旧的记录
     * @private
     * @param {string} storeName - 存储名称
     * @param {string} indexName - 索引名称
     * @param {string|number} indexValue - 索引值
     */
    async enforceRollLimit(storeName, indexName, indexValue) {
        try {
            const rolls = await db.getByIndex(storeName, indexName, indexValue);
            if (rolls.length >= this.maxRollsPerEntry) {
                // 删除最旧的记录（按时间戳升序排列）
                const sortedByOldest = rolls.sort((a, b) => a.timestamp - b.timestamp);
                const toDeleteCount = rolls.length - this.maxRollsPerEntry + 1;
                
                for (let i = 0; i < toDeleteCount; i++) {
                    if (sortedByOldest[i]?.id) {
                        await db.delete(storeName, sortedByOldest[i].id);
                    }
                }
                
                console.log(`[RollStore] 已清理 ${toDeleteCount} 条旧 Roll 记录，当前限制: ${this.maxRollsPerEntry}`);
            }
        } catch (error) {
            console.warn('[RollStore] 清理 Roll 记录失败:', error);
        }
    }

    /**
     * 获取条目的所有Roll结果
     * @param {string} category - 分类名称
     * @param {string} entryName - 条目名称
     * @returns {Promise<Array>} Roll结果列表(按时间倒序)
     */
    async getEntryRolls(category, entryName) {
        const entryKey = `${category}:${entryName}`;
        const results = await db.getByIndex(this.entryRollStoreName, 'entryKey', entryKey);
        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 根据ID获取Roll记录
     * @param {number} rollId - Roll记录ID
     * @returns {Promise<Object|null>} Roll记录
     */
    async getEntryRollById(rollId) {
        return db.get(this.entryRollStoreName, rollId);
    }

    /**
     * 删除指定的Roll记录
     * @param {number} rollId - Roll记录ID
     * @returns {Promise<void>}
     */
    async deleteEntryRoll(rollId) {
        await db.delete(this.entryRollStoreName, rollId);
    }

    /**
     * 清除条目的所有Roll历史
     * @param {string} category - 分类名称
     * @param {string} entryName - 条目名称
     * @returns {Promise<void>}
     */
    async clearEntryRolls(category, entryName) {
        const rolls = await this.getEntryRolls(category, entryName);
        for (const roll of rolls) {
            await db.delete(this.entryRollStoreName, roll.id);
        }
    }

    /**
     * 清除所有Roll历史
     * @returns {Promise<void>}
     */
    async clearAll() {
        await db.clear(this.rollStoreName);
        await db.clear(this.entryRollStoreName);
    }
}

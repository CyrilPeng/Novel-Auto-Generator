/**
 * Roll历史存储
 * 保存记忆块和条目级别的重Roll历史
 */
import { db } from './Database.js';

export class RollStore {
    constructor() {
        this.rollStoreName = 'rolls';
        this.entryRollStoreName = 'entryRolls';
    }

    /**
     * 保存记忆块级别的Roll结果
     * @param {number} memoryIndex - 记忆块索引
     * @param {Object} result - Roll结果
     * @returns {Promise<number>} Roll记录ID
     */
    async saveMemoryRoll(memoryIndex, result) {
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

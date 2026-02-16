/**
 * 状态存储
 * 保存和恢复处理状态(断点续传)
 */
import { db } from './Database.js';

export class StateStore {
    constructor() {
        this.storeName = 'state';
        this.key = 'currentState';
    }

    /**
     * 保存当前状态
     * @param {Object} state - 状态对象
     * @param {number} state.processedIndex - 已处理索引
     * @param {Array} state.memoryQueue - 记忆块队列
     * @param {Object} state.generatedWorldbook - 已生成的世界书
     * @param {Array} state.worldbookVolumes - 世界书卷列表
     * @param {number} state.currentVolumeIndex - 当前卷索引
     * @param {string} state.fileHash - 文件哈希
     * @param {string} state.novelName - 小说名称
     * @returns {Promise<void>}
     */
    async save(state) {
        const data = {
            key: this.key,
            timestamp: Date.now(),
            ...state
        };
        await db.put(this.storeName, data);
    }

    /**
     * 加载保存的状态
     * @returns {Promise<Object|null>} 状态对象
     */
    async load() {
        return db.get(this.storeName, this.key);
    }

    /**
     * 清除保存的状态
     * @returns {Promise<void>}
     */
    async clear() {
        await db.delete(this.storeName, this.key);
    }

    /**
     * 检查是否有保存的状态
     * @returns {Promise<boolean>} 是否有状态
     */
    async hasState() {
        const state = await this.load();
        return state !== null;
    }
}

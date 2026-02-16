/**
 * 状态管理类
 * 管理世界书处理的运行时状态
 */
import { StateStore } from '../db/StateStore.js';

export class State {
    constructor() {
        this.store = new StateStore();
        
        // 运行状态
        this.isProcessing = false;
        this.isPaused = false;
        this.isStopped = false;
        
        // 进度状态
        this.progress = {
            current: 0,
            total: 0,
            percentage: 0
        };
        
        // 当前任务
        this.currentTask = null;
        
        // 队列和结果
        this.memoryQueue = [];
        this.failedQueue = [];
        this.generatedWorldbook = {};
        
        // 处理索引
        this.currentIndex = 0;
        this.currentVolumeIndex = 0;
        
        // 文件信息
        this.currentFile = null;
        this.currentFileHash = null;
        
        // 统计信息
        this.stats = {
            startTime: null,
            endTime: null,
            generatedCount: 0,
            errorCount: 0,
            totalCharacters: 0
        };
    }

    /**
     * 重置状态
     */
    reset() {
        this.isProcessing = false;
        this.isPaused = false;
        this.isStopped = false;
        
        this.progress = { current: 0, total: 0, percentage: 0 };
        this.currentTask = null;
        this.memoryQueue = [];
        this.failedQueue = [];
        
        this.currentIndex = 0;
        this.stats = {
            startTime: null,
            endTime: null,
            generatedCount: 0,
            errorCount: 0,
            totalCharacters: 0
        };
    }

    /**
     * 保存状态到数据库
     */
    async saveToDB() {
        const state = {
            processedIndex: this.currentIndex,
            memoryQueue: this.memoryQueue,
            generatedWorldbook: this.generatedWorldbook,
            currentVolumeIndex: this.currentVolumeIndex,
            fileHash: this.currentFileHash,
            stats: this.stats
        };
        await this.store.save(state);
    }

    /**
     * 从数据库加载状态
     * @returns {Promise<boolean>} 是否成功加载
     */
    async loadFromDB() {
        const saved = await this.store.load();
        if (!saved) return false;

        this.currentIndex = saved.processedIndex || 0;
        this.memoryQueue = saved.memoryQueue || [];
        this.generatedWorldbook = saved.generatedWorldbook || {};
        this.currentVolumeIndex = saved.currentVolumeIndex || 0;
        this.currentFileHash = saved.fileHash || null;
        
        if (saved.stats) {
            this.stats = { ...this.stats, ...saved.stats };
        }

        return true;
    }

    /**
     * 清除保存的状态
     */
    async clearSavedState() {
        await this.store.clear();
    }

    /**
     * 更新进度
     * @param {number} current - 当前进度
     * @param {number} total - 总数
     */
    updateProgress(current, total) {
        this.progress.current = current;
        this.progress.total = total;
        this.progress.percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    }

    /**
     * 开始处理
     */
    start() {
        this.isProcessing = true;
        this.isStopped = false;
        this.stats.startTime = Date.now();
    }

    /**
     * 暂停处理
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * 恢复处理
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * 停止处理
     */
    stop() {
        this.isStopped = true;
        this.isProcessing = false;
        this.stats.endTime = Date.now();
    }

    /**
     * 完成处理
     */
    complete() {
        this.isProcessing = false;
        this.stats.endTime = Date.now();
    }

    /**
     * 记录生成成功
     * @param {number} charCount - 字符数
     */
    recordSuccess(charCount = 0) {
        this.stats.generatedCount++;
        this.stats.totalCharacters += charCount;
    }

    /**
     * 记录生成失败
     */
    recordError() {
        this.stats.errorCount++;
    }

    /**
     * 获取处理时长
     * @returns {number} 处理时长(毫秒)
     */
    getDuration() {
        const end = this.stats.endTime || Date.now();
        const start = this.stats.startTime || end;
        return end - start;
    }
}

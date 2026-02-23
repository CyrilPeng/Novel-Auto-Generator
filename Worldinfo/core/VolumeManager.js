/**
 * 分卷管理器
 * 处理超长篇小说的分卷逻辑
 */

/**
 * 分卷配置
 */
export class VolumeConfig {
    constructor({
        enabled = false,
        volumeSize = 10,        // 每卷包含的章节数
        maxVolumes = 100,       // 最大卷数
        autoSplit = true        // 自动分卷
    } = {}) {
        this.enabled = enabled;
        this.volumeSize = volumeSize;
        this.maxVolumes = maxVolumes;
        this.autoSplit = autoSplit;
    }
}

/**
 * 分卷数据
 */
export class Volume {
    constructor(index, title, chapters = []) {
        this.index = index;
        this.title = title || `第${index + 1}卷`;
        this.chapters = chapters;
        this.processed = false;
        this.processing = false;
        this.result = null;
        this.error = null;
    }

    /**
     * 添加章节
     */
    addChapter(chapter) {
        this.chapters.push(chapter);
    }

    /**
     * 获取章节总数
     */
    getChapterCount() {
        return this.chapters.length;
    }

    /**
     * 获取总字数
     */
    getTotalCharacters() {
        return this.chapters.reduce((sum, ch) => sum + ch.content.length, 0);
    }

    /**
     * 标记为处理完成
     */
    markCompleted(result) {
        this.processed = true;
        this.processing = false;
        this.result = result;
    }

    /**
     * 标记为处理失败
     */
    markFailed(error) {
        this.processing = false;
        this.error = error;
    }

    /**
     * 开始处理
     */
    markProcessing() {
        this.processing = true;
    }

    /**
     * 转换为 JSON
     */
    toJSON() {
        return {
            index: this.index,
            title: this.title,
            chapterCount: this.getChapterCount(),
            totalCharacters: this.getTotalCharacters(),
            processed: this.processed,
            processing: this.processing,
            result: this.result,
            error: this.error
        };
    }
}

/**
 * 分卷管理器
 */
export class VolumeManager {
    constructor(config = {}) {
        this.config = new VolumeConfig(config);
        this.volumes = [];
        this.currentVolumeIndex = 0;
        this.isCompleted = false;
    }

    /**
     * 初始化分卷
     * @param {Array} chapters - 章节数组
     * @returns {Array<Volume>} 分卷数组
     */
    initVolumes(chapters) {
        this.volumes = [];
        
        if (!this.config.enabled) {
            // 不分卷，所有章节放在一卷
            const volume = new Volume(0, '全集', [...chapters]);
            this.volumes.push(volume);
            return this.volumes;
        }

        const volumeSize = this.config.volumeSize;
        const totalVolumes = Math.ceil(chapters.length / volumeSize);

        for (let i = 0; i < totalVolumes && i < this.config.maxVolumes; i++) {
            const start = i * volumeSize;
            const end = Math.min(start + volumeSize, chapters.length);
            const volumeChapters = chapters.slice(start, end);
            
            const volume = new Volume(
                i,
                `第${i + 1}卷 (${start + 1}-${end}章)`,
                volumeChapters
            );
            
            this.volumes.push(volume);
        }

        return this.volumes;
    }

    /**
     * 获取当前卷
     * @returns {Volume|null} 当前卷
     */
    getCurrentVolume() {
        if (this.currentVolumeIndex >= this.volumes.length) {
            return null;
        }
        return this.volumes[this.currentVolumeIndex];
    }

    /**
     * 移动到下一卷
     * @returns {Volume|null} 新的当前卷
     */
    moveToNextVolume() {
        this.currentVolumeIndex++;
        return this.getCurrentVolume();
    }

    /**
     * 移动到指定卷
     * @param {number} index - 卷索引
     * @returns {Volume|null} 指定的卷
     */
    moveToVolume(index) {
        if (index >= 0 && index < this.volumes.length) {
            this.currentVolumeIndex = index;
            return this.volumes[index];
        }
        return null;
    }

    /**
     * 获取总卷数
     * @returns {number} 总卷数
     */
    getTotalVolumes() {
        return this.volumes.length;
    }

    /**
     * 获取已完成的卷数
     * @returns {number} 已完成卷数
     */
    getCompletedVolumes() {
        return this.volumes.filter(v => v.processed).length;
    }

    /**
     * 获取失败的卷数
     * @returns {number} 失败卷数
     */
    getFailedVolumes() {
        return this.volumes.filter(v => v.error !== null).length;
    }

    /**
     * 获取进度
     * @returns {Object} 进度信息
     */
    getProgress() {
        const total = this.getTotalVolumes();
        const completed = this.getCompletedVolumes();
        const failed = this.getFailedVolumes();
        
        return {
            current: this.currentVolumeIndex,
            total,
            completed,
            failed,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }

    /**
     * 合并所有卷的结果
     * @returns {Object} 合并后的世界书数据
     */
    mergeAllResults() {
        const merged = {};
        
        for (const volume of this.volumes) {
            if (volume.result && typeof volume.result === 'object') {
                for (const [category, entries] of Object.entries(volume.result)) {
                    if (!merged[category]) {
                        merged[category] = {};
                    }
                    Object.assign(merged[category], entries);
                }
            }
        }
        
        return merged;
    }

    /**
     * 导出所有卷
     * @param {Function} exporterFn - 导出函数
     * @param {Object} options - 导出选项
     * @returns {Array} 导出结果数组
     */
    exportAll(exporterFn, options = {}) {
        const results = [];
        
        for (const volume of this.volumes) {
            if (volume.result) {
                const filename = options.filename 
                    ? `${options.filename}_vol${volume.index + 1}`
                    : `worldbook_vol${volume.index + 1}`;
                
                const result = exporterFn(volume.result, { ...options, filename });
                results.push({ volume: volume.index, result });
            }
        }
        
        return results;
    }

    /**
     * 重置管理器
     */
    reset() {
        this.currentVolumeIndex = 0;
        this.isCompleted = false;
        for (const volume of this.volumes) {
            volume.processed = false;
            volume.processing = false;
            volume.result = null;
            volume.error = null;
        }
    }

    /**
     * 完成处理
     */
    complete() {
        this.isCompleted = true;
    }

    /**
     * 获取分卷统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const totalChapters = this.volumes.reduce((sum, v) => sum + v.getChapterCount(), 0);
        const totalCharacters = this.volumes.reduce((sum, v) => sum + v.getTotalCharacters(), 0);
        
        return {
            totalVolumes: this.getTotalVolumes(),
            totalChapters,
            totalCharacters,
            completedVolumes: this.getCompletedVolumes(),
            failedVolumes: this.getFailedVolumes(),
            progress: this.getProgress()
        };
    }

    /**
     * 从配置创建分卷管理器
     */
    static fromConfig(config) {
        return new VolumeManager(config);
    }
}

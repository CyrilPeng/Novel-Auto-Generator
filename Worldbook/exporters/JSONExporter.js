/**
 * JSON格式导出器
 * 导出为世界书原始JSON格式
 */
import { downloadFile } from '../utils/file.js';

export class JSONExporter {
    constructor() {
        this.mimeType = 'application/json';
        this.extension = 'json';
    }

    /**
     * 导出为世界书JSON格式
     * @param {Object} worldbook - 世界书数据
     * @param {Object} options - 导出选项
     * @param {boolean} options.pretty - 是否格式化
     * @returns {string} JSON字符串
     */
    export(worldbook, options = {}) {
        const indent = options.pretty !== false ? 2 : 0;
        const data = {
            version: 1,
            exportTime: new Date().toISOString(),
            categories: worldbook
        };
        return JSON.stringify(data, null, indent);
    }

    /**
     * 导出并下载文件
     * @param {Object} worldbook - 世界书数据
     * @param {Object} options - 导出选项
     */
    download(worldbook, options = {}) {
        const content = this.export(worldbook, options);
        const filename = options.filename || 'worldbook_data.json';
        downloadFile(content, filename, this.mimeType);
    }

    /**
     * 导出任务配置
     * @param {Object} task - 任务数据
     * @param {Object} options - 导出选项
     */
    downloadTask(task, options = {}) {
        const content = JSON.stringify(task, null, 2);
        const filename = options.filename || 'worldbook_task.json';
        downloadFile(content, filename, this.mimeType);
    }
}

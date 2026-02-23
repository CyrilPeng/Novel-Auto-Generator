/**
 * 导出器基础类
 * 所有导出器的基类
 */
import { downloadFile } from '../utils/file.js';

/**
 * 导出器配置
 */
export class ExporterConfig {
    constructor({
        filename = 'exported_data',
        mimeType = 'application/json',
        extension = 'dat'
    } = {}) {
        this.filename = filename;
        this.mimeType = mimeType;
        this.extension = extension;
    }
}

/**
 * 导出器基础类
 */
export class BaseExporter {
    constructor(config = {}) {
        this.config = new ExporterConfig(config);
    }

    /**
     * 导出数据（抽象方法，子类实现）
     * @param {Object} data - 要导出的数据
     * @param {Object} options - 导出选项
     * @returns {string} 导出内容
     */
    export(data, options = {}) {
        throw new Error('子类必须实现 export 方法');
    }

    /**
     * 下载文件
     * @param {string} content - 文件内容
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME 类型
     */
    download(content, filename = null, mimeType = null) {
        const finalFilename = filename || this.config.filename + '.' + this.config.extension;
        const finalMimeType = mimeType || this.config.mimeType;
        downloadFile(content, finalFilename, finalMimeType);
    }

    /**
     * 导出并下载
     * @param {Object} data - 要导出的数据
     * @param {Object} options - 导出选项
     */
    exportAndDownload(data, options = {}) {
        const content = this.export(data, options);
        const filename = options.filename || this.config.filename + '.' + this.config.extension;
        this.download(content, filename, options.mimeType);
    }

    /**
     * 获取文件名（带时间戳）
     * @param {string} prefix - 文件名前缀
     * @returns {string} 文件名
     */
    getTimestampedFilename(prefix = 'export') {
        const timestamp = Date.now();
        return `${prefix}_${timestamp}.${this.config.extension}`;
    }

    /**
     * 格式化 JSON
     * @param {Object} data - 数据
     * @param {number} spaces - 缩进空格数
     * @returns {string} 格式化后的 JSON 字符串
     */
    formatJSON(data, spaces = 2) {
        return JSON.stringify(data, null, spaces);
    }

    /**
     * 合并多个数据集
     * @param {Array<Object>} datasets - 数据集数组
     * @returns {Object} 合并后的数据
     */
    mergeDatasets(datasets) {
        return Object.assign({}, ...datasets);
    }
}

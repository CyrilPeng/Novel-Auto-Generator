/**
 * 任务导入导出工具
 * 支持保存和恢复完整的处理进度
 */

/**
 * 任务数据结构
 */
export class TaskData {
    constructor() {
        this.version = '1.0.0';
        this.exportedAt = Date.now();
        this.fileName = '';
        this.fileHash = '';
        this.processedIndex = 0;
        this.memoryQueue = [];
        this.generatedWorldbook = {};
        this.settings = {};
    }
}

/**
 * 任务导出器
 */
export class TaskExporter {
    /**
     * 导出任务数据
     * @param {Object} data - 任务数据
     * @returns {string} JSON 字符串
     */
    export(data) {
        const taskData = new TaskData();
        taskData.fileName = data.fileName || 'unknown';
        taskData.fileHash = data.fileHash || '';
        taskData.processedIndex = data.processedIndex || 0;
        taskData.memoryQueue = data.memoryQueue || [];
        taskData.generatedWorldbook = data.generatedWorldbook || {};
        taskData.settings = data.settings || {};

        return JSON.stringify(taskData, null, 2);
    }

    /**
     * 下载任务文件
     * @param {Object} data - 任务数据
     * @param {string} filename - 文件名
     */
    download(data, filename = null) {
        const content = this.export(data);
        const defaultName = filename || `task_${Date.now()}.json`;

        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/**
 * 任务导入器
 */
export class TaskImporter {
    /**
     * 导入任务文件
     * @param {File} file - 任务文件
     * @returns {Promise<Object>} 任务数据
     */
    async import(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const validated = this.validate(data);
                    if (validated.valid) {
                        resolve(validated.data);
                    } else {
                        reject(new Error(validated.error));
                    }
                } catch (error) {
                    reject(new Error('无效的 JSON 格式：' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }

    /**
     * 验证任务数据
     * @param {Object} data - 任务数据
     * @returns {Object} 验证结果
     */
    validate(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: '无效的任务数据格式' };
        }

        if (!data.version) {
            return { valid: false, error: '缺少版本号' };
        }

        // 版本兼容性检查
        const [major] = data.version.split('.').map(Number);
        if (major !== 1) {
            return { valid: false, error: `不支持的版本：${data.version}` };
        }

        // 必需字段检查
        const required = ['memoryQueue', 'generatedWorldbook'];
        for (const field of required) {
            if (!(field in data)) {
                return { valid: false, error: `缺少必需字段：${field}` };
            }
        }

        // 数组类型检查
        if (!Array.isArray(data.memoryQueue)) {
            return { valid: false, error: 'memoryQueue 必须是数组' };
        }

        // 对象类型检查
        if (typeof data.generatedWorldbook !== 'object') {
            return { valid: false, error: 'generatedWorldbook 必须是对象' };
        }

        return { valid: true, data };
    }

    /**
     * 从剪贴板粘贴导入
     * @param {string} jsonString - JSON 字符串
     * @returns {Object} 验证后的数据
     */
    importFromClipboard(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            const validated = this.validate(data);
            if (validated.valid) {
                return validated.data;
            }
            throw new Error(validated.error);
        } catch (error) {
            throw new Error('无效的 JSON 格式：' + error.message);
        }
    }
}

/**
 * 任务管理器
 * 统一管理任务的导入导出
 */
export class TaskManager {
    constructor() {
        this.exporter = new TaskExporter();
        this.importer = new TaskImporter();
    }

    /**
     * 导出当前任务
     * @param {Object} data - 任务数据
     * @param {string} filename - 文件名
     */
    exportTask(data, filename = null) {
        this.exporter.download(data, filename);
    }

    /**
     * 导入任务文件
     * @param {File} file - 任务文件
     * @returns {Promise<Object>} 任务数据
     */
    async importTask(file) {
        return this.importer.import(file);
    }

    /**
     * 创建任务文件名
     * @param {string} baseName - 基础文件名
     * @returns {string} 完整文件名
     */
    createFilename(baseName) {
        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
        return `task_${baseName || 'backup'}_${timestamp}.json`;
    }
}

// 创建单例
export const taskManager = new TaskManager();

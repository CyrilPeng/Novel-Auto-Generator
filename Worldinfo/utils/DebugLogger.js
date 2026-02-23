/**
 * 调试日志工具
 * 提供带时间戳的实时调试输出功能
 */

export class DebugLogger {
    constructor(options = {}) {
        this.enabled = options.enabled || false;
        this.containerId = options.containerId || 'ww-debug-log';
        this.maxLines = options.maxLines || 100;
        this.lines = [];
    }

    /**
     * 启用调试模式
     */
    enable() {
        this.enabled = true;
    }

    /**
     * 禁用调试模式
     */
    disable() {
        this.enabled = false;
    }

    /**
     * 记录调试日志
     * @param {string} message - 日志消息
     * @param {string} type - 日志类型：info|success|warning|error
     */
    log(message, type = 'info') {
        if (!this.enabled) return;

        const now = new Date();
        const timestamp = now.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            debug: '🔍'
        };

        const logEntry = {
            timestamp,
            type,
            message,
            icon: icons[type] || icons.info
        };

        this.lines.push(logEntry);

        // 限制最大行数
        if (this.lines.length > this.maxLines) {
            this.lines.shift();
        }

        this.render();
        console.log(`[${timestamp}] ${logEntry.icon} ${message}`);
    }

    /**
     * 记录信息日志
     */
    info(message) {
        this.log(message, 'info');
    }

    /**
     * 记录成功日志
     */
    success(message) {
        this.log(message, 'success');
    }

    /**
     * 记录警告日志
     */
    warning(message) {
        this.log(message, 'warning');
    }

    /**
     * 记录错误日志
     */
    error(message) {
        this.log(message, 'error');
    }

    /**
     * 记录调试日志
     */
    debug(message) {
        this.log(message, 'debug');
    }

    /**
     * 渲染日志到容器
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = this.lines.map(line => `
            <div class="ww-debug-line ww-debug-${line.type}" style="
                padding:4px 8px;
                margin:2px 0;
                background:rgba(0,0,0,0.2);
                border-radius:4px;
                font-size:11px;
                font-family:monospace;
                display:flex;
                align-items:center;
                gap:8px;
            ">
                <span style="color:#888;flex-shrink:0;">${line.timestamp}</span>
                <span style="flex-shrink:0;">${line.icon}</span>
                <span style="flex:1;word-break:break-all;">${this.escapeHtml(line.message)}</span>
            </div>
        `).join('');

        // 自动滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    /**
     * 清空日志
     */
    clear() {
        this.lines = [];
        this.render();
    }

    /**
     * 获取所有日志
     */
    getAll() {
        return [...this.lines];
    }

    /**
     * 导出日志为文本
     */
    exportAsText() {
        return this.lines.map(line => `[${line.timestamp}] ${line.icon} ${line.message}`).join('\n');
    }

    /**
     * 导出日志为 JSON
     */
    exportAsJSON() {
        return JSON.stringify(this.lines, null, 2);
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 创建全局实例
export const debugLogger = new DebugLogger();

// 便捷函数
export function enableDebug() {
    debugLogger.enable();
}

export function disableDebug() {
    debugLogger.disable();
}

export function debugLog(message, type = 'info') {
    debugLogger.log(message, type);
}

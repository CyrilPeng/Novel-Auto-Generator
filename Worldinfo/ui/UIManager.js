/**
 * UI 管理器
 * 统一管理所有 UI 组件和事件
 */
import { ToastManager, toastManager } from './components/Toast.js';

/**
 * 事件发射器
 */
class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    /**
     * 监听事件
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
        return this;
    }

    /**
     * 监听一次事件
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    once(event, callback) {
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            callback(...args);
        };
        return this.on(event, onceWrapper);
    }

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {any} data - 事件数据
     */
    emit(event, data) {
        const callbacks = this.events.get(event) || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`[UIManager] 事件处理错误: ${event}`, e);
            }
        });
        return this;
    }

    /**
     * 移除监听
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    off(event, callback) {
        if (!this.events.has(event)) return this;
        
        if (callback) {
            const callbacks = this.events.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        } else {
            this.events.delete(event);
        }
        return this;
    }

    /**
     * 清空所有事件
     */
    clear() {
        this.events.clear();
        return this;
    }
}

/**
 * UI 管理器配置
 */
export class UIManagerConfig {
    constructor({
        containerId = 'worldinfo-container',
        toastEnabled = true,
        debugMode = false
    } = {}) {
        this.containerId = containerId;
        this.toastEnabled = toastEnabled;
        this.debugMode = debugMode;
    }
}

/**
 * UI 管理器
 */
export class UIManager {
    constructor(config = {}) {
        this.config = new UIManagerConfig(config);
        this.container = null;
        this.eventBus = new EventEmitter();
        this.toastManager = toastManager;
        this.panels = new Map();
        this.modals = new Map();
        this.isInitialized = false;
    }

    /**
     * 初始化 UI 管理器
     * @param {string} containerId - 容器 ID
     * @returns {UIManager} this
     */
    init(containerId = null) {
        const id = containerId || this.config.containerId;
        this.container = document.getElementById(id);
        
        if (!this.container) {
            console.warn(`[UIManager] 容器 #${id} 不存在`);
            return this;
        }
        
        this.isInitialized = true;
        this.emit('init', { container: this.container });
        
        return this;
    }

    /**
     * 注册面板
     * @param {string} name - 面板名称
     * @param {Object} panel - 面板对象
     * @returns {UIManager} this
     */
    registerPanel(name, panel) {
        this.panels.set(name, panel);
        this.emit('panel.register', { name, panel });
        return this;
    }

    /**
     * 获取面板
     * @param {string} name - 面板名称
     * @returns {Object|null} 面板对象
     */
    getPanel(name) {
        return this.panels.get(name) || null;
    }

    /**
     * 显示面板
     * @param {string} name - 面板名称
     * @returns {UIManager} this
     */
    showPanel(name) {
        const panel = this.getPanel(name);
        if (panel) {
            this.panels.forEach((p, n) => {
                if (n === name) {
                    p.show?.();
                } else {
                    p.hide?.();
                }
            });
            this.emit('panel.show', { name });
        }
        return this;
    }

    /**
     * 隐藏面板
     * @param {string} name - 面板名称
     * @returns {UIManager} this
     */
    hidePanel(name) {
        const panel = this.getPanel(name);
        if (panel) {
            panel.hide?.();
            this.emit('panel.hide', { name });
        }
        return this;
    }

    /**
     * 切换面板显示状态
     * @param {string} name - 面板名称
     * @returns {UIManager} this
     */
    togglePanel(name) {
        const panel = this.getPanel(name);
        if (panel) {
            if (panel.isVisible) {
                panel.hide?.();
            } else {
                panel.show?.();
            }
        }
        return this;
    }

    /**
     * 注册模态框
     * @param {string} name - 模态框名称
     * @param {Modal} modal - 模态框对象
     * @returns {UIManager} this
     */
    registerModal(name, modal) {
        this.modals.set(name, modal);
        return this;
    }

    /**
     * 获取模态框
     * @param {string} name - 模态框名称
     * @returns {Modal|null} 模态框对象
     */
    getModal(name) {
        return this.modals.get(name) || null;
    }

    /**
     * 显示模态框
     * @param {string} name - 模态框名称
     * @param {string} content - 模态框内容
     * @returns {Modal|null} 模态框对象
     */
    showModal(name, content) {
        const modal = this.getModal(name);
        if (modal) {
            modal.open(content);
            return modal;
        }
        return null;
    }

    /**
     * 关闭模态框
     * @param {string} name - 模态框名称
     * @returns {UIManager} this
     */
    closeModal(name) {
        const modal = this.getModal(name);
        if (modal) {
            modal.close();
        }
        return this;
    }

    /**
     * 关闭所有模态框
     * @returns {UIManager} this
     */
    closeAllModals() {
        this.modals.forEach(modal => modal.close());
        return this;
    }

    /**
     * 显示 Toast
     * @param {string} message - 消息
     * @param {string} type - 类型
     * @returns {Toast} Toast 实例
     */
    toast(message, type = 'info') {
        if (!this.config.toastEnabled) return null;
        
        switch (type) {
            case 'success':
                return this.toastManager.success(message);
            case 'warning':
                return this.toastManager.warning(message);
            case 'error':
                return this.toastManager.error(message);
            default:
                return this.toastManager.info(message);
        }
    }

    /**
     * 显示成功 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    success(message) {
        return this.toast(message, 'success');
    }

    /**
     * 显示警告 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    warning(message) {
        return this.toast(message, 'warning');
    }

    /**
     * 显示错误 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    error(message) {
        return this.toast(message, 'error');
    }

    /**
     * 显示信息 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    info(message) {
        return this.toast(message, 'info');
    }

    /**
     * 监听事件
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     * @returns {UIManager} this
     */
    on(event, callback) {
        this.eventBus.on(event, callback);
        return this;
    }

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {any} data - 事件数据
     * @returns {UIManager} this
     */
    emit(event, data) {
        this.eventBus.emit(event, data);
        return this;
    }

    /**
     * 调试日志
     * @param {string} message - 消息
     */
    debug(message) {
        if (this.config.debugMode) {
            console.log(`[UIManager] ${message}`);
        }
    }

    /**
     * 销毁管理器
     */
    destroy() {
        this.closeAllModals();
        this.eventBus.clear();
        this.panels.clear();
        this.modals.clear();
        this.container = null;
        this.isInitialized = false;
    }
}

// 创建全局实例
export const uiManager = new UIManager();

// 便捷函数
export function createUIManager(config) {
    return new UIManager(config);
}

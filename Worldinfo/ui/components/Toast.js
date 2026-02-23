/**
 * Toast 提示组件
 * 显示短暂的消息提示
 */

/**
 * Toast 配置
 */
export class ToastConfig {
    constructor({
        message = '',
        type = 'info',
        duration = 3000,
        position = 'top-center',
        closable = true,
        icon = null
    } = {}) {
        this.message = message;
        this.type = type; // info, success, warning, error
        this.duration = duration;
        this.position = position; // top-center, top-right, bottom-center, bottom-right
        this.closable = closable;
        this.icon = icon;
    }
}

/**
 * Toast 管理器
 */
export class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.maxToasts = 5;
    }

    /**
     * 获取或创建容器
     * @returns {HTMLElement} 容器元素
     */
    getContainer() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'ww-toast-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 100000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
            `;
            document.body.appendChild(this.container);
        }
        return this.container;
    }

    /**
     * 显示 Toast
     * @param {string|ToastConfig} options - 消息或配置
     * @returns {Toast} Toast 实例
     */
    show(options) {
        const config = typeof options === 'string' 
            ? new ToastConfig({ message: options })
            : new ToastConfig(options);
        
        const toast = new Toast(config);
        const container = this.getContainer();
        
        // 移除旧的 Toast
        while (this.toasts.length >= this.maxToasts) {
            const oldToast = this.toasts.shift();
            oldToast.destroy();
        }
        
        const element = toast.create();
        container.appendChild(element);
        this.toasts.push(toast);
        
        // 自动关闭
        if (config.duration > 0) {
            setTimeout(() => {
                toast.close();
                this.toasts = this.toasts.filter(t => t !== toast);
            }, config.duration);
        }
        
        return toast;
    }

    /**
     * 显示信息 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    info(message) {
        return this.show({ message, type: 'info' });
    }

    /**
     * 显示成功 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    success(message) {
        return this.show({ message, type: 'success', icon: '✅' });
    }

    /**
     * 显示警告 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    warning(message) {
        return this.show({ message, type: 'warning', icon: '⚠️' });
    }

    /**
     * 显示错误 Toast
     * @param {string} message - 消息
     * @returns {Toast} Toast 实例
     */
    error(message) {
        return this.show({ message, type: 'error', icon: '❌' });
    }

    /**
     * 关闭所有 Toast
     */
    clearAll() {
        this.toasts.forEach(toast => toast.destroy());
        this.toasts = [];
    }
}

/**
 * Toast 组件
 */
export class Toast {
    constructor(config = {}) {
        this.config = new ToastConfig(config);
        this.element = null;
        this.isClosed = false;
    }

    /**
     * 创建 Toast 元素
     * @returns {HTMLElement} Toast 容器
     */
    create() {
        const { message, type, icon, closable } = this.config;
        
        const toast = document.createElement('div');
        toast.className = `ww-toast ww-toast-${type}`;
        toast.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: var(--ww-bg-primary);
            border: 1px solid var(--ww-border);
            border-radius: var(--ww-radius);
            box-shadow: var(--ww-shadow);
            min-width: 200px;
            max-width: 400px;
            animation: wwToastSlideIn 0.3s ease;
        `;
        
        // 图标
        const iconEl = document.createElement('span');
        iconEl.style.fontSize = '18px';
        iconEl.textContent = icon || this.getDefaultIcon();
        toast.appendChild(iconEl);
        
        // 消息
        const messageEl = document.createElement('span');
        messageEl.className = 'ww-toast-message';
        messageEl.textContent = message;
        messageEl.style.flex = '1';
        toast.appendChild(messageEl);
        
        // 关闭按钮
        if (closable) {
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕';
            closeBtn.style.cssText = `
                background: transparent;
                border: none;
                color: var(--ww-text-secondary);
                cursor: pointer;
                font-size: 16px;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            closeBtn.addEventListener('click', () => this.close());
            toast.appendChild(closeBtn);
        }
        
        this.element = toast;
        return toast;
    }

    /**
     * 获取默认图标
     * @returns {string} 图标
     */
    getDefaultIcon() {
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        return icons[this.config.type] || icons.info;
    }

    /**
     * 关闭 Toast
     */
    close() {
        if (this.isClosed || !this.element) return;
        
        this.isClosed = true;
        this.element.style.animation = 'wwToastSlideOut 0.3s ease';
        
        setTimeout(() => {
            this.destroy();
        }, 300);
    }

    /**
     * 销毁 Toast
     */
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.remove();
        }
        this.element = null;
    }

    /**
     * 更新消息
     * @param {string} message - 新消息
     */
    updateMessage(message) {
        const messageEl = this.element?.querySelector('.ww-toast-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes wwToastSlideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes wwToastSlideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 创建全局 Toast 管理器实例
export const toastManager = new ToastManager();

// 便捷函数
export function showToast(options) {
    return toastManager.show(options);
}

export function showInfo(message) {
    return toastManager.info(message);
}

export function showSuccess(message) {
    return toastManager.success(message);
}

export function showWarning(message) {
    return toastManager.warning(message);
}

export function showError(message) {
    return toastManager.error(message);
}

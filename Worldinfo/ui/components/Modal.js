/**
 * 弹窗组件
 * 提供通用的模态框功能
 */
export class Modal {
    constructor(options = {}) {
        this.options = {
            title: options.title || '标题',
            width: options.width || '600px',
            maxWidth: options.maxWidth || '90%',
            closable: options.closable !== false,
            maskClosable: options.maskClosable || false,
            onOpen: options.onOpen || (() => {}),
            onClose: options.onClose || (() => {}),
            ...options
        };
        
        this.element = null;
        this.isOpen = false;
    }

    /**
     * 创建弹窗 HTML
     * @param {string} content - 弹窗内容
     * @returns {string} HTML 字符串
     */
    createHTML(content) {
        const { title, width, maxWidth, closable } = this.options;
        
        return `
            <div class="ww-modal-container">
                <div class="ww-modal" style="width: ${width}; max-width: ${maxWidth};">
                    <div class="ww-modal-header">
                        <span class="ww-modal-title">${this.escapeHtml(title)}</span>
                        ${closable ? '<button class="ww-modal-close" type="button">✕</button>' : ''}
                    </div>
                    <div class="ww-modal-body">
                        ${content}
                    </div>
                    ${this.createFooterHTML()}
                </div>
            </div>
        `;
    }

    /**
     * 创建底部 HTML
     * @returns {string} HTML 字符串
     */
    createFooterHTML() {
        const buttons = this.options.buttons || [];
        if (buttons.length === 0) return '';

        return `
            <div class="ww-modal-footer">
                ${buttons.map(btn => `
                    <button type="button" class="ww-btn ww-btn-${btn.type || 'secondary'}" data-action="${btn.action || ''}">
                        ${btn.text || '按钮'}
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * 打开弹窗
     * @param {string} content - 弹窗内容
     */
    open(content) {
        // 如果已经打开，先关闭
        if (this.isOpen) {
            this.close();
        }

        // 如果已有元素，先移除
        if (this.element && this.element.parentElement) {
            this.element.remove();
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.createHTML(content);
        this.element = tempDiv.firstElementChild;
        document.body.appendChild(this.element);

        // 锁定 body 滚动
        document.body.style.overflow = 'hidden';

        this.bindEvents();
        this.isOpen = true;

        // 触发重排后添加动画类，确保动画平滑
        requestAnimationFrame(() => {
            const modal = this.element.querySelector('.ww-modal');
            if (modal) {
                modal.classList.add('ww-modal-visible');
            }
        });

        this.options.onOpen(this);
    }

    /**
     * 关闭弹窗
     */
    close() {
        if (!this.isOpen || !this.element) return;

        this.options.onClose(this);

        // 移除 ESC 处理器
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        // 移除可见类，触发动画
        const modal = this.element.querySelector('.ww-modal');
        if (modal) {
            modal.classList.remove('ww-modal-visible');
        }

        // 等待动画完成后移除元素
        setTimeout(() => {
            if (this.element && this.element.parentElement) {
                this.element.remove();
                this.element = null;
                this.isOpen = false;

                // 检查是否还有其他打开的模态框
                const remainingModals = document.querySelectorAll('.ww-modal-container');
                const worldinfoContainer = document.getElementById('worldinfo-app-container');
                const hasVisiblePanel = worldinfoContainer &&
                                        worldinfoContainer.style.pointerEvents === 'auto' &&
                                        worldinfoContainer.style.background !== 'transparent';

                // 只有当没有模态框和可见面板时，才恢复 body 滚动
                if (remainingModals.length === 0 && !hasVisiblePanel) {
                    document.body.style.overflow = '';
                }
            }
        }, 200); // 与 CSS 动画时间匹配
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 关闭按钮
        const closeBtn = this.element.querySelector('.ww-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            });
        }

        // 点击遮罩关闭
        if (this.options.maskClosable) {
            const container = this.element;
            container.addEventListener('click', (e) => {
                if (e.target === container) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.close();
                } else {
                    // 阻止弹窗内部点击事件冒泡到 document，避免触发外部事件
                    e.stopPropagation();
                }
            });
        } else {
            // 即使不允许点击遮罩关闭，也要阻止事件冒泡
            const container = this.element;
            container.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 阻止弹窗内部点击事件冒泡到背景
        const modal = this.element.querySelector('.ww-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 阻止弹窗内容区域点击事件冒泡
        const modalBody = this.element.querySelector('.ww-modal-body');
        if (modalBody) {
            modalBody.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 阻止弹窗头部点击事件冒泡
        const modalHeader = this.element.querySelector('.ww-modal-header');
        if (modalHeader) {
            modalHeader.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 阻止弹窗底部点击事件冒泡
        const modalFooter = this.element.querySelector('.ww-modal-footer');
        if (modalFooter) {
            modalFooter.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 按钮点击事件
        this.element.querySelectorAll('.ww-modal-footer button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                if (this.options.onButtonClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.options.onButtonClick(action, e, this);
                }
            });
        });

        // ESC 关闭 - 只允许 closable 时关闭
        if (this.options.closable) {
            this._escHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.close();
                    document.removeEventListener('keydown', this._escHandler);
                }
            };
            document.addEventListener('keydown', this._escHandler);
        }
    }

    /**
     * 更新弹窗内容
     * @param {string} content - 新内容
     */
    updateContent(content) {
        const body = this.element?.querySelector('.ww-modal-body');
        if (body) {
            body.innerHTML = content;
        }
    }

    /**
     * 设置按钮状态
     * @param {string} action - 按钮动作
     * @param {Object} props - 按钮属性
     */
    setButtonProps(action, props) {
        const btn = this.element?.querySelector(`[data-action="${action}"]`);
        if (btn) {
            if (props.disabled !== undefined) btn.disabled = props.disabled;
            if (props.text) btn.textContent = props.text;
        }
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 销毁弹窗
     * 完全清理事件监听器和资源
     */
    destroy() {
        if (!this.element) return;

        // 移除 ESC 处理器
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        // 直接移除元素，不等待动画
        if (this.element && this.element.parentElement) {
            this.element.remove();
        }
        this.element = null;
        this.isOpen = false;

        // 恢复 body 滚动
        const remainingModals = document.querySelectorAll('.ww-modal-container');
        if (remainingModals.length === 0) {
            document.body.style.overflow = '';
        }

        // 清理回调引用
        this.options.onOpen = null;
        this.options.onClose = null;
        this.options.onButtonClick = null;

        // 清空选项
        this.options = {};
    }

    /**
     * 静态方法：快速创建并打开弹窗
     */
    static alert(message, options = {}) {
        const modal = new Modal({
            title: options.title || '提示',
            width: options.width || '400px',
            buttons: [{ text: '确定', type: 'primary', action: 'ok' }],
            ...options
        });
        modal.open(`<p style="margin:0;">${message}</p>`);
        return modal;
    }

    static confirm(message, options = {}) {
        return new Promise((resolve) => {
            const modal = new Modal({
                title: options.title || '确认',
                width: options.width || '400px',
                buttons: [
                    { text: '取消', type: 'secondary', action: 'cancel' },
                    { text: '确定', type: 'primary', action: 'ok' }
                ],
                onButtonClick: (action) => {
                    modal.close();
                    resolve(action === 'ok');
                },
                ...options
            });
            modal.open(`<p style="margin:0;">${message}</p>`);
        });
    }
}

/**
 * 按钮组件
 * 提供统一的按钮样式和功能
 */

/**
 * 按钮配置
 */
export class ButtonConfig {
    constructor({
        text = '按钮',
        type = 'secondary',
        size = 'normal',
        icon = null,
        disabled = false,
        loading = false,
        block = false,
        tooltip = null
    } = {}) {
        this.text = text;
        this.type = type; // primary, secondary, success, warning, danger, info, purple
        this.size = size; // small, normal, large
        this.icon = icon;
        this.disabled = disabled;
        this.loading = loading;
        this.block = block;
        this.tooltip = tooltip;
    }
}

/**
 * 按钮组件
 */
export class Button {
    constructor(config = {}) {
        this.config = new ButtonConfig(config);
        this.element = null;
        this.onClick = null;
    }

    /**
     * 创建按钮元素
     * @returns {HTMLElement} 按钮元素
     */
    create() {
        const { text, type, size, icon, disabled, loading, block, tooltip } = this.config;
        
        this.element = document.createElement('button');
        this.element.className = `ww-btn ww-btn-${type}`;
        
        if (size === 'small') this.element.classList.add('ww-btn-small');
        if (size === 'large') this.element.classList.add('ww-btn-large');
        if (block) this.element.classList.add('ww-btn-block');
        if (disabled) this.element.disabled = true;
        if (loading) this.element.classList.add('ww-btn-loading');
        if (tooltip) {
            this.element.classList.add('ww-tooltip');
            this.element.dataset.tooltip = tooltip;
        }

        this.element.innerHTML = this.createInnerHTML();
        
        return this.element;
    }

    /**
     * 创建内部 HTML
     */
    createInnerHTML() {
        const { text, icon, loading } = this.config;
        
        let html = '';
        
        if (loading) {
            html += '<span class="ww-btn-spinner">⏳</span>';
        } else if (icon) {
            html += `<span class="ww-btn-icon">${icon}</span>`;
        }
        
        html += `<span class="ww-btn-text">${text}</span>`;
        
        return html;
    }

    /**
     * 设置点击事件
     * @param {Function} handler - 点击处理函数
     * @returns {Button} this
     */
    click(handler) {
        this.onClick = handler;
        if (this.element) {
            this.element.addEventListener('click', (e) => {
                if (!this.config.disabled && !this.config.loading) {
                    handler(e, this);
                }
            });
        }
        return this;
    }

    /**
     * 设置禁用状态
     * @param {boolean} disabled - 是否禁用
     * @returns {Button} this
     */
    setDisabled(disabled) {
        this.config.disabled = disabled;
        if (this.element) {
            this.element.disabled = disabled;
        }
        return this;
    }

    /**
     * 设置加载状态
     * @param {boolean} loading - 是否加载中
     * @returns {Button} this
     */
    setLoading(loading) {
        this.config.loading = loading;
        if (this.element) {
            this.element.classList.toggle('ww-btn-loading', loading);
            this.element.disabled = loading;
            this.updateInnerHTML();
        }
        return this;
    }

    /**
     * 设置文本
     * @param {string} text - 新文本
     * @returns {Button} this
     */
    setText(text) {
        this.config.text = text;
        if (this.element) {
            const textEl = this.element.querySelector('.ww-btn-text');
            if (textEl) textEl.textContent = text;
        }
        return this;
    }

    /**
     * 设置图标
     * @param {string} icon - 新图标
     * @returns {Button} this
     */
    setIcon(icon) {
        this.config.icon = icon;
        if (this.element) {
            this.updateInnerHTML();
        }
        return this;
    }

    /**
     * 更新内部 HTML
     */
    updateInnerHTML() {
        if (this.element) {
            this.element.innerHTML = this.createInnerHTML();
        }
    }

    /**
     * 获取元素
     * @returns {HTMLElement} 按钮元素
     */
    getElement() {
        return this.element;
    }

    /**
     * 静态方法：创建按钮组
     * @param {Array<Button|Object>} buttons - 按钮配置数组
     * @returns {HTMLElement} 按钮组容器
     */
    static createGroup(buttons) {
        const container = document.createElement('div');
        container.className = 'ww-btn-group';
        container.style.display = 'flex';
        container.style.gap = '8px';
        container.style.flexWrap = 'wrap';

        for (const btnConfig of buttons) {
            const btn = btnConfig instanceof Button ? btnConfig : new Button(btnConfig);
            const el = btn.create();
            container.appendChild(el);
        }

        return container;
    }

    /**
     * 静态方法：创建图标按钮
     * @param {string} icon - 图标
     * @param {string} tooltip - 提示
     * @returns {Button} 按钮实例
     */
    static icon(icon, tooltip = '') {
        return new Button({
            icon,
            tooltip,
            size: 'small',
            type: 'secondary'
        });
    }
}

/**
 * 卡片组件
 * 显示内容卡片
 */

/**
 * 卡片配置
 */
export class CardConfig {
    constructor({
        title = '',
        subtitle = '',
        content = '',
        footer = '',
        collapsible = false,
        collapsed = false,
        icon = null,
        headerClass = '',
        bodyClass = '',
        footerClass = ''
    } = {}) {
        this.title = title;
        this.subtitle = subtitle;
        this.content = content;
        this.footer = footer;
        this.collapsible = collapsible;
        this.collapsed = collapsed;
        this.icon = icon;
        this.headerClass = headerClass;
        this.bodyClass = bodyClass;
        this.footerClass = footerClass;
    }
}

/**
 * 卡片组件
 */
export class Card {
    constructor(config = {}) {
        this.config = new CardConfig(config);
        this.element = null;
        this.onToggle = null;
    }

    /**
     * 创建卡片元素
     * @returns {HTMLElement} 卡片容器
     */
    create() {
        const { title, subtitle, content, footer, collapsible, collapsed, icon, headerClass, bodyClass, footerClass } = this.config;
        
        const card = document.createElement('div');
        card.className = 'ww-card';
        
        // 创建头部
        if (title || icon) {
            const header = document.createElement('div');
            header.className = `ww-card-header ${headerClass}`;
            
            const titleContainer = document.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.gap = '8px';
            
            if (icon) {
                const iconEl = document.createElement('span');
                iconEl.textContent = icon;
                iconEl.style.fontSize = '18px';
                titleContainer.appendChild(iconEl);
            }
            
            const titleEl = document.createElement('span');
            titleEl.className = 'ww-card-title';
            titleEl.textContent = title;
            titleContainer.appendChild(titleEl);
            
            header.appendChild(titleContainer);
            
            if (subtitle) {
                const subtitleEl = document.createElement('span');
                subtitleEl.style.fontSize = '12px';
                subtitleEl.style.color = 'var(--ww-text-muted)';
                subtitleEl.textContent = subtitle;
                header.appendChild(subtitleEl);
            }
            
            if (collapsible) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'ww-btn ww-btn-icon';
                toggleBtn.innerHTML = collapsed ? '▼' : '▲';
                toggleBtn.style.background = 'transparent';
                toggleBtn.style.border = 'none';
                toggleBtn.style.color = 'var(--ww-text-secondary)';
                toggleBtn.style.cursor = 'pointer';
                toggleBtn.addEventListener('click', () => this.toggle());
                header.appendChild(toggleBtn);
                this.toggleButton = toggleBtn;
            }
            
            card.appendChild(header);
            this.headerElement = header;
        }
        
        // 创建主体
        const body = document.createElement('div');
        body.className = `ww-card-body ${bodyClass}`;
        body.innerHTML = content;
        
        if (collapsed) {
            body.style.display = 'none';
        }
        
        card.appendChild(body);
        this.bodyElement = body;
        
        // 创建底部
        if (footer) {
            const footerEl = document.createElement('div');
            footerEl.className = `ww-card-footer ${footerClass}`;
            footerEl.innerHTML = footer;
            card.appendChild(footerEl);
            this.footerElement = footerEl;
        }
        
        this.element = card;
        return card;
    }

    /**
     * 切换展开/折叠状态
     * @returns {Card} this
     */
    toggle() {
        if (!this.bodyElement) return this;
        
        const isCollapsed = this.bodyElement.style.display === 'none';
        this.bodyElement.style.display = isCollapsed ? 'block' : 'none';
        
        if (this.toggleButton) {
            this.toggleButton.textContent = isCollapsed ? '▲' : '▼';
        }
        
        this.config.collapsed = !isCollapsed;
        
        if (this.onToggle) {
            this.onToggle(this.config.collapsed);
        }
        
        return this;
    }

    /**
     * 设置内容
     * @param {string} content - 新内容
     * @returns {Card} this
     */
    setContent(content) {
        this.config.content = content;
        if (this.bodyElement) {
            this.bodyElement.innerHTML = content;
        }
        return this;
    }

    /**
     * 设置标题
     * @param {string} title - 新标题
     * @returns {Card} this
     */
    setTitle(title) {
        this.config.title = title;
        const titleEl = this.headerElement?.querySelector('.ww-card-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
        return this;
    }

    /**
     * 设置底部内容
     * @param {string} footer - 新底部内容
     * @returns {Card} this
     */
    setFooter(footer) {
        this.config.footer = footer;
        if (this.footerElement) {
            this.footerElement.innerHTML = footer;
        }
        return this;
    }

    /**
     * 添加 CSS 类
     * @param {string} className - 类名
     * @returns {Card} this
     */
    addClass(className) {
        if (this.element) {
            this.element.classList.add(className);
        }
        return this;
    }

    /**
     * 移除 CSS 类
     * @param {string} className - 类名
     * @returns {Card} this
     */
    removeClass(className) {
        if (this.element) {
            this.element.classList.remove(className);
        }
        return this;
    }

    /**
     * 设置切换回调
     * @param {Function} callback - 回调函数
     * @returns {Card} this
     */
    onToggleCallback(callback) {
        this.onToggle = callback;
        return this;
    }

    /**
     * 获取元素
     * @returns {HTMLElement} 卡片容器
     */
    getElement() {
        return this.element;
    }

    /**
     * 静态方法：创建简单卡片
     * @param {string} title - 标题
     * @param {string} content - 内容
     * @returns {Card} 卡片实例
     */
    static simple(title, content) {
        return new Card({ title, content });
    }

    /**
     * 静态方法：创建可折叠卡片
     * @param {string} title - 标题
     * @param {string} content - 内容
     * @returns {Card} 卡片实例
     */
    static collapsible(title, content) {
        return new Card({ title, content, collapsible: true });
    }
}

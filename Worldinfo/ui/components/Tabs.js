/**
 * UI组件统一入口
 * 导出所有UI组件
 */

// 基础组件
export { Modal, ModalManager, modalManager } from './Modal.js';
export { Button, ButtonGroup } from './Button.js';
export { Input, TextArea, NumberInput } from './Input.js';
export { Select } from './Select.js';
export { Checkbox, CheckboxGroup } from './Checkbox.js';
export { Table } from './Table.js';

// 标签页组件
export class Tabs {
    constructor(options = {}) {
        this.tabs = options.tabs || []; // {key, label, content, closable}
        this.activeKey = options.activeKey || (this.tabs[0]?.key || '');
        this.type = options.type || 'line'; // line, card, pill
        this.position = options.position || 'top'; // top, left, right, bottom
        this.size = options.size || 'medium'; // small, medium, large
        this.className = options.className || '';
        
        this.onChange = options.onChange || (() => {});
        this.onClose = options.onClose || (() => {});
        
        this.element = null;
        this.navElement = null;
        this.contentElement = null;
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-tabs',
            `wb-tabs-${this.type}`,
            `wb-tabs-${this.position}`,
            `wb-tabs-${this.size}`,
            this.className
        ].filter(Boolean).join(' ');

        // 标签导航
        const nav = document.createElement('div');
        nav.className = 'wb-tabs-nav';
        
        this.tabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = [
                'wb-tab',
                tab.key === this.activeKey ? 'wb-tab-active' : '',
                tab.disabled ? 'wb-tab-disabled' : ''
            ].filter(Boolean).join(' ');
            tabEl.dataset.key = tab.key;
            
            const tabLabel = document.createElement('span');
            tabLabel.className = 'wb-tab-label';
            tabLabel.textContent = tab.label;
            tabEl.appendChild(tabLabel);
            
            // 关闭按钮
            if (tab.closable) {
                const closeBtn = document.createElement('span');
                closeBtn.className = 'wb-tab-close';
                closeBtn.innerHTML = '✕';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeTab(tab.key);
                });
                tabEl.appendChild(closeBtn);
            }
            
            tabEl.addEventListener('click', () => {
                if (!tab.disabled) {
                    this.setActiveKey(tab.key);
                }
            });
            
            nav.appendChild(tabEl);
        });

        wrapper.appendChild(nav);
        this.navElement = nav;

        // 内容区域
        const content = document.createElement('div');
        content.className = 'wb-tabs-content';
        
        const activeTab = this.tabs.find(tab => tab.key === this.activeKey);
        if (activeTab) {
            const contentItem = document.createElement('div');
            contentItem.className = 'wb-tab-pane wb-tab-pane-active';
            contentItem.dataset.key = activeTab.key;
            
            if (activeTab.content instanceof HTMLElement) {
                contentItem.appendChild(activeTab.content);
            } else if (typeof activeTab.content === 'string') {
                contentItem.innerHTML = activeTab.content;
            }
            
            content.appendChild(contentItem);
        }

        wrapper.appendChild(content);
        this.contentElement = content;

        this.element = wrapper;
        return wrapper;
    }

    /**
     * 设置活动标签
     */
    setActiveKey(key) {
        if (this.activeKey === key) return;
        
        this.activeKey = key;
        
        // 更新导航
        if (this.navElement) {
            this.navElement.querySelectorAll('.wb-tab').forEach(tabEl => {
                tabEl.classList.toggle('wb-tab-active', tabEl.dataset.key === key);
            });
        }
        
        // 更新内容
        if (this.contentElement) {
            const activeTab = this.tabs.find(tab => tab.key === key);
            if (activeTab) {
                this.contentElement.innerHTML = '';
                
                const contentItem = document.createElement('div');
                contentItem.className = 'wb-tab-pane wb-tab-pane-active';
                contentItem.dataset.key = key;
                
                if (activeTab.content instanceof HTMLElement) {
                    contentItem.appendChild(activeTab.content);
                } else if (typeof activeTab.content === 'string') {
                    contentItem.innerHTML = activeTab.content;
                }
                
                this.contentElement.appendChild(contentItem);
            }
        }
        
        this.onChange(key);
    }

    /**
     * 添加标签
     */
    addTab(tab) {
        this.tabs.push(tab);
        if (!this.activeKey) {
            this.activeKey = tab.key;
        }
        this.refresh();
    }

    /**
     * 移除标签
     */
    removeTab(key) {
        const index = this.tabs.findIndex(tab => tab.key === key);
        if (index > -1) {
            this.tabs.splice(index, 1);
            
            if (this.activeKey === key) {
                this.activeKey = this.tabs[Math.min(index, this.tabs.length - 1)]?.key || '';
            }
            
            this.refresh();
        }
    }

    /**
     * 关闭标签（带回调）
     */
    closeTab(key) {
        this.onClose(key);
        this.removeTab(key);
    }

    /**
     * 刷新
     */
    refresh() {
        if (this.element) {
            this.element.innerHTML = '';
            this.navElement = null;
            this.contentElement = null;
            this.render();
            this.element.parentNode.replaceChild(this.element, this.element);
        }
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this.navElement = null;
        this.contentElement = null;
    }
}

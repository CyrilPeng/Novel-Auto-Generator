/**
 * 清除标签面板
 * 清理 AI 输出中的 thinking 等无用标签
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { ProgressBar } from '../components/ProgressBar.js';

/**
 * 清除标签面板配置
 */
export class ClearTagsPanelConfig {
    constructor({
        worldbook = {},
        defaultTags = 'thinking,/think,thought,/thought',
        onClear = null,
        onClose = null
    } = {}) {
        this.worldbook = worldbook;
        this.defaultTags = defaultTags;
        this.onClear = onClear;
        this.onClose = onClose;
    }
}

/**
 * 清除标签面板
 */
export class ClearTagsPanel {
    constructor(config = {}) {
        this.config = new ClearTagsPanelConfig(config);
        this.modal = null;
        this.element = null;
        this.selectedCategories = new Set();
    }

    /**
     * 创建面板 HTML
     * @returns {string} HTML 字符串
     */
    createHTML() {
        const categories = Object.keys(this.config.worldbook).filter(cat => {
            const entries = this.config.worldbook[cat];
            return typeof entries === 'object' && Object.keys(entries).length > 0;
        });
        
        return `
            <div id="ttw-clear-tags-panel" class="ww-clear-tags-panel">
                <!-- 标签设置 -->
                <div class="ww-clear-tags-section">
                    <label class="ww-input-label">🏷️ 要清除的标签</label>
                    <input type="text" id="ttw-clear-tags-input" class="ww-input" 
                           value="${this.config.defaultTags}" 
                           placeholder="thinking,/think,thought,/thought">
                    <div style="font-size:11px;color:var(--ww-text-muted);margin-top:4px;">
                        💡 用逗号分隔，/开头表示闭合标签（如 /think 表示移除到</think>之前的所有内容）
                    </div>
                </div>
                
                <!-- 分类选择 -->
                <div class="ww-clear-tags-section">
                    <div class="ww-clear-tags-section-header">
                        <label class="ww-input-label">📁 选择要清理的分类</label>
                        <div class="ww-clear-tags-actions">
                            <button id="ttw-clear-select-all" class="ww-btn ww-btn-secondary ww-btn-small">全选</button>
                            <button id="ttw-clear-select-none" class="ww-btn ww-btn-secondary ww-btn-small">全不选</button>
                        </div>
                    </div>
                    <div id="ttw-clear-categories" class="ww-clear-categories">
                        ${categories.map(cat => `
                            <label class="ww-clear-category-item">
                                <input type="checkbox" class="ww-clear-category-cb" data-category="${cat}" checked style="width:16px;height:16px;accent-color:#e74c3c;">
                                <span class="ww-clear-category-name">📁 ${cat}</span>
                                <span class="ww-clear-category-count">${Object.keys(this.config.worldbook[cat] || {}).length} 个条目</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                
                <!-- 预览区域 -->
                <div id="ttw-clear-preview-section" class="ww-clear-preview-section" style="display:none;">
                    <div class="ww-clear-preview-header">
                        <span class="ww-clear-preview-title">👁️ 预览效果</span>
                        <span id="ttw-clear-preview-count" class="ww-clear-preview-count">0 个条目将被清理</span>
                    </div>
                    <div id="ttw-clear-preview" class="ww-clear-preview">
                        <div style="text-align:center;color:var(--ww-text-muted);padding:20px;">
                            点击"预览"按钮查看效果
                        </div>
                    </div>
                </div>
                
                <!-- 进度区域 -->
                <div id="ttw-clear-progress-section" class="ww-clear-progress-section" style="display:none;">
                    <div id="ttw-clear-progress-bar"></div>
                    <div id="ttw-clear-progress-text" style="text-align:center;margin-top:8px;font-size:13px;">0%</div>
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '🏷️ 清除标签',
            width: '700px',
            maxWidth: '95%',
            closable: true,
            maskClosable: false,
            buttons: [
                { text: '关闭', type: 'secondary', action: 'close' },
                { text: '预览', type: 'info', action: 'preview' },
                { text: '开始清理', type: 'primary', action: 'clear', disabled: true }
            ],
            onButtonClick: async (action, event, modalInstance) => {
                if (action === 'close') {
                    this.close();
                } else if (action === 'preview') {
                    await this.showPreview();
                } else if (action === 'clear') {
                    await this.doClear();
                }
            }
        });
        
        this.modal.open(this.createHTML());
        this.element = this.modal.element;
        this.bindEvents();
        this.updateSelectedCategories();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.element) return;

        // 全选/全不选
        this.element.querySelector('#ttw-clear-select-all')?.addEventListener('click', () => {
            this.element.querySelectorAll('.ww-clear-category-cb').forEach(cb => cb.checked = true);
            this.updateSelectedCategories();
        });

        this.element.querySelector('#ttw-clear-select-none')?.addEventListener('click', () => {
            this.element.querySelectorAll('.ww-clear-category-cb').forEach(cb => cb.checked = false);
            this.updateSelectedCategories();
        });

        // 分类选择
        this.element.querySelectorAll('.ww-clear-category-cb').forEach(cb => {
            cb.addEventListener('change', () => this.updateSelectedCategories());
        });

        // 标签输入变化
        this.element.querySelector('#ttw-clear-tags-input')?.addEventListener('change', () => {
            this.updateSelectedCategories();
        });
    }

    /**
     * 更新选中的分类
     */
    updateSelectedCategories() {
        const checkboxes = this.element?.querySelectorAll('.ww-clear-category-cb') || [];
        this.selectedCategories.clear();
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                this.selectedCategories.add(cb.dataset.category);
            }
        });

        // 更新预览按钮状态
        const hasSelection = this.selectedCategories.size > 0;
        const previewBtn = this.modal?.element?.querySelector('[data-action="preview"]');
        const clearBtn = this.modal?.element?.querySelector('[data-action="clear"]');
        
        if (previewBtn) previewBtn.disabled = !hasSelection;
        if (clearBtn) clearBtn.disabled = !hasSelection;
    }

    /**
     * 显示预览
     */
    async showPreview() {
        const tagsInput = this.element?.querySelector('#ttw-clear-tags-input');
        const tags = tagsInput?.value?.split(',').map(t => t.trim()).filter(t => t) || [];
        
        if (tags.length === 0) {
            alert('请输入要清除的标签');
            return;
        }

        if (this.selectedCategories.size === 0) {
            alert('请至少选择一个分类');
            return;
        }

        const previewSection = this.element?.querySelector('#ttw-clear-preview-section');
        const previewDiv = this.element?.querySelector('#ttw-clear-preview');
        const previewCount = this.element?.querySelector('#ttw-clear-preview-count');
        
        if (!previewSection || !previewDiv) return;

        // 统计需要清理的条目
        let affectedCount = 0;
        const samples = [];
        
        for (const category of this.selectedCategories) {
            const entries = this.config.worldbook[category] || {};
            
            for (const [name, entry] of Object.entries(entries)) {
                const content = entry['内容'] || '';
                const hasTags = tags.some(tag => {
                    if (tag.startsWith('/')) {
                        const tagName = tag.substring(1);
                        return new RegExp(`</?${tagName}`, 'i').test(content);
                    }
                    return new RegExp(`<${tag}[^>]*>`, 'i').test(content);
                });
                
                if (hasTags) {
                    affectedCount++;
                    if (samples.length < 3) {
                        samples.push({ category, name, content });
                    }
                }
            }
        }
        
        previewCount.textContent = `${affectedCount} 个条目将被清理`;
        
        if (affectedCount === 0) {
            previewDiv.innerHTML = `
                <div style="text-align:center;color:var(--ww-success);padding:20px;">
                    ✅ 没有发现需要清理的标签
                </div>
            `;
        } else {
            previewDiv.innerHTML = `
                <div style="margin-bottom:12px;color:var(--ww-warning);">
                    ⚠️ 发现 ${affectedCount} 个条目包含要清理的标签
                </div>
                <div style="font-size:11px;color:var(--ww-text-muted);margin-bottom:8px;">示例：</div>
                ${samples.map(s => `
                    <div style="margin-bottom:10px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;">
                        <div style="font-size:11px;color:#9b59b6;">📁 ${s.category} / 📄 ${s.name}</div>
                        <div style="font-size:11px;color:#888;white-space:pre-wrap;margin-top:4px;max-height:100px;overflow-y:auto;">${this.showTagsInContent(s.content, tags)}</div>
                    </div>
                `).join('')}
            `;
        }
        
        previewSection.style.display = 'block';
    }

    /**
     * 显示标签内容（高亮显示）
     */
    showTagsInContent(content, tags) {
        let highlighted = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        for (const tag of tags) {
            const pattern = tag.startsWith('/') 
                ? new RegExp(`&lt;\\/?${tag.substring(1)}[^&]*&gt;`, 'gi')
                : new RegExp(`&lt;${tag}[^&]*&gt;`, 'gi');
            
            highlighted = highlighted.replace(pattern, match => {
                return `<span style="background:#e74c3c;color:#fff;padding:1px 4px;border-radius:2px;">${match}</span>`;
            });
        }
        
        return highlighted.substring(0, 300) + (content.length > 300 ? '...' : '');
    }

    /**
     * 执行清理
     */
    async doClear() {
        const tagsInput = this.element?.querySelector('#ttw-clear-tags-input');
        const tags = tagsInput?.value?.split(',').map(t => t.trim()).filter(t => t) || [];
        
        if (tags.length === 0) {
            alert('请输入要清除的标签');
            return;
        }

        if (this.selectedCategories.size === 0) {
            alert('请至少选择一个分类');
            return;
        }

        // 显示进度
        const progressSection = this.element?.querySelector('#ttw-clear-progress-section');
        const progressBar = this.element?.querySelector('#ttw-clear-progress-bar');
        const progressText = this.element?.querySelector('#ttw-clear-progress-text');
        
        if (progressSection) progressSection.style.display = 'block';
        
        // 通知回调执行清理
        this.config.onClear?.({
            tags,
            categories: Array.from(this.selectedCategories),
            onProgress: (current, total) => {
                const percentage = Math.round((current / total) * 100);
                if (progressBar) progressBar.style.width = `${percentage}%`;
                if (progressText) progressText.textContent = `${percentage}% (${current}/${total})`;
            }
        });
    }

    /**
     * 关闭面板
     */
    close() {
        if (this.modal) {
            this.modal.close();
            this.modal.destroy();
            this.modal = null;
            this.element = null;
        }
        if (this.config?.onClose) {
            this.config.onClose();
        }
    }

    /**
     * 销毁面板，清理所有资源
     */
    destroy() {
        this.close();
        this.config = null;
    }

    /**
     * 打开面板
     */
    open() {
        this.createModal();
    }
}

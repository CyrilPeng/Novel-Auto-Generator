/**
 * 整理条目面板
 * 使用 AI 优化世界书条目内容
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';

/**
 * 整理条目面板配置
 */
export class ConsolidatePanelConfig {
    constructor({
        category = '',
        entries = {},
        onConsolidate = null,
        onClose = null
    } = {}) {
        this.category = category;
        this.entries = entries;
        this.onConsolidate = onConsolidate;
        this.onClose = onClose;
    }
}

/**
 * 整理条目面板
 */
export class ConsolidatePanel {
    constructor(config = {}) {
        this.config = new ConsolidatePanelConfig(config);
        this.modal = null;
        this.selectedEntries = new Set();
        this.customPrompt = '';
        this.element = null;
    }

    /**
     * 创建面板 HTML
     * @returns {string} HTML 字符串
     */
    createHTML() {
        const entryCount = Object.keys(this.config.entries).length;
        
        return `
            <div id="ttw-consolidate-panel" class="ww-consolidate-panel">
                <div class="ww-consolidate-header">
                    <div class="ww-consolidate-title">
                        🧹 整理条目 - ${this.config.category}
                    </div>
                    <div class="ww-consolidate-stats">
                        共 ${entryCount} 个条目
                    </div>
                </div>
                
                <div class="ww-consolidate-body">
                    <!-- 预设提示词选择 -->
                    <div class="ww-consolidate-section">
                        <label class="ww-input-label">📋 选择预设提示词</label>
                        <select id="ttw-consolidate-preset" class="ww-select">
                            <option value="default">默认 - 去重合并</option>
                            <option value="detailed">详细 - 补充细节</option>
                            <option value="concise">简洁 - 精简内容</option>
                            <option value="custom">自定义</option>
                        </select>
                    </div>
                    
                    <!-- 自定义提示词 -->
                    <div id="ttw-consolidate-custom-prompt" class="ww-consolidate-section" style="display:none;">
                        <label class="ww-input-label">✏️ 自定义提示词</label>
                        <textarea id="ttw-consolidate-prompt-input" class="ww-textarea ww-input" rows="4" placeholder="请输入额外的整理要求..."></textarea>
                    </div>
                    
                    <!-- 条目选择 -->
                    <div class="ww-consolidate-section">
                        <div class="ww-consolidate-section-header">
                            <label class="ww-input-label">📝 选择要整理的条目</label>
                            <div class="ww-consolidate-actions">
                                <button id="ttw-consolidate-select-all" class="ww-btn ww-btn-secondary ww-btn-small">全选</button>
                                <button id="ttw-consolidate-select-none" class="ww-btn ww-btn-secondary ww-btn-small">全不选</button>
                                <button id="ttw-consolidate-select-inverse" class="ww-btn ww-btn-secondary ww-btn-small">反选</button>
                            </div>
                        </div>
                        <div id="ttw-consolidate-entry-list" class="ww-consolidate-entry-list">
                            ${this.createEntryListHTML()}
                        </div>
                    </div>
                    
                    <!-- 预览区域 -->
                    <div id="ttw-consolidate-preview" class="ww-consolidate-preview" style="display:none;">
                        <h4>📊 整理预览</h4>
                        <div id="ttw-consolidate-preview-content"></div>
                    </div>
                </div>
                
                <div class="ww-consolidate-footer">
                    <button id="ttw-consolidate-cancel" class="ww-btn">取消</button>
                    <button id="ttw-consolidate-preview-btn" class="ww-btn ww-btn-info">👁️ 预览</button>
                    <button id="ttw-consolidate-confirm" class="ww-btn ww-btn-primary" disabled>✅ 开始整理</button>
                </div>
            </div>
        `;
    }

    /**
     * 创建条目列表 HTML
     * @returns {string} HTML 字符串
     */
    createEntryListHTML() {
        const entries = this.config.entries;
        
        return Object.entries(entries).map(([name, entry]) => {
            const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
            const contentPreview = (entry['内容'] || '').substring(0, 100).replace(/\n/g, ' ');
            
            return `
                <label class="ww-consolidate-entry-item">
                    <input type="checkbox" class="ww-consolidate-entry-cb" data-entry-name="${name}" style="width:16px;height:16px;accent-color:#9b59b6;">
                    <div class="ww-consolidate-entry-info">
                        <div class="ww-consolidate-entry-name">📄 ${name}</div>
                        <div class="ww-consolidate-entry-keywords">${keywords ? '🔑 ' + keywords : ''}</div>
                        <div class="ww-consolidate-entry-content">${contentPreview}${contentPreview.length >= 100 ? '...' : ''}</div>
                    </div>
                </label>
            `;
        }).join('');
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '🧹 整理条目',
            width: '800px',
            maxWidth: '95%',
            closable: true,
            maskClosable: false,
            buttons: []
        });
        
        this.modal.open(this.createHTML());
        this.element = this.modal.element;
        this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.element) return;

        // 预设选择
        const presetSelect = this.element.querySelector('#ttw-consolidate-preset');
        const customPromptDiv = this.element.querySelector('#ttw-consolidate-custom-prompt');
        
        presetSelect?.addEventListener('change', () => {
            const isCustom = presetSelect.value === 'custom';
            customPromptDiv.style.display = isCustom ? 'block' : 'none';
        });

        // 自定义提示词
        const promptInput = this.element.querySelector('#ttw-consolidate-prompt-input');
        promptInput?.addEventListener('input', (e) => {
            this.customPrompt = e.target.value;
        });

        // 全选/全不选/反选
        this.element.querySelector('#ttw-consolidate-select-all')?.addEventListener('click', () => {
            this.element.querySelectorAll('.ww-consolidate-entry-cb').forEach(cb => cb.checked = true);
            this.updateSelectedEntries();
        });

        this.element.querySelector('#ttw-consolidate-select-none')?.addEventListener('click', () => {
            this.element.querySelectorAll('.ww-consolidate-entry-cb').forEach(cb => cb.checked = false);
            this.updateSelectedEntries();
        });

        this.element.querySelector('#ttw-consolidate-select-inverse')?.addEventListener('click', () => {
            this.element.querySelectorAll('.ww-consolidate-entry-cb').forEach(cb => cb.checked = !cb.checked);
            this.updateSelectedEntries();
        });

        // 条目选择
        this.element.querySelectorAll('.ww-consolidate-entry-cb').forEach(cb => {
            cb.addEventListener('change', () => this.updateSelectedEntries());
        });

        // 预览按钮
        this.element.querySelector('#ttw-consolidate-preview-btn')?.addEventListener('click', () => {
            this.showPreview();
        });

        // 确认按钮
        this.element.querySelector('#ttw-consolidate-confirm')?.addEventListener('click', async () => {
            await this.doConsolidate();
        });

        // 取消按钮
        this.element.querySelector('#ttw-consolidate-cancel')?.addEventListener('click', () => {
            this.close();
        });
    }

    /**
     * 更新选中的条目
     */
    updateSelectedEntries() {
        const checkboxes = this.element?.querySelectorAll('.ww-consolidate-entry-cb') || [];
        this.selectedEntries.clear();
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                this.selectedEntries.add(cb.dataset.entryName);
            }
        });

        // 更新确认按钮状态
        const confirmBtn = this.element?.querySelector('#ttw-consolidate-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = this.selectedEntries.size === 0;
        }
    }

    /**
     * 显示预览
     */
    showPreview() {
        if (this.selectedEntries.size === 0) {
            alert('请至少选择一个条目');
            return;
        }

        const previewDiv = this.element?.querySelector('#ttw-consolidate-preview');
        const previewContent = this.element?.querySelector('#ttw-consolidate-preview-content');
        
        if (!previewDiv || !previewContent) return;

        const selectedEntries = {};
        for (const name of this.selectedEntries) {
            selectedEntries[name] = this.config.entries[name];
        }

        let html = `
            <div style="margin-bottom:12px;">
                <strong>已选择：</strong> ${this.selectedEntries.size} 个条目<br>
                <strong>预设：</strong> ${this.element.querySelector('#ttw-consolidate-preset')?.value || 'default'}<br>
                ${this.customPrompt ? `<strong>自定义：</strong> ${this.customPrompt}` : ''}
            </div>
            <div style="max-height:300px;overflow-y:auto;">
                ${Object.entries(selectedEntries).map(([name, entry]) => `
                    <div style="margin-bottom:10px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;">
                        <div style="font-weight:bold;color:#9b59b6;">📄 ${name}</div>
                        <div style="font-size:11px;color:#888;">${(entry['关键词'] || []).join(', ')}</div>
                        <div style="font-size:12px;margin-top:4px;white-space:pre-wrap;">${(entry['内容'] || '').substring(0, 200)}${(entry['内容'] || '').length > 200 ? '...' : ''}</div>
                    </div>
                `).join('')}
            </div>
        `;

        previewContent.innerHTML = html;
        previewDiv.style.display = 'block';
    }

    /**
     * 执行整理
     */
    async doConsolidate() {
        if (this.selectedEntries.size === 0) {
            alert('请至少选择一个条目');
            return;
        }

        const preset = this.element?.querySelector('#ttw-consolidate-preset')?.value || 'default';
        
        const selectedEntries = {};
        for (const name of this.selectedEntries) {
            selectedEntries[name] = this.config.entries[name];
        }

        // 通知回调
        this.config.onConsolidate?.({
            category: this.config.category,
            entries: selectedEntries,
            preset,
            customPrompt: this.customPrompt
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

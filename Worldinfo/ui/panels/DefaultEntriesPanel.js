/**
 * 默认世界书条目编辑器面板
 * 用于添加、编辑、删除默认世界书条目
 */
import { Modal } from '../components/Modal.js';
import { showSuccess, showError } from '../components/Toast.js';

export class DefaultEntriesPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onSave = options.onSave || (() => {});
        this.modal = null;
        this.element = null;
        this.entries = [];
    }

    /**
     * 打开面板
     */
    open(entries = []) {
        this.entries = JSON.parse(JSON.stringify(entries));
        this.createModal();
        this.modal.open();
        this.renderEntries();
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
        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * 销毁面板，清理所有资源
     */
    destroy() {
        this.close();
        this.onClose = null;
    }

    /**
     * 创建弹窗 HTML
     */
    createHTML() {
        return `
            <div id="default-entries-panel" class="ww-default-entries-panel">
                <div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
                    💡 默认世界书条目会在每次转换时自动添加到世界书中。可以设置角色、地点、组织等基础信息。
                </div>

                <!-- 条目列表 -->
                <div id="entries-list" style="max-height:300px;overflow-y:auto;margin-bottom:12px;"></div>

                <!-- 添加按钮 -->
                <button id="add-entry-btn" class="ww-btn ww-btn-success" style="width:100%;margin-bottom:12px;">
                    ➕ 添加默认条目
                </button>

                <!-- 操作按钮 -->
                <div style="display:flex;gap:10px;">
                    <button id="save-entries-btn" class="ww-btn ww-btn-primary" style="flex:1;">
                        💾 保存
                    </button>
                    <button id="cancel-entries-btn" class="ww-btn ww-btn-secondary" style="flex:1;">
                        取消
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '📝 默认世界书条目',
            width: '700px',
            maxWidth: '95%',
            closable: true,
            maskClosable: true
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

        // 添加条目
        this.element.querySelector('#add-entry-btn')?.addEventListener('click', () => {
            this.showEntryEditor();
        });

        // 保存
        this.element.querySelector('#save-entries-btn')?.addEventListener('click', () => {
            this.onSave(this.entries);
            showSuccess('已保存默认条目');
            this.close();
        });

        // 取消
        this.element.querySelector('#cancel-entries-btn')?.addEventListener('click', () => {
            this.close();
        });
    }

    /**
     * 渲染条目列表
     */
    renderEntries() {
        const listEl = this.element?.querySelector('#entries-list');
        if (!listEl) return;

        if (this.entries.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                    暂无默认条目，点击上方按钮添加
                </div>
            `;
            return;
        }

        listEl.innerHTML = this.entries.map((entry, index) => `
            <div class="ww-default-entry-item" data-index="${index}" style="
                display:flex;
                align-items:center;
                padding:10px;
                margin:6px 0;
                background:rgba(255,255,255,0.05);
                border-radius:6px;
                border-left:3px solid var(--ww-primary);
            ">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:bold;color:var(--ww-primary);margin-bottom:4px;">📄 ${this.escapeHtml(entry.name)}</div>
                    <div style="font-size:11px;color:var(--ww-text-muted);">📁 ${this.escapeHtml(entry.category)} | 🔑 ${(entry.keywords || []).join(', ')}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="ww-btn ww-btn-small ww-btn-secondary edit-entry-btn" data-index="${index}">✏️</button>
                    <button class="ww-btn ww-btn-small ww-btn-danger delete-entry-btn" data-index="${index}">🗑️</button>
                </div>
            </div>
        `).join('');

        // 绑定编辑按钮
        listEl.querySelectorAll('.edit-entry-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                this.showEntryEditor(this.entries[index], index);
            });
        });

        // 绑定删除按钮
        listEl.querySelectorAll('.delete-entry-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.dataset.index);
                if (confirm(`确定要删除 "${this.entries[index].name}" 吗？`)) {
                    this.entries.splice(index, 1);
                    this.renderEntries();
                }
            });
        });
    }

    /**
     * 显示条目编辑器
     */
    showEntryEditor(entry = null, index = -1) {
        const modal = new Modal({
            title: entry ? '✏️ 编辑条目' : '➕ 添加条目',
            width: '600px',
            buttons: [
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '保存', type: 'primary', action: 'save' }
            ],
            onButtonClick: (action, event, modalInstance) => {
                if (action === 'save') {
                    this.saveEntryFromEditor(modalInstance, index);
                }
                modalInstance.close();
            }
        });

        const content = `
            <div class="ww-entry-editor">
                <div class="ww-input-group" style="margin-bottom:12px;">
                    <label class="ww-input-label">📁 分类</label>
                    <select id="entry-category" class="ww-select">
                        <option value="角色">角色</option>
                        <option value="地点">地点</option>
                        <option value="组织">组织</option>
                        <option value="道具">道具</option>
                        <option value="玩法">玩法</option>
                        <option value="章节剧情">章节剧情</option>
                        <option value="角色内心">角色内心</option>
                        <option value="其他">其他</option>
                    </select>
                </div>

                <div class="ww-input-group" style="margin-bottom:12px;">
                    <label class="ww-input-label">📄 条目名称</label>
                    <input type="text" id="entry-name" class="ww-input" placeholder="如：张三、长安城">
                </div>

                <div class="ww-input-group" style="margin-bottom:12px;">
                    <label class="ww-input-label">🔑 关键词（逗号分隔）</label>
                    <input type="text" id="entry-keywords" class="ww-input" placeholder="张三，老大，张哥">
                </div>

                <div class="ww-input-group" style="margin-bottom:12px;">
                    <label class="ww-input-label">📝 内容</label>
                    <textarea id="entry-content" class="ww-input ww-textarea" rows="6" placeholder="条目内容..."></textarea>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div class="ww-input-group">
                        <label class="ww-input-label">📍 位置</label>
                        <select id="entry-position" class="ww-select">
                            <option value="0">在角色定义之前</option>
                            <option value="1">在角色定义之后</option>
                            <option value="2">在作者注释之前</option>
                            <option value="3">在作者注释之后</option>
                            <option value="4">自定义深度</option>
                        </select>
                    </div>
                    <div class="ww-input-group">
                        <label class="ww-input-label">📏 深度</label>
                        <input type="number" id="entry-depth" class="ww-input" value="4" min="0" max="10">
                    </div>
                </div>

                <div class="ww-input-group">
                    <label class="ww-input-label">🔢 顺序</label>
                    <input type="number" id="entry-order" class="ww-input" value="100" min="0">
                </div>
            </div>
        `;

        modal.open(content);

        // 填充现有数据
        if (entry) {
            const el = modal.element;
            el.querySelector('#entry-category').value = entry.category || '角色';
            el.querySelector('#entry-name').value = entry.name || '';
            el.querySelector('#entry-keywords').value = (entry.keywords || []).join(', ');
            el.querySelector('#entry-content').value = entry.content || '';
            el.querySelector('#entry-position').value = entry.position ?? 0;
            el.querySelector('#entry-depth').value = entry.depth ?? 4;
            el.querySelector('#entry-order').value = entry.order ?? 100;
        }
    }

    /**
     * 保存编辑器中的条目
     */
    saveEntryFromEditor(modal, index) {
        const el = modal.element;
        
        const entry = {
            category: el.querySelector('#entry-category')?.value || '角色',
            name: el.querySelector('#entry-name')?.value || '',
            keywords: (el.querySelector('#entry-keywords')?.value || '').split(/[,，]/).map(k => k.trim()).filter(k => k),
            content: el.querySelector('#entry-content')?.value || '',
            position: parseInt(el.querySelector('#entry-position')?.value) || 0,
            depth: parseInt(el.querySelector('#entry-depth')?.value) || 4,
            order: parseInt(el.querySelector('#entry-order')?.value) || 100
        };

        if (!entry.name) {
            showError('请输入条目名称');
            return;
        }

        if (index >= 0) {
            // 更新现有条目
            this.entries[index] = entry;
        } else {
            // 添加新条目
            this.entries.push(entry);
        }

        this.renderEntries();
        showSuccess(entry.name ? '已保存条目' : '已添加条目');
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const d = document.createElement('span');
        d.textContent = text;
        return d.innerHTML;
    }
}

/**
 * 条目编辑器面板
 * 编辑世界书中的单个条目
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { TextArea } from '../components/Input.js';

export class EntryEditor {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onSave = options.onSave || (() => {});
        this.onDelete = options.onDelete || (() => {});
        this.modal = null;
        this.entry = null;
        this.category = null;
        this.isNew = false;
    }

    /**
     * 打开面板编辑条目
     * @param {Object} entry - 条目数据 {name, keywords, content}
     * @param {string} category - 所属分类
     * @param {boolean} isNew - 是否新建
     */
    open(entry = null, category = '', isNew = false) {
        this.entry = entry || { name: '', keywords: [], content: '' };
        this.category = category;
        this.isNew = isNew;
        this.createModal();
        this.modal.open();
        this.populateForm();
    }

    /**
     * 关闭面板
     */
    close() {
        if (this.modal) {
            this.modal.close();
            this.modal.destroy();
            this.modal = null;
        }
        this.onClose();
    }

    /**
     * 创建弹窗
     */
    createModal() {
        const title = this.isNew ? '✨ 新建条目' : (this.entry?.name ? `📝 编辑: ${this.entry.name}` : '📝 编辑条目');
        
        this.modal = new Modal({
            id: 'entry-editor-panel',
            title: title,
            width: '700px',
            closeOnBackdrop: false,
            showCloseButton: true,
            content: this.createContent(),
            onClose: () => this.close()
        });

        this.modal.create();
        this.bindEvents();
    }

    /**
     * 创建内容
     */
    createContent() {
        return `
            <div class="wb-entry-editor">
                <div class="wb-entry-form">
                    <!-- 基本信息 -->
                    <div class="wb-form-section">
                        <h5 class="wb-section-title">基本信息</h5>
                        
                        <div class="wb-form-row">
                            <label class="wb-form-label">条目名称 *</label>
                            <input type="text" id="entry-name" class="wb-input" placeholder="条目名称">
                        </div>

                        <div class="wb-form-row">
                            <label class="wb-form-label">所属分类</label>
                            <input type="text" id="entry-category" class="wb-input" readonly>
                        </div>
                    </div>

                    <!-- 关键词 -->
                    <div class="wb-form-section">
                        <h5 class="wb-section-title">关键词</h5>
                        <div class="wb-form-row">
                            <label class="wb-form-label">关键词列表 (用逗号分隔)</label>
                            <input type="text" id="entry-keywords" class="wb-input" placeholder="关键词1, 关键词2, 关键词3">
                            <small class="wb-form-hint">这些关键词用于触发世界书条目的显示</small>
                        </div>
                    </div>

                    <!-- 内容 -->
                    <div class="wb-form-section">
                        <h5 class="wb-section-title">内容</h5>
                        <div class="wb-form-row">
                            <label class="wb-form-label">条目内容 (支持 Markdown)</label>
                            <textarea id="entry-content" class="wb-input wb-textarea" rows="12" placeholder="在此输入条目内容..."></textarea>
                            <small class="wb-form-hint">支持 Markdown 格式，可以使用 **粗体**、*斜体*、标题等</small>
                        </div>
                    </div>

                    <!-- 高级设置 -->
                    <div class="wb-form-section wb-form-section-collapsed">
                        <h5 class="wb-section-title" id="advanced-toggle">
                            高级设置
                            <span class="wb-toggle-icon">▶</span>
                        </h5>
                        <div class="wb-advanced-content" style="display: none;">
                            <div class="wb-form-row wb-form-row-inline">
                                <div class="wb-form-col">
                                    <label class="wb-form-label">位置</label>
                                    <input type="number" id="entry-position" class="wb-input" value="0" min="0">
                                </div>
                                <div class="wb-form-col">
                                    <label class="wb-form-label">深度</label>
                                    <input type="number" id="entry-depth" class="wb-input" value="4" min="1" max="5">
                                </div>
                                <div class="wb-form-col">
                                    <label class="wb-form-label">顺序</label>
                                    <input type="number" id="entry-order" class="wb-input" value="100">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部按钮 -->
                <div class="wb-entry-actions">
                    <div class="wb-entry-actions-left">
                        <button id="entry-delete" class="wb-btn wb-btn-danger" style="display: none;">🗑️ 删除</button>
                    </div>
                    <div class="wb-entry-actions-right">
                        <button id="entry-cancel" class="wb-btn wb-btn-secondary">取消</button>
                        <button id="entry-save" class="wb-btn wb-btn-success">💾 保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 填充表单
     */
    populateForm() {
        const entry = this.entry || {};
        
        this.setValue('entry-name', entry.name || '');
        this.setValue('entry-category', this.category || '');
        this.setValue('entry-keywords', Array.isArray(entry.keywords) ? entry.keywords.join(', ') : (entry.keywords || ''));
        this.setValue('entry-content', entry.content || '');
        this.setValue('entry-position', entry.position !== undefined ? entry.position : 0);
        this.setValue('entry-depth', entry.depth !== undefined ? entry.depth : 4);
        this.setValue('entry-order', entry.order !== undefined ? entry.order : 100);

        // 显示/隐藏删除按钮
        const deleteBtn = this.modal.element.querySelector('#entry-delete');
        if (deleteBtn) {
            deleteBtn.style.display = this.isNew ? 'none' : 'inline-flex';
        }
    }

    /**
     * 设置表单值
     */
    setValue(id, value) {
        const el = this.modal.element.querySelector(`#${id}`);
        if (el) el.value = value;
    }

    /**
     * 获取表单值
     */
    getValue(id) {
        const el = this.modal.element.querySelector(`#${id}`);
        return el ? el.value : '';
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        const container = this.modal.element;

        // 保存
        container.querySelector('#entry-save')?.addEventListener('click', () => {
            this.save();
        });

        // 取消
        container.querySelector('#entry-cancel')?.addEventListener('click', () => {
            this.close();
        });

        // 删除
        container.querySelector('#entry-delete')?.addEventListener('click', () => {
            this.delete();
        });

        // 高级设置折叠
        container.querySelector('#advanced-toggle')?.addEventListener('click', (e) => {
            const content = container.querySelector('.wb-advanced-content');
            const icon = e.currentTarget.querySelector('.wb-toggle-icon');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.textContent = '▼';
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
            }
        });
    }

    /**
     * 保存
     */
    save() {
        const name = this.getValue('entry-name').trim();
        
        if (!name) {
            alert('请输入条目名称');
            return;
        }

        const entry = {
            name,
            keywords: this.getValue('entry-keywords').split(',').map(s => s.trim()).filter(Boolean),
            content: this.getValue('entry-content'),
            position: parseInt(this.getValue('entry-position')) || 0,
            depth: parseInt(this.getValue('entry-depth')) || 4,
            order: parseInt(this.getValue('entry-order')) || 100
        };

        this.onSave(entry, this.isNew);
        this.close();
    }

    /**
     * 删除
     */
    delete() {
        if (!this.entry || !this.entry.name) return;

        if (!confirm(`确定要删除条目 "${this.entry.name}" 吗？`)) {
            return;
        }

        this.onDelete(this.entry);
        this.close();
    }

    /**
     * 销毁
     */
    destroy() {
        this.close();
    }
}

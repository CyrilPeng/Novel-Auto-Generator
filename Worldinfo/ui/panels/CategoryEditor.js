/**
 * 分类编辑器面板
 * 管理世界书分类配置
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Checkbox } from '../components/Checkbox.js';
import { CategoryManager } from '../../generators/CategoryManager.js';
import { Config } from '../../core/Config.js';

export class CategoryEditor {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onSave = options.onSave || (() => {});
        this.modal = null;
        this.config = new Config();
        this.categoryManager = new CategoryManager(this.config);
        this.categories = [];
        this.editingCategory = null;
    }

    /**
     * 打开面板
     */
    open() {
        this.categories = [...this.categoryManager.getAllCategories()];
        this.createModal();
        this.modal.open();
        this.renderCategoryList();
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
        this.modal = new Modal({
            id: 'category-editor-panel',
            title: '📂 分类管理',
            width: '800px',
            height: '80vh',
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
            <div class="wb-category-editor">
                <div class="wb-category-layout">
                    <!-- 左侧分类列表 -->
                    <div class="wb-category-sidebar">
                        <div class="wb-category-sidebar-header">
                            <h4>分类列表</h4>
                            <button id="cat-add-btn" class="wb-btn wb-btn-primary wb-btn-sm">+ 新建</button>
                        </div>
                        <div id="category-list" class="wb-category-list"></div>
                    </div>

                    <!-- 右侧编辑区域 -->
                    <div class="wb-category-main">
                        <div id="category-form" class="wb-category-form" style="display: none;">
                            <div class="wb-form-header">
                                <h4 id="form-title">编辑分类</h4>
                                <div class="wb-form-actions">
                                    <button id="cat-save-btn" class="wb-btn wb-btn-success">💾 保存</button>
                                    <button id="cat-delete-btn" class="wb-btn wb-btn-danger">🗑️ 删除</button>
                                    <button id="cat-cancel-btn" class="wb-btn wb-btn-secondary">取消</button>
                                </div>
                            </div>

                            <div class="wb-form-body">
                                <div class="wb-form-row">
                                    <label class="wb-form-label">分类名称 *</label>
                                    <input type="text" id="cat-name" class="wb-input" placeholder="例如：角色">
                                </div>

                                <div class="wb-form-row">
                                    <label class="wb-form-label">启用状态</label>
                                    <label class="wb-checkbox-label">
                                        <input type="checkbox" id="cat-enabled" checked>
                                        <span>启用此分类</span>
                                    </label>
                                </div>

                                <div class="wb-form-row">
                                    <label class="wb-form-label">条目示例</label>
                                    <input type="text" id="cat-entry-example" class="wb-input" placeholder="例如：角色真实姓名">
                                </div>

                                <div class="wb-form-row">
                                    <label class="wb-form-label">关键词示例</label>
                                    <input type="text" id="cat-keywords-example" class="wb-input" placeholder="例如：真实姓名, 称呼1, 称呼2">
                                    <small class="wb-form-hint">多个关键词用逗号分隔</small>
                                </div>

                                <div class="wb-form-row">
                                    <label class="wb-form-label">内容编写指南</label>
                                    <textarea id="cat-content-guide" class="wb-input wb-textarea" rows="4" placeholder="描述此分类条目应包含哪些内容..."></textarea>
                                </div>

                                <div class="wb-form-row wb-form-row-inline">
                                    <div class="wb-form-col">
                                        <label class="wb-form-label">默认位置</label>
                                        <input type="number" id="cat-position" class="wb-input" value="0" min="0">
                                    </div>
                                    <div class="wb-form-col">
                                        <label class="wb-form-label">默认深度</label>
                                        <input type="number" id="cat-depth" class="wb-input" value="4" min="1" max="5">
                                    </div>
                                    <div class="wb-form-col">
                                        <label class="wb-form-label">默认顺序</label>
                                        <input type="number" id="cat-order" class="wb-input" value="100">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="category-empty" class="wb-category-empty">
                            <div class="wb-empty-icon">📂</div>
                            <div class="wb-empty-text">选择一个分类进行编辑</div>
                            <div class="wb-empty-hint">或点击"新建"创建新分类</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        const container = this.modal.element;

        // 新建分类
        container.querySelector('#cat-add-btn')?.addEventListener('click', () => {
            this.createNewCategory();
        });

        // 保存
        container.querySelector('#cat-save-btn')?.addEventListener('click', () => {
            this.saveCategory();
        });

        // 删除
        container.querySelector('#cat-delete-btn')?.addEventListener('click', () => {
            this.deleteCategory();
        });

        // 取消
        container.querySelector('#cat-cancel-btn')?.addEventListener('click', () => {
            this.cancelEdit();
        });
    }

    /**
     * 渲染分类列表
     */
    renderCategoryList() {
        const container = this.modal.element.querySelector('#category-list');
        if (!container) return;

        if (this.categories.length === 0) {
            container.innerHTML = `
                <div class="wb-empty">
                    <div class="wb-empty-text">暂无分类</div>
                </div>
            `;
            return;
        }

        let html = '';
        this.categories.forEach((cat, index) => {
            const isSelected = this.editingCategory?.name === cat.name;
            const isEnabled = cat.enabled !== false;

            html += `
                <div class="wb-category-list-item ${isSelected ? 'selected' : ''} ${!isEnabled ? 'disabled' : ''}" data-name="${cat.name}">
                    <div class="wb-category-item-info">
                        <span class="wb-category-item-name">${cat.name}</span>
                        ${cat.isBuiltin ? '<span class="wb-category-badge">内置</span>' : ''}
                    </div>
                    <div class="wb-category-item-status">
                        ${isEnabled ? '✅' : '⛔'}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.wb-category-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                this.selectCategory(name);
            });
        });
    }

    /**
     * 选择分类
     */
    selectCategory(name) {
        const category = this.categories.find(c => c.name === name);
        if (!category) return;

        this.editingCategory = { ...category };
        this.renderCategoryList();
        this.showEditForm();
    }

    /**
     * 创建新分类
     */
    createNewCategory() {
        this.editingCategory = {
            name: '',
            enabled: true,
            isBuiltin: false,
            entryExample: '',
            keywordsExample: [],
            contentGuide: '',
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        };
        this.renderCategoryList();
        this.showEditForm();
    }

    /**
     * 显示编辑表单
     */
    showEditForm() {
        const container = this.modal.element;
        const emptyEl = container.querySelector('#category-empty');
        const formEl = container.querySelector('#category-form');

        if (emptyEl) emptyEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';

        // 填充表单数据
        const cat = this.editingCategory;
        this.setFormValue('cat-name', cat.name);
        this.setFormValue('cat-enabled', cat.enabled);
        this.setFormValue('cat-entry-example', cat.entryExample);
        this.setFormValue('cat-keywords-example', Array.isArray(cat.keywordsExample) ? cat.keywordsExample.join(', ') : cat.keywordsExample);
        this.setFormValue('cat-content-guide', cat.contentGuide);
        this.setFormValue('cat-position', cat.defaultPosition);
        this.setFormValue('cat-depth', cat.defaultDepth);
        this.setFormValue('cat-order', cat.defaultOrder);

        // 更新标题
        const titleEl = container.querySelector('#form-title');
        if (titleEl) {
            titleEl.textContent = cat.name ? `编辑分类: ${cat.name}` : '新建分类';
        }

        // 更新删除按钮状态
        const deleteBtn = container.querySelector('#cat-delete-btn');
        if (deleteBtn) {
            deleteBtn.style.display = cat.isBuiltin ? 'none' : 'inline-flex';
        }
    }

    /**
     * 设置表单值
     */
    setFormValue(id, value) {
        const el = this.modal.element.querySelector(`#${id}`);
        if (!el) return;

        if (el.type === 'checkbox') {
            el.checked = !!value;
        } else {
            el.value = value !== undefined && value !== null ? value : '';
        }
    }

    /**
     * 获取表单值
     */
    getFormValue(id) {
        const el = this.modal.element.querySelector(`#${id}`);
        if (!el) return undefined;

        if (el.type === 'checkbox') {
            return el.checked;
        }
        return el.value;
    }

    /**
     * 保存分类
     */
    saveCategory() {
        const name = this.getFormValue('cat-name').trim();
        
        if (!name) {
            alert('请输入分类名称');
            return;
        }

        // 检查名称是否重复（新建时）
        const isNew = !this.editingCategory.name;
        if (isNew && this.categories.some(c => c.name === name)) {
            alert('分类名称已存在');
            return;
        }

        // 收集表单数据
        const category = {
            ...this.editingCategory,
            name,
            enabled: this.getFormValue('cat-enabled'),
            entryExample: this.getFormValue('cat-entry-example'),
            keywordsExample: this.getFormValue('cat-keywords-example').split(',').map(s => s.trim()).filter(Boolean),
            contentGuide: this.getFormValue('cat-content-guide'),
            defaultPosition: parseInt(this.getFormValue('cat-position')) || 0,
            defaultDepth: parseInt(this.getFormValue('cat-depth')) || 4,
            defaultOrder: parseInt(this.getFormValue('cat-order')) || 100
        };

        // 保存到 CategoryManager
        if (isNew) {
            this.categoryManager.addCategory(category);
        } else {
            this.categoryManager.updateCategory(category.name, category);
        }

        // 刷新列表
        this.categories = [...this.categoryManager.getAllCategories()];
        this.editingCategory = null;
        this.renderCategoryList();
        this.cancelEdit();

        this.onSave(category);
        this.showToast('保存成功！', 'success');
    }

    /**
     * 删除分类
     */
    deleteCategory() {
        if (!this.editingCategory || !this.editingCategory.name) return;

        if (!confirm(`确定要删除分类 "${this.editingCategory.name}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            this.categoryManager.removeCategory(this.editingCategory.name);
            this.categories = [...this.categoryManager.getAllCategories()];
            this.editingCategory = null;
            this.renderCategoryList();
            this.cancelEdit();
            this.showToast('删除成功！', 'success');
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    }

    /**
     * 取消编辑
     */
    cancelEdit() {
        this.editingCategory = null;
        const container = this.modal.element;
        const emptyEl = container.querySelector('#category-empty');
        const formEl = container.querySelector('#category-form');

        if (emptyEl) emptyEl.style.display = 'block';
        if (formEl) formEl.style.display = 'none';

        this.renderCategoryList();
    }

    /**
     * 显示提示
     */
    showToast(message, type = 'success') {
        if (typeof toastr !== 'undefined') {
            toastr[type](message);
        } else {
            alert(message);
        }
    }

    /**
     * 销毁
     */
    destroy() {
        this.close();
    }
}

/**
 * 别名合并对话框
 * 用于合并具有别名的重复条目
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Table } from '../components/Table.js';

export class AliasMergeDialog {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onMerge = options.onMerge || (() => {});
        this.worldbook = options.worldbook || {};
        this.modal = null;
        this.duplicates = [];
        this.selectedGroups = new Set();
    }

    /**
     * 打开对话框
     */
    open() {
        this.findDuplicates();
        this.createModal();
        this.modal.open();
        this.renderDuplicates();
    }

    /**
     * 关闭对话框
     */
    close() {
        if (this.modal) {
            this.modal.close();
            this.modal.destroy();
            this.modal = null;
        }
        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * 销毁对话框，清理所有资源
     */
    destroy() {
        this.close();
        this.duplicates = [];
        this.selectedGroups.clear();
        this.worldbook = null;
        this.onClose = null;
        this.onMerge = null;
    }

    /**
     * 查找重复条目
     */
    findDuplicates() {
        this.duplicates = [];
        const entryMap = new Map();

        // 收集所有条目
        for (const [categoryName, entries] of Object.entries(this.worldbook)) {
            if (!Array.isArray(entries)) continue;

            for (const entry of entries) {
                if (!entry.name) continue;

                // 标准化名称（去除空格，转为小写）
                const normalizedName = entry.name.toLowerCase().replace(/\s+/g, '');
                
                if (!entryMap.has(normalizedName)) {
                    entryMap.set(normalizedName, []);
                }
                
                entryMap.get(normalizedName).push({
                    ...entry,
                    category: categoryName,
                    normalizedName
                });
            }
        }

        // 找出重复的
        for (const [normalizedName, entries] of entryMap) {
            if (entries.length > 1) {
                this.duplicates.push({
                    name: entries[0].name,
                    normalizedName,
                    entries,
                    count: entries.length
                });
            }
        }

        // 按重复数量排序
        this.duplicates.sort((a, b) => b.count - a.count);
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            id: 'alias-merge-dialog',
            title: '🔗 别名合并',
            width: '900px',
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
            <div class="wb-alias-merge">
                <!-- 统计信息 -->
                <div class="wb-am-stats">
                    <div class="wb-am-stat-item">
                        <span class="wb-am-stat-value" id="am-duplicate-count">0</span>
                        <span class="wb-am-stat-label">重复组</span>
                    </div>
                    <div class="wb-am-stat-item">
                        <span class="wb-am-stat-value" id="am-entry-count">0</span>
                        <span class="wb-am-stat-label">涉及条目</span>
                    </div>
                    <div class="wb-am-stat-item">
                        <span class="wb-am-stat-value" id="am-selected-count">0</span>
                        <span class="wb-am-stat-label">已选择</span>
                    </div>
                </div>

                <!-- 工具栏 -->
                <div class="wb-am-toolbar">
                    <div class="wb-am-search">
                        <input type="text" id="am-search" class="wb-input" placeholder="搜索重复组...">
                    </div>
                    <div class="wb-am-actions">
                        <button id="am-select-all" class="wb-btn wb-btn-secondary">☑️ 全选</button>
                        <button id="am-deselect-all" class="wb-btn wb-btn-secondary">⬜ 全不选</button>
                        <button id="am-merge-selected" class="wb-btn wb-btn-primary" disabled>🔗 合并选中</button>
                    </div>
                </div>

                <!-- 重复组列表 -->
                <div id="am-duplicate-list" class="wb-am-list">
                    <div class="wb-loading">
                        <div class="wb-loading-spinner"></div>
                        <div class="wb-loading-text">分析中...</div>
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

        // 搜索
        container.querySelector('#am-search')?.addEventListener('input', (e) => {
            this.filterDuplicates(e.target.value);
        });

        // 全选
        container.querySelector('#am-select-all')?.addEventListener('click', () => {
            this.selectAll();
        });

        // 全不选
        container.querySelector('#am-deselect-all')?.addEventListener('click', () => {
            this.deselectAll();
        });

        // 合并选中
        container.querySelector('#am-merge-selected')?.addEventListener('click', () => {
            this.mergeSelected();
        });
    }

    /**
     * 渲染重复组列表
     */
    renderDuplicates() {
        const container = this.modal.element.querySelector('#am-duplicate-list');
        if (!container) return;

        // 更新统计
        this.updateStats();

        if (this.duplicates.length === 0) {
            container.innerHTML = `
                <div class="wb-empty">
                    <div class="wb-empty-icon">✅</div>
                    <div class="wb-empty-text">未发现重复条目</div>
                    <div class="wb-empty-hint">世界书中的所有条目都是唯一的</div>
                </div>
            `;
            return;
        }

        let html = '<div class="wb-am-duplicate-items">';
        
        this.duplicates.forEach((group, index) => {
            const isSelected = this.selectedGroups.has(index);
            const entriesPreview = group.entries.slice(0, 3).map(e => e.name).join(', ');
            const moreCount = group.entries.length - 3;

            html += `
                <div class="wb-am-duplicate-item ${isSelected ? 'selected' : ''}" data-index="${index}">
                    <div class="wb-am-dup-checkbox">
                        <input type="checkbox" ${isSelected ? 'checked' : ''}>
                    </div>
                    <div class="wb-am-dup-content">
                        <div class="wb-am-dup-header">
                            <span class="wb-am-dup-name">${group.name}</span>
                            <span class="wb-am-dup-count">${group.count} 个重复</span>
                        </div>
                        <div class="wb-am-dup-entries">
                            ${entriesPreview}${moreCount > 0 ? ` 等` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;

        // 绑定事件
        container.querySelectorAll('.wb-am-duplicate-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            
            // 复选框点击
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox?.addEventListener('change', () => {
                this.toggleSelection(index);
            });

            // 整行点击（除了复选框）
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox && !e.target.closest('input')) {
                    checkbox?.click();
                }
            });
        });
    }

    /**
     * 切换选择
     */
    toggleSelection(index) {
        if (this.selectedGroups.has(index)) {
            this.selectedGroups.delete(index);
        } else {
            this.selectedGroups.add(index);
        }
        this.updateStats();
        this.updateMergeButton();
        this.renderDuplicates();
    }

    /**
     * 全选
     */
    selectAll() {
        this.duplicates.forEach((_, index) => {
            this.selectedGroups.add(index);
        });
        this.updateStats();
        this.updateMergeButton();
        this.renderDuplicates();
    }

    /**
     * 全不选
     */
    deselectAll() {
        this.selectedGroups.clear();
        this.updateStats();
        this.updateMergeButton();
        this.renderDuplicates();
    }

    /**
     * 筛选重复组
     */
    filterDuplicates(keyword) {
        if (!keyword) {
            this.renderDuplicates();
            return;
        }

        const filtered = this.duplicates.filter(group => {
            return group.name.toLowerCase().includes(keyword.toLowerCase()) ||
                   group.entries.some(e => e.name.toLowerCase().includes(keyword.toLowerCase()));
        });

        // 临时替换数据用于渲染
        const originalDuplicates = this.duplicates;
        this.duplicates = filtered;
        this.renderDuplicates();
        this.duplicates = originalDuplicates;
    }

    /**
     * 合并选中的组
     */
    async mergeSelected() {
        if (this.selectedGroups.size === 0) {
            alert('请先选择要合并的重复组');
            return;
        }

        if (!confirm(`确定要合并选中的 ${this.selectedGroups.size} 个重复组吗？`)) {
            return;
        }

        const mergedGroups = [];
        for (const index of this.selectedGroups) {
            const group = this.duplicates[index];
            if (group) {
                // 执行合并
                const mergedEntry = await this.mergeGroup(group);
                mergedGroups.push({
                    original: group,
                    merged: mergedEntry
                });
            }
        }

        // 清除选择
        this.selectedGroups.clear();

        // 重新查找重复
        this.findDuplicates();

        // 刷新显示
        this.updateStats();
        this.updateMergeButton();
        this.renderDuplicates();

        this.showToast(`成功合并 ${mergedGroups.length} 个组`, 'success');
        this.onMerge(mergedGroups);
    }

    /**
     * 合并组
     */
    async mergeGroup(group) {
        if (group.entries.length === 0) return null;

        // 以第一个条目为基础
        const baseEntry = { ...group.entries[0] };

        // 合并其他条目
        for (let i = 1; i < group.entries.length; i++) {
            const other = group.entries[i];
            
            // 合并关键词
            if (other.keywords) {
                const newKeywords = Array.isArray(other.keywords) ? other.keywords : [other.keywords];
                const existingKeywords = Array.isArray(baseEntry.keywords) ? baseEntry.keywords : [];
                baseEntry.keywords = [...new Set([...existingKeywords, ...newKeywords])];
            }

            // 合并内容（用分隔符连接）
            if (other.content && other.content !== baseEntry.content) {
                baseEntry.content += `\n\n---\n\n${other.content}`;
            }

            // 合并别名信息
            if (other.name && other.name !== baseEntry.name) {
                if (!baseEntry.aliases) baseEntry.aliases = [];
                if (!baseEntry.aliases.includes(other.name)) {
                    baseEntry.aliases.push(other.name);
                }
            }
        }

        // 更新世界书
        const category = group.entries[0].category;
        if (this.worldbook[category]) {
            // 移除被合并的条目
            const namesToRemove = group.entries.slice(1).map(e => e.name);
            this.worldbook[category] = this.worldbook[category].filter(
                e => !namesToRemove.includes(e.name)
            );

            // 更新基础条目
            const baseIndex = this.worldbook[category].findIndex(e => e.name === baseEntry.name);
            if (baseIndex > -1) {
                this.worldbook[category][baseIndex] = baseEntry;
            }
        }

        return baseEntry;
    }

    /**
     * 更新统计
     */
    updateStats() {
        const container = this.modal?.element;
        if (!container) return;

        const duplicateCount = container.querySelector('#am-duplicate-count');
        const entryCount = container.querySelector('#am-entry-count');
        const selectedCount = container.querySelector('#am-selected-count');

        if (duplicateCount) duplicateCount.textContent = this.duplicates.length;
        if (entryCount) {
            const totalEntries = this.duplicates.reduce((sum, group) => sum + group.entries.length, 0);
            entryCount.textContent = totalEntries;
        }
        if (selectedCount) selectedCount.textContent = this.selectedGroups.size;

        // 更新合并按钮状态
        this.updateMergeButton();
    }

    /**
     * 更新合并按钮状态
     */
    updateMergeButton() {
        const container = this.modal?.element;
        if (!container) return;

        const btn = container.querySelector('#am-merge-selected');
        if (btn) {
            btn.disabled = this.selectedGroups.size === 0;
        }
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
        this.duplicates = [];
        this.selectedGroups.clear();
        this.worldbook = null;
    }
}

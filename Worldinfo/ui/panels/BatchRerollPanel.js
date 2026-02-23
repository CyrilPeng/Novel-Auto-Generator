/**
 * 批量重 Roll 面板
 * 支持一次选择多个条目进行重 Roll
 */
import { Modal } from '../components/Modal.js';
import { estimateTokenCount } from '../../utils/token.js';

export class BatchRerollPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onBatchReroll = options.onBatchReroll || (() => {});
        this.modal = null;
        this.selectedEntries = new Set();
        this.availableMemories = [];
    }

    /**
     * 打开面板
     * @param {Array} memories - 可用的记忆列表
     */
    open(memories = []) {
        this.availableMemories = memories;
        this.createModal();
        this.modal.open(this.createContent());
        this.bindEvents();
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
        if (this.selectedEntries) {
            this.selectedEntries.clear();
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
        this.selectedEntries = null;
        this.onClose = null;
    }

    /**
     * 创建内容 HTML
     */
    createContent() {
        return `
            <div class="ww-batch-reroll-content">
                <!-- 来源选择 -->
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:8px;font-size:13px;">📚 选择来源章节：</label>
                    <select id="ww-batch-source" style="
                        width:100%;
                        padding:10px;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        color:#fff;
                        font-size:13px;
                    ">
                        <option value="all">所有章节</option>
                        ${this.availableMemories.map((m, i) => `
                            <option value="${i}">${m.title || `第${i + 1}章`}</option>
                        `).join('')}
                    </select>
                </div>

                <!-- 并发设置 -->
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:8px;font-size:13px;">⚡ 并发数：</label>
                    <input type="number" id="ww-batch-concurrency" value="3" min="1" max="5" style="
                        width:100%;
                        padding:10px;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        color:#fff;
                        font-size:13px;
                    ">
                    <small style="color:#888;display:block;margin-top:6px;">建议 1-3，根据 API 速率调整</small>
                </div>

                <!-- 自定义提示词 -->
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:8px;font-size:13px;">📝 自定义提示词（可选）：</label>
                    <textarea id="ww-batch-prompt" rows="3" placeholder="添加额外的提示词指导 AI 重 Roll..." style="
                        width:100%;
                        padding:10px;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        color:#fff;
                        font-size:13px;
                        resize:vertical;
                    "></textarea>
                </div>

                <!-- 条目列表 -->
                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="font-size:13px;">🎯 选择要重 Roll 的条目：</label>
                        <div style="display:flex;gap:8px;">
                            <button id="ww-batch-select-all" style="
                                padding:4px 8px;
                                background:rgba(52,152,219,0.3);
                                border:1px solid #3498db;
                                border-radius:4px;
                                color:#fff;
                                font-size:11px;
                                cursor:pointer;
                            ">全选</button>
                            <button id="ww-batch-select-none" style="
                                padding:4px 8px;
                                background:rgba(150,150,150,0.3);
                                border:1px solid #999;
                                border-radius:4px;
                                color:#fff;
                                font-size:11px;
                                cursor:pointer;
                            ">全不选</button>
                        </div>
                    </div>
                    <div id="ww-batch-entry-list" style="
                        max-height:300px;
                        overflow-y:auto;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        padding:8px;
                    ">
                        <div style="text-align:center;color:#888;padding:20px;">请先选择来源章节</div>
                    </div>
                    <div id="ww-batch-selected-info" style="
                        margin-top:8px;
                        font-size:12px;
                        color:#888;
                        text-align:right;
                    ">已选：0 个条目</div>
                </div>

                <!-- 进度条 -->
                <div id="ww-batch-progress" style="display:none;margin-bottom:16px;">
                    <div style="margin-bottom:8px;font-size:12px;color:#ccc;">正在批量重 Roll...</div>
                    <div style="
                        width:100%;
                        height:6px;
                        background:rgba(255,255,255,0.1);
                        border-radius:3px;
                        overflow:hidden;
                    ">
                        <div id="ww-batch-progress-bar" style="
                            height:100%;
                            width:0%;
                            background:linear-gradient(90deg,#9b59b6,#8e44ad);
                            transition:width 0.3s ease;
                        "></div>
                    </div>
                    <div id="ww-batch-progress-text" style="
                        margin-top:6px;
                        font-size:11px;
                        color:#888;
                        text-align:center;
                    "></div>
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '🎲 批量重 Roll',
            width: '700px',
            maxWidth: '95%',
            closable: true,
            maskClosable: false,
            buttons: [
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '🎲 开始重 Roll', type: 'primary', action: 'start', disabled: true }
            ],
            onButtonClick: (action, event, modalInstance) => {
                if (action === 'cancel') {
                    this.close();
                } else if (action === 'start') {
                    this.startBatchReroll();
                }
            },
            onClose: () => this.onClose()
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.modal?.element) return;

        const el = this.modal.element;

        // 来源选择变化
        el.querySelector('#ww-batch-source')?.addEventListener('change', () => {
            this.renderEntryList();
        });

        // 全选
        el.querySelector('#ww-batch-select-all')?.addEventListener('click', () => {
            this.selectAll(true);
        });

        // 全不选
        el.querySelector('#ww-batch-select-none')?.addEventListener('click', () => {
            this.selectAll(false);
        });

        // 更新按钮状态
        this.updateButtonState = (disabled) => {
            const startBtn = el.querySelector('[data-action="start"]');
            if (startBtn) {
                startBtn.disabled = disabled;
                startBtn.style.opacity = disabled ? '0.5' : '1';
            }
        };

        // 进度更新函数
        this.updateProgress = (current, total) => {
            const progressEl = el.querySelector('#ww-batch-progress');
            const progressBar = el.querySelector('#ww-batch-progress-bar');
            const progressText = el.querySelector('#ww-batch-progress-text');

            if (progressEl) progressEl.style.display = 'block';
            if (progressBar) progressBar.style.width = `${(current / total) * 100}%`;
            if (progressText) progressText.textContent = `进度：${current}/${total}`;
        };
    }

    /**
     * 渲染条目列表
     */
    renderEntryList() {
        if (!this.modal?.element) return;

        const sourceSelect = this.modal.element.querySelector('#ww-batch-source');
        const listEl = this.modal.element.querySelector('#ww-batch-entry-list');
        const infoEl = this.modal.element.querySelector('#ww-batch-selected-info');

        if (!sourceSelect || !listEl) {
            console.warn('[批量重 Roll] 缺少必要的 DOM 元素');
            return;
        }

        const sourceIndex = sourceSelect.value;
        this.selectedEntries.clear();

        if (sourceIndex === 'all') {
            // 所有章节 - 收集所有条目
            const allEntries = [];
            this.availableMemories.forEach((memory, memIndex) => {
                if (memory.result) {
                    Object.entries(memory.result).forEach(([category, entries]) => {
                        Object.entries(entries).forEach(([entryName, entryData]) => {
                            allEntries.push({
                                memoryIndex: memIndex,
                                category,
                                entryName,
                                tokens: estimateTokenCount(JSON.stringify(entryData))
                            });
                        });
                    });
                }
            });
            this.renderEntries(allEntries, listEl, infoEl);
        } else {
            // 指定章节
            const memIndex = parseInt(sourceIndex);
            const memory = this.availableMemories[memIndex];
            if (!memory?.result) {
                listEl.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">该章节没有处理结果</div>';
                if (infoEl) infoEl.textContent = '已选：0 个条目';
                if (this.updateButtonState) this.updateButtonState(true);
                return;
            }

            const entries = [];
            Object.entries(memory.result).forEach(([category, categoryEntries]) => {
                Object.entries(categoryEntries).forEach(([entryName, entryData]) => {
                    entries.push({
                        memoryIndex: memIndex,
                        category,
                        entryName,
                        tokens: estimateTokenCount(JSON.stringify(entryData))
                    });
                });
            });
            this.renderEntries(entries, listEl, infoEl);
        }
    }

    /**
     * 渲染条目
     */
    renderEntries(entries, listEl, infoEl) {
        if (entries.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">没有可重 Roll 的条目</div>';
            if (infoEl) infoEl.textContent = '已选：0 个条目';
            if (this.updateButtonState) this.updateButtonState(true);
            return;
        }

        listEl.innerHTML = entries.map((entry, index) => `
            <label style="
                display:flex;
                align-items:center;
                padding:8px;
                margin:4px 0;
                background:rgba(255,255,255,0.05);
                border-radius:4px;
                cursor:pointer;
            ">
                <input type="checkbox" data-entry="${JSON.stringify(entry).replace(/"/g, '&quot;')}" style="
                    width:18px;
                    height:18px;
                    margin-right:8px;
                    accent-color:#9b59b6;
                ">
                <div style="flex:1;">
                    <div style="font-size:12px;font-weight:bold;color:#fff;">
                        <span style="color:#9b59b6;">[${entry.category}]</span> ${entry.entryName}
                    </div>
                    <div style="font-size:10px;color:#888;">
                        ~${entry.tokens} tokens | 来源：第${entry.memoryIndex + 1}章
                    </div>
                </div>
            </label>
        `).join('');

        // 绑定复选框事件
        listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateSelectedCount(infoEl);
                if (this.updateButtonState) {
                    this.updateButtonState(this.selectedEntries.size === 0);
                }
            });
        });

        if (infoEl) infoEl.textContent = '已选：0 个条目';
        if (this.updateButtonState) this.updateButtonState(true);
    }

    /**
     * 全选/全不选
     */
    selectAll(select) {
        const checkboxes = this.modal?.element?.querySelectorAll('#ww-batch-entry-list input[type="checkbox"]');
        const infoEl = this.modal?.element?.querySelector('#ww-batch-selected-info');

        if (!checkboxes) return;

        checkboxes.forEach(cb => {
            cb.checked = select;
            if (select) {
                try {
                    const entry = JSON.parse(cb.dataset.entry);
                    const key = `${entry.memoryIndex}:${entry.category}:${entry.entryName}`;
                    this.selectedEntries.add(key);
                } catch (e) {}
            }
        });

        this.selectedEntries.clear();
        if (select) {
            checkboxes.forEach(cb => {
                try {
                    const entry = JSON.parse(cb.dataset.entry);
                    const key = `${entry.memoryIndex}:${entry.category}:${entry.entryName}`;
                    this.selectedEntries.add(key);
                } catch (e) {}
            });
        }

        this.updateSelectedCount(infoEl);
        if (this.updateButtonState) {
            this.updateButtonState(this.selectedEntries.size === 0);
        }
    }

    /**
     * 更新已选数量
     */
    updateSelectedCount(infoEl) {
        const checkboxes = this.modal?.element?.querySelectorAll('#ww-batch-entry-list input[type="checkbox"]:checked');
        this.selectedEntries.clear();

        checkboxes.forEach(cb => {
            try {
                const entry = JSON.parse(cb.dataset.entry);
                const key = `${entry.memoryIndex}:${entry.category}:${entry.entryName}`;
                this.selectedEntries.add(key);
            } catch (e) {}
        });

        if (infoEl) {
            infoEl.textContent = `已选：${this.selectedEntries.size} 个条目`;
        }
    }

    /**
     * 开始批量重 Roll
     */
    startBatchReroll() {
        if (this.selectedEntries.size === 0) {
            showError('请至少选择一个条目');
            return;
        }

        const prompt = this.modal?.element?.querySelector('#ww-batch-prompt')?.value || '';
        const concurrency = parseInt(this.modal?.element?.querySelector('#ww-batch-concurrency')?.value) || 3;

        const entries = [];
        this.selectedEntries.forEach(key => {
            const [memIndex, category, entryName] = key.split(':');
            entries.push({
                memoryIndex: parseInt(memIndex),
                category,
                entryName
            });
        });

        this.onBatchReroll({
            entries,
            prompt,
            concurrency,
            onProgress: this.updateProgress
        });
    }
}

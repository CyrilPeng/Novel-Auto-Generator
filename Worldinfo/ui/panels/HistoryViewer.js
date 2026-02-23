/**
 * 历史记录查看器面板
 * 查看、管理和回滚世界书生成的历史记录
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { HistoryStore } from '../../db/HistoryStore.js';
import { formatDateTime } from '../../utils/index.js';

/**
 * 历史记录查看器配置
 */
export class HistoryViewerConfig {
    constructor({
        onClose = () => {},
        onRollback = () => {},
        containerId = null
    } = {}) {
        this.onClose = onClose;
        this.onRollback = onRollback;
        this.containerId = containerId;
    }
}

/**
 * 历史记录查看器面板
 */
export class HistoryViewer {
    constructor(config = {}) {
        this.config = new HistoryViewerConfig(config);
        this.modal = null;
        this.store = new HistoryStore();
        this.history = [];
        this.selectedHistoryId = null;
        this.element = null;
    }

    /**
     * 创建面板 HTML
     * @returns {string} HTML 字符串
     */
    createHTML() {
        return `
            <div id="ttw-history-viewer" class="ww-history-viewer">
                <div class="ww-history-container">
                    <!-- 左侧历史列表 -->
                    <div class="ww-history-left">
                        <div class="ww-history-header">
                            <span class="ww-history-title">📜 历史记录</span>
                            <div class="ww-history-actions">
                                <button id="ttw-history-refresh" class="ww-btn ww-btn-secondary ww-btn-small">🔄 刷新</button>
                                <button id="ttw-history-clear" class="ww-btn ww-btn-danger ww-btn-small">🗑️ 清空</button>
                            </div>
                        </div>
                        <div id="ttw-history-list" class="ww-history-list">
                            <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                                ⏳ 正在加载历史记录...
                            </div>
                        </div>
                    </div>
                    
                    <!-- 右侧详情区域 -->
                    <div class="ww-history-right">
                        <div id="ttw-history-detail">
                            <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                                👈 点击左侧查看历史详情
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '📜 历史记录',
            width: '900px',
            maxWidth: '95%',
            closable: true,
            maskClosable: false,
            buttons: [
                { text: '关闭', type: 'secondary', action: 'close' }
            ],
            onButtonClick: (action) => {
                if (action === 'close') {
                    this.close();
                }
            }
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

        // 刷新按钮
        this.element.querySelector('#ttw-history-refresh')?.addEventListener('click', () => {
            this.loadHistory();
        });

        // 清空按钮
        this.element.querySelector('#ttw-history-clear')?.addEventListener('click', async () => {
            if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
                await this.store.clear();
                await this.loadHistory();
            }
        });
    }

    /**
     * 加载历史记录
     */
    async loadHistory() {
        const listEl = this.element?.querySelector('#ttw-history-list');
        if (!listEl) return;

        try {
            this.history = await this.store.getAll();
            
            if (this.history.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                        暂无历史记录
                    </div>
                `;
                return;
            }

            listEl.innerHTML = this.history.map(h => {
                const time = formatDateTime(h.timestamp, 'MM-DD HH:mm');
                const changeCount = h.changedEntries?.length || 0;
                const shortTitle = (h.memoryTitle || `第${h.memoryIndex + 1}章`).substring(0, 12);
                const isSelected = h.id === this.selectedHistoryId ? 'selected' : '';
                
                return `
                    <div class="ww-history-item ${isSelected}" data-history-id="${h.id}">
                        <div class="ww-history-item-title" title="${h.memoryTitle}">${shortTitle}</div>
                        <div class="ww-history-item-time">${time}</div>
                        <div class="ww-history-item-info">${changeCount}项变更</div>
                    </div>
                `;
            }).join('');

            // 绑定点击事件
            listEl.querySelectorAll('.ww-history-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const historyId = parseInt(item.dataset.historyId);
                    this.selectedHistoryId = historyId;
                    
                    // 更新选中状态
                    listEl.querySelectorAll('.ww-history-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    
                    // 加载详情
                    await this.loadHistoryDetail(historyId);
                });
            });

        } catch (error) {
            console.error('[历史记录] 加载失败:', error);
            listEl.innerHTML = `
                <div style="text-align:center;color:var(--ww-danger);padding:40px;">
                    加载失败：${error.message}
                </div>
            `;
        }
    }

    /**
     * 加载历史详情
     * @param {number} historyId - 历史记录 ID
     */
    async loadHistoryDetail(historyId) {
        const detailEl = this.element?.querySelector('#ttw-history-detail');
        if (!detailEl) return;

        try {
            const history = await this.store.getById(historyId);
            if (!history) {
                detailEl.innerHTML = `
                    <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                        历史记录不存在
                    </div>
                `;
                return;
            }

            const changeCount = history.changedEntries?.length || 0;
            const time = formatDateTime(history.timestamp);
            
            // 构建变更列表
            let changesHtml = '';
            if (history.changedEntries && history.changedEntries.length > 0) {
                changesHtml = `
                    <div class="ww-history-changes">
                        <div class="ww-history-changes-title">📝 变更列表 (${changeCount}项)</div>
                        ${history.changedEntries.map((change, i) => `
                            <div class="ww-history-change ww-history-change-${change.type}">
                                <span class="ww-change-type">${this.getChangeTypeLabel(change.type)}</span>
                                <span class="ww-change-path">${change.category} / ${change.entryName}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            detailEl.innerHTML = `
                <div class="ww-history-detail">
                    <div class="ww-detail-header">
                        <div class="ww-detail-title">${history.memoryTitle || `第${history.memoryIndex + 1}章`}</div>
                        <div class="ww-detail-time">${time}</div>
                    </div>
                    
                    <div class="ww-detail-stats">
                        <div class="ww-stat-item">
                            <span class="ww-stat-label">变更数</span>
                            <span class="ww-stat-value">${changeCount}</span>
                        </div>
                        <div class="ww-stat-item">
                            <span class="ww-stat-label">文件哈希</span>
                            <span class="ww-stat-value">${history.fileHash ? history.fileHash.substring(0, 10) + '...' : '无'}</span>
                        </div>
                    </div>
                    
                    ${changesHtml}
                    
                    <div class="ww-detail-actions">
                        <button id="ttw-history-rollback" class="ww-btn ww-btn-warning">
                            ↩️ 回滚到此版本
                        </button>
                        <button id="ttw-history-compare" class="ww-btn ww-btn-info">
                            🔍 对比差异
                        </button>
                    </div>
                </div>
            `;

            // 绑定回滚按钮
            detailEl.querySelector('#ttw-history-rollback')?.addEventListener('click', async () => {
                if (confirm(`确定要回滚到 "${history.memoryTitle}" 的版本吗？\n\n⚠️ 警告：这将删除该时间点之后的所有历史记录。`)) {
                    await this.doRollback(historyId);
                }
            });

            // 绑定对比按钮
            detailEl.querySelector('#ttw-history-compare')?.addEventListener('click', () => {
                this.showCompareDialog(history);
            });

        } catch (error) {
            console.error('[历史记录] 加载详情失败:', error);
            detailEl.innerHTML = `
                <div style="text-align:center;color:var(--ww-danger);padding:40px;">
                    加载失败：${error.message}
                </div>
            `;
        }
    }

    /**
     * 获取变更类型标签
     */
    getChangeTypeLabel(type) {
        const labels = {
            'add': '➕ 新增',
            'modify': '✏️ 修改',
            'delete': '🗑️ 删除'
        };
        return labels[type] || type;
    }

    /**
     * 执行回滚
     * @param {number} historyId - 历史记录 ID
     */
    async doRollback(historyId) {
        try {
            const history = await this.store.rollbackTo(historyId);
            
            // 通知回调
            this.config.onRollback(history);
            
            // 刷新列表
            await this.loadHistory();
            
            alert(`✅ 已成功回滚到 "${history.memoryTitle}" 的版本`);
            
        } catch (error) {
            console.error('[历史记录] 回滚失败:', error);
            alert(`❌ 回滚失败：${error.message}`);
        }
    }

    /**
     * 显示对比对话框
     * @param {Object} history - 历史记录对象
     */
    showCompareDialog(history) {
        const previousCount = Object.keys(history.previousWorldbook || {}).length;
        const newCount = Object.keys(history.newWorldbook || {}).length;
        
        const compareModal = new Modal({
            title: '🔍 对比差异',
            width: '800px',
            buttons: [{ text: '关闭', type: 'secondary', action: 'close' }],
            onButtonClick: (action) => {
                if (action === 'close') compareModal.close();
            }
        });
        
        const content = `
            <div class="ww-compare-container">
                <div class="ww-compare-header">
                    <div class="ww-compare-stat">
                        <span class="ww-stat-label">回滚前</span>
                        <span class="ww-stat-value">${previousCount} 个分类</span>
                    </div>
                    <div class="ww-compare-arrow">→</div>
                    <div class="ww-compare-stat">
                        <span class="ww-stat-label">回滚后</span>
                        <span class="ww-stat-value">${newCount} 个分类</span>
                    </div>
                </div>
                
                <div class="ww-compare-changes">
                    <h4>📝 详细变更 (${history.changedEntries?.length || 0}项)</h4>
                    ${history.changedEntries?.map((change, i) => `
                        <div class="ww-compare-change ww-compare-change-${change.type}">
                            <div class="ww-change-header">
                                <span class="ww-change-type">${this.getChangeTypeLabel(change.type)}</span>
                                <span class="ww-change-path">${change.category} / ${change.entryName}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        compareModal.open(content);
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
        this.history = [];
        this.selectedHistoryId = null;
        this.store = null;
        this.config = null;
    }

    /**
     * 打开面板
     */
    async open() {
        this.createModal();
        await this.loadHistory();
    }
}

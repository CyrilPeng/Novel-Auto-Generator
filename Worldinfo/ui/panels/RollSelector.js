/**
 * Roll 选择器面板
 * 选择 Roll 历史版本并应用
 */
import { Modal } from '../components/Modal.js';
import { RollService } from '../../services/RollService.js';
import { formatDateTime } from '../../utils/index.js';

/**
 * Roll 选择器配置
 */
export class RollSelectorConfig {
    constructor({
        memoryIndex = 0,
        chapterTitle = '',
        currentResult = null,
        onSelect = null,
        onApply = null,
        onClose = null
    } = {}) {
        this.memoryIndex = memoryIndex;
        this.chapterTitle = chapterTitle;
        this.currentResult = currentResult;
        this.onSelect = onSelect;
        this.onApply = onApply;
        this.onClose = onClose;
    }
}

/**
 * Roll 选择器面板
 */
export class RollSelector {
    constructor(config = {}) {
        this.config = new RollSelectorConfig(config);
        this.modal = null;
        this.rollService = null;
        this.rolls = [];
        this.selectedRollId = null;
        this.element = null;
    }

    /**
     * 初始化
     * @param {Object} configManager - 配置管理器
     * @param {APIService} apiService - API 服务
     */
    init(configManager, apiService) {
        this.rollService = new RollService(configManager, apiService);
    }

    /**
     * 创建面板 HTML
     * @returns {string} HTML 字符串
     */
    createHTML() {
        return `
            <div id="ttw-roll-selector" class="ww-roll-selector">
                <div class="ww-roll-container">
                    <!-- 左侧 Roll 历史列表 -->
                    <div class="ww-roll-left">
                        <div class="ww-roll-header">
                            <span class="ww-roll-title">🎲 Roll 历史</span>
                            <div class="ww-roll-actions">
                                <button id="ttw-roll-refresh" class="ww-btn ww-btn-secondary ww-btn-small">🔄 刷新</button>
                                <button id="ttw-roll-clear" class="ww-btn ww-btn-danger ww-btn-small">🗑️ 清空</button>
                            </div>
                        </div>
                        <div id="ttw-roll-list" class="ww-roll-list">
                            <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                                ⏳ 正在加载 Roll 历史...
                            </div>
                        </div>
                    </div>
                    
                    <!-- 右侧详情区域 -->
                    <div class="ww-roll-right">
                        <div id="ttw-roll-detail">
                            <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                                👈 点击左侧查看 Roll 详情
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
            title: `🎲 重 Roll 历史 - ${this.config.chapterTitle || `第${this.config.memoryIndex + 1}章`}`,
            width: '900px',
            maxWidth: '95%',
            closable: true,
            maskClosable: false,
            buttons: [
                { text: '关闭', type: 'secondary', action: 'close' },
                { text: '应用此版本', type: 'primary', action: 'apply', disabled: true }
            ],
            onButtonClick: async (action, event, modalInstance) => {
                if (action === 'close') {
                    this.close();
                } else if (action === 'apply') {
                    await this.applySelectedRoll();
                }
            }
        });
        
        this.modal.open(this.createHTML());
        this.element = this.modal.element;
        this.bindEvents();
        this.loadRollHistory();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.element) return;

        // 刷新按钮
        this.element.querySelector('#ttw-roll-refresh')?.addEventListener('click', () => {
            this.loadRollHistory();
        });

        // 清空按钮
        this.element.querySelector('#ttw-roll-clear')?.addEventListener('click', async () => {
            if (confirm('确定要清空此章节的所有 Roll 历史吗？')) {
                await this.rollService.clearRollHistory(this.config.memoryIndex);
                await this.loadRollHistory();
            }
        });
    }

    /**
     * 加载 Roll 历史
     */
    async loadRollHistory() {
        const listEl = this.element?.querySelector('#ttw-roll-list');
        if (!listEl) return;

        try {
            this.rolls = await this.rollService.getRollHistory(this.config.memoryIndex);
            
            if (this.rolls.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                        暂无 Roll 历史
                    </div>
                `;
                return;
            }

            listEl.innerHTML = this.rolls.map((roll, i) => {
                const time = formatDateTime(roll.timestamp, 'MM-DD HH:mm');
                const entryCount = this.countEntries(roll.result);
                const isSelected = roll.id === this.selectedRollId ? 'selected' : '';
                
                return `
                    <div class="ww-roll-item ${isSelected}" data-roll-id="${roll.id}" data-roll-index="${i}">
                        <div class="ww-roll-item-title">Roll #${i + 1}</div>
                        <div class="ww-roll-item-time">${time}</div>
                        <div class="ww-roll-item-info">${entryCount} 个条目</div>
                    </div>
                `;
            }).join('');

            // 绑定点击事件
            listEl.querySelectorAll('.ww-roll-item').forEach(item => {
                item.addEventListener('click', () => {
                    const rollId = parseInt(item.dataset.rollId);
                    const rollIndex = parseInt(item.dataset.rollIndex);
                    this.selectedRollId = rollId;
                    
                    // 更新选中状态
                    listEl.querySelectorAll('.ww-roll-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    
                    // 加载详情
                    this.loadRollDetail(rollIndex);
                    
                    // 启用应用按钮
                    this.modal.setButtonProps('apply', { disabled: false });
                    
                    // 通知回调
                    this.config.onSelect?.(this.rolls[rollIndex]);
                });
            });

        } catch (error) {
            console.error('[Roll 历史] 加载失败:', error);
            listEl.innerHTML = `
                <div style="text-align:center;color:var(--ww-danger);padding:40px;">
                    加载失败：${error.message}
                </div>
            `;
        }
    }

    /**
     * 加载 Roll 详情
     * @param {number} rollIndex - Roll 索引
     */
    loadRollDetail(rollIndex) {
        const detailEl = this.element?.querySelector('#ttw-roll-detail');
        if (!detailEl) return;

        const roll = this.rolls[rollIndex];
        if (!roll) return;

        const entryCount = this.countEntries(roll.result);
        const time = formatDateTime(roll.timestamp);
        
        // 构建结果预览
        let previewHtml = '';
        if (roll.result) {
            for (const [category, entries] of Object.entries(roll.result)) {
                if (typeof entries !== 'object' || Object.keys(entries).length === 0) continue;
                
                previewHtml += `
                    <div class="ww-roll-category">
                        <div class="ww-roll-category-title">📁 ${category}</div>
                        <div class="ww-roll-entries">
                            ${Object.entries(entries).map(([name, entry]) => {
                                const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                                return `
                                    <div class="ww-roll-entry">
                                        <div class="ww-roll-entry-name">📄 ${name}</div>
                                        <div class="ww-roll-entry-keywords">${keywords || '无关键词'}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        }

        detailEl.innerHTML = `
            <div class="ww-roll-detail">
                <div class="ww-detail-header">
                    <div class="ww-detail-title">Roll #${rollIndex + 1}</div>
                    <div class="ww-detail-time">${time}</div>
                </div>
                
                <div class="ww-detail-stats">
                    <div class="ww-stat-item">
                        <span class="ww-stat-label">条目数</span>
                        <span class="ww-stat-value">${entryCount}</span>
                    </div>
                    <div class="ww-stat-item">
                        <span class="ww-stat-label">Token 数</span>
                        <span class="ww-stat-value">~${this.estimateRollTokens(roll.result)}</span>
                    </div>
                </div>
                
                <div class="ww-detail-result">
                    <h4>📊 生成结果</h4>
                    ${previewHtml || '<div style="color:var(--ww-text-muted);">无结果</div>'}
                </div>
                
                <div class="ww-detail-actions">
                    <button id="ttw-roll-compare" class="ww-btn ww-btn-info">
                        🔍 与当前版本对比
                    </button>
                    <button id="ttw-roll-view-json" class="ww-btn ww-btn-secondary">
                        📦 查看 JSON
                    </button>
                </div>
            </div>
        `;

        // 绑定对比按钮
        detailEl.querySelector('#ttw-roll-compare')?.addEventListener('click', () => {
            this.showCompareDialog(roll);
        });

        // 绑定 JSON 查看按钮
        detailEl.querySelector('#ttw-roll-view-json')?.addEventListener('click', () => {
            this.showJsonDialog(roll);
        });
    }

    /**
     * 应用选中的 Roll
     */
    async applySelectedRoll() {
        if (!this.selectedRollId) return;

        const rollIndex = this.rolls.findIndex(r => r.id === this.selectedRollId);
        if (rollIndex === -1) return;

        const roll = this.rolls[rollIndex];
        
        try {
            this.config.onApply?.(roll.result);
            alert(`✅ 已应用 Roll #${rollIndex + 1}`);
            this.close();
        } catch (error) {
            alert(`❌ 应用失败：${error.message}`);
        }
    }

    /**
     * 显示对比对话框
     * @param {Object} roll - Roll 对象
     */
    showCompareDialog(roll) {
        const currentResult = this.config.currentResult || {};
        const comparison = this.rollService?.compareRollResults(currentResult, roll.result) || { changes: [], totalChanges: 0 };
        
        const compareModal = new Modal({
            title: '🔍 对比差异',
            width: '700px',
            buttons: [{ text: '关闭', type: 'secondary', action: 'close' }],
            onButtonClick: (action) => {
                if (action === 'close') compareModal.close();
            }
        });
        
        const content = `
            <div class="ww-compare-container">
                <div class="ww-compare-header">
                    <div class="ww-compare-stat">
                        <span class="ww-stat-label">当前版本</span>
                        <span class="ww-stat-value">${this.countEntries(currentResult)} 个条目</span>
                    </div>
                    <div class="ww-compare-arrow">→</div>
                    <div class="ww-compare-stat">
                        <span class="ww-stat-label">Roll #${this.rolls.findIndex(r => r.id === roll.id) + 1}</span>
                        <span class="ww-stat-value">${this.countEntries(roll.result)} 个条目</span>
                    </div>
                </div>
                
                <div class="ww-compare-changes">
                    <h4>📝 差异 (${comparison.totalChanges} 处)</h4>
                    ${comparison.changes.length > 0 
                        ? comparison.changes.map(change => `
                            <div class="ww-compare-change ww-compare-change-${change.type}">
                                <span class="ww-change-type">${this.getChangeTypeLabel(change.type)}</span>
                                <span class="ww-change-path">${change.category} / ${change.entryName}</span>
                            </div>
                        `).join('')
                        : '<div style="color:var(--ww-text-muted);">无差异</div>'
                    }
                </div>
            </div>
        `;
        
        compareModal.open(content);
    }

    /**
     * 显示 JSON 查看对话框
     * @param {Object} roll - Roll 对象
     */
    showJsonDialog(roll) {
        const jsonModal = new Modal({
            title: '📦 JSON 数据',
            width: '800px',
            buttons: [
                { text: '复制', type: 'primary', action: 'copy' },
                { text: '关闭', type: 'secondary', action: 'close' }
            ],
            onButtonClick: (action) => {
                if (action === 'close') {
                    jsonModal.close();
                } else if (action === 'copy') {
                    navigator.clipboard.writeText(JSON.stringify(roll.result, null, 2));
                    alert('✅ 已复制到剪贴板');
                }
            }
        });
        
        const content = `
            <pre style="max-height:60vh;overflow-y:auto;background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;font-size:11px;white-space:pre-wrap;word-break:break-all;">${JSON.stringify(roll.result, null, 2)}</pre>
        `;
        
        jsonModal.open(content);
    }

    /**
     * 统计条目数
     * @param {Object} result - 结果对象
     * @returns {number} 条目数
     */
    countEntries(result) {
        if (!result || typeof result !== 'object') return 0;
        
        let count = 0;
        for (const entries of Object.values(result)) {
            if (typeof entries === 'object') {
                count += Object.keys(entries).length;
            }
        }
        return count;
    }

    /**
     * 估算 Token 数
     * @param {Object} result - 结果对象
     * @returns {number} Token 数
     */
    estimateRollTokens(result) {
        const jsonStr = JSON.stringify(result || {});
        // 简单估算：中文字符约 1.5 token，英文约 1 token
        const chineseChars = (jsonStr.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = jsonStr.length - chineseChars;
        return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
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
        this.rolls = [];
        this.selectedRollId = null;
        this.rollService = null;
        this.config = null;
    }

    /**
     * 打开面板
     */
    open() {
        this.createModal();
    }
}

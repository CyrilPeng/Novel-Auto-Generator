/**
 * 世界书详细视图面板
 * 显示世界书的完整视图，支持 Token 阈值高亮
 */
import { Modal } from '../components/Modal.js';
import { estimateTokenCount, getEntryTotalTokens } from '../../utils/token.js';

export class WorldbookViewPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.modal = null;
        this.element = null;
        this.worldbook = {};
        this.tokenThreshold = 0;
    }

    /**
     * 打开面板
     */
    open(worldbook = {}) {
        this.worldbook = worldbook;
        this.createModal();
        this.modal.open();
        this.renderWorldbook();
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
        this.worldbook = null;
        this.onClose = null;
    }

    /**
     * 创建弹窗 HTML
     */
    createHTML() {
        return `
            <div id="worldbook-view-panel" class="ww-worldbook-view-panel">
                <!-- 工具栏 -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:13px;color:var(--ww-text-secondary);">🔍 Token 阈值:</span>
                        <input type="number" id="token-threshold-input" class="ww-input" 
                               value="0" min="0" step="50" 
                               style="width:80px;padding:4px 8px;font-size:12px;" 
                               placeholder="0">
                        <button id="apply-threshold-btn" class="ww-btn ww-btn-small ww-btn-info">
                            应用
                        </button>
                        <span style="font-size:11px;color:var(--ww-text-muted);">低于此值的条目将红色高亮（0=关闭）</span>
                    </div>
                    <div id="worldbook-stats" style="font-size:12px;color:var(--ww-text-secondary);">
                        0 个分类，0 个条目
                    </div>
                </div>

                <!-- 世界书内容 -->
                <div id="worldbook-content" style="max-height:60vh;overflow-y:auto;">
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '📖 世界书详细视图',
            width: '900px',
            maxWidth: '95%',
            closable: true,
            maskClosable: true,
            buttons: [
                { text: '关闭', type: 'secondary', action: 'close' }
            ],
            onButtonClick: (action) => {
                if (action === 'close') this.close();
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

        // 应用阈值
        this.element.querySelector('#apply-threshold-btn')?.addEventListener('click', () => {
            const input = this.element?.querySelector('#token-threshold-input');
            this.tokenThreshold = parseInt(input?.value) || 0;
            this.renderWorldbook();
        });

        // 回车应用
        this.element.querySelector('#token-threshold-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.element.querySelector('#apply-threshold-btn')?.click();
            }
        });
    }

    /**
     * 渲染世界书
     */
    renderWorldbook() {
        const contentEl = this.element?.querySelector('#worldbook-content');
        const statsEl = this.element?.querySelector('#worldbook-stats');
        
        if (!contentEl) return;

        let totalCategories = 0;
        let totalEntries = 0;
        let totalTokens = 0;
        let belowThresholdCount = 0;

        let html = '';

        for (const [category, entries] of Object.entries(this.worldbook)) {
            if (typeof entries !== 'object' || Object.keys(entries).length === 0) continue;

            totalCategories++;
            const categoryTokens = this.calculateCategoryTokens(entries);
            totalTokens += categoryTokens;

            html += `
                <div class="ww-worldbook-category" style="margin-bottom:15px;border:1px solid var(--ww-primary);border-radius:var(--ww-radius);overflow:hidden;">
                    <div class="ww-worldbook-category-header" style="background:linear-gradient(135deg,var(--ww-primary),var(--ww-primary-dark));padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
                        <span class="ww-worldbook-category-title" style="font-weight:bold;color:#fff;">📁 ${this.escapeHtml(category)}</span>
                        <span class="ww-worldbook-category-stats" style="font-size:12px;color:rgba(255,255,255,0.8);">
                            ${Object.keys(entries).length} 条目 | <span style="color:#f1c40f;">~${categoryTokens} tk</span>
                        </span>
                    </div>
                    <div class="ww-worldbook-category-body" style="background:var(--ww-bg-secondary);padding:10px;">
            `;

            for (const [entryName, entry] of Object.entries(entries)) {
                totalEntries++;
                const entryTokens = getEntryTotalTokens(entry);
                totalTokens += entryTokens;

                const isBelowThreshold = this.tokenThreshold > 0 && entryTokens < this.tokenThreshold;
                if (isBelowThreshold) belowThresholdCount++;

                const highlightStyle = isBelowThreshold 
                    ? 'background:#7f1d1d;border-left:3px solid #ef4444;' 
                    : 'border-left:3px solid #3498db;';
                
                const tokenStyle = isBelowThreshold 
                    ? 'color:#ef4444;font-weight:bold;' 
                    : 'color:#f1c40f;';

                const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                const content = entry['内容'] || '';

                html += `
                    <div class="ww-worldbook-entry" style="margin:8px 0;border:1px solid var(--ww-border);border-radius:var(--ww-radius);overflow:hidden;${highlightStyle}">
                        <div class="ww-worldbook-entry-header" style="background:var(--ww-bg-tertiary);padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
                            <span class="ww-worldbook-entry-title" style="font-weight:bold;font-size:13px;color:var(--ww-text-primary);">
                                ${isBelowThreshold ? '⚠️ ' : ''}📄 ${this.escapeHtml(entryName)}
                            </span>
                            <span style="font-size:9px;color:var(--ww-text-muted);display:flex;gap:4px;align-items:center;">
                                <span style="${tokenStyle}">${entryTokens} tk</span>
                                <span>D${entry.depth || 4}O${entry.order || 100}</span>
                            </span>
                        </div>
                        <div class="ww-worldbook-entry-body" style="display:none;background:#1c1c1c;padding:12px;">
                            ${keywords ? `
                                <div style="margin-bottom:8px;padding:8px;background:#252525;border-left:3px solid #9b59b6;border-radius:4px;">
                                    <div style="color:#9b59b6;font-size:11px;margin-bottom:4px;display:flex;justify-content:space-between;">
                                        <span>🔑 关键词</span>
                                        <span style="color:#888;">~${estimateTokenCount(keywords)} tk</span>
                                    </div>
                                    <div style="font-size:13px;">${this.escapeHtml(keywords)}</div>
                                </div>
                            ` : ''}
                            ${content ? `
                                <div style="padding:8px;background:#252525;border-left:3px solid #27ae60;border-radius:4px;line-height:1.6;">
                                    <div style="color:#27ae60;font-size:11px;margin-bottom:4px;display:flex;justify-content:space-between;">
                                        <span>📝 内容</span>
                                        <span style="color:#888;">~${estimateTokenCount(content)} tk</span>
                                    </div>
                                    <div style="font-size:13px;white-space:pre-wrap;">${this.escapeHtml(content).replace(/\n/g, '<br>')}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }

            html += `</div></div>`;
        }

        if (totalCategories === 0) {
            contentEl.innerHTML = `
                <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                    暂无世界书数据
                </div>
            `;
        } else {
            contentEl.innerHTML = html;
        }

        // 更新统计
        const thresholdInfo = this.tokenThreshold > 0 
            ? ` | <span style="color:#ef4444;">⚠️ ${belowThresholdCount}个条目低于${this.tokenThreshold}tk</span>`
            : '';
        
        if (statsEl) {
            statsEl.innerHTML = `共 ${totalCategories} 个分类，${totalEntries} 个条目 | <span style="color:#f1c40f;">总计 ~${totalTokens} tk</span>${thresholdInfo}`;
        }

        // 绑定展开/折叠事件
        contentEl.querySelectorAll('.ww-worldbook-entry-header').forEach(header => {
            header.addEventListener('click', () => {
                const body = header.nextElementSibling;
                if (body) {
                    body.style.display = body.style.display === 'block' ? 'none' : 'block';
                }
            });
        });
    }

    /**
     * 计算分类 Token 总数
     */
    calculateCategoryTokens(entries) {
        let total = 0;
        for (const entry of Object.values(entries)) {
            total += getEntryTotalTokens(entry);
        }
        return total;
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        if (!text) return '';
        const d = document.createElement('span');
        d.textContent = text;
        return d.innerHTML;
    }
}

/**
 * 查找替换面板
 * 批量查找和替换世界书内容
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';

/**
 * 查找替换面板配置
 */
export class FindReplacePanelConfig {
    constructor({
        worldbook = {},
        onFind = null,
        onReplace = null,
        onClose = null
    } = {}) {
        this.worldbook = worldbook;
        this.onFind = onFind;
        this.onReplace = onReplace;
        this.onClose = onClose;
    }
}

/**
 * 查找替换面板
 */
export class FindReplacePanel {
    constructor(config = {}) {
        this.config = new FindReplacePanelConfig(config);
        this.modal = null;
        this.findResults = [];
        this.element = null;
    }

    /**
     * 创建面板 HTML
     * @returns {string} HTML 字符串
     */
    createHTML() {
        return `
            <div id="ttw-find-replace-panel" class="ww-find-replace-panel">
                <!-- 查找区域 -->
                <div class="ww-find-section">
                    <div class="ww-find-row">
                        <label class="ww-input-label" style="min-width:80px;">🔍 查找：</label>
                        <input type="text" id="ttw-find-input" class="ww-input" placeholder="输入要查找的内容..." style="flex:1;">
                    </div>
                    <div class="ww-find-row" style="margin-top:10px;">
                        <label class="ww-input-label" style="min-width:80px;">🔄 替换：</label>
                        <input type="text" id="ttw-replace-input" class="ww-input" placeholder="输入替换为的内容..." style="flex:1;">
                    </div>
                    <div class="ww-find-options" style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;">
                        <label class="ww-checkbox">
                            <input type="checkbox" id="ttw-find-case-sensitive">
                            <span class="ww-checkbox-label">区分大小写</span>
                        </label>
                        <label class="ww-checkbox">
                            <input type="checkbox" id="ttw-find-regex">
                            <span class="ww-checkbox-label">正则表达式</span>
                        </label>
                        <label class="ww-checkbox">
                            <input type="checkbox" id="ttw-find-whole-word">
                            <span class="ww-checkbox-label">全字匹配</span>
                        </label>
                    </div>
                    <div class="ww-find-actions" style="margin-top:15px;display:flex;gap:10px;">
                        <button id="ttw-find-btn" class="ww-btn ww-btn-primary">🔍 查找</button>
                        <button id="ttw-replace-btn" class="ww-btn ww-btn-warning" disabled>🔄 替换选中</button>
                        <button id="ttw-replace-all-btn" class="ww-btn ww-btn-danger" disabled>🔄 替换全部</button>
                    </div>
                </div>
                
                <!-- 结果区域 -->
                <div class="ww-find-results-section">
                    <div class="ww-find-results-header">
                        <span class="ww-find-results-title">📊 查找结果 (<span id="ttw-find-count">0</span> 处匹配)</span>
                        <div class="ww-find-results-actions">
                            <button id="ttw-find-clear" class="ww-btn ww-btn-secondary ww-btn-small">清空</button>
                        </div>
                    </div>
                    <div id="ttw-find-results" class="ww-find-results">
                        <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                            请输入查找内容并点击"查找"按钮
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
            title: '🔍 查找替换',
            width: '800px',
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

        // 查找按钮
        this.element.querySelector('#ttw-find-btn')?.addEventListener('click', () => {
            this.doFind();
        });

        // 替换按钮
        this.element.querySelector('#ttw-replace-btn')?.addEventListener('click', () => {
            this.doReplace();
        });

        // 替换全部按钮
        this.element.querySelector('#ttw-replace-all-btn')?.addEventListener('click', () => {
            this.doReplaceAll();
        });

        // 清空按钮
        this.element.querySelector('#ttw-find-clear')?.addEventListener('click', () => {
            this.clearResults();
        });

        // 回车查找
        this.element.querySelector('#ttw-find-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.doFind();
            }
        });
    }

    /**
     * 执行查找
     */
    doFind() {
        const findInput = this.element?.querySelector('#ttw-find-input');
        const searchTerm = findInput?.value?.trim();
        
        if (!searchTerm) {
            alert('请输入查找内容');
            return;
        }

        const options = {
            caseSensitive: this.element?.querySelector('#ttw-find-case-sensitive')?.checked || false,
            useRegex: this.element?.querySelector('#ttw-find-regex')?.checked || false,
            wholeWord: this.element?.querySelector('#ttw-find-whole-word')?.checked || false
        };

        this.findResults = this.searchInWorldbook(searchTerm, options);
        this.displayResults();
        
        // 更新按钮状态
        const hasResults = this.findResults.length > 0;
        this.element.querySelector('#ttw-replace-btn').disabled = !hasResults;
        this.element.querySelector('#ttw-replace-all-btn').disabled = !hasResults;
        
        // 通知回调
        this.config.onFind?.(this.findResults);
    }

    /**
     * 在世界书中搜索
     */
    searchInWorldbook(searchTerm, options = {}) {
        const results = [];
        const { caseSensitive, useRegex, wholeWord } = options;
        
        let pattern;
        if (useRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                pattern = new RegExp(searchTerm, flags);
            } catch (e) {
                alert('正则表达式无效：' + e.message);
                return [];
            }
        } else {
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = caseSensitive ? 'g' : 'gi';
            pattern = wholeWord 
                ? new RegExp(`\\b${escaped}\\b`, flags)
                : new RegExp(escaped, flags);
        }
        
        for (const [category, entries] of Object.entries(this.config.worldbook)) {
            if (typeof entries !== 'object') continue;
            
            for (const [entryName, entry] of Object.entries(entries)) {
                const keywords = (entry['关键词'] || []).join(', ');
                const content = entry['内容'] || '';
                
                // 搜索关键词
                const keywordMatches = this.findMatches(keywords, pattern, searchTerm);
                
                // 搜索内容
                const contentMatches = this.findMatches(content, pattern, searchTerm);
                
                if (keywordMatches.length > 0 || contentMatches.length > 0) {
                    results.push({
                        category,
                        entryName,
                        keywordMatches,
                        contentMatches,
                        totalMatches: keywordMatches.length + contentMatches.length
                    });
                }
            }
        }
        
        return results;
    }

    /**
     * 查找匹配
     */
    findMatches(text, pattern, searchTerm) {
        const matches = [];
        const matchIter = text.matchAll(pattern);
        
        for (const match of matchIter) {
            const start = Math.max(0, match.index - 20);
            const end = Math.min(text.length, match.index + match[0].length + 20);
            const context = text.substring(start, end);
            
            matches.push({
                match: match[0],
                index: match.index,
                context: (start > 0 ? '...' : '') + context + (end < text.length ? '...' : '')
            });
        }
        
        return matches;
    }

    /**
     * 显示结果
     */
    displayResults() {
        const resultsEl = this.element?.querySelector('#ttw-find-results');
        const countEl = this.element?.querySelector('#ttw-find-count');
        
        if (!resultsEl) return;
        
        countEl.textContent = this.findResults.reduce((sum, r) => sum + r.totalMatches, 0);
        
        if (this.findResults.length === 0) {
            resultsEl.innerHTML = `
                <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                    未找到匹配的内容
                </div>
            `;
            return;
        }
        
        resultsEl.innerHTML = this.findResults.map(result => `
            <div class="ww-find-result-item">
                <div class="ww-result-header">
                    <span class="ww-result-category">📁 ${result.category}</span>
                    <span class="ww-result-entry">📄 ${result.entryName}</span>
                    <span class="ww-result-count">${result.totalMatches} 处匹配</span>
                </div>
                ${result.keywordMatches.length > 0 ? `
                    <div class="ww-result-matches">
                        <div class="ww-match-label">🔑 关键词：</div>
                        ${result.keywordMatches.map(m => `
                            <div class="ww-match-context">${this.highlightMatch(m.context, m.match)}</div>
                        `).join('')}
                    </div>
                ` : ''}
                ${result.contentMatches.length > 0 ? `
                    <div class="ww-result-matches">
                        <div class="ww-match-label">📝 内容：</div>
                        ${result.contentMatches.slice(0, 5).map(m => `
                            <div class="ww-match-context">${this.highlightMatch(m.context, m.match)}</div>
                        `).join('')}
                        ${result.contentMatches.length > 5 ? `<div style="color:var(--ww-text-muted);font-size:11px;">还有 ${result.contentMatches.length - 5} 处匹配...</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * 高亮匹配
     */
    highlightMatch(context, match) {
        const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        return context.replace(regex, '<span style="background:#f1c40f;color:#000;padding:1px 4px;border-radius:2px;">$&</span>');
    }

    /**
     * 执行替换
     */
    doReplace() {
        const replaceInput = this.element?.querySelector('#ttw-replace-input');
        const replaceTerm = replaceInput?.value || '';
        
        if (this.findResults.length === 0) {
            alert('没有可替换的内容');
            return;
        }
        
        // 通知回调，由调用者执行实际替换
        this.config.onReplace?.({
            results: this.findResults,
            replaceTerm,
            mode: 'selected'
        });
    }

    /**
     * 替换全部
     */
    doReplaceAll() {
        const replaceInput = this.element?.querySelector('#ttw-replace-input');
        const replaceTerm = replaceInput?.value || '';
        
        if (this.findResults.length === 0) {
            alert('没有可替换的内容');
            return;
        }
        
        if (!confirm(`确定要替换所有 ${this.findResults.reduce((sum, r) => sum + r.totalMatches, 0)} 处匹配吗？\n\n此操作不可撤销。`)) {
            return;
        }
        
        // 通知回调
        this.config.onReplace?.({
            results: this.findResults,
            replaceTerm,
            mode: 'all'
        });
    }

    /**
     * 清空结果
     */
    clearResults() {
        this.findResults = [];
        this.displayResults();
        this.element.querySelector('#ttw-replace-btn').disabled = true;
        this.element.querySelector('#ttw-replace-all-btn').disabled = true;
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
        this.findResults = [];
        this.config = null;
    }

    /**
     * 打开面板
     */
    open() {
        this.createModal();
    }
}

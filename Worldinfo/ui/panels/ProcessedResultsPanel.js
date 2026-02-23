/**
 * 已处理结果查看面板
 * 左右分栏查看所有已处理章节的结果
 */
import { Modal } from '../components/Modal.js';

export class ProcessedResultsPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onViewEntry = options.onViewEntry || (() => {});
        this.modal = null;
        this.processedResults = [];
    }

    /**
     * 打开面板
     * @param {Array} memoryQueue - 记忆队列
     */
    open(memoryQueue = []) {
        this.processedResults = memoryQueue
            .filter(m => m.processed && !m.failed && m.result)
            .map((m, i) => ({ ...m, originalIndex: i }));

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
        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * 销毁面板，清理所有资源
     */
    destroy() {
        this.close();
        this.processedResults = [];
        this.onClose = null;
        this.onViewEntry = null;
    }

    /**
     * 创建内容 HTML
     */
    createContent() {
        const totalCount = this.processedResults.length;
        const totalEntries = this.processedResults.reduce((sum, m) => {
            if (!m.result) return sum;
            return sum + Object.keys(m.result).reduce((catSum, cat) => {
                return catSum + (typeof m.result[cat] === 'object' ? Object.keys(m.result[cat]).length : 0);
            }, 0);
        }, 0);

        return `
            <div class="ww-processed-results-content">
                <!-- 统计信息 -->
                <div style="
                    display:grid;
                    grid-template-columns:repeat(3,1fr);
                    gap:12px;
                    margin-bottom:16px;
                ">
                    <div style="
                        padding:12px;
                        background:rgba(39,174,96,0.15);
                        border-radius:8px;
                        text-align:center;
                    ">
                        <div style="font-size:20px;font-weight:bold;color:#27ae60;">${totalCount}</div>
                        <div style="font-size:12px;color:#888;margin-top:4px;">已处理章节</div>
                    </div>
                    <div style="
                        padding:12px;
                        background:rgba(52,152,219,0.15);
                        border-radius:8px;
                        text-align:center;
                    ">
                        <div style="font-size:20px;font-weight:bold;color:#3498db;">${totalEntries}</div>
                        <div style="font-size:12px;color:#888;margin-top:4px;">生成条目数</div>
                    </div>
                    <div style="
                        padding:12px;
                        background:rgba(155,89,182,0.15);
                        border-radius:8px;
                        text-align:center;
                    ">
                        <div style="font-size:20px;font-weight:bold;color:#9b59b6;">${totalCount > 0 ? Math.round(totalEntries / totalCount) : 0}</div>
                        <div style="font-size:12px;color:#888;margin-top:4px;">平均每章条目</div>
                    </div>
                </div>

                <!-- 左右分栏 -->
                <div style="
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:16px;
                    height:500px;
                ">
                    <!-- 左侧：章节列表 -->
                    <div style="
                        display:flex;
                        flex-direction:column;
                        overflow:hidden;
                    ">
                        <div style="
                            padding:8px;
                            background:rgba(0,0,0,0.2);
                            border-radius:6px 6px 0 0;
                            font-weight:bold;
                            color:#3498db;
                        ">📚 章节列表</div>
                        <div id="ww-processed-chapter-list" style="
                            flex:1;
                            overflow-y:auto;
                            background:rgba(0,0,0,0.1);
                            border:1px solid #444;
                            border-top:none;
                            border-radius:0 0 6px 6px;
                            padding:8px;
                        "></div>
                    </div>

                    <!-- 右侧：结果预览 -->
                    <div style="
                        display:flex;
                        flex-direction:column;
                        overflow:hidden;
                    ">
                        <div style="
                            padding:8px;
                            background:rgba(0,0,0,0.2);
                            border-radius:6px 6px 0 0;
                            font-weight:bold;
                            color:#27ae60;
                        ">📊 结果预览</div>
                        <div id="ww-processed-result-preview" style="
                            flex:1;
                            overflow-y:auto;
                            background:rgba(0,0,0,0.1);
                            border:1px solid #444;
                            border-top:none;
                            border-radius:0 0 6px 6px;
                            padding:8px;
                        ">
                            <div style="text-align:center;color:#888;padding:40px;">
                                请选择一个章节查看详情
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
            title: '📊 已处理结果',
            width: '900px',
            maxWidth: '95%',
            closable: true,
            maskClosable: true,
            buttons: [
                { text: '关闭', type: 'secondary', action: 'close' }
            ],
            onButtonClick: (action) => {
                if (action === 'close') this.close();
            },
            onClose: () => this.onClose()
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.modal?.element) return;

        this.renderChapterList();
    }

    /**
     * 渲染章节列表
     */
    renderChapterList() {
        const listEl = this.modal?.element?.querySelector('#ww-processed-chapter-list');
        if (!listEl) return;

        if (this.processedResults.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">没有已处理的章节</div>';
            return;
        }

        listEl.innerHTML = this.processedResults.map((result, index) => {
            const entryCount = result.result ? Object.keys(result.result).reduce((sum, cat) => {
                return sum + (typeof result.result[cat] === 'object' ? Object.keys(result.result[cat]).length : 0);
            }, 0) : 0;

            return `
                <div class="ww-processed-chapter-item" data-index="${index}" style="
                    padding:10px;
                    margin:4px 0;
                    background:rgba(255,255,255,0.05);
                    border-radius:6px;
                    cursor:pointer;
                    border-left:3px solid #27ae60;
                    transition:all 0.2s;
                ">
                    <div style="font-size:12px;font-weight:bold;color:#fff;margin-bottom:4px;">
                        ✅ ${result.title || `第${result.originalIndex + 1}章`}
                    </div>
                    <div style="font-size:10px;color:#888;">
                        ${entryCount} 个条目 | ${result.content.length.toLocaleString()} 字
                    </div>
                </div>
            `;
        }).join('');

        // 绑定点击事件
        listEl.querySelectorAll('.ww-processed-chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.showResultPreview(index);

                // 更新选中状态
                listEl.querySelectorAll('.ww-processed-chapter-item').forEach(i => {
                    i.style.background = 'rgba(255,255,255,0.05)';
                });
                item.style.background = 'rgba(39,174,96,0.2)';
            });
        });
    }

    /**
     * 显示结果预览
     */
    showResultPreview(index) {
        const previewEl = this.modal?.element?.querySelector('#ww-processed-result-preview');
        const result = this.processedResults[index];

        if (!previewEl || !result?.result) return;

        let html = '';

        for (const [category, entries] of Object.entries(result.result)) {
            if (typeof entries !== 'object') continue;

            html += `
                <div style="margin-bottom:16px;">
                    <div style="
                        padding:8px;
                        background:rgba(155,89,182,0.2);
                        border-radius:6px;
                        font-weight:bold;
                        color:#9b59b6;
                        margin-bottom:8px;
                    ">📁 ${category}</div>
            `;

            for (const [entryName, entryData] of Object.entries(entries)) {
                const keywords = entryData?.关键词 || entryData?.keywords || [];
                const content = entryData?.内容 || entryData?.content || '';

                html += `
                    <div style="
                        padding:10px;
                        margin:6px 0;
                        background:rgba(0,0,0,0.2);
                        border-radius:6px;
                    ">
                        <div style="font-size:12px;font-weight:bold;color:#fff;margin-bottom:6px;">
                            📝 ${entryName}
                        </div>
                        ${keywords.length > 0 ? `
                            <div style="font-size:10px;color:#888;margin-bottom:6px;">
                                🔑 关键词：${keywords.join(', ')}
                            </div>
                        ` : ''}
                        <div style="font-size:11px;color:#ccc;white-space:pre-wrap;max-height:150px;overflow-y:auto;">
                            ${content || '(无内容)'}
                        </div>
                    </div>
                `;
            }

            html += '</div>';
        }

        previewEl.innerHTML = html || '<div style="text-align:center;color:#888;padding:20px;">无结果数据</div>';
    }
}

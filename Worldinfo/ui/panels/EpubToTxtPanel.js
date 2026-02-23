/**
 * EPUB 转 TXT 面板
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { EpubParser } from '../../parsers/EpubParser.js';
import { downloadFile } from '../../utils/file.js';
import { naturalSortCompare } from '../../utils/sort.js';

export class EpubToTxtPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onConvert = options.onConvert || (() => {});
        this.modal = null;
        this.parser = new EpubParser();
        this.files = []; // {id, fileName, title, content}
        this.isProcessing = false;
    }

    /**
     * 打开面板
     */
    open() {
        this.createModal();
        this.modal.open();
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
        this.onClose = null;
    }

    /**
     * 创建弹窗 HTML
     */
    createHTML() {
        return `
            <div id="epub-to-txt-panel" class="ww-epub-panel">
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <input type="file" id="epub-file-input" accept=".epub" multiple style="display: none;">
                    <button id="epub-select-btn" class="ww-btn ww-btn-primary" style="width:100%;">
                        📁 选择 EPUB 文件（可多选）
                    </button>

                    <div id="epub-file-list" class="ww-epub-file-list" style="
                        min-height:80px;
                        max-height:350px;
                        overflow-y:auto;
                        border:1px dashed #666;
                        border-radius:8px;
                        padding:8px;
                    ">
                        <div style="text-align:center;color:#888;padding:25px 10px;font-size:14px;">
                            请选择 EPUB 文件<br>
                            <small>用↑↓按钮调整顺序</small>
                        </div>
                    </div>

                    <!-- 排序按钮组 -->
                    <div id="epub-sort-btns" style="display:flex;gap:8px;">
                        <button id="epub-sort-name-asc" class="ww-btn ww-btn-secondary" style="flex:1;">
                            🔤 名称升序
                        </button>
                        <button id="epub-sort-name-desc" class="ww-btn ww-btn-secondary" style="flex:1;">
                            🔤 名称降序
                        </button>
                    </div>

                    <div id="epub-progress" style="display:none;text-align:center;padding:10px;background:rgba(155,89,182,0.2);border-radius:8px;">
                        <span id="epub-progress-text">⏳ 正在处理...</span>
                    </div>

                    <!-- 操作按钮组 -->
                    <div style="display:flex;gap:10px;">
                        <button id="epub-clear-btn" class="ww-btn ww-btn-danger" style="flex:1;">
                            🗑️ 清空
                        </button>
                        <button id="epub-convert-btn" class="ww-btn ww-btn-success" style="flex:2;">
                            ✨ 生成 TXT
                        </button>
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
            title: '📖 EPUB 批量转 TXT',
            width: '600px',
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
        this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.modal?.element) return;

        const el = this.modal.element;

        // 选择文件
        el.querySelector('#epub-select-btn')?.addEventListener('click', () => {
            el.querySelector('#epub-file-input')?.click();
        });

        el.querySelector('#epub-file-input')?.addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // 清空
        el.querySelector('#epub-clear-btn')?.addEventListener('click', () => {
            this.clearFiles();
        });

        // 转换
        el.querySelector('#epub-convert-btn')?.addEventListener('click', () => {
            this.convertAll();
        });

        // 排序
        el.querySelector('#epub-sort-name-asc')?.addEventListener('click', () => {
            this.sortByName('asc');
        });

        el.querySelector('#epub-sort-name-desc')?.addEventListener('click', () => {
            this.sortByName('desc');
        });
    }

    /**
     * 处理文件选择
     */
    async handleFileSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        const progressEl = this.modal?.element?.querySelector('#epub-progress');
        const progressText = this.modal?.element?.querySelector('#epub-progress-text');

        if (progressEl) progressEl.style.display = 'block';

        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (progressText) progressText.textContent = `⏳ 正在解析 ${i + 1}/${files.length}...`;

            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await this.parser.parse(arrayBuffer);

                this.files.push({
                    id: Date.now() + Math.random(),
                    fileName: file.name,
                    title: result.title || file.name.replace(/\.epub$/i, ''),
                    content: result.content
                });
                successCount++;
            } catch (e) {
                console.error('[EPUB 转 TXT] 解析失败:', file.name, e);
                alert(`解析失败：${file.name}`);
            }
        }

        if (progressEl) progressEl.style.display = 'none';
        event.target.value = '';
        this.renderFileList();

        if (successCount > 0) {
            alert(`已添加 ${successCount} 个文件`);
        }
    }

    /**
     * 渲染文件列表
     */
    renderFileList() {
        const listEl = this.modal?.element?.querySelector('#epub-file-list');
        if (!listEl) return;

        if (this.files.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center;color:#888;padding:25px 10px;font-size:14px;">
                    请选择 EPUB 文件<br>
                    <small>用↑↓按钮调整顺序</small>
                </div>
            `;
            return;
        }

        let html = '';
        this.files.forEach((file, index) => {
            html += `
                <div class="epub-file-item" data-id="${file.id}" style="
                    display:flex;
                    align-items:center;
                    padding:8px;
                    margin:4px 0;
                    background:rgba(255,255,255,0.1);
                    border-radius:6px;
                    gap:6px;
                ">
                    <span class="file-index" style="
                        min-width:22px;
                        height:22px;
                        background:#9b59b6;
                        border-radius:50%;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-size:11px;
                    ">${index + 1}</span>
                    <span class="file-name" title="${file.fileName}" style="
                        flex:1;
                        overflow:hidden;
                        text-overflow:ellipsis;
                        white-space:nowrap;
                        font-size:13px;
                        min-width:0;
                    ">${file.title || file.fileName}</span>
                    <div class="move-btns" style="
                        display:flex;
                        flex-direction:column;
                        gap:2px;
                        flex-shrink:0;
                    ">
                        <button class="move-btn move-up" data-id="${file.id}" ${index === 0 ? 'disabled style="opacity:0.3"' : ''} style="
                            background:#555;
                            border:none;
                            color:#fff;
                            width:26px;
                            height:20px;
                            border-radius:3px;
                            cursor:pointer;
                            font-size:10px;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                        ">▲</button>
                        <button class="move-btn move-down" data-id="${file.id}" ${index === this.files.length - 1 ? 'disabled style="opacity:0.3"' : ''} style="
                            background:#555;
                            border:none;
                            color:#fff;
                            width:26px;
                            height:20px;
                            border-radius:3px;
                            cursor:pointer;
                            font-size:10px;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                        ">▼</button>
                    </div>
                    <button class="remove-btn" data-id="${file.id}" style="
                        background:transparent;
                        border:none;
                        color:#e74c3c;
                        cursor:pointer;
                        padding:5px 8px;
                        font-size:16px;
                        flex-shrink:0;
                    ">✕</button>
                </div>
            `;
        });

        listEl.innerHTML = html;

        // 绑定删除按钮
        listEl.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseFloat(btn.dataset.id);
                this.files = this.files.filter(f => f.id !== id);
                this.renderFileList();
            });
        });

        // 绑定上移按钮
        listEl.querySelectorAll('.move-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseFloat(btn.dataset.id);
                this.moveFile(id, -1);
            });
        });

        // 绑定下移按钮
        listEl.querySelectorAll('.move-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseFloat(btn.dataset.id);
                this.moveFile(id, 1);
            });
        });
    }

    /**
     * 移动文件位置
     */
    moveFile(id, direction) {
        const index = this.files.findIndex(f => f.id === id);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.files.length) return;

        // 交换位置
        const temp = this.files[index];
        this.files[index] = this.files[newIndex];
        this.files[newIndex] = temp;

        this.renderFileList();
    }

    /**
     * 按名称排序
     */
    sortByName(order = 'asc') {
        if (this.files.length < 2) {
            alert('至少需要 2 个文件才能排序');
            return;
        }

        this.files.sort((a, b) => {
            const nameA = (a.title || a.fileName).toLowerCase();
            const nameB = (b.title || b.fileName).toLowerCase();
            return naturalSortCompare(nameA, nameB) * (order === 'asc' ? 1 : -1);
        });

        this.renderFileList();
        alert(order === 'asc' ? '已按名称升序排列' : '已按名称降序排列');
    }

    /**
     * 清空文件
     */
    clearFiles() {
        this.files = [];
        this.renderFileList();
    }

    /**
     * 合并转换
     */
    convertAll() {
        if (this.files.length === 0) {
            alert('请先选择 EPUB 文件');
            return;
        }

        // 每个文件内容开头加上文件名标题
        const allContent = this.files.map((f, index) => {
            const title = f.title || f.fileName.replace(/\.epub$/i, '');
            const separator = '═'.repeat(40);
            const header = `${separator}\n【${index + 1}】${title}\n${separator}\n`;
            return header + f.content.trim().replace(/\n{2,}/g, '\n');
        }).join('');

        // 文件名
        const firstName = this.files[0].fileName.replace(/\.epub$/i, '');
        const fileName = this.files.length === 1
            ? `${firstName}.txt`
            : `${firstName}_合并${this.files.length}本.txt`;

        downloadFile(allContent, fileName, 'text/plain');
        alert(`已生成：${fileName}`);

        // 通知回调
        this.onConvert(this.files);
    }
}

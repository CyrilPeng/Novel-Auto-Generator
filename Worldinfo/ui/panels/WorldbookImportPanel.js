/**
 * 世界书导入面板
 * 支持导入并合并 SillyTavern 格式的世界书
 */
import { Modal } from '../components/Modal.js';
import { showSuccess, showError, showInfo } from '../components/Toast.js';

export class WorldbookImportPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onImport = options.onImport || (() => {});
        this.modal = null;
        this.importedData = null;
        this.fileName = '';
    }

    /**
     * 打开面板
     */
    open() {
        this.createModal();
        this.modal.open(this.createContent());
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
        this.importedData = null;
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
     * 创建内容 HTML
     */
    createContent() {
        return `
            <div class="ww-import-content">
                <!-- 文件选择区域 -->
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:8px;font-size:13px;">选择世界书文件：</label>
                    <input type="file" id="ww-import-file" accept=".json" style="
                        width:100%;
                        padding:10px;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        color:#fff;
                    ">
                    <small style="color:#888;display:block;margin-top:6px;">支持 SillyTavern 格式 (.json)</small>
                </div>

                <!-- 文件信息 -->
                <div id="ww-import-file-info" style="display:none;margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:6px;">
                    <div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📄 文件信息</div>
                    <div style="font-size:12px;color:#ccc;">
                        <div>文件名：<span id="ww-import-filename"></span></div>
                        <div>条目数：<span id="ww-import-count"></span></div>
                    </div>
                </div>

                <!-- 重复处理选项 -->
                <div id="ww-import-options" style="display:none;margin-bottom:16px;">
                    <label style="display:block;margin-bottom:8px;font-size:13px;">重复条目处理：</label>
                    <select id="ww-import-duplicate-mode" style="
                        width:100%;
                        padding:10px;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        color:#fff;
                        font-size:13px;
                    ">
                        <option value="merge">🤖 AI 智能合并（推荐）</option>
                        <option value="overwrite">📝 覆盖现有条目</option>
                        <option value="keep">✅ 保留现有条目</option>
                        <option value="rename">🏷️ 重命名导入条目</option>
                        <option value="append">📎 内容追加到现有条目</option>
                    </select>
                </div>

                <!-- 预览区域 -->
                <div id="ww-import-preview" style="display:none;margin-bottom:16px;">
                    <label style="display:block;margin-bottom:8px;font-size:13px;">导入预览：</label>
                    <div style="
                        max-height:200px;
                        overflow-y:auto;
                        background:rgba(0,0,0,0.2);
                        border:1px solid #444;
                        border-radius:6px;
                        padding:8px;
                        font-size:12px;
                    " id="ww-import-preview-list"></div>
                </div>

                <!-- 进度条 -->
                <div id="ww-import-progress" style="display:none;margin-bottom:16px;">
                    <div style="margin-bottom:8px;font-size:12px;color:#ccc;">正在导入...</div>
                    <div style="
                        width:100%;
                        height:6px;
                        background:rgba(255,255,255,0.1);
                        border-radius:3px;
                        overflow:hidden;
                    ">
                        <div id="ww-import-progress-bar" style="
                            height:100%;
                            width:0%;
                            background:linear-gradient(90deg,#27ae60,#2ecc71);
                            transition:width 0.3s ease;
                        "></div>
                    </div>
                    <div id="ww-import-progress-text" style="
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
            title: '📥 导入世界书',
            width: '600px',
            maxWidth: '95%',
            closable: true,
            maskClosable: true,
            buttons: [
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '📥 导入', type: 'primary', action: 'import', disabled: true }
            ],
            onButtonClick: (action, event, modalInstance) => {
                if (action === 'cancel') {
                    this.close();
                } else if (action === 'import') {
                    this.doImport();
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

        // 文件选择
        const fileInput = el.querySelector('#ww-import-file');
        fileInput?.addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // 更新按钮状态
        this.updateButtonState = (disabled) => {
            const importBtn = el.querySelector('[data-action="import"]');
            if (importBtn) {
                importBtn.disabled = disabled;
                importBtn.style.opacity = disabled ? '0.5' : '1';
            }
        };
    }

    /**
     * 处理文件选择
     */
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const content = await file.text();
            const data = JSON.parse(content);

            // 验证格式
            if (!data.entries || typeof data.entries !== 'object') {
                throw new Error('无效的世界书格式：缺少 entries 字段');
            }

            this.importedData = data;
            this.fileName = file.name;

            // 显示文件信息
            const entryCount = Object.keys(data.entries).length;
            document.getElementById('ww-import-file-info').style.display = 'block';
            document.getElementById('ww-import-filename').textContent = file.name;
            document.getElementById('ww-import-count').textContent = entryCount;

            // 显示选项
            document.getElementById('ww-import-options').style.display = 'block';

            // 显示预览
            this.showPreview(data);

            // 启用导入按钮
            if (this.updateButtonState) {
                this.updateButtonState(false);
            }

        } catch (error) {
            showError('文件解析失败：' + error.message);
            this.importedData = null;
            if (this.updateButtonState) {
                this.updateButtonState(true);
            }
        }
    }

    /**
     * 显示预览
     */
    showPreview(data) {
        const previewEl = document.getElementById('ww-import-preview');
        const previewList = document.getElementById('ww-import-preview-list');

        if (!previewEl || !previewList) return;

        previewEl.style.display = 'block';

        const entries = Object.values(data.entries);
        const categories = {};

        // 按分类统计
        for (const entry of entries) {
            const cat = entry.group || '未分类';
            if (!categories[cat]) categories[cat] = 0;
            categories[cat]++;
        }

        // 生成预览 HTML
        previewList.innerHTML = Object.entries(categories)
            .map(([cat, count]) => `
                <div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;">
                    <span>${cat}</span>
                    <span style="color:#888;">${count} 条</span>
                </div>
            `).join('');
    }

    /**
     * 执行导入
     */
    async doImport() {
        if (!this.importedData) {
            showError('请先选择文件');
            return;
        }

        const duplicateMode = document.getElementById('ww-import-duplicate-mode')?.value || 'merge';
        const progressEl = document.getElementById('ww-import-progress');
        const progressBar = document.getElementById('ww-import-progress-bar');
        const progressText = document.getElementById('ww-import-progress-text');

        if (progressEl) progressEl.style.display = 'block';

        try {
            const entries = Object.values(this.importedData.entries);
            const total = entries.length;
            let imported = 0;

            // 通知回调执行导入
            await this.onImport({
                data: this.importedData,
                duplicateMode,
                onProgress: (count) => {
                    imported = count;
                    const pct = Math.round((count / total) * 100);
                    if (progressBar) progressBar.style.width = pct + '%';
                    if (progressText) progressText.textContent = `已导入 ${count}/${total} (${pct}%)`;
                }
            });

            showSuccess(`成功导入 ${imported} 个条目`);
            this.close();

        } catch (error) {
            showError('导入失败：' + error.message);
            if (progressEl) progressEl.style.display = 'none';
        }
    }
}

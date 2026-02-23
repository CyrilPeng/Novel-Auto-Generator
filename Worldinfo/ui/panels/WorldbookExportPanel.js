/**
 * 世界书导出面板
 */
import { Modal } from '../components/Modal.js';
import { Button } from '../components/Button.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { TavernExporter } from '../../exporters/TavernExporter.js';
import { showSuccess, showError, showInfo } from '../components/Toast.js';

export class WorldbookExportPanel {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onExport = options.onExport || (() => {});
        this.modal = null;
        this.exporter = new TavernExporter();
        this.books = new Map(); // 加载的世界书
        this.selectedBooks = new Set();
        this.isLoading = false;
        this.element = null;
    }

    /**
     * 打开面板
     */
    open() {
        this.createModal();
        this.modal.open();
        this.startScan();
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
        this.onClose = null;
    }

    /**
     * 创建弹窗 HTML
     */
    createHTML() {
        return `
            <div id="worldbook-export-panel" class="ww-wbexport-panel">
                <!-- 进度区 -->
                <div id="wbe-progress" style="display:none;text-align:center;padding:10px;background:rgba(26,188,156,0.15);border-radius:8px;margin-bottom:12px;">
                    <div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-bottom:8px;">
                        <div id="wbe-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#1abc9c,#2ecc71);border-radius:3px;transition:width 0.25s ease;"></div>
                    </div>
                    <span id="wbe-progress-text" style="font-size:13px;">⏳ 正在扫描...</span>
                </div>

                <!-- 调试信息 -->
                <details id="wbe-debug-area" style="display:none;font-size:11px;opacity:0.6;margin-bottom:12px;">
                    <summary style="cursor:pointer;">🔍 调试信息（点击展开）</summary>
                    <pre id="wbe-debug-log" style="max-height:120px;overflow-y:auto;background:rgba(0,0,0,0.3);padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-all;margin-top:4px;font-size:10px;"></pre>
                </details>

                <!-- 世界书列表 -->
                <div id="wbe-book-list" class="ww-wbexport-book-list" style="
                    min-height:80px;
                    max-height:350px;
                    overflow-y:auto;
                    border:1px dashed #666;
                    border-radius:8px;
                    padding:8px;
                    margin-bottom:12px;
                ">
                    <div style="text-align:center;color:#888;padding:25px 10px;font-size:14px;">
                        ⏳ 正在扫描已启用的世界书...
                    </div>
                </div>

                <!-- 全选按钮 -->
                <div style="display:flex;gap:10px;margin-bottom:12px;">
                    <button id="wbe-sel-all-btn" class="ww-btn ww-btn-secondary" style="flex:1;">
                        ☑ 全选
                    </button>
                    <button id="wbe-sel-none-btn" class="ww-btn ww-btn-secondary" style="flex:1;">
                        ☐ 全不选
                    </button>
                </div>

                <!-- 导出按钮 -->
                <div style="display:flex;gap:10px;">
                    <button id="wbe-export-sep-btn" class="ww-btn ww-btn-success" style="flex:1;">
                        📥 分别导出
                    </button>
                    <button id="wbe-export-merge-btn" class="ww-btn ww-btn-primary" style="flex:1;">
                        📦 合并导出
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        this.modal = new Modal({
            title: '📤 导出已启用世界书',
            width: '700px',
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

        // 全选
        this.element.querySelector('#wbe-sel-all-btn')?.addEventListener('click', () => {
            this.toggleAll(true);
        });

        // 全不选
        this.element.querySelector('#wbe-sel-none-btn')?.addEventListener('click', () => {
            this.toggleAll(false);
        });

        // 分别导出
        this.element.querySelector('#wbe-export-sep-btn')?.addEventListener('click', () => {
            this.doExportSep();
        });

        // 合并导出
        this.element.querySelector('#wbe-export-merge-btn')?.addEventListener('click', () => {
            this.doExportMerge();
        });
    }

    /**
     * 显示进度
     */
    showProgress(pct, text) {
        const progressEl = this.element?.querySelector('#wbe-progress');
        const barEl = this.element?.querySelector('#wbe-progress-bar');
        const textEl = this.element?.querySelector('#wbe-progress-text');

        if (progressEl) progressEl.style.display = 'block';
        if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        if (textEl) textEl.textContent = text || '';
    }

    /**
     * 隐藏进度
     */
    hideProgress() {
        const progressEl = this.element?.querySelector('#wbe-progress');
        if (progressEl) progressEl.style.display = 'none';
    }

    /**
     * 添加调试日志
     */
    debugLog(msg) {
        console.log('[WBExport] ' + msg);
        
        const debugArea = this.element?.querySelector('#wbe-debug-area');
        const debugLog = this.element?.querySelector('#wbe-debug-log');
        
        if (debugArea) debugArea.style.display = 'block';
        if (debugLog) debugLog.textContent += msg + '\n';
    }

    /**
     * 开始扫描
     */
    async startScan() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.books.clear();
        this.selectedBooks.clear();

        const listEl = this.element?.querySelector('#wbe-book-list');
        
        this.showProgress(5, '🔍 正在获取已启用的世界书名称...');
        await this.sleep(50);

        // 获取已启用的世界书名称
        let names = this.getActiveWorldBookNames();
        this.debugLog('已启用世界书名称：[' + names.join(', ') + ']');

        if (names.length === 0) {
            this.showProgress(10, '⚠️ 未检测到已启用世界书，获取全部列表...');
            this.debugLog('未检测到已启用世界书，尝试获取全部...');
            names = await this.getAllWorldBookNames();
            this.debugLog('全部世界书：[' + names.join(', ') + ']');
            if (names.length > 0) {
                showInfo(`未检测到已启用世界书，已列出全部 ${names.length} 个`);
            }
        }

        if (names.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center;color:#888;padding:25px 10px;font-size:14px;">
                    😕 未找到任何世界书<br>
                    <small>请确保 SillyTavern 中有世界书且已启用<br>
                    请打开浏览器控制台 (F12) 查看 [WBExport] 日志</small>
                </div>
            `;
            this.showProgress(100, '❌ 未找到世界书');
            setTimeout(() => this.hideProgress(), 2000);
            this.isLoading = false;
            return;
        }

        this.showProgress(15, `📚 找到 ${names.length} 个世界书，开始加载数据...`);
        listEl.innerHTML = '';

        const total = names.length;
        let loaded = 0;
        let failed = 0;

        for (const name of names) {
            const pct = 15 + Math.round((loaded / total) * 80);
            this.showProgress(pct, `📖 加载中 (${loaded + 1}/${total}): ${name}`);
            await this.sleep(30);

            this.debugLog(`正在加载："${name}" ...`);
            const data = await this.loadWorldBookData(name);
            loaded++;

            if (data?.entries && Object.keys(data.entries).length > 0) {
                this.books.set(name, data);
                const arr = Object.values(data.entries);
                const en = arr.filter(e => !e.disable).length;
                this.debugLog(`  ✅ "${name}" 加载成功：${arr.length}条 (${en}启用)`);
                listEl.appendChild(this.makeBookItem(name, arr.length, en, true));
            } else {
                failed++;
                this.debugLog(`  ❌ "${name}" 加载失败或无条目`);
                listEl.appendChild(this.makeBookItem(name, 0, 0, false));
            }
        }

        const ok = this.books.size;
        this.showProgress(100, `✅ 完成！成功 ${ok} 个` + (failed ? ` / 失败 ${failed} 个` : ''));
        setTimeout(() => this.hideProgress(), 1500);

        this.toggleAll(true);
        this.isLoading = false;
    }

    /**
     * 创建世界书列表项
     */
    makeBookItem(name, total, enabled, ok) {
        const item = document.createElement('div');
        item.className = 'wbe-book-item' + (ok ? '' : ' err');
        item.style.cssText = `
            display:flex;
            align-items:center;
            padding:8px;
            margin:4px 0;
            background:rgba(255,255,255,0.1);
            border-radius:6px;
            gap:8px;
            cursor:pointer;
            user-select:none;
            ${!ok ? 'opacity:0.4;cursor:not-allowed;' : ''}
        `;

        const safeName = this.escapeHtml(name);
        let tagsHtml = '';
        if (ok) {
            tagsHtml += `<span class="wbe-bk-tag g" style="font-size:10px;padding:2px 7px;border-radius:10px;white-space:nowrap;background:rgba(46,204,113,0.2);color:#2ecc71;">✅${enabled}启用</span>`;
            if (total - enabled > 0) {
                tagsHtml += `<span class="wbe-bk-tag r" style="font-size:10px;padding:2px 7px;border-radius:10px;white-space:nowrap;background:rgba(231,76,60,0.2);color:#e74c3c;">⏸️${total - enabled}禁用</span>`;
            }
        }

        item.innerHTML = `
            <input type="checkbox" class="wbe-bk-cb" data-name="${safeName}" ${ok ? 'checked' : 'disabled'} 
                   style="width:17px;height:17px;flex-shrink:0;accent-color:#1abc9c;cursor:${ok ? 'pointer' : 'not-allowed'};">
            <span class="wbe-bk-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;min-width:0;">${safeName}</span>
            <div class="wbe-bk-tags" style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                ${tagsHtml}
            </div>
        `;

        // 点击事件
        if (ok) {
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = item.querySelector('.wbe-bk-cb');
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            });
        }

        return item;
    }

    /**
     * 全选/全不选
     */
    toggleAll(checked) {
        this.element?.querySelectorAll('.wbe-book-item').forEach(item => {
            const cb = item.querySelector('.wbe-bk-cb');
            if (cb && !cb.disabled) {
                cb.checked = checked;
            }
        });
    }

    /**
     * 获取选中的名称
     */
    getCheckedNames() {
        const r = [];
        this.element?.querySelectorAll('.wbe-bk-cb:checked').forEach(cb => {
            r.push(cb.dataset.name);
        });
        return r;
    }

    /**
     * 分别导出
     */
    async doExportSep() {
        const names = this.getCheckedNames();
        if (names.length === 0) {
            showError('请选择要导出的世界书');
            return;
        }

        let ok = 0;
        for (let i = 0; i < names.length; i++) {
            const d = this.books.get(names[i]);
            if (!d) continue;

            try {
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `worldbook_${names[i]}_${ts}`;
                this.exporter.download(d, filename + '.json');
                ok++;
                this.showProgress(Math.round((i + 1) / names.length * 100), `📥 已导出 (${i + 1}/${names.length}): ${names[i]}`);
                await this.sleep(100);
            } catch (e) {
                this.debugLog(`导出失败 "${names[i]}": ${e.message}`);
            }
        }

        showSuccess(`已分别导出 ${ok} 个世界书`);
        this.onExport('sep', { count: ok, names });
    }

    /**
     * 合并导出
     */
    async doExportMerge() {
        const names = this.getCheckedNames();
        if (names.length === 0) {
            showError('请选择要导出的世界书');
            return;
        }

        const books = {};
        for (const name of names) {
            const d = this.books.get(name);
            if (d) books[name] = d;
        }

        const { data, count } = this.mergeWorldBooks(books);
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `worldbook_merged_${names.length}in1_${ts}`;

        this.exporter.download(data, filename + '.json');
        showSuccess(`已合并导出 ${count} 个条目`);
        this.onExport('merge', { count, names });
    }

    /**
     * 合并世界书
     */
    mergeWorldBooks(booksMap) {
        const merged = { entries: {} };
        let idx = 0;

        for (const [name, data] of Object.entries(booksMap)) {
            if (!data?.entries) continue;
            for (const entry of Object.values(data.entries)) {
                const e = Object.assign({}, entry);
                e.uid = idx;
                e.displayIndex = idx;
                e.comment = e.comment ? `[${name}] ${e.comment}` : `[${name}] 条目${entry.uid || idx}`;
                merged.entries[String(idx)] = e;
                idx++;
            }
        }

        return { data: merged, count: idx };
    }

    /**
     * 获取已启用的世界书名称
     */
    getActiveWorldBookNames() {
        const names = new Set();

        // 方式 1: getContext().selected_world_info
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                const swi = ctx.selected_world_info;
                if (Array.isArray(swi)) {
                    swi.forEach(n => {
                        if (n != null && String(n).trim()) {
                            names.add(String(n).trim());
                        }
                    });
                }

                // 角色绑定的世界书
                try {
                    const charData = ctx.characters?.[ctx.characterId]?.data;
                    if (charData?.extensions?.world) {
                        const cw = charData.extensions.world;
                        if (typeof cw === 'string' && cw.trim()) names.add(cw.trim());
                        if (Array.isArray(cw)) cw.forEach(n => { if (n?.trim()) names.add(n.trim()); });
                    }
                } catch (e) { /* ignore */ }

                // 方式 4: chat_metadata
                try {
                    const meta = ctx.chat_metadata;
                    if (meta?.world_info_selected) {
                        const sel = meta.world_info_selected;
                        if (Array.isArray(sel)) sel.forEach(n => { if (String(n).trim()) names.add(String(n).trim()); });
                        if (typeof sel === 'string' && sel.trim()) names.add(sel.trim());
                    }
                } catch (e) { /* ignore */ }
            }
        } catch (e) {
            this.debugLog('getContext 方式失败：' + e.message);
        }

        // 方式 2: DOM option 获取
        try {
            const options = document.querySelectorAll('#world_info option:selected');
            options.forEach(opt => {
                const txt = opt.text?.trim();
                if (txt && !['None', 'none', '--- None ---'].includes(txt)) {
                    names.add(txt);
                }
            });
        } catch (e) { /* ignore */ }

        // 方式 3: Tag 标签
        try {
            document.querySelectorAll('#world_info_tag_list .tag, #world_info .tag, .world_entry_tag').forEach(tag => {
                const name = tag.dataset.name || tag.getAttribute('data-name') || '';
                if (name.trim()) {
                    names.add(name.trim());
                }
            });
        } catch (e) { /* ignore */ }

        // 方式 5: 全局变量
        try {
            if (Array.isArray(window.selected_world_info)) {
                window.selected_world_info.forEach(n => { if (String(n).trim()) names.add(String(n).trim()); });
            }
        } catch (e) { /* ignore */ }

        return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    /**
     * 获取全部世界书名称
     */
    async getAllWorldBookNames() {
        const names = new Set();

        // 方式 1: DOM option
        document.querySelectorAll('#world_info option, #world_editor_select option').forEach(opt => {
            const txt = opt.text?.trim();
            if (txt && txt !== 'None' && txt !== 'none' && txt !== '--- None ---') {
                names.add(txt);
            }
        });

        // 方式 2: API
        if (names.size === 0) {
            try {
                const resp = await fetch('/api/worldinfo/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ term: '' })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    (Array.isArray(data) ? data : []).forEach(n => {
                        if (typeof n === 'string' && n.trim()) names.add(n.trim());
                    });
                }
            } catch (e) { /* ignore */ }
        }

        return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    /**
     * 加载世界书数据
     */
    async loadWorldBookData(name) {
        // 方式 1: getContext API
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.loadWorldInfo === 'function') {
                    const data = await ctx.loadWorldInfo(name);
                    if (data?.entries && Object.keys(data.entries).length > 0) {
                        this.debugLog(`✅ getContext 加载 "${name}" 成功，${Object.keys(data.entries).length} 条`);
                        return data;
                    }
                }
            }
        } catch (e) {
            this.debugLog('getContext 加载失败：' + e.message);
        }

        // 方式 2: fetch API
        try {
            const resp = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data?.entries && Object.keys(data.entries).length > 0) {
                    this.debugLog(`✅ fetch 加载 "${name}" 成功，${Object.keys(data.entries).length} 条`);
                    return data;
                }
            }
        } catch (e) {
            this.debugLog('fetch 加载失败：' + e.message);
        }

        // 方式 3: 带.json 后缀
        if (!name.endsWith('.json')) {
            try {
                const resp = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name + '.json' })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data?.entries && Object.keys(data.entries).length > 0) {
                        this.debugLog(`✅ fetch 加载 "${name}.json" 成功`);
                        return data;
                    }
                }
            } catch (e) { /* ignore */ }
        }

        this.debugLog(`❌ 所有方式加载 "${name}" 均失败`);
        return null;
    }

    /**
     * 延迟函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const d = document.createElement('span');
        d.textContent = text;
        return d.innerHTML;
    }
}

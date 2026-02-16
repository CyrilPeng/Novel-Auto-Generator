// ============================================================
// worldbookExport.js - 世界书导出模块
// 功能：一键导出当前已启用的所有世界书
// ============================================================

(function () {
    'use strict';

    let loadedBooks = {};
    let isWorking = false;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function esc(s) { const d = document.createElement('span'); d.textContent = s; return d.innerHTML; }

    // ============================================
    // 获取ST的请求头（含CSRF等）
    // ============================================
    function getRequestHeaders() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.getRequestHeaders === 'function') {
                    return ctx.getRequestHeaders();
                }
            }
        } catch (e) { /* fallback */ }
        return { 'Content-Type': 'application/json' };
    }

    // ============================================
    // 核心：获取当前已启用的世界书名称
    // 多重方式确保拿到正确的文本名称
    // ============================================
    function getActiveWorldBookNames() {
        const names = new Set();

        // ---- 方式1: getContext().selected_world_info ----
        // 这是最权威的来源，返回的应该是世界书文件名数组
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
                    console.log('[WBExport] getContext selected_world_info:', swi);
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
            }
        } catch (e) {
            console.warn('[WBExport] getContext方式失败:', e.message);
        }

        // ---- 方式2: 从DOM option获取 text() 而不是 val() ----
        // val()返回的是数字索引！必须用text()获取真实名称
        try {
            $('#world_info option:selected').each(function () {
                const txt = $(this).text()?.trim();
                if (txt && txt !== 'None' && txt !== 'none' && txt !== '--- None ---') {
                    names.add(txt);
                }
            });
            // 世界书编辑器下拉（选中的那一个）
            const editorVal = $('#world_editor_select option:selected').text()?.trim();
            // 这个是编辑器当前打开的，不一定是启用的，暂不加入
        } catch (e) { /* ignore */ }

        // ---- 方式3: 世界书tag标签（较新版本ST用tag方式显示已选世界书）----
        try {
            // 全局世界书区域的tag标签
            $('#world_info_tag_list .tag, #world_info .tag, .world_entry_tag').each(function () {
                const name = $(this).data('name') || $(this).attr('data-name') || '';
                if (name.trim()) {
                    names.add(name.trim());
                    return;
                }
                // tag的文本内容（去掉删除按钮的×）
                let txt = '';
                $(this).contents().each(function () {
                    if (this.nodeType === 3) txt += this.textContent;
                });
                txt = txt.trim();
                if (txt && txt !== '×' && txt !== 'x') names.add(txt);
            });
        } catch (e) { /* ignore */ }

        // ---- 方式4: chat_metadata ----
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const meta = SillyTavern.getContext().chat_metadata;
                if (meta?.world_info_selected) {
                    const sel = meta.world_info_selected;
                    if (Array.isArray(sel)) sel.forEach(n => { if (String(n).trim()) names.add(String(n).trim()); });
                    if (typeof sel === 'string' && sel.trim()) names.add(sel.trim());
                }
            }
        } catch (e) { /* ignore */ }

        // ---- 方式5: 全局变量 ----
        try {
            if (Array.isArray(window.selected_world_info)) {
                window.selected_world_info.forEach(n => { if (String(n).trim()) names.add(String(n).trim()); });
            }
        } catch (e) { /* ignore */ }

        console.log('[WBExport] 收集到的原始名称:', Array.from(names));

        // 检查收集到的名称：如果全是纯数字，说明获取的是索引而不是名称
        // 需要通过索引→名称映射来修正
        const nameArr = Array.from(names);
        const allNumeric = nameArr.length > 0 && nameArr.every(n => /^\d+$/.test(n));

        if (allNumeric) {
            console.warn('[WBExport] 检测到名称全为数字索引，正在从DOM映射真实名称...');
            const realNames = new Set();
            const indexToName = {};

            // 建立 val → text 映射
            $('#world_info option').each(function () {
                const v = $(this).val()?.trim();
                const t = $(this).text()?.trim();
                if (v && t && t !== 'None' && t !== 'none' && t !== '--- None ---') {
                    indexToName[v] = t;
                }
            });

            console.log('[WBExport] 索引→名称映射:', indexToName);

            nameArr.forEach(idx => {
                if (indexToName[idx]) {
                    realNames.add(indexToName[idx]);
                }
            });

            if (realNames.size > 0) {
                console.log('[WBExport] 映射后的真实名称:', Array.from(realNames));
                return Array.from(realNames).sort((a, b) => a.localeCompare(b, 'zh-CN'));
            }

            // 如果映射也失败了，尝试直接获取所有selected的text
            console.warn('[WBExport] 映射失败，直接获取selected text...');
            $('#world_info option:selected').each(function () {
                const t = $(this).text()?.trim();
                if (t && t !== 'None' && t !== 'none' && t !== '--- None ---' && !/^\d+$/.test(t)) {
                    realNames.add(t);
                }
            });

            if (realNames.size > 0) {
                return Array.from(realNames).sort((a, b) => a.localeCompare(b, 'zh-CN'));
            }
        }

        return nameArr.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    // ============================================
    // 从服务端获取全部世界书名称（兜底用）
    // ============================================
    async function getAllWorldBookNames() {
        const names = new Set();

        // 方式1: 从DOM的所有option获取text
        $('#world_info option, #world_editor_select option').each(function () {
            const txt = $(this).text()?.trim();
            if (txt && txt !== 'None' && txt !== 'none' && txt !== '--- None ---' && txt !== '') {
                names.add(txt);
            }
        });

        // 方式2: 从编辑器API获取
        if (names.size === 0) {
            try {
                const resp = await fetch('/api/worldinfo/search', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ term: '' }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    (Array.isArray(data) ? data : []).forEach(n => {
                        if (typeof n === 'string' && n.trim()) names.add(n.trim());
                        if (typeof n === 'object' && n.name) names.add(n.name.trim());
                    });
                }
            } catch (e) { /* ignore */ }
        }

        return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    // ============================================
    // 加载世界书数据（用正确的名称）
    // ============================================
    async function loadWorldBookData(name) {
        // 方式1: getContext API
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.loadWorldInfo === 'function') {
                    const data = await ctx.loadWorldInfo(name);
                    if (data && data.entries && Object.keys(data.entries).length > 0) {
                        console.log(`[WBExport] ✅ getContext加载 "${name}" 成功, ${Object.keys(data.entries).length} 条`);
                        return data;
                    }
                }
            }
        } catch (e) {
            console.log(`[WBExport] getContext加载 "${name}" 失败:`, e.message);
        }

        // 方式2: fetch /api/worldinfo/get
        try {
            const resp = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name: name }),
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data?.entries && Object.keys(data.entries).length > 0) {
                    console.log(`[WBExport] ✅ fetch加载 "${name}" 成功, ${Object.keys(data.entries).length} 条`);
                    return data;
                }
                // 有些版本entries格式不同
                if (data && typeof data === 'object' && !data.entries) {
                    const keys = Object.keys(data);
                    if (keys.length > 0 && data[keys[0]]?.uid !== undefined) {
                        console.log(`[WBExport] ✅ fetch加载 "${name}" 成功(裸格式), ${keys.length} 条`);
                        return { entries: data };
                    }
                }
            }
        } catch (e) {
            console.log(`[WBExport] fetch加载 "${name}" 失败:`, e.message);
        }

        // 方式3: 尝试带.json后缀
        if (!name.endsWith('.json')) {
            try {
                const resp = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ name: name + '.json' }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data?.entries && Object.keys(data.entries).length > 0) {
                        console.log(`[WBExport] ✅ fetch加载 "${name}.json" 成功`);
                        return data;
                    }
                }
            } catch (e) { /* ignore */ }
        }

        console.warn(`[WBExport] ❌ 所有方式加载 "${name}" 均失败`);
        return null;
    }

    // ============================================
    // 导出工具
    // ============================================
    function downloadJson(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.json') ? filename : filename + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function mergeWorldBooks(booksMap) {
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

    // ============================================
    // 创建弹窗UI（参照epubToTxt风格）
    // ============================================
    function createModal() {
        $('#wb-export-modal').remove();

        const modalHtml = `
        <div id="wb-export-modal" style="
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            z-index: 99999;
            overflow-y: auto;
        ">
            <div style="
                display: flex;
                justify-content: center;
                align-items: flex-start;
                min-height: 100%;
                padding: 20px;
                box-sizing: border-box;
            ">
                <div style="
                    background: var(--SmartThemeBlurTintColor, #1a1a2e);
                    border: 1px solid var(--SmartThemeBorderColor, #444);
                    border-radius: 12px;
                    padding: 20px;
                    width: 100%;
                    max-width: 500px;
                    color: var(--SmartThemeBodyColor, #fff);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    margin: 20px 0;
                ">
                    <h3 style="margin: 0 0 15px 0; text-align: center; font-size: 18px;">
                        📤 导出已启用世界书
                    </h3>

                    <div style="display: flex; flex-direction: column; gap: 12px;">

                        <!-- 进度区 -->
                        <div id="wbe-progress" style="
                            display: none;
                            text-align: center;
                            padding: 10px;
                            background: rgba(26, 188, 156, 0.15);
                            border-radius: 8px;
                        ">
                            <div style="
                                width: 100%; height: 6px;
                                background: rgba(255,255,255,0.1);
                                border-radius: 3px;
                                overflow: hidden;
                                margin-bottom: 8px;
                            ">
                                <div id="wbe-progress-bar" style="
                                    height: 100%; width: 0%;
                                    background: linear-gradient(90deg, #1abc9c, #2ecc71);
                                    border-radius: 3px;
                                    transition: width 0.25s ease;
                                "></div>
                            </div>
                            <span id="wbe-progress-text" style="font-size: 13px;">⏳ 正在扫描...</span>
                        </div>

                        <!-- 调试信息（可折叠） -->
                        <details id="wbe-debug-area" style="display:none; font-size:11px; opacity:0.6;">
                            <summary style="cursor:pointer;">🔍 调试信息（点击展开）</summary>
                            <pre id="wbe-debug-log" style="
                                max-height: 120px; overflow-y: auto;
                                background: rgba(0,0,0,0.3);
                                padding: 6px; border-radius: 4px;
                                white-space: pre-wrap; word-break: break-all;
                                margin-top: 4px; font-size: 10px;
                            "></pre>
                        </details>

                        <!-- 世界书列表 -->
                        <div id="wbe-book-list" style="
                            min-height: 80px;
                            max-height: 350px;
                            overflow-y: auto;
                            border: 1px dashed #666;
                            border-radius: 8px;
                            padding: 8px;
                        ">
                            <div style="
                                text-align: center;
                                color: #888;
                                padding: 25px 10px;
                                font-size: 14px;
                            ">
                                ⏳ 正在扫描已启用的世界书...
                            </div>
                        </div>

                        <!-- 全选按钮 -->
                        <div style="display: flex; gap: 10px;">
                            <button id="wbe-sel-all-btn" class="menu_button" style="
                                background: #3498db !important;
                                padding: 8px 12px !important;
                                flex: 1;
                                font-size: 13px !important;
                            ">
                                ☑ 全选
                            </button>
                            <button id="wbe-sel-none-btn" class="menu_button" style="
                                background: #2980b9 !important;
                                padding: 8px 12px !important;
                                flex: 1;
                                font-size: 13px !important;
                            ">
                                ☐ 全不选
                            </button>
                        </div>

                        <!-- 导出按钮 -->
                        <div style="display: flex; gap: 10px;">
                            <button id="wbe-export-sep-btn" class="menu_button" style="
                                background: linear-gradient(135deg, #27ae60, #229954) !important;
                                padding: 10px 15px !important;
                                flex: 1;
                                font-size: 14px !important;
                            ">
                                📥 分别导出
                            </button>
                            <button id="wbe-export-merge-btn" class="menu_button" style="
                                background: linear-gradient(135deg, #2980b9, #2471a3) !important;
                                padding: 10px 15px !important;
                                flex: 1;
                                font-size: 14px !important;
                            ">
                                📦 合并导出
                            </button>
                        </div>

                        <!-- 关闭 -->
                        <button id="wbe-close-btn" class="menu_button" style="
                            background: #555 !important;
                            padding: 10px 15px !important;
                            font-size: 14px !important;
                            width: 100%;
                        ">
                            ✖ 关闭
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <style>
            .wbe-book-item {
                display: flex;
                align-items: center;
                padding: 8px;
                margin: 4px 0;
                background: rgba(255,255,255,0.1);
                border-radius: 6px;
                gap: 8px;
                cursor: pointer;
                user-select: none;
            }
            .wbe-book-item:active {
                background: rgba(255,255,255,0.15);
            }
            .wbe-book-item.selected {
                background: rgba(26, 188, 156, 0.2);
                border: 1px solid rgba(26, 188, 156, 0.4);
            }
            .wbe-book-item.err {
                opacity: 0.4;
                cursor: not-allowed;
            }
            .wbe-book-item input[type="checkbox"] {
                width: 17px; height: 17px;
                flex-shrink: 0;
                accent-color: #1abc9c;
                cursor: pointer;
            }
            .wbe-bk-name {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 13px;
                font-weight: 600;
                min-width: 0;
            }
            .wbe-bk-tags {
                display: flex;
                gap: 4px;
                flex-shrink: 0;
                flex-wrap: wrap;
                justify-content: flex-end;
            }
            .wbe-bk-tag {
                font-size: 10px;
                padding: 2px 7px;
                border-radius: 10px;
                white-space: nowrap;
                background: rgba(255,255,255,0.08);
            }
            .wbe-bk-tag.g { background: rgba(46,204,113,0.2); color: #2ecc71; }
            .wbe-bk-tag.r { background: rgba(231,76,60,0.2); color: #e74c3c; }
        </style>`;

        $('body').append(modalHtml);
        bindModalEvents();
    }

    function bindModalEvents() {
        $('#wbe-sel-all-btn').on('click', () => toggleAll(true));
        $('#wbe-sel-none-btn').on('click', () => toggleAll(false));
        $('#wbe-export-sep-btn').on('click', doExportSep);
        $('#wbe-export-merge-btn').on('click', doExportMerge);
        $('#wbe-close-btn').on('click', closeModal);

        $('#wb-export-modal').on('click', function (e) {
            if (e.target.id === 'wb-export-modal') closeModal();
        });
    }

    // ============================================
    // 进度 & 调试
    // ============================================
    function showProgress(pct, text) {
        $('#wbe-progress').show();
        $('#wbe-progress-bar').css('width', Math.min(100, Math.max(0, pct)) + '%');
        $('#wbe-progress-text').text(text || '');
    }

    function hideProgress() { $('#wbe-progress').hide(); }

    let debugLines = [];
    function debugLog(msg) {
        console.log('[WBExport] ' + msg);
        debugLines.push(msg);
        const el = document.getElementById('wbe-debug-log');
        if (el) el.textContent = debugLines.join('\n');
        const area = document.getElementById('wbe-debug-area');
        if (area) area.style.display = '';
    }

    // ============================================
    // 扫描主流程
    // ============================================
    async function startScan() {
        if (isWorking) return;
        isWorking = true;
        loadedBooks = {};
        debugLines = [];

        const listEl = $('#wbe-book-list');
        showProgress(5, '🔍 正在获取已启用的世界书名称...');
        await sleep(50);

        // 获取已启用的世界书名称
        let names = getActiveWorldBookNames();
        debugLog('已启用世界书名称: [' + names.join(', ') + ']');

        if (names.length === 0) {
            showProgress(10, '⚠️ 未检测到已启用世界书，获取全部列表...');
            debugLog('未检测到已启用世界书，尝试获取全部...');
            names = await getAllWorldBookNames();
            debugLog('全部世界书: [' + names.join(', ') + ']');
            if (names.length > 0) {
                toastr.info(`未检测到已启用世界书，已列出全部 ${names.length} 个`);
            }
        }

        if (names.length === 0) {
            listEl.html(`
                <div style="text-align:center; color:#888; padding:25px 10px; font-size:14px;">
                    😕 未找到任何世界书<br>
                    <small>请确保SillyTavern中有世界书且已启用<br>
                    请打开浏览器控制台(F12)查看[WBExport]日志</small>
                </div>
            `);
            showProgress(100, '❌ 未找到世界书');
            setTimeout(hideProgress, 2000);
            isWorking = false;
            return;
        }

        showProgress(15, `📚 找到 ${names.length} 个世界书，开始加载数据...`);
        listEl.empty();

        const total = names.length;
        let loaded = 0, failed = 0;

        for (const name of names) {
            const pct = 15 + Math.round((loaded / total) * 80);
            showProgress(pct, `📖 加载中 (${loaded + 1}/${total}): ${name}`);
            await sleep(30);

            debugLog(`正在加载: "${name}" ...`);
            const data = await loadWorldBookData(name);
            loaded++;

            if (data?.entries && Object.keys(data.entries).length > 0) {
                loadedBooks[name] = data;
                const arr = Object.values(data.entries);
                const en = arr.filter(e => !e.disable).length;
                debugLog(`  ✅ "${name}" 加载成功: ${arr.length}条 (${en}启用)`);
                listEl.append(makeBookItem(name, arr.length, en, true));
            } else {
                failed++;
                debugLog(`  ❌ "${name}" 加载失败或无条目`);
                listEl.append(makeBookItem(name, 0, 0, false));
            }
        }

        const ok = Object.keys(loadedBooks).length;
        showProgress(100, `✅ 完成！成功 ${ok} 个` + (failed ? ` / 失败 ${failed} 个` : ''));
        setTimeout(hideProgress, 1500);

        toggleAll(true);
        isWorking = false;
    }

    // ============================================
    // 列表项
    // ============================================
    function makeBookItem(name, total, enabled, ok) {
        const safeName = esc(name);
        let tagsHtml = '';
        if (ok) {
            tagsHtml += `<span class="wbe-bk-tag g">✅${enabled}启用</span>`;
            if (total - enabled > 0) tagsHtml += `<span class="wbe-bk-tag r">⛔${total - enabled}禁用</span>`;
            tagsHtml += `<span class="wbe-bk-tag">共${total}条</span>`;
        } else {
            tagsHtml = `<span class="wbe-bk-tag r">⚠️加载失败</span>`;
        }

        const item = $(`
            <div class="wbe-book-item ${ok ? 'selected' : 'err'}" data-name="${safeName}">
                <input type="checkbox" class="wbe-bk-cb" data-name="${safeName}" ${ok ? 'checked' : 'disabled'}>
                <span class="wbe-bk-name" title="${safeName}">${safeName}</span>
                <div class="wbe-bk-tags">${tagsHtml}</div>
            </div>
        `);

        item.on('click', function (e) {
            if (!ok) return;
            const cb = $(this).find('.wbe-bk-cb');
            if (!$(e.target).is('input')) cb.prop('checked', !cb.prop('checked'));
            $(this).toggleClass('selected', cb.prop('checked'));
        });

        return item;
    }

    function getCheckedNames() {
        const r = [];
        $('.wbe-bk-cb:checked').each(function () { r.push($(this).data('name')); });
        return r;
    }

    function toggleAll(checked) {
        $('.wbe-book-item').each(function () {
            const cb = $(this).find('.wbe-bk-cb');
            if (cb.prop('disabled')) return;
            cb.prop('checked', checked);
            $(this).toggleClass('selected', checked);
        });
    }

    // ============================================
    // 导出
    // ============================================
    async function doExportSep() {
        const names = getCheckedNames();
        if (!names.length) { toastr.warning('请先选择世界书'); return; }
        let ok = 0;
        for (let i = 0; i < names.length; i++) {
            const d = loadedBooks[names[i]];
            if (d) { downloadJson(d, names[i]); ok++; }
            if (names.length > 1 && i < names.length - 1) await sleep(500);
        }
        if (ok) toastr.success(`已导出 ${ok} 个世界书`);
        else toastr.error('没有可导出的数据');
    }

    async function doExportMerge() {
        const names = getCheckedNames();
        if (!names.length) { toastr.warning('请先选择世界书'); return; }
        const books = {};
        names.forEach(n => { if (loadedBooks[n]) books[n] = loadedBooks[n]; });
        if (!Object.keys(books).length) { toastr.error('没有可用数据'); return; }
        const { data, count } = mergeWorldBooks(books);
        if (count === 0) { toastr.error('选中的世界书条目为空'); return; }
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadJson(data, `merged_${ts}`);
        toastr.success(`已合并 ${Object.keys(books).length} 个世界书，共 ${count} 条`);
    }

    // ============================================
    // 打开/关闭
    // ============================================
    function openModal() {
        if ($('#wb-export-modal').length === 0) createModal();
        loadedBooks = {};
        hideProgress();
        $('#wbe-debug-area').hide();
        $('#wbe-book-list').html(`
            <div style="text-align:center; color:#888; padding:25px 10px; font-size:14px;">
                ⏳ 正在扫描已启用的世界书...
            </div>
        `);
        $('#wb-export-modal').css('display', 'block');
        $('body').css('overflow', 'hidden');

        setTimeout(() => startScan(), 100);
    }

    function closeModal() {
        $('#wb-export-modal').hide();
        $('body').css('overflow', '');
    }

    window.WorldbookExport = { open: openModal, close: closeModal };
    console.log('[WBExport] 📤 世界书导出模块已加载');
})();

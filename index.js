import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "novel-auto-generator";

const defaultSettings = {
    totalChapters: 1000,
    currentChapter: 0,
    prompt: "继续推进剧情，保证剧情流畅自然，注意人物性格一致性",
    delayAfterGeneration: 3000,
    initialWaitTime: 2000,
    stabilityCheckInterval: 1000,
    stabilityRequiredCount: 5,
    responseTimeout: 300000,
    autoSaveInterval: 50,
    maxRetries: 3,
    minChapterLength: 100,
    isRunning: false,
    isPaused: false,
    exportAll: true,
    exportStartFloor: 0,
    exportEndFloor: 99999,
    exportIncludeUser: false,
    exportIncludeAI: true,
    useRawContent: true,
    extractTags: '',
    extractMode: 'all',
    tagSeparator: '\n\n',
    // 面板折叠状态
    panelCollapsed: {
        generate: false,
        export: false,
        extract: true,
        advanced: true,
    },
};

let settings = {};
let abortGeneration = false;
let generationStats = { startTime: null, chaptersGenerated: 0, totalCharacters: 0, errors: [] };

// ============================================
// 工具函数
// ============================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg, type = 'info') {
    const p = { info: '📘', success: '✅', warning: '⚠️', error: '❌', debug: '🔍' }[type] || 'ℹ️';
    console.log(`[NovelGen] ${p} ${msg}`);
}

function formatDuration(ms) {
    if (!ms || ms < 0) return '--:--:--';
    const s = Math.floor(ms/1000)%60, m = Math.floor(ms/60000)%60, h = Math.floor(ms/3600000);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

// ============================================
// SillyTavern 数据访问
// ============================================

function getSTChat() {
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const ctx = SillyTavern.getContext();
            if (ctx?.chat && Array.isArray(ctx.chat)) return ctx.chat;
        }
    } catch(e) {}
    
    try {
        if (typeof getContext === 'function') {
            const ctx = getContext();
            if (ctx?.chat && Array.isArray(ctx.chat)) return ctx.chat;
        }
    } catch(e) {}
    
    if (window.chat && Array.isArray(window.chat)) return window.chat;
    if (typeof chat !== 'undefined' && Array.isArray(chat)) return chat;
    
    return null;
}

function getTotalFloors() {
    const c = getSTChat();
    return c ? c.length : document.querySelectorAll('#chat .mes').length;
}

function getMaxFloorIndex() {
    const total = getTotalFloors();
    return total > 0 ? total - 1 : 0;
}

function getRawMessages(startFloor, endFloor, opts = {}) {
    const { includeUser = false, includeAI = true } = opts;
    const stChat = getSTChat();
    if (!stChat) return null;
    
    const messages = [];
    const start = Math.max(0, startFloor);
    const end = Math.min(stChat.length - 1, endFloor);
    
    for (let i = start; i <= end; i++) {
        const msg = stChat[i];
        if (!msg) continue;
        const isUser = msg.is_user || msg.is_human || false;
        if (isUser && !includeUser) continue;
        if (!isUser && !includeAI) continue;
        const rawContent = msg.mes || '';
        if (rawContent) {
            messages.push({ floor: i, isUser, name: msg.name || (isUser ? 'User' : 'AI'), content: rawContent });
        }
    }
    return messages;
}

// ============================================
// 标签提取
// ============================================

function parseTagInput(s) {
    if (!s || typeof s !== 'string') return [];
    return s.split(/[,;，；\s\n\r]+/).map(t => t.trim()).filter(t => t.length > 0);
}

function extractTagContents(text, tags, separator = '\n\n') {
    if (!text || !tags || tags.length === 0) return '';
    const parts = [];
    for (const tag of tags) {
        const t = tag.trim();
        if (!t) continue;
        const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<\\s*${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\s*/\\s*${escaped}\\s*>`, 'gi');
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const content = match[1].trim();
            if (content) parts.push(content);
        }
    }
    return parts.join(separator);
}

// ============================================
// 章节获取
// ============================================

function getAllChapters() {
    const tags = parseTagInput(settings.extractTags);
    const useTags = settings.extractMode === 'tags' && tags.length > 0;
    const chapters = [];
    
    let startFloor = settings.exportAll ? 0 : settings.exportStartFloor;
    let endFloor = settings.exportAll ? getMaxFloorIndex() : settings.exportEndFloor;
    
    if (settings.useRawContent) {
        const rawMessages = getRawMessages(startFloor, endFloor, {
            includeUser: settings.exportIncludeUser,
            includeAI: settings.exportIncludeAI,
        });
        
        if (rawMessages?.length) {
            for (const msg of rawMessages) {
                let content = useTags ? extractTagContents(msg.content, tags, settings.tagSeparator) : msg.content;
                if (!content && useTags) continue;
                if (content?.length > 10) {
                    chapters.push({ floor: msg.floor, index: chapters.length + 1, isUser: msg.isUser, name: msg.name, content });
                }
            }
            return chapters;
        }
    }
    
    // 回退 DOM
    document.querySelectorAll('#chat .mes').forEach((msg, idx) => {
        if (idx < startFloor || idx > endFloor) return;
        const isUser = msg.getAttribute('is_user') === 'true';
        if (isUser && !settings.exportIncludeUser) return;
        if (!isUser && !settings.exportIncludeAI) return;
        const text = msg.querySelector('.mes_text')?.innerText?.trim();
        if (!text) return;
        let content = useTags ? extractTagContents(text, tags, settings.tagSeparator) : text;
        if (content?.length > 10) {
            chapters.push({ floor: idx, index: chapters.length + 1, isUser, content });
        }
    });
    return chapters;
}

// ============================================
// 帮助弹窗
// ============================================

function showHelp(topic) {
    const helps = {
        extract: `
<h3>🏷️ 标签提取功能说明</h3>

<h4>📌 什么是标签提取？</h4>
<p>从 AI 回复的原始内容中，只提取指定 XML 标签内的文字。</p>

<h4>📌 使用场景</h4>
<p>当你使用正则美化输出时，原始回复可能包含：</p>
<pre>&lt;思考&gt;AI的思考过程...&lt;/思考&gt;
&lt;content&gt;这是正文内容...&lt;/content&gt;
&lt;旁白&gt;环境描写...&lt;/旁白&gt;</pre>
<p>使用标签提取可以只导出 &lt;content&gt; 内的正文，过滤掉思考和旁白。</p>

<h4>📌 如何使用</h4>
<ol>
    <li>✅ 勾选「原始 (chat.mes)」确保读取未处理的内容</li>
    <li>模式选择「标签」</li>
    <li>在标签输入框填写要提取的标签名</li>
</ol>

<h4>📌 多标签提取</h4>
<p>用 <b>空格、逗号、分号</b> 分隔多个标签：</p>
<pre>content detail 正文</pre>
<p>或</p>
<pre>content, detail, 正文</pre>

<h4>📌 提取顺序</h4>
<p>按标签在原文中出现的顺序依次提取，同一标签多次出现都会被提取。</p>

<h4>📌 分隔符</h4>
<p>多个标签内容之间的连接方式：</p>
<ul>
    <li><b>空行</b>：内容之间空一行</li>
    <li><b>换行</b>：内容之间换行</li>
    <li><b>无</b>：直接拼接</li>
</ul>

<h4>📌 调试</h4>
<p>在浏览器控制台 (F12) 输入 <code>nagDebug()</code> 可查看原始消息内容和提取测试结果。</p>
        `,
        export: `
<h3>📤 导出设置说明</h3>

<h4>📌 楼层范围</h4>
<p>楼层从 <b>0</b> 开始计数（与 SillyTavern 一致）。</p>
<ul>
    <li><b>导出全部</b>：勾选后导出所有楼层</li>
    <li><b>指定范围</b>：取消勾选后可设置起始和结束楼层</li>
</ul>

<h4>📌 内容类型</h4>
<ul>
    <li><b>👤 用户</b>：包含你发送的消息</li>
    <li><b>🤖 AI</b>：包含 AI 的回复</li>
</ul>

<h4>📌 原始 (chat.mes)</h4>
<ul>
    <li><b>✅ 勾选</b>：读取原始内容（点击编辑按钮看到的）</li>
    <li><b>❌ 不勾选</b>：读取页面显示的内容（经过正则处理后的）</li>
</ul>
<p>如果需要使用标签提取功能，<b>必须勾选</b>此选项。</p>
        `,
        generate: `
<h3>📝 生成设置说明</h3>

<h4>📌 目标章节</h4>
<p>设置要自动生成的章节总数。生成过程中会显示进度。</p>

<h4>📌 提示词</h4>
<p>每次自动发送给 AI 的消息内容。建议使用简洁的续写指令，例如：</p>
<ul>
    <li>继续</li>
    <li>继续推进剧情</li>
    <li>请继续创作下一章</li>
</ul>
        `,
    };
    
    const content = helps[topic] || '<p>暂无帮助内容</p>';
    
    const modal = $(`
        <div class="nag-modal-overlay">
            <div class="nag-modal">
                <div class="nag-modal-header">
                    <span>帮助</span>
                    <button class="nag-modal-close">✕</button>
                </div>
                <div class="nag-modal-body">
                    ${content}
                </div>
            </div>
        </div>
    `);
    
    function closeModal(e) {
        if (e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
        }
        modal.remove();
    }
    
    // 阻止所有可能触发 drawer 折叠的事件冒泡
    modal.on('click mousedown mouseup pointerdown pointerup touchstart touchend', function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });
    
    // 关闭按钮
    modal.find('.nag-modal-close').on('click', closeModal);
    
    // 点击遮罩关闭（点击弹窗内容区域不关闭）
    modal.on('click', function(e) {
        if (e.target === modal[0]) {
            closeModal(e);
        }
    });
    
    // ESC 键关闭
    $(document).one('keydown.nagModal', function(e) {
        if (e.key === 'Escape') {
            closeModal(e);
        }
    });
    
    // ✅ 关键修改：追加到插件容器内部，而不是 body
    $('#nag-container').append(modal);
}

// ============================================
// 预览
// ============================================

function refreshPreview() {
    const stChat = getSTChat();
    const tags = parseTagInput(settings.extractTags);
    const useTags = settings.extractMode === 'tags' && tags.length > 0;
    
    if (!stChat || stChat.length === 0) {
        $('#nag-preview-content').html(`<div class="nag-preview-warning"><b>⚠️ 无法获取聊天数据</b></div>`);
        return;
    }
    
    let rawContent = '', floor = -1;
    for (let i = stChat.length - 1; i >= 0; i--) {
        const msg = stChat[i];
        if (msg && !msg.is_user && !msg.is_human && msg.mes) {
            rawContent = msg.mes;
            floor = i;
            break;
        }
    }
    
    if (!rawContent) {
        $('#nag-preview-content').html('<i style="opacity:0.6">没有 AI 消息</i>');
        return;
    }
    
    const rawPreview = rawContent.substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    let html = `
        <div class="nag-preview-source">楼层 ${floor} | 长度 ${rawContent.length} 字</div>
        <div class="nag-preview-raw">${rawPreview}${rawContent.length > 200 ? '...' : ''}</div>
    `;
    
    if (useTags) {
        const extracted = extractTagContents(rawContent, tags, settings.tagSeparator);
        if (extracted) {
            html += `<div class="nag-preview-success"><b>✅ 提取成功</b> (${extracted.length} 字) [${tags.join(', ')}]<div class="nag-preview-text">${escapeHtml(extracted.slice(0, 400))}${extracted.length > 400 ? '...' : ''}</div></div>`;
        } else {
            html += `<div class="nag-preview-warning"><b>⚠️ 未找到标签</b> [${tags.join(', ')}]</div>`;
        }
    } else {
        html += `<div class="nag-preview-info"><b>📄 全部内容模式</b></div>`;
    }
    
    $('#nag-preview-content').html(html);
}

function debugRawContent(floorIndex) {
    const stChat = getSTChat();
    if (!stChat) { console.log('❌ 无法获取 chat'); return; }
    
    console.log(`✅ chat 获取成功，共 ${stChat.length} 条`);
    
    if (floorIndex === undefined) {
        for (let i = stChat.length - 1; i >= 0; i--) {
            if (stChat[i] && !stChat[i].is_user) { floorIndex = i; break; }
        }
    }
    
    const msg = stChat[floorIndex];
    if (!msg) { console.log(`楼层 ${floorIndex} 不存在`); return; }
    
    console.log(`\n----- 楼层 ${floorIndex} -----`);
    console.log('mes:', msg.mes?.substring(0, 500));
    
    const tags = parseTagInput(settings.extractTags);
    if (tags.length > 0) {
        console.log(`\n----- 标签测试 [${tags.join(', ')}] -----`);
        console.log('结果:', extractTagContents(msg.mes, tags, '\n---\n') || '(无匹配)');
    }
}

window.nagDebug = debugRawContent;

// ============================================
// 生成逻辑
// ============================================

function getAIMessagesInfo() {
    const msgs = document.querySelectorAll('#chat .mes[is_user="false"]');
    if (!msgs.length) return { count: 0, lastContent: '', lastLength: 0 };
    const last = msgs[msgs.length - 1].querySelector('.mes_text');
    const content = last?.innerText?.trim() || '';
    return { count: msgs.length, lastContent: content, lastLength: content.length };
}

function hasActiveGeneration() {
    // 只检测最可靠的指标：是否有正在生成的消息
    return !!document.querySelector('.mes.generating');
}

async function waitForNewResponse(prevCount) {
    const start = Date.now();
    while (getAIMessagesInfo().count <= prevCount) {
        if (abortGeneration) throw new Error('中止');
        if (Date.now() - start > settings.responseTimeout) throw new Error('超时');
        await sleep(300);
    }
    await sleep(500);
    while (hasActiveGeneration()) {
        if (abortGeneration) throw new Error('中止');
        await sleep(300);
    }
    let lastLen = 0, stable = 0;
    while (stable < settings.stabilityRequiredCount) {
        if (abortGeneration) throw new Error('中止');
        if (hasActiveGeneration()) { stable = 0; await sleep(300); continue; }
        const info = getAIMessagesInfo();
        if (info.lastLength === lastLen && info.lastLength > 0) stable++;
        else { stable = 0; lastLen = info.lastLength; }
        await sleep(settings.stabilityCheckInterval);
    }
    await sleep(settings.delayAfterGeneration);
    return getAIMessagesInfo();
}

async function sendMessage(text) {
    const ta = document.querySelector('#send_textarea');
    const btn = document.querySelector('#send_but');
    if (!ta || !btn) throw new Error('找不到输入框');
    ta.value = ''; ta.focus(); await sleep(50);
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    btn.click();
}

async function generateSingleChapter(num) {
    const before = getAIMessagesInfo();
    await sleep(settings.initialWaitTime);
    await sendMessage(settings.prompt);
    const result = await waitForNewResponse(before.count);
    if (result.lastLength < settings.minChapterLength) throw new Error('响应过短');
    generationStats.chaptersGenerated++;
    generationStats.totalCharacters += result.lastLength;
    log(`第 ${num} 章完成 (${result.lastLength} 字)`, 'success');
    return result;
}

async function startGeneration() {
    if (settings.isRunning) { toastr.warning('已在运行'); return; }
    if (hasActiveGeneration()) { toastr.error('请等待当前生成完成'); return; }
    
    settings.isRunning = true; settings.isPaused = false; abortGeneration = false;
    generationStats = { startTime: Date.now(), chaptersGenerated: 0, totalCharacters: 0, errors: [] };
    saveSettings(); updateUI();
    toastr.info(`开始生成 ${settings.totalChapters - settings.currentChapter} 章`);
    
    try {
        for (let i = settings.currentChapter; i < settings.totalChapters; i++) {
            if (abortGeneration) break;
            while (settings.isPaused && !abortGeneration) await sleep(500);
            if (abortGeneration) break;
            
            let success = false, retries = 0;
            while (!success && retries < settings.maxRetries) {
                try {
                    await generateSingleChapter(i + 1);
                    success = true;
                    settings.currentChapter = i + 1;
                    saveSettings(); updateUI();
                } catch(e) {
                    retries++;
                    generationStats.errors.push({ chapter: i + 1, error: e.message });
                    if (retries < settings.maxRetries) {
                        await sleep(5000);
                        while (hasActiveGeneration()) await sleep(1000);
                    }
                }
            }
            if (!success) settings.currentChapter = i + 1;
            if (settings.currentChapter % settings.autoSaveInterval === 0) await exportNovel(true);
        }
        if (!abortGeneration) { toastr.success('生成完成!'); await exportNovel(false); }
    } finally {
        settings.isRunning = false; settings.isPaused = false;
        saveSettings(); updateUI();
    }
}

function pauseGeneration() { settings.isPaused = true; updateUI(); toastr.info('已暂停'); }
function resumeGeneration() { settings.isPaused = false; updateUI(); toastr.info('已恢复'); }
function stopGeneration() { abortGeneration = true; settings.isRunning = false; updateUI(); toastr.warning('已停止'); }
function resetProgress() {
    if (settings.isRunning) { toastr.warning('请先停止'); return; }
    settings.currentChapter = 0;
    generationStats = { startTime: null, chaptersGenerated: 0, totalCharacters: 0, errors: [] };
    saveSettings(); updateUI(); toastr.info('已重置');
}

// ============================================
// 导出
// ============================================

function downloadFile(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function exportNovel(silent = false) {
    const chapters = getAllChapters();
    if (!chapters.length) { if (!silent) toastr.warning('没有内容'); return; }
    
    const totalChars = chapters.reduce((s, c) => s + c.content.length, 0);
    let text = `导出时间: ${new Date().toLocaleString()}\n总章节: ${chapters.length}\n总字数: ${totalChars}\n${'═'.repeat(40)}\n\n`;
    chapters.forEach(ch => {
        text += `══ [${ch.floor}楼] ${ch.isUser ? '用户' : 'AI'} ══\n\n${ch.content}\n\n`;
    });
    
    downloadFile(text, `novel_${chapters.length}ch_${Date.now()}.txt`);
    if (!silent) toastr.success(`已导出 ${chapters.length} 条`);
}

async function exportAsJSON(silent = false) {
    const chapters = getAllChapters();
    if (!chapters.length) { if (!silent) toastr.warning('没有内容'); return; }
    downloadFile(JSON.stringify({ time: new Date().toISOString(), chapters }, null, 2), `novel_${Date.now()}.json`, 'application/json');
    if (!silent) toastr.success('已导出 JSON');
}

// ============================================
// 设置 & UI
// ============================================

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);
    // 确保 panelCollapsed 存在
    settings.panelCollapsed = Object.assign({}, defaultSettings.panelCollapsed, settings.panelCollapsed || {});
    settings.isRunning = false; 
    settings.isPaused = false;
}

function saveSettings() {
    Object.assign(extension_settings[extensionName], settings);
    saveSettingsDebounced();
}

function updateUI() {
    const pct = settings.totalChapters > 0 ? (settings.currentChapter / settings.totalChapters * 100).toFixed(1) : 0;
    $('#nag-progress-fill').css('width', `${pct}%`);
    $('#nag-progress-text').text(`${settings.currentChapter} / ${settings.totalChapters} (${pct}%)`);
    
    const [txt, cls] = settings.isRunning ? (settings.isPaused ? ['⏸️ 已暂停', 'paused'] : ['▶️ 运行中', 'running']) : ['⏹️ 已停止', 'stopped'];
    $('#nag-status').text(txt).removeClass('stopped paused running').addClass(cls);
    
    $('#nag-btn-start').prop('disabled', settings.isRunning);
    $('#nag-btn-pause').prop('disabled', !settings.isRunning || settings.isPaused);
    $('#nag-btn-resume').prop('disabled', !settings.isPaused);
    $('#nag-btn-stop').prop('disabled', !settings.isRunning);
    $('#nag-btn-reset').prop('disabled', settings.isRunning);
    
    if (settings.isRunning && generationStats.startTime && generationStats.chaptersGenerated > 0) {
        const elapsed = Date.now() - generationStats.startTime;
        const avg = elapsed / generationStats.chaptersGenerated;
        $('#nag-time-elapsed').text(formatDuration(elapsed));
        $('#nag-time-remaining').text(formatDuration(avg * (settings.totalChapters - settings.currentChapter)));
    }
    $('#nag-stat-errors').text(generationStats.errors.length);
    
    $('#nag-set-start-floor, #nag-set-end-floor').prop('disabled', settings.exportAll);
    $('#nag-floor-inputs').toggleClass('disabled', settings.exportAll);
}

function toggleTagSettings() {
    $('#nag-tags-container, #nag-separator-container').toggle(settings.extractMode === 'tags');
}

function togglePanel(panelId) {
    const panel = $(`#nag-panel-${panelId}`);
    const isCollapsed = panel.hasClass('collapsed');
    
    if (isCollapsed) {
        panel.removeClass('collapsed');
        settings.panelCollapsed[panelId] = false;
    } else {
        panel.addClass('collapsed');
        settings.panelCollapsed[panelId] = true;
    }
    
    saveSettings();
}

function createUI() {
    const html = `
    <div id="nag-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📚 小说自动生成器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                
                <!-- 状态面板 (不可折叠) -->
                <div class="nag-section nag-status-panel">
                    <span id="nag-status" class="nag-status-badge stopped">⏹️ 已停止</span>
                    <div class="nag-progress-container">
                        <div class="nag-progress-bar"><div id="nag-progress-fill" class="nag-progress-fill"></div></div>
                        <div id="nag-progress-text">0 / 1000 (0%)</div>
                    </div>
                    <div class="nag-stats-row">
                        <span>⏱️ <span id="nag-time-elapsed">--:--:--</span></span>
                        <span>⏳ <span id="nag-time-remaining">--:--:--</span></span>
                        <span>❌ <span id="nag-stat-errors">0</span></span>
                    </div>
                </div>
                
                <!-- 控制按钮 (不可折叠) -->
                <div class="nag-section nag-controls">
                    <div class="nag-btn-row">
                        <button id="nag-btn-start" class="menu_button">▶️ 开始</button>
                        <button id="nag-btn-pause" class="menu_button" disabled>⏸️ 暂停</button>
                        <button id="nag-btn-resume" class="menu_button" disabled>⏯️ 恢复</button>
                        <button id="nag-btn-stop" class="menu_button" disabled>⏹️ 停止</button>
                    </div>
                    <div class="nag-btn-row"><button id="nag-btn-reset" class="menu_button">🔄 重置</button></div>
                </div>
                
                <!-- 生成设置 (可折叠) -->
                <div id="nag-panel-generate" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="generate">
                        <span class="nag-panel-title">📝 生成设置</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="generate" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-setting-item"><label>目标章节</label><input type="number" id="nag-set-total" min="1"></div>
                        <div class="nag-setting-item"><label>提示词</label><textarea id="nag-set-prompt" rows="2"></textarea></div>
                    </div>
                </div>
                
                <!-- 导出设置 (可折叠) -->
                <div id="nag-panel-export" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="export">
                        <span class="nag-panel-title">📤 导出设置</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="export" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-floor-info">共 <span id="nag-total-floors">${getTotalFloors()}</span> 条 <button id="nag-btn-refresh-floors" class="menu_button_icon">🔄</button></div>
                        <div class="nag-checkbox-group"><label class="nag-checkbox-label"><input type="checkbox" id="nag-set-export-all"><span>📑 导出全部</span></label></div>
                        <div id="nag-floor-inputs" class="nag-setting-row">
                            <div class="nag-setting-item"><label>起始楼层</label><input type="number" id="nag-set-start-floor" min="0"></div>
                            <div class="nag-setting-item"><label>结束楼层</label><input type="number" id="nag-set-end-floor" min="0"></div>
                        </div>
                        <div class="nag-checkbox-group">
                            <label class="nag-checkbox-label"><input type="checkbox" id="nag-set-include-user"><span>👤 用户消息</span></label>
                            <label class="nag-checkbox-label"><input type="checkbox" id="nag-set-include-ai"><span>🤖 AI 回复</span></label>
                            <label class="nag-checkbox-label"><input type="checkbox" id="nag-set-use-raw"><span>📄 原始 (chat.mes)</span></label>
                        </div>
                        <div class="nag-btn-row">
                            <button id="nag-btn-export-txt" class="menu_button">📄 TXT</button>
                            <button id="nag-btn-export-json" class="menu_button">📦 JSON</button>
                        </div>
                    </div>
                </div>
                
                <!-- 标签提取 (可折叠) -->
                <div id="nag-panel-extract" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="extract">
                        <span class="nag-panel-title">🏷️ 标签提取</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="extract" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-setting-item">
                            <label>提取模式</label>
                            <select id="nag-set-extract-mode">
                                <option value="all">全部内容</option>
                                <option value="tags">只提取指定标签</option>
                            </select>
                        </div>
                        <div class="nag-setting-item" id="nag-tags-container">
                            <label>标签名称 <span class="nag-hint">(空格/逗号分隔)</span></label>
                            <textarea id="nag-set-tags" rows="1" placeholder="content detail 正文"></textarea>
                        </div>
                        <div class="nag-setting-item" id="nag-separator-container">
                            <label>分隔符</label>
                            <select id="nag-set-separator">
                                <option value="\\n\\n">空行</option>
                                <option value="\\n">换行</option>
                                <option value="">无</option>
                            </select>
                        </div>
                        <div class="nag-extract-preview">
                            <div class="nag-preview-header">
                                <span>📋 预览</span>
                                <button id="nag-btn-refresh-preview" class="menu_button_icon">🔄</button>
                            </div>
                            <div id="nag-preview-content" class="nag-preview-box"><i>点击刷新</i></div>
                        </div>
                    </div>
                </div>
                
                <!-- 高级设置 (可折叠) -->
                <div id="nag-panel-advanced" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="advanced">
                        <span class="nag-panel-title">⚙️ 高级设置</span>
                        <div class="nag-panel-actions">
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-setting-row">
                            <div class="nag-setting-item"><label>初始等待 (ms)</label><input type="number" id="nag-set-initial-wait"></div>
                            <div class="nag-setting-item"><label>完成等待 (ms)</label><input type="number" id="nag-set-delay"></div>
                        </div>
                        <div class="nag-setting-row">
                            <div class="nag-setting-item"><label>稳定间隔 (ms)</label><input type="number" id="nag-set-stability-interval"></div>
                            <div class="nag-setting-item"><label>稳定次数</label><input type="number" id="nag-set-stability-count"></div>
                        </div>
                        <div class="nag-setting-row">
                            <div class="nag-setting-item"><label>自动保存间隔</label><input type="number" id="nag-set-autosave"></div>
                            <div class="nag-setting-item"><label>最大重试</label><input type="number" id="nag-set-retries"></div>
                        </div>
                        <div class="nag-setting-item"><label>最小章节长度</label><input type="number" id="nag-set-minlen"></div>
                        <div style="margin-top:10px;font-size:11px;opacity:0.5">控制台调试: <code>nagDebug()</code></div>
                    </div>
                </div>
                
            </div>
        </div>
    </div>`;
    
    $('#extensions_settings').append(html);
    bindEvents();
    syncUI();
    applyPanelStates();
}

function applyPanelStates() {
    Object.entries(settings.panelCollapsed).forEach(([panelId, isCollapsed]) => {
        if (isCollapsed) {
            $(`#nag-panel-${panelId}`).addClass('collapsed');
        }
    });
}

function bindEvents() {
    // 控制按钮
    $('#nag-btn-start').on('click', startGeneration);
    $('#nag-btn-pause').on('click', pauseGeneration);
    $('#nag-btn-resume').on('click', resumeGeneration);
    $('#nag-btn-stop').on('click', stopGeneration);
    $('#nag-btn-reset').on('click', resetProgress);
    $('#nag-btn-export-txt').on('click', () => exportNovel(false));
    $('#nag-btn-export-json').on('click', () => exportAsJSON(false));
    $('#nag-btn-refresh-floors').on('click', () => $('#nag-total-floors').text(getTotalFloors()));
    $('#nag-btn-refresh-preview').on('click', refreshPreview);
    
    // 面板折叠
    $('.nag-panel-header').on('click', function(e) {
        // 如果点击的是帮助按钮，不触发折叠
        if ($(e.target).hasClass('nag-help-btn')) return;
        const panelId = $(this).data('panel');
        togglePanel(panelId);
    });
    
    // 帮助按钮
    $('.nag-help-btn').on('click', function(e) {
        e.stopPropagation();
        const topic = $(this).data('help');
        showHelp(topic);
    });
    
    // 设置
    $('#nag-set-export-all').on('change', function() { settings.exportAll = $(this).prop('checked'); updateUI(); saveSettings(); });
    $('#nag-set-start-floor').on('change', function() { settings.exportStartFloor = +$(this).val() || 0; saveSettings(); });
    $('#nag-set-end-floor').on('change', function() { settings.exportEndFloor = +$(this).val() || 99999; saveSettings(); });
    $('#nag-set-include-user').on('change', function() { settings.exportIncludeUser = $(this).prop('checked'); saveSettings(); });
    $('#nag-set-include-ai').on('change', function() { settings.exportIncludeAI = $(this).prop('checked'); saveSettings(); });
    $('#nag-set-use-raw').on('change', function() { settings.useRawContent = $(this).prop('checked'); saveSettings(); refreshPreview(); });
    $('#nag-set-extract-mode').on('change', function() { settings.extractMode = $(this).val(); toggleTagSettings(); saveSettings(); refreshPreview(); });
    $('#nag-set-tags').on('change', function() { settings.extractTags = $(this).val(); saveSettings(); refreshPreview(); });
    $('#nag-set-separator').on('change', function() { settings.tagSeparator = $(this).val().replace(/\\n/g, '\n'); saveSettings(); });
    
    const map = {'#nag-set-total':'totalChapters','#nag-set-prompt':'prompt','#nag-set-initial-wait':'initialWaitTime','#nag-set-delay':'delayAfterGeneration','#nag-set-stability-interval':'stabilityCheckInterval','#nag-set-stability-count':'stabilityRequiredCount','#nag-set-autosave':'autoSaveInterval','#nag-set-retries':'maxRetries','#nag-set-minlen':'minChapterLength'};
    Object.entries(map).forEach(([s,k])=>$(s).on('change',function(){settings[k]=$(this).is('textarea')?$(this).val():+$(this).val();saveSettings();updateUI();}));
}

function syncUI() {
    $('#nag-set-total').val(settings.totalChapters);
    $('#nag-set-prompt').val(settings.prompt);
    $('#nag-set-export-all').prop('checked', settings.exportAll);
    $('#nag-set-start-floor').val(settings.exportStartFloor);
    $('#nag-set-end-floor').val(settings.exportEndFloor);
    $('#nag-set-include-user').prop('checked', settings.exportIncludeUser);
    $('#nag-set-include-ai').prop('checked', settings.exportIncludeAI);
    $('#nag-set-use-raw').prop('checked', settings.useRawContent);
    $('#nag-set-extract-mode').val(settings.extractMode);
    $('#nag-set-tags').val(settings.extractTags);
    $('#nag-set-separator').val(settings.tagSeparator.replace(/\n/g,'\\n'));
    $('#nag-set-initial-wait').val(settings.initialWaitTime);
    $('#nag-set-delay').val(settings.delayAfterGeneration);
    $('#nag-set-stability-interval').val(settings.stabilityCheckInterval);
    $('#nag-set-stability-count').val(settings.stabilityRequiredCount);
    $('#nag-set-autosave').val(settings.autoSaveInterval);
    $('#nag-set-retries').val(settings.maxRetries);
    $('#nag-set-minlen').val(settings.minChapterLength);
    toggleTagSettings();
    updateUI();
}

// ============================================
// 初始化
// ============================================

jQuery(async () => {
    loadSettings();
    createUI();
    setInterval(() => { if (settings.isRunning) updateUI(); }, 1000);
    log('扩展已加载', 'success');
});

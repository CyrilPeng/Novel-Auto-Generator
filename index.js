import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "novel-auto-generator";

const defaultSettings = {
    totalChapters: 1000,
    currentChapter: 0,
    prompt: "继续推进剧情，保证剧情流畅自然，注意人物性格一致性",
    isRunning: false,
    isPaused: false,
    
    // 发送检测设置
    enableSendToastDetection: true,
    sendToastWaitTimeout: 60000,
    sendPostToastWaitTime: 1000,
    
    // 回复等待设置
    replyWaitTime: 5000,
    stabilityCheckInterval: 1000,
    stabilityRequiredCount: 3,
    enableReplyToastDetection: true,
    replyToastWaitTimeout: 300000,
    replyPostToastWaitTime: 2000,
    
    // 生成设置
    autoSaveInterval: 50,
    maxRetries: 3,
    minChapterLength: 100,
    
    // 导出设置
    exportAll: true,
    exportStartFloor: 0,
    exportEndFloor: 99999,
    exportIncludeUser: false,
    exportIncludeAI: true,
    useRawContent: true,
    extractTags: '',
    extractMode: 'all',
    tagSeparator: '\n\n',
    
    panelCollapsed: {
        generate: false,
        export: false,
        extract: true,
        advanced: true,
    },
};

let settings = {};
let abortGeneration = false;
const MAX_ERROR_LOG = 100;
let generationStats = { startTime: null, chaptersGenerated: 0, totalCharacters: 0, errors: [] };

// 安全地添加错误记录
function addGenerationError(chapter, errorMsg) {
    if (generationStats.errors.length >= MAX_ERROR_LOG) {
        generationStats.errors = generationStats.errors.slice(-MAX_ERROR_LOG + 1);
    }
    generationStats.errors.push({ chapter: chapter, error: errorMsg, time: Date.now() });
}

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

function getAIMessageCount() {
    return document.querySelectorAll('#chat .mes[is_user="false"]').length;
}

function getLastAIMessageLength() {
    const msgs = document.querySelectorAll('#chat .mes[is_user="false"]');
    if (!msgs.length) return 0;
    const last = msgs[msgs.length - 1].querySelector('.mes_text');
    return last?.innerText?.trim()?.length || 0;
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
        generate: {
            title: '📝 生成设置说明',
            content: `
<h4>📌 目标章节</h4>
<p>设置要自动生成的章节总数。</p>
<h4>📌 提示词</h4>
<p>每次自动发送给 AI 的消息内容。</p>
            `
        },
        export: {
            title: '📤 导出设置说明',
            content: `
<h4>📌 楼层范围</h4>
<p>楼层从 <b>0</b> 开始计数。</p>
<h4>📌 原始 (chat.mes)</h4>
<ul>
    <li><b>✅ 勾选</b>：读取原始内容</li>
    <li><b>❌ 不勾选</b>：读取显示内容（经过正则处理）</li>
</ul>
            `
        },
        extract: {
            title: '🏷️ 标签提取说明',
            content: `
<h4>📌 什么是标签提取？</h4>
<p>从 AI 回复的原始内容中，只提取指定 XML 标签内的文字。</p>
<h4>📌 使用场景</h4>
<p>当你使用正则美化输出时，原始回复可能包含：</p>
<pre>&lt;思考&gt;AI的思考过程...&lt;/思考&gt;
&lt;content&gt;这是正文内容...&lt;/content&gt;</pre>
<p>使用标签提取可以只导出 &lt;content&gt; 内的正文。</p>
<h4>📌 如何使用</h4>
<ol>
    <li>✅ 勾选「原始 (chat.mes)」</li>
    <li>模式选择「标签」</li>
    <li>填写要提取的标签名</li>
</ol>
<h4>📌 多标签</h4>
<p>用空格、逗号分隔：<code>content detail 正文</code></p>
<h4>📌 调试</h4>
<p>控制台输入 <code>nagDebug()</code></p>
            `
        },
        advanced: {
            title: '⚙️ 高级设置说明',
            content: `
<h4>📤 发送阶段</h4>
<p>消息发送后，可能有其他插件（如剧情推进插件）需要处理消息。</p>
<ul>
    <li><b>弹窗检测</b>：检测到弹窗时等待其消失，确保其他插件处理完成</li>
    <li><b>等待超时</b>：最长等待弹窗消失的时间</li>
    <li><b>额外等待</b>：弹窗消失后再等待的时间</li>
</ul>

<h4>📥 回复阶段</h4>
<p>AI回复完成后，可能有总结插件需要处理内容。</p>
<ul>
    <li><b>回复后等待</b>：AI回复稳定后等待的时间，让总结插件有时间启动</li>
    <li><b>稳定检查间隔</b>：检查内容是否稳定的间隔</li>
    <li><b>稳定次数</b>：内容需要连续多少次不变才算稳定</li>
    <li><b>弹窗检测</b>：检测总结插件的弹窗，等待其完成</li>
</ul>

<h4>🔧 生成控制</h4>
<ul>
    <li><b>自动保存间隔</b>：每生成多少章自动导出一次</li>
    <li><b>最大重试</b>：单章生成失败的最大重试次数</li>
    <li><b>最小长度</b>：AI回复少于此字数视为失败</li>
</ul>
            `
        },
    };
    
    const helpData = helps[topic] || { title: '帮助', content: '<p>暂无帮助内容</p>' };
    
    // 移除已存在的弹窗
    const existingModal = document.getElementById('nag-help-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 创建弹窗容器
    const modalContainer = document.createElement('div');
    modalContainer.className = 'nag-modal-container';
    modalContainer.id = 'nag-help-modal';
    modalContainer.innerHTML = `
        <div class="nag-modal">
            <div class="nag-modal-header">
                <span class="nag-modal-title">${helpData.title}</span>
                <button class="nag-modal-close" type="button">✕</button>
            </div>
            <div class="nag-modal-body">${helpData.content}</div>
        </div>
    `;
    
    // 关闭弹窗函数
    const closeModal = (e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        modalContainer.remove();
        document.removeEventListener('keydown', escHandler, true);
    };
    
    // ESC 关闭 - 使用捕获阶段，优先处理
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            closeModal();
        }
    };
    document.addEventListener('keydown', escHandler, true);
    
    // 关闭按钮点击
    modalContainer.querySelector('.nag-modal-close').addEventListener('click', (e) => {
        closeModal(e);
    }, false);
    
    // 阻止弹窗内部点击冒泡
    modalContainer.querySelector('.nag-modal').addEventListener('click', (e) => {
        e.stopPropagation();
    }, false);
    
    modalContainer.querySelector('.nag-modal').addEventListener('mousedown', (e) => {
        e.stopPropagation();
    }, false);
    
    modalContainer.querySelector('.nag-modal').addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });
    
    // 点击容器背景关闭
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            closeModal(e);
        }
    }, false);
    
    modalContainer.addEventListener('mousedown', (e) => {
        if (e.target === modalContainer) {
            e.stopPropagation();
        }
    }, false);
    
    modalContainer.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });
    
    // 添加到 body 最后，确保在最顶层
    document.body.appendChild(modalContainer);
    
    // 强制重新计算位置（修复某些浏览器的渲染问题）
    requestAnimationFrame(() => {
        modalContainer.style.opacity = '1';
    });
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
            html += `<div class="nag-preview-success"><b>✅ 提取成功</b> (${extracted.length} 字)<div class="nag-preview-text">${escapeHtml(extracted.slice(0, 400))}</div></div>`;
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
// 弹窗检测
// ============================================

function hasActiveToast() {
    const toastContainer = document.querySelector('#toast-container');
    if (toastContainer) {
        const toasts = toastContainer.querySelectorAll('.toast');
        if (toasts.length > 0) return true;
    }
    return false;
}

function getToastText() {
    const toastContainer = document.querySelector('#toast-container');
    if (toastContainer) {
        const toast = toastContainer.querySelector('.toast');
        if (toast) return toast.textContent?.trim().substring(0, 50) || '';
    }
    return '';
}

/**
 * 等待弹窗消失
 * @param {number} timeout - 超时时间
 * @param {number} postWaitTime - 弹窗消失后额外等待时间
 * @param {string} phase - 阶段名称（用于日志）
 */
async function waitForToastsClear(timeout, postWaitTime, phase = '') {
    if (!hasActiveToast()) {
        log(`${phase}无弹窗，跳过等待`, 'debug');
        return;
    }
    
    log(`${phase}检测到弹窗，等待消失...`, 'info');
    const startTime = Date.now();
    let lastLogTime = 0;
    
    while (hasActiveToast()) {
        if (abortGeneration) throw new Error('用户中止');
        
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
            log(`${phase}弹窗等待超时，继续执行`, 'warning');
            return;
        }
        
        if (elapsed - lastLogTime >= 5000) {
            log(`${phase}等待弹窗... (${Math.round(elapsed/1000)}s) ${getToastText()}`, 'debug');
            lastLogTime = elapsed;
        }
        
        await sleep(500);
    }
    
    log(`${phase}弹窗已消失`, 'success');
    
    if (postWaitTime > 0) {
        log(`${phase}额外等待 ${postWaitTime}ms`, 'debug');
        await sleep(postWaitTime);
    }
}

// ============================================
// 核心生成逻辑
// ============================================

/**
 * 发送消息
 */
async function sendMessage(text) {
    const $ta = $('#send_textarea');
    const $btn = $('#send_but');
    
    if (!$ta.length || !$btn.length) {
        throw new Error('找不到输入框或发送按钮');
    }
    
    // 清空并填入文本
    $ta.val(text);
    $ta[0].value = text;
    $ta.trigger('input').trigger('change');
    
    await sleep(100);
    
    // 点击发送
    $btn.trigger('click');
    log('消息已发送', 'success');
    
    // 发送阶段弹窗检测
    if (settings.enableSendToastDetection) {
        await sleep(500); // 短暂等待让弹窗有时间出现
        await waitForToastsClear(
            settings.sendToastWaitTimeout,
            settings.sendPostToastWaitTime,
            '[发送阶段] '
        );
    }
}

/**
 * 获取AI消息数量（双重检测：DOM + chat数组）
 */
function getAIMessageCountRobust() {
    // 方法1: DOM 查询
    const domCount = document.querySelectorAll('#chat .mes[is_user="false"]').length;

    // 方法2: chat 数组查询
    let chatCount = 0;
    const stChat = getSTChat();
    if (stChat) {
        chatCount = stChat.filter(msg => msg && !msg.is_user && !msg.is_human).length;
    }

    // 返回较大的值，确保能检测到新消息
    return Math.max(domCount, chatCount);
}

/**
 * 等待AI回复完成
 */
async function waitForAIResponse(prevCount) {
    // 阶段1：等待AI消息数量增加（带超时）
    log('等待AI开始回复...', 'debug');
    const waitStartTime = Date.now();
    const maxWaitForStart = 120000; // 最多等待2分钟让AI开始回复

    while (getAIMessageCountRobust() <= prevCount) {
        if (abortGeneration) throw new Error('用户中止');

        const elapsed = Date.now() - waitStartTime;
        if (elapsed > maxWaitForStart) {
            log(`等待AI开始回复超时 (${Math.round(elapsed/1000)}s)，可能AI已回复但未检测到`, 'warning');
            // 尝试用 chat 数组再检查一次
            const stChat = getSTChat();
            if (stChat && stChat.length > prevCount) {
                log('通过 chat 数组检测到新消息，继续处理', 'info');
                break;
            }
            throw new Error('等待AI开始回复超时');
        }

        // 每10秒输出一次等待日志
        if (elapsed > 0 && elapsed % 10000 < 500) {
            log(`仍在等待AI开始回复... (${Math.round(elapsed/1000)}s)`, 'debug');
        }

        await sleep(500);
    }
    log('检测到新的AI回复', 'success');
    
    // 阶段2：等待内容稳定（长度不再变化）
    log('等待AI回复完成...', 'debug');
    let lastLength = 0;
    let stableCount = 0;
    
    while (stableCount < settings.stabilityRequiredCount) {
        if (abortGeneration) throw new Error('用户中止');
        
        await sleep(settings.stabilityCheckInterval);
        
        const currentLength = getLastAIMessageLength();
        if (currentLength === lastLength && currentLength > 0) {
            stableCount++;
        } else {
            stableCount = 0;
            lastLength = currentLength;
        }
    }
    log(`AI回复已稳定 (${lastLength} 字)`, 'success');
    
    // 阶段3：固定等待时间
    if (settings.replyWaitTime > 0) {
        log(`等待 ${settings.replyWaitTime}ms...`, 'debug');
        await sleep(settings.replyWaitTime);
    }
    
    // 阶段4：回复阶段弹窗检测
    if (settings.enableReplyToastDetection) {
        await waitForToastsClear(
            settings.replyToastWaitTimeout,
            settings.replyPostToastWaitTime,
            '[回复阶段] '
        );
    }
    
    // 阶段5：再次稳定性检查（确保总结注入完成）
    log('最终稳定性检查...', 'debug');
    lastLength = 0;
    stableCount = 0;
    
    while (stableCount < settings.stabilityRequiredCount) {
        if (abortGeneration) throw new Error('用户中止');
        
        await sleep(settings.stabilityCheckInterval);
        
        const currentLength = getLastAIMessageLength();
        if (currentLength === lastLength && currentLength > 0) {
            stableCount++;
        } else {
            stableCount = 0;
            lastLength = currentLength;
        }
    }
    
    log('回复处理完成', 'success');
    return lastLength;
}

/**
 * 生成单章
 */
async function generateSingleChapter(num) {
    const prevCount = getAIMessageCountRobust();
    
    // 发送消息
    await sendMessage(settings.prompt);
    
    // 等待回复完成
    const length = await waitForAIResponse(prevCount);
    
    // 检查长度
    if (length < settings.minChapterLength) {
        throw new Error(`响应过短 (${length} 字)`);
    }
    
    generationStats.chaptersGenerated++;
    generationStats.totalCharacters += length;
    log(`第 ${num} 章完成 (${length} 字)`, 'success');
    
    return length;
}

/**
 * 开始生成
 */
async function startGeneration() {
    if (settings.isRunning) { 
        toastr.warning('已在运行'); 
        return; 
    }
    
    settings.isRunning = true; 
    settings.isPaused = false; 
    abortGeneration = false;
    generationStats = { startTime: Date.now(), chaptersGenerated: 0, totalCharacters: 0, errors: [] };
    saveSettings(); 
    updateUI();
    toastr.info(`开始生成 ${settings.totalChapters - settings.currentChapter} 章`);
    
    try {
        for (let i = settings.currentChapter; i < settings.totalChapters; i++) {
            if (abortGeneration) {
                log('检测到停止信号', 'info');
                break;
            }
            
            while (settings.isPaused && !abortGeneration) {
                await sleep(500);
            }
            
            if (abortGeneration) break;
            
            let success = false;
            let retries = 0;
            
            while (!success && retries < settings.maxRetries && !abortGeneration) {
                try {
                    await generateSingleChapter(i + 1);
                    success = true;
                    settings.currentChapter = i + 1;
                    saveSettings(); 
                    updateUI();
                } catch(e) {
                    if (abortGeneration || e.message === '用户中止') break;
                    
                    retries++;
                    log(`第 ${i+1} 章失败: ${e.message}`, 'error');
                    addGenerationError(i + 1, e.message);
                    
                    if (retries < settings.maxRetries) {
                        log(`等待5秒后重试...`, 'info');
                        await sleep(5000);
                    }
                }
            }
            
            if (abortGeneration) break;
            if (!success) settings.currentChapter = i + 1;
            
            if (settings.currentChapter % settings.autoSaveInterval === 0) {
                await exportNovel(true);
            }
        }
        
        if (!abortGeneration) { 
            toastr.success('生成完成!'); 
            await exportNovel(false); 
        }
    } finally {
        settings.isRunning = false; 
        settings.isPaused = false;
        saveSettings(); 
        updateUI();
    }
}

function pauseGeneration() { 
    settings.isPaused = true; 
    updateUI(); 
    toastr.info('已暂停'); 
}

function resumeGeneration() { 
    settings.isPaused = false; 
    updateUI(); 
    toastr.info('已恢复'); 
}

function stopGeneration() { 
    abortGeneration = true; 
    settings.isRunning = false; 
    updateUI(); 
    toastr.warning('已停止'); 
}

function resetProgress() {
    if (settings.isRunning) { 
        toastr.warning('请先停止'); 
        return; 
    }
    settings.currentChapter = 0;
    generationStats = { startTime: null, chaptersGenerated: 0, totalCharacters: 0, errors: [] };
    saveSettings(); 
    updateUI(); 
    toastr.info('已重置');
}

// ============================================
// 导出
// ============================================

function downloadFile(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
}

async function exportNovel(silent = false) {
    const chapters = getAllChapters();
    if (!chapters.length) { 
        if (!silent) toastr.warning('没有内容'); 
        return; 
    }
    
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
    if (!chapters.length) { 
        if (!silent) toastr.warning('没有内容'); 
        return; 
    }
    downloadFile(JSON.stringify({ time: new Date().toISOString(), chapters }, null, 2), `novel_${Date.now()}.json`, 'application/json');
    if (!silent) toastr.success('已导出 JSON');
}

// ============================================
// 设置 & UI
// ============================================

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);
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
    
    const [txt, cls] = settings.isRunning 
        ? (settings.isPaused ? ['⏸️ 已暂停', 'paused'] : ['▶️ 运行中', 'running']) 
        : ['⏹️ 已停止', 'stopped'];
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
    
    // 发送阶段弹窗设置
    $('#nag-send-toast-settings').toggleClass('disabled', !settings.enableSendToastDetection);
    $('#nag-set-send-toast-timeout, #nag-set-send-post-toast-wait').prop('disabled', !settings.enableSendToastDetection);
    
    // 回复阶段弹窗设置
    $('#nag-reply-toast-settings').toggleClass('disabled', !settings.enableReplyToastDetection);
    $('#nag-set-reply-toast-timeout, #nag-set-reply-post-toast-wait').prop('disabled', !settings.enableReplyToastDetection);
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
                
                <div class="nag-section nag-controls">
                    <div class="nag-btn-row">
                        <button id="nag-btn-start" class="menu_button">▶️ 开始</button>
                        <button id="nag-btn-pause" class="menu_button" disabled>⏸️ 暂停</button>
                        <button id="nag-btn-resume" class="menu_button" disabled>⏯️ 恢复</button>
                        <button id="nag-btn-stop" class="menu_button" disabled>⏹️ 停止</button>
                    </div>
                    <div class="nag-btn-row"><button id="nag-btn-reset" class="menu_button">🔄 重置</button></div>
                </div>

                <!-- 📝 生成设置模块 -->
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

                <!-- 📤 导出设置模块 -->
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

                <!-- 🏷️ 标签提取模块 -->
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

                <!-- ⚙️ 高级设置模块 -->
                <div id="nag-panel-advanced" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="advanced">
                        <span class="nag-panel-title">⚙️ 高级设置</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="advanced" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        
                        <!-- 发送阶段模块 -->
                        <div class="nag-module nag-module-send">
                            <div class="nag-module-header">
                                <span class="nag-module-icon">📤</span>
                                <span class="nag-module-title">发送阶段</span>
                            </div>
                            <div class="nag-module-body">
                                <div class="nag-module-desc">消息发送后，等待剧情推进等插件处理完成</div>
                                <div class="nag-checkbox-group">
                                    <label class="nag-checkbox-label">
                                        <input type="checkbox" id="nag-set-send-toast-detection">
                                        <span>💬 启用弹窗检测</span>
                                    </label>
                                </div>
                                <div id="nag-send-toast-settings">
                                    <div class="nag-setting-row">
                                        <div class="nag-setting-item">
                                            <label>等待超时 (ms)</label>
                                            <input type="number" id="nag-set-send-toast-timeout" min="5000" step="5000">
                                        </div>
                                        <div class="nag-setting-item">
                                            <label>额外等待 (ms)</label>
                                            <input type="number" id="nag-set-send-post-toast-wait" min="0" step="500">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 回复阶段模块 -->
                        <div class="nag-module nag-module-reply">
                            <div class="nag-module-header">
                                <span class="nag-module-icon">📥</span>
                                <span class="nag-module-title">回复阶段</span>
                            </div>
                            <div class="nag-module-body">
                                <div class="nag-module-desc">AI回复完成后，等待总结等插件处理完成</div>
                                <div class="nag-setting-row">
                                    <div class="nag-setting-item">
                                        <label>回复后等待 (ms)</label>
                                        <input type="number" id="nag-set-reply-wait" min="0" step="1000">
                                    </div>
                                    <div class="nag-setting-item">
                                        <label>稳定检查间隔 (ms)</label>
                                        <input type="number" id="nag-set-stability-interval" min="500" step="500">
                                    </div>
                                </div>
                                <div class="nag-setting-item">
                                    <label>稳定次数</label>
                                    <input type="number" id="nag-set-stability-count" min="1" style="width: 100px;">
                                </div>
                                <div class="nag-checkbox-group">
                                    <label class="nag-checkbox-label">
                                        <input type="checkbox" id="nag-set-reply-toast-detection">
                                        <span>💬 启用弹窗检测</span>
                                    </label>
                                </div>
                                <div id="nag-reply-toast-settings">
                                    <div class="nag-setting-row">
                                        <div class="nag-setting-item">
                                            <label>等待超时 (ms)</label>
                                            <input type="number" id="nag-set-reply-toast-timeout" min="10000" step="10000">
                                        </div>
                                        <div class="nag-setting-item">
                                            <label>额外等待 (ms)</label>
                                            <input type="number" id="nag-set-reply-post-toast-wait" min="0" step="500">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 生成控制模块 -->
                        <div class="nag-module nag-module-control">
                            <div class="nag-module-header">
                                <span class="nag-module-icon">🔧</span>
                                <span class="nag-module-title">生成控制</span>
                            </div>
                            <div class="nag-module-body">
                                <div class="nag-module-desc">控制自动生成的行为参数</div>
                                <div class="nag-setting-row">
                                    <div class="nag-setting-item">
                                        <label>自动保存间隔</label>
                                        <input type="number" id="nag-set-autosave" min="1">
                                    </div>
                                    <div class="nag-setting-item">
                                        <label>最大重试</label>
                                        <input type="number" id="nag-set-retries" min="1">
                                    </div>
                                </div>
                                <div class="nag-setting-item">
                                    <label>最小章节长度</label>
                                    <input type="number" id="nag-set-minlen" min="0" style="width: 100px;">
                                </div>
                            </div>
                        </div>
                        
                        <div class="nag-debug-hint">控制台调试: <code>nagDebug()</code></div>
                    </div>
                </div>

                <!-- 📚 TXT转世界书模块 -->
                <div class="nag-section">
                    <div class="nag-btn-row">
                        <button id="nag-btn-txt-to-worldbook" class="menu_button" style="background: linear-gradient(135deg, #e67e22, #d35400);">
                            📚 TXT转世界书
                        </button>
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
    $('#nag-btn-start').on('click', startGeneration);
    $('#nag-btn-pause').on('click', pauseGeneration);
    $('#nag-btn-resume').on('click', resumeGeneration);
    $('#nag-btn-stop').on('click', stopGeneration);
    $('#nag-btn-reset').on('click', resetProgress);
    $('#nag-btn-export-txt').on('click', () => exportNovel(false));
    $('#nag-btn-export-json').on('click', () => exportAsJSON(false));
    $('#nag-btn-refresh-floors').on('click', () => $('#nag-total-floors').text(getTotalFloors()));
    $('#nag-btn-refresh-preview').on('click', refreshPreview);
    // TXT 转世界书入口 - 自动加载模块
    $('#nag-btn-txt-to-worldbook').on('click', async () => {
        try {
            if (typeof window.WorldinfoModule === 'undefined') {
                // 使用绝对路径导入（相对于 SillyTavern 根目录）
                const basePath = window.location.origin + '/scripts/extensions/third-party/Novel-Auto-Generator/';
                const m = await import(basePath + 'Worldinfo/main.js?t=' + Date.now());
                window.WorldinfoModule = {
                    init: m.initWorldinfo,
                    open: m.openWorldinfo
                };
            }
            await window.WorldinfoModule.init();
            window.WorldinfoModule.open();
        } catch (e) {
            console.error('[Worldinfo] 打开失败:', e);
            toastr.error('打开失败：' + e.message);
        }
    });

    // 面板折叠 - 排除帮助按钮
    $('.nag-panel-header').on('click', function(e) {
        // 如果点击的是帮助按钮区域，不处理折叠
        if ($(e.target).closest('.nag-help-btn').length > 0) {
            return;
        }
        const panelId = $(this).data('panel');
        togglePanel(panelId);
    });
    
    // 帮助按钮 - 使用原生事件绑定
    document.querySelectorAll('.nag-help-btn').forEach(btn => {
        const topic = btn.getAttribute('data-help');
        
        // 阻止事件冒泡（不使用 preventDefault，否则会阻止 click）
        btn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        }, false);
        
        btn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true }); // passive: true 表示不会调用 preventDefault
        
        btn.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: true });
        
        // 点击打开帮助
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showHelp(topic);
        }, false);
    });
    
    // 导出设置
    $('#nag-set-export-all').on('change', function() { 
        settings.exportAll = $(this).prop('checked'); 
        updateUI(); 
        saveSettings(); 
    });
    $('#nag-set-start-floor').on('change', function() { 
        settings.exportStartFloor = +$(this).val() || 0; 
        saveSettings(); 
    });
    $('#nag-set-end-floor').on('change', function() { 
        settings.exportEndFloor = +$(this).val() || 99999; 
        saveSettings(); 
    });
    $('#nag-set-include-user').on('change', function() { 
        settings.exportIncludeUser = $(this).prop('checked'); 
        saveSettings(); 
    });
    $('#nag-set-include-ai').on('change', function() { 
        settings.exportIncludeAI = $(this).prop('checked'); 
        saveSettings(); 
    });
    $('#nag-set-use-raw').on('change', function() { 
        settings.useRawContent = $(this).prop('checked'); 
        saveSettings(); 
        refreshPreview(); 
    });
    
    // 标签提取
    $('#nag-set-extract-mode').on('change', function() { 
        settings.extractMode = $(this).val(); 
        toggleTagSettings(); 
        saveSettings(); 
        refreshPreview(); 
    });
    $('#nag-set-tags').on('change', function() { 
        settings.extractTags = $(this).val(); 
        saveSettings(); 
        refreshPreview(); 
    });
    $('#nag-set-separator').on('change', function() { 
        settings.tagSeparator = $(this).val().replace(/\\n/g, '\n'); 
        saveSettings(); 
    });
    
    // 发送阶段弹窗检测
    $('#nag-set-send-toast-detection').on('change', function() { 
        settings.enableSendToastDetection = $(this).prop('checked'); 
        updateUI();
        saveSettings(); 
    });
    $('#nag-set-send-toast-timeout').on('change', function() { 
        settings.sendToastWaitTimeout = +$(this).val() || 60000; 
        saveSettings(); 
    });
    $('#nag-set-send-post-toast-wait').on('change', function() { 
        settings.sendPostToastWaitTime = +$(this).val() || 1000; 
        saveSettings(); 
    });
    
    // 回复阶段设置
    $('#nag-set-reply-wait').on('change', function() { 
        settings.replyWaitTime = +$(this).val() || 5000; 
        saveSettings(); 
    });
    $('#nag-set-stability-interval').on('change', function() { 
        settings.stabilityCheckInterval = +$(this).val() || 1000; 
        saveSettings(); 
    });
    $('#nag-set-stability-count').on('change', function() { 
        settings.stabilityRequiredCount = +$(this).val() || 3; 
        saveSettings(); 
    });
    $('#nag-set-reply-toast-detection').on('change', function() { 
        settings.enableReplyToastDetection = $(this).prop('checked'); 
        updateUI();
        saveSettings(); 
    });
    $('#nag-set-reply-toast-timeout').on('change', function() { 
        settings.replyToastWaitTimeout = +$(this).val() || 300000; 
        saveSettings(); 
    });
    $('#nag-set-reply-post-toast-wait').on('change', function() { 
        settings.replyPostToastWaitTime = +$(this).val() || 2000; 
        saveSettings(); 
    });
    
    // 生成控制
    $('#nag-set-total').on('change', function() { 
        settings.totalChapters = +$(this).val() || 1000; 
        saveSettings(); 
        updateUI(); 
    });
    $('#nag-set-prompt').on('change', function() { 
        settings.prompt = $(this).val(); 
        saveSettings(); 
    });
    $('#nag-set-autosave').on('change', function() { 
        settings.autoSaveInterval = +$(this).val() || 50; 
        saveSettings(); 
    });
    $('#nag-set-retries').on('change', function() { 
        settings.maxRetries = +$(this).val() || 3; 
        saveSettings(); 
    });
    $('#nag-set-minlen').on('change', function() { 
        settings.minChapterLength = +$(this).val() || 100; 
        saveSettings(); 
    });
}

function syncUI() {
    // 生成设置
    $('#nag-set-total').val(settings.totalChapters);
    $('#nag-set-prompt').val(settings.prompt);
    
    // 导出设置
    $('#nag-set-export-all').prop('checked', settings.exportAll);
    $('#nag-set-start-floor').val(settings.exportStartFloor);
    $('#nag-set-end-floor').val(settings.exportEndFloor);
    $('#nag-set-include-user').prop('checked', settings.exportIncludeUser);
    $('#nag-set-include-ai').prop('checked', settings.exportIncludeAI);
    $('#nag-set-use-raw').prop('checked', settings.useRawContent);
    
    // 标签提取
    $('#nag-set-extract-mode').val(settings.extractMode);
    $('#nag-set-tags').val(settings.extractTags);
    $('#nag-set-separator').val(settings.tagSeparator.replace(/\n/g, '\\n'));
    
    // 发送阶段弹窗检测
    $('#nag-set-send-toast-detection').prop('checked', settings.enableSendToastDetection);
    $('#nag-set-send-toast-timeout').val(settings.sendToastWaitTimeout);
    $('#nag-set-send-post-toast-wait').val(settings.sendPostToastWaitTime);
    
    // 回复阶段设置
    $('#nag-set-reply-wait').val(settings.replyWaitTime);
    $('#nag-set-stability-interval').val(settings.stabilityCheckInterval);
    $('#nag-set-stability-count').val(settings.stabilityRequiredCount);
    $('#nag-set-reply-toast-detection').prop('checked', settings.enableReplyToastDetection);
    $('#nag-set-reply-toast-timeout').val(settings.replyToastWaitTimeout);
    $('#nag-set-reply-post-toast-wait').val(settings.replyPostToastWaitTime);
    
    // 生成控制
    $('#nag-set-autosave').val(settings.autoSaveInterval);
    $('#nag-set-retries').val(settings.maxRetries);
    $('#nag-set-minlen').val(settings.minChapterLength);
    
    toggleTagSettings();
    updateUI();
}

// ============================================
// 初始化
// ============================================

// 保存扩展脚本的基础路径供 Worldinfo 模块使用
const __extensionBasePath = (() => {
    try {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('Novel-Auto-Generator')) {
                return script.src.substring(0, script.src.lastIndexOf('/') + 1);
            }
        }
    } catch (e) {}
    // 回退到默认路径（相对于 SillyTavern 根目录）
    const base = window.location.origin + '/scripts/extensions/third-party/Novel-Auto-Generator/';
    return base;
})();

jQuery(async () => {
    loadSettings();
    createUI();
    setInterval(() => { if (settings.isRunning) updateUI(); }, 1000);
    log('扩展已加载', 'success');
});

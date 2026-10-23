import { createNovelRecoveryStore } from './recoveryStore.js';
import { createNovelRunner } from './generation.js';
import { parseTagInput, extractTagContents, removeTagContents, applyTagFilters } from './tagFilters.js';
import { defaultSettings } from './defaultSettings.js';
import { getHelpContent } from './helpContent.js';
import { createPanelHtml } from './panelTemplate.js';

let instance = null;
export function initNovelUI(host) {
    if (instance) return instance;
    let refreshTimer;
    let disposed = false;
    let cleanupHelp = null;
    const extensionName = 'novel-auto-generator';

    let settings = {};
    let generationStats = { startTime: null, chaptersGenerated: 0, totalCharacters: 0, errors: [] };

    // ============================================
    // 工具函数
    // ============================================

    function log(msg, type = 'info') {
        const p = { info: '📘', success: '✅', warning: '⚠️', error: '❌', debug: '🔍' }[type] || 'ℹ️';
        console.log(`[NovelGen] ${p} ${msg}`);
    }

    function formatDuration(ms) {
        if (!ms || ms < 0) return '--:--:--';
        const s = Math.floor(ms / 1000) % 60,
            m = Math.floor(ms / 60000) % 60,
            h = Math.floor(ms / 3600000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    // ============================================
    // SillyTavern 数据访问
    // ============================================

    const getSTChat = () => host.getChat();

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

    // ============================================
    // 章节获取
    // ============================================

    function getAllChapters() {
        const extractTags = parseTagInput(settings.extractTags);
        const excludeTags = parseTagInput(settings.excludeTags);
        const useTagExtract = settings.extractMode === 'tags' && extractTags.length > 0;
        const useTagFilters = useTagExtract || excludeTags.length > 0;
        const chapters = [];

        const startFloor = settings.exportAll ? 0 : settings.exportStartFloor;
        const endFloor = settings.exportAll ? getMaxFloorIndex() : settings.exportEndFloor;

        if (settings.useRawContent) {
            const rawMessages = getRawMessages(startFloor, endFloor, {
                includeUser: settings.exportIncludeUser,
                includeAI: settings.exportIncludeAI,
            });

            if (rawMessages?.length) {
                for (const msg of rawMessages) {
                    const content = useTagFilters
                        ? applyTagFilters(msg.content, {
                              extractTags,
                              excludeTags,
                              extractMode: settings.extractMode,
                              separator: settings.tagSeparator,
                          })
                        : msg.content;
                    if (!content && useTagFilters) continue;
                    if (content?.length > 10) {
                        chapters.push({
                            floor: msg.floor,
                            index: chapters.length + 1,
                            isUser: msg.isUser,
                            name: msg.name,
                            content,
                        });
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
            const content = useTagFilters
                ? applyTagFilters(text, {
                      extractTags,
                      excludeTags,
                      extractMode: settings.extractMode,
                      separator: settings.tagSeparator,
                  })
                : text;
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
        const helpData = getHelpContent(topic);

        cleanupHelp?.();
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
        cleanupHelp = () => closeModal();
        document.addEventListener('keydown', escHandler, true);

        // 关闭按钮点击
        modalContainer.querySelector('.nag-modal-close').addEventListener(
            'click',
            (e) => {
                closeModal(e);
            },
            false,
        );

        // 阻止弹窗内部点击冒泡
        modalContainer.querySelector('.nag-modal').addEventListener(
            'click',
            (e) => {
                e.stopPropagation();
            },
            false,
        );

        modalContainer.querySelector('.nag-modal').addEventListener(
            'mousedown',
            (e) => {
                e.stopPropagation();
            },
            false,
        );

        modalContainer.querySelector('.nag-modal').addEventListener(
            'touchstart',
            (e) => {
                e.stopPropagation();
            },
            { passive: true },
        );

        // 点击容器背景关闭
        modalContainer.addEventListener(
            'click',
            (e) => {
                if (e.target === modalContainer) {
                    closeModal(e);
                }
            },
            false,
        );

        modalContainer.addEventListener(
            'mousedown',
            (e) => {
                if (e.target === modalContainer) {
                    e.stopPropagation();
                }
            },
            false,
        );

        modalContainer.addEventListener(
            'touchstart',
            (e) => {
                e.stopPropagation();
            },
            { passive: true },
        );

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
        const extractTags = parseTagInput(settings.extractTags);
        const excludeTags = parseTagInput(settings.excludeTags);
        const useTagExtract = settings.extractMode === 'tags' && extractTags.length > 0;
        const useTagExclude = excludeTags.length > 0;

        if (!stChat || stChat.length === 0) {
            $('#nag-preview-content').html(`<div class="nag-preview-warning"><b>⚠️ 无法获取聊天数据</b></div>`);
            return;
        }

        let rawContent = '',
            floor = -1;
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

        if (useTagExtract || useTagExclude) {
            let previewText = rawContent;
            if (useTagExtract) {
                previewText = extractTagContents(rawContent, extractTags, settings.tagSeparator);
                if (!previewText) {
                    html += `<div class="nag-preview-warning"><b>⚠️ 未找到标签</b> [${extractTags.join(', ')}]</div>`;
                    $('#nag-preview-content').html(html);
                    return;
                }
            }

            if (useTagExclude) {
                previewText = removeTagContents(previewText, excludeTags);
            } else {
                previewText = previewText.trim();
            }

            if (previewText) {
                const actions = [];
                if (useTagExtract) actions.push(`提取标签 [${extractTags.join(', ')}]`);
                if (useTagExclude) actions.push(`移除标签 [${excludeTags.join(', ')}]`);
                html += `<div class="nag-preview-success"><b>✅ ${actions.join(' + ')}</b> (${previewText.length} 字)<div class="nag-preview-text">${escapeHtml(previewText.slice(0, 400))}</div></div>`;
            } else {
                html += `<div class="nag-preview-warning"><b>⚠️ 移除标签后没有可预览内容</b></div>`;
            }
        } else {
            html += `<div class="nag-preview-info"><b>📄 全部内容模式</b></div>`;
        }

        $('#nag-preview-content').html(html);
    }

    function debugRawContent(floorIndex) {
        const stChat = getSTChat();
        if (!stChat) {
            console.log('❌ 无法获取 chat');
            return;
        }

        console.log(`✅ chat 获取成功，共 ${stChat.length} 条`);

        if (floorIndex === undefined) {
            for (let i = stChat.length - 1; i >= 0; i--) {
                if (stChat[i] && !stChat[i].is_user) {
                    floorIndex = i;
                    break;
                }
            }
        }

        const msg = stChat[floorIndex];
        if (!msg) {
            console.log(`楼层 ${floorIndex} 不存在`);
            return;
        }

        console.log(`\n----- 楼层 ${floorIndex} -----`);
        console.log('mes:', msg.mes?.substring(0, 500));

        const extractTags = parseTagInput(settings.extractTags);
        const excludeTags = parseTagInput(settings.excludeTags);
        if (extractTags.length > 0 || excludeTags.length > 0) {
            console.log(`\n----- 标签处理 -----`);
            if (extractTags.length > 0) {
                console.log(`提取标签: [${extractTags.join(', ')}]`);
                console.log('提取结果:', extractTagContents(msg.mes, extractTags, '\n---\n') || '(无匹配)');
            }
            if (excludeTags.length > 0) {
                console.log(`移除标签: [${excludeTags.join(', ')}]`);
                console.log('移除结果:', removeTagContents(msg.mes, excludeTags) || '(移除后为空)');
            }
            console.log(
                '最终结果:',
                applyTagFilters(msg.mes, {
                    extractTags,
                    excludeTags,
                    extractMode: settings.extractMode,
                    separator: settings.tagSeparator,
                }) || '(无结果)',
            );
        }
    }

    window.nagDebug = debugRawContent;

    // ============================================
    // 弹窗检测
    // ============================================

    const novelRunner = createNovelRunner({
        recovery: createNovelRecoveryStore(() => localStorage),
        getSettings: () => settings,
        snapshot: host.snapshot,
        send: host.send,
        onChange: () => {
            saveSettings();
            updateUI();
        },
        notify: (type, message) => toastr[type](message),
        exportNovel: (...args) => exportNovel(...args),
        onStats: (stats) => {
            generationStats = stats;
        },
    });

    function startGeneration() {
        return novelRunner.start();
    }
    function pauseGeneration() {
        novelRunner.pause();
        toastr.info('当前章节结束后暂停');
    }
    function resumeGeneration() {
        novelRunner.resume();
        toastr.info('已恢复');
    }
    function stopGeneration() {
        novelRunner.stop();
        toastr.warning('已停止自动续写；酒馆正在生成的回复可能仍会完成');
    }

    function resetProgress() {
        if (settings.isRunning) {
            toastr.warning('请先停止');
            return;
        }
        novelRunner.resetPending();
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
        chapters.forEach((ch) => {
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
        downloadFile(
            JSON.stringify({ time: new Date().toISOString(), chapters }, null, 2),
            `novel_${Date.now()}.json`,
            'application/json',
        );
        if (!silent) toastr.success('已导出 JSON');
    }

    // ============================================
    // 设置 & UI
    // ============================================

    function loadSettings() {
        settings = Object.assign({}, defaultSettings, host.readSettings(extensionName));
        settings.panelCollapsed = Object.assign({}, defaultSettings.panelCollapsed, settings.panelCollapsed || {});
        settings.isRunning = false;
        settings.isPaused = false;
    }

    function saveSettings() {
        host.writeSettings(extensionName, settings);
    }

    function updateUI() {
        const pct =
            settings.totalChapters > 0 ? ((settings.currentChapter / settings.totalChapters) * 100).toFixed(1) : 0;
        $('#nag-progress-fill').css('width', `${pct}%`);
        $('#nag-progress-text').text(`${settings.currentChapter} / ${settings.totalChapters} (${pct}%)`);

        const [txt, cls] = settings.isRunning
            ? settings.isPaused
                ? ['⏸️ 已暂停', 'paused']
                : ['▶️ 运行中', 'running']
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
        $('#nag-set-send-toast-timeout, #nag-set-send-post-toast-wait').prop(
            'disabled',
            !settings.enableSendToastDetection,
        );

        // 回复阶段弹窗设置
        $('#nag-reply-toast-settings').toggleClass('disabled', !settings.enableReplyToastDetection);
        $('#nag-set-reply-toast-timeout, #nag-set-reply-post-toast-wait').prop(
            'disabled',
            !settings.enableReplyToastDetection,
        );
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
        $('#extensions_settings').append(createPanelHtml(getTotalFloors()));
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
        // TXT转世界书入口
        $('#nag-btn-txt-to-worldbook').on('click', () => {
            if (typeof window.TxtToWorldbook !== 'undefined') {
                window.TxtToWorldbook.open();
            } else {
                toastr.error('TXT转世界书模块未加载');
            }
        });

        // 面板折叠 - 排除帮助按钮
        $('.nag-panel-header').on('click', function (e) {
            // 如果点击的是帮助按钮区域，不处理折叠
            if ($(e.target).closest('.nag-help-btn').length > 0) {
                return;
            }
            const panelId = $(this).data('panel');
            togglePanel(panelId);
        });

        // 帮助按钮 - 使用原生事件绑定
        document.querySelectorAll('.nag-help-btn').forEach((btn) => {
            const topic = btn.getAttribute('data-help');

            // 阻止事件冒泡（不使用 preventDefault，否则会阻止 click）
            btn.addEventListener(
                'mousedown',
                (e) => {
                    e.stopPropagation();
                },
                false,
            );

            btn.addEventListener(
                'touchstart',
                (e) => {
                    e.stopPropagation();
                },
                { passive: true },
            ); // passive: true 表示不会调用 preventDefault

            btn.addEventListener(
                'touchend',
                (e) => {
                    e.stopPropagation();
                },
                { passive: true },
            );

            // 点击打开帮助
            btn.addEventListener(
                'click',
                (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    showHelp(topic);
                },
                false,
            );
        });

        // 导出设置
        $('#nag-set-export-all').on('change', function () {
            settings.exportAll = $(this).prop('checked');
            updateUI();
            saveSettings();
        });
        $('#nag-set-start-floor').on('change', function () {
            settings.exportStartFloor = +$(this).val() || 0;
            saveSettings();
        });
        $('#nag-set-end-floor').on('change', function () {
            settings.exportEndFloor = +$(this).val() || 99999;
            saveSettings();
        });
        $('#nag-set-include-user').on('change', function () {
            settings.exportIncludeUser = $(this).prop('checked');
            saveSettings();
        });
        $('#nag-set-include-ai').on('change', function () {
            settings.exportIncludeAI = $(this).prop('checked');
            saveSettings();
        });
        $('#nag-set-use-raw').on('change', function () {
            settings.useRawContent = $(this).prop('checked');
            saveSettings();
            refreshPreview();
        });

        // 标签提取
        $('#nag-set-extract-mode').on('change', function () {
            settings.extractMode = $(this).val();
            toggleTagSettings();
            saveSettings();
            refreshPreview();
        });
        $('#nag-set-tags').on('change', function () {
            settings.extractTags = $(this).val();
            saveSettings();
            refreshPreview();
        });
        $('#nag-set-exclude-tags').on('change', function () {
            settings.excludeTags = $(this).val();
            saveSettings();
            refreshPreview();
        });
        $('#nag-set-separator').on('change', function () {
            settings.tagSeparator = $(this).val().replace(/\\n/g, '\n');
            saveSettings();
            refreshPreview();
        });

        // 发送阶段弹窗检测
        $('#nag-set-send-toast-detection').on('change', function () {
            settings.enableSendToastDetection = $(this).prop('checked');
            updateUI();
            saveSettings();
        });
        $('#nag-set-send-toast-timeout').on('change', function () {
            settings.sendToastWaitTimeout = +$(this).val() || 60000;
            saveSettings();
        });
        $('#nag-set-send-post-toast-wait').on('change', function () {
            settings.sendPostToastWaitTime = +$(this).val() || 1000;
            saveSettings();
        });

        // 回复阶段设置
        $('#nag-set-reply-wait').on('change', function () {
            settings.replyWaitTime = +$(this).val() || 5000;
            saveSettings();
        });
        $('#nag-set-stability-interval').on('change', function () {
            settings.stabilityCheckInterval = +$(this).val() || 1000;
            saveSettings();
        });
        $('#nag-set-stability-count').on('change', function () {
            settings.stabilityRequiredCount = +$(this).val() || 3;
            saveSettings();
        });
        $('#nag-set-reply-toast-detection').on('change', function () {
            settings.enableReplyToastDetection = $(this).prop('checked');
            updateUI();
            saveSettings();
        });
        $('#nag-set-reply-toast-timeout').on('change', function () {
            settings.replyToastWaitTimeout = +$(this).val() || 300000;
            saveSettings();
        });
        $('#nag-set-reply-post-toast-wait').on('change', function () {
            settings.replyPostToastWaitTime = +$(this).val() || 2000;
            saveSettings();
        });

        // 生成控制
        $('#nag-set-total').on('change', function () {
            settings.totalChapters = +$(this).val() || 1000;
            saveSettings();
            updateUI();
        });
        $('#nag-set-prompt').on('change', function () {
            settings.prompt = $(this).val();
            saveSettings();
        });
        $('#nag-set-autosave').on('change', function () {
            settings.autoSaveInterval = +$(this).val() || 50;
            saveSettings();
        });
        $('#nag-set-retries').on('change', function () {
            settings.maxRetries = +$(this).val() || 3;
            saveSettings();
        });
        $('#nag-set-minlen').on('change', function () {
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
        $('#nag-set-exclude-tags').val(settings.excludeTags);
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

    jQuery(async () => {
        if (disposed) return;
        loadSettings();
        createUI();
        refreshTimer = setInterval(() => {
            if (settings.isRunning) updateUI();
        }, 1000);
        log('扩展已加载', 'success');
    });

    instance = {
        stop: () => novelRunner.stop(),
        dispose() {
            novelRunner.stop();
            clearInterval(refreshTimer);
            disposed = true;
            cleanupHelp?.();
            $('#nag-container').remove();
            if (window.nagDebug === debugRawContent) delete window.nagDebug;
            instance = null;
        },
    };
    return instance;
}

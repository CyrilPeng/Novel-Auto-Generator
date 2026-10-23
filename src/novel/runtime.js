import { createNovelRecoveryStore } from './recoveryStore.js';
import { createNovelRunner } from './generation.js';
import { parseTagInput, applyTagFilters } from './tagFilters.js';
import { disposeHelp, showHelp } from './helpModal.js';
import { defaultSettings } from './defaultSettings.js';
import { createPanelHtml } from './panelTemplate.js';
import { createNovelPreview } from './preview.js';
import { createNovelExport } from './export.js';
import { createNovelUiState } from './uiState.js';
import { t } from '../../txtToWorldbook/core/i18n.js';

let instance = null;
export function initNovelUI(host) {
    if (instance) return instance;
    let refreshTimer;
    let disposed = false;
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

    // ============================================
    // 预览
    // ============================================

    const { refreshPreview, debugRawContent } = createNovelPreview({
        getSTChat,
        getSettings: () => settings,
        $,
    });

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
        toastr.info(t('novel.pauseNotice'));
    }
    function resumeGeneration() {
        novelRunner.resume();
        toastr.info(t('novel.resumeNotice'));
    }
    function stopGeneration() {
        novelRunner.stop();
        toastr.warning(t('novel.stopNotice'));
    }

    function resetProgress() {
        if (settings.isRunning) {
            toastr.warning(t('novel.resetBlocked'));
            return;
        }
        novelRunner.resetPending();
        settings.currentChapter = 0;
        generationStats = { startTime: null, chaptersGenerated: 0, totalCharacters: 0, errors: [] };
        saveSettings();
        updateUI();
        toastr.info(t('novel.resetNotice'));
    }

    // ============================================
    // 导出
    // ============================================

    const { exportNovel, exportAsJSON } = createNovelExport({
        getAllChapters,
        notify: (type, message) => toastr[type](message),
    });

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

    const { updateUI, toggleTagSettings, togglePanel, syncUI } = createNovelUiState({
        getSettings: () => settings,
        getStats: () => generationStats,
        saveSettings,
        $,
    });

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
            disposeHelp();
            $('#nag-container').remove();
            if (window.nagDebug === debugRawContent) delete window.nagDebug;
            instance = null;
        },
    };
    return instance;
}

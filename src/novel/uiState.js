import { t } from '../../txtToWorldbook/core/i18n.js';

export function createNovelUiState({ getSettings, getStats, saveSettings, $ }) {
    function formatDuration(ms) {
        if (!ms || ms < 0) return '--:--:--';
        const s = Math.floor(ms / 1000) % 60,
            m = Math.floor(ms / 60000) % 60,
            h = Math.floor(ms / 3600000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function updateUI() {
        const pct =
            getSettings().totalChapters > 0
                ? ((getSettings().currentChapter / getSettings().totalChapters) * 100).toFixed(1)
                : 0;
        $('#nag-progress-fill').css('width', `${pct}%`);
        $('#nag-progress-text').text(`${getSettings().currentChapter} / ${getSettings().totalChapters} (${pct}%)`);

        const [txt, cls] = getSettings().isRunning
            ? getSettings().isPaused
                ? [t('novel.statusPaused'), 'paused']
                : [t('novel.statusRunning'), 'running']
            : [t('novel.statusStopped'), 'stopped'];
        $('#nag-status').text(txt).removeClass('stopped paused running').addClass(cls);

        $('#nag-btn-start').prop('disabled', getSettings().isRunning);
        $('#nag-btn-pause').prop('disabled', !getSettings().isRunning || getSettings().isPaused);
        $('#nag-btn-resume').prop('disabled', !getSettings().isPaused);
        $('#nag-btn-stop').prop('disabled', !getSettings().isRunning);
        $('#nag-btn-reset').prop('disabled', getSettings().isRunning);

        if (getSettings().isRunning && getStats().startTime && getStats().chaptersGenerated > 0) {
            const elapsed = Date.now() - getStats().startTime;
            const avg = elapsed / getStats().chaptersGenerated;
            $('#nag-time-elapsed').text(formatDuration(elapsed));
            $('#nag-time-remaining').text(
                formatDuration(avg * (getSettings().totalChapters - getSettings().currentChapter)),
            );
        }
        $('#nag-stat-errors').text(getStats().errors.length);

        $('#nag-set-start-floor, #nag-set-end-floor').prop('disabled', getSettings().exportAll);
        $('#nag-floor-inputs').toggleClass('disabled', getSettings().exportAll);

        // 发送阶段弹窗设置
        $('#nag-send-toast-settings').toggleClass('disabled', !getSettings().enableSendToastDetection);
        $('#nag-set-send-toast-timeout, #nag-set-send-post-toast-wait').prop(
            'disabled',
            !getSettings().enableSendToastDetection,
        );

        // 回复阶段弹窗设置
        $('#nag-reply-toast-settings').toggleClass('disabled', !getSettings().enableReplyToastDetection);
        $('#nag-set-reply-toast-timeout, #nag-set-reply-post-toast-wait').prop(
            'disabled',
            !getSettings().enableReplyToastDetection,
        );
    }

    function toggleTagSettings() {
        $('#nag-tags-container, #nag-separator-container').toggle(getSettings().extractMode === 'tags');
    }

    function togglePanel(panelId) {
        const panel = $(`#nag-panel-${panelId}`);
        const isCollapsed = panel.hasClass('collapsed');

        if (isCollapsed) {
            panel.removeClass('collapsed');
            getSettings().panelCollapsed[panelId] = false;
        } else {
            panel.addClass('collapsed');
            getSettings().panelCollapsed[panelId] = true;
        }

        saveSettings();
    }

    function syncUI() {
        // 生成设置
        $('#nag-set-total').val(getSettings().totalChapters);
        $('#nag-set-prompt').val(getSettings().prompt);

        // 导出设置
        $('#nag-set-export-all').prop('checked', getSettings().exportAll);
        $('#nag-set-start-floor').val(getSettings().exportStartFloor);
        $('#nag-set-end-floor').val(getSettings().exportEndFloor);
        $('#nag-set-include-user').prop('checked', getSettings().exportIncludeUser);
        $('#nag-set-include-ai').prop('checked', getSettings().exportIncludeAI);
        $('#nag-set-use-raw').prop('checked', getSettings().useRawContent);

        // 标签提取
        $('#nag-set-extract-mode').val(getSettings().extractMode);
        $('#nag-set-tags').val(getSettings().extractTags);
        $('#nag-set-exclude-tags').val(getSettings().excludeTags);
        $('#nag-set-separator').val(getSettings().tagSeparator.replace(/\n/g, '\\n'));

        // 发送阶段弹窗检测
        $('#nag-set-send-toast-detection').prop('checked', getSettings().enableSendToastDetection);
        $('#nag-set-send-toast-timeout').val(getSettings().sendToastWaitTimeout);
        $('#nag-set-send-post-toast-wait').val(getSettings().sendPostToastWaitTime);

        // 回复阶段设置
        $('#nag-set-reply-wait').val(getSettings().replyWaitTime);
        $('#nag-set-stability-interval').val(getSettings().stabilityCheckInterval);
        $('#nag-set-stability-count').val(getSettings().stabilityRequiredCount);
        $('#nag-set-reply-toast-detection').prop('checked', getSettings().enableReplyToastDetection);
        $('#nag-set-reply-toast-timeout').val(getSettings().replyToastWaitTimeout);
        $('#nag-set-reply-post-toast-wait').val(getSettings().replyPostToastWaitTime);

        // 生成控制
        $('#nag-set-autosave').val(getSettings().autoSaveInterval);
        $('#nag-set-retries').val(getSettings().maxRetries);
        $('#nag-set-minlen').val(getSettings().minChapterLength);

        toggleTagSettings();
        updateUI();
    }

    // ============================================
    // 初始化
    // ============================================

    return { updateUI, toggleTagSettings, togglePanel, syncUI };
}

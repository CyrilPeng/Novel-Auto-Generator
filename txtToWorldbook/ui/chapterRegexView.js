import { t } from '../core/i18n.js';
import { escapeHtmlForDisplay } from './renderer.js';

export function createChapterRegexView(deps = {}) {
    const { AppState, ModalFactory, ErrorHandler, Logger } = deps;

    function detectChaptersWithRegex(content, regexPattern) {
        try {
            const regex = new RegExp(regexPattern, 'g');
            const results = [];
            const maxTime = 3000;
            const startTime = Date.now();
            let match;
            while ((match = regex.exec(content)) !== null) {
                results.push(match);
                if (Date.now() - startTime > maxTime) {
                    Logger.warn('Regex', '正则匹配超时(3秒)，已中断');
                    break;
                }
                if (match[0].length === 0) regex.lastIndex++;
            }
            return results;
        } catch (e) {
            Logger.error('Regex', '正则表达式错误:', e);
            return [];
        }
    }

    function testChapterRegex() {
        if (!AppState.file.current && AppState.memory.queue.length === 0) {
            ErrorHandler.showUserError(t('configView.chapterRegex.uploadFirst'));
            return;
        }

        const regexInput = document.getElementById('ttw-chapter-regex');
        const pattern = regexInput?.value || AppState.config.chapterRegex.pattern;

        const content = AppState.memory.queue.length > 0 ? AppState.memory.queue.map((m) => m.content).join('') : '';
        if (!content) {
            ErrorHandler.showUserError(t('configView.chapterRegex.loadFirst'));
            return;
        }

        const matches = detectChaptersWithRegex(content, pattern);

        if (matches.length === 0) {
            const modal = ModalFactory.create({
                id: 'ttw-regex-test-modal',
                title: t('configView.chapterRegex.noChaptersTitle'),
                body: `<div style="white-space: pre-wrap; padding: 10px;">${t('configView.chapterRegex.noChaptersBody', { pattern: `<code>${escapeHtmlForDisplay(pattern)}</code>` })}</div>`,
                footer: `<button class="ttw-btn ttw-btn-primary" id="ttw-close-regex-test">${t('configView.chapterRegex.close')}</button>`,
            });
            modal.querySelector('#ttw-close-regex-test').addEventListener('click', () => ModalFactory.close(modal));
            return;
        }

        const previewChapters = matches
            .slice(0, 10)
            .map((m) => escapeHtmlForDisplay(m[0]))
            .join('\n');
        const modal = ModalFactory.create({
            id: 'ttw-regex-test-modal',
            title: t('configView.chapterRegex.detectedTitle', { count: matches.length }),
            body: `<div style="white-space: pre-wrap; padding: 10px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.3); color: #ccc; border-radius: 4px; border: 1px solid #555;">${t('configView.chapterRegex.previewLabel')}\n\n${previewChapters}${matches.length > 10 ? '\n...' : ''}</div>`,
            footer: `<button class="ttw-btn ttw-btn-primary" id="ttw-close-regex-test">${t('configView.chapterRegex.close')}</button>`,
        });
        modal.querySelector('#ttw-close-regex-test').addEventListener('click', () => ModalFactory.close(modal));
    }

    return {
        testChapterRegex,
    };
}

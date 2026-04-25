import { escapeHtmlForDisplay } from './renderer.js';

export function createChapterRegexView(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        Logger,
    } = deps;

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
            ErrorHandler.showUserError('请先上传文件');
            return;
        }

        const regexInput = document.getElementById('ttw-chapter-regex');
        const pattern = regexInput?.value || AppState.config.chapterRegex.pattern;

        const content = AppState.memory.queue.length > 0
            ? AppState.memory.queue.map((m) => m.content).join('')
            : '';
        if (!content) {
            ErrorHandler.showUserError('请先上传并加载文件');
            return;
        }

        const matches = detectChaptersWithRegex(content, pattern);

        if (matches.length === 0) {
            const modal = ModalFactory.create({
                id: 'ttw-regex-test-modal',
                title: '❌ 未检测到章节',
                body: `<div style="white-space: pre-wrap; padding: 10px;">当前正则: <code>${escapeHtmlForDisplay(pattern)}</code>\n\n建议:\n1. 尝试使用快速选择按钮\n2. 检查正则表达式是否正确</div>`,
                footer: '<button class="ttw-btn ttw-btn-primary" id="ttw-close-regex-test">关闭</button>',
            });
            modal.querySelector('#ttw-close-regex-test')
                .addEventListener('click', () => ModalFactory.close(modal));
            return;
        }

        const previewChapters = matches.slice(0, 10).map((m) => escapeHtmlForDisplay(m[0])).join('\n');
        const modal = ModalFactory.create({
            id: 'ttw-regex-test-modal',
            title: `✅ 检测到 ${matches.length} 个章节`,
            body: `<div style="white-space: pre-wrap; padding: 10px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.3); color: #ccc; border-radius: 4px; border: 1px solid #555;">前10个章节预览:\n\n${previewChapters}${matches.length > 10 ? '\n...' : ''}</div>`,
            footer: '<button class="ttw-btn ttw-btn-primary" id="ttw-close-regex-test">关闭</button>',
        });
        modal.querySelector('#ttw-close-regex-test')
            .addEventListener('click', () => ModalFactory.close(modal));
    }

    return {
        testChapterRegex,
    };
}

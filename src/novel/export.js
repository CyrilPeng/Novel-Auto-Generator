import { t } from '../../txtToWorldbook/core/i18n.js';

export function createNovelExport({ getAllChapters, notify }) {
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
            if (!silent) notify('warning', t('novel.noContent'));
            return;
        }

        const totalChars = chapters.reduce((s, c) => s + c.content.length, 0);
        let text = `${t('novel.exportTime')}: ${new Date().toLocaleString()}\n${t('novel.exportChapters')}: ${chapters.length}\n${t('novel.exportChars')}: ${totalChars}\n${'═'.repeat(40)}\n\n`;
        chapters.forEach((ch) => {
            text += `══ [${ch.floor}楼] ${ch.isUser ? t('novel.exportUser') : t('novel.exportAi')} ══\n\n${ch.content}\n\n`;
        });

        downloadFile(text, `novel_${chapters.length}ch_${Date.now()}.txt`);
        if (!silent) notify('success', t('novel.exported', { count: chapters.length }));
    }

    async function exportAsJSON(silent = false) {
        const chapters = getAllChapters();
        if (!chapters.length) {
            if (!silent) notify('warning', t('novel.noContent'));
            return;
        }
        downloadFile(
            JSON.stringify({ time: new Date().toISOString(), chapters }, null, 2),
            `novel_${Date.now()}.json`,
            'application/json',
        );
        if (!silent) notify('success', t('novel.exportedJson'));
    }

    return { exportNovel, exportAsJSON };
}

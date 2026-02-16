/**
 * TXT格式导出器
 * 导出为纯文本格式
 */
import { downloadFile } from '../utils/file.js';

export class TXTExporter {
    constructor() {
        this.mimeType = 'text/plain';
        this.extension = 'txt';
    }

    /**
     * 导出为世界书TXT格式
     * @param {Object} worldbook - 世界书数据
     * @param {Object} options - 导出选项
     * @returns {string} 文本内容
     */
    export(worldbook, options = {}) {
        const lines = [];
        lines.push(`导出时间: ${new Date().toLocaleString()}`);
        lines.push('');

        for (const [categoryName, entries] of Object.entries(worldbook)) {
            if (!Array.isArray(entries) || entries.length === 0) continue;

            lines.push(`\n${'='.repeat(40)}`);
            lines.push(`【${categoryName}】`);
            lines.push(`${'='.repeat(40)}\n`);

            for (const entry of entries) {
                lines.push(`\n--- ${entry.name || '未命名'} ---`);
                if (entry.keywords && entry.keywords.length > 0) {
                    lines.push(`关键词: ${Array.isArray(entry.keywords) ? entry.keywords.join(', ') : entry.keywords}`);
                }
                if (entry.content) {
                    lines.push(`\n${entry.content}`);
                }
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * 导出并下载文件
     * @param {Object} worldbook - 世界书数据
     * @param {Object} options - 导出选项
     */
    download(worldbook, options = {}) {
        const content = this.export(worldbook, options);
        const filename = options.filename || 'worldbook.txt';
        downloadFile(content, filename, this.mimeType);
    }

    /**
     * 导出章节内容为TXT
     * @param {Array<Object>} chapters - 章节列表
     * @param {Object} options - 导出选项
     */
    downloadChapters(chapters, options = {}) {
        const lines = [];
        lines.push(`导出时间: ${new Date().toLocaleString()}`);
        lines.push(`总章节: ${chapters.length}`);
        lines.push(`${'='.repeat(40)}\n`);

        chapters.forEach((ch, index) => {
            lines.push(`\n══ [${ch.floor || index}楼] ${ch.isUser ? '用户' : 'AI'} ══\n`);
            lines.push(ch.content || '');
            lines.push('');
        });

        const content = lines.join('\n');
        const filename = options.filename || `novel_${chapters.length}ch_${Date.now()}.txt`;
        downloadFile(content, filename, this.mimeType);
    }
}

/**
 * TXT文件解析器
 * 解析TXT文件并处理编码
 */
import { detectFileEncoding } from '../utils/file.js';

export class TxtParser {
    /**
     * 解析TXT文件
     * @param {File} file - TXT文件
     * @returns {Promise<Object>} 解析结果
     */
    async parse(file) {
        const { encoding, content } = await detectFileEncoding(file);
        
        return {
            title: file.name.replace(/\.txt$/i, ''),
            content: content,
            encoding: encoding,
            size: content.length
        };
    }

    /**
     * 按章节分割内容
     * @param {string} content - 文本内容
     * @param {RegExp} pattern - 章节匹配正则
     * @returns {Array} 章节列表
     */
    splitByChapters(content, pattern = /第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇][^\n]*\n/g) {
        const chapters = [];
        const matches = content.match(pattern);
        const parts = content.split(pattern);
        
        // 第一部分可能是序言/前言
        if (parts[0].trim().length > 100) {
            chapters.push({
                title: '序言',
                content: parts[0].trim()
            });
        }
        
        // 后续部分按章节
        for (let i = 1; i < parts.length; i++) {
            const chapterContent = parts[i].trim();
            if (chapterContent.length > 100) {
                chapters.push({
                    title: (matches?.[i - 1] || `第${i}章`).trim(),
                    content: chapterContent
                });
            }
        }
        
        return chapters;
    }

    /**
     * 按字数分割内容
     * @param {string} content - 文本内容
     * @param {number} chunkSize - 每块字数
     * @returns {Array} 内容块列表
     */
    splitBySize(content, chunkSize = 15000) {
        const chunks = [];
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push({
                title: `第${Math.floor(i / chunkSize) + 1}块`,
                content: content.slice(i, i + chunkSize)
            });
        }
        return chunks;
    }
}

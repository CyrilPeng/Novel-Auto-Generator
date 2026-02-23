/**
 * TXT 文件解析器
 * 解析 TXT 文本文件
 */
import { detectFileEncoding } from '../utils/file.js';

/**
 * TXT 解析器配置
 */
export class TxtParserConfig {
    constructor({
        defaultEncoding = 'UTF-8',
        detectEncoding = true,
        cleanText = true
    } = {}) {
        this.defaultEncoding = defaultEncoding;
        this.detectEncoding = detectEncoding;
        this.cleanText = cleanText;
    }
}

/**
 * TXT 文件解析器
 */
export class TxtParser {
    constructor(config = {}) {
        this.config = new TxtParserConfig(config);
    }

    /**
     * 解析 TXT 文件
     * @param {File} file - 文件对象
     * @returns {Promise<string>} 文件内容
     */
    async parse(file) {
        if (this.config.detectEncoding) {
            const result = await detectFileEncoding(file);
            return this.config.cleanText 
                ? this.cleanText(result.content) 
                : result.content;
        }
        
        const content = await this.readFile(file);
        return this.config.cleanText 
            ? this.cleanText(content) 
            : content;
    }

    /**
     * 读取文件
     * @param {File} file - 文件对象
     * @returns {Promise<string>} 文件内容
     */
    async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, this.config.defaultEncoding);
        });
    }

    /**
     * 清理文本
     * @param {string} content - 原始内容
     * @returns {string} 清理后的内容
     */
    cleanText(content) {
        return content
            // 替换制表符为空格
            .replace(/\t/g, ' ')
            // 合并多个空行为一个
            .replace(/\n{3,}/g, '\n\n')
            // 移除行首尾的空白字符
            .split('\n')
            .map(line => line.trim())
            .join('\n');
    }

    /**
     * 检测文件编码（快捷方法）
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} {encoding, content, detected}
     */
    async detectEncoding(file) {
        return detectFileEncoding(file);
    }
}

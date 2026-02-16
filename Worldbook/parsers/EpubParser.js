/**
 * EPUB文件解析器
 * 解析EPUB电子书文件
 */
import { readFileAsArrayBuffer } from '../utils/file.js';
import { htmlToText } from '../utils/html.js';

export class EpubParser {
    constructor() {
        this.jsZip = null;
    }

    /**
     * 动态加载JSZip库
     * @returns {Promise<Object>} JSZip对象
     */
    async loadJSZip() {
        if (window.JSZip) {
            return window.JSZip;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve(window.JSZip);
            script.onerror = () => reject(new Error('JSZip库加载失败'));
            document.head.appendChild(script);
        });
    }

    /**
     * 解析EPUB文件
     * @param {File} file - EPUB文件
     * @returns {Promise<Object>} 解析结果
     */
    async parse(file) {
        const JSZip = await this.loadJSZip();
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // 解析容器文件
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) {
            throw new Error('无效的EPUB文件：缺少container.xml');
        }

        const containerXml = await containerFile.async('string');
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, 'text/xml');
        
        // 获取OPF文件路径
        const rootfile = containerDoc.querySelector('rootfile');
        if (!rootfile) {
            throw new Error('无效的EPUB文件：无法找到OPF文件');
        }
        
        const opfPath = rootfile.getAttribute('full-path');
        const opfFile = zip.file(opfPath);
        
        if (!opfFile) {
            throw new Error('无效的EPUB文件：无法读取OPF文件');
        }

        // 解析OPF文件
        const opfContent = await opfFile.async('string');
        const opfDoc = parser.parseFromString(opfContent, 'application/xml');
        
        // 获取书名
        const titleEl = opfDoc.querySelector('metadata title, dc\\:title');
        const bookTitle = titleEl ? titleEl.textContent.trim() : '';
        
        // 构建manifest
        const manifest = {};
        opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = {
                href: item.getAttribute('href'),
                mediaType: item.getAttribute('media-type')
            };
        });
        
        // 基础路径
        const basePath = opfPath.includes('/') 
            ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) 
            : '';
        
        // 解析章节
        const chapters = [];
        const spineItems = opfDoc.querySelectorAll('spine itemref');
        
        for (const ref of spineItems) {
            const idref = ref.getAttribute('idref');
            const item = manifest[idref];
            if (!item) continue;
            
            if (!item.mediaType || !item.mediaType.includes('html')) continue;
            
            const filePath = basePath + item.href;
            const file = zip.file(filePath);
            if (!file) continue;
            
            try {
                const html = await file.async('string');
                const text = htmlToText(html);
                
                if (text && text.trim().length > 0) {
                    chapters.push(text.trim());
                }
            } catch (e) {
                console.warn(`[EPUB解析] 跳过文件: ${filePath}`);
            }
        }
        
        return {
            title: bookTitle,
            content: chapters.join('\n'),
            chapters: chapters
        };
    }
}

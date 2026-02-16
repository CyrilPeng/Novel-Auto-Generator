/**
 * HTML处理工具函数
 * 提供HTML转文本、HTML转义等功能
 */

/**
 * 将HTML转换为纯文本
 * @param {string} html - HTML字符串
 * @returns {string} 纯文本
 */
export function htmlToText(html) {
    if (!html) return '';
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    if (!doc.body) return '';
    
    // 移除脚本和样式标签
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    
    // 将<br>替换为换行符
    doc.querySelectorAll('br').forEach(el => {
        el.replaceWith('\n');
    });
    
    // 块级元素后添加换行符
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                       'li', 'tr', 'blockquote', 'section', 'article'];
    
    blockTags.forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => {
            el.innerHTML = el.innerHTML + '\n';
        });
    });
    
    // 获取文本内容
    let text = doc.body.textContent || '';
    
    // 清理空白字符
    text = text
        .replace(/[ \t]+/g, ' ')
        .replace(/ \n/g, '\n')
        .replace(/\n /g, '\n')
        .replace(/\n{2,}/g, '\n')
        .replace(/^\s+/, '')
        .replace(/\s+$/, '');
    
    return text;
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

/**
 * 反转义HTML实体
 * @param {string} html - HTML字符串
 * @returns {string} 反转义后的文本
 */
export function unescapeHtml(html) {
    if (!html) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
}

/**
 * 提取纯文本（去除所有HTML标签）
 * @param {string} html - HTML字符串
 * @returns {string} 纯文本
 */
export function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

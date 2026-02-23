/**
 * AI 响应解析器模块
 * @module generators/ResponseParser
 * @description 解析 AI 生成的响应，提取 JSON 数据，修复常见错误
 * 
 * 主要功能：
 * 1. 多策略 JSON 解析（直接解析、Markdown 清理、正则提取）
 * 2. 自动修复未转义的双引号
 * 3. 响应标签过滤（如 thinking 标签）
 * 4. Token 超限错误检测
 * 5. 世界书数据提取和验证
 * 
 * @example
 * // 解析 AI 响应
 * const data = parseAIResponse(responseText);
 * 
 * // 过滤响应标签
 * const cleaned = filterResponseTags(text, 'thinking,/think');
 * 
 * // 检测 Token 超限
 * if (isTokenLimitError(errorMessage)) {
 *     // 处理 Token 超限
 * }
 */

/**
 * 解析 AI 响应
 * @description 使用多种策略解析 AI 生成的响应文本，提取 JSON 数据
 * 
 * 解析策略（按优先级）：
 * 1. 直接 JSON.parse 尝试
 * 2. 移除 Markdown 代码块标记后解析
 * 3. 正则提取 JSON 对象后解析
 * 4. 修复未转义双引号后解析
 * 5. 提取最长的 JSON 结构尝试解析
 * 
 * @param {string} response - AI 响应文本
 * @returns {Object} 解析后的对象
 * @throws {Error} 当所有解析策略都失败时抛出错误
 * 
 * @example
 * const response = '```json\n{"角色": {"张三": {"关键词": ["张三"], "内容": "主角"}}}\n```';
 * const data = parseAIResponse(response);
 * // data = { "角色": { "张三": { "关键词": ["张三"], "内容": "主角" } } }
 */
export function parseAIResponse(response) {
    if (!response || typeof response !== 'string') {
        throw new Error('响应为空或格式错误');
    }

    let cleaned = response.trim();

    // 策略 1: 尝试直接解析
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // 继续下一步
    }

    // 策略 2: 移除 Markdown 代码块标记
    cleaned = removeMarkdownCodeBlocks(cleaned);

    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // 继续下一步
    }

    // 策略 3: 提取 JSON 对象（使用正则）
    const jsonMatch = extractJsonObject(cleaned);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch);
        } catch (e) {
            // 继续下一步
        }
    }

    // 策略 4: 修复未转义的双引号
    const repaired = repairJsonUnescapedQuotes(cleaned);
    try {
        return JSON.parse(repaired);
    } catch (e) {
        // 继续下一步
    }

    // 策略 5: 尝试提取任何类似 JSON 的结构
    const looseMatch = extractLooseJson(cleaned);
    if (looseMatch) {
        try {
            return JSON.parse(looseMatch);
        } catch (e) {
            // 最后尝试
        }
    }

    throw new Error(`无法解析 AI 响应：${e.message}`);
}

/**
 * 移除 Markdown 代码块标记
 * @description 移除 AI 响应中的 ```json 和 ``` 标记
 * 
 * @private
 * @param {string} text - 包含 Markdown 代码块的文本
 * @returns {string} 清理后的文本
 */
function removeMarkdownCodeBlocks(text) {
    return text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
}

/**
 * 提取 JSON 对象
 * @description 从文本中提取第一个 { 到最后一个 } 之间的内容
 * 
 * @private
 * @param {string} text - 输入文本
 * @returns {string|null} 提取的 JSON 字符串，如果未找到则返回 null
 */
function extractJsonObject(text) {
    // 查找第一个 { 和最后一个 }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1 || start >= end) {
        return null;
    }

    return text.slice(start, end + 1);
}

/**
 * 修复未转义的双引号
 * @description 处理 AI 输出中常见的双引号转义问题
 * 
 * 问题场景：
 * AI 可能输出如 "发"神"" 这样的内容，其中内部的双引号未转义，
 * 导致 JSON 解析失败。此函数逐字符扫描，智能判断双引号是否需要转义。
 * 
 * 算法说明：
 * 1. 逐字符扫描文本
 * 2. 追踪是否在字符串内部（inString 标志）
 * 3. 对于字符串内的双引号（非键值分隔符），添加转义符
 * 4. 对于键值分隔符的双引号，保持不变
 * 
 * @private
 * @param {string} text - 包含未转义双引号的文本
 * @returns {string} 修复后的文本
 */
function repairJsonUnescapedQuotes(text) {
    // 简单策略：查找字符串中的未转义双引号
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if (char === '"' && prevChar !== '\\') {
            // 检查是否是键值对的分隔符
            const nextNonSpace = text.slice(i + 1).match(/[^\s]/);
            const isKeyValueSeparator = nextNonSpace && nextNonSpace[0] === ':';

            if (inString && !isKeyValueSeparator) {
                // 字符串内的双引号需要转义
                result += '\\"';
            } else {
                result += char;
                inString = !inString;
            }
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * 提取松散的 JSON 结构
 * @description 尝试提取文本中包含 { 和 } 的最长子串
 * 
 * 这是最后的解析尝试，用于处理格式非常不规范的响应。
 * 
 * @private
 * @param {string} text - 输入文本
 * @returns {string|null} 提取的 JSON 字符串，如果未找到则返回 null
 */
function extractLooseJson(text) {
    // 尝试提取包含 { 和 } 的最长子串
    const matches = text.match(/\{[\s\S]*\}/g);
    if (!matches || matches.length === 0) {
        return null;
    }

    // 返回最长的匹配
    return matches.reduce((longest, current) =>
        current.length > longest.length ? current : longest, matches[0]);
}

/**
 * 过滤响应中的标签
 * @description 移除 AI 响应中的指定 XML 标签及其内容
 * 
 * 常见用途：
 * - 移除 <thinking>思考过程</thinking>
 * - 移除<spoiler>剧透内容</spoiler>
 * - 移除其他不需要的标签内容
 * 
 * 处理规则：
 * - 对于闭合标签（如/think），移除该标签之前的所有内容
 * - 对于开放标签（如 thinking），移除标签及其内容
 * - 支持自关闭标签（如<br/>）
 * 
 * @param {string} text - 响应文本
 * @param {string} filterTags - 要过滤的标签，逗号分隔
 *   - 开放标签格式：tagName
 *   - 闭合标签格式：/tagName
 * @returns {string} 过滤后的文本
 * 
 * @example
 * // 移除 thinking 标签
 * filterResponseTags('<thinking>思考</thinking>正文', 'thinking,/think')
 * // 返回：'正文'
 */
export function filterResponseTags(text, filterTags = 'thinking,/think') {
    if (!text) return text;

    const tags = filterTags.split(',').map(t => t.trim()).filter(t => t);
    let cleaned = text;

    for (const tag of tags) {
        if (tag.startsWith('/')) {
            // 闭合标签，移除之前的所有内容
            const tagName = tag.substring(1);
            cleaned = cleaned.replace(new RegExp(`^[\\s\\S]*?<\\/${tagName}>`, 'gi'), '');
        } else {
            // 开放标签，移除标签及其内容
            cleaned = cleaned.replace(
                new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'),
                ''
            );
            cleaned = cleaned.replace(
                new RegExp(`<${tag}\\s*/?>`, 'gi'),
                ''
            );
        }
    }

    return cleaned.trim();
}

/**
 * 检查是否是 Token 超限错误
 * @description 通过匹配常见错误模式来识别 Token 超限错误
 * 
 * 支持的错误模式：
 * - prompt is too long
 * - tokens exceeded maximum
 * - context_length_exceeded
 * - INVALID_ARGUMENT (某些 API 的 Token 超限错误码)
 * - 以及其他常见的 Token 相关错误
 * 
 * @param {string} errorMessage - 错误消息
 * @returns {boolean} 是否为 Token 超限错误
 * 
 * @example
 * if (isTokenLimitError(error.message)) {
 *     // 需要减少输入长度或 splitting 处理
 * }
 */
export function isTokenLimitError(errorMessage) {
    if (!errorMessage) return false;

    const checkStr = String(errorMessage).substring(0, 500);
    const patterns = [
        /prompt is too long/i,
        /tokens?\s*>\s*\d+\s*maximum/i,
        /max_prompt_tokens/i,
        /tokens?.*exceeded/i,
        /context.?length.*exceeded/i,
        /exceeded.*(?:token|limit|context|maximum)/i,
        /input tokens/i,
        /context_length/i,
        /too many tokens/i,
        /token limit/i,
        /maximum.*tokens/i,
        /20015.*limit/i,
        /INVALID_ARGUMENT/i
    ];

    return patterns.some(pattern => pattern.test(checkStr));
}

/**
 * 从响应中提取世界书数据
 * @description 根据启用的分类列表，从解析后的数据中过滤出有效条目
 * 
 * @param {Object} parsedData - 解析后的数据对象
 * @param {Array} enabledCategories - 启用的分类列表，每个元素包含 name 属性
 * @returns {Object} 过滤后的世界书数据
 * 
 * @example
 * const data = {
 *     '角色': {...},
 *     '地点': {...},
 *     '未启用': {...}
 * };
 * const enabled = [{name: '角色'}, {name: '地点'}];
 * const result = extractWorldbookData(data, enabled);
 * // result = { '角色': {...}, '地点': {...} }
 */
export function extractWorldbookData(parsedData, enabledCategories = []) {
    if (!parsedData || typeof parsedData !== 'object') {
        return {};
    }

    const result = {};
    const categoryNames = enabledCategories.map(c => c.name);

    for (const [key, value] of Object.entries(parsedData)) {
        // 检查是否是启用的分类
        if (categoryNames.includes(key) && value && typeof value === 'object') {
            result[key] = value;
        }
    }

    return result;
}

/**
 * 验证世界书条目的格式
 * @description 检查条目是否符合世界书格式要求，并提供修复建议
 * 
 * 验证规则：
 * 1. 条目必须是对象类型
 * 2. 检查是否有关键词字段（关键词/关键字）
 * 3. 检查是否有内容字段
 * 4. 自动将字符串关键词转换为数组
 * 
 * @param {Object} entry - 世界书条目
 * @returns {Object} 验证结果
 * @returns {boolean} returns.valid - 是否验证通过
 * @returns {Array} returns.errors - 错误列表
 * @returns {Array} returns.warnings - 警告列表
 * @returns {Object} returns.entry - 修复后的条目（如果有修复）
 * 
 * @example
 * const entry = { '关键词': '张三，李四', '内容': '描述' };
 * const result = validateWorldbookEntry(entry);
 * if (result.valid) {
 *     // entry['关键词'] 已被转换为 ['张三', '李四']
 * }
 */
export function validateWorldbookEntry(entry) {
    const errors = [];
    const warnings = [];

    if (!entry || typeof entry !== 'object') {
        errors.push('条目格式错误');
        return { valid: false, errors, warnings };
    }

    // 检查必需字段
    if (!entry['关键词'] && !entry['关键字']) {
        warnings.push('缺少关键词字段');
    }

    if (!entry['内容']) {
        errors.push('缺少内容字段');
    }

    // 检查关键词格式
    if (entry['关键词'] && !Array.isArray(entry['关键词'])) {
        if (typeof entry['关键词'] === 'string') {
            // 尝试转换为数组
            entry['关键词'] = entry['关键词'].split(/[,，]/).map(k => k.trim()).filter(k => k);
        } else {
            warnings.push('关键词格式不正确');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        entry
    };
}

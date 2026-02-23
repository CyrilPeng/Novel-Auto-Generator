/**
 * 提示词构建器
 * 构建用于 AI 生成的提示词
 */

export class PromptBuilder {
    constructor(config) {
        this.config = config;
    }

    /**
     * 构建世界书生成提示词
     * @param {string} content - 小说内容
     * @param {Array} categories - 启用的分类列表
     * @returns {string} 提示词
     */
    buildGenerationPrompt(content, categories) {
        const categoryNames = categories.map(c => c.name).join(',');
        const template = this.config.get('customWorldbookPrompt') || this.getDefaultWorldbookPrompt();

        return template
            .replace('{ENABLED_CATEGORY_NAMES}', categoryNames)
            .replace('{DYNAMIC_JSON_TEMPLATE}', this.buildJsonTemplate(categories))
            .replace('{CONTENT}', content);
    }

    /**
     * 获取默认世界书生成提示词
     * @returns {string} 默认提示词
     */
    getDefaultWorldbookPrompt() {
        return `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

重要要求：
1. 必须基于提供的具体小说内容，不要生成通用模板
2. 只输出以下指定分类：{ENABLED_CATEGORY_NAMES}，禁止输出其他未指定的分类
3. 关键词必须是文中实际出现的名称，用逗号分隔
4. 内容必须基于原文描述，不要添加原文没有的信息
5. 内容使用 markdown 格式，可以层层嵌套或使用序号标题

输出格式：
请生成标准 JSON 格式，确保能被 JavaScript 正确解析：

\`\`\`json
{DYNAMIC_JSON_TEMPLATE}
\`\`\`

重要提醒：
- 直接输出 JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁
- 严格只输出上述指定的分类，不要自作主张添加其他分类`;
    }

    /**
     * 构建 JSON 模板
     * @param {Array} categories - 分类列表
     * @returns {string} JSON 模板
     */
    buildJsonTemplate(categories) {
        const parts = categories.map(cat => {
            return `"${cat.name}": {
  "${cat.entryExample}": {
    "关键词": ${JSON.stringify(cat.keywordsExample)},
    "内容": "${cat.contentGuide}"
  }
}`;
        });
        return `{\n${parts.join(',\n')}\n}`;
    }

    /**
     * 构建合并提示词
     * @param {Object} entryA - 条目 A
     * @param {Object} entryB - 条目 B
     * @returns {string} 提示词
     */
    buildMergePrompt(entryA, entryB) {
        const customPrompt = this.config.get('customMergePrompt');
        if (customPrompt) {
            return customPrompt
                .replace('{ENTRY_A}', JSON.stringify(entryA, null, 2))
                .replace('{ENTRY_B}', JSON.stringify(entryB, null, 2));
        }

        return `你是世界书条目合并专家。请将以下两个相同名称的世界书条目合并为一个，保留所有重要信息，去除重复内容。

合并规则：
1. 关键词：合并两者的关键词，去重
2. 内容：整合两者的描述，保留所有独特信息，用 markdown 格式组织
3. 如有矛盾信息，保留更详细/更新的版本
4. 输出格式必须是 JSON

条目 A：
${JSON.stringify(entryA, null, 2)}

条目 B：
${JSON.stringify(entryB, null, 2)}

请直接输出合并后的 JSON 格式条目：
{"关键词": [...], "内容": "..."}`;
    }

    /**
     * 构建整理提示词
     * @param {string} content - 条目内容
     * @returns {string} 提示词
     */
    buildConsolidatePrompt(content) {
        const customPrompt = this.config.get('customConsolidatePrompt');
        if (customPrompt) {
            return customPrompt.replace('{CONTENT}', content);
        }

        return `你是世界书条目整理专家。请整理以下条目内容，去除重复信息，合并相似描述，保留所有独特细节。

整理规则：
1. 合并重复的属性描述（如多个"性别"只保留一个）
2. 整合相似的段落，去除冗余
3. 保留所有独特信息，不要丢失细节
4. 使用清晰的 markdown 格式输出
5. 关键信息放在前面

原始内容：
${content}

请直接输出整理后的内容（纯文本，不要 JSON 包装）：`;
    }

    /**
     * 应用消息链
     * 将提示词通过消息链模板转换为消息数组
     *
     * @param {string} prompt - 原始提示词
     * @returns {Array} 消息数组
     */
    applyMessageChain(prompt) {
        const chain = this.config.get('promptMessageChain', [
            { role: 'user', content: '{PROMPT}', enabled: true }
        ]);

        if (!Array.isArray(chain) || chain.length === 0) {
            return [{ role: 'user', content: prompt }];
        }

        const enabledMessages = chain.filter(m => m.enabled !== false);
        if (enabledMessages.length === 0) {
            return [{ role: 'user', content: prompt }];
        }

        return enabledMessages
            .map(msg => ({
                role: msg.role || 'user',
                content: (msg.content || '').replace(/\{PROMPT\}/g, prompt)
            }))
            .filter(m => m.content.trim().length > 0);
    }
}

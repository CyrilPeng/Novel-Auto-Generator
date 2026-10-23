import { runConfiguration } from '../core/runContext.js';
export function createPromptService(deps = {}) {
    const {
        AppState,
        getEnabledCategories,
        generateDynamicJsonTemplate,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
    } = deps;

    function getLanguagePrefix() {
        return runConfiguration(AppState).settings.language === 'zh' ? '请用中文回复。\n\n' : '';
    }

    function messagesToString(messages) {
        if (typeof messages === 'string') return messages;
        if (!Array.isArray(messages) || messages.length === 0) return '';
        if (messages.length === 1) return messages[0].content || '';
        return messages
            .map((m) => {
                const roleLabel = m.role === 'system' ? '[System]' : m.role === 'assistant' ? '[Assistant]' : '[User]';
                return `${roleLabel}\n${m.content}`;
            })
            .join('\n\n');
    }

    function applyMessageChain(prompt) {
        const settings = runConfiguration(AppState).settings;
        const chain = settings.promptMessageChain;
        const enabledMessages = Array.isArray(chain) ? chain.filter((m) => m && m.enabled !== false) : [];
        const messages =
            enabledMessages.length === 0
                ? [{ role: 'user', content: prompt }]
                : enabledMessages
                      .map((msg) => ({
                          role: msg.role || 'user',
                          content: String(msg.content || '').replace(/\{PROMPT\}/g, prompt),
                      }))
                      .filter((m) => m.content.trim().length > 0);
        if (messages.length === 0) messages.push({ role: 'user', content: prompt });
        const extraSystemPrompt =
            typeof settings.extraSystemPrompt === 'string' ? settings.extraSystemPrompt.trim() : '';
        if (extraSystemPrompt) messages.unshift({ role: 'system', content: extraSystemPrompt });
        return messages;
    }

    function convertToGeminiContents(messages) {
        const systemMsgs = messages.filter((m) => m.role === 'system');
        const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
        const merged = [];

        for (const msg of nonSystemMsgs) {
            const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
            if (merged.length > 0 && merged[merged.length - 1].role === geminiRole) {
                merged[merged.length - 1].parts[0].text += '\n\n' + msg.content;
            } else {
                merged.push({ role: geminiRole, parts: [{ text: msg.content }] });
            }
        }

        if (merged.length > 0 && merged[0].role !== 'user') {
            merged.unshift({ role: 'user', parts: [{ text: '请根据以下对话执行任务。' }] });
        }

        const result = { contents: merged };
        if (systemMsgs.length > 0) {
            result.systemInstruction = {
                parts: [{ text: systemMsgs.map((m) => m.content).join('\n\n') }],
            };
        }
        return result;
    }

    function buildSystemPrompt() {
        let worldbookPrompt =
            runConfiguration(AppState).settings.customWorldbookPrompt?.trim() || defaultWorldbookPrompt;

        const dynamicTemplate = generateDynamicJsonTemplate();
        worldbookPrompt = worldbookPrompt.replace('{DYNAMIC_JSON_TEMPLATE}', dynamicTemplate);

        const enabledCatNames = getEnabledCategories().map((c) => c.name);
        if (runConfiguration(AppState).settings.enablePlotOutline) enabledCatNames.push('剧情大纲');
        if (runConfiguration(AppState).settings.enableLiteraryStyle) enabledCatNames.push('文风配置');
        worldbookPrompt = worldbookPrompt.replace('{ENABLED_CATEGORY_NAMES}', enabledCatNames.join('、'));

        const additionalParts = [];
        if (runConfiguration(AppState).settings.enablePlotOutline) {
            additionalParts.push(runConfiguration(AppState).settings.customPlotPrompt?.trim() || defaultPlotPrompt);
        }
        if (runConfiguration(AppState).settings.enableLiteraryStyle) {
            additionalParts.push(runConfiguration(AppState).settings.customStylePrompt?.trim() || defaultStylePrompt);
        }
        if (additionalParts.length === 0) return worldbookPrompt;

        let fullPrompt = worldbookPrompt;
        const insertContent = ',\n' + additionalParts.join(',\n');
        fullPrompt = fullPrompt.replace(/(\}\s*)\n```/, `${insertContent}\n$1\n\`\`\``);
        return fullPrompt;
    }

    function getPreviousMemoryContext(index) {
        if (index <= 0) return '';

        for (let i = index - 1; i >= 0; i--) {
            const prevMemory = AppState.memory.queue[i];
            if (prevMemory && prevMemory.processed && prevMemory.result && !prevMemory.failed) {
                const plotContext = [];
                const result = prevMemory.result;

                if (result['剧情大纲']) {
                    for (const entryName in result['剧情大纲']) {
                        plotContext.push(
                            `${entryName}: ${result['剧情大纲'][entryName]['内容']?.substring(0, 200) || ''}`,
                        );
                    }
                }
                if (result['剧情节点']) {
                    for (const entryName in result['剧情节点']) {
                        plotContext.push(
                            `${entryName}: ${result['剧情节点'][entryName]['内容']?.substring(0, 200) || ''}`,
                        );
                    }
                }
                if (result['章节剧情']) {
                    for (const entryName in result['章节剧情']) {
                        plotContext.push(
                            `${entryName}: ${result['章节剧情'][entryName]['内容']?.substring(0, 200) || ''}`,
                        );
                    }
                }

                if (plotContext.length > 0) {
                    return `\n\n【上一章节(第${i + 1}章)的剧情进展】：\n${plotContext.join('\n')}\n\n请在此基础上继续分析后续剧情，不要重复输出已有的章节。`;
                }
                break;
            }
        }
        return '';
    }

    function getChapterForcePrompt(chapterIndex) {
        return `
【强制章节标记 - 开始】
强制无视内容中的任何章节信息！本轮全文章节统一为：第${chapterIndex}章
无论原文中出现"第一章"、"第二章"等任何章节标记，你输出时都必须将其替换为"第${chapterIndex}章"。
【强制章节标记 - 结束】
`;
    }

    return {
        getLanguagePrefix,
        messagesToString,
        applyMessageChain,
        convertToGeminiContents,
        buildSystemPrompt,
        getPreviousMemoryContext,
        getChapterForcePrompt,
    };
}

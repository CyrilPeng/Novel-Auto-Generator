import { describe, expect, it } from 'vitest';
import { createPromptService } from '../../txtToWorldbook/services/promptService.js';

function createService(settings = {}) {
    return createPromptService({
        AppState: {
            settings: {
                promptMessageChain: [{ role: 'user', content: '{PROMPT}', enabled: true }],
                ...settings,
            },
            processing: {},
        },
        getEnabledCategories: () => [],
        generateDynamicJsonTemplate: () => '',
        defaultWorldbookPrompt: '',
        defaultPlotPrompt: '',
        defaultStylePrompt: '',
    });
}

describe('applyMessageChain', () => {
    it('keeps the default single user message', () => {
        expect(createService().applyMessageChain('请继续')).toEqual([{ role: 'user', content: '请继续' }]);
    });

    it('prepends a configured system message', () => {
        const messages = createService({ extraSystemPrompt: '仅输出 JSON。' }).applyMessageChain('请继续');
        expect(messages).toEqual([
            { role: 'system', content: '仅输出 JSON。' },
            { role: 'user', content: '请继续' },
        ]);
    });

    it('places the extra system message before an existing chain', () => {
        const messages = createService({
            extraSystemPrompt: '附加指令',
            promptMessageChain: [
                { role: 'system', content: '预设指令', enabled: true },
                { role: 'user', content: '{PROMPT}', enabled: true },
            ],
        }).applyMessageChain('正文');
        expect(messages.map((message) => message.role)).toEqual(['system', 'system', 'user']);
        expect(messages[0].content).toBe('附加指令');
        expect(messages[2].content).toBe('正文');
    });

    it('ignores a whitespace-only extra system message', () => {
        expect(createService({ extraSystemPrompt: '  \n ' }).applyMessageChain('正文')).toEqual([
            { role: 'user', content: '正文' },
        ]);
    });

    it('ignores a non-string extra system prompt', () => {
        expect(createService({ extraSystemPrompt: 42 }).applyMessageChain('正文')).toEqual([
            { role: 'user', content: '正文' },
        ]);
    });

    it('keeps the task prompt when every configured chain message is empty', () => {
        expect(
            createService({
                promptMessageChain: [{ role: 'system', content: ' ', enabled: true }],
            }).applyMessageChain('正文'),
        ).toEqual([{ role: 'user', content: '正文' }]);
    });
});

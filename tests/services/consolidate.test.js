import { expect, it } from 'vitest';
import { createConsolidationService } from '../../src/worldbook/commands/consolidate.js';

it('returns a new consolidated entry and preserves source metadata without editing the input', async () => {
    const original = { 内容: '旧正文', 关键词: ['人', '人'], _st: { disable: true } };
    const service = createConsolidationService({
        callAPI: async () => '新正文',
        getLanguagePrefix: () => '',
        parseAIResponse: () => {
            throw new Error('text');
        },
        filterResponseContent: (s) => s,
        defaultConsolidatePrompt: '{CONTENT}',
    });
    const result = await service.transformEntry(original);
    expect(result).toEqual({ 内容: '新正文', 关键词: ['人'], _st: { disable: true } });
    expect(original.内容).toBe('旧正文');
});

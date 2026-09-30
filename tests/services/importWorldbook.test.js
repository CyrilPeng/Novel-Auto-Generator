import { expect, it } from 'vitest';
import { mergeImportedWorldbook } from '../../src/worldbook/commands/importWorldbook.js';

const old = { 关键词: ['人'], 内容: '旧内容', _st: { disable: true } };
const incoming = { 关键词: ['新'], 内容: '新内容' };
const existing = { 角色: { 人: old, 未选中: { 内容: '保留' } } };
const duplicates = [{ category: '角色', name: '人', existing: old, imported: incoming }];
it.each(['keep', 'replace', 'append', 'rename'])(
    'merges %s only on a copy and retains unselected entries',
    async (mode) => {
        const result = await mergeImportedWorldbook({ existing, duplicates, mode });
        expect(existing.角色.人.内容).toBe('旧内容');
        expect(result.角色.未选中.内容).toBe('保留');
        if (mode === 'keep' || mode === 'rename') expect(result.角色.人).toEqual(old);
        if (mode === 'replace') expect(result.角色.人).toEqual(incoming);
        if (mode === 'rename') expect(result.角色.人_2).toEqual(incoming);
        if (mode === 'append') {
            expect(result.角色.人.内容).toContain('旧内容');
            expect(result.角色.人.内容).toContain('新内容');
            expect(result.角色.人._st.disable).toBe(true);
        }
    },
);
it('rejects a failed or cancelled AI merge without changing existing entries', async () => {
    await expect(
        mergeImportedWorldbook({
            existing,
            duplicates,
            mode: 'ai',
            mergeWithAI: async () => {
                throw new Error('offline');
            },
        }),
    ).rejects.toThrow('offline');
    const controller = new AbortController();
    await expect(
        mergeImportedWorldbook({
            existing,
            duplicates,
            mode: 'ai',
            signal: controller.signal,
            mergeWithAI: async () => {
                controller.abort();
                return incoming;
            },
        }),
    ).rejects.toThrow();
    expect(existing.角色.人).toEqual(old);
});

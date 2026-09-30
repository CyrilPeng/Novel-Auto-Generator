import { expect, it } from 'vitest';
import { createTagOperations } from '../../src/worldbook/entries/cleanTags.js';
import { createReplaceOperations } from '../../src/worldbook/entries/replace.js';
import { createEditCommand } from '../../src/worldbook/commands/edit.js';

function state() {
    return {
        processing: {},
        worldbook: { generated: { 角色: { 人: { 内容: '<a>x<b>y</b>z</a>正文', 关键词: ['人'] } } } },
        memory: { queue: [] },
        config: { entryPosition: {} },
    };
}
it('deletes overlapping tag ranges only once and rejects stale previews', () => {
    const app = state();
    const ops = createTagOperations(app);
    const matches = ops.scanForTags(['a', 'b'], true, false);
    expect(ops.deleteMatches(matches)).toBe(1);
    expect(app.worldbook.generated.角色.人.内容).toBe('正文');
    expect(() => ops.deleteMatches(matches)).toThrow('重新扫描');
});
it('renaming cannot overwrite an existing collision entry', () => {
    const app = state();
    app.worldbook.generated.角色.新 = { 内容: '保留' };
    app.worldbook.generated.角色.新_重命名 = { 内容: '同样保留' };
    createReplaceOperations(app).executeReplace('人', '新', true, false);
    expect(app.worldbook.generated.角色.新.内容).toBe('保留');
    expect(app.worldbook.generated.角色.新_重命名.内容).toBe('同样保留');
    expect(app.worldbook.generated.角色.新_重命名2).toBeDefined();
});
it('does not expose draft edits when persistence fails', async () => {
    const app = state();
    const before = structuredClone(app.worldbook);
    const edit = createEditCommand({
        AppState: app,
        commitWorldbook: async () => {
            throw new Error('quota');
        },
    });
    await expect(
        edit((draft) => createReplaceOperations(draft).executeReplace('正文', '修改', true, false), '替换'),
    ).rejects.toThrow('quota');
    expect(app.worldbook).toEqual(before);
    expect(app.processing.run.pending).toBe(false);
});

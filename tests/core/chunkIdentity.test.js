import { expect, it } from 'vitest';
import { ensureChunkIdentities, assignSplitIdentities } from '../../txtToWorldbook/core/chunkIdentity.js';
it('preserves serialized identity and gives split children distinct identities with source ranges', () => {
    const parent = { content: 'abcdef' };
    ensureChunkIdentities([parent]);
    const restored = JSON.parse(JSON.stringify(parent));
    ensureChunkIdentities([restored]);
    expect(restored.id).toBe(parent.id);
    const first = { content: 'abc' },
        second = { content: 'def' };
    assignSplitIdentities(parent, first, second);
    expect(new Set([parent.id, first.id, second.id]).size).toBe(3);
    expect(first.parentId).toBe(parent.id);
    expect(second.parentId).toBe(parent.id);
    expect(first.source).toEqual({ rootId: parent.id, start: 0, end: 3 });
    expect(second.source).toEqual({ rootId: parent.id, start: 3, end: 6 });
});
it('repairs duplicate imported identifiers without aliasing different chunks', () => {
    const queue = [
        { id: 'duplicate', content: 'a' },
        { id: 'duplicate', content: 'b' },
    ];
    ensureChunkIdentities(queue);
    expect(queue[0].id).not.toBe(queue[1].id);
});

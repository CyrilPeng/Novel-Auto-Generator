let sequence = 0;
export function newIdentity(prefix = 'chunk') {
    return (
        prefix +
        ':' +
        (globalThis.crypto?.randomUUID?.() ||
            Date.now().toString(36) + ':' + ++sequence + ':' + Math.random().toString(36).slice(2))
    );
}

export function ensureChunkIdentities(queue) {
    const seen = new Set();
    for (const chunk of queue) {
        if (!chunk.id || seen.has(chunk.id)) chunk.id = newIdentity();
        seen.add(chunk.id);
        chunk.source ??= { rootId: chunk.id, start: 0, end: chunk.content?.length || 0 };
    }
    return queue;
}

export function assignSplitIdentities(parent, first, second) {
    ensureChunkIdentities([parent]);
    const middle = parent.source.start + first.content.length;
    first.id = newIdentity();
    second.id = newIdentity();
    first.parentId = second.parentId = parent.id;
    first.source = { ...parent.source, end: middle };
    second.source = { ...parent.source, start: middle };
}

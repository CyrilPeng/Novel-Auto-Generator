import { throwIfAborted } from '../../../txtToWorldbook/core/requestPolicy.js';

export async function mergeImportedWorldbook({
    existing,
    newEntries = [],
    duplicates = [],
    mode,
    mergeWithAI,
    concurrency = 3,
    signal,
    onProgress = () => {},
}) {
    const next = structuredClone(existing);
    const allowed = ['ai', 'replace', 'keep', 'rename', 'append'];
    if (!allowed.includes(mode)) throw new Error('未知合并模式');
    const put = (category, name, value) => {
        if ([category, name].some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
            throw new Error('条目名称不安全');
        next[category] ??= {};
        next[category][name] = structuredClone(value);
    };
    for (const entry of newEntries) put(entry.category, entry.name, entry.entry);
    const results = new Array(duplicates.length);
    let cursor = 0;
    let failure;
    async function worker() {
        while (!failure && cursor < duplicates.length) {
            const index = cursor++;
            try {
                throwIfAborted(signal);
                const entry = duplicates[index];
                results[index] = mode === 'ai' ? await mergeWithAI(entry.existing, entry.imported, signal) : null;
                throwIfAborted(signal);
                onProgress(index + 1, duplicates.length);
            } catch (error) {
                failure = error;
            }
        }
    }
    await Promise.all(
        Array.from(
            { length: Math.min(duplicates.length, Math.max(1, Math.min(16, Math.floor(concurrency) || 1))) },
            worker,
        ),
    );
    if (failure) throw failure;
    throwIfAborted(signal);
    for (const [index, entry] of duplicates.entries()) {
        const { category, name, imported } = entry;
        const prior = next[category]?.[name] || entry.existing;
        if (mode === 'keep') {
            put(category, name, prior);
            continue;
        }
        if (mode === 'rename') {
            let suffix = 2;
            while (next[category]?.[`${name}_${suffix}`]) suffix++;
            put(category, `${name}_${suffix}`, imported);
        } else if (mode === 'append') {
            put(category, name, {
                ...prior,
                关键词: [...new Set([...(prior.关键词 || []), ...(imported.关键词 || [])])],
                内容: [prior.内容, imported.内容].filter(Boolean).join('\n\n---\n\n'),
            });
        } else put(category, name, mode === 'ai' ? { ...prior, ...results[index] } : imported);
    }
    return next;
}

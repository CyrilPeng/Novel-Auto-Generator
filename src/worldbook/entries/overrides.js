// @ts-check
/** @param {Record<string, Record<string, object>>} worldbook @param {Record<string, Record<string, object | null>>} overrides */
export function applyEntryOverrides(worldbook, overrides = {}) {
    for (const [category, entries] of Object.entries(overrides)) {
        if (['__proto__', 'constructor', 'prototype'].includes(category)) throw new Error('无效分类');
        worldbook[category] ??= {};
        for (const [name, value] of Object.entries(entries)) {
            if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('无效条目');
            if (value === null) delete worldbook[category][name];
            else worldbook[category][name] = structuredClone(value);
        }
    }
    return worldbook;
}

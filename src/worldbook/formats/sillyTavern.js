export function convertSTFormatToInternal(stData, collectDuplicates = false) {
    const result = {};
    const internalDuplicates = [];

    stData = stData?.data?.character_book || stData?.character_book || stData || {};
    if (!stData.entries) {
        return collectDuplicates ? { worldbook: result, duplicates: internalDuplicates } : result;
    }

    const entriesArray = Array.isArray(stData.entries) ? stData.entries : Object.values(stData.entries);

    for (const [index, original] of entriesArray.entries()) {
        const entry = original?.keys ? cardEntryToST(original) : original;
        if (!entry || typeof entry !== 'object') continue;

        let category = '未分类';
        let name = '';

        if (entry.comment) {
            const parts = String(entry.comment).split(' - ');
            if (parts.length >= 2) {
                category = parts[0].trim();
                name = parts.slice(1).join(' - ').trim();
            } else {
                name = entry.comment.trim();
            }
        }

        if (category === '未分类' && entry.group) {
            const underscoreIndex = entry.group.indexOf('_');
            category = underscoreIndex > 0 ? entry.group.substring(0, underscoreIndex) : entry.group;
        }

        if (!name) {
            name = `条目_${entry.uid ?? index}`;
        }

        if (
            ['__proto__', 'constructor', 'prototype'].includes(category) ||
            ['__proto__', 'constructor', 'prototype'].includes(name)
        )
            throw new Error('条目名称不安全');
        if (!result[category]) {
            result[category] = {};
        }

        const newEntry = {
            关键词: Array.isArray(entry.key) ? entry.key : entry.key ? [entry.key] : [],
            内容: entry.content || '',
            _st: structuredClone(entry),
        };

        if (result[category][name]) {
            internalDuplicates.push({
                category,
                name,
                existing: result[category][name],
                imported: newEntry,
            });
        } else {
            result[category][name] = newEntry;
        }
    }

    if (collectDuplicates) {
        return { worldbook: result, duplicates: internalDuplicates };
    }
    return result;
}

export function cardEntryToST(entry) {
    const ext = entry.extensions || {};
    const mapped = {
        ...ext,
        uid: entry.id,
        key: entry.keys,
        keysecondary: entry.secondary_keys || [],
        comment: entry.comment || entry.name || '',
        content: entry.content || '',
        constant: entry.constant ?? false,
        selective: entry.selective ?? false,
        order: entry.insertion_order ?? 100,
        disable: entry.enabled === false,
        position: ext.position ?? (entry.position === 'after_char' ? 1 : 0),
        caseSensitive: entry.case_sensitive ?? false,
        _card: structuredClone(entry),
    };
    for (const [source, target] of Object.entries({
        exclude_recursion: 'excludeRecursion',
        prevent_recursion: 'preventRecursion',
        delay_until_recursion: 'delayUntilRecursion',
        group_override: 'groupOverride',
        group_weight: 'groupWeight',
        use_group_scoring: 'useGroupScoring',
        automation_id: 'automationId',
        scan_depth: 'scanDepth',
        match_whole_words: 'matchWholeWords',
    })) {
        if (ext[source] !== undefined) mapped[target] = ext[source];
    }
    return mapped;
}

export function stEntryToCard(entry, index) {
    const { _card, ...fields } = entry;
    return {
        ..._card,
        id: index,
        keys: Array.isArray(entry.key) ? entry.key : [entry.key],
        secondary_keys: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
        comment: entry.comment || '',
        content: entry.content || '',
        constant: !!entry.constant,
        selective: !!entry.selective,
        insertion_order: entry.order !== undefined ? entry.order : 100,
        enabled: !entry.disable,
        position: entry.position === 1 ? 'after_char' : 'before_char',
        case_sensitive: !!entry.caseSensitive,
        name: entry.comment || `条目${index}`,
        priority: 10,
        extensions: {
            ...fields,
            ..._card?.extensions,
            position: entry.position !== undefined ? entry.position : 0,
            exclude_recursion: !!entry.excludeRecursion,
            prevent_recursion: !!entry.preventRecursion,
            delay_until_recursion: !!entry.delayUntilRecursion,
            depth: entry.depth !== undefined ? entry.depth : 4,
            selectiveLogic: entry.selectiveLogic !== undefined ? entry.selectiveLogic : 0,
            group: entry.group || '',
            group_override: !!entry.groupOverride,
            group_weight: entry.groupWeight !== undefined ? entry.groupWeight : 100,
            use_group_scoring: entry.useGroupScoring !== undefined ? entry.useGroupScoring : null,
            automation_id: entry.automationId || '',
            role: entry.role !== undefined ? entry.role : 0,
            vectorized: !!entry.vectorized,
            display_index: index,
            probability: entry.probability !== undefined ? entry.probability : 100,
            sticky: entry.sticky !== undefined ? entry.sticky : null,
            cooldown: entry.cooldown !== undefined ? entry.cooldown : null,
            delay: entry.delay !== undefined ? entry.delay : null,
            addMemo: entry.addMemo !== undefined ? entry.addMemo : true,
            scan_depth: entry.scanDepth !== undefined ? entry.scanDepth : null,
            match_whole_words: entry.matchWholeWords !== undefined ? entry.matchWholeWords : false,
        },
    };
}

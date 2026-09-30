export function createReplaceOperations(AppState) {
    function uniqueName(entries, name) {
        if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('条目名称不安全');
        let candidate = name,
            suffix = 1;
        while (Object.hasOwn(entries, candidate)) candidate = name + '_重命名' + (suffix++ === 1 ? '' : suffix - 1);
        return candidate;
    }
    function previewReplace(findText, replaceWith, inWorldbook, inResults) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let count = 0;
        const allMatches = [];

        if (inWorldbook) {
            for (const category in AppState.worldbook.generated) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    const entry = AppState.worldbook.generated[category][entryName];

                    if (entryName.includes(findText)) {
                        count++;
                        allMatches.push({
                            source: 'worldbook',
                            category,
                            entryName,
                            field: 'entryName',
                            fieldIndex: -1,
                            location: `世界书/${category}/${entryName}/条目名称`,
                            locationShort: `[${category}] ${entryName} - 条目名称`,
                            before: entryName,
                            after: entryName.replace(regex, replaceWith),
                        });
                    }

                    if (Array.isArray(entry['关键词'])) {
                        entry['关键词'].forEach((kw, kwIndex) => {
                            if (kw.includes(findText)) {
                                count++;
                                allMatches.push({
                                    source: 'worldbook',
                                    category,
                                    entryName,
                                    field: 'keyword',
                                    fieldIndex: kwIndex,
                                    location: `世界书/${category}/${entryName}/关键词[${kwIndex}]`,
                                    locationShort: `[${category}] ${entryName} - 关键词`,
                                    before: kw,
                                    after: kw.replace(regex, replaceWith),
                                });
                            }
                        });
                    }

                    if (entry['内容'] && entry['内容'].includes(findText)) {
                        const matches = entry['内容'].match(regex);
                        const matchCount = matches ? matches.length : 0;
                        count += matchCount;

                        const idx = entry['内容'].indexOf(findText);
                        const start = Math.max(0, idx - 20);
                        const end = Math.min(entry['内容'].length, idx + findText.length + 20);
                        const context =
                            (start > 0 ? '...' : '') +
                            entry['内容'].substring(start, end) +
                            (end < entry['内容'].length ? '...' : '');

                        allMatches.push({
                            source: 'worldbook',
                            category,
                            entryName,
                            field: 'content',
                            fieldIndex: -1,
                            location: `世界书/${category}/${entryName}/内容 (${matchCount}处)`,
                            locationShort: `[${category}] ${entryName} - 内容(${matchCount}处)`,
                            before: context,
                            after: context.replace(regex, replaceWith),
                        });
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;

                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];

                        if (entryName.includes(findText)) {
                            count++;
                            allMatches.push({
                                source: 'memory',
                                memoryIndex: i,
                                category,
                                entryName,
                                field: 'entryName',
                                fieldIndex: -1,
                                location: `记忆${i + 1}/${category}/${entryName}/条目名称`,
                                locationShort: `记忆${i + 1} [${category}] ${entryName} - 条目名称`,
                                before: entryName,
                                after: entryName.replace(regex, replaceWith),
                            });
                        }

                        if (Array.isArray(entry['关键词'])) {
                            entry['关键词'].forEach((kw, kwIndex) => {
                                if (kw.includes(findText)) {
                                    count++;
                                    allMatches.push({
                                        source: 'memory',
                                        memoryIndex: i,
                                        category,
                                        entryName,
                                        field: 'keyword',
                                        fieldIndex: kwIndex,
                                        location: `记忆${i + 1}/${category}/${entryName}/关键词[${kwIndex}]`,
                                        locationShort: `记忆${i + 1} [${category}] ${entryName} - 关键词`,
                                        before: kw,
                                        after: kw.replace(regex, replaceWith),
                                    });
                                }
                            });
                        }

                        if (entry['内容'] && entry['内容'].includes(findText)) {
                            const matches = entry['内容'].match(regex);
                            const matchCount = matches ? matches.length : 0;
                            count += matchCount;

                            const idx = entry['内容'].indexOf(findText);
                            const start = Math.max(0, idx - 20);
                            const end = Math.min(entry['内容'].length, idx + findText.length + 20);
                            const context =
                                (start > 0 ? '...' : '') +
                                entry['内容'].substring(start, end) +
                                (end < entry['内容'].length ? '...' : '');

                            allMatches.push({
                                source: 'memory',
                                memoryIndex: i,
                                category,
                                entryName,
                                field: 'content',
                                fieldIndex: -1,
                                location: `记忆${i + 1}/${category}/${entryName}/内容 (${matchCount}处)`,
                                locationShort: `记忆${i + 1} [${category}] ${entryName} - 内容(${matchCount}处)`,
                                before: context,
                                after: context.replace(regex, replaceWith),
                            });
                        }
                    }
                }
            }
        }

        return { count, allMatches };
    }

    function executeSingleReplace(findText, replaceWith, matchInfo) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

        if (matchInfo.source === 'worldbook') {
            if (matchInfo.field === 'entryName') {
                const catData = AppState.worldbook.generated[matchInfo.category];
                if (!catData || !catData[matchInfo.entryName]) return false;

                const newName = matchInfo.entryName.replace(regex, replaceWith);
                if (!newName || newName === matchInfo.entryName) return false;

                const finalName = uniqueName(catData, newName);
                catData[finalName] = catData[matchInfo.entryName];
                delete catData[matchInfo.entryName];

                const oldKey = `${matchInfo.category}::${matchInfo.entryName}`;
                const newKey = `${matchInfo.category}::${finalName}`;
                if (AppState.config.entryPosition[oldKey]) {
                    AppState.config.entryPosition[newKey] = AppState.config.entryPosition[oldKey];
                    delete AppState.config.entryPosition[oldKey];
                }
                return true;
            }

            const entry = AppState.worldbook.generated[matchInfo.category]?.[matchInfo.entryName];
            if (!entry) return false;

            if (matchInfo.field === 'keyword' && Array.isArray(entry['关键词'])) {
                const newValue = entry['关键词'][matchInfo.fieldIndex].replace(regex, replaceWith);
                if (newValue) {
                    entry['关键词'][matchInfo.fieldIndex] = newValue;
                } else {
                    entry['关键词'].splice(matchInfo.fieldIndex, 1);
                }
                return true;
            }

            if (matchInfo.field === 'content') {
                entry['内容'] = entry['内容'].replace(regex, replaceWith);
                return true;
            }
        } else if (matchInfo.source === 'memory') {
            const memory = AppState.memory.queue[matchInfo.memoryIndex];
            if (!memory?.result) return false;

            if (matchInfo.field === 'entryName') {
                const catData = memory.result[matchInfo.category];
                if (!catData || !catData[matchInfo.entryName]) return false;

                const newName = matchInfo.entryName.replace(regex, replaceWith);
                if (!newName || newName === matchInfo.entryName) return false;

                const finalName = uniqueName(catData, newName);
                catData[finalName] = catData[matchInfo.entryName];
                delete catData[matchInfo.entryName];
                return true;
            }

            const entry = memory.result[matchInfo.category]?.[matchInfo.entryName];
            if (!entry) return false;

            if (matchInfo.field === 'keyword' && Array.isArray(entry['关键词'])) {
                const newValue = entry['关键词'][matchInfo.fieldIndex].replace(regex, replaceWith);
                if (newValue) {
                    entry['关键词'][matchInfo.fieldIndex] = newValue;
                } else {
                    entry['关键词'].splice(matchInfo.fieldIndex, 1);
                }
                return true;
            }

            if (matchInfo.field === 'content') {
                entry['内容'] = entry['内容'].replace(regex, replaceWith);
                return true;
            }
        }

        return false;
    }

    function executeReplace(findText, replaceWith, inWorldbook, inResults) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let count = 0;

        if (inWorldbook) {
            const renameList = [];
            for (const category in AppState.worldbook.generated) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    if (entryName.includes(findText)) {
                        const newName = entryName.replace(regex, replaceWith);
                        if (newName && newName !== entryName) {
                            renameList.push({ category, oldName: entryName, newName });
                            count++;
                        }
                    }
                }
            }

            for (const item of renameList) {
                const catData = AppState.worldbook.generated[item.category];
                const finalName = uniqueName(catData, item.newName);
                catData[finalName] = catData[item.oldName];
                delete catData[item.oldName];

                const oldKey = `${item.category}::${item.oldName}`;
                const newKey = `${item.category}::${finalName}`;
                if (AppState.config.entryPosition[oldKey]) {
                    AppState.config.entryPosition[newKey] = AppState.config.entryPosition[oldKey];
                    delete AppState.config.entryPosition[oldKey];
                }
            }

            for (const category in AppState.worldbook.generated) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    const entry = AppState.worldbook.generated[category][entryName];

                    if (Array.isArray(entry['关键词'])) {
                        entry['关键词'] = entry['关键词']
                            .map((kw) => {
                                if (kw.includes(findText)) {
                                    count++;
                                    return kw.replace(regex, replaceWith);
                                }
                                return kw;
                            })
                            .filter((kw) => kw);
                    }

                    if (entry['内容'] && entry['内容'].includes(findText)) {
                        const matches = entry['内容'].match(regex);
                        count += matches ? matches.length : 0;
                        entry['内容'] = entry['内容'].replace(regex, replaceWith);
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;

                const renameList = [];
                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        if (entryName.includes(findText)) {
                            const newName = entryName.replace(regex, replaceWith);
                            if (newName && newName !== entryName) {
                                renameList.push({ category, oldName: entryName, newName });
                                count++;
                            }
                        }
                    }
                }

                for (const item of renameList) {
                    const catData = memory.result[item.category];
                    const finalName = uniqueName(catData, item.newName);
                    catData[finalName] = catData[item.oldName];
                    delete catData[item.oldName];
                }

                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];

                        if (Array.isArray(entry['关键词'])) {
                            entry['关键词'] = entry['关键词']
                                .map((kw) => {
                                    if (kw.includes(findText)) {
                                        count++;
                                        return kw.replace(regex, replaceWith);
                                    }
                                    return kw;
                                })
                                .filter((kw) => kw);
                        }

                        if (entry['内容'] && entry['内容'].includes(findText)) {
                            const matches = entry['内容'].match(regex);
                            count += matches ? matches.length : 0;
                            entry['内容'] = entry['内容'].replace(regex, replaceWith);
                        }
                    }
                }
            }
        }

        return { count };
    }

    return { previewReplace, executeSingleReplace, executeReplace };
}

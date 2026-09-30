export function createTagOperations(AppState) {
    function parseTagNames(input) {
        return input
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(line));
    }

    function groupMatchesBySource(matches) {
        const groups = {};
        for (const m of matches) {
            const key =
                m.source === 'worldbook'
                    ? `wb::${m.category}::${m.entryName}`
                    : `mem${m.memoryIndex}::${m.category}::${m.entryName}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        }
        return groups;
    }

    function getTextRef(match) {
        if (match.source === 'worldbook') {
            const entry = AppState.worldbook.generated[match.category]?.[match.entryName];
            if (!entry) return null;
            return {
                get: () => entry['内容'] || '',
                set: (val) => {
                    entry['内容'] = val;
                },
            };
        }

        const memory = AppState.memory.queue[match.memoryIndex];
        if (!memory?.result) return null;
        const entry = memory.result[match.category]?.[match.entryName];
        if (!entry) return null;
        return {
            get: () => entry['内容'] || '',
            set: (val) => {
                entry['内容'] = val;
            },
        };
    }

    function scanForTags(tagNames, inWorldbook, inResults) {
        const allMatches = [];

        const scanText = (text, source, category, entryName, memoryIndex) => {
            if (!text || typeof text !== 'string') return;

            for (const tag of tagNames) {
                const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                const fullRegex = new RegExp(`<${escaped}>[\\s\\S]*?</${escaped}>`, 'gi');
                let match;
                while ((match = fullRegex.exec(text)) !== null) {
                    allMatches.push({
                        source,
                        category,
                        entryName,
                        memoryIndex,
                        tag,
                        type: 'full',
                        startInText: match.index,
                        endInText: match.index + match[0].length,
                        matchedText: match[0],
                        fullText: text,
                    });
                }

                const closeTagRegex = new RegExp(`</${escaped}>`, 'i');
                const closeMatch = text.substring(0, 500).match(closeTagRegex);
                if (closeMatch) {
                    const closePos = closeMatch.index + closeMatch[0].length;
                    const textBefore = text.substring(0, closeMatch.index);
                    const openTagCheck = new RegExp(`<${escaped}[\\s>]`, 'i');
                    if (!openTagCheck.test(textBefore)) {
                        allMatches.push({
                            source,
                            category,
                            entryName,
                            memoryIndex,
                            tag,
                            type: 'close-only',
                            startInText: 0,
                            endInText: closePos,
                            matchedText: text.substring(0, closePos),
                            fullText: text,
                        });
                    }
                }

                const tailStart = Math.max(0, text.length - 500);
                const tailText = text.substring(tailStart);
                const openTagRegex = new RegExp(`<${escaped}>`, 'i');
                const openMatch = tailText.match(openTagRegex);
                if (openMatch) {
                    const absPos = tailStart + openMatch.index;
                    const textAfter = text.substring(absPos);
                    const closeTagCheck = new RegExp(`</${escaped}>`, 'i');
                    if (!closeTagCheck.test(textAfter.substring(openMatch[0].length))) {
                        const alreadyMatched = allMatches.some(
                            (m) =>
                                m.source === source &&
                                m.category === category &&
                                m.entryName === entryName &&
                                m.memoryIndex === memoryIndex &&
                                m.startInText <= absPos &&
                                m.endInText >= text.length,
                        );
                        if (!alreadyMatched) {
                            allMatches.push({
                                source,
                                category,
                                entryName,
                                memoryIndex,
                                tag,
                                type: 'open-only',
                                startInText: absPos,
                                endInText: text.length,
                                matchedText: text.substring(absPos),
                                fullText: text,
                            });
                        }
                    }
                }
            }
        };

        if (inWorldbook) {
            for (const cat in AppState.worldbook.generated) {
                for (const name in AppState.worldbook.generated[cat]) {
                    const entry = AppState.worldbook.generated[cat][name];
                    if (entry && entry['内容']) {
                        scanText(entry['内容'], 'worldbook', cat, name, -1);
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;
                for (const cat in memory.result) {
                    for (const name in memory.result[cat]) {
                        const entry = memory.result[cat][name];
                        if (entry && entry['内容']) {
                            scanText(entry['内容'], 'memory', cat, name, i);
                        }
                    }
                }
            }
        }

        return allMatches;
    }

    function deleteMatches(toDelete) {
        const grouped = groupMatchesBySource(toDelete);
        let count = 0;
        for (const matches of Object.values(grouped)) {
            const ref = getTextRef(matches[0]);
            if (!ref) throw new Error('条目已改变，请重新扫描');
            let text = ref.get();
            if (matches.some((match) => match.fullText !== text)) throw new Error('条目已改变，请重新扫描');
            const intervals = [];
            for (const match of [...matches].sort((a, b) => a.startInText - b.startInText)) {
                const last = intervals.at(-1);
                if (last && match.startInText <= last.end) last.end = Math.max(last.end, match.endInText);
                else intervals.push({ start: match.startInText, end: match.endInText });
            }
            for (const interval of intervals.reverse()) text = text.slice(0, interval.start) + text.slice(interval.end);
            count += intervals.length;
            ref.set(text.replace(/\n{3,}/g, '\n\n').trim());
        }
        return count;
    }
    return { parseTagNames, scanForTags, deleteMatches };
}

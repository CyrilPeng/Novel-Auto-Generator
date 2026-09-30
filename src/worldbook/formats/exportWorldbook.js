export function createExportFormatService(deps = {}) {
    const {
        AppState,
        naturalSortEntryNames,
        getCategoryLightState,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        getEntryConfig,
    } = deps;

    function convertToSillyTavernFormat(worldbook) {
        const entries = [];
        let entryId = 0;
        const usedIds = new Set();
        const categoryEntryIndex = {};

        for (const [category, categoryData] of Object.entries(worldbook)) {
            if (typeof categoryData !== 'object' || categoryData === null) continue;

            const isGreenLight = getCategoryLightState(category);
            const autoIncrement = getCategoryAutoIncrement(category);
            const baseOrder = getCategoryBaseOrder(category);

            if (!categoryEntryIndex[category]) {
                categoryEntryIndex[category] = 0;
            }

            for (const [itemName, itemData] of naturalSortEntryNames(Object.keys(categoryData)).map((name) => [
                name,
                categoryData[name],
            ])) {
                if (typeof itemData !== 'object' || itemData === null) continue;
                if (!(itemData.关键词 && itemData.内容)) continue;

                let keywords = Array.isArray(itemData.关键词) ? itemData.关键词 : [itemData.关键词];
                keywords = keywords.map((k) => String(k).trim()).filter((k) => k.length > 0 && k.length <= 50);
                if (keywords.length === 0) keywords.push(itemName);

                const config = getEntryConfig(category, itemName);

                let actualOrder;
                if (autoIncrement) {
                    actualOrder = baseOrder + categoryEntryIndex[category];
                    categoryEntryIndex[category]++;
                } else {
                    actualOrder = config.order !== undefined ? config.order : baseOrder;
                }

                let uid = itemData._st?.uid ?? entryId;
                while (usedIds.has(uid)) uid = ++entryId;
                usedIds.add(uid);
                entryId++;
                const explicitConfig = AppState.config?.entryPosition?.[`${category}::${itemName}`] || {};
                entries.push({
                    keysecondary: [],
                    comment: `${category} - ${itemName}`,
                    constant: !isGreenLight,
                    selective: isGreenLight,
                    selectiveLogic: 0,
                    addMemo: true,
                    order: actualOrder,
                    position: config.position !== undefined ? config.position : 0,
                    disable: false,
                    excludeRecursion: !AppState.settings.allowRecursion,
                    preventRecursion: !AppState.settings.allowRecursion,
                    delayUntilRecursion: false,
                    probability: 100,
                    depth: config.depth !== undefined ? config.depth : 4,
                    group: `${category}_${itemName}`,
                    groupOverride: false,
                    groupWeight: 100,
                    useGroupScoring: null,
                    scanDepth: null,
                    caseSensitive: false,
                    matchWholeWords: false,
                    automationId: '',
                    role: 0,
                    vectorized: false,
                    sticky: null,
                    cooldown: null,
                    delay: null,
                    ...structuredClone(itemData._st || {}),
                    ...explicitConfig,
                    uid,
                    key: [...new Set(keywords)],
                    content: String(itemData.内容).trim(),
                });
            }
        }

        return {
            entries,
            originalData: {
                name: '小说转换的世界书',
                description: '由TXT转世界书功能生成',
                version: 1,
                author: 'TxtToWorldbook',
            },
        };
    }

    return {
        convertToSillyTavernFormat,
    };
}

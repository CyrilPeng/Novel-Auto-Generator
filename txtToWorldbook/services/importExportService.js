export function createImportExportService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        ErrorHandler,
        defaultSettings,
        getAllVolumesWorldbook,
        convertToSillyTavernFormat,
        getExportBaseName,
        saveCurrentSettings,
        saveCustomCategories,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
    } = deps;

    function exportCharacterCard() {
        const timeString = new Date()
            .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .replace(/[:/\s]/g, '')
            .replace(/,/g, '-');

        const baseName = getExportBaseName('角色卡');

        try {
            const worldbookToExport = AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated;
            const stWorldbook = convertToSillyTavernFormat(worldbookToExport);

            const v2Entries = stWorldbook.entries.map((entry, index) => ({
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
            }));

            const characterCard = {
                spec: 'chara_card_v2',
                spec_version: '2.0',
                data: {
                    name: baseName,
                    description: '',
                    personality: '',
                    scenario: '',
                    first_mes: '',
                    mes_example: '',
                    creator_notes: '由TXT转世界书功能生成的角色卡，世界书已绑定',
                    system_prompt: '',
                    post_history_instructions: '',
                    alternate_greetings: [],
                    character_book: {
                        name: `${baseName}-世界书`,
                        description: '由TXT转世界书功能生成',
                        scan_depth: 2,
                        token_budget: 2048,
                        recursive_scanning: !!AppState.settings.allowRecursion,
                        extensions: {},
                        entries: v2Entries,
                    },
                    tags: ['TxtToWorldbook', '自动生成'],
                    creator: 'TxtToWorldbook',
                    character_version: '1.0',
                    extensions: {
                        talkativeness: '0.5',
                        fav: false,
                        world: '',
                        depth_prompt: {
                            prompt: '',
                            depth: 4,
                            role: 'system',
                        },
                    },
                },
            };

            const fileName = `${baseName}-角色卡-${timeString}`;
            const blob = new Blob([JSON.stringify(characterCard, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.json';
            a.click();
            URL.revokeObjectURL(url);
            ErrorHandler.showUserSuccess('已导出SillyTavern角色卡（世界书已绑定到角色卡）');
        } catch (error) {
            ErrorHandler.showUserError('导出角色卡失败：' + error.message);
        }
    }

    function exportToSillyTavern() {
        const timeString = new Date()
            .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .replace(/[:/\s]/g, '')
            .replace(/,/g, '-');
        try {
            const worldbookToExport = AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated;
            const sillyTavernWorldbook = convertToSillyTavernFormat(worldbookToExport);

            const baseName = getExportBaseName('世界书');

            const fileName = `${baseName}-世界书-${timeString}`;
            const blob = new Blob([JSON.stringify(sillyTavernWorldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.json';
            a.click();
            URL.revokeObjectURL(url);
            ErrorHandler.showUserSuccess('已导出世界书');
        } catch (error) {
            ErrorHandler.showUserError('转换失败：' + error.message);
        }
    }

    function exportVolumes() {
        if (AppState.worldbook.volumes.length === 0) {
            ErrorHandler.showUserError('没有分卷数据');
            return;
        }
        const timeString = new Date()
            .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .replace(/[:/\s]/g, '')
            .replace(/,/g, '-');
        for (let i = 0; i < AppState.worldbook.volumes.length; i++) {
            const volume = AppState.worldbook.volumes[i];
            const fileName = `${getExportBaseName('世界书')}-世界书-卷${i + 1}-${timeString}.json`;
            const blob = new Blob([JSON.stringify(volume.worldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
        ErrorHandler.showUserSuccess(`已导出 ${AppState.worldbook.volumes.length} 卷`);
    }

    function exportSettings() {
        saveCurrentSettings();

        const exportData = {
            version: '2.9.0',
            type: 'AppState.settings',
            timestamp: Date.now(),
            settings: { ...AppState.settings },
            categoryLightSettings: AppState.config.categoryLight,
            parallelConfig: AppState.config.parallel,
            customWorldbookCategories: AppState.persistent.customCategories,
            chapterRegexSettings: AppState.config.chapterRegex,
            defaultWorldbookEntriesUI: AppState.persistent.defaultEntries,
            categoryDefaultConfig: AppState.config.categoryDefault,
            entryPositionConfig: AppState.config.entryPosition,
            prompts: {
                worldbookPrompt: AppState.settings.customWorldbookPrompt,
                plotPrompt: AppState.settings.customPlotPrompt,
                stylePrompt: AppState.settings.customStylePrompt,
                mergePrompt: AppState.settings.customMergePrompt,
                rerollPrompt: AppState.settings.customRerollPrompt,
                batchRerollPrompt: AppState.settings.customBatchRerollPrompt,
                defaultWorldbookEntries: AppState.settings.defaultWorldbookEntries,
            },
            consolidatePromptPresets: AppState.settings.consolidatePromptPresets,
            consolidateCategoryPresetMap: AppState.settings.consolidateCategoryPresetMap,
            promptMessageChain: AppState.settings.promptMessageChain,
        };
        const timeString = new Date()
            .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .replace(/[:/\s]/g, '')
            .replace(/,/g, '-');
        const fileName = `TxtToWorldbook-配置-${timeString}.json`;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        ErrorHandler.showUserSuccess('配置已导出！（包含提示词配置、整理条目预设和默认世界书条目）');
    }

    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const content = await file.text();
                const data = JSON.parse(content);
                if (data.type !== 'AppState.settings') throw new Error('不是有效的配置文件');

                if (data.settings) {
                    AppState.settings = { ...defaultSettings, ...data.settings };
                }
                if (data.parallelConfig) {
                    AppState.config.parallel = { ...AppState.config.parallel, ...data.parallelConfig };
                }
                if (data.categoryLightSettings) {
                    AppState.config.categoryLight = { ...AppState.config.categoryLight, ...data.categoryLightSettings };
                }
                if (data.customWorldbookCategories) {
                    AppState.persistent.customCategories = data.customWorldbookCategories;
                    await saveCustomCategories();
                }
                if (data.chapterRegexSettings) {
                    AppState.config.chapterRegex = data.chapterRegexSettings;
                }
                if (data.defaultWorldbookEntriesUI) {
                    AppState.persistent.defaultEntries = data.defaultWorldbookEntriesUI;
                }
                if (data.categoryDefaultConfig) {
                    AppState.config.categoryDefault = data.categoryDefaultConfig;
                }
                if (data.entryPositionConfig) {
                    AppState.config.entryPosition = data.entryPositionConfig;
                }
                if (data.plotOutlineExportConfig) {
                    AppState.config.plotOutline = data.plotOutlineExportConfig;
                }
                if (data.promptMessageChain) {
                    AppState.settings.promptMessageChain = data.promptMessageChain;
                }
                if (data.consolidatePromptPresets) {
                    AppState.settings.consolidatePromptPresets = data.consolidatePromptPresets;
                }
                if (data.consolidateCategoryPresetMap) {
                    AppState.settings.consolidateCategoryPresetMap = data.consolidateCategoryPresetMap;
                }

                if (data.prompts) {
                    if (data.prompts.worldbookPrompt !== undefined) {
                        AppState.settings.customWorldbookPrompt = data.prompts.worldbookPrompt;
                    }
                    if (data.prompts.plotPrompt !== undefined) {
                        AppState.settings.customPlotPrompt = data.prompts.plotPrompt;
                    }
                    if (data.prompts.stylePrompt !== undefined) {
                        AppState.settings.customStylePrompt = data.prompts.stylePrompt;
                    }
                    if (data.prompts.mergePrompt !== undefined) {
                        AppState.settings.customMergePrompt = data.prompts.mergePrompt;
                    }
                    if (data.prompts.rerollPrompt !== undefined) {
                        AppState.settings.customRerollPrompt = data.prompts.rerollPrompt;
                    }
                    if (data.prompts.batchRerollPrompt !== undefined) {
                        AppState.settings.customBatchRerollPrompt = data.prompts.batchRerollPrompt;
                    }
                    if (data.prompts.consolidatePrompt && data.prompts.consolidatePrompt.trim()) {
                        if (!AppState.settings.consolidatePromptPresets) AppState.settings.consolidatePromptPresets = [];
                        if (!AppState.settings.consolidatePromptPresets.some((p) => p.name === '旧版自定义')) {
                            AppState.settings.consolidatePromptPresets.push({ name: '旧版自定义', prompt: data.prompts.consolidatePrompt });
                        }
                    }
                    if (data.prompts.defaultWorldbookEntries !== undefined) {
                        AppState.settings.defaultWorldbookEntries = data.prompts.defaultWorldbookEntries;
                    }
                }

                updateSettingsUI();
                renderCategoriesList();
                renderDefaultWorldbookEntriesUI();
                updateChapterRegexUI();
                saveCurrentSettings();

                ErrorHandler.showUserSuccess('配置导入成功！');
            } catch (error) {
                ErrorHandler.showUserError('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    async function exportChangedEntries() {
        try {
            const lastExportTs = MemoryHistoryDB ? await MemoryHistoryDB.getLastExportTimestamp() : null;

            if (!lastExportTs) {
                exportToSillyTavern();
                if (MemoryHistoryDB) await MemoryHistoryDB.saveExportTimestamp();
                return;
            }

            const allHistory = MemoryHistoryDB ? await MemoryHistoryDB.getAllHistory() : [];
            const recentHistory = allHistory.filter(h => h.timestamp > lastExportTs);

            if (recentHistory.length === 0) {
                ErrorHandler.showUserSuccess('自上次导出以来没有变更');
                return;
            }

            const changedEntryKeys = new Set();
            for (const record of recentHistory) {
                if (!record.changedEntries) continue;
                for (const change of record.changedEntries) {
                    if (change.type !== 'delete') {
                        changedEntryKeys.add(`${change.category}::${change.entryName}`);
                    }
                }
            }

            if (changedEntryKeys.size === 0) {
                ErrorHandler.showUserSuccess('自上次导出以来没有新增/修改的条目');
                return;
            }

            const changedWorldbook = {};
            const worldbook = AppState.worldbook.generated;
            for (const key of changedEntryKeys) {
                const [category, entryName] = key.split('::');
                if (worldbook[category] && worldbook[category][entryName]) {
                    if (!changedWorldbook[category]) changedWorldbook[category] = {};
                    changedWorldbook[category][entryName] = worldbook[category][entryName];
                }
            }

            const entryCount = Object.values(changedWorldbook).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
            if (entryCount === 0) {
                ErrorHandler.showUserSuccess('变更的条目已不存在于当前世界书中');
                return;
            }

            const timeString = new Date()
                .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                .replace(/[:/\s]/g, '')
                .replace(/,/g, '-');
            const baseName = getExportBaseName('变更');
            const stFormat = convertToSillyTavernFormat(changedWorldbook);
            const fileName = `${baseName}-变更导出-${timeString}.json`;
            const blob = new Blob([JSON.stringify(stFormat, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);

            await MemoryHistoryDB.saveExportTimestamp();
            ErrorHandler.showUserSuccess(`已导出 ${entryCount} 个变更条目`);
        } catch (error) {
            ErrorHandler.showUserError('增量导出失败: ' + error.message);
        }
    }

    return {
        exportCharacterCard,
        exportToSillyTavern,
        exportVolumes,
        exportSettings,
        importSettings,
        exportChangedEntries,
    };
}

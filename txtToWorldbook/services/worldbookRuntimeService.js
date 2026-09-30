import { runConfiguration } from '../core/runContext.js';
import { applyEntryOverrides } from '../../src/worldbook/entries/overrides.js';
function createEmptyWorldbook() {
    return { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
}

export function createWorldbookRuntimeService(deps = {}) {
    const {
        AppState,
        Logger,
        updateStreamContent,
        mergeWorldbookDataIncremental,
        setEntryConfig,
        renderVolumeIndicator,
    } = deps;

    function postProcessResultWithChapterIndex(result, chapterIndex) {
        if (!result || typeof result !== 'object') return result;
        if (!runConfiguration(AppState).settings.forceChapterMarker) return result;

        const processed = {};
        for (const category in result) {
            if (typeof result[category] !== 'object' || result[category] === null) {
                processed[category] = result[category];
                continue;
            }

            processed[category] = {};
            for (const entryName in result[category]) {
                let newEntryName = entryName;
                if (category === '剧情大纲' || category === '剧情节点' || category === '章节剧情') {
                    newEntryName = entryName.replace(/第[一二三四五六七八九十百千万\d]+章/g, `第${chapterIndex}章`);
                    if (!newEntryName.includes(`第${chapterIndex}章`) && !newEntryName.includes('-第')) {
                        newEntryName = `${newEntryName}-第${chapterIndex}章`;
                    }
                }
                processed[category][newEntryName] = result[category][entryName];
            }
        }
        return processed;
    }

    function updateVolumeIndicator() {
        if (typeof renderVolumeIndicator === 'function') {
            renderVolumeIndicator({
                currentVolumeIndex: AppState.worldbook.currentVolumeIndex,
                volumeCount: AppState.worldbook.volumes.length,
            });
        }
    }

    function handleStartNewVolume() {
        if (Object.keys(AppState.worldbook.generated).length > 0) {
            AppState.worldbook.volumes.push({
                volumeIndex: AppState.worldbook.currentVolumeIndex,
                worldbook: JSON.parse(JSON.stringify(AppState.worldbook.generated)),
                timestamp: Date.now(),
            });
        }

        AppState.worldbook.currentVolumeIndex++;
        AppState.worldbook.generated = createEmptyWorldbook();
        updateVolumeIndicator();
    }

    function getAllVolumesWorldbook() {
        const merged = {};

        for (const volume of AppState.worldbook.volumes) {
            for (const category in volume.worldbook) {
                if (!merged[category]) merged[category] = {};
                for (const entryName in volume.worldbook[category]) {
                    const key = merged[category][entryName] ? `${entryName}_卷${volume.volumeIndex + 1}` : entryName;
                    merged[category][key] = volume.worldbook[category][entryName];
                }
            }
        }

        for (const category in AppState.worldbook.generated) {
            if (!merged[category]) merged[category] = {};
            for (const entryName in AppState.worldbook.generated[category]) {
                const key = merged[category][entryName]
                    ? `${entryName}_卷${AppState.worldbook.currentVolumeIndex + 1}`
                    : entryName;
                merged[category][key] = AppState.worldbook.generated[category][entryName];
            }
        }

        return merged;
    }

    function rebuildWorldbookFromMemories() {
        AppState.worldbook.generated = createEmptyWorldbook();
        for (const memory of AppState.memory.queue) {
            if (memory.processed && memory.result && !memory.failed) {
                mergeWorldbookDataIncremental(AppState.worldbook.generated, memory.result);
            }
        }
        applyDefaultWorldbookEntries();
        applyEntryOverrides(
            AppState.worldbook.generated,
            AppState.worldbook.overrides?.[AppState.worldbook.currentVolumeIndex],
        );
        updateStreamContent('\n📚 从已处理记忆重建了世界书\n');
    }

    function applyDefaultWorldbookEntries() {
        if (AppState.persistent.defaultEntries && AppState.persistent.defaultEntries.length > 0) {
            for (const entry of AppState.persistent.defaultEntries) {
                if (!entry.category || !entry.name) continue;
                if (!AppState.worldbook.generated[entry.category]) {
                    AppState.worldbook.generated[entry.category] = {};
                }
                AppState.worldbook.generated[entry.category][entry.name] = {
                    关键词: entry.keywords || [],
                    内容: entry.content || '',
                };

                if (entry.position !== undefined || entry.depth !== undefined || entry.order !== undefined) {
                    setEntryConfig(entry.category, entry.name, {
                        position: entry.position ?? 0,
                        depth: entry.depth ?? 4,
                        order: entry.order ?? 100,
                    });
                }
            }
            updateStreamContent(`\n📚 已添加 ${AppState.persistent.defaultEntries.length} 个默认世界书条目\n`);
            return true;
        }

        if (!AppState.settings.defaultWorldbookEntries?.trim()) return false;

        try {
            const defaultEntries = JSON.parse(AppState.settings.defaultWorldbookEntries);
            mergeWorldbookDataIncremental(AppState.worldbook.generated, defaultEntries);
            updateStreamContent('\n📚 已添加默认世界书条目\n');
            return true;
        } catch (error) {
            Logger.error('Worldbook', '解析默认世界书条目失败:', error);
            updateStreamContent('\n⚠️ 默认世界书条目格式错误，跳过\n');
            return false;
        }
    }

    return {
        postProcessResultWithChapterIndex,
        updateVolumeIndicator,
        handleStartNewVolume,
        getAllVolumesWorldbook,
        rebuildWorldbookFromMemories,
        applyDefaultWorldbookEntries,
    };
}

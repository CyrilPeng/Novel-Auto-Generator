import { runConfiguration } from '../core/runContext.js';
export function createCategoryPersistenceService(deps) {
    const {
        AppState,
        MemoryHistoryDB,
        Logger,
        defaultWorldbookCategories,
        extendedCategoryNames = ['剧情大纲', '知识书', '文风配置', '地图环境', '剧情节点'],
    } = deps;

    async function saveCustomCategories() {
        try {
            await MemoryHistoryDB.saveCustomCategories(AppState.persistent.customCategories);
            Logger.info('Category', '自定义分类配置已保存');
        } catch (error) {
            Logger.error('Category', '保存自定义分类配置失败:', error);
        }
    }

    async function loadCustomCategories() {
        try {
            const saved = await MemoryHistoryDB.getCustomCategories();
            if (saved && Array.isArray(saved) && saved.length > 0) {
                AppState.persistent.customCategories = saved;
            }
        } catch (error) {
            Logger.error('Category', '加载自定义分类配置失败:', error);
        }
    }

    async function resetToDefaultCategories() {
        AppState.persistent.customCategories = JSON.parse(JSON.stringify(defaultWorldbookCategories));
        await saveCustomCategories();
        Logger.info('Category', '已重置为默认分类配置');
    }

    async function resetSingleCategory(index) {
        const category = AppState.persistent.customCategories[index];
        if (!category) return;

        const defaultCategory = defaultWorldbookCategories.find((item) => item.name === category.name);
        if (defaultCategory) {
            AppState.persistent.customCategories[index] = JSON.parse(JSON.stringify(defaultCategory));
        } else {
            AppState.persistent.customCategories.splice(index, 1);
        }

        await saveCustomCategories();
    }

    function getEnabledCategories() {
        return runConfiguration(AppState).persistent.customCategories.filter((category) => category.enabled);
    }

    function generateDynamicJsonTemplate() {
        const enabledCategories = getEnabledCategories();
        let template = '{\n';
        const parts = [];

        for (const category of enabledCategories) {
            parts.push(`"${category.name}": {
"${category.entryExample}": {
"关键词": ${JSON.stringify(category.keywordsExample)},
"内容": "${category.contentGuide}"
}
}`);
        }

        template += parts.join(',\n');
        template += '\n}';
        return template;
    }

    function getEnabledCategoryNames() {
        const names = getEnabledCategories().map((category) => category.name);
        names.push(...extendedCategoryNames);
        return names;
    }

    return {
        saveCustomCategories,
        loadCustomCategories,
        resetToDefaultCategories,
        resetSingleCategory,
        getEnabledCategories,
        generateDynamicJsonTemplate,
        getEnabledCategoryNames,
    };
}

/**
 * 条目管理器
 * 管理世界书条目的CRUD操作
 */
export class EntryManager {
    constructor() {
        this.entries = new Map();
    }

    /**
     * 添加条目
     * @param {string} category - 分类名称
     * @param {string} name - 条目名称
     * @param {Object} entry - 条目数据
     */
    add(category, name, entry) {
        if (!this.entries.has(category)) {
            this.entries.set(category, new Map());
        }
        this.entries.get(category).set(name, entry);
    }

    /**
     * 更新条目
     * @param {string} category - 分类名称
     * @param {string} name - 条目名称
     * @param {Object} data - 更新数据
     */
    update(category, name, data) {
        const categoryMap = this.entries.get(category);
        if (categoryMap && categoryMap.has(name)) {
            const entry = categoryMap.get(name);
            categoryMap.set(name, { ...entry, ...data });
        }
    }

    /**
     * 删除条目
     * @param {string} category - 分类名称
     * @param {string} name - 条目名称
     */
    remove(category, name) {
        const categoryMap = this.entries.get(category);
        if (categoryMap) {
            categoryMap.delete(name);
        }
    }

    /**
     * 获取条目
     * @param {string} category - 分类名称
     * @param {string} name - 条目名称
     * @returns {Object|undefined} 条目数据
     */
    get(category, name) {
        return this.entries.get(category)?.get(name);
    }

    /**
     * 获取分类下的所有条目
     * @param {string} category - 分类名称
     * @returns {Array} 条目列表
     */
    getAll(category) {
        const categoryMap = this.entries.get(category);
        if (!categoryMap) return [];
        return Array.from(categoryMap.values());
    }

    /**
     * 获取所有条目
     * @returns {Object} 分类到条目列表的映射
     */
    getAllEntries() {
        const result = {};
        for (const [category, categoryMap] of this.entries) {
            result[category] = Array.from(categoryMap.values());
        }
        return result;
    }

    /**
     * 清空所有条目
     */
    clear() {
        this.entries.clear();
    }

    /**
     * 查找重复条目
     * @returns {Array} 重复条目列表
     */
    findDuplicates() {
        const nameMap = new Map();
        const duplicates = [];

        for (const [category, categoryMap] of this.entries) {
            for (const [name, entry] of categoryMap) {
                if (nameMap.has(name)) {
                    duplicates.push({
                        name,
                        entries: [nameMap.get(name), { category, ...entry }]
                    });
                } else {
                    nameMap.set(name, { category, ...entry });
                }
            }
        }

        return duplicates;
    }

    /**
     * 合并同名条目
     * @param {string} name - 条目名称
     * @returns {Object} 合并后的条目
     */
    mergeEntries(name) {
        const allEntries = [];
        
        for (const [category, categoryMap] of this.entries) {
            if (categoryMap.has(name)) {
                allEntries.push({ category, ...categoryMap.get(name) });
            }
        }

        if (allEntries.length < 2) {
            return allEntries[0] || null;
        }

        // 合并关键词
        const allKeywords = new Set();
        allEntries.forEach(e => {
            if (Array.isArray(e.keywords)) {
                e.keywords.forEach(k => allKeywords.add(k));
            }
        });

        // 合并内容
        const contents = allEntries.map(e => e.content).filter(Boolean);
        const mergedContent = contents.join('\n\n---\n\n');

        return {
            name,
            keywords: Array.from(allKeywords),
            content: mergedContent
        };
    }

    /**
     * 从对象批量导入条目
     * @param {Object} data - 分类到条目的映射
     */
    importFromObject(data) {
        this.clear();
        
        for (const [category, entries] of Object.entries(data)) {
            if (typeof entries === 'object') {
                for (const [name, entryData] of Object.entries(entries)) {
                    this.add(category, name, {
                        name,
                        keywords: entryData.关键词 || [],
                        content: entryData.内容 || ''
                    });
                }
            }
        }
    }

    /**
     * 导出为对象
     * @returns {Object} 分类到条目列表的映射
     */
    exportToObject() {
        return this.getAllEntries();
    }
}

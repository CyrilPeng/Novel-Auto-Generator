/**
 * 分类管理器
 * 管理世界书分类(角色、地点、组织等)
 */
export class CategoryManager {
    constructor(config) {
        this.config = config;
        this.categories = this.loadCategories();
    }

    /**
     * 默认分类配置
     */
    getDefaultCategories() {
        return [
            {
                name: '角色',
                enabled: true,
                isBuiltin: true,
                entryExample: '角色真实姓名',
                keywordsExample: ['真实姓名', '称呼1', '称呼2', '绰号'],
                contentGuide: '基于原文的角色描述，包含**名称**、**性别**、**MBTI**、**身份**、**性格**、**外貌**、**技能**、**背景故事**等',
                defaultPosition: 0,
                defaultDepth: 4,
                defaultOrder: 100,
                autoIncrementOrder: false
            },
            {
                name: '地点',
                enabled: true,
                isBuiltin: true,
                entryExample: '地点真实名称',
                keywordsExample: ['地点名', '别称', '俗称'],
                contentGuide: '基于原文的地点描述，包含**名称**、**位置**、**特征**、**重要事件**等',
                defaultPosition: 0,
                defaultDepth: 4,
                defaultOrder: 100,
                autoIncrementOrder: false
            },
            {
                name: '组织',
                enabled: true,
                isBuiltin: true,
                entryExample: '组织真实名称',
                keywordsExample: ['组织名', '简称', '代号'],
                contentGuide: '基于原文的组织描述，包含**名称**、**性质**、**成员**、**目标**等',
                defaultPosition: 0,
                defaultDepth: 4,
                defaultOrder: 100,
                autoIncrementOrder: false
            },
            {
                name: '道具',
                enabled: false,
                isBuiltin: false,
                entryExample: '道具名称',
                keywordsExample: ['道具名', '别名'],
                contentGuide: '基于原文的道具描述，包含**名称**、**类型**、**功能**、**来源**、**持有者**等',
                defaultPosition: 0,
                defaultDepth: 4,
                defaultOrder: 100,
                autoIncrementOrder: false
            },
            {
                name: '玩法',
                enabled: false,
                isBuiltin: false,
                entryExample: '玩法名称',
                keywordsExample: ['玩法名', '规则名'],
                contentGuide: '基于原文的玩法/规则描述，包含**名称**、**规则说明**、**参与条件**、**奖惩机制**等',
                defaultPosition: 0,
                defaultDepth: 4,
                defaultOrder: 100,
                autoIncrementOrder: false
            },
            {
                name: '章节剧情',
                enabled: false,
                isBuiltin: false,
                entryExample: '第X章',
                keywordsExample: ['章节名', '章节号'],
                contentGuide: '该章节的剧情概要，包含**章节标题**、**主要事件**、**出场角色**、**关键转折**、**伏笔线索**等',
                defaultPosition: 0,
                defaultDepth: 4,
                defaultOrder: 100,
                autoIncrementOrder: false
            }
        ];
    }

    /**
     * 加载分类配置
     * @returns {Array} 分类列表
     */
    loadCategories() {
        const saved = this.config.get('customCategories', []);
        const defaults = this.getDefaultCategories();
        
        if (saved && saved.length > 0) {
            // 合并保存的分类和默认分类
            const savedNames = new Set(saved.map(c => c.name));
            const missingDefaults = defaults.filter(c => !savedNames.has(c.name));
            return [...saved, ...missingDefaults];
        }
        
        return defaults;
    }

    /**
     * 获取启用的分类
     * @returns {Array} 启用的分类列表
     */
    getEnabledCategories() {
        return this.categories.filter(c => c.enabled);
    }

    /**
     * 获取所有分类
     * @returns {Array} 分类列表
     */
    getAllCategories() {
        return this.categories;
    }

    /**
     * 添加分类
     * @param {Object} category - 分类配置
     */
    addCategory(category) {
        this.categories.push({
            ...category,
            isBuiltin: false,
            enabled: true
        });
        this.saveCategories();
    }

    /**
     * 更新分类
     * @param {string} name - 分类名称
     * @param {Object} data - 更新数据
     */
    updateCategory(name, data) {
        const index = this.categories.findIndex(c => c.name === name);
        if (index !== -1) {
            this.categories[index] = { ...this.categories[index], ...data };
            this.saveCategories();
        }
    }

    /**
     * 删除分类
     * @param {string} name - 分类名称
     */
    removeCategory(name) {
        const category = this.categories.find(c => c.name === name);
        if (category && !category.isBuiltin) {
            this.categories = this.categories.filter(c => c.name !== name);
            this.saveCategories();
        }
    }

    /**
     * 重置为默认分类
     */
    resetCategories() {
        this.categories = this.getDefaultCategories();
        this.saveCategories();
    }

    /**
     * 保存分类配置
     */
    saveCategories() {
        this.config.set('customCategories', this.categories);
    }

    /**
     * 获取分类的JSON模板
     * @returns {string} JSON模板字符串
     */
    getJsonTemplate() {
        const enabled = this.getEnabledCategories();
        const parts = enabled.map(cat => {
            return `"${cat.name}": {
  "${cat.entryExample}": {
    "关键词": ${JSON.stringify(cat.keywordsExample)},
    "内容": "${cat.contentGuide}"
  }
}`;
        });
        return `{\n${parts.join(',\n')}\n}`;
    }
}

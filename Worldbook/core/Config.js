/**
 * 配置管理类
 * 管理所有世界书处理相关的配置
 */
export class Config {
    constructor() {
        // 默认配置
        this.defaults = {
            // 分块设置
            chunkSize: 15000,
            useVolumeMode: false,
            
            // API设置
            useTavernApi: true,
            customApiProvider: 'gemini',
            customApiKey: '',
            customApiEndpoint: '',
            customApiModel: 'gemini-2.5-flash',
            apiTimeout: 120000,
            
            // 并行处理设置
            parallelEnabled: true,
            parallelConcurrency: 3,
            parallelMode: 'independent',
            
            // 世界书生成设置
            enablePlotOutline: false,
            enableLiteraryStyle: false,
            language: 'zh',
            
            // 自定义提示词
            customWorldbookPrompt: '',
            customPlotPrompt: '',
            customStylePrompt: '',
            customMergePrompt: '',
            customRerollPrompt: '',
            
            // 整理条目设置
            consolidatePromptPresets: [],
            consolidateCategoryPresetMap: {},
            
            // 默认世界书条目
            defaultWorldbookEntries: '',
            defaultWorldbookEntriesUI: [],
            
            // 分类灯状态
            categoryLightSettings: null,
            
            // 条目位置/深度/顺序配置
            entryPositionConfig: {},
            categoryDefaultConfig: {},
            plotOutlineExportConfig: {
                position: 0,
                depth: 4,
                order: 100,
                autoIncrementOrder: true
            },
            
            // 章回正则配置
            chapterRegexPattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
            useCustomChapterRegex: false,
            forceChapterMarker: true,
            
            // 消息链配置
            promptMessageChain: [
                { role: 'user', content: '{PROMPT}', enabled: true }
            ],
            
            // 响应过滤设置
            filterResponseTags: 'thinking,/think',
            allowRecursion: false,
            debugMode: false
        };
        
        this.settings = this.load();
    }

    /**
     * 从localStorage加载配置
     * @returns {Object} 配置对象
     */
    load() {
        try {
            const saved = localStorage.getItem('txtToWorldbookSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...this.defaults, ...parsed };
            }
        } catch (e) {
            console.warn('[配置] 加载失败，使用默认配置:', e.message);
        }
        return { ...this.defaults };
    }

    /**
     * 保存配置到localStorage
     */
    save() {
        try {
            localStorage.setItem('txtToWorldbookSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('[配置] 保存失败:', e.message);
        }
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键
     * @param {any} defaultValue - 默认值
     * @returns {any} 配置值
     */
    get(key, defaultValue = undefined) {
        return this.settings[key] !== undefined ? this.settings[key] : 
               (defaultValue !== undefined ? defaultValue : this.defaults[key]);
    }

    /**
     * 设置配置项
     * @param {string} key - 配置键
     * @param {any} value - 配置值
     */
    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    /**
     * 批量设置配置
     * @param {Object} values - 配置键值对
     */
    setMultiple(values) {
        Object.assign(this.settings, values);
        this.save();
    }

    /**
     * 重置为默认配置
     */
    reset() {
        this.settings = { ...this.defaults };
        this.save();
        console.log('[配置] 已重置为默认配置');
    }

    /**
     * 导出配置
     * @returns {Object} 配置对象
     */
    export() {
        return { ...this.settings };
    }

    /**
     * 导入配置
     * @param {Object} data - 配置数据
     */
    import(data) {
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.error('[配置] 导入失败:', e.message);
                return;
            }
        }
        this.settings = { ...this.defaults, ...data };
        this.save();
        console.log('[配置] 导入成功');
    }
}

// 导出单例
export const config = new Config();

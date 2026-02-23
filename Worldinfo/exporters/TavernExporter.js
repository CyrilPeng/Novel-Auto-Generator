/**
 * SillyTavern格式导出器
 * 导出为SillyTavern世界书兼容的JSON格式
 */
import { downloadFile } from '../utils/file.js';

export class TavernExporter {
    constructor() {
        this.mimeType = 'application/json';
        this.extension = 'json';
    }

    /**
     * 导出世界书为SillyTavern格式
     * @param {Object} worldbook - 世界书数据
     * @param {Object} options - 导出选项
     * @param {string} options.filename - 文件名
     * @param {Object} options.positionConfig - 条目位置配置
     * @returns {string} JSON字符串
     */
    export(worldbook, options = {}) {
        const entries = {};
        let uid = 0;

        // 遍历所有分类和条目
        for (const [categoryName, entriesList] of Object.entries(worldbook)) {
            if (!Array.isArray(entriesList)) continue;

            for (const entry of entriesList) {
                const positionConfig = options.positionConfig?.[entry.name] || {};
                
                entries[uid] = {
                    uid: uid,
                    displayIndex: uid,
                    comment: entry.name,
                    key: entry.keywords || [],
                    keysecondary: [],
                    content: entry.content || '',
                    position: positionConfig.position ?? 0,
                    depth: positionConfig.depth ?? 4,
                    order: positionConfig.order ?? 100,
                    enabled: true,
                    excludeRecursion: !positionConfig.allowRecursion,
                    preventRecursion: false,
                    delay: 0,
                    selectiveLogic: 0,
                    useProbability: false,
                    probability: 100,
                    group: ''
                };

                uid++;
            }
        }

        const result = {
            name: options.filename || 'exported_worldbook',
            entries: entries,
            version: 3
        };

        return JSON.stringify(result, null, 2);
    }

    /**
     * 导出并下载文件
     * @param {Object} worldbook - 世界书数据
     * @param {Object} options - 导出选项
     */
    download(worldbook, options = {}) {
        const content = this.export(worldbook, options);
        const filename = options.filename || 'worldbook.json';
        downloadFile(content, filename, this.mimeType);
    }

    /**
     * 获取当前已启用的世界书名称列表
     * 使用多种方式获取以确保兼容性
     * @returns {Array<string>} 世界书名称列表
     */
    getActiveWorldbookNames() {
        const names = new Set();

        // 方式1: getContext().selected_world_info
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                const swi = ctx.selected_world_info;
                if (Array.isArray(swi)) {
                    swi.forEach(n => {
                        if (n != null && String(n).trim()) {
                            names.add(String(n).trim());
                        }
                    });
                }

                // 角色绑定的世界书
                try {
                    const charData = ctx.characters?.[ctx.characterId]?.data;
                    if (charData?.extensions?.world) {
                        const cw = charData.extensions.world;
                        if (typeof cw === 'string' && cw.trim()) names.add(cw.trim());
                        if (Array.isArray(cw)) cw.forEach(n => { if (n?.trim()) names.add(n.trim()); });
                    }
                } catch (e) { }
            }
        } catch (e) {
            console.warn('[导出器] 获取世界书名称失败:', e.message);
        }

        // 方式2: DOM option获取
        try {
            const options = document.querySelectorAll('#world_info option:selected');
            options.forEach(opt => {
                const txt = opt.text?.trim();
                if (txt && !['None', 'none', '--- None ---'].includes(txt)) {
                    names.add(txt);
                }
            });
        } catch (e) { }

        return Array.from(names);
    }

    /**
     * 加载指定名称的世界书数据
     * @param {string} name - 世界书名称
     * @returns {Promise<Object|null>} 世界书数据
     */
    async loadWorldbook(name) {
        // 方式1: getContext API
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.loadWorldInfo === 'function') {
                    const data = await ctx.loadWorldInfo(name);
                    if (data?.entries && Object.keys(data.entries).length > 0) {
                        console.log(`[导出器] 成功加载世界书"${name}"，共${Object.keys(data.entries).length}条`);
                        return data;
                    }
                }
            }
        } catch (e) { }

        // 方式2: fetch API
        try {
            let headers = { 'Content-Type': 'application/json' };
            try {
                const ctx = SillyTavern.getContext();
                if (typeof ctx.getRequestHeaders === 'function') {
                    headers = ctx.getRequestHeaders();
                }
            } catch (e) { }

            const resp = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers,
                body: JSON.stringify({ name })
            });

            if (resp.ok) {
                const data = await resp.json();
                if (data?.entries && Object.keys(data.entries).length > 0) {
                    console.log(`[导出器] 成功加载世界书"${name}"，共${Object.keys(data.entries).length}条`);
                    return data;
                }
            }
        } catch (e) { }

        console.warn(`[导出器] 无法加载世界书"${name}"`);
        return null;
    }

    /**
     * 合并多个世界书
     * @param {Object<string, Object>} booksMap - 世界书名称到数据的映射
     * @returns {Object} 合并后的世界书
     */
    merge(booksMap) {
        const merged = { entries: {} };
        let uid = 0;

        for (const [name, data] of Object.entries(booksMap)) {
            if (!data?.entries) continue;

            for (const entry of Object.values(data.entries)) {
                const e = { ...entry };
                e.uid = uid;
                e.displayIndex = uid;
                e.comment = e.comment ? `[${name}] ${e.comment}` : `[${name}] 条目${entry.uid || uid}`;
                merged.entries[String(uid)] = e;
                uid++;
            }
        }

        return merged;
    }
}

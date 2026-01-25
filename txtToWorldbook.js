
/**
 * TXT转世界书独立模块 for 📚小说自动生成器 https://github.com/CyrilPeng/novel-auto-generator
 *
 * @typedef {Object} WorldbookEntry
 * @property {string|string[]} 关键词 - Keywords identifying the entry
 * @property {string} 内容 - The main content description
 *
 * @typedef {Object.<string, Object.<string, WorldbookEntry>>} Worldbook - Structure: { Category: { EntryName: EntryData } }
 *
 * @typedef {Object} MemoryItem
 * @property {string} content - The text content of the chunk/chapter
 * @property {boolean} processed - Whether it has been processed
 * @property {boolean} processing - Whether it is currently being processed
 * @property {boolean} failed - Whether processing failed
 * @property {string} [result] - The AI processing result (raw JSON string)
 * @property {string} [error] - Error message if failed
 * @property {number} retryCount - Number of retries attempted
 *
 * @typedef {Object} Settings
 * @property {number} chunkSize
 * @property {string} language
 * @property {boolean} parallelEnabled
 * @property {number} parallelConcurrency
 * @property {string} parallelMode
 * @property {boolean} useTavernApi
 * @property {string} customApiProvider
 * @property {Object} categoryLightSettings
 * @property {Object} entryPositionConfig
 */

(function () {
    'use strict';

    // ========== 基础工具类 ==========
    const Utils = {
        async calculateFileHash(content) {
            const msgBuffer = new TextEncoder().encode(content);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    };

    const WorkerService = {
        isReady: () => false
    };

    /**
     * @class EventManager
     * Simple Pub/Sub implementation for state management
     */
    class EventManager {
        constructor() {
            this.listeners = new Map();
        }

        /**
         * Subscribe to an event
         * @param {string} event - Event name
         * @param {Function} callback - Callback function
         * @returns {Function} Unsubscribe function
         */
        on(event, callback) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }
            this.listeners.get(event).add(callback);
            return () => this.listeners.get(event).delete(callback);
        }

        /**
         * Emit an event
         * @param {string} event - Event name
         * @param {*} data - Data to pass to listeners
         */
        emit(event, data) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).forEach(cb => {
                    try {
                        cb(data);
                    } catch (e) {
                        console.error(`Error in event listener for ${event}:`, e);
                    }
                });
            }
        }
    }

    /**
     * @class Store
     * Centralized state management
     */
    class Store {
        constructor(initialState) {
            this.state = new Proxy(initialState, {
                set: (target, property, value) => {
                    target[property] = value;
                    this.events.emit(`change:${String(property)}`, value);
                    this.events.emit('change', this.state);
                    return true;
                }
            });
            this.events = new EventManager();
        }

        /**
         * Update partial state
         * @param {Object} updates
         */
        setState(updates) {
            Object.assign(this.state, updates);
        }

        subscribe(key, callback) {
            return this.events.on(key ? `change:${key}` : 'change', callback);
        }
    }

    // ========== 初始化状态管理 ==========
    const appStore = new Store({
        generatedWorldbook: {},
        worldbookVolumes: [],
        currentVolumeIndex: 0,
        memoryQueue: [],
        failedMemoryQueue: [],
        currentFile: null,
        currentFileHash: null,
        isProcessingStopped: false,
        isRepairingMemories: false,
        currentProcessingIndex: 0,
        incrementalOutputMode: true,
        useVolumeMode: false,
        currentStreamContent: '',
        startFromIndex: 0,
        userSelectedStartIndex: null,
        isRerolling: false,
        pendingImportData: null,
        isMultiSelectMode: false,
        selectedMemoryIndices: new Set(),
        searchHighlightKeyword: '',
        entryPositionConfig: {},
        defaultWorldbookEntriesUI: [],
        customWorldbookCategories: [], // Will be init later
        chapterRegexSettings: { pattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]', useCustomRegex: false },
        categoryLightSettings: {
            '角色': false, '地点': true, '组织': false, '剧情大纲': true,
            '知识书': false, '文风配置': false, '地图环境': true, '剧情节点': true
        },
        categoryDefaultConfig: {},
        parallelConfig: { enabled: true, concurrency: 3, mode: 'independent' },
        activeParallelTasks: new Set(),
        settings: {} // Will be init with defaultSettings
    });

    // 为了兼容旧代码，保持全局变量引用指向 Store.state
    // 注意：简单类型(boolean, number, string)无法通过这种方式同步，需要修改原有逻辑
    // 复杂类型(Object, Array)可以保持引用
    let generatedWorldbook = appStore.state.generatedWorldbook;
    let worldbookVolumes = appStore.state.worldbookVolumes;
    let memoryQueue = appStore.state.memoryQueue;
    let failedMemoryQueue = appStore.state.failedMemoryQueue;
    // let currentFile = appStore.state.currentFile; // Simple type, careful
    // let isProcessingStopped = appStore.state.isProcessingStopped; // Simple type

    // 为了最小化修改风险，简单类型变量暂时保留 let 声明，
    // 但建议后续逻辑中通过 appStore.state.x 来访问
    let currentVolumeIndex = 0;
    let currentFile = null;
    let currentFileHash = null;
    let isProcessingStopped = false;
    let isRepairingMemories = false;
    let currentProcessingIndex = 0;
    let incrementalOutputMode = true;
    let useVolumeMode = false;
    let currentStreamContent = '';
    let startFromIndex = 0;
    let userSelectedStartIndex = null;
    let isRerolling = false;
    let pendingImportData = null;
    let isMultiSelectMode = false;
    let selectedMemoryIndices = new Set();
    let searchHighlightKeyword = '';
    let entryPositionConfig = {};
    let defaultWorldbookEntriesUI = [];
    let activeParallelTasks = new Set();

    // 监听 Store 变化同步回本地变量（用于渐进式迁移）
    appStore.subscribe('generatedWorldbook', val => generatedWorldbook = val);
    appStore.subscribe('worldbookVolumes', val => worldbookVolumes = val);
    appStore.subscribe('memoryQueue', val => memoryQueue = val);

    // ========== 新增：自定义分类系统 ==========
    const DEFAULT_WORLDBOOK_CATEGORIES = [
        {
            name: "角色",
            enabled: true,
            isBuiltin: true,
            entryExample: "角色真实姓名",
            keywordsExample: ["真实姓名", "称呼1", "称呼2", "绰号"],
            contentGuide: "基于原文的角色描述，包含但不限于**名称**:（必须要）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）"
        },
        {
            name: "地点",
            enabled: true,
            isBuiltin: true,
            entryExample: "地点真实名称",
            keywordsExample: ["地点名", "别称", "俗称"],
            contentGuide: "基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）"
        },
        {
            name: "组织",
            enabled: true,
            isBuiltin: true,
            entryExample: "组织真实名称",
            keywordsExample: ["组织名", "简称", "代号"],
            contentGuide: "基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）"
        },
        {
            name: "道具",
            enabled: false,
            isBuiltin: false,
            entryExample: "道具名称",
            keywordsExample: ["道具名", "别名"],
            contentGuide: "基于原文的道具描述，包含但不限于**名称**:、**类型**:、**功能**:、**来源**:、**持有者**:等"
        },
        {
            name: "玩法",
            enabled: false,
            isBuiltin: false,
            entryExample: "玩法名称",
            keywordsExample: ["玩法名", "规则名"],
            contentGuide: "基于原文的玩法/规则描述，包含但不限于**名称**:、**规则说明**:、**参与条件**:、**奖惩机制**:等"
        },
        {
            name: "章节剧情",
            enabled: false,
            isBuiltin: false,
            entryExample: "第X章",
            keywordsExample: ["章节名", "章节号"],
            contentGuide: "该章节的剧情概要，包含但不限于**章节标题**:、**主要事件**:、**出场角色**:、**关键转折**:、**伏笔线索**:等"
        },
        {
            name: "角色内心",
            enabled: false,
            isBuiltin: false,
            entryExample: "角色名-内心世界",
            keywordsExample: ["角色名", "内心", "心理"],
            contentGuide: "角色的内心想法和心理活动，包含但不限于**原文内容**:、**内心独白**:、**情感变化**:、**动机分析**:、**心理矛盾**:等"
        }
    ];

    let customWorldbookCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));
    appStore.state.customWorldbookCategories = customWorldbookCategories;

    // ========== 新增：章回正则配置 ==========
    let chapterRegexSettings = {
        pattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
        useCustomRegex: false
    };

    // ========== 分类灯状态配置 ==========
    let categoryLightSettings = {
        '角色': false,
        '地点': true,
        '组织': false,
        '剧情大纲': true,
        '知识书': false,
        '文风配置': false,
        '地图环境': true,
        '剧情节点': true
    };

    // ========== 新增：分类默认位置/深度配置 ==========
    let categoryDefaultConfig = {};

    // ========== 并行处理配置 ==========
    let parallelConfig = {
        enabled: true,
        concurrency: 3,
        mode: 'independent'
    };

    // ========== 默认设置 ==========
    const defaultWorldbookPrompt = `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **只提取文中明确出现的角色、地点、组织等信息**
3. **关键词必须是文中实际出现的名称**，用逗号分隔
4. **内容必须基于原文描述**，不要添加原文没有的信息
5. **内容使用markdown格式**，可以层层嵌套或使用序号标题
6. **【新增】关系提取**：请尝试识别角色之间、角色与组织之间的关系，并在内容中简要提及，或如果支持，输出 relations 字段。

## 📤 输出格式
请生成标准JSON格式，确保能被JavaScript正确解析：

\`\`\`json
{DYNAMIC_JSON_TEMPLATE}
\`\`\`

## 结构说明
对于支持关系的条目，可以在对象中增加 "relations" 数组，例如：
"relations": [
  { "target": "目标名称", "type": "关系类型(如:父亲, 敌人)" }
]

## 重要提醒
- 直接输出JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁`;

    const defaultPlotPrompt = `"剧情大纲": {
"主线剧情": {
"关键词": ["主线", "核心剧情", "故事线"],
"内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响\\n3. **转折点3**: 描述和影响\\n\\n## 伏笔与暗线\\n**已揭示的伏笔**: 已经揭晓的铺垫\\n**未解之谜**: 尚未解答的疑问\\n**暗线推测**: 可能的隐藏剧情线"
},
"支线剧情": {
"关键词": ["支线", "副线", "分支剧情"],
"内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n**支线3标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
}
}`;

    const defaultStylePrompt = `"文风配置": {
"作品文风": {
"关键词": ["文风", "写作风格", "叙事特点"],
"内容": "## 叙事视角\\n**视角类型**: 第一人称/第三人称/全知视角\\n**叙述者特点**: 叙述者的语气和态度\\n\\n## 语言风格\\n**用词特点**: 华丽/简洁/口语化/书面化\\n**句式特点**: 长句/短句/对话多/描写多\\n**修辞手法**: 常用的修辞手法\\n\\n## 情感基调\\n**整体氛围**: 轻松/沉重/悬疑/浪漫\\n**情感表达**: 直接/含蓄/细腻/粗犷"
}
}`;

    const defaultMergePrompt = `你是世界书条目合并专家。请将以下两个相同名称的世界书条目合并为一个，保留所有重要信息，去除重复内容。

## 合并规则
1. 关键词：合并两者的关键词，去重
2. 内容：整合两者的描述，保留所有独特信息，用markdown格式组织
3. 如有矛盾信息，保留更详细/更新的版本
4. 输出格式必须是JSON

## 条目A
{ENTRY_A}

## 条目B
{ENTRY_B}

请直接输出合并后的JSON格式条目：
{"关键词": [...], "内容": "..."}`;

    const defaultConsolidatePrompt = `你是世界书条目整理专家。请整理以下条目内容，去除重复信息，合并相似描述，保留所有独特细节。

## 整理规则
1. 合并重复的属性描述（如多个"性别"只保留一个）
2. 整合相似的段落，去除冗余
3. 保留所有独特信息，不要丢失细节
4. 使用清晰的markdown格式输出
5. 关键信息放在前面

## 原始内容
{CONTENT}

请直接输出整理后的内容（纯文本，不要JSON包装）：`;

    const CONSTANTS = {
        DB_NAME: 'TxtToWorldbookDB',
        DB_VERSION: 5,
        DEFAULT_CHUNK_SIZE: 15000,
        DEFAULT_API_TIMEOUT: 120000,
        DEFAULT_CONCURRENCY: 3,
        TOAST_DURATION: 3000,
        FILE_ENCODING_CHECK_LENGTH: 1000
    };

    const defaultSettings = {
        chunkSize: CONSTANTS.DEFAULT_CHUNK_SIZE,
        enablePlotOutline: false,
        enableLiteraryStyle: false,
        language: 'zh',
        customWorldbookPrompt: '',
        customPlotPrompt: '',
        customStylePrompt: '',
        useVolumeMode: false,
        apiTimeout: CONSTANTS.DEFAULT_API_TIMEOUT,
        parallelEnabled: true,
        parallelConcurrency: CONSTANTS.DEFAULT_CONCURRENCY,
        parallelMode: 'independent',
        useTavernApi: true,
        customMergePrompt: '',
        categoryLightSettings: null,
        defaultWorldbookEntries: '',
        customRerollPrompt: '',
        customApiProvider: 'gemini',
        customApiKey: '',
        customApiEndpoint: '',
        customApiModel: 'gemini-2.5-flash',
        forceChapterMarker: true,
        chapterRegexPattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
        useCustomChapterRegex: false,
        defaultWorldbookEntriesUI: [],
        categoryDefaultConfig: {},
        entryPositionConfig: {}
    };

    let settings = { ...defaultSettings };
    appStore.state.settings = settings;

    // ========== 信号量类 ==========
    class Semaphore {
        constructor(max) {
            this.max = max;
            this.current = 0;
            this.queue = [];
            this.aborted = false;
        }

        async acquire() {
            if (this.aborted) throw new Error('ABORTED');
            if (this.current < this.max) {
                this.current++;
                return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
                this.queue.push({ resolve, reject });
            });
        }

        release() {
            this.current--;
            if (this.queue.length > 0 && !this.aborted) {
                this.current++;
                const next = this.queue.shift();
                next.resolve();
            }
        }

        abort() {
            this.aborted = true;
            while (this.queue.length > 0) {
                const item = this.queue.shift();
                item.reject(new Error('ABORTED'));
            }
        }

        reset() {
            this.aborted = false;
            this.current = 0;
            this.queue = [];
        }
    }

    let globalSemaphore = null;

    // ========== Services Namespace ==========
    const Services = {};

    // ========== IndexedDB Service ==========
    /**
     * @namespace MemoryHistoryDB
     * Handles all IndexedDB interactions
     */
    Services.DB = {
        dbName: CONSTANTS.DB_NAME,
        storeName: 'history',
        metaStoreName: 'meta',
        stateStoreName: 'state',
        rollStoreName: 'rolls',
        categoriesStoreName: 'categories',
        db: null,

        async openDB() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, CONSTANTS.DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.metaStoreName)) {
                        db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains(this.stateStoreName)) {
                        db.createObjectStore(this.stateStoreName, { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains(this.rollStoreName)) {
                        const rollStore = db.createObjectStore(this.rollStoreName, { keyPath: 'id', autoIncrement: true });
                        rollStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.categoriesStoreName)) {
                        db.createObjectStore(this.categoriesStoreName, { keyPath: 'key' });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };
                request.onerror = (event) => reject(event.target.error);
            });
        },

        async saveCustomCategories(categories) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.categoriesStoreName], 'readwrite');
                const store = transaction.objectStore(this.categoriesStoreName);
                const request = store.put({ key: 'customCategories', value: categories });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async getCustomCategories() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.categoriesStoreName], 'readonly');
                const store = transaction.objectStore(this.categoriesStoreName);
                const request = store.get('customCategories');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async saveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries) {
            const db = await this.openDB();
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            if (!allowedDuplicates.includes(memoryTitle)) {
                try {
                    const allHistory = await this.getAllHistory();
                    const duplicates = allHistory.filter(h => h.memoryTitle === memoryTitle);
                    if (duplicates.length > 0) {
                        const deleteTransaction = db.transaction([this.storeName], 'readwrite');
                        const deleteStore = deleteTransaction.objectStore(this.storeName);
                        for (const dup of duplicates) {
                            deleteStore.delete(dup.id);
                        }
                        await new Promise((resolve, reject) => {
                            deleteTransaction.oncomplete = () => resolve();
                            deleteTransaction.onerror = () => reject(deleteTransaction.error);
                        });
                    }
                } catch (error) {
                    console.error('删除重复历史记录失败:', error);
                }
            }
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const record = {
                    timestamp: Date.now(),
                    memoryIndex,
                    memoryTitle,
                    previousWorldbook: JSON.parse(JSON.stringify(previousWorldbook || {})),
                    newWorldbook: JSON.parse(JSON.stringify(newWorldbook || {})),
                    changedEntries: changedEntries || [],
                    fileHash: currentFileHash || null,
                    volumeIndex: currentVolumeIndex
                };
                const request = store.add(record);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async getAllHistory() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        async getHistoryById(id) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async clearAllHistory() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async clearAllRolls() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                const store = transaction.objectStore(this.rollStoreName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async saveFileHash(hash) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'currentFileHash', value: hash });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async getSavedFileHash() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readonly');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.get('currentFileHash');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async clearFileHash() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.delete('currentFileHash');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async saveState(processedIndex) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                const store = transaction.objectStore(this.stateStoreName);
                const state = {
                    key: 'currentState',
                    processedIndex,
                    memoryQueue: JSON.parse(JSON.stringify(memoryQueue)),
                    generatedWorldbook: JSON.parse(JSON.stringify(generatedWorldbook)),
                    worldbookVolumes: JSON.parse(JSON.stringify(worldbookVolumes)),
                    currentVolumeIndex,
                    fileHash: currentFileHash,
                    timestamp: Date.now()
                };
                const request = store.put(state);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async loadState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readonly');
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.get('currentState');
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        },

        async clearState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.delete('currentState');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async saveCustomOptimizationPrompt(prompt) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'customOptimizationPrompt', value: prompt });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async getCustomOptimizationPrompt() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readonly');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.get('customOptimizationPrompt');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async saveRollResult(memoryIndex, result) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                const store = transaction.objectStore(this.rollStoreName);
                const record = {
                    memoryIndex,
                    result: JSON.parse(JSON.stringify(result)),
                    timestamp: Date.now()
                };
                const request = store.add(record);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async getRollResults(memoryIndex) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readonly');
                const store = transaction.objectStore(this.rollStoreName);
                const index = store.index('memoryIndex');
                const request = index.getAll(memoryIndex);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        async clearRollResults(memoryIndex) {
            const db = await this.openDB();
            const results = await this.getRollResults(memoryIndex);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                const store = transaction.objectStore(this.rollStoreName);
                for (const r of results) {
                    store.delete(r.id);
                }
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        },

        async rollbackToHistory(historyId) {
            const history = await this.getHistoryById(historyId);
            if (!history) throw new Error('找不到指定的历史记录');
            generatedWorldbook = JSON.parse(JSON.stringify(history.previousWorldbook));
            const db = await this.openDB();
            const allHistory = await this.getAllHistory();
            const toDelete = allHistory.filter(h => h.id >= historyId);
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            for (const h of toDelete) {
                store.delete(h.id);
            }
            return history;
        },

        async cleanDuplicateHistory() {
            const db = await this.openDB();
            const allHistory = await this.getAllHistory();
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            const groupedByTitle = {};
            for (const record of allHistory) {
                const title = record.memoryTitle;
                if (!groupedByTitle[title]) groupedByTitle[title] = [];
                groupedByTitle[title].push(record);
            }
            const toDelete = [];
            for (const title in groupedByTitle) {
                if (allowedDuplicates.includes(title)) continue;
                const records = groupedByTitle[title];
                if (records.length > 1) {
                    records.sort((a, b) => b.timestamp - a.timestamp);
                    toDelete.push(...records.slice(1));
                }
            }
            if (toDelete.length > 0) {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                for (const record of toDelete) {
                    store.delete(record.id);
                }
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });
                return toDelete.length;
            }
            return 0;
        }
    };

    const MemoryHistoryDB = Services.DB;

    // ========== 新增：自定义分类管理函数 ==========
    async function saveCustomCategories() {
        try {
            await MemoryHistoryDB.saveCustomCategories(customWorldbookCategories);
            console.log('自定义分类配置已保存');
        } catch (error) {
            console.error('保存自定义分类配置失败:', error);
        }
    }

    async function loadCustomCategories() {
        try {
            const saved = await MemoryHistoryDB.getCustomCategories();
            if (saved && Array.isArray(saved) && saved.length > 0) {
                customWorldbookCategories = saved;
            }
        } catch (error) {
            console.error('加载自定义分类配置失败:', error);
        }
    }

    async function resetToDefaultCategories() {
        customWorldbookCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));
        await saveCustomCategories();
        console.log('已重置为默认分类配置');
    }

    async function resetSingleCategory(index) {
        const cat = customWorldbookCategories[index];
        if (!cat) return;

        const defaultCat = DEFAULT_WORLDBOOK_CATEGORIES.find(c => c.name === cat.name);
        if (defaultCat) {
            customWorldbookCategories[index] = JSON.parse(JSON.stringify(defaultCat));
        } else {
            customWorldbookCategories.splice(index, 1);
        }
        await saveCustomCategories();
    }

    function getEnabledCategories() {
        return customWorldbookCategories.filter(cat => cat.enabled);
    }

    function generateDynamicJsonTemplate() {
        const enabledCategories = getEnabledCategories();
        let template = '{\n';
        const parts = [];

        for (const cat of enabledCategories) {
            parts.push(`"${cat.name}": {
"${cat.entryExample}": {
"关键词": ${JSON.stringify(cat.keywordsExample)},
"内容": "${cat.contentGuide}"
}
}`);
        }

        template += parts.join(',\n');
        template += '\n}';
        return template;
    }

    function getEnabledCategoryNames() {
        const names = getEnabledCategories().map(cat => cat.name);
        names.push('剧情大纲', '知识书', '文风配置', '地图环境', '剧情节点');
        return names;
    }

    // ========== Services Namespace ==========
    // Services.DB is defined above

    /**
     * @namespace ContextManager
     * RAG Service for keyword-based context retrieval
     */
    Services.Context = {
        /**
         * Find relevant entries based on chapter content
         * @param {string} content - Chapter content
         * @param {Object} worldbook - Current worldbook data
         * @param {number} maxEntries - Max entries to return
         * @returns {string} Formatted context string
         */
        buildContext(content, worldbook, maxEntries = 20) {
            const relevantEntries = [];
            const keywordsFound = new Set();
            const contentLower = content.toLowerCase();

            // 1. Iterate over all entries in worldbook
            for (const category in worldbook) {
                const entries = worldbook[category];
                for (const entryName in entries) {
                    const entry = entries[entryName];
                    const keywords = entry['关键词'] || [];
                    // Check if entry name or any keyword appears in content
                    let isRelevant = false;

                    // Name check
                    if (content.includes(entryName)) isRelevant = true;

                    // Keyword check
                    if (!isRelevant && Array.isArray(keywords)) {
                        for (const kw of keywords) {
                            if (content.includes(kw)) {
                                isRelevant = true;
                                break;
                            }
                        }
                    }

                    if (isRelevant) {
                        relevantEntries.push({
                            category,
                            name: entryName,
                            entry
                        });
                    }
                }
            }

            // 2. Sort by simple heuristic (length of entry name usually implies specificity, or just number of keywords matched)
            if (relevantEntries.length > maxEntries) {
                // Prioritize 'Characters' and 'Locations'
                relevantEntries.sort((a, b) => {
                    const priority = { '角色': 3, '地点': 2, '组织': 1 };
                    const scoreA = priority[a.category] || 0;
                    const scoreB = priority[b.category] || 0;
                    return scoreB - scoreA;
                });
                relevantEntries.length = maxEntries;
            }

            if (relevantEntries.length === 0) return '';

            // 3. Format output
            let contextStr = '## 关联的历史条目参考\n请基于以下已存在的条目保持设定一致性：\n\n';
            for (const item of relevantEntries) {
                const entry = item.entry;
                const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(',') : entry['关键词'];
                // Only show summary or full content? Full content is safer for consistency.
                contextStr += `### ${item.name} (${item.category})\n关键词: ${keywords}\n内容: ${entry['内容']}\n\n`;
            }
            return contextStr;
        }
    };

    /**
     * @namespace ConflictManager
     * Service for detecting and resolving merge conflicts
     */
    Services.Conflict = {
        conflictQueue: [],

        /**
         * Check for conflict between old and new entry
         * @param {Object} oldEntry
         * @param {Object} newEntry
         * @returns {boolean} True if conflict detected
         */
        isConflict(oldEntry, newEntry) {
            if (!oldEntry || !newEntry) return false;
            if (!oldEntry['内容'] || !newEntry['内容']) return false;

            // Simple heuristic: If new content is significantly shorter than old (possible data loss)
            const oldLen = oldEntry['内容'].length;
            const newLen = newEntry['内容'].length;

            if (newLen < oldLen * 0.5 && oldLen > 50) return true;
            return false;
        },

        addConflict(category, name, oldEntry, newEntry, chapterIndex) {
            this.conflictQueue.push({
                id: Date.now() + Math.random(),
                category,
                name,
                oldEntry: JSON.parse(JSON.stringify(oldEntry)),
                newEntry: JSON.parse(JSON.stringify(newEntry)),
                chapterIndex
            });
            this.updateUI();
        },

        resolve(id, choice) {
            const index = this.conflictQueue.findIndex(c => c.id === id);
            if (index === -1) return;
            const conflict = this.conflictQueue[index];

            if (choice === 'use_new') {
                // Apply new entry
                if (!generatedWorldbook[conflict.category]) generatedWorldbook[conflict.category] = {};
                generatedWorldbook[conflict.category][conflict.name] = conflict.newEntry;
            }
            // 'keep_old' does nothing (old value remains)

            this.conflictQueue.splice(index, 1);
            this.updateUI();
        },

        resolveAll(choice) {
             while(this.conflictQueue.length > 0) {
                 const conflict = this.conflictQueue[0];
                 this.resolve(conflict.id, choice);
             }
        },

        updateUI() {
            const btn = document.getElementById('ttw-conflict-btn');
            if (btn) {
                if (this.conflictQueue.length > 0) {
                    btn.style.display = 'inline-block';
                    btn.textContent = `⚠️ 解决冲突 (${this.conflictQueue.length})`;
                    // Auto-open modal if not open? No, let user click.
                } else {
                    btn.style.display = 'none';
                }
            }
        }
    };

    // ========== 工具函数 ==========
    async function calculateFileHash(content) {
        return Utils.calculateFileHash(content);
    }

    function getLanguagePrefix() {
        return settings.language === 'zh' ? '请用中文回复。\n\n' : '';
    }

    function isTokenLimitError(errorMsg) {
        if (!errorMsg) return false;
        const patterns = [
            /prompt is too long/i, /tokens? >\s*\d+\s*maximum/i, /max_prompt_tokens/i,
            /exceeded/i, /input tokens/i, /context_length/i, /too many tokens/i,
            /token limit/i, /maximum.*tokens/i, /20015.*limit/i, /INVALID_ARGUMENT/i
        ];
        return patterns.some(pattern => pattern.test(errorMsg));
    }

    async function detectBestEncoding(file) {
        const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'Big5'];
        for (const encoding of encodings) {
            try {
                const content = await readFileWithEncoding(file, encoding);
                if (!content.includes('�') && !content.includes('\uFFFD')) {
                    return { encoding, content };
                }
            } catch (e) { continue; }
        }
        const content = await readFileWithEncoding(file, 'UTF-8');
        return { encoding: 'UTF-8', content };
    }

    function readFileWithEncoding(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, encoding);
        });
    }

    function updateStreamContent(content, clear = false) {
        if (clear) {
            currentStreamContent = '';
        } else {
            currentStreamContent += content;
        }
        const streamEl = document.getElementById('ttw-stream-content');
        if (streamEl) {
            streamEl.textContent = currentStreamContent;
            streamEl.scrollTop = streamEl.scrollHeight;
        }
    }
    // 位置值转中文显示
    function getPositionDisplayName(position) {
        const positionNames = {
            0: '在角色定义之前',
            1: '在角色定义之后',
            2: '在作者注释之前',
            3: '在作者注释之后',
            4: '自定义深度'
        };
        return positionNames[position] || '在角色定义之前';
    }

    // ========== 分类灯状态管理 ==========
    function getCategoryLightState(category) {
        if (categoryLightSettings.hasOwnProperty(category)) {
            return categoryLightSettings[category];
        }
        return false;
    }

    function setCategoryLightState(category, isGreen) {
        categoryLightSettings[category] = isGreen;
        saveCategoryLightSettings();
    }

    function saveCategoryLightSettings() {
        settings.categoryLightSettings = { ...categoryLightSettings };
        try { localStorage.setItem('txtToWorldbookSettings', JSON.stringify(settings)); } catch (e) { }
    }

    function loadCategoryLightSettings() {
        if (settings.categoryLightSettings) {
            categoryLightSettings = { ...categoryLightSettings, ...settings.categoryLightSettings };
        }
    }

    // ========== 新增：条目位置/深度/顺序配置管理 ==========
    function getEntryConfig(category, entryName) {
        const key = `${category}::${entryName}`;
        if (entryPositionConfig[key]) {
            return entryPositionConfig[key];
        }
        // 返回分类默认配置或全局默认
        if (categoryDefaultConfig[category]) {
            return { ...categoryDefaultConfig[category] };
        }
        return { position: 0, depth: 4, order: 100 };
    }

    function setEntryConfig(category, entryName, config) {
        const key = `${category}::${entryName}`;
        entryPositionConfig[key] = { ...config };
        settings.entryPositionConfig = entryPositionConfig;
        saveCurrentSettings();
    }

    function setCategoryDefaultConfig(category, config) {
        categoryDefaultConfig[category] = { ...config };
        settings.categoryDefaultConfig = categoryDefaultConfig;
        saveCurrentSettings();
    }

    /**
     * @namespace API
     * Handles external API interactions
     */
    Services.API = {
        async callSillyTavern(prompt, taskId = null) {
            const timeout = appStore.state.settings.apiTimeout || CONSTANTS.DEFAULT_API_TIMEOUT;
            const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
            updateStreamContent(`\n📤 ${logPrefix} 发送请求到酒馆API...\n`);

            try {
                if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
                    throw new Error('无法访问SillyTavern上下文');
                }

                const context = SillyTavern.getContext();
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`API请求超时 (${timeout / 1000}秒)`)), timeout);
                });

                let apiPromise;
                if (typeof context.generateQuietPrompt === 'function') {
                    apiPromise = context.generateQuietPrompt(prompt, false, false);
                } else if (typeof context.generateRaw === 'function') {
                    apiPromise = context.generateRaw(prompt, '', false);
                } else {
                    throw new Error('无法找到可用的生成函数');
                }

                const result = await Promise.race([apiPromise, timeoutPromise]);
                updateStreamContent(`📥 ${logPrefix} 收到响应 (${result.length}字符)\n`);
                return result;

            } catch (error) {
                updateStreamContent(`\n❌ ${logPrefix} 错误: ${error.message}\n`);
                throw error;
            }
        },

        async callCustom(prompt, retryCount = 0) {
            const maxRetries = 3;
            const timeout = appStore.state.settings.apiTimeout || CONSTANTS.DEFAULT_API_TIMEOUT;
            const settings = appStore.state.settings;
            let requestUrl, requestOptions;

            const provider = settings.customApiProvider;
            const apiKey = settings.customApiKey;
            const endpoint = settings.customApiEndpoint;
            const model = settings.customApiModel;

            updateStreamContent(`\n📤 发送请求到自定义API (${provider})...\n`);

            // ... (Rest of logic will be migrated in subsequent steps if needed,
            // for now we are just defining the structure.
            // The actual callCustomAPI function implementation is complex and specific to providers)
            // Ideally we would move the switch case here.
            return callCustomAPI(prompt, retryCount); // Proxy to existing function for now
        }
    };

    // ========== 兼容层 (Proxy to new Services) ==========
    async function callSillyTavernAPI(prompt, taskId = null) {
        return Services.API.callSillyTavern(prompt, taskId);
    }

    // Original callCustomAPI implementation remains below for now,
    // but future refactoring should move it fully into Services.API

    // ========== API调用 - 自定义API ==========
    async function callCustomAPI(prompt, retryCount = 0) {
        const maxRetries = 3;
        const timeout = settings.apiTimeout || CONSTANTS.DEFAULT_API_TIMEOUT;
        let requestUrl, requestOptions;

        const provider = settings.customApiProvider;
        const apiKey = settings.customApiKey;
        const endpoint = settings.customApiEndpoint;
        const model = settings.customApiModel;

        updateStreamContent(`\n📤 发送请求到自定义API (${provider})...\n`);

        switch (provider) {
            case 'deepseek':
                if (!apiKey) throw new Error('DeepSeek API Key 未设置');
                requestUrl = 'https://api.deepseek.com/chat/completions';
                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model || 'deepseek-chat',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,
                        max_tokens: 8192
                    }),
                };
                break;

            case 'gemini':
                if (!apiKey) throw new Error('Gemini API Key 未设置');
                const geminiModel = model || 'gemini-2.5-flash';
                requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 65536, temperature: 0.3 },
                        safetySettings: [
                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' }
                        ]
                    }),
                };
                break;

            case 'gemini-proxy':
                if (!endpoint) throw new Error('Gemini Proxy Endpoint 未设置');
                if (!apiKey) throw new Error('Gemini Proxy API Key 未设置');

                let proxyBaseUrl = endpoint;
                if (!proxyBaseUrl.startsWith('http')) proxyBaseUrl = 'https://' + proxyBaseUrl;
                if (proxyBaseUrl.endsWith('/')) proxyBaseUrl = proxyBaseUrl.slice(0, -1);

                const geminiProxyModel = model || 'gemini-2.5-flash';
                const useOpenAIFormat = proxyBaseUrl.endsWith('/v1');

                if (useOpenAIFormat) {
                    requestUrl = proxyBaseUrl + '/chat/completions';
                    requestOptions = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: geminiProxyModel,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                            max_tokens: 65536
                        }),
                    };
                } else {
                    const finalProxyUrl = `${proxyBaseUrl}/${geminiProxyModel}:generateContent`;
                    requestUrl = finalProxyUrl.includes('?')
                        ? `${finalProxyUrl}&key=${apiKey}`
                        : `${finalProxyUrl}?key=${apiKey}`;
                    requestOptions = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { maxOutputTokens: 65536, temperature: 0.3 }
                        }),
                    };
                }
                break;

            case 'openai-compatible':
                let openaiEndpoint = endpoint || 'http://127.0.0.1:5000/v1/chat/completions';
                const openaiModel = model || 'local-model';

                if (!openaiEndpoint.includes('/chat/completions')) {
                    if (openaiEndpoint.endsWith('/v1')) {
                        openaiEndpoint += '/chat/completions';
                    } else {
                        openaiEndpoint = openaiEndpoint.replace(/\/$/, '') + '/chat/completions';
                    }
                }

                if (!openaiEndpoint.startsWith('http')) {
                    openaiEndpoint = 'http://' + openaiEndpoint;
                }

                requestUrl = openaiEndpoint;
                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                requestOptions = {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,
                        max_tokens: 64000
                    }),
                };
                break;

            default:
                throw new Error(`不支持的API提供商: ${provider}`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        requestOptions.signal = controller.signal;

        try {
            const response = await fetch(requestUrl, requestOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.log('API错误响应:', errorText);

                if (response.status === 429 || errorText.includes('resource_exhausted') || errorText.includes('rate limit')) {
                    if (retryCount < maxRetries) {
                        const delay = Math.pow(2, retryCount) * 1000;
                        updateStreamContent(`⏳ 遇到限流，${delay}ms后重试...\n`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return callCustomAPI(prompt, retryCount + 1);
                    } else {
                        throw new Error(`API限流：已达到最大重试次数`);
                    }
                }

                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            let result;

            if (provider === 'gemini') {
                result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } else if (provider === 'gemini-proxy') {
                if (data.candidates) {
                    result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                } else if (data.choices) {
                    result = data.choices?.[0]?.message?.content || '';
                }
            } else {
                result = data.choices?.[0]?.message?.content || '';
            }

            updateStreamContent(`📥 收到响应 (${result.length}字符)\n`);
            return result;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`API请求超时 (${timeout / 1000}秒)`);
            }
            throw error;
        }
    }

    // ========== 拉取模型列表 ==========
    async function fetchModelList() {
        const endpoint = settings.customApiEndpoint || '';
        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }

        let modelsUrl = endpoint;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (modelsUrl.endsWith('/v1')) {
            modelsUrl = modelsUrl + '/models';
        } else if (!modelsUrl.endsWith('/models')) {
            modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
        }

        if (!modelsUrl.startsWith('http')) {
            modelsUrl = 'http://' + modelsUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (settings.customApiKey) {
            headers['Authorization'] = `Bearer ${settings.customApiKey}`;
        }

        console.log('📤 拉取模型列表:', modelsUrl);

        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`拉取模型列表失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('📥 模型列表响应:', data);

        let models = [];
        if (data.data && Array.isArray(data.data)) {
            models = data.data.map(m => m.id || m.name || m);
        } else if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
        } else if (data.models && Array.isArray(data.models)) {
            models = data.models.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
        }

        return models;
    }

    // ========== 快速测试 ==========
    async function quickTestModel() {
        const endpoint = settings.customApiEndpoint || '';
        const model = settings.customApiModel || '';

        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }
        if (!model) {
            throw new Error('请先设置模型名称');
        }

        let requestUrl = endpoint;
        if (!requestUrl.includes('/chat/completions')) {
            if (requestUrl.endsWith('/v1')) {
                requestUrl += '/chat/completions';
            } else {
                requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
        }

        if (!requestUrl.startsWith('http')) {
            requestUrl = 'http://' + requestUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (settings.customApiKey) {
            headers['Authorization'] = `Bearer ${settings.customApiKey}`;
        }

        console.log('📤 快速测试:', requestUrl, '模型:', model);

        const startTime = Date.now();

        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
                max_tokens: 100,
                temperature: 0.1
            })
        });

        const elapsed = Date.now() - startTime;

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`测试失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('📥 测试响应:', data);

        let responseText = '';

        if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.message && choice.message.content) {
                responseText = choice.message.content;
            } else if (choice.text) {
                responseText = choice.text;
            } else if (typeof choice.content === 'string') {
                responseText = choice.content;
            }
        } else if (data.response) {
            responseText = data.response;
        } else if (data.content) {
            responseText = data.content;
        } else if (data.text) {
            responseText = data.text;
        } else if (data.output) {
            responseText = data.output;
        } else if (data.generated_text) {
            responseText = data.generated_text;
        }

        if (!responseText || responseText.trim() === '') {
            console.warn('无法解析响应，完整数据:', JSON.stringify(data, null, 2));

            const possibleFields = ['result', 'message', 'data', 'completion'];
            for (const field of possibleFields) {
                if (data[field]) {
                    if (typeof data[field] === 'string') {
                        responseText = data[field];
                        break;
                    } else if (typeof data[field] === 'object' && data[field].content) {
                        responseText = data[field].content;
                        break;
                    }
                }
            }
        }

        if (!responseText || responseText.trim() === '') {
            throw new Error(`API返回了无法解析的响应格式。\n响应数据: ${JSON.stringify(data).substring(0, 200)}`);
        }

        return {
            success: true,
            elapsed: elapsed,
            response: responseText.substring(0, 100)
        };
    }

    // ========== 统一API调用入口 ==========
    async function callAPI(prompt, taskId = null) {
        if (settings.useTavernApi) {
            return await callSillyTavernAPI(prompt, taskId);
        } else {
            return await callCustomAPI(prompt);
        }
    }

    // ========== 世界书数据处理 ==========
    function normalizeWorldbookEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        if (entry.content !== undefined && entry['内容'] !== undefined) {
            const contentLen = String(entry.content || '').length;
            const neirongLen = String(entry['内容'] || '').length;
            if (contentLen > neirongLen) entry['内容'] = entry.content;
            delete entry.content;
        } else if (entry.content !== undefined) {
            entry['内容'] = entry.content;
            delete entry.content;
        }
        return entry;
    }

    function normalizeWorldbookData(data) {
        if (!data || typeof data !== 'object') return data;
        for (const category in data) {
            if (typeof data[category] === 'object' && data[category] !== null && !Array.isArray(data[category])) {
                if (data[category]['关键词'] || data[category]['内容'] || data[category].content) {
                    normalizeWorldbookEntry(data[category]);
                } else {
                    for (const entryName in data[category]) {
                        if (typeof data[category][entryName] === 'object') {
                            normalizeWorldbookEntry(data[category][entryName]);
                        }
                    }
                }
            }
        }
        return data;
    }

    function mergeWorldbookData(target, source) {
        normalizeWorldbookData(source);
        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                mergeWorldbookData(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }

    function mergeWorldbookDataIncremental(target, source) {
        normalizeWorldbookData(source);
        for (const category in source) {
            if (typeof source[category] !== 'object' || source[category] === null) continue;
            if (!target[category]) target[category] = {};
            for (const entryName in source[category]) {
                const sourceEntry = source[category][entryName];
                if (typeof sourceEntry !== 'object' || sourceEntry === null) continue;
                if (target[category][entryName]) {
                    const targetEntry = target[category][entryName];
                    if (Array.isArray(sourceEntry['关键词']) && Array.isArray(targetEntry['关键词'])) {
                        targetEntry['关键词'] = [...new Set([...targetEntry['关键词'], ...sourceEntry['关键词']])];
                    } else if (Array.isArray(sourceEntry['关键词'])) {
                        targetEntry['关键词'] = sourceEntry['关键词'];
                    }
                    if (sourceEntry['内容']) {
                        const existingContent = targetEntry['内容'] || '';
                        const newContent = sourceEntry['内容'];
                        if (newContent && !existingContent.includes(newContent.substring(0, 50))) {
                            targetEntry['内容'] = existingContent + '\n\n---\n\n' + newContent;
                        }
                    }
                } else {
                    target[category][entryName] = JSON.parse(JSON.stringify(sourceEntry));
                }
            }
        }
    }

    function findChangedEntries(oldWorldbook, newWorldbook) {
        const changes = [];
        for (const category in newWorldbook) {
            const oldCategory = oldWorldbook[category] || {};
            const newCategory = newWorldbook[category];
            for (const entryName in newCategory) {
                const oldEntry = oldCategory[entryName];
                const newEntry = newCategory[entryName];
                if (!oldEntry) {
                    changes.push({ type: 'add', category, entryName, oldValue: null, newValue: newEntry });
                } else if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
                    changes.push({ type: 'modify', category, entryName, oldValue: oldEntry, newValue: newEntry });
                }
            }
        }
        for (const category in oldWorldbook) {
            const oldCategory = oldWorldbook[category];
            const newCategory = newWorldbook[category] || {};
            for (const entryName in oldCategory) {
                if (!newCategory[entryName]) {
                    changes.push({ type: 'delete', category, entryName, oldValue: oldCategory[entryName], newValue: null });
                }
            }
        }
        return changes;
    }

    async function mergeWorldbookDataWithHistory(target, source, memoryIndex, memoryTitle) {
        const previousWorldbook = JSON.parse(JSON.stringify(target));
        if (incrementalOutputMode) {
            mergeWorldbookDataIncremental(target, source);
        } else {
            mergeWorldbookData(target, source);
        }
        const changedEntries = findChangedEntries(previousWorldbook, target);
        if (changedEntries.length > 0) {
            await MemoryHistoryDB.saveHistory(memoryIndex, memoryTitle, previousWorldbook, target, changedEntries);
        }
        return changedEntries;
    }

    // ========== 后处理添加章节编号后缀 ==========
    function postProcessResultWithChapterIndex(result, chapterIndex) {
        if (!result || typeof result !== 'object') return result;
        if (!settings.forceChapterMarker) return result;

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

    // ========== 解析AI响应 ==========
    function extractWorldbookDataByRegex(jsonString) {
        const result = {};
        const categories = getEnabledCategoryNames();
        for (const category of categories) {
            const categoryPattern = new RegExp(`"${category}"\\s*:\\s*\\{`, 'g');
            const categoryMatch = categoryPattern.exec(jsonString);
            if (!categoryMatch) continue;
            const startPos = categoryMatch.index + categoryMatch[0].length;
            let braceCount = 1;
            let endPos = startPos;
            while (braceCount > 0 && endPos < jsonString.length) {
                if (jsonString[endPos] === '{') braceCount++;
                if (jsonString[endPos] === '}') braceCount--;
                endPos++;
            }
            if (braceCount !== 0) continue;
            const categoryContent = jsonString.substring(startPos, endPos - 1);
            result[category] = {};
            const entryPattern = /"([^"]+)"\s*:\s*\{/g;
            let entryMatch;
            while ((entryMatch = entryPattern.exec(categoryContent)) !== null) {
                const entryName = entryMatch[1];
                const entryStartPos = entryMatch.index + entryMatch[0].length;
                let entryBraceCount = 1;
                let entryEndPos = entryStartPos;
                while (entryBraceCount > 0 && entryEndPos < categoryContent.length) {
                    if (categoryContent[entryEndPos] === '{') entryBraceCount++;
                    if (categoryContent[entryEndPos] === '}') entryBraceCount--;
                    entryEndPos++;
                }
                if (entryBraceCount !== 0) continue;
                const entryContent = categoryContent.substring(entryStartPos, entryEndPos - 1);
                let keywords = [];
                const keywordsMatch = entryContent.match(/"关键词"\s*:\s*\[([\s\S]*?)\]/);
                if (keywordsMatch) {
                    const keywordStrings = keywordsMatch[1].match(/"([^"]+)"/g);
                    if (keywordStrings) keywords = keywordStrings.map(s => s.replace(/"/g, ''));
                }
                let content = '';
                const contentMatch = entryContent.match(/"内容"\s*:\s*"/);
                if (contentMatch) {
                    const contentStartPos = contentMatch.index + contentMatch[0].length;
                    let contentEndPos = contentStartPos;
                    let escaped = false;
                    while (contentEndPos < entryContent.length) {
                        const char = entryContent[contentEndPos];
                        if (escaped) { escaped = false; }
                        else if (char === '\\') { escaped = true; }
                        else if (char === '"') { break; }
                        contentEndPos++;
                    }
                    content = entryContent.substring(contentStartPos, contentEndPos);
                    try { content = JSON.parse(`"${content}"`); }
                    catch (e) { content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
                }
                if (content || keywords.length > 0) {
                    result[category][entryName] = { '关键词': keywords, '内容': content };
                }
            }
            if (Object.keys(result[category]).length === 0) delete result[category];
        }
        return result;
    }

    async function parseAIResponse(response) {
        if (!response) return {};

        // Use Worker if available
        if (WorkerService.isReady()) {
            try {
                return await WorkerService.parseJSON(response);
            } catch (e) {
                console.warn('Worker JSON parse failed, falling back to regex:', e);
            }
        }

        // Fallback or if worker failed (e.g. timeout)
        try {
            return JSON.parse(response);
        } catch (e) {
            // ... (keep existing regex logic as last resort or rely on worker's robustness)
            // For now, since Worker has repair logic, we can rely on it mostly.
            // But let's keep a simple main-thread fallback just in case.
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
                } catch (e2) {
                    // Try to repair common errors
                    let fixed = (jsonMatch[1] || jsonMatch[0])
                        .replace(/,\s*}/g, '}')
                        .replace(/,\s*]/g, ']')
                        .replace(/\n/g, ' ');
                    try { return JSON.parse(fixed); } catch (e3) { }
                }
            }
            // Last resort: extract using regex pattern matching (the old robust way)
            return extractWorldbookDataByRegex(response);
        }
    }

    // ========== 分卷功能 ==========
    function startNewVolume() {
        if (Object.keys(generatedWorldbook).length > 0) {
            worldbookVolumes.push({
                volumeIndex: currentVolumeIndex,
                worldbook: JSON.parse(JSON.stringify(generatedWorldbook)),
                timestamp: Date.now()
            });
        }
        currentVolumeIndex++;
        generatedWorldbook = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
        updateVolumeIndicator();
    }

    function updateVolumeIndicator() {
        const indicator = document.getElementById('ttw-volume-indicator');
        if (indicator) {
            indicator.textContent = `当前: 第${currentVolumeIndex + 1}卷 | 已完成: ${worldbookVolumes.length}卷`;
            indicator.style.display = 'block';
        }
    }

    function getAllVolumesWorldbook() {
        const merged = {};
        for (const volume of worldbookVolumes) {
            for (const category in volume.worldbook) {
                if (!merged[category]) merged[category] = {};
                for (const entryName in volume.worldbook[category]) {
                    const key = merged[category][entryName] ? `${entryName}_卷${volume.volumeIndex + 1}` : entryName;
                    merged[category][key] = volume.worldbook[category][entryName];
                }
            }
        }
        for (const category in generatedWorldbook) {
            if (!merged[category]) merged[category] = {};
            for (const entryName in generatedWorldbook[category]) {
                const key = merged[category][entryName] ? `${entryName}_卷${currentVolumeIndex + 1}` : entryName;
                merged[category][key] = generatedWorldbook[category][entryName];
            }
        }
        return merged;
    }

    // ========== 记忆分裂 ==========
    function splitMemoryIntoTwo(memoryIndex) {
        const memory = memoryQueue[memoryIndex];
        if (!memory) return null;
        const content = memory.content;
        const halfLength = Math.floor(content.length / 2);
        let splitPoint = halfLength;
        const paragraphBreak = content.indexOf('\n\n', halfLength);
        if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
            splitPoint = paragraphBreak + 2;
        } else {
            const sentenceBreak = content.indexOf('。', halfLength);
            if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                splitPoint = sentenceBreak + 1;
            }
        }
        const content1 = content.substring(0, splitPoint);
        const content2 = content.substring(splitPoint);
        const originalTitle = memory.title;
        let baseName = originalTitle;
        let suffix1, suffix2;
        const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
        if (splitMatch) {
            baseName = splitMatch[1];
            const currentNum = parseInt(splitMatch[2]);
            suffix1 = `-${currentNum}-1`;
            suffix2 = `-${currentNum}-2`;
        } else {
            suffix1 = '-1';
            suffix2 = '-2';
        }
        const memory1 = { title: baseName + suffix1, content: content1, processed: false, failed: false, failedError: null };
        const memory2 = { title: baseName + suffix2, content: content2, processed: false, failed: false, failedError: null };
        memoryQueue.splice(memoryIndex, 1, memory1, memory2);
        return { part1: memory1, part2: memory2 };
    }

    // 分裂从指定索引开始的所有后续记忆
    function splitAllRemainingMemories(startIndex) {
        console.log(`🔀 开始分裂从索引 ${startIndex} 开始的所有后续记忆...`);
        let splitCount = 0;

        for (let i = memoryQueue.length - 1; i >= startIndex; i--) {
            const memory = memoryQueue[i];
            if (!memory || memory.processed) continue;

            const content = memory.content;
            const halfLength = Math.floor(content.length / 2);

            let splitPoint = halfLength;
            const paragraphBreak = content.indexOf('\n\n', halfLength);
            if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
                splitPoint = paragraphBreak + 2;
            } else {
                const sentenceBreak = content.indexOf('。', halfLength);
                if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                    splitPoint = sentenceBreak + 1;
                }
            }

            const content1 = content.substring(0, splitPoint);
            const content2 = content.substring(splitPoint);

            const originalTitle = memory.title;
            let baseName = originalTitle;
            let suffix1, suffix2;

            const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
            if (splitMatch) {
                baseName = splitMatch[1];
                const currentNum = parseInt(splitMatch[2]);
                suffix1 = `-${currentNum}-1`;
                suffix2 = `-${currentNum}-2`;
            } else {
                suffix1 = '-1';
                suffix2 = '-2';
            }

            const memory1 = {
                title: baseName + suffix1,
                content: content1,
                processed: false,
                failed: false,
                failedError: null
            };

            const memory2 = {
                title: baseName + suffix2,
                content: content2,
                processed: false,
                failed: false,
                failedError: null
            };

            memoryQueue.splice(i, 1, memory1, memory2);
            splitCount++;
        }

        console.log(`✅ 分裂完成: 分裂了${splitCount}个记忆`);
        return splitCount;
    }

    function deleteMemoryAt(index) {
        if (index < 0 || index >= memoryQueue.length) return;
        const memory = memoryQueue[index];
        if (confirm(`确定要删除 "${memory.title}" 吗？`)) {
            memoryQueue.splice(index, 1);
            memoryQueue.forEach((m, i) => { if (!m.title.includes('-')) m.title = `记忆${i + 1}`; });
            if (startFromIndex > index) startFromIndex = Math.max(0, startFromIndex - 1);
            else if (startFromIndex >= memoryQueue.length) startFromIndex = Math.max(0, memoryQueue.length - 1);
            if (userSelectedStartIndex !== null) {
                if (userSelectedStartIndex > index) userSelectedStartIndex = Math.max(0, userSelectedStartIndex - 1);
                else if (userSelectedStartIndex >= memoryQueue.length) userSelectedStartIndex = null;
            }
            updateMemoryQueueUI();
            updateStartButtonState(false);
        }
    }

    function deleteSelectedMemories() {
        if (selectedMemoryIndices.size === 0) {
            Services.UI.showToast('请先选择要删除的章节', 'warning');
            return;
        }

        const hasProcessed = [...selectedMemoryIndices].some(i => memoryQueue[i]?.processed && !memoryQueue[i]?.failed);
        let confirmMsg = `确定要删除选中的 ${selectedMemoryIndices.size} 个章节吗？`;
        if (hasProcessed) {
            confirmMsg += '\n\n⚠️ 警告：选中的章节中包含已处理的章节，删除后相关的世界书数据不会自动更新！';
        }

        if (!confirm(confirmMsg)) return;

        const sortedIndices = [...selectedMemoryIndices].sort((a, b) => b - a);
        for (const index of sortedIndices) {
            memoryQueue.splice(index, 1);
        }

        memoryQueue.forEach((m, i) => {
            if (!m.title.includes('-')) m.title = `记忆${i + 1}`;
        });

        startFromIndex = Math.min(startFromIndex, Math.max(0, memoryQueue.length - 1));
        if (userSelectedStartIndex !== null) {
            userSelectedStartIndex = Math.min(userSelectedStartIndex, Math.max(0, memoryQueue.length - 1));
        }

        selectedMemoryIndices.clear();
        isMultiSelectMode = false;

        updateMemoryQueueUI();
        updateStartButtonState(false);
    }

    // ========== 获取系统提示词 ==========
    function getSystemPrompt() {
        let worldbookPrompt = settings.customWorldbookPrompt?.trim() || defaultWorldbookPrompt;

        const dynamicTemplate = generateDynamicJsonTemplate();
        worldbookPrompt = worldbookPrompt.replace('{DYNAMIC_JSON_TEMPLATE}', dynamicTemplate);

        const additionalParts = [];
        if (settings.enablePlotOutline) {
            additionalParts.push(settings.customPlotPrompt?.trim() || defaultPlotPrompt);
        }
        if (settings.enableLiteraryStyle) {
            additionalParts.push(settings.customStylePrompt?.trim() || defaultStylePrompt);
        }
        if (additionalParts.length === 0) return worldbookPrompt;
        let fullPrompt = worldbookPrompt;
        const insertContent = ',\n' + additionalParts.join(',\n');
        fullPrompt = fullPrompt.replace(/(\}\s*)\n\`\`\`/, `${insertContent}\n$1\n\`\`\``);
        return fullPrompt;
    }

    // ========== 获取上一个记忆的处理结果摘要 ==========
    function getPreviousMemoryContext(index) {
        if (index <= 0) return '';

        for (let i = index - 1; i >= 0; i--) {
            const prevMemory = memoryQueue[i];
            if (prevMemory && prevMemory.processed && prevMemory.result && !prevMemory.failed) {
                const plotContext = [];
                const result = prevMemory.result;

                if (result['剧情大纲']) {
                    for (const entryName in result['剧情大纲']) {
                        plotContext.push(`${entryName}: ${result['剧情大纲'][entryName]['内容']?.substring(0, 200) || ''}`);
                    }
                }
                if (result['剧情节点']) {
                    for (const entryName in result['剧情节点']) {
                        plotContext.push(`${entryName}: ${result['剧情节点'][entryName]['内容']?.substring(0, 200) || ''}`);
                    }
                }
                if (result['章节剧情']) {
                    for (const entryName in result['章节剧情']) {
                        plotContext.push(`${entryName}: ${result['章节剧情'][entryName]['内容']?.substring(0, 200) || ''}`);
                    }
                }

                if (plotContext.length > 0) {
                    return `\n\n【上一章节(第${i + 1}章)的剧情进展】：\n${plotContext.join('\n')}\n\n请在此基础上继续分析后续剧情，不要重复输出已有的章节。`;
                }
                break;
            }
        }
        return '';
    }

    // ========== 生成章节强制标记提示词 ==========
    function getChapterForcePrompt(chapterIndex) {
        return `
【强制章节标记 - 开始】
强制无视内容中的任何章节信息！本轮全文章节统一为：第${chapterIndex}章
无论原文中出现"第一章"、"第二章"等任何章节标记，你输出时都必须将其替换为"第${chapterIndex}章"。
【强制章节标记 - 结束】
`;
    }

    // ========== 并行处理 ==========
    async function processMemoryChunkIndependent(index, retryCount = 0, customPromptSuffix = '') {
        const memory = memoryQueue[index];
        const maxRetries = 3;
        const taskId = index + 1;
        const chapterIndex = index + 1;

        if (!isRerolling && isProcessingStopped) throw new Error('ABORTED');

        memory.processing = true;
        updateMemoryQueueUI();

        const chapterForcePrompt = settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + getSystemPrompt();

        // 【RAG 增强】注入相关历史条目上下文 (并行处理时，generatedWorldbook可能为空或不完整，但仍有价值)
        const contextStr = Services.Context.buildContext(memory.content, generatedWorldbook);
        if (contextStr) {
            prompt += `\n${contextStr}\n`;
        }

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (index > 0 && memoryQueue[index - 1].content) {
            prompt += `\n\n前文结尾（供参考）：\n---\n${memoryQueue[index - 1].content.slice(-800)}\n---\n`;
        }

        prompt += `\n\n当前需要分析的内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        const enabledCatNames = getEnabledCategories().map(c => c.name).join('、');
        prompt += `\n请提取${enabledCatNames}等信息，直接输出JSON。`;

        if (settings.forceChapterMarker) {
            prompt += `\n\n【重要提醒】如果输出剧情大纲或剧情节点或章节剧情，条目名称必须包含"第${chapterIndex}章"！`;
            prompt += chapterForcePrompt;
        }

        if (customPromptSuffix) {
            prompt += `\n\n${customPromptSuffix}`;
        }

        updateStreamContent(`\n🔄 [第${chapterIndex}章] 开始处理: ${memory.title}\n`);

        try {
            const response = await callAPI(prompt, taskId);

            if (!isRerolling && isProcessingStopped) {
                memory.processing = false;
                throw new Error('ABORTED');
            }

            if (isTokenLimitError(response)) throw new Error('Token limit exceeded');

            let memoryUpdate = parseAIResponse(response);

            memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);

            updateStreamContent(`✅ [第${chapterIndex}章] 处理完成\n`);
            return memoryUpdate;

        } catch (error) {
            memory.processing = false;
            if (error.message === 'ABORTED') throw error;

            updateStreamContent(`❌ [第${chapterIndex}章] 错误: ${error.message}\n`);

            if (isTokenLimitError(error.message)) throw new Error(`TOKEN_LIMIT:${index}`);

            if (retryCount < maxRetries && !isProcessingStopped) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateStreamContent(`🔄 [第${chapterIndex}章] ${delay / 1000}秒后重试...\n`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return processMemoryChunkIndependent(index, retryCount + 1, customPromptSuffix);
            }
            throw error;
        }
    }

    async function processMemoryChunksParallel(startIndex, endIndex) {
        const tasks = [];
        const results = new Map();
        const tokenLimitIndices = [];

        for (let i = startIndex; i < endIndex && i < memoryQueue.length; i++) {
            if (memoryQueue[i].processed && !memoryQueue[i].failed) continue;
            tasks.push({ index: i, memory: memoryQueue[i] });
        }

        if (tasks.length === 0) return { tokenLimitIndices };

        updateStreamContent(`\n🚀 并行处理 ${tasks.length} 个记忆块 (并发: ${parallelConfig.concurrency})\n${'='.repeat(50)}\n`);

        let completed = 0;
        globalSemaphore = new Semaphore(parallelConfig.concurrency);

        const processOne = async (task) => {
            if (isProcessingStopped) return null;
            try { await globalSemaphore.acquire(); }
            catch (e) { if (e.message === 'ABORTED') return null; throw e; }
            if (isProcessingStopped) { globalSemaphore.release(); return null; }

            activeParallelTasks.add(task.index);

            try {
                updateProgress(((startIndex + completed) / memoryQueue.length) * 100, `🚀 并行处理中 (${completed}/${tasks.length})`);
                const result = await processMemoryChunkIndependent(task.index);

                task.memory.processed = true;
                task.memory.failed = false;
                task.memory.processing = false;
                task.memory.result = result;
                results.set(task.index, result);
                completed++;

                if (result) {
                    await mergeWorldbookDataWithHistory(generatedWorldbook, result, task.index, task.memory.title);
                    await MemoryHistoryDB.saveRollResult(task.index, result);
                }

                updateMemoryQueueUI();
                return result;
            } catch (error) {
                completed++;
                task.memory.processing = false;

                if (error.message === 'ABORTED') { updateMemoryQueueUI(); return null; }
                if (error.message.startsWith('TOKEN_LIMIT:')) {
                    tokenLimitIndices.push(parseInt(error.message.split(':')[1]));
                } else {
                    task.memory.failed = true;
                    task.memory.failedError = error.message;
                    task.memory.processed = true;
                }
                updateMemoryQueueUI();
                return null;
            } finally {
                activeParallelTasks.delete(task.index);
                globalSemaphore.release();
            }
        };

        await Promise.allSettled(tasks.map(task => processOne(task)));
        activeParallelTasks.clear();
        globalSemaphore = null;

        updateStreamContent(`\n${'='.repeat(50)}\n📦 并行处理完成，成功: ${results.size}/${tasks.length}\n`);
        return { tokenLimitIndices };
    }

    // ========== 串行处理 ==========
    async function processMemoryChunk(index, retryCount = 0) {
        if (isProcessingStopped) return;

        const memory = memoryQueue[index];
        const progress = ((index + 1) / memoryQueue.length) * 100;
        const maxRetries = 3;
        const chapterIndex = index + 1;

        updateProgress(progress, `正在处理: ${memory.title} (第${chapterIndex}章)${retryCount > 0 ? ` (重试 ${retryCount})` : ''}`);

        memory.processing = true;
        updateMemoryQueueUI();

        const chapterForcePrompt = settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + getSystemPrompt();

        // 【RAG 增强】注入相关历史条目上下文
        const contextStr = Services.Context.buildContext(memory.content, generatedWorldbook);
        if (contextStr) {
            prompt += `\n${contextStr}\n`;
        }

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (index > 0) {
            prompt += `\n\n上次阅读结尾：\n---\n${memoryQueue[index - 1].content.slice(-500)}\n---\n`;
            prompt += `\n当前世界书：\n${JSON.stringify(generatedWorldbook, null, 2)}\n`;
        }
        prompt += `\n现在阅读的部分（第${chapterIndex}章）：\n---\n${memory.content}\n---\n`;

        if (index === 0 || index === startFromIndex) {
            prompt += `\n请开始分析小说内容。`;
        } else if (incrementalOutputMode) {
            prompt += `\n请增量更新世界书，只输出变更的条目。`;
        } else {
            prompt += `\n请累积补充世界书。`;
        }

        if (settings.forceChapterMarker) {
            prompt += `\n\n【重要提醒】如果输出剧情大纲或剧情节点或章节剧情，条目名称必须包含"第${chapterIndex}章"！`;
            prompt += `\n直接输出JSON格式结果。`;
            prompt += chapterForcePrompt;
        } else {
            prompt += `\n直接输出JSON格式结果。`;
        }

        try {
            const response = await callAPI(prompt);
            memory.processing = false;

            if (isProcessingStopped) { updateMemoryQueueUI(); return; }

            if (isTokenLimitError(response)) {
                if (useVolumeMode) {
                    startNewVolume();
                    await MemoryHistoryDB.saveState(index);
                    await processMemoryChunk(index, 0);
                    return;
                }
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(index);
                    await processMemoryChunk(index, 0);
                    await processMemoryChunk(index + 1, 0);
                    return;
                }
            }

            let memoryUpdate = parseAIResponse(response);
            memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);

            await mergeWorldbookDataWithHistory(generatedWorldbook, memoryUpdate, index, memory.title);
            await MemoryHistoryDB.saveRollResult(index, memoryUpdate);

            memory.processed = true;
            memory.result = memoryUpdate;
            updateMemoryQueueUI();

        } catch (error) {
            memory.processing = false;

            if (isTokenLimitError(error.message || '')) {
                if (useVolumeMode) {
                    startNewVolume();
                    await MemoryHistoryDB.saveState(index);
                    await new Promise(r => setTimeout(r, 500));
                    await processMemoryChunk(index, 0);
                    return;
                }
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(index);
                    await new Promise(r => setTimeout(r, 500));
                    await processMemoryChunk(index, 0);
                    await processMemoryChunk(index + 1, 0);
                    return;
                }
            }

            if (retryCount < maxRetries) {
                const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateProgress(progress, `处理失败，${retryDelay / 1000}秒后重试`);
                await new Promise(r => setTimeout(r, retryDelay));
                return await processMemoryChunk(index, retryCount + 1);
            }

            memory.processed = true;
            memory.failed = true;
            memory.failedError = error.message;
            if (!failedMemoryQueue.find(m => m.index === index)) {
                failedMemoryQueue.push({ index, memory, error: error.message });
            }
            updateMemoryQueueUI();
        }

        if (memory.processed) await new Promise(r => setTimeout(r, 1000));
    }

    function stopProcessing() {
        isProcessingStopped = true;
        isRerolling = false;
        if (globalSemaphore) globalSemaphore.abort();
        activeParallelTasks.clear();
        memoryQueue.forEach(m => { if (m.processing) m.processing = false; });
        updateMemoryQueueUI();
        updateStreamContent(`\n⏸️ 已暂停\n`);
        updateStopButtonVisibility(true);
    }

    function updateStopButtonVisibility(show) {
        const stopBtn = document.getElementById('ttw-stop-btn');
        if (stopBtn) {
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = !show;
        }
    }

    // ========== 应用默认世界书条目 ==========
    // ========== 应用默认世界书条目 ==========
    function applyDefaultWorldbookEntries() {
        // 优先使用UI数据
        if (defaultWorldbookEntriesUI && defaultWorldbookEntriesUI.length > 0) {
            for (const entry of defaultWorldbookEntriesUI) {
                if (!entry.category || !entry.name) continue;
                if (!generatedWorldbook[entry.category]) {
                    generatedWorldbook[entry.category] = {};
                }
                generatedWorldbook[entry.category][entry.name] = {
                    '关键词': entry.keywords || [],
                    '内容': entry.content || ''
                };

                // 【新增】同步位置/深度/顺序配置到 entryPositionConfig
                if (entry.position !== undefined || entry.depth !== undefined || entry.order !== undefined) {
                    setEntryConfig(entry.category, entry.name, {
                        position: entry.position ?? 0,
                        depth: entry.depth ?? 4,
                        order: entry.order ?? 100
                    });
                }
            }
            updateStreamContent(`\n📚 已添加 ${defaultWorldbookEntriesUI.length} 个默认世界书条目\n`);
            return true;
        }

        // 兼容旧的JSON格式
        if (!settings.defaultWorldbookEntries?.trim()) return false;

        try {
            const defaultEntries = JSON.parse(settings.defaultWorldbookEntries);
            mergeWorldbookDataIncremental(generatedWorldbook, defaultEntries);
            updateStreamContent(`\n📚 已添加默认世界书条目\n`);
            return true;
        } catch (e) {
            console.error('解析默认世界书条目失败:', e);
            updateStreamContent(`\n⚠️ 默认世界书条目格式错误，跳过\n`);
            return false;
        }
    }


    // ========== 主处理流程 ==========
    async function startAIProcessing() {
        showProgressSection(true);
        isProcessingStopped = false;

        updateStopButtonVisibility(true);

        if (globalSemaphore) globalSemaphore.reset();
        activeParallelTasks.clear();

        updateStreamContent('', true);

        const enabledCatNames = getEnabledCategories().map(c => c.name).join(', ');
        updateStreamContent(`🚀 开始处理...\n📊 处理模式: ${parallelConfig.enabled ? `并行 (${parallelConfig.concurrency}并发)` : '串行'}\n🔧 API模式: ${settings.useTavernApi ? '酒馆API' : '自定义API (' + settings.customApiProvider + ')'}\n📌 强制章节标记: ${settings.forceChapterMarker ? '开启' : '关闭'}\n🏷️ 启用分类: ${enabledCatNames}\n${'='.repeat(50)}\n`);

        const effectiveStartIndex = userSelectedStartIndex !== null ? userSelectedStartIndex : startFromIndex;

        if (effectiveStartIndex === 0) {
            const hasProcessedMemories = memoryQueue.some(m => m.processed && !m.failed && m.result);
            if (!hasProcessedMemories) {
                worldbookVolumes = [];
                currentVolumeIndex = 0;
                generatedWorldbook = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
                applyDefaultWorldbookEntries();
            }
        }

        userSelectedStartIndex = null;
        if (useVolumeMode) updateVolumeIndicator();
        updateStartButtonState(true);

        try {
            if (parallelConfig.enabled) {
                if (parallelConfig.mode === 'independent') {
                    const { tokenLimitIndices } = await processMemoryChunksParallel(effectiveStartIndex, memoryQueue.length);
                    if (isProcessingStopped) {
                        const processedCount = memoryQueue.filter(m => m.processed).length;
                        updateProgress((processedCount / memoryQueue.length) * 100, `⏸️ 已暂停`);
                        await MemoryHistoryDB.saveState(processedCount);
                        updateStartButtonState(false);
                        return;
                    }
                    if (tokenLimitIndices.length > 0) {
                        for (const idx of tokenLimitIndices.sort((a, b) => b - a)) {
                            splitMemoryIntoTwo(idx);
                        }
                        updateMemoryQueueUI();
                        for (let i = 0; i < memoryQueue.length; i++) {
                            if (isProcessingStopped) break;
                            if (!memoryQueue[i].processed || memoryQueue[i].failed) {
                                await processMemoryChunk(i);
                            }
                        }
                    }
                } else {
                    const batchSize = parallelConfig.concurrency;
                    let i = effectiveStartIndex;
                    while (i < memoryQueue.length && !isProcessingStopped) {
                        const batchEnd = Math.min(i + batchSize, memoryQueue.length);
                        const { tokenLimitIndices } = await processMemoryChunksParallel(i, batchEnd);
                        if (isProcessingStopped) break;
                        for (const idx of tokenLimitIndices.sort((a, b) => b - a)) splitMemoryIntoTwo(idx);
                        for (let j = i; j < batchEnd && j < memoryQueue.length && !isProcessingStopped; j++) {
                            if (!memoryQueue[j].processed || memoryQueue[j].failed) await processMemoryChunk(j);
                        }
                        i = batchEnd;
                        await MemoryHistoryDB.saveState(i);
                    }
                }
            } else {
                let i = effectiveStartIndex;
                while (i < memoryQueue.length) {
                    if (isProcessingStopped) {
                        updateProgress((i / memoryQueue.length) * 100, `⏸️ 已暂停`);
                        await MemoryHistoryDB.saveState(i);
                        updateStartButtonState(false);
                        return;
                    }
                    if (memoryQueue[i].processed && !memoryQueue[i].failed) { i++; continue; }
                    const currentLen = memoryQueue.length;
                    await processMemoryChunk(i);
                    if (memoryQueue.length > currentLen) i += (memoryQueue.length - currentLen);
                    i++;
                    await MemoryHistoryDB.saveState(i);
                }
            }

            if (isProcessingStopped) {
                const processedCount = memoryQueue.filter(m => m.processed).length;
                updateProgress((processedCount / memoryQueue.length) * 100, `⏸️ 已暂停`);
                await MemoryHistoryDB.saveState(processedCount);
                updateStartButtonState(false);
                return;
            }

            if (useVolumeMode && Object.keys(generatedWorldbook).length > 0) {
                worldbookVolumes.push({ volumeIndex: currentVolumeIndex, worldbook: JSON.parse(JSON.stringify(generatedWorldbook)), timestamp: Date.now() });
            }

            const failedCount = memoryQueue.filter(m => m.failed).length;
            if (failedCount > 0) {
                updateProgress(100, `⚠️ 完成，但有 ${failedCount} 个失败`);
            } else {
                updateProgress(100, `✅ 全部完成！`);
            }

            showResultSection(true);
            updateWorldbookPreview();
            updateStreamContent(`\n${'='.repeat(50)}\n✅ 处理完成！\n`);

            await MemoryHistoryDB.saveState(memoryQueue.length);
            await MemoryHistoryDB.clearState();
            updateStartButtonState(false);

        } catch (error) {
            updateProgress(0, `❌ 出错: ${error.message}`);
            updateStreamContent(`\n❌ 错误: ${error.message}\n`);
            updateStartButtonState(false);
        }
    }

    function updateStartButtonState(isProcessing) {
        const startBtn = document.getElementById('ttw-start-btn');
        if (!startBtn) return;

        if (!isProcessing && activeParallelTasks.size > 0) {
            return;
        }

        if (isProcessing) {
            startBtn.disabled = true;
            startBtn.textContent = '转换中...';
        } else {
            startBtn.disabled = false;
            if (userSelectedStartIndex !== null) {
                startBtn.textContent = `▶️ 从第${userSelectedStartIndex + 1}章开始`;
                startFromIndex = userSelectedStartIndex;
                return;
            }
            const firstUnprocessed = memoryQueue.findIndex(m => !m.processed || m.failed);
            if (firstUnprocessed !== -1 && firstUnprocessed < memoryQueue.length) {
                startBtn.textContent = `▶️ 继续转换 (从第${firstUnprocessed + 1}章)`;
                startFromIndex = firstUnprocessed;
            } else if (memoryQueue.length > 0 && memoryQueue.every(m => m.processed && !m.failed)) {
                startBtn.textContent = '🚀 重新转换';
                startFromIndex = 0;
            } else {
                startBtn.textContent = '🚀 开始转换';
                startFromIndex = 0;
            }
        }
    }

    // ========== 修复失败记忆 ==========
    async function repairSingleMemory(index) {
        const memory = memoryQueue[index];
        const chapterIndex = index + 1;

        const chapterForcePrompt = settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + `你是世界书生成专家。请提取关键信息。

输出JSON格式：
${generateDynamicJsonTemplate()}
`;

        // 【RAG 增强】注入相关历史条目上下文
        const contextStr = Services.Context.buildContext(memory.content, generatedWorldbook);
        if (contextStr) {
            prompt += `\n${contextStr}\n`;
        }

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (Object.keys(generatedWorldbook).length > 0) {
            // 如果世界书太大，可以考虑不全部注入，而是只注入 ContextManager 检索到的部分
            // 但为了兼容性，目前保留全量注入（如果未超长）或者信任 ContextManager
            // 策略：如果 ContextManager 返回了内容，则不再注入全量世界书，以节省 Token？
            // 稳妥起见，保留全量注入逻辑，但 ContextManager 提供的内容作为“强相关”补充
            prompt += `当前世界书：\n${JSON.stringify(generatedWorldbook, null, 2)}\n\n`;
        }
        prompt += `阅读内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n\n请输出JSON。`;

        if (settings.forceChapterMarker) {
            prompt += chapterForcePrompt;
        }

        const response = await callAPI(prompt);
        let memoryUpdate = parseAIResponse(response);
        memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
        await mergeWorldbookDataWithHistory(generatedWorldbook, memoryUpdate, index, `修复-${memory.title}`);
        await MemoryHistoryDB.saveRollResult(index, memoryUpdate);
        memory.result = memoryUpdate;
    }

    async function repairMemoryWithSplit(memoryIndex, stats) {
        const memory = memoryQueue[memoryIndex];
        if (!memory) return;
        updateProgress((memoryIndex / memoryQueue.length) * 100, `正在修复: ${memory.title}`);

        try {
            await repairSingleMemory(memoryIndex);
            memory.failed = false;
            memory.failedError = null;
            memory.processed = true;
            stats.successCount++;
            updateMemoryQueueUI();
            await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            if (isTokenLimitError(error.message || '')) {
                if (useVolumeMode) {
                    startNewVolume();
                    await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
                    await new Promise(r => setTimeout(r, 500));
                    await repairMemoryWithSplit(memoryIndex, stats);
                    return;
                }
                const splitResult = splitMemoryIntoTwo(memoryIndex);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
                    await new Promise(r => setTimeout(r, 500));
                    const part1Index = memoryQueue.indexOf(splitResult.part1);
                    await repairMemoryWithSplit(part1Index, stats);
                    const part2Index = memoryQueue.indexOf(splitResult.part2);
                    await repairMemoryWithSplit(part2Index, stats);
                } else {
                    stats.stillFailedCount++;
                    memory.failedError = error.message;
                }
            } else {
                stats.stillFailedCount++;
                memory.failedError = error.message;
                updateMemoryQueueUI();
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async function startRepairFailedMemories() {
        const failedMemories = memoryQueue.filter(m => m.failed);
        if (failedMemories.length === 0) { alert('没有需要修复的记忆'); return; }

        isRepairingMemories = true;
        isProcessingStopped = false;
        showProgressSection(true);
        updateStopButtonVisibility(true);
        updateProgress(0, `修复中 (0/${failedMemories.length})`);

        const stats = { successCount: 0, stillFailedCount: 0 };

        for (let i = 0; i < failedMemories.length; i++) {
            if (isProcessingStopped) break;
            const memory = failedMemories[i];
            const memoryIndex = memoryQueue.indexOf(memory);
            if (memoryIndex === -1) continue;
            updateProgress(((i + 1) / failedMemories.length) * 100, `修复: ${memory.title}`);
            await repairMemoryWithSplit(memoryIndex, stats);
        }

        failedMemoryQueue = failedMemoryQueue.filter(item => memoryQueue[item.index]?.failed);
        updateProgress(100, `修复完成: 成功 ${stats.successCount}, 仍失败 ${stats.stillFailedCount}`);
        await MemoryHistoryDB.saveState(memoryQueue.length);
        isRepairingMemories = false;

        alert(`修复完成！成功: ${stats.successCount}, 仍失败: ${stats.stillFailedCount}`);
        updateMemoryQueueUI();
    }

    // ========== 重Roll功能 ==========
    async function rerollMemory(index, customPrompt = '') {
        const memory = memoryQueue[index];
        if (!memory) return;

        isRerolling = true;
        isProcessingStopped = false;

        updateStopButtonVisibility(true);

        updateStreamContent(`\n🎲 开始重Roll: ${memory.title} (第${index + 1}章)\n`);

        try {
            memory.processing = true;
            updateMemoryQueueUI();

            const result = await processMemoryChunkIndependent(index, 0, customPrompt);

            memory.processing = false;

            if (result) {
                await MemoryHistoryDB.saveRollResult(index, result);
                memory.result = result;
                memory.processed = true;
                memory.failed = false;
                await mergeWorldbookDataWithHistory(generatedWorldbook, result, index, `${memory.title}-重Roll`);
                updateStreamContent(`✅ 重Roll完成: ${memory.title}\n`);
                updateMemoryQueueUI();
                updateWorldbookPreview();
                return result;
            }
        } catch (error) {
            memory.processing = false;
            if (error.message !== 'ABORTED') {
                updateStreamContent(`❌ 重Roll失败: ${error.message}\n`);
            }
            updateMemoryQueueUI();
            throw error;
        } finally {
            isRerolling = false;
        }
    }

    async function showRollHistorySelector(index) {
        const memory = memoryQueue[index];
        if (!memory) return;

        const rollResults = await MemoryHistoryDB.getRollResults(index);

        const existingModal = document.getElementById('ttw-roll-history-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'ttw-roll-history-modal';
        modal.className = 'ttw-modal-container';

        let listHtml = '';
        if (rollResults.length === 0) {
            listHtml = '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无历史</div>';
        } else {
            rollResults.forEach((roll, idx) => {
                const time = new Date(roll.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                const entryCount = roll.result ? Object.keys(roll.result).reduce((sum, cat) => sum + (typeof roll.result[cat] === 'object' ? Object.keys(roll.result[cat]).length : 0), 0) : 0;
                const isCurrentSelected = memory.result && JSON.stringify(memory.result) === JSON.stringify(roll.result);
                listHtml += `
                    <div class="ttw-roll-item ${isCurrentSelected ? 'selected' : ''}" data-roll-id="${roll.id}" data-roll-index="${idx}">
                        <div class="ttw-roll-item-header">
                            <span class="ttw-roll-item-title">#${idx + 1}${isCurrentSelected ? ' ✓' : ''}</span>
                            <span class="ttw-roll-item-time">${time}</span>
                        </div>
                        <div class="ttw-roll-item-info">${entryCount}条</div>
                    </div>
                `;
            });
        }

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:900px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🎲 ${memory.title} (第${index + 1}章) - Roll历史</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div class="ttw-roll-history-container">
                        <div class="ttw-roll-history-left">
                            <button id="ttw-do-reroll" class="ttw-btn ttw-btn-primary ttw-roll-reroll-btn">🎲 重Roll</button>
                            <div class="ttw-roll-list">${listHtml}</div>
                        </div>
                        <div id="ttw-roll-detail" class="ttw-roll-history-right">
                            <div style="text-align:center;color:#888;padding:20px;font-size:12px;">👈 点击左侧查看</div>
                        </div>
                    </div>
                    <div class="ttw-reroll-prompt-section" style="margin-top:12px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
                        <div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;font-size:13px;">📝 重Roll自定义提示词</div>
                        <textarea id="ttw-reroll-custom-prompt" rows="3" placeholder="可在此添加额外要求，如：重点提取XX角色的信息、更详细地描述XX事件..." style="width:100%;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;resize:vertical;">${settings.customRerollPrompt || ''}</textarea>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn ttw-btn-secondary" id="ttw-stop-reroll" style="display:none;">⏸️ 停止</button>
                    <button class="ttw-btn ttw-btn-warning" id="ttw-clear-rolls">🗑️ 清空</button>
                    <button class="ttw-btn" id="ttw-close-roll-history">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-close-roll-history').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        const stopRerollBtn = modal.querySelector('#ttw-stop-reroll');

        modal.querySelector('#ttw-do-reroll').addEventListener('click', async () => {
            const btn = modal.querySelector('#ttw-do-reroll');
            const customPrompt = modal.querySelector('#ttw-reroll-custom-prompt').value;
            settings.customRerollPrompt = customPrompt;
            saveCurrentSettings();

            btn.disabled = true;
            btn.textContent = '🔄...';
            stopRerollBtn.style.display = 'inline-block';

            try {
                await rerollMemory(index, customPrompt);
                modal.remove();
                showRollHistorySelector(index);
            } catch (error) {
                btn.disabled = false;
                btn.textContent = '🎲 重Roll';
                stopRerollBtn.style.display = 'none';
                if (error.message !== 'ABORTED') {
                    alert('重Roll失败: ' + error.message);
                }
            }
        });

        stopRerollBtn.addEventListener('click', () => {
            stopProcessing();
            stopRerollBtn.style.display = 'none';
            const btn = modal.querySelector('#ttw-do-reroll');
            btn.disabled = false;
            btn.textContent = '🎲 重Roll';
        });

        modal.querySelector('#ttw-clear-rolls').addEventListener('click', async () => {
            if (confirm(`确定清空 "${memory.title}" 的所有Roll历史？`)) {
                await MemoryHistoryDB.clearRollResults(index);
                modal.remove();
                alert('已清空');
            }
        });

        modal.querySelectorAll('.ttw-roll-item').forEach(item => {
            item.addEventListener('click', () => {
                const rollIndex = parseInt(item.dataset.rollIndex);
                const roll = rollResults[rollIndex];
                const detailDiv = modal.querySelector('#ttw-roll-detail');

                modal.querySelectorAll('.ttw-roll-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const time = new Date(roll.timestamp).toLocaleString('zh-CN');
                detailDiv.innerHTML = `
                    <div class="ttw-roll-detail-header">
                        <h4>Roll #${rollIndex + 1}</h4>
                        <div class="ttw-roll-detail-time">${time}</div>
                        <button class="ttw-btn ttw-btn-primary ttw-btn-small" id="ttw-use-this-roll">✅ 使用此结果</button>
                    </div>
                    <pre class="ttw-roll-detail-content">${JSON.stringify(roll.result, null, 2)}</pre>
                `;

                detailDiv.querySelector('#ttw-use-this-roll').addEventListener('click', async () => {
                    memory.result = roll.result;
                    memory.processed = true;
                    memory.failed = false;

                    rebuildWorldbookFromMemories();

                    updateMemoryQueueUI();
                    updateWorldbookPreview();
                    modal.remove();
                    alert(`已使用 Roll #${rollIndex + 1}`);
                });

            });
        });
    }

    // ========== 导入JSON合并世界书 ==========
    async function importAndMergeWorldbook() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const content = await file.text();
                const importedData = JSON.parse(content);

                let worldbookToMerge = {};

                if (importedData.entries) {
                    worldbookToMerge = convertSTFormatToInternal(importedData);
                } else if (importedData.merged) {
                    worldbookToMerge = importedData.merged;
                } else {
                    worldbookToMerge = importedData;
                }

                pendingImportData = {
                    worldbook: worldbookToMerge,
                    fileName: file.name,
                    timestamp: Date.now()
                };

                showMergeOptionsModal(worldbookToMerge, file.name);

            } catch (error) {
                console.error('导入失败:', error);
                alert('导入失败: ' + error.message);
            }
        };

        input.click();
    }

    function convertSTFormatToInternal(stData) {
        const result = {};
        if (!stData.entries) return result;

        const entriesArray = Array.isArray(stData.entries)
            ? stData.entries
            : Object.values(stData.entries);

        const usedNames = {};

        for (const entry of entriesArray) {
            if (!entry || typeof entry !== 'object') continue;

            const group = entry.group || '未分类';

            let name;
            if (entry.comment) {
                const parts = entry.comment.split(' - ');
                if (parts.length > 1) {
                    name = parts.slice(1).join(' - ').trim();
                } else {
                    name = entry.comment.trim();
                }
            } else {
                name = `条目_${entry.uid || Math.random().toString(36).substr(2, 9)}`;
            }

            if (!result[group]) {
                result[group] = {};
                usedNames[group] = new Set();
            }

            let finalName = name;
            let counter = 1;
            while (usedNames[group].has(finalName)) {
                finalName = `${name}_${counter}`;
                counter++;
            }
            usedNames[group].add(finalName);

            result[group][finalName] = {
                '关键词': Array.isArray(entry.key) ? entry.key : (entry.key ? [entry.key] : []),
                '内容': entry.content || ''
            };
        }

        console.log(`ST格式转换完成: ${Object.values(result).reduce((sum, cat) => sum + Object.keys(cat).length, 0)} 个条目`);
        return result;
    }

    function findDuplicateEntries(existing, imported) {
        const duplicates = [];
        for (const category in imported) {
            if (!existing[category]) continue;
            for (const name in imported[category]) {
                if (existing[category][name]) {
                    const existingStr = JSON.stringify(existing[category][name]);
                    const importedStr = JSON.stringify(imported[category][name]);
                    if (existingStr !== importedStr) {
                        duplicates.push({
                            category,
                            name,
                            existing: existing[category][name],
                            imported: imported[category][name]
                        });
                    }
                }
            }
        }
        return duplicates;
    }

    function findNewEntries(existing, imported) {
        const newEntries = [];
        for (const category in imported) {
            for (const name in imported[category]) {
                if (!existing[category] || !existing[category][name]) {
                    newEntries.push({ category, name, entry: imported[category][name] });
                }
            }
        }
        return newEntries;
    }

    function groupEntriesByCategory(entries) {
        const grouped = {};
        for (const item of entries) {
            if (!grouped[item.category]) {
                grouped[item.category] = [];
            }
            grouped[item.category].push(item);
        }
        return grouped;
    }

    function showMergeOptionsModal(importedWorldbook, fileName) {
        if (!importedWorldbook && pendingImportData) {
            importedWorldbook = pendingImportData.worldbook;
            fileName = pendingImportData.fileName;
        }

        if (!importedWorldbook) {
            alert('没有可导入的数据');
            return;
        }

        const existingModal = document.getElementById('ttw-merge-modal');
        if (existingModal) existingModal.remove();

        const duplicates = findDuplicateEntries(generatedWorldbook, importedWorldbook);
        const newEntries = findNewEntries(generatedWorldbook, importedWorldbook);

        const groupedNew = groupEntriesByCategory(newEntries);
        const groupedDup = groupEntriesByCategory(duplicates);

        const modal = document.createElement('div');
        modal.id = 'ttw-merge-modal';
        modal.className = 'ttw-modal-container';

        let newEntriesListHtml = '';
        if (newEntries.length > 0) {
            newEntriesListHtml = `
                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-weight:bold;color:#27ae60;">📥 新条目 (${newEntries.length})</span>
                        <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-new" checked> 全选</label>
                    </div>
                    <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
            `;

            for (const category in groupedNew) {
                const items = groupedNew[category];
                newEntriesListHtml += `
                    <div class="ttw-merge-category-group" style="margin-bottom:10px;">
                        <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(39,174,96,0.2);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">
                            <input type="checkbox" class="ttw-new-category-cb" data-category="${category}" checked>
                            <span style="color:#27ae60;">${category}</span>
                            <span style="color:#888;font-weight:normal;">(${items.length})</span>
                        </label>
                        <div style="margin-left:16px;margin-top:4px;">
                `;
                items.forEach((item, localIdx) => {
                    const globalIdx = newEntries.indexOf(item);
                    newEntriesListHtml += `
                        <label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
                            <input type="checkbox" class="ttw-new-entry-cb" data-index="${globalIdx}" data-category="${category}" checked>
                            <span>${item.name}</span>
                        </label>
                    `;
                });
                newEntriesListHtml += `</div></div>`;
            }
            newEntriesListHtml += `</div></div>`;
        }

        let dupEntriesListHtml = '';
        if (duplicates.length > 0) {
            dupEntriesListHtml = `
                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-weight:bold;color:#e67e22;">🔀 重复条目 (${duplicates.length})</span>
                        <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-dup" checked> 全选</label>
                    </div>
                    <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
            `;

            for (const category in groupedDup) {
                const items = groupedDup[category];
                dupEntriesListHtml += `
                    <div class="ttw-merge-category-group" style="margin-bottom:10px;">
                        <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(230,126,34,0.2);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">
                            <input type="checkbox" class="ttw-dup-category-cb" data-category="${category}" checked>
                            <span style="color:#e67e22;">${category}</span>
                            <span style="color:#888;font-weight:normal;">(${items.length})</span>
                        </label>
                        <div style="margin-left:16px;margin-top:4px;">
                `;
                items.forEach((item, localIdx) => {
                    const globalIdx = duplicates.indexOf(item);
                    dupEntriesListHtml += `
                        <label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
                            <input type="checkbox" class="ttw-dup-entry-cb" data-index="${globalIdx}" data-category="${category}" checked>
                            <span>${item.name}</span>
                        </label>
                    `;
                });
                dupEntriesListHtml += `</div></div>`;
            }
            dupEntriesListHtml += `</div></div>`;
        }

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:800px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📥 导入世界书: ${fileName}</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body" style="max-height:70vh;overflow-y:auto;">
                    <div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
                        <div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 导入分析</div>
                        <div style="font-size:13px;color:#ccc;">
                            • 新条目: <span style="color:#27ae60;font-weight:bold;">${newEntries.length}</span> 个<br>
                            • 重复条目: <span style="color:#e67e22;font-weight:bold;">${duplicates.length}</span> 个
                        </div>
                    </div>

                    ${newEntriesListHtml}
                    ${dupEntriesListHtml}

                    ${duplicates.length > 0 ? `
                    <div style="margin-bottom:16px;">
                        <div style="font-weight:bold;color:#e67e22;margin-bottom:10px;">🔀 重复条目合并方式</div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <label class="ttw-merge-option">
                                <input type="radio" name="merge-mode" value="ai" checked>
                                <div>
                                    <div style="font-weight:bold;">🤖 AI智能合并 (支持并发)</div>
                                    <div style="font-size:11px;color:#888;">使用AI合并相同名称的条目，保留所有信息</div>
                                </div>
                            </label>
                            <label class="ttw-merge-option">
                                <input type="radio" name="merge-mode" value="replace">
                                <div>
                                    <div style="font-weight:bold;">📝 覆盖原有</div>
                                    <div style="font-size:11px;color:#888;">用导入的内容直接覆盖原有条目</div>
                                </div>
                            </label>
                            <label class="ttw-merge-option">
                                <input type="radio" name="merge-mode" value="keep">
                                <div>
                                    <div style="font-weight:bold;">🔒 保留原有</div>
                                    <div style="font-size:11px;color:#888;">保留原有条目，跳过重复的</div>
                                </div>
                            </label>
                            <label class="ttw-merge-option">
                                <input type="radio" name="merge-mode" value="rename">
                                <div>
                                    <div style="font-weight:bold;">📋 重命名添加</div>
                                    <div style="font-size:11px;color:#888;">将重复条目添加为新名称（如 角色名_导入）</div>
                                </div>
                            </label>
                            <label class="ttw-merge-option">
                                <input type="radio" name="merge-mode" value="append">
                                <div>
                                    <div style="font-weight:bold;">➕ 内容叠加</div>
                                    <div style="font-size:11px;color:#888;">将新内容追加到原有条目后面</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div id="ttw-ai-merge-options" style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
                        <div style="font-weight:bold;color:#9b59b6;margin-bottom:10px;">🤖 AI合并设置</div>
                        <div style="margin-bottom:10px;">
                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                                <span>并发数:</span>
                                <input type="number" id="ttw-merge-concurrency" value="${parallelConfig.concurrency}" min="1" max="10" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;">
                            </label>
                        </div>
                        <textarea id="ttw-merge-prompt" rows="4" style="width:100%;padding:10px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;resize:vertical;" placeholder="留空使用默认提示词...">${settings.customMergePrompt || ''}</textarea>
                        <div style="margin-top:8px;">
                            <button class="ttw-btn ttw-btn-small" id="ttw-preview-merge-prompt">👁️ 预览默认提示词</button>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-merge">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-confirm-merge">✅ 开始合并</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const selectAllNewCb = modal.querySelector('#ttw-select-all-new');
        if (selectAllNewCb) {
            selectAllNewCb.addEventListener('change', (e) => {
                modal.querySelectorAll('.ttw-new-entry-cb').forEach(cb => cb.checked = e.target.checked);
                modal.querySelectorAll('.ttw-new-category-cb').forEach(cb => cb.checked = e.target.checked);
            });
        }

        const selectAllDupCb = modal.querySelector('#ttw-select-all-dup');
        if (selectAllDupCb) {
            selectAllDupCb.addEventListener('change', (e) => {
                modal.querySelectorAll('.ttw-dup-entry-cb').forEach(cb => cb.checked = e.target.checked);
                modal.querySelectorAll('.ttw-dup-category-cb').forEach(cb => cb.checked = e.target.checked);
            });
        }

        modal.querySelectorAll('.ttw-new-category-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const category = e.target.dataset.category;
                modal.querySelectorAll(`.ttw-new-entry-cb[data-category="${category}"]`).forEach(entryCb => {
                    entryCb.checked = e.target.checked;
                });
            });
        });

        modal.querySelectorAll('.ttw-dup-category-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const category = e.target.dataset.category;
                modal.querySelectorAll(`.ttw-dup-entry-cb[data-category="${category}"]`).forEach(entryCb => {
                    entryCb.checked = e.target.checked;
                });
            });
        });

        modal.querySelectorAll('.ttw-new-entry-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const category = cb.dataset.category;
                const allInCategory = modal.querySelectorAll(`.ttw-new-entry-cb[data-category="${category}"]`);
                const checkedInCategory = modal.querySelectorAll(`.ttw-new-entry-cb[data-category="${category}"]:checked`);
                const categoryCb = modal.querySelector(`.ttw-new-category-cb[data-category="${category}"]`);
                if (categoryCb) {
                    categoryCb.checked = checkedInCategory.length === allInCategory.length;
                    categoryCb.indeterminate = checkedInCategory.length > 0 && checkedInCategory.length < allInCategory.length;
                }
            });
        });

        modal.querySelectorAll('.ttw-dup-entry-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const category = cb.dataset.category;
                const allInCategory = modal.querySelectorAll(`.ttw-dup-entry-cb[data-category="${category}"]`);
                const checkedInCategory = modal.querySelectorAll(`.ttw-dup-entry-cb[data-category="${category}"]:checked`);
                const categoryCb = modal.querySelector(`.ttw-dup-category-cb[data-category="${category}"]`);
                if (categoryCb) {
                    categoryCb.checked = checkedInCategory.length === allInCategory.length;
                    categoryCb.indeterminate = checkedInCategory.length > 0 && checkedInCategory.length < allInCategory.length;
                }
            });
        });

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-cancel-merge').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        const aiOptions = modal.querySelector('#ttw-ai-merge-options');
        if (aiOptions) {
            modal.querySelectorAll('input[name="merge-mode"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    aiOptions.style.display = radio.value === 'ai' ? 'block' : 'none';
                });
            });
        }

        if (modal.querySelector('#ttw-preview-merge-prompt')) {
            modal.querySelector('#ttw-preview-merge-prompt').addEventListener('click', () => {
                alert('默认合并提示词:\n\n' + defaultMergePrompt);
            });
        }

        modal.querySelector('#ttw-confirm-merge').addEventListener('click', async () => {
            const mergeMode = modal.querySelector('input[name="merge-mode"]:checked')?.value || 'ai';
            const customPrompt = modal.querySelector('#ttw-merge-prompt')?.value || '';
            const mergeConcurrency = parseInt(modal.querySelector('#ttw-merge-concurrency')?.value) || parallelConfig.concurrency;
            settings.customMergePrompt = customPrompt;
            saveCurrentSettings();

            const selectedNewIndices = [...modal.querySelectorAll('.ttw-new-entry-cb:checked')].map(cb => parseInt(cb.dataset.index));
            const selectedDupIndices = [...modal.querySelectorAll('.ttw-dup-entry-cb:checked')].map(cb => parseInt(cb.dataset.index));

            const selectedNew = selectedNewIndices.map(i => newEntries[i]);
            const selectedDup = selectedDupIndices.map(i => duplicates[i]);

            modal.remove();
            await performMerge(importedWorldbook, selectedDup, selectedNew, mergeMode, customPrompt, mergeConcurrency);
        });
    }

    async function performMerge(importedWorldbook, duplicates, newEntries, mergeMode, customPrompt, concurrency = 3) {
        showProgressSection(true);
        isProcessingStopped = false;
        updateProgress(0, '开始合并...');
        updateStreamContent('', true);
        updateStreamContent(`🔀 开始合并世界书\n合并模式: ${mergeMode}\n并发数: ${concurrency}\n${'='.repeat(50)}\n`);

        for (const item of newEntries) {
            if (!generatedWorldbook[item.category]) generatedWorldbook[item.category] = {};
            generatedWorldbook[item.category][item.name] = item.entry;
        }
        updateStreamContent(`✅ 添加了 ${newEntries.length} 个新条目\n`);

        if (duplicates.length > 0) {
            updateStreamContent(`\n🔀 处理 ${duplicates.length} 个重复条目...\n`);

            if (mergeMode === 'ai') {
                const semaphore = new Semaphore(concurrency);
                let completed = 0;
                let failed = 0;

                const processOne = async (dup, index) => {
                    if (isProcessingStopped) return;

                    await semaphore.acquire();
                    if (isProcessingStopped) {
                        semaphore.release();
                        return;
                    }

                    try {
                        updateStreamContent(`📝 [${index + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);
                        const mergedEntry = await mergeEntriesWithAI(dup.existing, dup.imported, customPrompt);
                        generatedWorldbook[dup.category][dup.name] = mergedEntry;
                        completed++;
                        updateProgress((completed / duplicates.length) * 100, `AI合并中 (${completed}/${duplicates.length})`);
                        updateStreamContent(`   ✅ 完成\n`);
                    } catch (error) {
                        failed++;
                        updateStreamContent(`   ❌ 失败: ${error.message}\n`);
                    } finally {
                        semaphore.release();
                    }
                };

                await Promise.allSettled(duplicates.map((dup, i) => processOne(dup, i)));
                updateStreamContent(`\n📦 AI合并完成: 成功 ${completed}, 失败 ${failed}\n`);

            } else {
                for (let i = 0; i < duplicates.length; i++) {
                    if (isProcessingStopped) break;

                    const dup = duplicates[i];
                    updateProgress(((i + 1) / duplicates.length) * 100, `处理: [${dup.category}] ${dup.name}`);
                    updateStreamContent(`\n📝 [${i + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);

                    if (mergeMode === 'replace') {
                        generatedWorldbook[dup.category][dup.name] = dup.imported;
                        updateStreamContent(`   ✅ 已覆盖\n`);
                    } else if (mergeMode === 'keep') {
                        updateStreamContent(`   ⏭️ 保留原有\n`);
                    } else if (mergeMode === 'rename') {
                        const newName = `${dup.name}_导入`;
                        generatedWorldbook[dup.category][newName] = dup.imported;
                        updateStreamContent(`   ✅ 添加为: ${newName}\n`);
                    } else if (mergeMode === 'append') {
                        const existing = generatedWorldbook[dup.category][dup.name];
                        const keywords = [...new Set([...(existing['关键词'] || []), ...(dup.imported['关键词'] || [])])];
                        const content = (existing['内容'] || '') + '\n\n---\n\n' + (dup.imported['内容'] || '');
                        generatedWorldbook[dup.category][dup.name] = { '关键词': keywords, '内容': content };
                        updateStreamContent(`   ✅ 内容已叠加\n`);
                    }
                }
            }
        }

        pendingImportData = null;

        updateProgress(100, '合并完成！');
        updateStreamContent(`\n${'='.repeat(50)}\n✅ 合并完成！\n`);

        showResultSection(true);
        updateWorldbookPreview();
        Services.UI.showToast('世界书合并完成！', 'success');
    }

    async function mergeEntriesWithAI(entryA, entryB, customPrompt) {
        const promptTemplate = customPrompt?.trim() || defaultMergePrompt;
        const prompt = promptTemplate
            .replace('{ENTRY_A}', JSON.stringify(entryA, null, 2))
            .replace('{ENTRY_B}', JSON.stringify(entryB, null, 2));

        const response = await callAPI(getLanguagePrefix() + prompt);

        try {
            const result = parseAIResponse(response);
            if (result['关键词'] || result['内容']) {
                return {
                    '关键词': result['关键词'] || [...(entryA['关键词'] || []), ...(entryB['关键词'] || [])],
                    '内容': result['内容'] || entryA['内容'] || entryB['内容']
                };
            }
            return result;
        } catch (e) {
            return {
                '关键词': [...new Set([...(entryA['关键词'] || []), ...(entryB['关键词'] || [])])],
                '内容': `${entryA['内容'] || ''}\n\n---\n\n${entryB['内容'] || ''}`
            };
        }
    }

    // ========== 条目内容整理功能 - 修改为支持多选分类 ==========
    async function consolidateEntry(category, entryName) {
        const entry = generatedWorldbook[category]?.[entryName];
        if (!entry || !entry['内容']) return;

        const prompt = defaultConsolidatePrompt.replace('{CONTENT}', entry['内容']);
        const response = await callAPI(getLanguagePrefix() + prompt);

        entry['内容'] = response.trim();
        if (Array.isArray(entry['关键词'])) {
            entry['关键词'] = [...new Set(entry['关键词'])];
        }
    }

    // 新增：显示分类选择弹窗
    function showConsolidateCategorySelector() {
        const categories = Object.keys(generatedWorldbook).filter(cat => {
            const entries = generatedWorldbook[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
        });

        if (categories.length === 0) {
            alert('没有可整理的分类');
            return;
        }

        const existingModal = document.getElementById('ttw-consolidate-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'ttw-consolidate-modal';
        modal.className = 'ttw-modal-container';

        let categoriesHtml = '';
        categories.forEach(cat => {
            const entryCount = Object.keys(generatedWorldbook[cat]).length;
            categoriesHtml += `
                <label class="ttw-consolidate-category-item">
                    <input type="checkbox" class="ttw-consolidate-cat-cb" data-category="${cat}" checked>
                    <span>${cat}</span>
                    <span style="color:#888;font-size:11px;">(${entryCount}条)</span>
                </label>
            `;
        });

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:500px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🧹 整理条目 - 选择分类</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
                        <div style="font-size:12px;color:#ccc;">选择要整理的分类，AI将去除重复信息并优化格式。</div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <span style="font-weight:bold;">选择分类</span>
                        <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-consolidate" checked> 全选</label>
                    </div>
                    <div style="max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">
                        ${categoriesHtml}
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-consolidate">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-start-consolidate">🧹 开始整理</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#ttw-select-all-consolidate').addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach(cb => cb.checked = e.target.checked);
        });

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-cancel-consolidate').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('#ttw-start-consolidate').addEventListener('click', async () => {
            const selectedCategories = [...modal.querySelectorAll('.ttw-consolidate-cat-cb:checked')].map(cb => cb.dataset.category);
            if (selectedCategories.length === 0) {
                alert('请至少选择一个分类');
                return;
            }

            modal.remove();
            await consolidateSelectedCategories(selectedCategories);
        });
    }

    async function consolidateSelectedCategories(categories) {
        let totalEntries = 0;
        for (const cat of categories) {
            totalEntries += Object.keys(generatedWorldbook[cat] || {}).length;
        }

        if (!confirm(`确定要整理 ${categories.length} 个分类，共 ${totalEntries} 个条目吗？\n这将使用AI去除重复信息。`)) return;

        showProgressSection(true);
        isProcessingStopped = false;
        updateProgress(0, '开始整理条目...');
        updateStreamContent('', true);
        updateStreamContent(`🧹 开始整理条目\n分类: ${categories.join(', ')}\n${'='.repeat(50)}\n`);

        const semaphore = new Semaphore(parallelConfig.concurrency);
        let completed = 0;
        let failed = 0;

        const allEntries = [];
        for (const cat of categories) {
            for (const name of Object.keys(generatedWorldbook[cat] || {})) {
                allEntries.push({ category: cat, name });
            }
        }

        const processOne = async (entry, index) => {
            if (isProcessingStopped) return;

            await semaphore.acquire();
            if (isProcessingStopped) {
                semaphore.release();
                return;
            }

            try {
                updateStreamContent(`📝 [${index + 1}/${allEntries.length}] ${entry.category} - ${entry.name}\n`);
                await consolidateEntry(entry.category, entry.name);
                completed++;
                updateProgress((completed / allEntries.length) * 100, `整理中 (${completed}/${allEntries.length})`);
                updateStreamContent(`   ✅ 完成\n`);
            } catch (error) {
                failed++;
                updateStreamContent(`   ❌ 失败: ${error.message}\n`);
            } finally {
                semaphore.release();
            }
        };

        await Promise.allSettled(allEntries.map((entry, i) => processOne(entry, i)));

        updateProgress(100, `整理完成: 成功 ${completed}, 失败 ${failed}`);
        updateStreamContent(`\n${'='.repeat(50)}\n✅ 整理完成！成功 ${completed}, 失败 ${failed}\n`);

        updateWorldbookPreview();
        alert(`条目整理完成！成功: ${completed}, 失败: ${failed}`);
    }

    // ========== 别名识别与合并 ==========
    function findPotentialDuplicateCharacters() {
        const characters = generatedWorldbook['角色'];
        if (!characters) return [];

        const names = Object.keys(characters);
        const suspectedGroups = [];
        const processed = new Set();

        for (let i = 0; i < names.length; i++) {
            if (processed.has(names[i])) continue;

            const group = [names[i]];
            const keywordsA = new Set(characters[names[i]]['关键词'] || []);

            for (let j = i + 1; j < names.length; j++) {
                if (processed.has(names[j])) continue;

                const keywordsB = new Set(characters[names[j]]['关键词'] || []);

                const intersection = [...keywordsA].filter(k => keywordsB.has(k));

                const nameContains = names[i].includes(names[j]) || names[j].includes(names[i]);

                const shortNameMatch = checkShortNameMatch(names[i], names[j]);

                if (intersection.length > 0 || nameContains || shortNameMatch) {
                    group.push(names[j]);
                    processed.add(names[j]);
                }
            }

            if (group.length > 1) {
                suspectedGroups.push(group);
                group.forEach(n => processed.add(n));
            }
        }

        return suspectedGroups;
    }

    function checkShortNameMatch(nameA, nameB) {
        const extractName = (fullName) => {
            if (fullName.length <= 3) return fullName;
            return fullName.slice(-2);
        };

        const shortA = extractName(nameA);
        const shortB = extractName(nameB);

        return shortA === shortB || nameA.includes(shortB) || nameB.includes(shortA);
    }

    function generatePairs(group) {
        const pairs = [];
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                pairs.push([group[i], group[j]]);
            }
        }
        return pairs;
    }

    class UnionFind {
        constructor(items) {
            this.parent = {};
            this.rank = {};
            items.forEach(item => {
                this.parent[item] = item;
                this.rank[item] = 0;
            });
        }

        find(x) {
            if (this.parent[x] !== x) {
                this.parent[x] = this.find(this.parent[x]);
            }
            return this.parent[x];
        }

        union(x, y) {
            const rootX = this.find(x);
            const rootY = this.find(y);
            if (rootX === rootY) return;

            if (this.rank[rootX] < this.rank[rootY]) {
                this.parent[rootX] = rootY;
            } else if (this.rank[rootX] > this.rank[rootY]) {
                this.parent[rootY] = rootX;
            } else {
                this.parent[rootY] = rootX;
                this.rank[rootX]++;
            }
        }

        getGroups() {
            const groups = {};
            for (const item in this.parent) {
                const root = this.find(item);
                if (!groups[root]) groups[root] = [];
                groups[root].push(item);
            }
            return Object.values(groups).filter(g => g.length > 1);
        }
    }

    async function verifyDuplicatesWithAI(suspectedGroups) {
        if (suspectedGroups.length === 0) return { pairResults: [], mergedGroups: [] };

        const characters = generatedWorldbook['角色'];

        const allPairs = [];
        const allNames = new Set();

        for (const group of suspectedGroups) {
            const pairs = generatePairs(group);
            pairs.forEach(pair => {
                allPairs.push(pair);
                allNames.add(pair[0]);
                allNames.add(pair[1]);
            });
        }

        if (allPairs.length === 0) return { pairResults: [], mergedGroups: [] };

        const pairsWithContent = allPairs.map((pair, i) => {
            const [nameA, nameB] = pair;
            const entryA = characters[nameA];
            const entryB = characters[nameB];

            const keywordsA = entryA?.['关键词']?.join(', ') || '无';
            const keywordsB = entryB?.['关键词']?.join(', ') || '无';
            const contentA = (entryA?.['内容'] || '').substring(0, 300);
            const contentB = (entryB?.['内容'] || '').substring(0, 300);

            return `配对${i + 1}: 「${nameA}」vs「${nameB}」
  【${nameA}】关键词: ${keywordsA}
  内容摘要: ${contentA}${contentA.length >= 300 ? '...' : ''}
  【${nameB}】关键词: ${keywordsB}
  内容摘要: ${contentB}${contentB.length >= 300 ? '...' : ''}`;
        }).join('\n\n');

        const prompt = getLanguagePrefix() + `你是角色识别专家。请对以下每一对角色进行判断，判断它们是否为同一人物。

## 待判断的角色配对
${pairsWithContent}

## 判断依据
- 仔细阅读每个角色的关键词和内容摘要
- 根据描述的性别、身份、背景、外貌等信息判断
- 考虑：全名vs昵称、姓vs名、绰号等称呼变化
- 如果内容描述明显指向同一个人，则判定为同一人
- 【重要】即使名字相似，如果性别、身份、背景明显不同，也要判定为不同人

## 要求
- 对每一对分别判断
- 如果是同一人，选择更完整/更常用的名称作为mainName
- 如果不是同一人，说明原因
- 返回JSON格式

## 输出格式
{
    "results": [
        {"pair": 1, "nameA": "角色A名", "nameB": "角色B名", "isSamePerson": true, "mainName": "保留的名称", "reason": "判断依据"},
        {"pair": 2, "nameA": "角色A名", "nameB": "角色B名", "isSamePerson": false, "reason": "不是同一人的原因"}
    ]
}`;

        updateStreamContent('\n🤖 发送两两配对判断请求...\n');
        const response = await callAPI(prompt);
        const aiResult = parseAIResponse(response);

        const uf = new UnionFind([...allNames]);
        const pairResults = [];

        for (const result of aiResult.results || []) {
            const pairIndex = (result.pair || 1) - 1;
            if (pairIndex < 0 || pairIndex >= allPairs.length) continue;

            const [nameA, nameB] = allPairs[pairIndex];
            pairResults.push({
                nameA: result.nameA || nameA,
                nameB: result.nameB || nameB,
                isSamePerson: result.isSamePerson,
                mainName: result.mainName,
                reason: result.reason
            });

            if (result.isSamePerson) {
                uf.union(nameA, nameB);
            }
        }

        const mergedGroups = uf.getGroups();

        const finalGroups = mergedGroups.map(group => {
            let mainName = null;
            for (const result of pairResults) {
                if (result.isSamePerson && result.mainName) {
                    if (group.includes(result.nameA) || group.includes(result.nameB)) {
                        if (group.includes(result.mainName)) {
                            mainName = result.mainName;
                            break;
                        }
                    }
                }
            }

            if (!mainName) {
                let maxLen = 0;
                for (const name of group) {
                    const len = (characters[name]?.['内容'] || '').length;
                    if (len > maxLen) {
                        maxLen = len;
                        mainName = name;
                    }
                }
            }

            return { names: group, mainName: mainName || group[0] };
        });

        return {
            pairResults,
            mergedGroups: finalGroups,
            _allPairs: allPairs
        };
    }


    async function mergeConfirmedDuplicates(aiResult) {
        const characters = generatedWorldbook['角色'];
        let mergedCount = 0;

        const mergedGroups = aiResult.mergedGroups || [];

        for (const groupInfo of mergedGroups) {
            const { names, mainName } = groupInfo;
            if (!names || names.length < 2 || !mainName) continue;

            let mergedKeywords = [];
            let mergedContent = '';

            for (const name of names) {
                if (characters[name]) {
                    mergedKeywords.push(...(characters[name]['关键词'] || []));
                    mergedKeywords.push(name);
                    if (characters[name]['内容']) {
                        mergedContent += characters[name]['内容'] + '\n\n---\n\n';
                    }
                }
            }

            characters[mainName] = {
                '关键词': [...new Set(mergedKeywords)],
                '内容': mergedContent.replace(/\n\n---\n\n$/, '')
            };

            for (const name of names) {
                if (name !== mainName && characters[name]) {
                    delete characters[name];
                }
            }

            mergedCount++;
        }

        return mergedCount;
    }


    async function showAliasMergeUI() {
        updateStreamContent('\n🔍 第一阶段：扫描疑似同人...\n');
        const suspected = findPotentialDuplicateCharacters();

        if (suspected.length === 0) {
            alert('未发现疑似同人角色');
            return;
        }

        let totalPairs = 0;
        for (const group of suspected) {
            totalPairs += (group.length * (group.length - 1)) / 2;
        }

        updateStreamContent(`发现 ${suspected.length} 组疑似同人，共 ${totalPairs} 对需要判断\n`);

        const existingModal = document.getElementById('ttw-alias-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'ttw-alias-modal';
        modal.className = 'ttw-modal-container';

        const characters = generatedWorldbook['角色'];
        let groupsHtml = suspected.map((group, i) => {
            const pairCount = (group.length * (group.length - 1)) / 2;
            const groupInfo = group.map(name => {
                const entry = characters[name];
                const keywords = (entry?.['关键词'] || []).slice(0, 3).join(', ');
                return `${name}${keywords ? ` [${keywords}]` : ''}`;
            }).join(' / ');

            return `
                <label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:rgba(155,89,182,0.1);border-radius:6px;margin-bottom:6px;cursor:pointer;">
                    <input type="checkbox" class="ttw-alias-group-cb" data-index="${i}" checked style="margin-top:3px;">
                    <div>
                        <div style="color:#9b59b6;font-weight:bold;font-size:12px;">组${i + 1} <span style="color:#888;font-weight:normal;">(${group.length}人, ${pairCount}对)</span></div>
                        <div style="font-size:11px;color:#ccc;word-break:break-all;">${groupInfo}</div>
                    </div>
                </label>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:750px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🔗 别名识别与合并 (两两判断模式)</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
                        <div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 第一阶段：本地检测结果</div>
                        <div style="font-size:13px;color:#ccc;">
                            基于关键词交集和名称相似度，发现 <span style="color:#9b59b6;font-weight:bold;">${suspected.length}</span> 组疑似同人角色，
                            共 <span style="color:#e67e22;font-weight:bold;">${totalPairs}</span> 对需要AI判断
                        </div>
                    </div>

                    <div style="margin-bottom:16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <span style="font-weight:bold;">选择要发送给AI判断的组</span>
                            <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-alias" checked> 全选</label>
                        </div>
                        <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
                            ${groupsHtml}
                        </div>
                    </div>

                    <div style="margin-bottom:16px;padding:10px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:11px;color:#f39c12;">
                        💡 <strong>两两判断模式</strong>：AI会对每一对角色分别判断是否同一人，然后自动合并确认的结果。<br>
                        例如：[A,B,C] 会拆成 (A,B) (A,C) (B,C) 三对分别判断，如果A=B且B=C，则A、B、C会被合并。
                    </div>

                    <div id="ttw-alias-result" style="display:none;margin-bottom:16px;">
                        <div style="padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;margin-bottom:12px;">
                            <div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;">🔍 配对判断结果</div>
                            <div id="ttw-pair-results" style="max-height:150px;overflow-y:auto;"></div>
                        </div>
                        <div style="padding:12px;background:rgba(39,174,96,0.15);border-radius:8px;">
                            <div style="font-weight:bold;color:#27ae60;margin-bottom:8px;">📦 合并方案</div>
                            <div id="ttw-merge-plan"></div>
                        </div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn ttw-btn-secondary" id="ttw-stop-alias" style="display:none;">⏸️ 停止</button>
                    <button class="ttw-btn" id="ttw-cancel-alias">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-ai-verify-alias">🤖 AI两两判断</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-confirm-alias" style="display:none;">✅ 确认合并</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        let aiResult = null;

        modal.querySelector('#ttw-select-all-alias').addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-alias-group-cb').forEach(cb => cb.checked = e.target.checked);
        });

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-cancel-alias').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('#ttw-ai-verify-alias').addEventListener('click', async () => {
            const selectedIndices = [...modal.querySelectorAll('.ttw-alias-group-cb:checked')].map(cb => parseInt(cb.dataset.index));
            if (selectedIndices.length === 0) {
                alert('请选择要判断的组');
                return;
            }

            const selectedGroups = selectedIndices.map(i => suspected[i]);

            const btn = modal.querySelector('#ttw-ai-verify-alias');
            const stopBtn = modal.querySelector('#ttw-stop-alias');
            btn.disabled = true;
            btn.textContent = '🔄 AI判断中...';
            stopBtn.style.display = 'inline-block';

            try {
                updateStreamContent('\n🤖 第二阶段：两两配对判断...\n');
                aiResult = await verifyDuplicatesWithAI(selectedGroups);

                const resultDiv = modal.querySelector('#ttw-alias-result');
                const pairResultsDiv = modal.querySelector('#ttw-pair-results');
                const mergePlanDiv = modal.querySelector('#ttw-merge-plan');
                resultDiv.style.display = 'block';

                let pairHtml = '';
                for (const result of aiResult.pairResults || []) {
                    const icon = result.isSamePerson ? '✅' : '❌';
                    const color = result.isSamePerson ? '#27ae60' : '#e74c3c';
                    pairHtml += `
                        <div style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(0,0,0,0.2);border-radius:4px;margin:2px;font-size:11px;border-left:2px solid ${color};">
                            <span style="color:${color};">${icon}</span>
                            <span>「${result.nameA}」vs「${result.nameB}」</span>
                            ${result.isSamePerson ? `<span style="color:#888;">→${result.mainName}</span>` : ''}
                        </div>
                    `;
                }
                pairResultsDiv.innerHTML = pairHtml || '<div style="color:#888;">无配对结果</div>';

                let mergePlanHtml = '';
                if (aiResult.mergedGroups && aiResult.mergedGroups.length > 0) {
                    for (const group of aiResult.mergedGroups) {
                        mergePlanHtml += `
                            <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:6px;border-left:3px solid #27ae60;">
                                <div style="color:#27ae60;font-weight:bold;font-size:12px;">→ 合并为「${group.mainName}」</div>
                                <div style="font-size:11px;color:#ccc;margin-top:4px;">包含: ${group.names.join(', ')}</div>
                            </div>
                        `;
                    }
                } else {
                    mergePlanHtml = '<div style="color:#888;font-size:12px;">没有需要合并的角色（所有配对都是不同人）</div>';
                }
                mergePlanDiv.innerHTML = mergePlanHtml;

                if (aiResult.mergedGroups && aiResult.mergedGroups.length > 0) {
                    modal.querySelector('#ttw-confirm-alias').style.display = 'inline-block';
                }
                btn.style.display = 'none';
                stopBtn.style.display = 'none';

                updateStreamContent('✅ AI判断完成\n');

            } catch (error) {
                updateStreamContent(`❌ AI判断失败: ${error.message}\n`);
                alert('AI判断失败: ' + error.message);
                btn.disabled = false;
                btn.textContent = '🤖 AI两两判断';
                stopBtn.style.display = 'none';
            }
        });

        modal.querySelector('#ttw-stop-alias').addEventListener('click', () => {
            stopProcessing();
            modal.querySelector('#ttw-ai-verify-alias').disabled = false;
            modal.querySelector('#ttw-ai-verify-alias').textContent = '🤖 AI两两判断';
            modal.querySelector('#ttw-stop-alias').style.display = 'none';
        });

        modal.querySelector('#ttw-confirm-alias').addEventListener('click', async () => {
            if (!aiResult || !aiResult.mergedGroups || aiResult.mergedGroups.length === 0) {
                alert('没有需要合并的角色');
                modal.remove();
                return;
            }

            if (!confirm(`确定合并 ${aiResult.mergedGroups.length} 组同人角色？`)) return;

            const mergedCount = await mergeConfirmedDuplicates(aiResult);

            updateWorldbookPreview();
            modal.remove();
            alert(`合并完成！合并了 ${mergedCount} 组角色。\n\n建议使用"整理条目"功能清理合并后的重复内容。`);
        });
    }

    // ========== 新增：查找功能 ==========
    function showSearchModal() {
        const existingModal = document.getElementById('ttw-search-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'ttw-search-modal';
        modal.className = 'ttw-modal-container';

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:600px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🔍 查找内容</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom:16px;">
                        <label style="display:block;margin-bottom:8px;font-size:13px;">输入要查找的字符（如乱码字符 �）</label>
                        <input type="text" id="ttw-search-input" class="ttw-input" placeholder="输入要查找的内容..." value="${searchHighlightKeyword}">
                    </div>
                    <div id="ttw-search-results" style="max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;">
                        <div style="text-align:center;color:#888;">输入关键词后点击"查找"</div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-clear-search">清除高亮</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-do-search">🔍 查找</button>
                    <button class="ttw-btn" id="ttw-close-search">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-close-search').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('#ttw-do-search').addEventListener('click', () => {
            const keyword = modal.querySelector('#ttw-search-input').value;
            if (!keyword) {
                Services.UI.showToast('请输入要查找的内容', 'warning');
                return;
            }
            searchHighlightKeyword = keyword;
            performSearch(keyword, modal.querySelector('#ttw-search-results'));
        });

        modal.querySelector('#ttw-clear-search').addEventListener('click', () => {
            searchHighlightKeyword = '';
            modal.querySelector('#ttw-search-input').value = '';
            modal.querySelector('#ttw-search-results').innerHTML = '<div style="text-align:center;color:#888;">已清除高亮</div>';
            updateWorldbookPreview();
        });

        // 回车搜索
        modal.querySelector('#ttw-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#ttw-do-search').click();
            }
        });
    }

    function performSearch(keyword, resultsContainer) {
        const results = [];

        // 搜索世界书
        for (const category in generatedWorldbook) {
            for (const entryName in generatedWorldbook[category]) {
                const entry = generatedWorldbook[category][entryName];
                const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                const content = entry['内容'] || '';

                const matches = [];
                if (entryName.includes(keyword)) {
                    matches.push({ field: '条目名', text: entryName });
                }
                if (keywordsStr.includes(keyword)) {
                    matches.push({ field: '关键词', text: keywordsStr });
                }
                if (content.includes(keyword)) {
                    // 找到上下文
                    const idx = content.indexOf(keyword);
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(content.length, idx + keyword.length + 30);
                    const context = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
                    matches.push({ field: '内容', text: context });
                }

                if (matches.length > 0) {
                    results.push({ category, entryName, matches });
                }
            }
        }

        // 搜索处理结果
        for (let i = 0; i < memoryQueue.length; i++) {
            const memory = memoryQueue[i];
            if (memory.result) {
                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];
                        const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                        const content = entry['内容'] || '';

                        if (entryName.includes(keyword) || keywordsStr.includes(keyword) || content.includes(keyword)) {
                            const existingResult = results.find(r => r.category === category && r.entryName === entryName);
                            if (!existingResult) {
                                results.push({
                                    category,
                                    entryName,
                                    memoryIndex: i,
                                    matches: [{ field: '处理结果', text: `第${i + 1}章` }]
                                });
                            }
                        }
                    }
                }
            }
        }

        if (results.length === 0) {
            resultsContainer.innerHTML = `<div style="text-align:center;color:#888;padding:20px;">未找到包含"${keyword}"的内容</div>`;
            return;
        }

        let html = `<div style="margin-bottom:12px;font-size:13px;color:#27ae60;">找到 ${results.length} 个匹配项</div>`;

        results.forEach((result, idx) => {
            const highlightKeyword = (text) => {
                return text.replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                    `<span style="background:#f1c40f;color:#000;padding:1px 2px;border-radius:2px;">${keyword}</span>`);
            };

            html += `
                <div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;margin-bottom:8px;border-left:3px solid #f1c40f;">
                    <div style="font-weight:bold;color:#e67e22;margin-bottom:6px;">[${result.category}] ${highlightKeyword(result.entryName)}</div>
                    ${result.matches.map(m => `
                        <div style="font-size:12px;color:#ccc;margin-bottom:4px;">
                            <span style="color:#888;">${m.field}:</span> ${highlightKeyword(m.text)}
                        </div>
                    `).join('')}
                </div>
            `;
        });

        resultsContainer.innerHTML = html;
    }

    // ========== 新增：替换功能 ==========
    function showReplaceModal() {
        const contentHtml = `
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:8px;font-size:13px;color:var(--ttw-text-muted);">查找内容</label>
                <input type="text" id="ttw-replace-find" class="ttw-input" placeholder="输入要查找的词语..." style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--ttw-border);border-radius:4px;color:white;">
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:8px;font-size:13px;color:var(--ttw-text-muted);">替换为（留空则删除该词语）</label>
                <input type="text" id="ttw-replace-with" class="ttw-input" placeholder="输入替换内容，留空则删除..." style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--ttw-border);border-radius:4px;color:white;">
            </div>
            <div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
                <label class="ttw-checkbox-label">
                    <input type="checkbox" id="ttw-replace-in-worldbook" checked>
                    <span>替换世界书中的内容</span>
                </label>
                <label class="ttw-checkbox-label" style="margin-top:8px;">
                    <input type="checkbox" id="ttw-replace-in-results" checked>
                    <span>替换各章节处理结果中的内容</span>
                </label>
            </div>
            <div id="ttw-replace-preview" style="display:none;max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn" id="ttw-preview-replace">👁️ 预览</button>
            <button class="ttw-btn ttw-btn-warning" id="ttw-do-replace">🔄 执行替换</button>
            <button class="ttw-btn" id="ttw-close-replace">关闭</button>
        `;

        const modal = Services.UI.createModal('ttw-replace-modal', '🔄 批量替换', contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '600px';

        modal.querySelector('#ttw-close-replace').addEventListener('click', () => modal.remove());

        modal.querySelector('#ttw-preview-replace').addEventListener('click', () => {
            const findText = modal.querySelector('#ttw-replace-find').value;
            const replaceWith = modal.querySelector('#ttw-replace-with').value;
            const inWorldbook = modal.querySelector('#ttw-replace-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-replace-in-results').checked;

            if (!findText) {
                Services.UI.showToast('请输入要查找的内容', 'warning');
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            const previewDiv = modal.querySelector('#ttw-replace-preview');
            previewDiv.style.display = 'block';

            if (preview.count === 0) {
                previewDiv.innerHTML = `<div style="color:#888;text-align:center;">未找到"${findText}"</div>`;
            } else {
                previewDiv.innerHTML = `
                    <div style="color:var(--ttw-success);margin-bottom:8px;">将替换 ${preview.count} 处</div>
                    ${preview.samples.map(s => `
                        <div style="font-size:11px;margin-bottom:6px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;">
                            <div style="color:#888;">[${s.location}]</div>
                            <div style="color:var(--ttw-danger);text-decoration:line-through;">${s.before}</div>
                            <div style="color:var(--ttw-success);">${s.after}</div>
                        </div>
                    `).join('')}
                    ${preview.count > preview.samples.length ? `<div style="color:#888;text-align:center;">...还有 ${preview.count - preview.samples.length} 处</div>` : ''}
                `;
            }
        });

        modal.querySelector('#ttw-do-replace').addEventListener('click', () => {
            const findText = modal.querySelector('#ttw-replace-find').value;
            const replaceWith = modal.querySelector('#ttw-replace-with').value;
            const inWorldbook = modal.querySelector('#ttw-replace-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-replace-in-results').checked;

            if (!findText) {
                Services.UI.showToast('请输入要查找的内容', 'warning');
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            if (preview.count === 0) {
                Services.UI.showToast(`未找到"${findText}"`, 'warning');
                return;
            }

            const action = replaceWith ? `替换为"${replaceWith}"` : '删除';
            if (!confirm(`确定要${action} ${preview.count} 处"${findText}"吗？\n\n此操作不可撤销！`)) {
                return;
            }

            const result = executeReplace(findText, replaceWith, inWorldbook, inResults);
            modal.remove();
            updateWorldbookPreview();
            alert(`替换完成！共替换了 ${result.count} 处`);
        });
    }

    function previewReplace(findText, replaceWith, inWorldbook, inResults) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let count = 0;
        const samples = [];
        const maxSamples = 5;

        if (inWorldbook) {
            for (const category in generatedWorldbook) {
                for (const entryName in generatedWorldbook[category]) {
                    const entry = generatedWorldbook[category][entryName];

                    // 检查关键词
                    if (Array.isArray(entry['关键词'])) {
                        for (const kw of entry['关键词']) {
                            if (kw.includes(findText)) {
                                count++;
                                if (samples.length < maxSamples) {
                                    samples.push({
                                        location: `世界书/${category}/${entryName}/关键词`,
                                        before: kw,
                                        after: kw.replace(regex, replaceWith)
                                    });
                                }
                            }
                        }
                    }

                    // 检查内容
                    if (entry['内容'] && entry['内容'].includes(findText)) {
                        const matches = entry['内容'].match(regex);
                        count += matches ? matches.length : 0;
                        if (samples.length < maxSamples) {
                            const idx = entry['内容'].indexOf(findText);
                            const start = Math.max(0, idx - 20);
                            const end = Math.min(entry['内容'].length, idx + findText.length + 20);
                            const context = entry['内容'].substring(start, end);
                            samples.push({
                                location: `世界书/${category}/${entryName}/内容`,
                                before: context,
                                after: context.replace(regex, replaceWith)
                            });
                        }
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < memoryQueue.length; i++) {
                const memory = memoryQueue[i];
                if (!memory.result) continue;

                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];

                        if (Array.isArray(entry['关键词'])) {
                            for (const kw of entry['关键词']) {
                                if (kw.includes(findText)) {
                                    count++;
                                }
                            }
                        }

                        if (entry['内容'] && entry['内容'].includes(findText)) {
                            const matches = entry['内容'].match(regex);
                            count += matches ? matches.length : 0;
                        }
                    }
                }
            }
        }

        return { count, samples };
    }

    function executeReplace(findText, replaceWith, inWorldbook, inResults) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let count = 0;

        if (inWorldbook) {
            for (const category in generatedWorldbook) {
                for (const entryName in generatedWorldbook[category]) {
                    const entry = generatedWorldbook[category][entryName];

                    if (Array.isArray(entry['关键词'])) {
                        entry['关键词'] = entry['关键词'].map(kw => {
                            if (kw.includes(findText)) {
                                count++;
                                return kw.replace(regex, replaceWith);
                            }
                            return kw;
                        }).filter(kw => kw); // 过滤空字符串
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
            for (let i = 0; i < memoryQueue.length; i++) {
                const memory = memoryQueue[i];
                if (!memory.result) continue;

                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];

                        if (Array.isArray(entry['关键词'])) {
                            entry['关键词'] = entry['关键词'].map(kw => {
                                if (kw.includes(findText)) {
                                    count++;
                                    return kw.replace(regex, replaceWith);
                                }
                                return kw;
                            }).filter(kw => kw);
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

    // ========== 新增：条目配置弹窗 ==========
    function showEntryConfigModal(category, entryName) {
        const existingModal = document.getElementById('ttw-entry-config-modal');
        if (existingModal) existingModal.remove();

        const config = getEntryConfig(category, entryName);

        const modal = document.createElement('div');
        modal.id = 'ttw-entry-config-modal';
        modal.className = 'ttw-modal-container';

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:500px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">⚙️ 条目配置: ${entryName}</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
                        <div style="font-size:12px;color:#ccc;">配置此条目在导出为SillyTavern格式时的位置、深度和顺序</div>
                    </div>

                    <div class="ttw-form-group">
                        <label>位置 (Position)</label>
                        <select id="ttw-entry-position" class="ttw-select">
    <option value="0" ${config.position === 0 ? 'selected' : ''}>在角色定义之前</option>
    <option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
    <option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
    <option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
    <option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
</select>

                    </div>

                    <div class="ttw-form-group">
                        <label>深度 (Depth) - 仅Position=4时有效</label>
                        <input type="number" id="ttw-entry-depth" class="ttw-input" value="${config.depth}" min="0" max="999">
                    </div>

                    <div class="ttw-form-group">
                        <label>顺序 (Order) - 数字越小越靠前</label>
                        <input type="number" id="ttw-entry-order" class="ttw-input" value="${config.order}" min="0" max="9999">
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-entry-config">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-save-entry-config">💾 保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-cancel-entry-config').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('#ttw-save-entry-config').addEventListener('click', () => {
            const position = parseInt(modal.querySelector('#ttw-entry-position').value);
            const depth = parseInt(modal.querySelector('#ttw-entry-depth').value) || 4;
            const order = parseInt(modal.querySelector('#ttw-entry-order').value) || 100;

            setEntryConfig(category, entryName, { position, depth, order });
            modal.remove();
            Services.UI.showToast('配置已保存', 'success');
        });
    }

    // ========== 新增：分类配置弹窗 ==========
    function showCategoryConfigModal(category) {
        const existingModal = document.getElementById('ttw-category-config-modal');
        if (existingModal) existingModal.remove();

        const config = categoryDefaultConfig[category] || { position: 0, depth: 4, order: 100 };

        const modal = document.createElement('div');
        modal.id = 'ttw-category-config-modal';
        modal.className = 'ttw-modal-container';

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width:500px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">⚙️ 分类默认配置: ${category}</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
                        <div style="font-size:12px;color:#ccc;">设置此分类下所有条目的默认位置/深度/顺序。单个条目的配置会覆盖分类默认配置。</div>
                    </div>

                    <div class="ttw-form-group">
                        <label>默认位置 (Position)</label>
                        <select id="ttw-cat-position" class="ttw-select">
    <option value="0" ${config.position === 0 ? 'selected' : ''}>在角色定义之前</option>
    <option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
    <option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
    <option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
    <option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
</select>

                    </div>

                    <div class="ttw-form-group">
                        <label>默认深度 (Depth)</label>
                        <input type="number" id="ttw-cat-depth" class="ttw-input" value="${config.depth}" min="0" max="999">
                    </div>

                    <div class="ttw-form-group">
                        <label>默认顺序 (Order)</label>
                        <input type="number" id="ttw-cat-order" class="ttw-input" value="${config.order}" min="0" max="9999">
                    </div>

                    <div style="margin-top:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
                        <label class="ttw-checkbox-label">
                            <input type="checkbox" id="ttw-apply-to-existing">
                            <span>同时应用到该分类下已有的所有条目</span>
                        </label>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-cat-config">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-save-cat-config">💾 保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-cancel-cat-config').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        modal.querySelector('#ttw-save-cat-config').addEventListener('click', () => {
            const position = parseInt(modal.querySelector('#ttw-cat-position').value);
            const depth = parseInt(modal.querySelector('#ttw-cat-depth').value) || 4;
            const order = parseInt(modal.querySelector('#ttw-cat-order').value) || 100;
            const applyToExisting = modal.querySelector('#ttw-apply-to-existing').checked;

            setCategoryDefaultConfig(category, { position, depth, order });

            if (applyToExisting && generatedWorldbook[category]) {
                for (const entryName in generatedWorldbook[category]) {
                    setEntryConfig(category, entryName, { position, depth, order });
                }
            }

            modal.remove();
            Services.UI.showToast('配置已保存', 'success');
        });
    }

    /**
     * @namespace UI
     * UI Component Management
     */
    Services.UI = {
        /**
         * Inject CSS styles into the document
         * Extracted from inline styles for better maintainability and performance
         */
        injectStyles() {
            const styleId = 'ttw-styles-v3';
            if (document.getElementById(styleId)) return;

            const styles = `
                /* Root Variables */
                :root {
                    --ttw-primary: #3498db;
                    --ttw-secondary: #2c3e50;
                    --ttw-success: #27ae60;
                    --ttw-warning: #f39c12;
                    --ttw-danger: #e74c3c;
                    --ttw-text: #ecf0f1;
                    --ttw-text-muted: #bdc3c7;
                    --ttw-bg-dark: #1a1a1a;
                    --ttw-bg-card: rgba(0,0,0,0.2);
                    --ttw-border: rgba(255,255,255,0.1);
                    --ttw-radius: 8px;
                    --ttw-shadow: 0 4px 6px rgba(0,0,0,0.3);
                }

                /* Toast Notifications */
                .ttw-toast-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10001;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    pointer-events: none;
                }
                .ttw-toast {
                    background: var(--ttw-secondary);
                    color: var(--ttw-text);
                    padding: 12px 20px;
                    border-radius: var(--ttw-radius);
                    box-shadow: var(--ttw-shadow);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 250px;
                    max-width: 400px;
                    animation: slideIn 0.3s ease;
                    pointer-events: auto;
                    border-left: 4px solid var(--ttw-primary);
                    transition: opacity 0.3s ease;
                }
                .ttw-toast.success { border-left-color: var(--ttw-success); }
                .ttw-toast.error { border-left-color: var(--ttw-danger); }
                .ttw-toast.warning { border-left-color: var(--ttw-warning); }

                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                /* Mobile Responsive */
                @media (max-width: 768px) {
                    .ttw-modal {
                        width: 95vw !important;
                        max-width: 95vw !important;
                        max-height: 90vh !important;
                        padding: 10px !important;
                    }
                    .ttw-modal-body {
                        padding: 10px !important;
                    }
                    .ttw-action-bar {
                        flex-direction: column;
                        gap: 8px;
                    }
                    .ttw-btn {
                        width: 100%;
                        justify-content: center;
                    }
                    /* Drawer Menu for Settings on Mobile */
                    .ttw-settings-drawer {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        width: 100%;
                        height: 70vh;
                        background: #2c3e50;
                        border-radius: 16px 16px 0 0;
                        transform: translateY(100%);
                        transition: transform 0.3s ease;
                        z-index: 10000;
                    }
                    .ttw-settings-drawer.open {
                        transform: translateY(0);
                    }
                }

                /* Common Components */
                .ttw-card {
                    background: var(--ttw-bg-card);
                    border: 1px solid var(--ttw-border);
                    border-radius: var(--ttw-radius);
                    padding: 15px;
                    margin-bottom: 10px;
                }

                .ttw-flex-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .ttw-flex-col {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                /* Progress Timeline */
                .ttw-timeline-container {
                    width: 100%;
                    height: 40px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 4px;
                    position: relative;
                    overflow: hidden;
                    margin: 10px 0;
                    cursor: pointer;
                }
                .ttw-timeline-bar {
                    height: 100%;
                    display: flex;
                }
                .ttw-timeline-segment {
                    height: 100%;
                    transition: width 0.3s;
                }
                .ttw-timeline-segment.success { background: var(--ttw-success); opacity: 0.6; }
                .ttw-timeline-segment.processing { background: var(--ttw-primary); opacity: 0.8; animation: pulse 1s infinite; }
                .ttw-timeline-segment.failed { background: var(--ttw-danger); }
                .ttw-timeline-segment.pending { background: transparent; }

                @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 1; }
                    100% { opacity: 0.6; }
                }

                /* Tooltip */
                .ttw-tooltip {
                    position: absolute;
                    background: rgba(0,0,0,0.8);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    pointer-events: none;
                    z-index: 1000;
                    display: none;
                }

                /* History & Evolution Views */
                .ttw-split-view { display: flex; height: 500px; gap: 15px; }
                .ttw-split-list { width: 300px; flex-shrink: 0; overflow-y: auto; background: var(--ttw-bg-card); border-radius: var(--ttw-radius); padding: 10px; }
                .ttw-split-detail { flex: 1; overflow-y: auto; background: var(--ttw-bg-card); border-radius: var(--ttw-radius); padding: 15px; }

                .ttw-list-item {
                    padding: 10px; border-bottom: 1px solid var(--ttw-border); cursor: pointer; transition: background 0.2s;
                    border-radius: 4px; margin-bottom: 4px; position: relative;
                }
                .ttw-list-item:hover { background: rgba(255,255,255,0.05); }
                .ttw-list-item.active { background: rgba(52, 152, 219, 0.2); border-left: 3px solid var(--ttw-primary); }
                .ttw-list-item-title { font-weight: bold; color: var(--ttw-text); margin-bottom: 4px; font-size: 13px; }
                .ttw-list-item-subtitle { font-size: 11px; color: var(--ttw-text-muted); }
                .ttw-list-item-info { font-size: 11px; color: var(--ttw-primary); position: absolute; top: 10px; right: 10px; }

                /* Change Log Items */
                .ttw-change-item { background: var(--ttw-bg-card); border-radius: 6px; padding: 12px; margin-bottom: 10px; }
                .ttw-change-item.add { border-left: 3px solid var(--ttw-success); }
                .ttw-change-item.modify { border-left: 3px solid var(--ttw-primary); }
                .ttw-change-item.delete { border-left: 3px solid var(--ttw-danger); }

                .ttw-change-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
                .ttw-change-content { display: flex; gap: 10px; }
                .ttw-change-block { flex: 1; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; }
                .ttw-change-label { font-size: 11px; margin-bottom: 4px; opacity: 0.8; }
                .ttw-change-value { font-size: 12px; color: #ccc; max-height: 100px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }

                /* Optimization Modal */
                .ttw-opt-stat-box { background: var(--ttw-bg-card); padding: 15px; border-radius: 8px; margin-bottom: 15px; }
                .ttw-opt-input {
                    width: 100%; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--ttw-border);
                    border-radius: 4px; color: white; margin-top: 5px;
                }
                .ttw-opt-textarea {
                    width: 100%; min-height: 150px; padding: 10px; background: rgba(0,0,0,0.3);
                    border: 1px solid var(--ttw-border); border-radius: 4px; color: white;
                    font-family: monospace; font-size: 13px; resize: vertical; margin-bottom: 10px;
                }
            `;

            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);
        },

        createModal(id, title, contentHtml, footerHtml = '') {
            const existing = document.getElementById(id);
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = id;
            modal.className = 'ttw-modal-container';
            modal.innerHTML = `
                <div class="ttw-modal">
                    <div class="ttw-modal-header">
                        <span class="ttw-modal-title">${title}</span>
                        <button class="ttw-modal-close">✕</button>
                    </div>
                    <div class="ttw-modal-body">${contentHtml}</div>
                    <div class="ttw-modal-footer">${footerHtml}</div>
                </div>
            `;

            // Common Event Listeners
            modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

            document.body.appendChild(modal);
            return modal;
        },

        showToast(message, type = 'info', duration = CONSTANTS.TOAST_DURATION) {
            let container = document.querySelector('.ttw-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'ttw-toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `ttw-toast ${type}`;

            const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';

            toast.innerHTML = `
                <span style="font-size: 16px;">${icon}</span>
                <span style="font-size: 14px; line-height: 1.4;">${message}</span>
            `;

            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    toast.remove();
                    if (container.children.length === 0) container.remove();
                }, 300);
            }, duration);
        },

        updateTimeline(queue) {
            const container = document.getElementById('ttw-timeline');
            if (!container) return;

            const total = queue.length;
            if (total === 0) return;

            // Simple visual representation
            // Or use canvas for performance if thousands of items
            // For < 1000 items, divs are fine.
            // But let's use a canvas for density
            let canvas = container.querySelector('canvas');
            if (!canvas) {
                container.innerHTML = '';
                canvas = document.createElement('canvas');
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                container.appendChild(canvas);

                // Tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'ttw-tooltip';
                container.appendChild(tooltip);

                // Mouse events for tooltip
                canvas.addEventListener('mousemove', (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percent = x / rect.width;
                    const index = Math.floor(percent * total);
                    if (index >= 0 && index < total) {
                        const item = queue[index];
                        tooltip.style.left = `${e.clientX + 10}px`;
                        tooltip.style.top = `${e.clientY + 10}px`;
                        tooltip.style.display = 'block';
                        tooltip.textContent = `#${index + 1} ${item.title} (${item.failed ? '失败' : (item.processed ? '完成' : '等待')})`;
                    }
                });
                canvas.addEventListener('mouseleave', () => {
                    container.querySelector('.ttw-tooltip').style.display = 'none';
                });
                canvas.addEventListener('click', (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const index = Math.floor((x / rect.width) * total);
                    // Jump to memory or show detail
                    if (window.showMemoryContentModal) window.showMemoryContentModal(index);
                });
            }

            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const barWidth = width / total;

            ctx.clearRect(0, 0, width, height);

            queue.forEach((item, i) => {
                let color = '#555'; // Pending
                if (item.failed) color = '#e74c3c';
                else if (item.processing) color = '#3498db';
                else if (item.processed) color = '#27ae60';

                ctx.fillStyle = color;
                ctx.fillRect(i * barWidth, 0, Math.ceil(barWidth), height);
            });
        }
    };

    // Inject styles on load
    Services.UI.injectStyles();

    // Hook into updateMemoryQueueUI to update timeline
    const originalUpdateUI = updateMemoryQueueUI;
    updateMemoryQueueUI = function() {
        originalUpdateUI();
        Services.UI.updateTimeline(memoryQueue);
    };

    // ========== 导出功能 - 修改为使用条目配置 ==========
    function convertToSillyTavernFormat(worldbook) {
        const entries = [];
        let entryId = 0;

        for (const [category, categoryData] of Object.entries(worldbook)) {
            if (typeof categoryData !== 'object' || categoryData === null) continue;

            const isGreenLight = getCategoryLightState(category);

            for (const [itemName, itemData] of Object.entries(categoryData)) {
                if (typeof itemData !== 'object' || itemData === null) continue;
                if (itemData.关键词 && itemData.内容) {
                    let keywords = Array.isArray(itemData.关键词) ? itemData.关键词 : [itemData.关键词];
                    keywords = keywords.map(k => String(k).trim().replace(/[-_\s]+/g, '')).filter(k => k.length > 0 && k.length <= 20);
                    if (keywords.length === 0) keywords.push(itemName);

                    // 获取条目配置
                    const config = getEntryConfig(category, itemName);

                    entries.push({
                        uid: entryId++,
                        key: [...new Set(keywords)],
                        keysecondary: [],
                        comment: `${category} - ${itemName}`,
                        content: String(itemData.内容).trim(),
                        constant: !isGreenLight,
                        selective: isGreenLight,
                        selectiveLogic: 0,
                        addMemo: true,
                        order: config.order,
                        position: config.position,
                        disable: false,
                        excludeRecursion: false,
                        preventRecursion: false,
                        delayUntilRecursion: false,
                        probability: 100,
                        depth: config.depth,
                        group: category,
                        groupOverride: false,
                        groupWeight: 100,
                        scanDepth: null,
                        caseSensitive: false,
                        matchWholeWords: true,
                        useGroupScoring: null,
                        automationId: '',
                        role: 0,
                        vectorized: false,
                        sticky: null,
                        cooldown: null,
                        delay: null
                    });
                }
            }
        }

        return {
            entries,
            originalData: { name: '小说转换的世界书', description: '由TXT转世界书功能生成', version: 1, author: 'TxtToWorldbook' }
        };
    }

    function exportWorldbook() {
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        let fileName = currentFile ? `${currentFile.name.replace(/\.[^/.]+$/, '')}-世界书-${timeString}` : `世界书-${timeString}`;
        const exportData = useVolumeMode ? { volumes: worldbookVolumes, currentVolume: generatedWorldbook, merged: getAllVolumesWorldbook() } : generatedWorldbook;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportToSillyTavern() {
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        try {
            const worldbookToExport = useVolumeMode ? getAllVolumesWorldbook() : generatedWorldbook;
            const sillyTavernWorldbook = convertToSillyTavernFormat(worldbookToExport);
            let fileName = currentFile ? `${currentFile.name.replace(/\.[^/.]+$/, '')}-酒馆书-${timeString}` : `酒馆书-${timeString}`;
            const blob = new Blob([JSON.stringify(sillyTavernWorldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.json';
            a.click();
            URL.revokeObjectURL(url);
            alert('已导出SillyTavern格式');
        } catch (error) {
            alert('转换失败：' + error.message);
        }
    }

    function exportVolumes() {
        if (worldbookVolumes.length === 0) { alert('没有分卷数据'); return; }
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        for (let i = 0; i < worldbookVolumes.length; i++) {
            const volume = worldbookVolumes[i];
            const fileName = currentFile ? `${currentFile.name.replace(/\.[^/.]+$/, '')}-世界书-卷${i + 1}-${timeString}.json` : `世界书-卷${i + 1}-${timeString}.json`;
            const blob = new Blob([JSON.stringify(volume.worldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
        alert(`已导出 ${worldbookVolumes.length} 卷`);
    }

    async function exportTaskState() {
        const state = {
            version: '2.9.0',
            timestamp: Date.now(),
            memoryQueue,
            generatedWorldbook,
            worldbookVolumes,
            currentVolumeIndex,
            fileHash: currentFileHash,
            settings,
            parallelConfig,
            categoryLightSettings,
            customWorldbookCategories,
            chapterRegexSettings,
            defaultWorldbookEntriesUI,
            categoryDefaultConfig,
            entryPositionConfig
        };
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        const fileName = currentFile ? `${currentFile.name.replace(/\.[^/.]+$/, '')}-任务状态-${timeString}.json` : `任务状态-${timeString}.json`;
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        const processedCount = memoryQueue.filter(m => m.processed).length;
        alert(`任务状态已导出！已处理: ${processedCount}/${memoryQueue.length}`);
    }

    async function importTaskState() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const content = await file.text();
                const state = JSON.parse(content);
                if (!state.memoryQueue || !Array.isArray(state.memoryQueue)) throw new Error('无效的任务状态文件');
                memoryQueue = state.memoryQueue;
                generatedWorldbook = state.generatedWorldbook || {};
                worldbookVolumes = state.worldbookVolumes || [];
                currentVolumeIndex = state.currentVolumeIndex || 0;
                currentFileHash = state.fileHash || null;
                if (state.settings) settings = { ...defaultSettings, ...state.settings };
                if (state.parallelConfig) parallelConfig = { ...parallelConfig, ...state.parallelConfig };
                if (state.categoryLightSettings) categoryLightSettings = { ...categoryLightSettings, ...state.categoryLightSettings };
                if (state.customWorldbookCategories) customWorldbookCategories = state.customWorldbookCategories;
                if (state.chapterRegexSettings) chapterRegexSettings = state.chapterRegexSettings;
                if (state.defaultWorldbookEntriesUI) defaultWorldbookEntriesUI = state.defaultWorldbookEntriesUI;
                if (state.categoryDefaultConfig) categoryDefaultConfig = state.categoryDefaultConfig;
                if (state.entryPositionConfig) entryPositionConfig = state.entryPositionConfig;

                if (Object.keys(generatedWorldbook).length === 0) {
                    rebuildWorldbookFromMemories();
                }

                const firstUnprocessed = memoryQueue.findIndex(m => !m.processed || m.failed);
                startFromIndex = firstUnprocessed !== -1 ? firstUnprocessed : 0;
                userSelectedStartIndex = null;
                showQueueSection(true);
                updateMemoryQueueUI();
                if (useVolumeMode) updateVolumeIndicator();
                updateStartButtonState(false);
                updateSettingsUI();
                renderCategoriesList();
                renderDefaultWorldbookEntriesUI();
                updateChapterRegexUI();

                if (Object.keys(generatedWorldbook).length > 0) {
                    showResultSection(true);
                    updateWorldbookPreview();
                }

                const processedCount = memoryQueue.filter(m => m.processed).length;
                alert(`导入成功！已处理: ${processedCount}/${memoryQueue.length}`);
                document.getElementById('ttw-start-btn').disabled = false;
            } catch (error) {
                alert('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    function rebuildWorldbookFromMemories() {
        generatedWorldbook = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
        for (const memory of memoryQueue) {
            if (memory.processed && memory.result && !memory.failed) {
                mergeWorldbookDataIncremental(generatedWorldbook, memory.result);
            }
        }
        applyDefaultWorldbookEntries();
        updateStreamContent(`\n📚 从已处理记忆重建了世界书\n`);
    }

    // 修改：导出配置 - 包含默认世界书条目UI
    function exportSettings() {
        saveCurrentSettings();

        const exportData = {
            version: '2.9.0',
            type: 'settings',
            timestamp: Date.now(),
            settings: { ...settings },
            categoryLightSettings,
            parallelConfig,
            customWorldbookCategories,
            chapterRegexSettings,
            defaultWorldbookEntriesUI,
            categoryDefaultConfig,
            entryPositionConfig,
            prompts: {
                worldbookPrompt: settings.customWorldbookPrompt,
                plotPrompt: settings.customPlotPrompt,
                stylePrompt: settings.customStylePrompt,
                mergePrompt: settings.customMergePrompt,
                rerollPrompt: settings.customRerollPrompt,
                defaultWorldbookEntries: settings.defaultWorldbookEntries
            }
        };
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        const fileName = `TxtToWorldbook-配置-${timeString}.json`;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        alert('配置已导出！（包含提示词配置和默认世界书条目）');
    }

    // 修改：导入配置 - 包含默认世界书条目UI
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
                if (data.type !== 'settings') throw new Error('不是有效的配置文件');

                if (data.settings) {
                    settings = { ...defaultSettings, ...data.settings };
                }
                if (data.parallelConfig) {
                    parallelConfig = { ...parallelConfig, ...data.parallelConfig };
                }
                if (data.categoryLightSettings) {
                    categoryLightSettings = { ...categoryLightSettings, ...data.categoryLightSettings };
                }
                if (data.customWorldbookCategories) {
                    customWorldbookCategories = data.customWorldbookCategories;
                    await saveCustomCategories();
                }
                if (data.chapterRegexSettings) {
                    chapterRegexSettings = data.chapterRegexSettings;
                }
                if (data.defaultWorldbookEntriesUI) {
                    defaultWorldbookEntriesUI = data.defaultWorldbookEntriesUI;
                }
                if (data.categoryDefaultConfig) {
                    categoryDefaultConfig = data.categoryDefaultConfig;
                }
                if (data.entryPositionConfig) {
                    entryPositionConfig = data.entryPositionConfig;
                }

                if (data.prompts) {
                    if (data.prompts.worldbookPrompt !== undefined) {
                        settings.customWorldbookPrompt = data.prompts.worldbookPrompt;
                    }
                    if (data.prompts.plotPrompt !== undefined) {
                        settings.customPlotPrompt = data.prompts.plotPrompt;
                    }
                    if (data.prompts.stylePrompt !== undefined) {
                        settings.customStylePrompt = data.prompts.stylePrompt;
                    }
                    if (data.prompts.mergePrompt !== undefined) {
                        settings.customMergePrompt = data.prompts.mergePrompt;
                    }
                    if (data.prompts.rerollPrompt !== undefined) {
                        settings.customRerollPrompt = data.prompts.rerollPrompt;
                    }
                    if (data.prompts.defaultWorldbookEntries !== undefined) {
                        settings.defaultWorldbookEntries = data.prompts.defaultWorldbookEntries;
                    }
                }

                updateSettingsUI();
                renderCategoriesList();
                renderDefaultWorldbookEntriesUI();
                updateChapterRegexUI();
                saveCurrentSettings();

                alert('配置导入成功！');
            } catch (error) {
                alert('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    function updateSettingsUI() {
        const chunkSizeEl = document.getElementById('ttw-chunk-size');
        if (chunkSizeEl) chunkSizeEl.value = settings.chunkSize;

        const apiTimeoutEl = document.getElementById('ttw-api-timeout');
        if (apiTimeoutEl) apiTimeoutEl.value = Math.round((settings.apiTimeout || CONSTANTS.DEFAULT_API_TIMEOUT) / 1000);

        const incrementalModeEl = document.getElementById('ttw-incremental-mode');
        if (incrementalModeEl) incrementalModeEl.checked = incrementalOutputMode;

        const volumeModeEl = document.getElementById('ttw-volume-mode');
        if (volumeModeEl) {
            volumeModeEl.checked = useVolumeMode;
            const indicator = document.getElementById('ttw-volume-indicator');
            if (indicator) indicator.style.display = useVolumeMode ? 'block' : 'none';
        }

        const enablePlotEl = document.getElementById('ttw-enable-plot');
        if (enablePlotEl) enablePlotEl.checked = settings.enablePlotOutline;

        const enableStyleEl = document.getElementById('ttw-enable-style');
        if (enableStyleEl) enableStyleEl.checked = settings.enableLiteraryStyle;

        const worldbookPromptEl = document.getElementById('ttw-worldbook-prompt');
        if (worldbookPromptEl) worldbookPromptEl.value = settings.customWorldbookPrompt || '';

        const plotPromptEl = document.getElementById('ttw-plot-prompt');
        if (plotPromptEl) plotPromptEl.value = settings.customPlotPrompt || '';

        const stylePromptEl = document.getElementById('ttw-style-prompt');
        if (stylePromptEl) stylePromptEl.value = settings.customStylePrompt || '';

        const parallelEnabledEl = document.getElementById('ttw-parallel-enabled');
        if (parallelEnabledEl) parallelEnabledEl.checked = parallelConfig.enabled;

        const parallelConcurrencyEl = document.getElementById('ttw-parallel-concurrency');
        if (parallelConcurrencyEl) parallelConcurrencyEl.value = parallelConfig.concurrency;

        const parallelModeEl = document.getElementById('ttw-parallel-mode');
        if (parallelModeEl) parallelModeEl.value = parallelConfig.mode;

        const useTavernApiEl = document.getElementById('ttw-use-tavern-api');
        if (useTavernApiEl) {
            useTavernApiEl.checked = settings.useTavernApi;
            handleUseTavernApiChange();
        }

        const apiProviderEl = document.getElementById('ttw-api-provider');
        if (apiProviderEl) apiProviderEl.value = settings.customApiProvider;

        const apiKeyEl = document.getElementById('ttw-api-key');
        if (apiKeyEl) apiKeyEl.value = settings.customApiKey;

        const apiEndpointEl = document.getElementById('ttw-api-endpoint');
        if (apiEndpointEl) apiEndpointEl.value = settings.customApiEndpoint;

        const apiModelEl = document.getElementById('ttw-api-model');
        if (apiModelEl) apiModelEl.value = settings.customApiModel;

        const forceChapterMarkerEl = document.getElementById('ttw-force-chapter-marker');
        if (forceChapterMarkerEl) forceChapterMarkerEl.checked = settings.forceChapterMarker;

        handleProviderChange();
    }

    function updateChapterRegexUI() {
        const regexInput = document.getElementById('ttw-chapter-regex');
        if (regexInput) {
            regexInput.value = chapterRegexSettings.pattern;
        }
    }

    // ========== 渲染分类列表 ==========
    function renderCategoriesList() {
        const listContainer = document.getElementById('ttw-categories-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        customWorldbookCategories.forEach((cat, index) => {
            const hasDefault = DEFAULT_WORLDBOOK_CATEGORIES.some(c => c.name === cat.name);

            const item = document.createElement('div');
            item.className = 'ttw-category-item';
            item.innerHTML = `
                <input type="checkbox" class="ttw-category-cb" data-index="${index}" ${cat.enabled ? 'checked' : ''}>
                <span class="ttw-category-name">${cat.name}${cat.isBuiltin ? ' <span style="color:#888;font-size:10px;">(内置)</span>' : ''}</span>
                <div class="ttw-category-actions">
                    <button class="ttw-btn-tiny ttw-edit-cat" data-index="${index}" title="编辑">✏️</button>
                    <button class="ttw-btn-tiny ttw-reset-single-cat" data-index="${index}" title="重置此项" ${hasDefault ? '' : 'style="opacity:0.3;" disabled'}>🔄</button>
                    <button class="ttw-btn-tiny ttw-delete-cat" data-index="${index}" title="删除" ${cat.isBuiltin ? 'disabled style="opacity:0.3;"' : ''}>🗑️</button>
                </div>
            `;
            listContainer.appendChild(item);
        });

        listContainer.querySelectorAll('.ttw-category-cb').forEach(cb => {
            cb.addEventListener('change', async (e) => {
                const index = parseInt(e.target.dataset.index);
                customWorldbookCategories[index].enabled = e.target.checked;
                await saveCustomCategories();
            });
        });

        listContainer.querySelectorAll('.ttw-edit-cat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                showEditCategoryModal(index);
            });
        });

        listContainer.querySelectorAll('.ttw-reset-single-cat').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                const cat = customWorldbookCategories[index];
                if (confirm(`确定重置"${cat.name}"为默认配置吗？`)) {
                    await resetSingleCategory(index);
                    renderCategoriesList();
                }
            });
        });

        listContainer.querySelectorAll('.ttw-delete-cat').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                const cat = customWorldbookCategories[index];
                if (cat.isBuiltin) return;
                if (confirm(`确定删除分类"${cat.name}"吗？`)) {
                    customWorldbookCategories.splice(index, 1);
                    await saveCustomCategories();
                    renderCategoriesList();
                }
            });
        });
    }

    function showAddCategoryModal() {
        showEditCategoryModal(null);
    }

    function showEditCategoryModal(editIndex) {
        const isEdit = editIndex !== null;
        const cat = isEdit ? customWorldbookCategories[editIndex] : {
            name: '',
            enabled: true,
            isBuiltin: false,
            entryExample: '',
            keywordsExample: [],
            contentGuide: ''
        };

        const contentHtml = `
            <div class="ttw-form-group">
                <label>分类名称 *</label>
                <input type="text" id="ttw-cat-name" value="${cat.name}" placeholder="如：道具、玩法" class="ttw-input">
            </div>
            <div class="ttw-form-group">
                <label>条目名称示例</label>
                <input type="text" id="ttw-cat-entry-example" value="${cat.entryExample}" placeholder="如：道具名称" class="ttw-input">
            </div>
            <div class="ttw-form-group">
                <label>关键词示例（逗号分隔）</label>
                <input type="text" id="ttw-cat-keywords" value="${cat.keywordsExample.join(', ')}" placeholder="如：道具名, 别名" class="ttw-input">
            </div>
            <div class="ttw-form-group">
                <label>内容提取指南</label>
                <textarea id="ttw-cat-content-guide" rows="4" class="ttw-textarea-small" placeholder="描述AI应该提取哪些信息...">${cat.contentGuide}</textarea>
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn" id="ttw-cancel-cat">取消</button>
            <button class="ttw-btn ttw-btn-primary" id="ttw-save-cat">💾 保存</button>
        `;

        const modal = Services.UI.createModal(
            'ttw-category-modal',
            isEdit ? '✏️ 编辑分类' : '➕ 添加分类',
            contentHtml,
            footerHtml
        );

        modal.querySelector('#ttw-cancel-cat').addEventListener('click', () => modal.remove());

        modal.querySelector('#ttw-save-cat').addEventListener('click', async () => {
            const name = document.getElementById('ttw-cat-name').value.trim();
            if (!name) { alert('请输入分类名称'); return; }

            const duplicateIndex = customWorldbookCategories.findIndex((c, i) => c.name === name && i !== editIndex);
            if (duplicateIndex !== -1) { alert('该分类名称已存在'); return; }

            const entryExample = document.getElementById('ttw-cat-entry-example').value.trim();
            const keywordsStr = document.getElementById('ttw-cat-keywords').value.trim();
            const contentGuide = document.getElementById('ttw-cat-content-guide').value.trim();

            const keywordsExample = keywordsStr ? keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k) : [];

            const newCat = {
                name,
                enabled: isEdit ? cat.enabled : true,
                isBuiltin: isEdit ? cat.isBuiltin : false,
                entryExample: entryExample || name + '名称',
                keywordsExample: keywordsExample.length > 0 ? keywordsExample : [name + '名'],
                contentGuide: contentGuide || `基于原文的${name}描述`
            };

            if (isEdit) {
                customWorldbookCategories[editIndex] = newCat;
            } else {
                customWorldbookCategories.push(newCat);
            }

            await saveCustomCategories();
            renderCategoriesList();
            modal.remove();
        });
    }

    // ========== 新增：默认世界书条目UI ==========
    function renderDefaultWorldbookEntriesUI() {
        const container = document.getElementById('ttw-default-entries-list');
        if (!container) return;

        container.innerHTML = '';

        if (defaultWorldbookEntriesUI.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无默认条目，点击"添加"按钮创建</div>';
            return;
        }

        defaultWorldbookEntriesUI.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'ttw-default-entry-item';
            item.innerHTML = `
                <div class="ttw-default-entry-header">
                    <span class="ttw-default-entry-title">[${entry.category || '未分类'}] ${entry.name || '未命名'}</span>
                    <div class="ttw-default-entry-actions">
                        <button class="ttw-btn-tiny ttw-edit-default-entry" data-index="${index}" title="编辑">✏️</button>
                        <button class="ttw-btn-tiny ttw-delete-default-entry" data-index="${index}" title="删除">🗑️</button>
                    </div>
                </div>
                <div class="ttw-default-entry-info">
                    <span style="color:#9b59b6;">关键词:</span> ${(entry.keywords || []).join(', ') || '无'}
                </div>
            `;
            container.appendChild(item);
        });

        container.querySelectorAll('.ttw-edit-default-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                showEditDefaultEntryModal(index);
            });
        });

        container.querySelectorAll('.ttw-delete-default-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (confirm(`确定删除此默认条目吗？`)) {
                    defaultWorldbookEntriesUI.splice(index, 1);
                    saveDefaultWorldbookEntriesUI();
                    renderDefaultWorldbookEntriesUI();
                }
            });
        });
    }

    function showAddDefaultEntryModal() {
        showEditDefaultEntryModal(null);
    }

    function showEditDefaultEntryModal(editIndex) {
        const isEdit = editIndex !== null;
        const entry = isEdit ? defaultWorldbookEntriesUI[editIndex] : {
            category: '',
            name: '',
            keywords: [],
            content: '',
            position: 0,
            depth: 4,
            order: 100
        };

        const contentHtml = `
            <div class="ttw-form-group">
                <label>分类 *</label>
                <input type="text" id="ttw-default-entry-category" value="${entry.category}" placeholder="如：角色、地点、系统" class="ttw-input">
            </div>
            <div class="ttw-form-group">
                <label>条目名称 *</label>
                <input type="text" id="ttw-default-entry-name" value="${entry.name}" placeholder="条目名称" class="ttw-input">
            </div>
            <div class="ttw-form-group">
                <label>关键词（逗号分隔）</label>
                <input type="text" id="ttw-default-entry-keywords" value="${(entry.keywords || []).join(', ')}" placeholder="关键词1, 关键词2" class="ttw-input">
            </div>
            <div class="ttw-form-group">
                <label>内容</label>
                <textarea id="ttw-default-entry-content" rows="6" class="ttw-textarea-small" placeholder="条目内容...">${entry.content || ''}</textarea>
            </div>
            <div class="ttw-form-group">
                <label>位置</label>
                <select id="ttw-default-entry-position" class="ttw-select">
                    <option value="0" ${(entry.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
                    <option value="1" ${entry.position === 1 ? 'selected' : ''}>在角色定义之后</option>
                    <option value="2" ${entry.position === 2 ? 'selected' : ''}>在作者注释之前</option>
                    <option value="3" ${entry.position === 3 ? 'selected' : ''}>在作者注释之后</option>
                    <option value="4" ${entry.position === 4 ? 'selected' : ''}>自定义深度</option>
                </select>
            </div>
            <div class="ttw-form-group">
                <label>深度（仅位置为"自定义深度"时有效）</label>
                <input type="number" id="ttw-default-entry-depth" class="ttw-input" value="${entry.depth || 4}" min="0" max="999">
            </div>
            <div class="ttw-form-group">
                <label>顺序（数字越小越靠前）</label>
                <input type="number" id="ttw-default-entry-order" class="ttw-input" value="${entry.order || 100}" min="0" max="9999">
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn" id="ttw-cancel-default-entry">取消</button>
            <button class="ttw-btn ttw-btn-primary" id="ttw-save-default-entry">💾 保存</button>
        `;

        const modal = Services.UI.createModal(
            'ttw-default-entry-modal',
            isEdit ? '✏️ 编辑默认条目' : '➕ 添加默认条目',
            contentHtml,
            footerHtml
        );

        modal.querySelector('#ttw-cancel-default-entry').addEventListener('click', () => modal.remove());

        modal.querySelector('#ttw-save-default-entry').addEventListener('click', () => {
            const category = document.getElementById('ttw-default-entry-category').value.trim();
            const name = document.getElementById('ttw-default-entry-name').value.trim();
            const keywordsStr = document.getElementById('ttw-default-entry-keywords').value.trim();
            const content = document.getElementById('ttw-default-entry-content').value;
            const position = parseInt(document.getElementById('ttw-default-entry-position').value) || 0;
            const depth = parseInt(document.getElementById('ttw-default-entry-depth').value) || 4;
            const order = parseInt(document.getElementById('ttw-default-entry-order').value) || 100;

            if (!category) { alert('请输入分类'); return; }
            if (!name) { alert('请输入条目名称'); return; }

            const keywords = keywordsStr ? keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k) : [];

            const newEntry = { category, name, keywords, content, position, depth, order };

            if (isEdit) {
                defaultWorldbookEntriesUI[editIndex] = newEntry;
            } else {
                defaultWorldbookEntriesUI.push(newEntry);
            }
            saveDefaultWorldbookEntriesUI();
            renderDefaultWorldbookEntriesList();
            modal.remove();
        });
    }


    function saveDefaultWorldbookEntriesUI() {
        settings.defaultWorldbookEntriesUI = defaultWorldbookEntriesUI;
        saveCurrentSettings();
    }

    // ========== 章回检测功能 ==========
    function detectChaptersWithRegex(content, regexPattern) {
        try {
            const regex = new RegExp(regexPattern, 'g');
            const matches = [...content.matchAll(regex)];
            return matches;
        } catch (e) {
            console.error('正则表达式错误:', e);
            return [];
        }
    }

    function testChapterRegex() {
        if (!currentFile && memoryQueue.length === 0) {
            alert('请先上传文件');
            return;
        }

        const regexInput = document.getElementById('ttw-chapter-regex');
        const pattern = regexInput?.value || chapterRegexSettings.pattern;

        const content = memoryQueue.length > 0 ? memoryQueue.map(m => m.content).join('') : '';
        if (!content) {
            alert('请先上传并加载文件');
            return;
        }

        const matches = detectChaptersWithRegex(content, pattern);

        if (matches.length === 0) {
            alert(`未检测到章节！\n\n当前正则: ${pattern}\n\n建议:\n1. 尝试使用快速选择按钮\n2. 检查正则表达式是否正确`);
        } else {
            const previewChapters = matches.slice(0, 10).map(m => m[0]).join('\n');
            alert(`检测到 ${matches.length} 个章节\n\n前10个章节:\n${previewChapters}${matches.length > 10 ? '\n...' : ''}`);
        }
    }

    function rechunkMemories() {
        if (memoryQueue.length === 0) {
            alert('没有可重新分块的内容');
            return;
        }

        const processedCount = memoryQueue.filter(m => m.processed && !m.failed).length;

        if (processedCount > 0) {
            const confirmMsg = `⚠️ 警告：当前有 ${processedCount} 个已处理的章节。\n\n重新分块将会：\n1. 清除所有已处理状态\n2. 需要重新从头开始转换\n3. 但不会清除已生成的世界书数据\n\n确定要重新分块吗？`;
            if (!confirm(confirmMsg)) return;
        }

        const allContent = memoryQueue.map(m => m.content).join('');

        splitContentIntoMemory(allContent);

        startFromIndex = 0;
        userSelectedStartIndex = null;

        updateMemoryQueueUI();
        updateStartButtonState(false);

        alert(`重新分块完成！\n当前共 ${memoryQueue.length} 个章节`);
    }

    // ========== 帮助弹窗 ==========
    function showHelpModal() {
        const contentHtml = `
            <div class="ttw-modal-body">
                <div class="ttw-help-section">
                    <h4 style="color: var(--ttw-warning); margin: 0 0 10px 0;">📌 基本功能</h4>
                    <p style="margin: 0 0 8px 0; line-height: 1.6; color: var(--ttw-text-secondary);">
                        将TXT格式的小说文本转换为SillyTavern世界书格式，自动提取角色、地点、组织等信息。
                    </p>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-accent); margin: 0 0 10px 0;">⚙️ API设置说明</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li><b>Gemini</b>：Google官方API，需要API Key</li>
                        <li><b>Gemini代理</b>：第三方代理服务，需要Endpoint和Key</li>
                        <li><b>DeepSeek</b>：DeepSeek官方API</li>
                        <li><b>OpenAI兼容</b>：支持本地模型（如LM Studio、Ollama）或其他兼容接口</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-success); margin: 0 0 10px 0;">🔧 OpenAI兼容模式</h4>
                    <p style="margin: 0 0 8px 0; line-height: 1.6; color: var(--ttw-text-secondary);">
                        使用本地模型或第三方API时：
                    </p>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li><b>API Endpoint</b>：填写完整的API地址，如 <code style="background: var(--ttw-bg-overlay); padding: 2px 6px; border-radius: 3px; color: var(--ttw-primary);">http://127.0.0.1:5000/v1</code></li>
                        <li><b>拉取模型</b>：自动获取可用的模型列表</li>
                        <li><b>快速测试</b>：发送"Hi"测试模型是否正常工作</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: #9b59b6; margin: 0 0 10px 0;">📝 增量输出模式</h4>
                    <p style="margin: 0 0 8px 0; line-height: 1.6; color: var(--ttw-text-secondary);">
                        开启后，AI每次只输出变更的条目，而非完整世界书。这可以：
                    </p>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li>大幅减少Token消耗</li>
                        <li>加快处理速度</li>
                        <li>避免上下文长度限制</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-danger); margin: 0 0 10px 0;">🔀 自动分裂机制</h4>
                    <p style="margin: 0 0 8px 0; line-height: 1.6; color: var(--ttw-text-secondary);">
                        当检测到Token超限时，系统会自动将记忆块分裂成更小的部分重新处理，无需手动干预。
                    </p>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-warning); margin: 0 0 10px 0;">📜 历史追踪</h4>
                    <p style="margin: 0 0 8px 0; line-height: 1.6; color: var(--ttw-text-secondary);">
                        每次处理都会记录变更历史，支持：
                    </p>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li>查看每个记忆块的变更详情</li>
                        <li>回退到任意历史版本</li>
                        <li>刷新页面后自动恢复进度</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: #8e44ad; margin: 0 0 10px 0;">🔍 高级功能</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li><b>🔍 查找功能</b>：查找处理结果中的特定字符并高亮</li>
                        <li><b>🔄 批量替换</b>：替换所有处理结果中的词语</li>
                        <li><b>🧹 多选整理</b>：可选择多个分类进行整理</li>
                        <li><b>⚙️ 条目配置</b>：每个条目可配置位置/深度/顺序</li>
                        <li><b>📚 默认条目UI</b>：可视化管理默认世界书条目</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-accent); margin: 0 0 10px 0;">🔧 API 模式</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li><b>使用酒馆API</b>：勾选后使用酒馆当前连接的AI</li>
                        <li><b>自定义API</b>：不勾选时，可配置独立的API (支持：Gemini / DeepSeek / OpenAI兼容 / Gemini代理)</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-success); margin: 0 0 10px 0;">✨ 其他功能</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li><b>📝 记忆编辑</b>：点击章节可查看/编辑/复制</li>
                        <li><b>🎲 重Roll功能</b>：每个记忆可多次生成</li>
                        <li><b>📥 合并世界书</b>：导入已有世界书进行合并</li>
                        <li><b>🔵🟢 灯状态</b>：分类蓝灯(常驻)或绿灯(触发)</li>
                        <li><b>🔗 别名合并</b>：识别同一角色的不同称呼</li>
                    </ul>
                </div>

                <div class="ttw-help-section" style="margin-top: 16px;">
                    <h4 style="color: var(--ttw-success); margin: 0 0 10px 0;">💡 使用技巧</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: var(--ttw-text-secondary);">
                        <li>建议每块字数设置为 10w-20w（DeepSeek上限10w，Gemini可以设置20w）</li>
                        <li>处理中途可以暂停，刷新后继续</li>
                        <li>失败的记忆块可以一键修复</li>
                        <li>生成完成后可以用AI优化世界书</li>
                    </ul>
                </div>
            </div>
        `;

        const footerHtml = `<button class="ttw-btn ttw-btn-primary" id="ttw-close-help">✨ 我学会了</button>`;

        const modal = Services.UI.createModal('ttw-help-modal', '📘 TXT转世界书模块 - 使用指南', contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '650px';

        modal.querySelector('#ttw-close-help').addEventListener('click', () => modal.remove());
    }

    // ========== 选择起始记忆 ==========
    function showStartFromSelector() {
        if (memoryQueue.length === 0) { Services.UI.showToast('请先上传文件', 'warning'); return; }

        const existingModal = document.getElementById('ttw-start-selector-modal');
        if (existingModal) existingModal.remove();

        let optionsHtml = '';
        memoryQueue.forEach((memory, index) => {
            const status = memory.processed ? (memory.failed ? '❗' : '✅') : '⏳';
            const currentSelected = userSelectedStartIndex !== null ? userSelectedStartIndex : startFromIndex;
            optionsHtml += `<option value="${index}" ${index === currentSelected ? 'selected' : ''}>${status} 第${index + 1}章 - ${memory.title} (${memory.content.length.toLocaleString()}字)</option>`;
        });

        const selectorModal = document.createElement('div');
        selectorModal.id = 'ttw-start-selector-modal';
        selectorModal.className = 'ttw-modal-container';
        selectorModal.innerHTML = `
            <div class="ttw-modal" style="max-width:500px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📍 选择起始位置</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom:16px;">
                        <label style="display:block;margin-bottom:8px;font-size:13px;">从哪一章开始：</label>
                        <select id="ttw-start-from-select" class="ttw-select">${optionsHtml}</select>
                    </div>
                    <div style="padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:12px;color:#f39c12;">⚠️ 从中间开始时，之前的世界书数据不会自动加载。</div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-start-select">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-confirm-start-select">确定</button>
                </div>
            </div>
        `;

        document.body.appendChild(selectorModal);
        selectorModal.querySelector('.ttw-modal-close').addEventListener('click', () => selectorModal.remove());
        selectorModal.querySelector('#ttw-cancel-start-select').addEventListener('click', () => selectorModal.remove());
        selectorModal.querySelector('#ttw-confirm-start-select').addEventListener('click', () => {
            const selectedIndex = parseInt(document.getElementById('ttw-start-from-select').value);
            userSelectedStartIndex = selectedIndex;
            startFromIndex = selectedIndex;
            const startBtn = document.getElementById('ttw-start-btn');
            if (startBtn) startBtn.textContent = `▶️ 从第${selectedIndex + 1}章开始`;
            selectorModal.remove();
        });
        selectorModal.addEventListener('click', (e) => { if (e.target === selectorModal) selectorModal.remove(); });
    }

    // ========== 查看/编辑记忆内容 ==========
    function showMemoryContentModal(index) {
        const memory = memoryQueue[index];
        if (!memory) return;

        const statusText = memory.processing ? '🔄 处理中' : (memory.processed ? (memory.failed ? '❗ 失败' : '✅ 完成') : '⏳ 等待');
        const statusColor = memory.processing ? '#3498db' : (memory.processed ? (memory.failed ? '#e74c3c' : '#27ae60') : '#f39c12');

        let resultHtml = '';
        if (memory.processed && memory.result && !memory.failed) {
            resultHtml = `
                <div style="margin-top:16px;">
                    <h4 style="color:#9b59b6;margin:0 0 10px;">📊 处理结果</h4>
                    <pre style="max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;font-size:11px;white-space:pre-wrap;word-break:break-all;">${JSON.stringify(memory.result, null, 2)}</pre>
                </div>
            `;
        }

        const contentHtml = `
            <div style="max-height:75vh;overflow-y:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;">
                    <div>
                        <span style="color:${statusColor};font-weight:bold;">${statusText}</span>
                        <span style="margin-left:16px;color:#888;">字数: <span id="ttw-char-count">${memory.content.length.toLocaleString()}</span></span>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button id="ttw-copy-memory-content" class="ttw-btn ttw-btn-small">📋 复制</button>
                        <button id="ttw-roll-history-btn" class="ttw-btn ttw-btn-small" style="background:rgba(155,89,182,0.3);">🎲 Roll历史</button>
                        <button id="ttw-delete-memory-btn" class="ttw-btn ttw-btn-warning ttw-btn-small">🗑️ 删除</button>
                    </div>
                </div>
                ${memory.failedError ? `<div style="margin-bottom:16px;padding:10px;background:rgba(231,76,60,0.2);border-radius:6px;color:#e74c3c;font-size:12px;">❌ ${memory.failedError}</div>` : ''}
                <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <h4 style="color:#3498db;margin:0;">📝 原文内容 <span style="font-size:12px;font-weight:normal;color:#888;">(可编辑)</span></h4>
                        <div style="display:flex;gap:8px;">
                            <button id="ttw-append-to-prev" class="ttw-btn ttw-btn-small" ${index === 0 ? 'disabled style="opacity:0.5;"' : ''} title="追加到上一章末尾，并删除当前章">⬆️ 合并到上一章</button>
                            <button id="ttw-append-to-next" class="ttw-btn ttw-btn-small" ${index === memoryQueue.length - 1 ? 'disabled style="opacity:0.5;"' : ''} title="追加到下一章开头，并删除当前章">⬇️ 合并到下一章</button>
                        </div>
                    </div>
                    <textarea id="ttw-memory-content-editor" class="ttw-textarea">${memory.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>
                ${resultHtml}
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn" id="ttw-cancel-memory-edit">取消</button>
            <button class="ttw-btn ttw-btn-primary" id="ttw-save-memory-edit">💾 保存修改</button>
        `;

        const modal = Services.UI.createModal('ttw-memory-content-modal', `📄 ${memory.title} (第${index + 1}章)`, contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '900px';

        const editor = modal.querySelector('#ttw-memory-content-editor');
        const charCount = modal.querySelector('#ttw-char-count');
        editor.addEventListener('input', () => { charCount.textContent = editor.value.length.toLocaleString(); });

        modal.querySelector('#ttw-cancel-memory-edit').addEventListener('click', () => modal.remove());

        modal.querySelector('#ttw-save-memory-edit').addEventListener('click', () => {
            const newContent = editor.value;
            if (newContent !== memory.content) {
                memory.content = newContent;
                memory.processed = false;
                memory.failed = false;
                memory.result = null;
                updateMemoryQueueUI();
                updateStartButtonState(false);
            }
            modal.remove();
        });

        modal.querySelector('#ttw-copy-memory-content').addEventListener('click', () => {
            navigator.clipboard.writeText(editor.value).then(() => {
                const btn = modal.querySelector('#ttw-copy-memory-content');
                btn.textContent = '✅ 已复制';
                setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
            });
        });

        modal.querySelector('#ttw-roll-history-btn').addEventListener('click', () => {
            modal.remove();
            showRollHistorySelector(index);
        });

        modal.querySelector('#ttw-delete-memory-btn').addEventListener('click', () => {
            if (confirm(`确定删除 ${memory.title} 吗？\n删除后不可恢复。`)) {
                modal.remove();
                deleteMemoryAt(index);
            }
        });

        modal.querySelector('#ttw-append-to-prev').addEventListener('click', () => {
            if (index === 0) return;
            const prevMemory = memoryQueue[index - 1];
            if (confirm(`将当前内容合并到 "${prevMemory.title}" 的末尾？\n\n⚠️ 合并后当前章将被删除！`)) {
                prevMemory.content += '\n\n' + editor.value;
                prevMemory.processed = false;
                prevMemory.failed = false;
                prevMemory.result = null;
                memoryQueue.splice(index, 1);
                // Update titles if they were generic
                memoryQueue.forEach((m, i) => { if (m.title.startsWith('记忆')) m.title = `记忆${i + 1}`; });
                if (startFromIndex > index) startFromIndex = Math.max(0, startFromIndex - 1);
                updateMemoryQueueUI();
                updateStartButtonState(false);
                modal.remove();
            }
        });

        modal.querySelector('#ttw-append-to-next').addEventListener('click', () => {
            if (index >= memoryQueue.length - 1) return;
            const nextMemory = memoryQueue[index + 1];
            if (confirm(`将当前内容合并到 "${nextMemory.title}" 的开头？\n\n⚠️ 合并后当前章将被删除！`)) {
                nextMemory.content = editor.value + '\n\n' + nextMemory.content;
                nextMemory.processed = false;
                nextMemory.failed = false;
                nextMemory.result = null;
                memoryQueue.splice(index, 1);
                memoryQueue.forEach((m, i) => { if (m.title.startsWith('记忆')) m.title = `记忆${i + 1}`; });
                if (startFromIndex > index) startFromIndex = Math.max(0, startFromIndex - 1);
                updateMemoryQueueUI();
                updateStartButtonState(false);
                modal.remove();
            }
        });
    }


    // ========== 查看已处理结果 ==========
    function showProcessedResults() {
        const processedMemories = memoryQueue.filter(m => m.processed && !m.failed && m.result);
        if (processedMemories.length === 0) { Services.UI.showToast('暂无已处理的结果', 'warning'); return; }

        let listHtml = '';
        processedMemories.forEach((memory) => {
            const realIndex = memoryQueue.indexOf(memory);
            const entryCount = memory.result ? Object.keys(memory.result).reduce((sum, cat) => sum + (typeof memory.result[cat] === 'object' ? Object.keys(memory.result[cat]).length : 0), 0) : 0;
            listHtml += `
                <div class="ttw-list-item" data-index="${realIndex}">
                    <div class="ttw-list-item-title" style="color:var(--ttw-success);font-size:11px;">✅ 第${realIndex + 1}章</div>
                    <div class="ttw-list-item-subtitle">${entryCount}条 | ${(memory.content.length / 1000).toFixed(1)}k字</div>
                </div>
            `;
        });

        const contentHtml = `
            <div class="ttw-split-view">
                <div class="ttw-split-list" style="width: 120px;">${listHtml}</div>
                <div id="ttw-result-detail" class="ttw-split-detail">
                    <div style="text-align:center;color:var(--ttw-text-muted);padding:40px;font-size:12px;">👈 点击左侧章节查看结果</div>
                </div>
            </div>
        `;

        const footerHtml = `<button class="ttw-btn" id="ttw-close-processed-results">关闭</button>`;

        const modal = Services.UI.createModal('ttw-processed-results-modal', `📊 已处理结果 (${processedMemories.length}/${memoryQueue.length})`, contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '900px';

        modal.querySelector('#ttw-close-processed-results').addEventListener('click', () => modal.remove());

        modal.querySelectorAll('.ttw-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                const memory = memoryQueue[index];
                const detailDiv = modal.querySelector('#ttw-result-detail');
                modal.querySelectorAll('.ttw-list-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                if (memory && memory.result) {
                    detailDiv.innerHTML = `
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                            <h4 style="color:var(--ttw-success);margin:0;font-size:14px;">第${index + 1}章 - ${memory.title}</h4>
                            <button class="ttw-btn ttw-btn-small" id="ttw-copy-result">📋 复制</button>
                        </div>
                        <pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;color:var(--ttw-text-muted);">${JSON.stringify(memory.result, null, 2)}</pre>
                    `;
                    detailDiv.querySelector('#ttw-copy-result').addEventListener('click', () => {
                        navigator.clipboard.writeText(JSON.stringify(memory.result, null, 2)).then(() => {
                            const btn = detailDiv.querySelector('#ttw-copy-result');
                            btn.textContent = '✅ 已复制';
                            setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
                        });
                    });
                }
            });
        });
    }

    // ========== UI ==========
    let modalContainer = null;

    function handleUseTavernApiChange() {
        const useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        const customApiSection = document.getElementById('ttw-custom-api-section');
        if (customApiSection) {
            customApiSection.style.display = useTavernApi ? 'none' : 'block';
        }
        settings.useTavernApi = useTavernApi;
    }

    function handleProviderChange() {
        const provider = document.getElementById('ttw-api-provider')?.value || 'gemini';
        const endpointContainer = document.getElementById('ttw-endpoint-container');
        const modelActionsContainer = document.getElementById('ttw-model-actions');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        if (provider === 'gemini-proxy' || provider === 'openai-compatible') {
            if (endpointContainer) endpointContainer.style.display = 'block';
        } else {
            if (endpointContainer) endpointContainer.style.display = 'none';
        }

        if (provider === 'openai-compatible') {
            if (modelActionsContainer) modelActionsContainer.style.display = 'flex';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } else {
            if (modelActionsContainer) modelActionsContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
        }

        updateModelStatus('', '');
    }

    function updateModelStatus(text, type) {
        const statusEl = document.getElementById('ttw-model-status');
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'ttw-model-status';
        if (type) {
            statusEl.classList.add(type);
        }
    }

    async function handleFetchModels() {
        const fetchBtn = document.getElementById('ttw-fetch-models');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        saveCurrentSettings();

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '⏳ 拉取中...';
        }
        updateModelStatus('正在拉取模型列表...', 'loading');

        try {
            const models = await fetchModelList();

            if (models.length === 0) {
                updateModelStatus('❌ 未拉取到模型', 'error');
                if (modelInputContainer) modelInputContainer.style.display = 'block';
                if (modelSelectContainer) modelSelectContainer.style.display = 'none';
                return;
            }

            if (modelSelect) {
                modelSelect.innerHTML = '<option value="">-- 请选择模型 --</option>';
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
            }

            if (modelInputContainer) modelInputContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'block';

            const currentModel = document.getElementById('ttw-api-model')?.value;
            if (models.includes(currentModel)) {
                if (modelSelect) modelSelect.value = currentModel;
            } else if (models.length > 0) {
                if (modelSelect) modelSelect.value = models[0];
                const modelInput = document.getElementById('ttw-api-model');
                if (modelInput) modelInput.value = models[0];
                saveCurrentSettings();
            }

            updateModelStatus(`✅ 找到 ${models.length} 个模型`, 'success');

        } catch (error) {
            console.error('拉取模型列表失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = '🔄 拉取模型';
            }
        }
    }

    async function handleQuickTest() {
        const testBtn = document.getElementById('ttw-quick-test');

        saveCurrentSettings();

        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ 测试中...';
        }
        updateModelStatus('正在测试连接...', 'loading');

        try {
            const result = await quickTestModel();
            updateModelStatus(`✅ 测试成功 (${result.elapsed}ms)`, 'success');
            if (result.response) {
                console.log('快速测试响应:', result.response);
            }
        } catch (error) {
            console.error('快速测试失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = '⚡ 快速测试';
            }
        }
    }

    function createModal() {
        if (modalContainer) modalContainer.remove();

        modalContainer = document.createElement('div');
        modalContainer.id = 'txt-to-worldbook-modal';
        modalContainer.className = 'ttw-modal-container';
        modalContainer.innerHTML = `
            <div class="ttw-modal">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📚 TXT转世界书模块 </span>
                    <div class="ttw-header-actions">
                        <span class="ttw-help-btn" title="帮助">❓</span>
                        <button class="ttw-modal-close" type="button">✕</button>
                    </div>
                </div>
                <div class="ttw-modal-body">
                    <!-- 设置区域 -->
                    <div class="ttw-section ttw-settings-section">
                        <div class="ttw-section-header" data-section="settings">
                            <span>⚙️ 设置</span>
                            <span class="ttw-collapse-icon">▼</span>
                        </div>
                        <div class="ttw-section-content" id="ttw-settings-content">
                            <!-- API 模式选择 -->
                            <div class="ttw-setting-card ttw-setting-card-green">
                                <label class="ttw-checkbox-label">
                                    <input type="checkbox" id="ttw-use-tavern-api" checked>
                                    <div>
                                        <span style="font-weight:bold;color:#27ae60;">🍺 使用酒馆API</span>
                                        <div class="ttw-setting-hint">勾选后使用酒馆当前连接的AI，不勾选则使用下方自定义API</div>
                                    </div>
                                </label>
                            </div>

                            <!-- 自定义API配置区域 -->
                            <div id="ttw-custom-api-section" style="display:none;margin-bottom:16px;padding:12px;border:1px solid rgba(52,152,219,0.3);border-radius:8px;background:rgba(52,152,219,0.1);">
                                <div style="font-weight:bold;color:#3498db;margin-bottom:12px;">🔧 自定义API配置</div>
                                <div class="ttw-setting-item">
                                    <label>API提供商</label>
                                    <select id="ttw-api-provider">
                                        <option value="gemini">Gemini</option>
                                        <option value="gemini-proxy">Gemini代理</option>
                                        <option value="deepseek">DeepSeek</option>
                                        <option value="openai-compatible">OpenAI兼容</option>
                                    </select>
                                </div>
                                <div class="ttw-setting-item">
                                    <label>API Key <span style="opacity:0.6;font-size:11px;">(本地模型可留空)</span></label>
                                    <input type="password" id="ttw-api-key" placeholder="输入API Key">
                                </div>
                                <div class="ttw-setting-item" id="ttw-endpoint-container" style="display:none;">
                                    <label>API Endpoint</label>
                                    <input type="text" id="ttw-api-endpoint" placeholder="https://... 或 http://127.0.0.1:5000/v1">
                                </div>
                                <div class="ttw-setting-item" id="ttw-model-input-container">
                                    <label>模型</label>
                                    <input type="text" id="ttw-api-model" value="gemini-2.5-flash" placeholder="模型名称">
                                </div>
                                <div class="ttw-setting-item" id="ttw-model-select-container" style="display:none;">
                                    <label>模型</label>
                                    <select id="ttw-model-select">
                                        <option value="">-- 请先拉取模型列表 --</option>
                                    </select>
                                </div>
                                <div class="ttw-model-actions" id="ttw-model-actions" style="display:none;">
                                    <button id="ttw-fetch-models" class="ttw-btn ttw-btn-small">🔄 拉取模型</button>
                                    <button id="ttw-quick-test" class="ttw-btn ttw-btn-small">⚡ 快速测试</button>
                                    <span id="ttw-model-status" class="ttw-model-status"></span>
                                </div>
                            </div>

                            <div class="ttw-setting-card ttw-setting-card-blue">
                                <div style="font-weight:bold;color:#3498db;margin-bottom:10px;">🚀 并行处理</div>
                                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                                    <label class="ttw-checkbox-label">
                                        <input type="checkbox" id="ttw-parallel-enabled" checked>
                                        <span>启用</span>
                                    </label>
                                    <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                                        并发数
                                        <input type="number" id="ttw-parallel-concurrency" value="3" min="1" max="10" class="ttw-input-small">
                                    </label>
                                </div>
                                <div style="margin-top:10px;">
                                    <select id="ttw-parallel-mode" class="ttw-select">
                                        <option value="independent">🚀 独立模式 - 最快，每章独立提取后合并</option>
                                        <option value="batch">📦 分批模式 - 批次间累积上下文，更连贯</option>
                                    </select>
                                </div>
                            </div>

                            <!-- 章回正则设置 -->
                            <div class="ttw-setting-card" style="background:rgba(230,126,34,0.1);border:1px solid rgba(230,126,34,0.3);">
                                <div style="font-weight:bold;color:#e67e22;margin-bottom:10px;">📖 章回正则设置</div>
                                <div class="ttw-setting-hint" style="margin-bottom:8px;">自定义章节检测正则表达式</div>
                                <input type="text" id="ttw-chapter-regex" class="ttw-input" value="第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]" style="margin-bottom:8px;">
                                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                    <button class="ttw-btn ttw-btn-small ttw-chapter-preset" data-regex="第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]">中文通用</button>
                                    <button class="ttw-btn ttw-btn-small ttw-chapter-preset" data-regex="Chapter\\s*\\d+">英文Chapter</button>
                                    <button class="ttw-btn ttw-btn-small ttw-chapter-preset" data-regex="第\\d+章">数字章节</button>
                                    <button id="ttw-test-chapter-regex" class="ttw-btn ttw-btn-small" style="background:#e67e22;">🔍 检测</button>
                                </div>
                            </div>

                            <div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-end;">
                                <div style="flex:1;">
                                    <label class="ttw-label">每块字数</label>
                                    <input type="number" id="ttw-chunk-size" value="${CONSTANTS.DEFAULT_CHUNK_SIZE}" min="1000" max="500000" class="ttw-input">
                                </div>
                                <div style="flex:1;">
                                    <label class="ttw-label">API超时(秒)</label>
                                    <input type="number" id="ttw-api-timeout" value="120" min="30" max="600" class="ttw-input">
                                </div>
                                <div>
                                    <button id="ttw-rechunk-btn" class="ttw-btn ttw-btn-small" style="background:rgba(230,126,34,0.5);" title="修改字数后点击重新分块">🔄 重新分块</button>
                                </div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:8px;">
                                <label class="ttw-checkbox-label ttw-checkbox-with-hint">
                                    <input type="checkbox" id="ttw-incremental-mode" checked>
                                    <div>
                                        <span>📝 增量输出模式</span>
                                        <div class="ttw-setting-hint">只输出变更的条目，减少重复内容</div>
                                    </div>
                                </label>
                                <label class="ttw-checkbox-label ttw-checkbox-with-hint ttw-checkbox-purple">
                                    <input type="checkbox" id="ttw-volume-mode">
                                    <div>
                                        <span>📦 分卷模式</span>
                                        <div class="ttw-setting-hint">上下文超限时自动分卷，避免记忆分裂</div>
                                    </div>
                                </label>
                                <label class="ttw-checkbox-label ttw-checkbox-with-hint" style="background:rgba(230,126,34,0.15);border:1px solid rgba(230,126,34,0.3);">
                                    <input type="checkbox" id="ttw-force-chapter-marker" checked>
                                    <div>
                                        <span style="color:#e67e22;">📌 强制记忆为章节</span>
                                        <div class="ttw-setting-hint">开启后会在提示词中强制AI将每个记忆块视为对应章节</div>
                                    </div>
                                </label>
                            </div>
                            <div id="ttw-volume-indicator" class="ttw-volume-indicator"></div>

                            <!-- 默认世界书条目配置 - UI化 -->
                            <div class="ttw-prompt-section" style="margin-top:16px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;">
                                <div class="ttw-prompt-header ttw-prompt-header-green" data-target="ttw-default-entries-content">
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <span>📚</span><span style="font-weight:500;">默认世界书条目</span>
                                        <span class="ttw-badge ttw-badge-gray">可选</span>
                                    </div>
                                    <span class="ttw-collapse-icon">▶</span>
                                </div>
                                <div id="ttw-default-entries-content" class="ttw-prompt-content">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                        <div class="ttw-setting-hint" style="font-size:11px;">每次转换完成后自动添加的世界书条目</div>
                                        <div style="display:flex;gap:6px;">
                                            <button id="ttw-add-default-entry" class="ttw-btn ttw-btn-small" style="background:#27ae60;">➕ 添加</button>
                                            <button id="ttw-apply-default-entries" class="ttw-btn ttw-btn-small">🔄 立即应用</button>
                                        </div>
                                    </div>
                                    <div id="ttw-default-entries-list" class="ttw-default-entries-list"></div>
                                </div>
                            </div>

                            <div class="ttw-prompt-config">
                                <div class="ttw-prompt-config-header">
                                    <span>📝 提示词配置</span>
                                    <div style="display:flex;gap:8px;">
                                       <button id="ttw-export-settings" class="ttw-btn ttw-btn-small">📤 导出</button>
                                       <button id="ttw-import-settings" class="ttw-btn ttw-btn-small">📥 导入</button>
                                        <button id="ttw-preview-prompt" class="ttw-btn ttw-btn-small">👁️ 预览</button>
                                    </div>
                                </div>
                                <div class="ttw-prompt-section">
                                    <div class="ttw-prompt-header ttw-prompt-header-blue" data-target="ttw-worldbook-content">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <span>📚</span><span style="font-weight:500;">世界书词条</span>
                                            <span class="ttw-badge ttw-badge-blue">必需</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div id="ttw-worldbook-content" class="ttw-prompt-content">
                                        <div class="ttw-setting-hint" style="margin-bottom:10px;">核心提示词。留空使用默认。</div>
                                        <div class="ttw-placeholder-hint" style="margin-bottom:10px;padding:8px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);border-radius:6px;">
                                            <span style="color:#e74c3c;font-weight:bold;">⚠️ 必须包含占位符：</span>
                                            <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px;color:#f39c12;font-family:monospace;">{DYNAMIC_JSON_TEMPLATE}</code>
                                            <div style="font-size:11px;color:#888;margin-top:4px;">此占位符会被自动替换为根据启用分类生成的JSON模板</div>
                                        </div>
                                        <textarea id="ttw-worldbook-prompt" rows="6" placeholder="留空使用默认..." class="ttw-textarea-small"></textarea>
                                        <div style="margin-top:8px;"><button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="worldbook">🔄 恢复默认</button></div>
                                    </div>
                                </div>
                                <div class="ttw-prompt-section">
                                    <div class="ttw-prompt-header ttw-prompt-header-purple" data-target="ttw-plot-content">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                                <input type="checkbox" id="ttw-enable-plot">
                                                <span>📖</span><span style="font-weight:500;">剧情大纲</span>
                                            </label>
                                            <span class="ttw-badge ttw-badge-gray">可选</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div id="ttw-plot-content" class="ttw-prompt-content">
                                        <textarea id="ttw-plot-prompt" rows="4" placeholder="留空使用默认..." class="ttw-textarea-small"></textarea>
                                        <div style="margin-top:8px;"><button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="plot">🔄 恢复默认</button></div>
                                    </div>
                                </div>
                                <div class="ttw-prompt-section">
                                    <div class="ttw-prompt-header ttw-prompt-header-green" data-target="ttw-style-content">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                                <input type="checkbox" id="ttw-enable-style">
                                                <span>🎨</span><span style="font-weight:500;">文风配置</span>
                                            </label>
                                            <span class="ttw-badge ttw-badge-gray">可选</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div id="ttw-style-content" class="ttw-prompt-content">
                                        <textarea id="ttw-style-prompt" rows="4" placeholder="留空使用默认..." class="ttw-textarea-small"></textarea>
                                        <div style="margin-top:8px;"><button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="style">🔄 恢复默认</button></div>
                                    </div>
                                </div>

                                <!-- 自定义提取分类 - 修改按钮布局 -->
                                <div class="ttw-prompt-section">
                                    <div class="ttw-prompt-header" style="background:rgba(155,89,182,0.15);" data-target="ttw-categories-content">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <span>🏷️</span><span style="font-weight:500;color:#9b59b6;">自定义提取分类</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div id="ttw-categories-content" class="ttw-prompt-content">
                                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                            <div class="ttw-setting-hint" style="font-size:11px;flex:1;">勾选要提取的分类</div>
                                            <div style="display:flex;gap:6px;">
                                                <button id="ttw-add-category" class="ttw-btn ttw-btn-small" style="background:#9b59b6;">➕ 添加</button>
                                                <button id="ttw-reset-categories" class="ttw-btn ttw-btn-small">🔄 重置</button>
                                            </div>
                                        </div>
                                        <div id="ttw-categories-list" class="ttw-categories-list"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- 文件上传 -->
                    <div class="ttw-section">
                        <div class="ttw-section-header">
                            <span>📄 文件上传</span>
                            <div style="display:flex;gap:8px;">
                                <button id="ttw-import-json" class="ttw-btn-small" title="导入已有世界书JSON进行合并">📥 合并世界书</button>
                                <button id="ttw-import-task" class="ttw-btn-small">📥 导入任务</button>
                                <button id="ttw-export-task" class="ttw-btn-small">📤 导出任务</button>
                            </div>
                        </div>
                        <div class="ttw-section-content">
                            <div class="ttw-upload-area" id="ttw-upload-area">
                                <div style="font-size:48px;margin-bottom:12px;">📁</div>
                                <div style="font-size:14px;opacity:0.8;">点击或拖拽TXT文件到此处</div>
                                <input type="file" id="ttw-file-input" accept=".txt" style="display:none;">
                            </div>
                            <div id="ttw-file-info" class="ttw-file-info">
                                <span id="ttw-file-name"></span>
                                <span id="ttw-file-size"></span>
                                <button id="ttw-clear-file" class="ttw-btn-small">清除</button>
                            </div>
                        </div>
                    </div>
                    <!-- 记忆队列 -->
                    <div class="ttw-section" id="ttw-queue-section" style="display:none;">
                        <div class="ttw-section-header">
                            <span>📋 章节队列</span>
                            <div style="display:flex;gap:8px;margin-left:auto;">
                                <button id="ttw-view-processed" class="ttw-btn-small">📊 已处理</button>
                                <button id="ttw-select-start" class="ttw-btn-small">📍 选择起始</button>
                                <button id="ttw-multi-delete-btn" class="ttw-btn-small ttw-btn-warning">🗑️ 多选删除</button>
                            </div>
                        </div>
                        <div class="ttw-section-content">
                            <div class="ttw-setting-hint" style="margin-bottom:8px;">💡 点击章节可<strong>查看/编辑/复制</strong>，支持<strong>🎲重Roll</strong></div>
                            <div id="ttw-multi-select-bar" style="display:none;margin-bottom:8px;padding:8px;background:rgba(231,76,60,0.15);border-radius:6px;border:1px solid rgba(231,76,60,0.3);">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:#e74c3c;font-weight:bold;">🗑️ 多选删除模式</span>
                                    <div style="display:flex;gap:8px;">
                                        <span id="ttw-selected-count" style="color:#888;">已选: 0</span>
                                        <button id="ttw-confirm-multi-delete" class="ttw-btn ttw-btn-small ttw-btn-warning">确认删除</button>
                                        <button id="ttw-cancel-multi-select" class="ttw-btn ttw-btn-small">取消</button>
                                    </div>
                                </div>
                            </div>
                            <div id="ttw-memory-queue" class="ttw-memory-queue"></div>
                        </div>
                    </div>
                    <!-- 进度 -->
                    <div class="ttw-section" id="ttw-progress-section" style="display:none;">
                        <div class="ttw-section-header"><span>⏳ 处理进度</span></div>
                        <div class="ttw-section-content">
                            <div class="ttw-progress-bar">
                                <div id="ttw-progress-fill" class="ttw-progress-fill"></div>
                            </div>
                            <div id="ttw-progress-text" class="ttw-progress-text">准备中...</div>
                            <div class="ttw-progress-controls">
                                <button id="ttw-stop-btn" class="ttw-btn ttw-btn-secondary">⏸️ 暂停</button>
                                <button id="ttw-repair-btn" class="ttw-btn ttw-btn-warning" style="display:none;">🔧 修复失败</button>
                                <button id="ttw-toggle-stream" class="ttw-btn ttw-btn-small">👁️ 实时输出</button>
                            </div>
                            <div id="ttw-stream-container" class="ttw-stream-container">
                                <div class="ttw-stream-header">
                                    <span>📤 实时输出</span>
                                    <button id="ttw-clear-stream" class="ttw-btn-small">清空</button>
                                </div>
                                <pre id="ttw-stream-content" class="ttw-stream-content"></pre>
                            </div>
                        </div>
                    </div>
                    <!-- 结果 -->
                    <div class="ttw-section" id="ttw-result-section" style="display:none;">
                        <div class="ttw-section-header"><span>📊 生成结果</span></div>
                        <div class="ttw-section-content">
                            <div id="ttw-result-preview" class="ttw-result-preview"></div>
                            <div class="ttw-result-actions">
                                <button id="ttw-search-btn" class="ttw-btn">🔍 查找</button>
                                <button id="ttw-replace-btn" class="ttw-btn">🔄 替换</button>
                                <button id="ttw-view-worldbook" class="ttw-btn">📖 查看世界书</button>
                                <button id="ttw-view-history" class="ttw-btn">📜 修改历史</button>
                                <button id="ttw-consolidate-entries" class="ttw-btn" title="用AI整理条目，去除重复信息">🧹 整理条目</button>
                                <button id="ttw-alias-merge" class="ttw-btn" title="识别同一角色的不同称呼并合并">🔗 别名合并</button>
                                <button id="ttw-export-json" class="ttw-btn">📥 导出JSON</button>
                                <button id="ttw-export-volumes" class="ttw-btn" style="display:none;">📦 分卷导出</button>
                                <button id="ttw-export-st" class="ttw-btn ttw-btn-primary">📥 导出SillyTavern格式</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button id="ttw-start-btn" class="ttw-btn ttw-btn-primary" disabled>🚀 开始转换</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalContainer);
        addModalStyles();
        bindModalEvents();
        loadSavedSettings();
        loadCategoryLightSettings();
        loadCustomCategories().then(() => {
            renderCategoriesList();
            renderDefaultWorldbookEntriesUI();
        });
        checkAndRestoreState();
        restoreExistingState();
    }

    function restoreExistingState() {
        if (memoryQueue.length > 0) {
            document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = currentFile ? currentFile.name : '已加载的文件';
            const totalChars = memoryQueue.reduce((sum, m) => sum + m.content.length, 0);
            document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${memoryQueue.length}章)`;

            showQueueSection(true);
            updateMemoryQueueUI();

            document.getElementById('ttw-start-btn').disabled = false;
            updateStartButtonState(false);

            if (useVolumeMode) updateVolumeIndicator();

            if (Object.keys(generatedWorldbook).length > 0) {
                showResultSection(true);
                updateWorldbookPreview();
            }
        }
    }

    function addModalStyles() {
        if (document.getElementById('ttw-styles')) return;
        const styles = document.createElement('style');
        styles.id = 'ttw-styles';
        styles.textContent = `
            .ttw-modal-container{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;}
            .ttw-modal{background:var(--SmartThemeBlurTintColor,#1e1e2e);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;width:100%;max-width:750px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:hidden;}
            .ttw-modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);background:rgba(0,0,0,0.2);}
            .ttw-modal-title{font-weight:bold;font-size:15px;color:#e67e22;}
            .ttw-header-actions{display:flex;align-items:center;gap:12px;}
            .ttw-help-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(231,76,60,0.2);color:#e74c3c;font-size:14px;cursor:pointer;transition:all 0.2s;border:1px solid rgba(231,76,60,0.4);}
            .ttw-help-btn:hover{background:rgba(231,76,60,0.4);transform:scale(1.1);}
            .ttw-modal-close{background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;width:36px;height:36px;border-radius:6px;cursor:pointer;transition:all 0.2s;}
            .ttw-modal-close:hover{background:rgba(255,100,100,0.3);color:#ff6b6b;}
            .ttw-modal-body{flex:1;overflow-y:auto;padding:16px;}
            .ttw-modal-footer{padding:16px 20px;border-top:1px solid var(--SmartThemeBorderColor,#444);background:rgba(0,0,0,0.2);display:flex;justify-content:flex-end;gap:10px;}
            .ttw-section{background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:12px;overflow:hidden;}
            .ttw-section-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(0,0,0,0.3);cursor:pointer;font-weight:bold;font-size:14px;}
            .ttw-section-content{padding:16px;}
            .ttw-collapse-icon{font-size:10px;transition:transform 0.2s;}
            .ttw-section.collapsed .ttw-collapse-icon{transform:rotate(-90deg);}
            .ttw-section.collapsed .ttw-section-content{display:none;}
            .ttw-input,.ttw-select,.ttw-textarea,.ttw-textarea-small,.ttw-input-small{background:rgba(0,0,0,0.3);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;color:#fff;font-size:13px;box-sizing:border-box;}
            .ttw-input{width:100%;padding:10px 12px;}
            .ttw-input-small{width:60px;padding:6px 8px;text-align:center;}
            .ttw-select{width:100%;padding:8px 10px;}
            .ttw-textarea{width:100%;min-height:250px;padding:12px;line-height:1.6;resize:vertical;font-family:inherit;}
            .ttw-textarea-small{width:100%;min-height:80px;padding:10px;font-family:monospace;font-size:12px;line-height:1.5;resize:vertical;}
            .ttw-input:focus,.ttw-select:focus,.ttw-textarea:focus,.ttw-textarea-small:focus{outline:none;border-color:#e67e22;}
            .ttw-label{display:block;margin-bottom:6px;font-size:12px;opacity:0.9;}
            .ttw-setting-hint{font-size:11px;color:#888;margin-top:4px;}
            .ttw-setting-card{margin-bottom:16px;padding:12px;border-radius:8px;}
            .ttw-setting-card-green{background:rgba(39,174,96,0.1);border:1px solid rgba(39,174,96,0.3);}
            .ttw-setting-card-blue{background:rgba(52,152,219,0.15);border:1px solid rgba(52,152,219,0.3);}
            .ttw-checkbox-label{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;}
            .ttw-checkbox-label input[type="checkbox"]{width:18px;height:18px;accent-color:#e67e22;flex-shrink:0;}
            .ttw-checkbox-with-hint{padding:8px 12px;background:rgba(0,0,0,0.15);border-radius:6px;}
            .ttw-checkbox-purple{background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);}
            .ttw-volume-indicator{display:none;margin-top:12px;padding:8px 12px;background:rgba(155,89,182,0.2);border-radius:6px;font-size:12px;color:#bb86fc;}
            .ttw-prompt-config{margin-top:16px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;}
            .ttw-prompt-config-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(230,126,34,0.15);border-bottom:1px solid var(--SmartThemeBorderColor,#444);font-weight:500;flex-wrap:wrap;gap:8px;}
            .ttw-prompt-section{border-bottom:1px solid var(--SmartThemeBorderColor,#333);}
            .ttw-prompt-section:last-child{border-bottom:none;}
            .ttw-prompt-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;font-size:13px;transition:background 0.2s;}
            .ttw-prompt-header:hover{filter:brightness(1.1);}
            .ttw-prompt-header-blue{background:rgba(52,152,219,0.1);}
            .ttw-prompt-header-purple{background:rgba(155,89,182,0.1);}
            .ttw-prompt-header-green{background:rgba(46,204,113,0.1);}
            .ttw-prompt-content{display:none;padding:12px 14px;background:rgba(0,0,0,0.15);}
            .ttw-badge{font-size:10px;padding:2px 6px;border-radius:10px;font-weight:500;}
            .ttw-badge-blue{background:rgba(52,152,219,0.3);color:#5dade2;}
            .ttw-badge-gray{background:rgba(149,165,166,0.3);color:#bdc3c7;}
            .ttw-upload-area{border:2px dashed var(--SmartThemeBorderColor,#555);border-radius:8px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;}
            .ttw-upload-area:hover{border-color:#e67e22;background:rgba(230,126,34,0.1);}
            .ttw-file-info{display:none;align-items:center;gap:12px;padding:12px;background:rgba(0,0,0,0.3);border-radius:6px;margin-top:12px;}
            .ttw-memory-queue{max-height:200px;overflow-y:auto;}
            .ttw-memory-item{padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:6px;font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background 0.2s;}
            .ttw-memory-item:hover{background:rgba(0,0,0,0.4);}
            .ttw-memory-item.multi-select-mode{cursor:default;}
            .ttw-memory-item.selected-for-delete{background:rgba(231,76,60,0.3);border:1px solid rgba(231,76,60,0.5);}
            .ttw-progress-bar{width:100%;height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;margin-bottom:12px;}
            .ttw-progress-fill{height:100%;background:linear-gradient(90deg,#e67e22,#f39c12);border-radius:4px;transition:width 0.3s;width:0%;}
            .ttw-progress-text{font-size:13px;text-align:center;margin-bottom:12px;}
            .ttw-progress-controls{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
            .ttw-stream-container{display:none;margin-top:12px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;overflow:hidden;}
            .ttw-stream-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.3);font-size:12px;}
            .ttw-stream-content{max-height:200px;overflow-y:auto;padding:12px;background:rgba(0,0,0,0.2);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:0;font-family:monospace;}
            .ttw-result-preview{max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:6px;padding:12px;margin-bottom:12px;font-size:12px;}
            .ttw-result-actions{display:flex;flex-wrap:wrap;gap:10px;}
            .ttw-btn{padding:10px 16px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;font-size:13px;cursor:pointer;transition:all 0.2s;}
            .ttw-btn:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn:disabled{opacity:0.5;cursor:not-allowed;}
            .ttw-btn-primary{background:linear-gradient(135deg,#e67e22,#d35400);border-color:#e67e22;}
            .ttw-btn-primary:hover{background:linear-gradient(135deg,#f39c12,#e67e22);}
            .ttw-btn-secondary{background:rgba(108,117,125,0.5);}
            .ttw-btn-warning{background:rgba(255,107,53,0.5);border-color:#ff6b35;}
            .ttw-btn-small{padding:6px 12px;font-size:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;transition:all 0.2s;}
            .ttw-btn-small:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn-tiny{padding:3px 6px;font-size:11px;border:none;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;border-radius:3px;}
            .ttw-btn-tiny:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn-tiny:disabled{opacity:0.3;cursor:not-allowed;}
            .ttw-categories-list{max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;}
            .ttw-category-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:4px;}
            .ttw-category-item input[type="checkbox"]{width:16px;height:16px;accent-color:#9b59b6;}
            .ttw-category-name{flex:1;font-size:12px;}
            .ttw-category-actions{display:flex;gap:4px;}
            .ttw-default-entries-list{max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;}
            .ttw-default-entry-item{padding:8px 10px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:6px;border-left:3px solid #27ae60;}
            .ttw-default-entry-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
            .ttw-default-entry-title{font-size:12px;font-weight:bold;color:#27ae60;}
            .ttw-default-entry-actions{display:flex;gap:4px;}
            .ttw-default-entry-info{font-size:11px;color:#888;}
            .ttw-form-group{margin-bottom:12px;}
            .ttw-form-group>label{display:block;margin-bottom:6px;font-size:12px;color:#ccc;}
            .ttw-merge-option{display:flex;align-items:center;gap:8px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;cursor:pointer;}
            .ttw-merge-option input{width:18px;height:18px;}
            .ttw-roll-history-container{display:flex;gap:10px;height:400px;}
            .ttw-roll-history-left{width:100px;min-width:100px;max-width:100px;display:flex;flex-direction:column;gap:8px;overflow:hidden;}
            .ttw-roll-history-right{flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;}
            .ttw-roll-reroll-btn{width:100%;padding:8px 4px !important;font-size:11px !important;}
            .ttw-roll-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
            .ttw-roll-item{padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;cursor:pointer;border-left:2px solid #9b59b6;transition:all 0.2s;}
            .ttw-roll-item:hover,.ttw-roll-item.active{background:rgba(0,0,0,0.4);}
            .ttw-roll-item.selected{border-left-color:#27ae60;background:rgba(39,174,96,0.15);}
            .ttw-roll-item-header{display:flex;justify-content:space-between;align-items:center;gap:4px;}
            .ttw-roll-item-title{font-size:11px;font-weight:bold;color:#e67e22;white-space:nowrap;}
            .ttw-roll-item-time{font-size:9px;color:#888;white-space:nowrap;}
            .ttw-roll-item-info{font-size:9px;color:#aaa;margin-top:2px;}
            .ttw-roll-detail-header{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #444;}
            .ttw-roll-detail-header h4{color:#e67e22;margin:0 0 6px 0;font-size:14px;}
            .ttw-roll-detail-time{font-size:11px;color:#888;margin-bottom:8px;}
            .ttw-roll-detail-content{white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;max-height:280px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;}
            .ttw-light-toggle{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;transition:all 0.2s;border:none;margin-left:8px;}
            .ttw-light-toggle.blue{background:rgba(52,152,219,0.3);color:#3498db;}
            .ttw-light-toggle.blue:hover{background:rgba(52,152,219,0.5);}
            .ttw-light-toggle.green{background:rgba(39,174,96,0.3);color:#27ae60;}
            .ttw-light-toggle.green:hover{background:rgba(39,174,96,0.5);}
            .ttw-config-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.2s;border:none;margin-left:4px;background:rgba(155,89,182,0.3);color:#9b59b6;}
            .ttw-config-btn:hover{background:rgba(155,89,182,0.5);}
            .ttw-history-container{display:flex;gap:10px;height:400px;}
            .ttw-history-left{width:100px;min-width:100px;max-width:100px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
            .ttw-history-right{flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;}
            .ttw-history-item{padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;cursor:pointer;border-left:2px solid #9b59b6;transition:all 0.2s;}
            .ttw-history-item:hover,.ttw-history-item.active{background:rgba(0,0,0,0.4);}
            .ttw-history-item-title{font-size:10px;font-weight:bold;color:#e67e22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .ttw-history-item-time{font-size:9px;color:#888;}
            .ttw-history-item-info{font-size:9px;color:#aaa;}
            .ttw-model-actions{display:flex;gap:10px;align-items:center;margin-top:12px;padding:10px;background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.3);border-radius:6px;}
            .ttw-model-status{font-size:12px;margin-left:auto;}
            .ttw-model-status.success{color:#27ae60;}
            .ttw-model-status.error{color:#e74c3c;}
            .ttw-model-status.loading{color:#f39c12;}
            .ttw-setting-item{margin-bottom:12px;}
            .ttw-setting-item>label{display:block;margin-bottom:6px;font-size:12px;opacity:0.9;}
            .ttw-setting-item input,.ttw-setting-item select{width:100%;padding:10px 12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:13px;box-sizing:border-box;}
            .ttw-setting-item select option{background:#2a2a2a;}
            .ttw-placeholder-hint code{user-select:all;}
            .ttw-consolidate-category-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(0,0,0,0.15);border-radius:6px;margin-bottom:6px;cursor:pointer;}
            .ttw-consolidate-category-item input{width:18px;height:18px;accent-color:#3498db;}
            @media (max-width: 768px) {
                .ttw-roll-history-container,.ttw-history-container{flex-direction:column;height:auto;}
                .ttw-roll-history-left,.ttw-history-left{width:100%;max-width:100%;flex-direction:row;flex-wrap:wrap;height:auto;max-height:120px;}
                .ttw-roll-reroll-btn{width:auto;flex-shrink:0;}
                .ttw-roll-list{flex-direction:row;flex-wrap:wrap;gap:4px;}
                .ttw-roll-item,.ttw-history-item{flex:0 0 auto;padding:4px 8px;}
                .ttw-roll-history-right,.ttw-history-right{min-height:250px;}
                .ttw-processed-results-container{flex-direction:column !important;height:auto !important;}
                .ttw-processed-results-left{width:100% !important;max-width:100% !important;max-height:150px !important;flex-direction:row !important;flex-wrap:wrap !important;}
            }
        `;
        document.head.appendChild(styles);
    }

    function bindModalEvents() {
        const modal = modalContainer.querySelector('.ttw-modal');
        modal.addEventListener('click', (e) => e.stopPropagation());
        modal.addEventListener('mousedown', (e) => e.stopPropagation());

        modalContainer.querySelector('.ttw-modal-close').addEventListener('click', closeModal);
        modalContainer.querySelector('.ttw-help-btn').addEventListener('click', showHelpModal);
        modalContainer.addEventListener('click', (e) => { if (e.target === modalContainer) closeModal(); });
        document.addEventListener('keydown', handleEscKey, true);

        document.getElementById('ttw-use-tavern-api').addEventListener('change', () => {
            handleUseTavernApiChange();
            saveCurrentSettings();
        });

        document.getElementById('ttw-api-provider').addEventListener('change', () => {
            handleProviderChange();
            saveCurrentSettings();
        });

        ['ttw-api-key', 'ttw-api-endpoint', 'ttw-api-model'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', saveCurrentSettings);
        });

        document.getElementById('ttw-model-select').addEventListener('change', (e) => {
            if (e.target.value) {
                document.getElementById('ttw-api-model').value = e.target.value;
                saveCurrentSettings();
            }
        });

        document.getElementById('ttw-fetch-models').addEventListener('click', handleFetchModels);
        document.getElementById('ttw-quick-test').addEventListener('click', handleQuickTest);

        ['ttw-chunk-size', 'ttw-api-timeout'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', saveCurrentSettings);
        });
        ['ttw-incremental-mode', 'ttw-volume-mode', 'ttw-enable-plot', 'ttw-enable-style', 'ttw-force-chapter-marker'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', saveCurrentSettings);
        });
        document.getElementById('ttw-parallel-enabled').addEventListener('change', (e) => { parallelConfig.enabled = e.target.checked; saveCurrentSettings(); });
        document.getElementById('ttw-parallel-concurrency').addEventListener('change', (e) => { parallelConfig.concurrency = Math.max(1, Math.min(10, parseInt(e.target.value) || 3)); e.target.value = parallelConfig.concurrency; saveCurrentSettings(); });
        document.getElementById('ttw-parallel-mode').addEventListener('change', (e) => { parallelConfig.mode = e.target.value; saveCurrentSettings(); });
        document.getElementById('ttw-volume-mode').addEventListener('change', (e) => { useVolumeMode = e.target.checked; const indicator = document.getElementById('ttw-volume-indicator'); if (indicator) indicator.style.display = useVolumeMode ? 'block' : 'none'; });

        document.getElementById('ttw-rechunk-btn').addEventListener('click', rechunkMemories);

        document.getElementById('ttw-add-category').addEventListener('click', showAddCategoryModal);
        document.getElementById('ttw-reset-categories').addEventListener('click', async () => {
            if (confirm('确定重置为默认分类配置吗？这将清除所有自定义分类。')) {
                await resetToDefaultCategories();
                renderCategoriesList();
            }
        });

        // 默认世界书条目UI事件
        document.getElementById('ttw-add-default-entry').addEventListener('click', showAddDefaultEntryModal);
        document.getElementById('ttw-apply-default-entries').addEventListener('click', () => {
            saveDefaultWorldbookEntriesUI();
            const applied = applyDefaultWorldbookEntries();
            if (applied) {
                showResultSection(true);
                updateWorldbookPreview();
                Services.UI.showToast('默认世界书条目已应用！', 'success');
            } else {
                alert('没有默认世界书条目');
            }
        });

        const categoriesHeader = document.querySelector('[data-target="ttw-categories-content"]');
        if (categoriesHeader) {
            categoriesHeader.addEventListener('click', () => {
                const content = document.getElementById('ttw-categories-content');
                const icon = categoriesHeader.querySelector('.ttw-collapse-icon');
                if (content.style.display === 'none' || !content.style.display) {
                    content.style.display = 'block';
                    icon.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '▶';
                }
            });
        }

        document.getElementById('ttw-chapter-regex').addEventListener('change', (e) => {
            chapterRegexSettings.pattern = e.target.value;
            saveCurrentSettings();
        });

        document.querySelectorAll('.ttw-chapter-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const regex = btn.dataset.regex;
                document.getElementById('ttw-chapter-regex').value = regex;
                chapterRegexSettings.pattern = regex;
                saveCurrentSettings();
            });
        });

        document.getElementById('ttw-test-chapter-regex').addEventListener('click', testChapterRegex);

        const defaultEntriesHeader = document.querySelector('[data-target="ttw-default-entries-content"]');
        if (defaultEntriesHeader) {
            defaultEntriesHeader.addEventListener('click', () => {
                const content = document.getElementById('ttw-default-entries-content');
                const icon = defaultEntriesHeader.querySelector('.ttw-collapse-icon');
                if (content.style.display === 'none' || !content.style.display) { content.style.display = 'block'; icon.textContent = '▼'; }
                else { content.style.display = 'none'; icon.textContent = '▶'; }
            });
        }

        document.querySelectorAll('.ttw-prompt-header[data-target]').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const targetId = header.getAttribute('data-target');
                if (targetId === 'ttw-default-entries-content' || targetId === 'ttw-categories-content') return;
                const content = document.getElementById(targetId);
                const icon = header.querySelector('.ttw-collapse-icon');
                if (content.style.display === 'none' || !content.style.display) { content.style.display = 'block'; icon.textContent = '▼'; }
                else { content.style.display = 'none'; icon.textContent = '▶'; }
            });
        });

        ['ttw-worldbook-prompt', 'ttw-plot-prompt', 'ttw-style-prompt'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', saveCurrentSettings);
        });

        document.querySelectorAll('.ttw-reset-prompt').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                const textarea = document.getElementById(`ttw-${type}-prompt`);
                if (textarea) { textarea.value = ''; saveCurrentSettings(); }
            });
        });

        document.getElementById('ttw-preview-prompt').addEventListener('click', showPromptPreview);
        document.getElementById('ttw-import-json').addEventListener('click', importAndMergeWorldbook);
        document.getElementById('ttw-import-task').addEventListener('click', importTaskState);
        document.getElementById('ttw-export-task').addEventListener('click', exportTaskState);

        document.getElementById('ttw-export-settings').addEventListener('click', exportSettings);
        document.getElementById('ttw-import-settings').addEventListener('click', importSettings);

        const uploadArea = document.getElementById('ttw-upload-area');
        const fileInput = document.getElementById('ttw-file-input');
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#e67e22'; uploadArea.style.background = 'rgba(230,126,34,0.1)'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#555'; uploadArea.style.background = 'transparent'; });
        uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#555'; uploadArea.style.background = 'transparent'; if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]); });
        fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFileSelect(e.target.files[0]); });

        document.getElementById('ttw-clear-file').addEventListener('click', clearFile);
        document.getElementById('ttw-start-btn').addEventListener('click', startConversion);
        document.getElementById('ttw-stop-btn').addEventListener('click', stopProcessing);
        document.getElementById('ttw-repair-btn').addEventListener('click', startRepairFailedMemories);
        document.getElementById('ttw-select-start').addEventListener('click', showStartFromSelector);
        document.getElementById('ttw-view-processed').addEventListener('click', showProcessedResults);

        document.getElementById('ttw-multi-delete-btn').addEventListener('click', toggleMultiSelectMode);
        document.getElementById('ttw-confirm-multi-delete').addEventListener('click', deleteSelectedMemories);
        document.getElementById('ttw-cancel-multi-select').addEventListener('click', () => {
            isMultiSelectMode = false;
            selectedMemoryIndices.clear();
            updateMemoryQueueUI();
        });

        document.getElementById('ttw-toggle-stream').addEventListener('click', () => { const container = document.getElementById('ttw-stream-container'); container.style.display = container.style.display === 'none' ? 'block' : 'none'; });
        document.getElementById('ttw-clear-stream').addEventListener('click', () => updateStreamContent('', true));

        // 新增：查找和替换按钮
        document.getElementById('ttw-search-btn').addEventListener('click', showSearchModal);
        document.getElementById('ttw-replace-btn').addEventListener('click', showReplaceModal);

        document.getElementById('ttw-view-worldbook').addEventListener('click', showWorldbookView);
        document.getElementById('ttw-view-history').addEventListener('click', showHistoryView);
        document.getElementById('ttw-consolidate-entries').addEventListener('click', showConsolidateCategorySelector);
        document.getElementById('ttw-alias-merge').addEventListener('click', showAliasMergeUI);

        // 【新增】实体关系图按钮
        const graphBtn = document.createElement('button');
        graphBtn.className = 'ttw-btn';
        graphBtn.innerHTML = '🕸️ 实体关系图';
        graphBtn.style.marginRight = '8px';
        graphBtn.style.background = '#8e44ad';
        graphBtn.addEventListener('click', showKnowledgeGraph);
        // Insert after alias merge
        document.getElementById('ttw-alias-merge').after(graphBtn);

        document.getElementById('ttw-export-json').addEventListener('click', exportWorldbook);
        document.getElementById('ttw-export-volumes').addEventListener('click', exportVolumes);
        document.getElementById('ttw-export-st').addEventListener('click', exportToSillyTavern);
        document.querySelector('[data-section="settings"]').addEventListener('click', () => { document.querySelector('.ttw-settings-section').classList.toggle('collapsed'); });
    }

    function toggleMultiSelectMode() {
        isMultiSelectMode = !isMultiSelectMode;
        selectedMemoryIndices.clear();

        const multiSelectBar = document.getElementById('ttw-multi-select-bar');
        if (multiSelectBar) {
            multiSelectBar.style.display = isMultiSelectMode ? 'block' : 'none';
        }

        updateMemoryQueueUI();
    }

    function handleEscKey(e) {
        if (e.key === 'Escape' && modalContainer) { e.stopPropagation(); e.preventDefault(); closeModal(); }
    }

    function saveCurrentSettings() {
        settings.chunkSize = parseInt(document.getElementById('ttw-chunk-size')?.value) || CONSTANTS.DEFAULT_CHUNK_SIZE;
        settings.apiTimeout = (parseInt(document.getElementById('ttw-api-timeout')?.value) || 120) * 1000;
        incrementalOutputMode = document.getElementById('ttw-incremental-mode')?.checked ?? true;
        useVolumeMode = document.getElementById('ttw-volume-mode')?.checked ?? false;
        settings.useVolumeMode = useVolumeMode;
        settings.enablePlotOutline = document.getElementById('ttw-enable-plot')?.checked ?? false;
        settings.enableLiteraryStyle = document.getElementById('ttw-enable-style')?.checked ?? false;
        settings.customWorldbookPrompt = document.getElementById('ttw-worldbook-prompt')?.value || '';
        settings.customPlotPrompt = document.getElementById('ttw-plot-prompt')?.value || '';
        settings.customStylePrompt = document.getElementById('ttw-style-prompt')?.value || '';
        settings.useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        settings.parallelEnabled = parallelConfig.enabled;
        settings.parallelConcurrency = parallelConfig.concurrency;
        settings.parallelMode = parallelConfig.mode;
        settings.categoryLightSettings = { ...categoryLightSettings };
        settings.forceChapterMarker = document.getElementById('ttw-force-chapter-marker')?.checked ?? true;
        settings.chapterRegexPattern = document.getElementById('ttw-chapter-regex')?.value || chapterRegexSettings.pattern;
        settings.defaultWorldbookEntriesUI = defaultWorldbookEntriesUI;
        settings.categoryDefaultConfig = categoryDefaultConfig;
        settings.entryPositionConfig = entryPositionConfig;

        settings.customApiProvider = document.getElementById('ttw-api-provider')?.value || 'gemini';
        settings.customApiKey = document.getElementById('ttw-api-key')?.value || '';
        settings.customApiEndpoint = document.getElementById('ttw-api-endpoint')?.value || '';

        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelInput = document.getElementById('ttw-api-model');
        if (modelSelectContainer && modelSelectContainer.style.display !== 'none' && modelSelect?.value) {
            settings.customApiModel = modelSelect.value;
            if (modelInput) modelInput.value = modelSelect.value;
        } else {
            settings.customApiModel = modelInput?.value || 'gemini-2.5-flash';
        }

        try { localStorage.setItem('txtToWorldbookSettings', JSON.stringify(settings)); } catch (e) { }
    }

    function loadSavedSettings() {
        try {
            const saved = localStorage.getItem('txtToWorldbookSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                settings = { ...defaultSettings, ...parsed };
                useVolumeMode = settings.useVolumeMode || false;
                parallelConfig.enabled = settings.parallelEnabled !== undefined ? settings.parallelEnabled : true;
                parallelConfig.concurrency = settings.parallelConcurrency || 3;
                parallelConfig.mode = settings.parallelMode || 'independent';
                if (settings.chapterRegexPattern) {
                    chapterRegexSettings.pattern = settings.chapterRegexPattern;
                }
                if (settings.defaultWorldbookEntriesUI) {
                    defaultWorldbookEntriesUI = settings.defaultWorldbookEntriesUI;
                }
                if (settings.categoryDefaultConfig) {
                    categoryDefaultConfig = settings.categoryDefaultConfig;
                }
                if (settings.entryPositionConfig) {
                    entryPositionConfig = settings.entryPositionConfig;
                }
            }
        } catch (e) { }

        updateSettingsUI();
        updateChapterRegexUI();
    }

    function showPromptPreview() {
        const prompt = getSystemPrompt();

        // 构建状态信息
        const statusItems = [
            `📚 世界书词条: ${settings.customWorldbookPrompt?.trim() ? '自定义' : '默认'}`,
            `📖 剧情大纲: ${settings.enablePlotOutline ? (settings.customPlotPrompt?.trim() ? '✅ 启用 (自定义)' : '✅ 启用 (默认)') : '❌ 禁用'}`,
            `🎨 文风配置: ${settings.enableLiteraryStyle ? (settings.customStylePrompt?.trim() ? '✅ 启用 (自定义)' : '✅ 启用 (默认)') : '❌ 禁用'}`
        ];

        const contentHtml = `
            <div style="max-height: 70vh; overflow-y: auto;">
                <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px; background: rgba(0,0,0,0.15); border-radius: 6px; font-size: 12px;">
                    ${statusItems.map(item => `<span style="padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">${item}</span>`).join('')}
                </div>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-size: 12px; line-height: 1.5; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; max-height: 50vh; overflow-y: auto;">${prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        `;

        const footerHtml = `<button class="ttw-btn ttw-btn-primary ttw-close-preview">关闭</button>`;

        const modal = Services.UI.createModal('ttw-prompt-preview-modal', '👁️ 最终提示词预览', contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '800px';

        modal.querySelector('.ttw-close-preview').addEventListener('click', () => modal.remove());
    }

    async function checkAndRestoreState() {
        try {
            const savedState = await MemoryHistoryDB.loadState();
            if (savedState && savedState.memoryQueue && savedState.memoryQueue.length > 0) {
                const processedCount = savedState.memoryQueue.filter(m => m.processed).length;
                if (confirm(`检测到未完成任务\n已处理: ${processedCount}/${savedState.memoryQueue.length}\n\n是否恢复？`)) {
                    memoryQueue = savedState.memoryQueue;
                    generatedWorldbook = savedState.generatedWorldbook || {};
                    worldbookVolumes = savedState.worldbookVolumes || [];
                    currentVolumeIndex = savedState.currentVolumeIndex || 0;
                    currentFileHash = savedState.fileHash;

                    if (Object.keys(generatedWorldbook).length === 0) {
                        rebuildWorldbookFromMemories();
                    }

                    startFromIndex = memoryQueue.findIndex(m => !m.processed || m.failed);
                    if (startFromIndex === -1) startFromIndex = memoryQueue.length;
                    userSelectedStartIndex = null;
                    showQueueSection(true);
                    updateMemoryQueueUI();
                    if (useVolumeMode) updateVolumeIndicator();
                    if (startFromIndex >= memoryQueue.length || Object.keys(generatedWorldbook).length > 0) {
                        showResultSection(true);
                        updateWorldbookPreview();
                    }
                    updateStartButtonState(false);
                    updateSettingsUI();
                    document.getElementById('ttw-start-btn').disabled = false;

                    document.getElementById('ttw-upload-area').style.display = 'none';
                    document.getElementById('ttw-file-info').style.display = 'flex';
                    document.getElementById('ttw-file-name').textContent = '已恢复的任务';
                    const totalChars = memoryQueue.reduce((sum, m) => sum + m.content.length, 0);
                    document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${memoryQueue.length}章)`;
                } else {
                    await MemoryHistoryDB.clearState();
                }
            }
        } catch (e) {
            console.error('恢复状态失败:', e);
        }
    }

    async function handleFileSelect(file) {
        if (!file.name.endsWith('.txt')) { alert('请选择TXT文件'); return; }
        try {
            const { encoding, content } = await detectBestEncoding(file);
            currentFile = file;
            const newHash = await calculateFileHash(content);
            const savedHash = await MemoryHistoryDB.getSavedFileHash();
            if (savedHash && savedHash !== newHash) {
                const historyList = await MemoryHistoryDB.getAllHistory();
                if (historyList.length > 0 && confirm(`检测到新文件，是否清空旧历史？\n当前有 ${historyList.length} 条记录。`)) {
                    await MemoryHistoryDB.clearAllHistory();
                    await MemoryHistoryDB.clearAllRolls();
                    await MemoryHistoryDB.clearState();
                }
            }
            currentFileHash = newHash;
            await MemoryHistoryDB.saveFileHash(newHash);
            document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = file.name;
            document.getElementById('ttw-file-size').textContent = `(${(content.length / 1024).toFixed(1)} KB, ${encoding})`;
            splitContentIntoMemory(content);
            showQueueSection(true);
            updateMemoryQueueUI();
            document.getElementById('ttw-start-btn').disabled = false;
            startFromIndex = 0;
            userSelectedStartIndex = null;

            generatedWorldbook = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
            applyDefaultWorldbookEntries();
            if (Object.keys(generatedWorldbook).length > 0) {
                showResultSection(true);
                updateWorldbookPreview();
            }

            updateStartButtonState(false);
        } catch (error) {
            alert('文件处理失败: ' + error.message);
        }
    }

    async function splitContentIntoMemory(content) {
        if (WorkerService.isReady()) {
            try {
                const chunks = await WorkerService.splitContent(content, chapterRegexSettings.pattern, settings.chunkSize);
                memoryQueue = chunks.map((c, i) => ({
                    title: `记忆${i + 1}`,
                    content: c.content,
                    processed: false,
                    failed: false,
                    processing: false
                }));
                // Update store
                appStore.setState({ memoryQueue });
                return;
            } catch (e) {
                console.error('Worker split failed, fallback to main thread:', e);
            }
        }

        // Fallback to main thread logic
        const chunkSize = settings.chunkSize;
        const minChunkSize = Math.max(chunkSize * 0.3, 5000);
        memoryQueue = [];

        const chapterRegex = new RegExp(chapterRegexSettings.pattern, 'g');
        const matches = [...content.matchAll(chapterRegex)];

        if (matches.length > 0) {
            const chapters = [];

            for (let i = 0; i < matches.length; i++) {
                const startIndex = matches[i].index;
                const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
                let chapterContent = content.slice(startIndex, endIndex);

                if (i === 0 && startIndex > 0) {
                    const preContent = content.slice(0, startIndex);
                    chapterContent = preContent + chapterContent;
                }

                chapters.push({ title: matches[i][0], content: chapterContent });
            }

            const mergedChapters = [];
            let pendingChapter = null;

            for (const chapter of chapters) {
                if (pendingChapter) {
                    if (pendingChapter.content.length + chapter.content.length <= chunkSize) {
                        pendingChapter.content += chapter.content;
                        pendingChapter.title += '+' + chapter.title;
                    } else {
                        if (pendingChapter.content.length >= minChunkSize) {
                            mergedChapters.push(pendingChapter);
                            pendingChapter = chapter;
                        } else {
                            pendingChapter.content += chapter.content;
                            pendingChapter.title += '+' + chapter.title;
                        }
                    }
                } else {
                    pendingChapter = { ...chapter };
                }
            }
            if (pendingChapter) {
                mergedChapters.push(pendingChapter);
            }

            let currentChunk = '';
            let chunkIndex = 1;

            for (let i = 0; i < mergedChapters.length; i++) {
                const chapter = mergedChapters[i];

                if (chapter.content.length > chunkSize) {
                    if (currentChunk.length > 0) {
                        memoryQueue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                        currentChunk = '';
                        chunkIndex++;
                    }

                    let remaining = chapter.content;
                    while (remaining.length > 0) {
                        let endPos = Math.min(chunkSize, remaining.length);
                        if (endPos < remaining.length) {
                            const pb = remaining.lastIndexOf('\n\n', endPos);
                            if (pb > endPos * 0.5) endPos = pb + 2;
                            else {
                                const sb = remaining.lastIndexOf('。', endPos);
                                if (sb > endPos * 0.5) endPos = sb + 1;
                            }
                        }
                        memoryQueue.push({ title: `记忆${chunkIndex}`, content: remaining.slice(0, endPos), processed: false, failed: false, processing: false });
                        remaining = remaining.slice(endPos);
                        chunkIndex++;
                    }
                    continue;
                }

                if (currentChunk.length + chapter.content.length > chunkSize && currentChunk.length > 0) {
                    memoryQueue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                    currentChunk = '';
                    chunkIndex++;
                }
                currentChunk += chapter.content;
            }

            if (currentChunk.length > 0) {
                if (currentChunk.length < minChunkSize && memoryQueue.length > 0) {
                    const lastMemory = memoryQueue[memoryQueue.length - 1];
                    if (lastMemory.content.length + currentChunk.length <= chunkSize * 1.2) {
                        lastMemory.content += currentChunk;
                    } else {
                        memoryQueue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                    }
                } else {
                    memoryQueue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                }
            }
        } else {
            let i = 0, chunkIndex = 1;
            while (i < content.length) {
                let endIndex = Math.min(i + chunkSize, content.length);
                if (endIndex < content.length) {
                    const pb = content.lastIndexOf('\n\n', endIndex);
                    if (pb > i + chunkSize * 0.5) endIndex = pb + 2;
                    else {
                        const sb = content.lastIndexOf('。', endIndex);
                        if (sb > i + chunkSize * 0.5) endIndex = sb + 1;
                    }
                }
                memoryQueue.push({ title: `记忆${chunkIndex}`, content: content.slice(i, endIndex), processed: false, failed: false, processing: false });
                i = endIndex;
                chunkIndex++;
            }
        }

        for (let i = memoryQueue.length - 1; i > 0; i--) {
            if (memoryQueue[i].content.length < minChunkSize) {
                const prevMemory = memoryQueue[i - 1];
                if (prevMemory.content.length + memoryQueue[i].content.length <= chunkSize * 1.2) {
                    prevMemory.content += memoryQueue[i].content;
                    memoryQueue.splice(i, 1);
                }
            }
        }

        memoryQueue.forEach((memory, index) => { memory.title = `记忆${index + 1}`; });
        appStore.setState({ memoryQueue });
    }

    // ========== Virtual Scroll Implementation ==========
    function updateMemoryQueueUI() {
        const container = document.getElementById('ttw-memory-queue');
        if (!container) return;

        // --- Virtual Scroll Setup ---
        // If not already set up, initialize virtual scroll container structure
        if (!container.querySelector('.ttw-vs-spacer')) {
            container.innerHTML = `
                <div class="ttw-vs-spacer" style="height: 0px;"></div>
                <div class="ttw-vs-content" style="position: relative; top: 0;"></div>
            `;
            container.style.overflowY = 'auto';
            container.style.position = 'relative';

            // Attach scroll listener
            container.addEventListener('scroll', () => renderVirtualItems(container));

            // Initial render
            setTimeout(() => renderVirtualItems(container), 0);
        }

        // Trigger render
        renderVirtualItems(container);

        // Update other UI elements
        const multiSelectBar = document.getElementById('ttw-multi-select-bar');
        if (multiSelectBar) multiSelectBar.style.display = isMultiSelectMode ? 'block' : 'none';

        const selectedCountEl = document.getElementById('ttw-selected-count');
        if (selectedCountEl) selectedCountEl.textContent = `已选: ${selectedMemoryIndices.size}`;
    }

    function renderVirtualItems(container) {
        const spacer = container.querySelector('.ttw-vs-spacer');
        const content = container.querySelector('.ttw-vs-content');
        if (!spacer || !content) return;

        const ITEM_HEIGHT = 42; // Approximation, adjust based on CSS
        const totalItems = memoryQueue.length;
        const containerHeight = container.clientHeight || 400;
        const scrollTop = container.scrollTop;

        // Calculate range
        const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 5);
        const endIndex = Math.min(totalItems, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + 5);

        // Update spacer height
        spacer.style.height = `${totalItems * ITEM_HEIGHT}px`;

        // Update content position
        content.style.transform = `translateY(${startIndex * ITEM_HEIGHT}px)`;

        // Render items
        let html = '';
        for (let index = startIndex; index < endIndex; index++) {
            const memory = memoryQueue[index];
            const isSelected = selectedMemoryIndices.has(index);

            let itemClass = 'ttw-memory-item';
            let itemStyle = `height: ${ITEM_HEIGHT - 6}px;`; // -6 for margin/padding adjustment

            if (isMultiSelectMode) {
                itemClass += ' multi-select-mode';
                if (isSelected) itemClass += ' selected-for-delete';
            }

            if (memory.processing) {
                itemStyle += 'border-left: 3px solid #3498db; background: rgba(52,152,219,0.15);';
            } else if (memory.processed && !memory.failed) {
                itemStyle += 'opacity: 0.6;';
            } else if (memory.failed) {
                itemStyle += 'border-left: 3px solid #e74c3c;';
            }

            let statusIcon = '⏳';
            if (memory.processing) statusIcon = '🔄';
            else if (memory.processed && !memory.failed) statusIcon = '✅';
            else if (memory.failed) statusIcon = '❗';

            html += `<div class="${itemClass}" style="${itemStyle}" data-index="${index}">`;

            if (isMultiSelectMode) {
                html += `
                    <input type="checkbox" class="ttw-memory-checkbox" ${isSelected ? 'checked' : ''} style="width:16px;height:16px;accent-color:#e74c3c;margin-right:8px;">
                    <span style="margin-right:8px;">${statusIcon}</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">第${index + 1}章</span>
                    <small style="font-size:11px;color:#888;">${(memory.content.length / 1000).toFixed(1)}k</small>
                    ${memory.failed ? `<small style="color:#e74c3c;font-size:11px;margin-left:4px;">错误</small>` : ''}
                `;
            } else {
                html += `
                    <span style="margin-right:8px;">${statusIcon}</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">第${index + 1}章</span>
                    <small style="font-size:11px;color:#888;">${(memory.content.length / 1000).toFixed(1)}k</small>
                    ${memory.failed ? `<small style="color:#e74c3c;font-size:11px;margin-left:4px;">错误</small>` : ''}
                `;
            }
            html += `</div>`;
        }
        content.innerHTML = html;

        // Re-attach events (delegation would be better but keeping simple for now)
        content.querySelectorAll('.ttw-memory-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            if (isMultiSelectMode) {
                const checkbox = item.querySelector('.ttw-memory-checkbox');
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (e.target.checked) {
                        selectedMemoryIndices.add(index);
                        item.classList.add('selected-for-delete');
                    } else {
                        selectedMemoryIndices.delete(index);
                        item.classList.remove('selected-for-delete');
                    }
                    const countEl = document.getElementById('ttw-selected-count');
                    if (countEl) countEl.textContent = `已选: ${selectedMemoryIndices.size}`;
                });
                item.addEventListener('click', (e) => {
                    if (e.target.type !== 'checkbox') {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                });
            } else {
                item.addEventListener('click', () => showMemoryContentModal(index));
            }
        });
    }

    function updateWorldbookPreview() {
        const container = document.getElementById('ttw-result-preview');
        const worldbookToShow = useVolumeMode ? getAllVolumesWorldbook() : generatedWorldbook;
        let headerInfo = '';
        if (useVolumeMode && worldbookVolumes.length > 0) {
            headerInfo = `<div style="margin-bottom:12px;padding:10px;background:rgba(155,89,182,0.2);border-radius:6px;font-size:12px;color:#bb86fc;">📦 分卷模式 | 共 ${worldbookVolumes.length} 卷</div>`;
        }
        container.innerHTML = headerInfo + formatWorldbookAsCards(worldbookToShow);
        bindLightToggleEvents(container);
        bindConfigButtonEvents(container);
    }

    function formatWorldbookAsCards(worldbook) {
        if (!worldbook || Object.keys(worldbook).length === 0) {
            return '<div style="text-align:center;color:#888;padding:20px;">暂无世界书数据</div>';
        }
        let html = '';
        let totalEntries = 0;
        for (const category in worldbook) {
            const entries = worldbook[category];
            const entryCount = typeof entries === 'object' ? Object.keys(entries).length : 0;
            if (entryCount === 0) continue;
            totalEntries += entryCount;

            const isGreen = getCategoryLightState(category);
            const lightClass = isGreen ? 'green' : 'blue';
            const lightIcon = isGreen ? '🟢' : '🔵';
            const lightTitle = isGreen ? '绿灯(触发式) - 点击切换为蓝灯' : '蓝灯(常驻) - 点击切换为绿灯';

            html += `<div style="margin-bottom:12px;border:1px solid #e67e22;border-radius:8px;overflow:hidden;">
                <div style="background:linear-gradient(135deg,#e67e22,#d35400);padding:10px 14px;cursor:pointer;font-weight:bold;display:flex;justify-content:space-between;align-items:center;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                    <span style="display:flex;align-items:center;">📁 ${category}<button class="ttw-light-toggle ${lightClass}" data-category="${category}" title="${lightTitle}" onclick="event.stopPropagation();">${lightIcon}</button><button class="ttw-config-btn" data-category="${category}" title="配置分类默认位置/深度" onclick="event.stopPropagation();">⚙️</button></span>
                    <span style="font-size:12px;">${entryCount} 条目</span>
                </div>
                <div style="background:#2d2d2d;display:none;">`;
            for (const entryName in entries) {
                const entry = entries[entryName];
                const config = getEntryConfig(category, entryName);
                html += `<div style="margin:8px;border:1px solid #555;border-radius:6px;overflow:hidden;">
                    <div style="background:#3a3a3a;padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;border-left:3px solid #3498db;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                        <span style="display:flex;align-items:center;gap:6px;">📄 ${entryName}<button class="ttw-entry-config-btn ttw-config-btn" data-category="${category}" data-entry="${entryName}" title="配置位置/深度/顺序" onclick="event.stopPropagation();">⚙️</button></span>
                        <span style="font-size:10px;color:#888;">${getPositionDisplayName(config.position)} | 深度${config.depth} | 顺序${config.order}</span>
                    </div>
                    <div style="display:none;background:#1c1c1c;padding:12px;">`;
                if (entry && typeof entry === 'object') {
                    if (entry['关键词']) {
                        const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
                        html += `<div style="margin-bottom:8px;padding:8px;background:#252525;border-left:3px solid #9b59b6;border-radius:4px;">
                            <div style="color:#9b59b6;font-size:11px;margin-bottom:4px;">🔑 关键词</div>
                            <div style="font-size:13px;">${keywords}</div>
                        </div>`;
                    }
                    if (entry['内容']) {
                        let content = String(entry['内容']).replace(/</g, '<').replace(/>/g, '>').replace(/\*\*(.+?)\*\*/g, '<strong style="color:#3498db;">$1</strong>').replace(/\n/g, '<br>');
                        // 如果有搜索关键词，高亮显示
                        if (searchHighlightKeyword) {
                            const regex = new RegExp(searchHighlightKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                            content = content.replace(regex, `<span style="background:#f1c40f;color:#000;padding:1px 2px;border-radius:2px;">${searchHighlightKeyword}</span>`);
                        }
                        html += `<div style="padding:8px;background:#252525;border-left:3px solid #27ae60;border-radius:4px;line-height:1.6;">
                            <div style="color:#27ae60;font-size:11px;margin-bottom:4px;">📝 内容</div>
                            <div style="font-size:13px;">${content}</div>
                        </div>`;
                    }
                }
                html += `</div></div>`;
            }
            html += `</div></div>`;
        }
        return `<div style="margin-bottom:12px;font-size:13px;">共 ${Object.keys(worldbook).filter(k => Object.keys(worldbook[k]).length > 0).length} 个分类, ${totalEntries} 个条目</div>` + html;
    }

    function bindLightToggleEvents(container) {
        container.querySelectorAll('.ttw-light-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const category = btn.dataset.category;
                const currentState = getCategoryLightState(category);
                const newState = !currentState;
                setCategoryLightState(category, newState);

                btn.className = `ttw-light-toggle ${newState ? 'green' : 'blue'}`;
                btn.textContent = newState ? '🟢' : '🔵';
                btn.title = newState ? '绿灯(触发式) - 点击切换为蓝灯' : '蓝灯(常驻) - 点击切换为绿灯';
            });
        });
    }

    function bindConfigButtonEvents(container) {
        // 分类配置按钮
        container.querySelectorAll('.ttw-config-btn[data-category]:not([data-entry])').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const category = btn.dataset.category;
                showCategoryConfigModal(category);
            });
        });

        // 条目配置按钮
        container.querySelectorAll('.ttw-entry-config-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const category = btn.dataset.category;
                const entryName = btn.dataset.entry;
                showEntryConfigModal(category, entryName);
            });
        });
    }

    function showWorldbookView() {
        const existingModal = document.getElementById('ttw-worldbook-view-modal');
        if (existingModal) existingModal.remove();
        const worldbookToShow = useVolumeMode ? getAllVolumesWorldbook() : generatedWorldbook;
        const viewModal = document.createElement('div');
        viewModal.id = 'ttw-worldbook-view-modal';
        viewModal.className = 'ttw-modal-container';
        viewModal.innerHTML = `
            <div class="ttw-modal" style="max-width:900px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📖 世界书详细视图${useVolumeMode ? ` (${worldbookVolumes.length}卷合并)` : ''}</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body" id="ttw-worldbook-view-body">${formatWorldbookAsCards(worldbookToShow)}</div>
                <div class="ttw-modal-footer">
                    <div style="font-size:11px;color:#888;margin-right:auto;">💡 点击⚙️配置位置/深度/顺序，点击灯图标切换蓝灯/绿灯</div>
                    <button class="ttw-btn" id="ttw-close-worldbook-view">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(viewModal);
        bindLightToggleEvents(viewModal.querySelector('#ttw-worldbook-view-body'));
        bindConfigButtonEvents(viewModal.querySelector('#ttw-worldbook-view-body'));
        viewModal.querySelector('.ttw-modal-close').addEventListener('click', () => viewModal.remove());
        viewModal.querySelector('#ttw-close-worldbook-view').addEventListener('click', () => viewModal.remove());
        viewModal.addEventListener('click', (e) => { if (e.target === viewModal) viewModal.remove(); });
    }

    async function showHistoryView() {
        let historyList = [];
        try { await MemoryHistoryDB.cleanDuplicateHistory(); historyList = await MemoryHistoryDB.getAllHistory(); } catch (e) { }

        let listHtml = historyList.length === 0 ? '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无历史</div>' : '';
        if (historyList.length > 0) {
            const sortedList = [...historyList].sort((a, b) => b.timestamp - a.timestamp);
            sortedList.forEach((history) => {
                const time = new Date(history.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                const changeCount = history.changedEntries?.length || 0;
                const shortTitle = (history.memoryTitle || `第${history.memoryIndex + 1}章`).substring(0, 8);
                listHtml += `
                    <div class="ttw-list-item" data-history-id="${history.id}">
                        <div class="ttw-list-item-title" title="${history.memoryTitle}">${shortTitle}</div>
                        <div class="ttw-list-item-subtitle">${time}</div>
                        <div class="ttw-list-item-info">${changeCount}项</div>
                    </div>
                `;
            });
        }

        const contentHtml = `
            <div class="ttw-split-view">
                <div class="ttw-split-list">${listHtml}</div>
                <div id="ttw-history-detail" class="ttw-split-detail">
                    <div style="text-align:center;color:#888;padding:20px;font-size:12px;">👈 点击左侧查看详情</div>
                </div>
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn" id="ttw-optimize-wb-btn" style="background: linear-gradient(135deg, #8e44ad, #9b59b6); margin-right: auto;">🤖 AI优化世界书</button>
            <button class="ttw-btn" id="ttw-evolution-btn" style="background: linear-gradient(135deg, #2980b9, #3498db); margin-right: 10px;">📊 查看条目演变</button>
            <button class="ttw-btn ttw-btn-warning" id="ttw-clear-history">🗑️ 清空历史</button>
            <button class="ttw-btn" id="ttw-close-history">关闭</button>
        `;

        const modal = Services.UI.createModal('ttw-history-modal', `📜 修改历史 (${historyList.length}条)`, contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '900px';

        modal.querySelector('#ttw-optimize-wb-btn').addEventListener('click', () => {
            modal.remove();
            showOptimizeWorldbookModal(historyList);
        });
        modal.querySelector('#ttw-evolution-btn').addEventListener('click', () => {
            modal.remove();
            showEntryEvolutionModal(historyList);
        });
        modal.querySelector('#ttw-close-history').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-clear-history').addEventListener('click', async () => {
            if (confirm('确定清空所有历史记录？')) { await MemoryHistoryDB.clearAllHistory(); modal.remove(); showHistoryView(); }
        });

        modal.querySelectorAll('.ttw-list-item').forEach(item => {
            item.addEventListener('click', async () => {
                const historyId = parseInt(item.dataset.historyId);
                modal.querySelectorAll('.ttw-list-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                await showHistoryDetail(historyId, modal);
            });
        });
    }

    // ========== 移植功能：历史详情增强 ==========
    function formatEntryForDisplay(entry) {
        if (!entry) return '';
        if (typeof entry === 'string') return entry.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

        let html = '';
        if (entry['关键词']) {
            const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
            html += `<div style="color: #9b59b6; margin-bottom: 4px;"><strong>关键词:</strong> ${keywords}</div>`;
        }
        if (entry['内容']) {
            const content = String(entry['内容']).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            html += `<div><strong>内容:</strong> ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}</div>`;
        }
        return html || JSON.stringify(entry);
    }

    async function showHistoryDetail(historyId, modal) {
        const detailContainer = modal.querySelector('#ttw-history-detail');
        const history = await MemoryHistoryDB.getHistoryById(historyId);

        if (!history) {
            detailContainer.innerHTML = '<div style="text-align: center; color: var(--ttw-danger); padding: 40px;">找不到该历史记录</div>';
            return;
        }

        const time = new Date(history.timestamp).toLocaleString('zh-CN');

        let html = `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--ttw-border);">
            <h4 style="color: var(--ttw-warning); margin: 0 0 10px 0;">📝 ${history.memoryTitle || `记忆块 ${history.memoryIndex + 1}`}</h4>
            <div style="font-size: 12px; color: var(--ttw-text-muted);">时间: ${time}</div>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button class="ttw-btn ttw-btn-warning ttw-btn-small" onclick="window.TxtToWorldbook._rollbackToHistory(${historyId})">⏪ 回退到此版本前</button>
                <button class="ttw-btn ttw-btn-small" onclick="window.TxtToWorldbook._exportHistoryWorldbook(${historyId})" style="background: var(--ttw-success);">📥 导出此版本世界书</button>
            </div>
        </div>
        <div style="font-size: 14px; font-weight: bold; color: #9b59b6; margin-bottom: 10px;">变更内容 (${history.changedEntries?.length || 0}项)</div>
        `;

        if (history.changedEntries && history.changedEntries.length > 0) {
            history.changedEntries.forEach(change => {
                const typeIcon = change.type === 'add' ? '➕ 新增' : change.type === 'modify' ? '✏️ 修改' : '❌ 删除';
                const typeClass = change.type === 'add' ? 'add' : change.type === 'modify' ? 'modify' : 'delete';

                html += `
                <div class="ttw-change-item ${typeClass}">
                    <div class="ttw-change-header">
                        <span style="font-weight: bold;">${typeIcon}</span>
                        <span style="color: var(--ttw-warning); margin-left: 8px;">[${change.category}] ${change.entryName}</span>
                    </div>
                    <div class="ttw-change-content">
                        <div class="ttw-change-block" style="${change.type === 'add' ? 'opacity: 0.5;' : ''}">
                            <div class="ttw-change-label" style="color: var(--ttw-danger);">变更前</div>
                            <div class="ttw-change-value">
                                ${change.oldValue ? formatEntryForDisplay(change.oldValue) : '<span style="color: #666;">无</span>'}
                            </div>
                        </div>
                        <div class="ttw-change-block" style="${change.type === 'delete' ? 'opacity: 0.5;' : ''}">
                            <div class="ttw-change-label" style="color: var(--ttw-success);">变更后</div>
                            <div class="ttw-change-value">
                                ${change.newValue ? formatEntryForDisplay(change.newValue) : '<span style="color: #666;">无</span>'}
                            </div>
                        </div>
                    </div>
                </div>`;
            });
        } else {
            html += '<div style="color: var(--ttw-text-muted); text-align: center; padding: 20px;">无变更记录</div>';
        }

        detailContainer.innerHTML = html;
    }

    async function exportHistoryWorldbook(historyId) {
        try {
            const history = await MemoryHistoryDB.getHistoryById(historyId);
            if (!history) {
                alert('找不到该历史记录');
                return;
            }

            const worldbook = history.newWorldbook;
            if (!worldbook || Object.keys(worldbook).length === 0) {
                alert('该历史记录没有世界书数据');
                return;
            }

            // 生成世界书名称
            const timestamp = new Date(history.timestamp);
            const readableTimeString = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}`;
            const worldbookName = `${history.memoryTitle || `记忆${history.memoryIndex + 1}`}-${readableTimeString}`;

            // 转换为SillyTavern世界书格式 (复用已有的转换逻辑，或者需要实现convertToSillyTavernFormat)
            // 注意：txtToWorldbook.js 中 exportToSillyTavern 是导出当前世界书，这里需要导出历史版本
            // 我们需要把 exportToSillyTavern 的核心逻辑提取出来复用，或者在这里重新实现

            // 简单实现转换逻辑
            const sillyTavernEntries = [];
            let entryId = 0;
            const triggerCategories = new Set(['地点', '剧情大纲', '地图环境', '剧情节点', '章节剧情']);

            for (const category in worldbook) {
                const entries = worldbook[category];
                if (typeof entries !== 'object') continue;

                const isTriggerCategory = triggerCategories.has(category);
                const constant = !isTriggerCategory;
                const selective = isTriggerCategory;

                for (const entryName in entries) {
                    const entry = entries[entryName];
                    const keywords = entry['关键词'] || [entryName];
                    const content = entry['内容'] || '';
                    if (!content) continue;

                    const cleanKeywords = (Array.isArray(keywords) ? keywords : [keywords])
                        .map(k => String(k).trim().replace(/[-_\s]+/g, ''))
                        .filter(k => k.length > 0 && k.length <= 20);
                    if (cleanKeywords.length === 0) cleanKeywords.push(entryName.replace(/[-_\s]+/g, ''));

                    const config = getEntryConfig(category, entryName);

                    sillyTavernEntries.push({
                        uid: entryId++,
                        key: [...new Set(cleanKeywords)],
                        keysecondary: [],
                        comment: `${category} - ${entryName}`,
                        content: content,
                        constant,
                        selective,
                        selectiveLogic: 0,
                        addMemo: true,
                        order: config.order || 100,
                        position: config.position || 0,
                        disable: false,
                        excludeRecursion: false,
                        preventRecursion: false,
                        delayUntilRecursion: false,
                        probability: 100,
                        depth: config.depth || 4,
                        group: category,
                        groupOverride: false,
                        groupWeight: 100,
                        scanDepth: null,
                        caseSensitive: false,
                        matchWholeWords: true,
                        useGroupScoring: null,
                        automationId: '',
                        role: 0,
                        vectorized: false,
                        sticky: null,
                        cooldown: null,
                        delay: null
                    });
                }
            }

            const exportData = { entries: sillyTavernEntries };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = worldbookName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            a.download = `${safeName}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`已导出历史记录 #${historyId} 的世界书 (SillyTavern世界书格式)`);
        } catch (error) {
            console.error('导出历史世界书失败:', error);
            alert('导出失败: ' + error.message);
        }
    }

    /**
     * @namespace GraphService
     * Knowledge Graph Visualization Service
     */
    Services.Graph = {
        nodes: [],
        links: [],
        simulation: null,
        canvas: null,
        ctx: null,
        transform: { x: 0, y: 0, k: 1 },
        isDragging: false,
        dragNode: null,

        init(container) {
            this.canvas = document.createElement('canvas');
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.ctx = this.canvas.getContext('2d');
            container.innerHTML = '';
            container.appendChild(this.canvas);

            this.setupEvents();
        },

        buildData(worldbook) {
            this.nodes = [];
            this.links = [];
            const nodeMap = new Map();

            // Extract nodes
            for (const category in worldbook) {
                const entries = worldbook[category];
                for (const name in entries) {
                    const entry = entries[name];
                    const node = {
                        id: name,
                        group: category,
                        x: Math.random() * 800,
                        y: Math.random() * 600,
                        vx: 0, vy: 0,
                        radius: 5 + (entry['内容'].length / 100), // Size based on content length
                        color: this.getGroupColor(category)
                    };
                    this.nodes.push(node);
                    nodeMap.set(name, node);
                }
            }

            // Extract links (based on relations or keywords)
            // 1. Explicit Relations
            this.nodes.forEach(node => {
                const entry = worldbook[node.group][node.id];
                if (entry.relations && Array.isArray(entry.relations)) {
                    entry.relations.forEach(rel => {
                        if (nodeMap.has(rel.target)) {
                            this.links.push({
                                source: node,
                                target: nodeMap.get(rel.target),
                                type: rel.type
                            });
                        }
                    });
                }
                // 2. Keyword matching (simple) - if name mentions another name
                // To avoid O(N^2), maybe skip for now or do limited check
            });
        },

        getGroupColor(group) {
            const colors = {
                '角色': '#e74c3c',
                '地点': '#3498db',
                '组织': '#9b59b6',
                '剧情大纲': '#f1c40f',
                'default': '#95a5a6'
            };
            return colors[group] || colors['default'];
        },

        startSimulation() {
            if (this.simulation) cancelAnimationFrame(this.simulation);
            const animate = () => {
                this.updatePhysics();
                this.draw();
                this.simulation = requestAnimationFrame(animate);
            };
            this.simulation = requestAnimationFrame(animate);
        },

        updatePhysics() {
            // Simple Force-Directed Layout
            const k = 0.5; // Repulsion constant
            const width = this.canvas.width;
            const height = this.canvas.height;

            // Repulsion
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const n1 = this.nodes[i];
                    const n2 = this.nodes[j];
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    if (dist < 300) {
                        const force = k * k / dist;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;
                        n1.vx += fx; n1.vy += fy;
                        n2.vx -= fx; n2.vy -= fy;
                    }
                }
            }

            // Spring (Links)
            const L = 100; // Rest length
            this.links.forEach(link => {
                const n1 = link.source;
                const n2 = link.target;
                const dx = n1.x - n2.x;
                const dy = n1.y - n2.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist - L) / dist; // attraction if > L, repulsion if < L
                const fx = dx * force * 0.05;
                const fy = dy * force * 0.05;
                n1.vx -= fx; n1.vy -= fy;
                n2.vx += fx; n2.vy += fy;
            });

            // Center Gravity & Velocity Update
            this.nodes.forEach(node => {
                // Gravity
                node.vx += (width / 2 - node.x) * 0.0005;
                node.vy += (height / 2 - node.y) * 0.0005;

                // Friction
                node.vx *= 0.9;
                node.vy *= 0.9;

                if (node !== this.dragNode) {
                    node.x += node.vx;
                    node.y += node.vy;
                }
            });
        },

        draw() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.save();
            ctx.translate(this.transform.x, this.transform.y);
            ctx.scale(this.transform.k, this.transform.k);

            // Draw Links
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            this.links.forEach(link => {
                ctx.beginPath();
                ctx.moveTo(link.source.x, link.source.y);
                ctx.lineTo(link.target.x, link.target.y);
                ctx.stroke();
                // Draw Label?
            });

            // Draw Nodes
            this.nodes.forEach(node => {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                ctx.fillStyle = node.color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Text
                if (this.transform.k > 0.5) {
                    ctx.fillStyle = '#fff';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(node.id, node.x, node.y + node.radius + 12);
                }
            });

            ctx.restore();
        },

        setupEvents() {
            let lastX, lastY;
            this.canvas.addEventListener('mousedown', e => {
                const rect = this.canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left - this.transform.x) / this.transform.k;
                const y = (e.clientY - rect.top - this.transform.y) / this.transform.k;

                // Hit test
                for (const node of this.nodes) {
                    const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
                    if (dist < node.radius + 5) {
                        this.isDragging = true;
                        this.dragNode = node;
                        return;
                    }
                }

                // Pan
                this.isPanning = true;
                lastX = e.clientX;
                lastY = e.clientY;
            });

            this.canvas.addEventListener('mousemove', e => {
                if (this.isDragging && this.dragNode) {
                    const rect = this.canvas.getBoundingClientRect();
                    this.dragNode.x = (e.clientX - rect.left - this.transform.x) / this.transform.k;
                    this.dragNode.y = (e.clientY - rect.top - this.transform.y) / this.transform.k;
                    this.dragNode.vx = 0; this.dragNode.vy = 0;
                } else if (this.isPanning) {
                    const dx = e.clientX - lastX;
                    const dy = e.clientY - lastY;
                    this.transform.x += dx;
                    this.transform.y += dy;
                    lastX = e.clientX;
                    lastY = e.clientY;
                }
            });

            this.canvas.addEventListener('mouseup', () => {
                this.isDragging = false;
                this.dragNode = null;
                this.isPanning = false;
            });

            this.canvas.addEventListener('wheel', e => {
                e.preventDefault();
                const zoomIntensity = 0.1;
                const wheel = e.deltaY < 0 ? 1 : -1;
                const zoom = Math.exp(wheel * zoomIntensity);
                this.transform.k *= zoom;
            });
        },

        stop() {
            if (this.simulation) cancelAnimationFrame(this.simulation);
        }
    };

    function showKnowledgeGraph() {
        const modal = document.createElement('div');
        modal.className = 'ttw-modal-container';
        modal.innerHTML = `
            <div class="ttw-modal" style="max-width: 90vw; height: 85vh; display: flex; flex-direction: column;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🕸️ 实体关系图谱 (实验性)</span>
                    <button class="ttw-modal-close">✕</button>
                </div>
                <div class="ttw-modal-body" style="flex: 1; padding: 0; background: #222; overflow: hidden;" id="ttw-graph-container">
                </div>
                <div class="ttw-modal-footer">
                    <div style="margin-right: auto; font-size: 12px; color: #888;">
                        操作: 🖱️拖拽节点 | 🖐️平移画布 | 🔍滚轮缩放
                    </div>
                    <button class="ttw-btn ttw-modal-close-btn">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const container = modal.querySelector('#ttw-graph-container');
        Services.Graph.init(container);
        Services.Graph.buildData(generatedWorldbook);
        Services.Graph.startSimulation();

        const close = () => {
            Services.Graph.stop();
            modal.remove();
        };
        modal.querySelector('.ttw-modal-close').addEventListener('click', close);
        modal.querySelector('.ttw-modal-close-btn').addEventListener('click', close);
    }

    // Add button to main UI (hook into existing menu or add new button)
    // Find where result buttons are and add this.
    // For now, let's expose it globally or hook into `showWorldbookView` area.

    // ========== 移植功能：AI优化世界书 & 条目演变 ==========
    let customOptimizationPrompt = null;
    const DEFAULT_BATCH_CHANGES = 50;

    function aggregateEntryEvolution(historyList) {
        const evolution = {};
        const sortedList = [...historyList].sort((a, b) => a.timestamp - b.timestamp);

        sortedList.forEach(history => {
            if (!history.changedEntries) return;
            history.changedEntries.forEach(change => {
                const key = `${change.category}::${change.entryName}`;
                if (!evolution[key]) {
                    evolution[key] = {
                        category: change.category,
                        entryName: change.entryName,
                        changes: [],
                        summary: null
                    };
                }
                evolution[key].changes.push({
                    timestamp: history.timestamp,
                    memoryIndex: history.memoryIndex,
                    memoryTitle: history.memoryTitle,
                    type: change.type,
                    oldValue: change.oldValue,
                    newValue: change.newValue
                });
            });
        });
        return evolution;
    }

    async function showOptimizeWorldbookModal(historyList) {
        try {
            const savedPrompt = await MemoryHistoryDB.getCustomOptimizationPrompt();
            if (savedPrompt) {
                customOptimizationPrompt = savedPrompt;
                console.log('📝 已加载上次保存的自定义Prompt');
            }
        } catch (e) {
            console.error('加载自定义Prompt失败:', e);
        }

        const entryEvolution = aggregateEntryEvolution(historyList);
        const entryCount = Object.keys(entryEvolution).length;
        let totalChanges = 0;
        for (const key in entryEvolution) totalChanges += entryEvolution[key].changes.length;

        const contentHtml = `
            <div class="ttw-opt-stat-box">
                <div style="color: var(--ttw-warning); font-weight: bold; margin-bottom: 10px;">📊 当前数据统计</div>
                <div style="color: var(--ttw-text-muted); font-size: 14px;">
                    <div>• 条目数量: <span style="color: var(--ttw-success);">${entryCount}</span> 个</div>
                    <div>• 历史变更: <span style="color: var(--ttw-primary);">${totalChanges}</span> 对</div>
                </div>
            </div>
            <div class="ttw-opt-stat-box">
                <div style="color: #9b59b6; font-weight: bold; margin-bottom: 10px;">⚙️ 优化设置</div>
                <label style="color: var(--ttw-text-muted); font-size: 14px;">每批处理变更数:</label>
                <input type="number" id="ttw-batch-changes-input" class="ttw-opt-input" value="${DEFAULT_BATCH_CHANGES}" min="10" max="200" style="margin-bottom: 15px;">

                <div style="margin-top: 15px;">
                    <label style="color: var(--ttw-text-muted); font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <input type="checkbox" id="ttw-use-custom-prompt" style="width: 16px; height: 16px;">
                        <span>使用自定义Prompt设定</span>
                    </label>
                    <div id="ttw-custom-prompt-container" style="display: none;">
                        <textarea id="ttw-custom-prompt-textarea" class="ttw-opt-textarea" placeholder="在此输入自定义的优化Prompt...
提示：可以使用 {{条目}} 作为占位符，系统会自动替换为实际条目内容。">${customOptimizationPrompt || ''}</textarea>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button class="ttw-btn ttw-btn-small" id="ttw-reset-prompt-btn" style="background: var(--ttw-primary);">📄 显示默认提示词</button>
                            <span id="ttw-prompt-status" style="color: #888; font-size: 12px;"></span>
                        </div>
                    </div>
                </div>
            </div>
            <div style="background: rgba(0,100,0,0.1); border: 1px solid var(--ttw-success); padding: 15px; border-radius: 8px;">
                <div style="color: var(--ttw-success); font-weight: bold; margin-bottom: 10px;">✨ 优化目标</div>
                <div style="color: var(--ttw-text-muted); font-size: 13px; line-height: 1.6;">
                    • 将条目优化为<strong>常态描述</strong>（适合RPG）<br>
                    • 人物状态设为正常，忽略临时变化<br>
                    • 优化后将<strong>覆盖</strong>现有世界书条目
                </div>
            </div>
        `;

        const footerHtml = `
            <button class="ttw-btn" id="ttw-cancel-optimize-wb">取消</button>
            <button class="ttw-btn ttw-btn-primary" id="ttw-start-optimize-wb">🚀 开始优化</button>
        `;

        const modal = Services.UI.createModal('ttw-optimize-worldbook-modal', '🤖 AI优化世界书', contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '800px';

        const useCustomPromptCheckbox = modal.querySelector('#ttw-use-custom-prompt');
        const customPromptContainer = modal.querySelector('#ttw-custom-prompt-container');
        const customPromptTextarea = modal.querySelector('#ttw-custom-prompt-textarea');

        useCustomPromptCheckbox.addEventListener('change', () => {
            customPromptContainer.style.display = useCustomPromptCheckbox.checked ? 'block' : 'none';
        });

        let saveTimeout = null;
        customPromptTextarea.addEventListener('input', () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                const promptText = customPromptTextarea.value.trim();
                MemoryHistoryDB.saveCustomOptimizationPrompt(promptText);
            }, 1000);
        });

        modal.querySelector('#ttw-reset-prompt-btn').addEventListener('click', () => {
            const defaultPrompt = `你是RPG世界书优化专家。为每个条目生成**常态描述**。
**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化JSON...（此处省略部分默认提示词以节省空间）
**输出JSON格式：**
{"条目名1": {"关键词": [...], "内容": "..."}}
**条目：**
{{条目}}
直接输出JSON。`;
            customPromptTextarea.value = defaultPrompt;
            modal.querySelector('#ttw-prompt-status').textContent = '已加载默认提示词';
        });

        modal.querySelector('#ttw-cancel-optimize-wb').addEventListener('click', () => {
            modal.remove();
            showHistoryView();
        });
        modal.querySelector('#ttw-start-optimize-wb').addEventListener('click', async () => {
            const batchSize = parseInt(modal.querySelector('#ttw-batch-changes-input').value) || DEFAULT_BATCH_CHANGES;
            if (useCustomPromptCheckbox.checked) {
                const promptText = customPromptTextarea.value.trim();
                customOptimizationPrompt = promptText || null;
            } else {
                customOptimizationPrompt = null;
            }
            modal.remove();
            await startBatchOptimizationAdvanced(entryEvolution, batchSize);
        });
    }

    async function startBatchOptimizationAdvanced(entryEvolution, batchSize) {
        const entries = Object.entries(entryEvolution);
        if (entries.length === 0) {
            Services.UI.showToast('没有可优化的条目', 'warning');
            showHistoryView();
            return;
        }

        const batches = [];
        let currentBatch = [], currentBatchChanges = 0;
        for (const [key, data] of entries) {
            const entryChanges = data.changes.length;
            if (currentBatchChanges + entryChanges > batchSize && currentBatch.length > 0) {
                batches.push([...currentBatch]);
                currentBatch = [];
                currentBatchChanges = 0;
            }
            currentBatch.push({ key, data });
            currentBatchChanges += entryChanges;
        }
        if (currentBatch.length > 0) batches.push(currentBatch);

        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));
        showProgressSection(true);
        updateProgress(0, `AI优化世界书中... (批次 0/${batches.length})`);

        let completedBatches = 0, optimizedEntries = 0;
        const allChangedEntries = [];

        for (let i = 0; i < batches.length; i++) {
            if (isProcessingStopped) break;
            updateProgress(((i + 1) / batches.length) * 100, `AI优化中... (批次 ${i + 1}/${batches.length})`);

            try {
                const batchPrompt = buildBatchOptimizationPrompt(batches[i]);
                const response = await callAPI(batchPrompt);
                const batchChanges = await applyBatchOptimizationResult(response, batches[i], previousWorldbook);
                allChangedEntries.push(...batchChanges);
                optimizedEntries += batches[i].length;
            } catch (error) {
                console.error(`批次 ${i + 1} 优化失败:`, error);
            }
            completedBatches++;
        }

        if (allChangedEntries.length > 0) {
            await MemoryHistoryDB.saveHistory(-1, '记忆-优化', previousWorldbook, generatedWorldbook, allChangedEntries);
        }

        updateProgress(100, `优化完成！优化了 ${optimizedEntries} 个条目`);
        await MemoryHistoryDB.saveState(memoryQueue.length);
        updateWorldbookPreview();
        alert(`优化完成！优化了 ${optimizedEntries} 个条目`);
    }

    function buildBatchOptimizationPrompt(batch) {
        let entriesContent = '';
        batch.forEach(({ data }) => {
            entriesContent += `\n--- ${data.entryName} [${data.category}] ---\n`;
            data.changes.forEach((change, i) => {
                if (change.newValue?.['内容']) {
                    entriesContent += `${change.newValue['内容'].substring(0, 300)}...\n`;
                }
            });
        });

        if (customOptimizationPrompt) {
            let prompt = customOptimizationPrompt.replace(/\{\{条目\}\}/g, entriesContent);
            return getLanguagePrefix() + prompt;
        }

        return getLanguagePrefix() + `你是RPG世界书优化专家。为每个条目生成**常态描述**。
**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化JSON...
**输出JSON格式：**
{
  "条目名1": { "关键词": ["..."], "内容": "..." }
}
**条目：**
${entriesContent}
直接输出JSON。`;
    }

    async function applyBatchOptimizationResult(response, batch, previousWorldbook) {
        let result;
        try {
            result = parseAIResponse(response);
        } catch (e) {
            return [];
        }

        const changedEntries = [];
        for (const { key, data } of batch) {
            const entryName = data.entryName;
            const category = data.category;
            const optimized = result[entryName];
            if (optimized) {
                if (!generatedWorldbook[category]) generatedWorldbook[category] = {};
                const oldValue = previousWorldbook[category]?.[entryName] || null;
                const newValue = {
                    '关键词': optimized['关键词'] || data.changes[data.changes.length - 1]?.newValue?.['关键词'] || [],
                    '内容': optimized['内容'] || ''
                };
                generatedWorldbook[category][entryName] = newValue;
                changedEntries.push({
                    category, entryName,
                    type: oldValue ? 'modify' : 'add',
                    oldValue, newValue
                });
            }
        }
        return changedEntries;
    }

    async function showEntryEvolutionModal(historyList) {
        const entryEvolution = aggregateEntryEvolution(historyList);
        const entryCount = Object.keys(entryEvolution).length;

        const contentHtml = `
            <div class="ttw-split-view">
                <div id="ttw-entry-list" class="ttw-split-list">
                    ${generateEntryListHTML(entryEvolution)}
                </div>
                <div id="ttw-evolution-detail" class="ttw-split-detail">
                    <div style="text-align: center; color: var(--ttw-text-muted); padding: 40px;">👈 点击左侧条目查看演变历史</div>
                </div>
            </div>
        `;

        const footerHtml = `
            <div style="display: flex; gap: 10px; width: 100%;">
                <button class="ttw-btn ttw-btn-small" id="ttw-summarize-all-btn" style="background: #9b59b6;">🤖 AI总结全部</button>
                <button class="ttw-btn ttw-btn-small" id="ttw-export-evolution-btn" style="background: var(--ttw-success);">📥 导出演变数据</button>
                <div style="flex: 1;"></div>
                <button class="ttw-btn" id="ttw-back-to-history-btn" style="background: var(--ttw-warning);">↩️ 返回历史</button>
                <button class="ttw-btn" id="ttw-close-evolution-btn">关闭</button>
            </div>
        `;

        const modal = Services.UI.createModal('ttw-entry-evolution-modal', `📊 条目演变历史 (${entryCount}个条目)`, contentHtml, footerHtml);
        modal.querySelector('.ttw-modal').style.maxWidth = '1100px';

        window._ttwEntryEvolution = entryEvolution;

        // Event Listeners
        modal.querySelector('#ttw-close-evolution-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-back-to-history-btn').addEventListener('click', () => {
            modal.remove();
            showHistoryView();
        });
        modal.querySelector('#ttw-export-evolution-btn').addEventListener('click', () => exportEvolutionData(entryEvolution));
        modal.querySelector('#ttw-summarize-all-btn').addEventListener('click', () => summarizeAllEntryEvolution(entryEvolution));

        modal.querySelectorAll('.ttw-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const entryKey = item.dataset.entryKey;
                showEntryEvolutionDetail(entryKey, entryEvolution[entryKey]);
                modal.querySelectorAll('.ttw-list-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    function generateEntryListHTML(entryEvolution) {
        const entries = Object.entries(entryEvolution);
        if (entries.length === 0) return '<div style="text-align: center; color: var(--ttw-text-muted); padding: 20px;">暂无条目演变数据</div>';
        entries.sort((a, b) => b[1].changes.length - a[1].changes.length);

        let html = '';
        entries.forEach(([key, data]) => {
            const changeCount = data.changes.length;
            const hasSummary = data.summary ? '✅' : '';
            html += `
            <div class="ttw-list-item" data-entry-key="${key}">
                <div class="ttw-list-item-title" style="display: flex; justify-content: space-between;">
                    <span style="color: var(--ttw-warning);">${data.entryName}</span>
                    <span style="font-size: 11px; color: var(--ttw-success);">${hasSummary}</span>
                </div>
                <div class="ttw-list-item-subtitle">[${data.category}]</div>
                <div class="ttw-list-item-info"><span style="color: var(--ttw-primary);">${changeCount}次变更</span></div>
            </div>`;
        });
        return html;
    }

    function showEntryEvolutionDetail(entryKey, entryData) {
        const detailContainer = document.getElementById('ttw-evolution-detail');
        if (!detailContainer || !entryData) return;

        let html = `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--ttw-border);">
            <h4 style="color: var(--ttw-warning); margin: 0 0 5px 0;">${entryData.entryName}</h4>
            <div style="font-size: 12px; color: var(--ttw-text-muted); margin-bottom: 10px;">[${entryData.category}] - 共 ${entryData.changes.length} 次变更</div>
            <button class="ttw-btn ttw-btn-small" id="ttw-summarize-single-btn" style="background: #9b59b6;" data-entry-key="${entryKey}">🤖 AI总结此条目演变</button>
        </div>`;

        if (entryData.summary) {
            html += `<div style="background: rgba(39, 174, 96, 0.1); border: 1px solid var(--ttw-success); border-radius: 6px; padding: 12px; margin-bottom: 15px;">
                <div style="color: var(--ttw-success); font-weight: bold; margin-bottom: 8px;">✅ AI总结</div>
                <div style="color: var(--ttw-text); font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${entryData.summary.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>`;
        }

        html += `<div style="font-size: 14px; font-weight: bold; color: var(--ttw-primary); margin-bottom: 10px;">📜 变更时间线</div>`;

        entryData.changes.forEach((change, index) => {
            const time = new Date(change.timestamp).toLocaleString('zh-CN');
            const typeIcon = change.type === 'add' ? '➕ 新增' : change.type === 'modify' ? '✏️ 修改' : '❌ 删除';
            const typeClass = change.type === 'add' ? 'add' : change.type === 'modify' ? 'modify' : 'delete';

            html += `
            <div class="ttw-change-item ${typeClass}">
                <div class="ttw-change-header">
                    <span style="font-weight: bold;">#${index + 1} ${typeIcon}</span>
                    <span style="color: var(--ttw-text-muted); font-size: 11px;">${time} - ${change.memoryTitle || `记忆块 ${change.memoryIndex + 1}`}</span>
                </div>
                <div class="ttw-change-content">
                    <div class="ttw-change-block" style="${change.type === 'add' ? 'opacity: 0.5;' : ''}">
                        <div class="ttw-change-label" style="color: var(--ttw-danger);">变更前</div>
                        <div class="ttw-change-value">
                            ${change.oldValue ? formatEntryForDisplay(change.oldValue) : '<span style="color: #666;">无</span>'}
                        </div>
                    </div>
                    <div class="ttw-change-block" style="${change.type === 'delete' ? 'opacity: 0.5;' : ''}">
                        <div class="ttw-change-label" style="color: var(--ttw-success);">变更后</div>
                        <div class="ttw-change-value">
                            ${change.newValue ? formatEntryForDisplay(change.newValue) : '<span style="color: #666;">无</span>'}
                        </div>
                    </div>
                </div>
            </div>`;
        });

        detailContainer.innerHTML = html;
        const summarizeBtn = document.getElementById('ttw-summarize-single-btn');
        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', () => summarizeSingleEntryEvolution(entryKey));
        }
    }

    function buildEvolutionText(entryData) {
        let text = `条目名称: ${entryData.entryName}\n分类: ${entryData.category}\n\n变更历史:\n`;
        entryData.changes.forEach((change, index) => {
            const time = new Date(change.timestamp).toLocaleString('zh-CN');
            text += `\n--- 第${index + 1}次变更 (${time}, ${change.memoryTitle || `记忆块${change.memoryIndex + 1}`}) ---\n`;
            text += `类型: ${change.type === 'add' ? '新增' : change.type === 'modify' ? '修改' : '删除'}\n`;
            if (change.oldValue) text += `变更前内容: ${JSON.stringify(change.oldValue['内容'])}\n`;
            if (change.newValue) text += `变更后内容: ${JSON.stringify(change.newValue['内容'])}\n`;
        });
        return text;
    }

    async function callAIForEvolutionSummary(entryName, evolutionText) {
        try {
            const prompt = getLanguagePrefix() + `请根据以下世界书条目的变更历史，总结这个条目（角色/事物/概念）的常态信息。
**重要要求：**
1. 这是为SillyTavern RPG角色卡准备的世界书条目
2. 人物状态应设置为**常态**（活着、正常状态），不能是死亡、受伤等临时状态
3. 提取该条目的核心特征、背景、能力、关系等持久性信息
4. 忽略故事中的临时变化，保留角色/事物的本质特征
5. 输出应该是精炼的、适合作为RPG世界书条目的描述

${evolutionText}

请直接输出总结内容，不要包含任何解释或前缀。`;
            const response = await callAPI(prompt);
            return response;
        } catch (error) {
            console.error('AI总结失败:', error);
            return null;
        }
    }

    async function summarizeSingleEntryEvolution(entryKey) {
        const entryEvolution = window._ttwEntryEvolution;
        if (!entryEvolution) return;
        const entryData = entryEvolution[entryKey];
        if (!entryData) return;

        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));
        const evolutionText = buildEvolutionText(entryData);
        updateProgress(50, `正在AI总结条目: ${entryData.entryName}`);
        const summary = await callAIForEvolutionSummary(entryData.entryName, evolutionText);

        if (summary) {
            entryData.summary = summary;
            const category = entryData.category;
            const entryName = entryData.entryName;
            if (!generatedWorldbook[category]) generatedWorldbook[category] = {};
            const oldValue = generatedWorldbook[category][entryName] || null;
            const newValue = { '关键词': oldValue?.['关键词'] || [], '内容': summary };
            generatedWorldbook[category][entryName] = newValue;

            await MemoryHistoryDB.saveHistory(-1, '记忆-演变总结', previousWorldbook, generatedWorldbook, [{
                category, entryName, type: oldValue ? 'modify' : 'add', oldValue, newValue
            }]);
            showEntryEvolutionDetail(entryKey, entryData);
            await MemoryHistoryDB.saveState(memoryQueue.length);
            updateProgress(100, `条目 ${entryName} AI总结完成`);
        }
    }

    async function summarizeAllEntryEvolution(entryEvolution) {
        window._ttwEntryEvolution = entryEvolution;
        const entries = Object.entries(entryEvolution);
        if (entries.length === 0) { alert('没有可总结的条目'); return; }
        if (!confirm(`将对 ${entries.length} 个条目进行AI总结。\n这可能需要一些时间和API调用。\n\n是否继续？`)) return;

        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));
        showProgressSection(true);
        let completed = 0;
        const allChangedEntries = [];

        for (const [key, data] of entries) {
            if (isProcessingStopped) break;
            try {
                const evolutionText = buildEvolutionText(data);
                const summary = await callAIForEvolutionSummary(data.entryName, evolutionText);
                if (summary) {
                    data.summary = summary;
                    const category = data.category;
                    const entryName = data.entryName;
                    if (!generatedWorldbook[category]) generatedWorldbook[category] = {};
                    const oldValue = generatedWorldbook[category][entryName] || null;
                    const newValue = { '关键词': oldValue?.['关键词'] || [], '内容': summary };
                    generatedWorldbook[category][entryName] = newValue;
                    allChangedEntries.push({
                        category, entryName, type: oldValue ? 'modify' : 'add', oldValue, newValue
                    });
                }
            } catch (e) { }
            completed++;
            updateProgress((completed / entries.length) * 100, `AI总结中... (${completed}/${entries.length})`);
        }

        if (allChangedEntries.length > 0) {
            await MemoryHistoryDB.saveHistory(-1, '记忆-演变总结', previousWorldbook, generatedWorldbook, allChangedEntries);
            await MemoryHistoryDB.saveState(memoryQueue.length);
        }

        updateProgress(100, `已完成 ${completed} 个条目的AI总结`);
        alert(`已完成 ${completed} 个条目的AI总结！`);
        const entryListContainer = document.getElementById('ttw-entry-list');
        if (entryListContainer) entryListContainer.innerHTML = generateEntryListHTML(entryEvolution);
    }

    function exportEvolutionData(entryEvolution) {
        const entries = Object.entries(entryEvolution);
        if (entries.length === 0) { alert('没有可导出的演变数据'); return; }

        const sillyTavernEntries = [];
        let entryId = 0;
        const triggerCategories = new Set(['地点', '剧情大纲']);

        for (const [key, data] of entries) {
            const category = data.category;
            const entryName = data.entryName;
            const isTriggerCategory = triggerCategories.has(category);
            let content = data.summary || '';
            let keywords = [];

            if (!content && data.changes.length > 0) {
                const lastChange = data.changes[data.changes.length - 1];
                content = lastChange.newValue?.['内容'] || lastChange.oldValue?.['内容'] || '';
                keywords = lastChange.newValue?.['关键词'] || lastChange.oldValue?.['关键词'] || [];
            }
            if (!content) continue;
            if (!Array.isArray(keywords) || keywords.length === 0) keywords = [entryName];

            sillyTavernEntries.push({
                uid: entryId++,
                key: keywords.map(k => String(k).trim()),
                content: content,
                constant: !isTriggerCategory,
                selective: isTriggerCategory,
                // ... 其他字段简化 ...
                enabled: true
            });
        }

        const blob = new Blob([JSON.stringify({ entries: sillyTavernEntries }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worldbook_evolution_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function rollbackToHistory(historyId) {
        if (!confirm('确定回退到此版本？页面将刷新。')) return;
        try {
            const history = await MemoryHistoryDB.rollbackToHistory(historyId);
            for (let i = 0; i < memoryQueue.length; i++) {
                if (i < history.memoryIndex) memoryQueue[i].processed = true;
                else { memoryQueue[i].processed = false; memoryQueue[i].failed = false; }
            }
            await MemoryHistoryDB.saveState(history.memoryIndex);
            Services.UI.showToast('回退成功！页面将刷新。', 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (error) { Services.UI.showToast('回退失败: ' + error.message, 'error'); }
    }

    function closeModal() {
        isProcessingStopped = true;
        isRerolling = false;
        if (globalSemaphore) globalSemaphore.abort();
        activeParallelTasks.clear();
        memoryQueue.forEach(m => { if (m.processing) m.processing = false; });

        if (modalContainer) { modalContainer.remove(); modalContainer = null; }
        document.removeEventListener('keydown', handleEscKey, true);
    }

    function open() { createModal(); }

    // ========== 公开 API ==========
    window.TxtToWorldbook = {
        open,
        close: closeModal,
        _rollbackToHistory: rollbackToHistory,
        _exportHistoryWorldbook: exportHistoryWorldbook,
        showEntryEvolutionModal,
        showOptimizeWorldbookModal,
        getWorldbook: () => generatedWorldbook,
        getMemoryQueue: () => memoryQueue,
        getVolumes: () => worldbookVolumes,
        getAllVolumesWorldbook,
        exportTaskState,
        importTaskState,
        exportSettings,
        importSettings,
        getParallelConfig: () => parallelConfig,
        rerollMemory,
        showRollHistory: showRollHistorySelector,
        importAndMerge: importAndMergeWorldbook,
        getCategoryLightSettings: () => categoryLightSettings,
        setCategoryLight: setCategoryLightState,
        rebuildWorldbook: rebuildWorldbookFromMemories,
        applyDefaultWorldbook: applyDefaultWorldbookEntries,
        getSettings: () => settings,
        callCustomAPI,
        callSillyTavernAPI,
        showConsolidateCategorySelector,
        showAliasMergeUI,
        getCustomCategories: () => customWorldbookCategories,
        getEnabledCategories,
        getChapterRegexSettings: () => chapterRegexSettings,
        rechunkMemories,
        showSearchModal,
        showReplaceModal,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        getDefaultWorldbookEntriesUI: () => defaultWorldbookEntriesUI
    };

    console.log('📚 TXT转世界书模块已加载');
})();


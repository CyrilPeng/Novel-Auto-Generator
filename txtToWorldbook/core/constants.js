export const DEFAULT_CHAPTER_REGEX = {
    pattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
    useCustomRegex: false
};

export const DEFAULT_CATEGORY_LIGHT = {
    '角色': false,
    '地点': true,
    '组织': false,
    '剧情大纲': true,
    '知识书': false,
    '文风配置': false,
    '地图环境': true,
    '剧情节点': true
};

export const DEFAULT_PLOT_OUTLINE_CONFIG = {
    position: 0,
    depth: 4,
    order: 100,
    autoIncrementOrder: true
};

export const DEFAULT_PARALLEL_CONFIG = {
    enabled: true,
    concurrency: 3,
    mode: 'independent'
};

export const defaultSettings = {
    chunkSize: 15000,
    enablePlotOutline: false,
    enableLiteraryStyle: false,
    language: 'zh',
    customWorldbookPrompt: '',
    customPlotPrompt: '',
    customStylePrompt: '',
    useVolumeMode: false,
    apiTimeout: 120000,
    parallelEnabled: true,
    parallelConcurrency: 3,
    parallelMode: 'independent',
    useTavernApi: true,
    customMergePrompt: '',
    consolidatePromptPresets: [],
    consolidateCategoryPresetMap: {},
    categoryLightSettings: null,
    defaultWorldbookEntries: '',
    customRerollPrompt: '',
    customBatchRerollPrompt: '',
    customApiProvider: 'openai-compatible',
    customApiKey: '',
    customApiEndpoint: '',
    customApiModel: 'gemini-2.5-flash',
    forceChapterMarker: true,
    chapterRegexPattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
    useCustomChapterRegex: false,
    defaultWorldbookEntriesUI: [],
    categoryDefaultConfig: {},
    entryPositionConfig: {},
    customSuffixPrompt: '',
    promptMessageChain: [
        { role: 'user', content: '{PROMPT}', enabled: true }
    ],
    allowRecursion: false,
    filterResponseTags: 'thinking,/think',
    debugMode: false,
};

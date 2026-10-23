export const DEFAULT_CHAPTER_REGEX = {
    pattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
    useCustomRegex: false,
};

export const DEFAULT_CATEGORY_LIGHT = {
    角色: false,
    地点: true,
    组织: false,
    剧情大纲: true,
    知识书: false,
    文风配置: false,
    地图环境: true,
    剧情节点: true,
};

export const DEFAULT_PLOT_OUTLINE_CONFIG = {
    position: 0,
    depth: 4,
    order: 100,
    autoIncrementOrder: true,
};

export const DEFAULT_PARALLEL_CONFIG = {
    enabled: true,
    concurrency: 3,
    mode: 'independent',
};

export const DEFAULT_WORLDBOOK_CATEGORIES = [
    {
        name: '角色',
        enabled: true,
        isBuiltin: true,
        entryExample: '角色真实姓名',
        keywordsExample: ['真实姓名', '称呼1', '称呼2', '绰号'],
        contentGuide:
            '基于原文的角色描述，包含但不限于**名称**:（必须要）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '地点',
        enabled: true,
        isBuiltin: true,
        entryExample: '地点真实名称',
        keywordsExample: ['地点名', '别称', '俗称'],
        contentGuide:
            '基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '组织',
        enabled: true,
        isBuiltin: true,
        entryExample: '组织真实名称',
        keywordsExample: ['组织名', '简称', '代号'],
        contentGuide:
            '基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '道具',
        enabled: false,
        isBuiltin: false,
        entryExample: '道具名称',
        keywordsExample: ['道具名', '别名'],
        contentGuide: '基于原文的道具描述，包含但不限于**名称**:、**类型**:、**功能**:、**来源**:、**持有者**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '玩法',
        enabled: false,
        isBuiltin: false,
        entryExample: '玩法名称',
        keywordsExample: ['玩法名', '规则名'],
        contentGuide: '基于原文的玩法/规则描述，包含但不限于**名称**:、**规则说明**:、**参与条件**:、**奖惩机制**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '章节剧情',
        enabled: false,
        isBuiltin: false,
        entryExample: '第X章',
        keywordsExample: ['章节名', '章节号'],
        contentGuide:
            '该章节的剧情概要，包含但不限于**章节标题**:、**主要事件**:、**出场角色**:、**关键转折**:、**伏笔线索**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
    {
        name: '角色内心',
        enabled: false,
        isBuiltin: false,
        entryExample: '角色名-内心世界',
        keywordsExample: ['角色名', '内心', '心理'],
        contentGuide:
            '角色的内心想法和心理活动，包含但不限于**原文内容**:、**内心独白**:、**情感变化**:、**动机分析**:、**心理矛盾**:等',
        defaultPosition: 0,
        defaultDepth: 4,
        defaultOrder: 100,
        autoIncrementOrder: false,
    },
];

export const defaultWorldbookPrompt = `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **只输出以下指定分类：{ENABLED_CATEGORY_NAMES}**，禁止输出其他未指定的分类
3. **关键词必须是文中实际出现的名称**，用逗号分隔
4. **内容必须基于原文描述**，不要添加原文没有的信息
5. **内容使用markdown格式**，可以层层嵌套或使用序号标题

## 📤 输出格式
请生成标准JSON格式，确保能被JavaScript正确解析：

\`\`\`json
{DYNAMIC_JSON_TEMPLATE}
\`\`\`

## 重要提醒
- 直接输出JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁
- **严格只输出上述指定的分类，不要自作主张添加其他分类**`;

export const defaultPlotPrompt = `"剧情大纲": {
    "主线剧情": {
        "关键词": ["主线", "核心剧情", "故事线"],
        "内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响\\n3. **转折点3**: 描述和影响\\n\\n## 伏笔与暗线\\n**已揭示的伏笔**: 已经揭晓的铺垫\\n**未解之谜**: 尚未解答的疑问\\n**暗线推测**: 可能的隐藏剧情线"
    },
    "支线剧情": {
        "关键词": ["支线", "副线", "分支剧情"],
        "内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n**支线3标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
    }
}`;

export const defaultStylePrompt = `"文风配置": {
    "作品文风": {
        "关键词": ["文风", "写作风格", "叙事特点"],
        "内容": "## 叙事视角\\n**视角类型**: 第一人称/第三人称/全知视角\\n**叙述者特点**: 叙述者的语气和态度\\n\\n## 语言风格\\n**用词特点**: 华丽/简洁/口语化/书面化\\n**句式特点**: 长句/短句/对话多/描写多\\n**修辞手法**: 常用的修辞手法\\n\\n## 情感基调\\n**整体氛围**: 轻松/沉重/悬疑/浪漫\\n**情感表达**: 直接/含蓄/细腻/粗犷"
    }
}`;

export const defaultMergePrompt = `你是世界书条目合并专家。请将以下两个相同名称的世界书条目合并为一个，保留所有重要信息，去除重复内容。

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

export const defaultConsolidatePrompt = `你是世界书条目整理专家。请整理以下条目内容，去除重复信息，合并相似描述，保留所有独特细节。

## 整理规则
1. 合并重复的属性描述（如多个"性别"只保留一个）
2. 整合相似的段落，去除冗余
3. 保留所有独特信息，不要丢失细节
4. 使用清晰的markdown格式输出
5. 关键信息放在前面

## 原始内容
{CONTENT}

请直接输出整理后的内容（纯文本，不要JSON包装）：`;

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
    extraSystemPrompt: '',
    promptMessageChain: [{ role: 'user', content: '{PROMPT}', enabled: true }],
    allowRecursion: false,
    filterResponseTags: 'thinking,/think',
    debugMode: false,
};

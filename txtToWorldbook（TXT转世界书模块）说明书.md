# TXT转世界书模块 (txtToWorldbook.js) 说明书

## 概述

`txtToWorldbook.js` 是一个用于将TXT格式的小说文本转换为SillyTavern世界书格式的独立JavaScript模块。该模块可以自动提取小说中的角色、地点、组织等关键信息，并生成结构化的世界书条目。

### 主要特性

- 🔄 **智能分块处理**：自动将长篇小说按章节分割成合适大小的记忆块
- ⚡ **并行处理支持**：可同时处理多个记忆块，大幅提升处理效率
- 🔌 **多API支持**：支持酒馆API、Gemini、DeepSeek、OpenAI兼容等多种API
- 📜 **历史追踪**：记录每次处理的变更历史，支持回退操作
- 🎲 **重Roll功能**：每个记忆块可多次生成，选择最佳结果
- 📥 **导入导出**：支持多种格式的导入导出，包括SillyTavern格式
- 🔍 **查找替换**：批量查找和替换世界书中的内容
- 📚 **自定义分类**：可自由添加、编辑世界书分类

---

## 目录结构

```
模块结构
├── 全局状态变量
├── 默认世界书条目UI数据
├── 自定义分类系统
├── 章回正则配置
├── 分类灯状态配置
├── 分类默认位置/深度配置
├── 并行处理配置
├── 默认设置
├── 信号量类（并行控制）
├── IndexedDB数据库操作
├── 自定义分类管理函数
├── 工具函数
├── 分类灯状态管理
├── 条目位置/深度/顺序配置管理
├── API调用模块
│   ├── 酒馆API模式
│   ├── 自定义API模式
│   ├── 拉取模型列表
│   └── 快速测试
├── 世界书数据处理
├── 解析AI响应
├── 分卷功能
├── 记忆分裂
├── 系统提示词生成
├── 并行/串行处理
├── 主处理流程
├── 修复失败记忆
├── 重Roll功能
├── 导入JSON合并世界书
├── 条目内容整理功能
├── 别名识别与合并
├── 查找/替换功能
├── 条目/分类配置弹窗
├── 导出功能
├── 渲染分类列表
├── 默认世界书条目UI
├── 章回检测功能
├── 帮助弹窗
├── 记忆内容查看/编辑
├── UI界面
├── 条目演变聚合功能
├── AI优化世界书功能
└── 公开API接口
```

---

## 核心概念

### 1. 记忆块 (Memory Chunk)

小说文本被分割成的处理单元。每个记忆块包含：

| 属性 | 类型 | 说明 |
|------|------|------|
| `title` | string | 记忆块标题（如"记忆1"） |
| `content` | string | 原文内容 |
| `processed` | boolean | 是否已处理 |
| `failed` | boolean | 处理是否失败 |
| `processing` | boolean | 是否正在处理中 |
| `result` | object | 处理结果（世界书数据） |
| `failedError` | string | 失败原因 |

### 2. 世界书 (Worldbook)

生成的结构化数据，按分类组织：

```javascript
{
    "角色": {
        "张三": {
            "关键词": ["张三", "老张", "张老板"],
            "内容": "## 基本信息\n**性别**: 男\n**年龄**: 35岁\n..."
        }
    },
    "地点": {
        "京城": {
            "关键词": ["京城", "都城"],
            "内容": "## 地点描述\n..."
        }
    },
    // ...其他分类
}
```

### 3. 分类系统

默认内置分类：
- **角色**：人物信息
- **地点**：场景位置
- **组织**：团体机构
- **道具**：物品装备（默认禁用）
- **玩法**：规则机制（默认禁用）
- **章节剧情**：剧情概要（默认禁用）
- **角色内心**：心理活动（默认禁用）

系统分类（固定）：
- **剧情大纲**：主线/支线剧情
- **文风配置**：写作风格
- **地图环境**：环境描述
- **剧情节点**：关键节点
- **知识书**：背景知识

---

## 全局状态变量

```javascript
// 核心数据
let generatedWorldbook = {};        // 已生成的世界书数据对象
let worldbookVolumes = [];          // 分卷模式下的各卷世界书数据
let currentVolumeIndex = 0;         // 当前处理的卷索引
let memoryQueue = [];               // 记忆块队列

// 处理状态
let isProcessingStopped = false;    // 处理是否被用户停止
let isRepairingMemories = false;    // 是否正在修复失败的记忆块
let currentProcessingIndex = 0;     // 当前正在处理的记忆块索引
let isRerolling = false;            // 是否正在重Roll

// 文件相关
let currentFile = null;             // 当前上传的文件对象
let currentFileHash = null;         // 当前文件的哈希值

// 模式设置
let incrementalOutputMode = true;   // 是否启用增量输出模式
let useVolumeMode = false;          // 是否启用分卷模式

// 起始位置
let startFromIndex = 0;             // 开始处理的记忆块索引
let userSelectedStartIndex = null;  // 用户手动选择的起始索引

// 多选模式
let isMultiSelectMode = false;      // 是否处于多选模式
let selectedMemoryIndices = new Set(); // 已选中的记忆块索引集合

// 查找高亮
let searchHighlightKeyword = '';    // 当前搜索高亮的关键词

// 配置存储
let entryPositionConfig = {};       // 条目位置/深度/顺序配置
let categoryDefaultConfig = {};     // 分类默认配置
```

---

## 配置说明

### 默认设置 (defaultSettings)

```javascript
const defaultSettings = {
    // 分块设置
    chunkSize: 15000,              // 每块字数（字符数）

    // 功能开关
    enablePlotOutline: false,      // 是否启用剧情大纲生成
    enableLiteraryStyle: false,    // 是否启用文风配置生成
    forceChapterMarker: true,      // 是否强制添加章节标记

    // API设置
    useTavernApi: true,            // 是否使用酒馆API
    apiTimeout: 120000,            // API超时时间（毫秒）
    customApiProvider: 'gemini',   // 自定义API提供商
    customApiKey: '',              // API密钥
    customApiEndpoint: '',         // API端点
    customApiModel: 'gemini-2.5-flash', // 模型名称

    // 并行设置
    parallelEnabled: true,         // 是否启用并行处理
    parallelConcurrency: 3,        // 并发数
    parallelMode: 'independent',   // 并行模式

    // 分卷设置
    useVolumeMode: false,          // 是否启用分卷模式

    // 章节正则
    chapterRegexPattern: '第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]',
    useCustomChapterRegex: false,  // 是否使用自定义正则

    // 提示词设置
    customWorldbookPrompt: '',     // 自定义世界书提示词
    customPlotPrompt: '',          // 自定义剧情提示词
    customStylePrompt: '',         // 自定义文风提示词
    customMergePrompt: '',         // 自定义合并提示词
    customRerollPrompt: '',        // 自定义重Roll提示词

    // 其他
    language: 'zh',                // 语言
    defaultWorldbookEntries: '',   // 默认世界书条目（JSON字符串）
    defaultWorldbookEntriesUI: [], // 默认世界书条目（UI数据）
    categoryLightSettings: null,   // 分类灯状态
    categoryDefaultConfig: {},     // 分类默认配置
    entryPositionConfig: {}        // 条目位置配置
};
```

### 并行处理配置

```javascript
let parallelConfig = {
    enabled: true,       // 是否启用并行处理
    concurrency: 3,      // 并发数（1-5）
    mode: 'independent'  // 模式：'independent'(独立) 或 'batch'(批量)
};
```

**模式说明：**
- **independent（独立模式）**：各记忆块完全独立处理，速度最快
- **batch（批量模式）**：批量聚合后���处理，结果更连贯

---

## 核心类

### Semaphore（信号量类）

用于控制并行任务的最大并发数。

```javascript
class Semaphore {
    constructor(max)    // 创建信号量，max为最大并发数
    async acquire()     // 获取信号量（如已达上限则等待）
    release()           // 释放信号量
    abort()             // 中止所有等待中的任务
    reset()             // 重置信号量状态
}
```

**使用示例：**
```javascript
const semaphore = new Semaphore(3); // 最多同时3个任务

async function processTask(task) {
    await semaphore.acquire();  // 获取信号量
    try {
        // 执行任务...
    } finally {
        semaphore.release();    // 释放信号量
    }
}
```

---

## 数据持久化

### MemoryHistoryDB

使用IndexedDB进行数据持久化，包含以下存储表：

| 存储表 | 说明 |
|--------|------|
| `history` | 处理历史记录 |
| `meta` | 元数据（如文件哈希） |
| `state` | 处理状态（用于断点续传） |
| `rolls` | Roll历史记录 |
| `categories` | 自定义分类配置 |

**主要方法：**

```javascript
// 数据库操作
await MemoryHistoryDB.openDB()                    // 打开数据库

// 历史记录
await MemoryHistoryDB.saveHistory(...)            // 保存历史
await MemoryHistoryDB.getAllHistory()             // 获取所有历史
await MemoryHistoryDB.getHistoryById(id)          // 根据ID获取历史
await MemoryHistoryDB.clearAllHistory()           // 清空所有历史

// 状态管理
await MemoryHistoryDB.saveState(processedIndex)   // 保存当前状态
await MemoryHistoryDB.loadState()                 // 加载保存的状态
await MemoryHistoryDB.clearState()                // 清空状态

// 文件哈希
await MemoryHistoryDB.saveFileHash(hash)          // 保存文件哈希
await MemoryHistoryDB.getSavedFileHash()          // 获取保存的哈希
await MemoryHistoryDB.clearFileHash()             // 清空文件哈希

// 分类管理
await MemoryHistoryDB.saveCustomCategories(cats)  // 保存自定义分类
await MemoryHistoryDB.getCustomCategories()       // 获取自定义分类

// Roll历史
await MemoryHistoryDB.saveRoll(...)               // 保存Roll记录
await MemoryHistoryDB.getRollsByMemoryIndex(idx)  // 获取指定记忆的Roll历史
await MemoryHistoryDB.clearAllRolls()             // 清空所有Roll历史
```

---

## API调用

### 支持的API提供商

| 提供商 | 说明 | 配置要求 |
|--------|------|----------|
| 酒馆API | 使用SillyTavern当前连接的AI | 无需额外配置 |
| Gemini | Google官方API | API Key |
| Gemini代理 | 第三方Gemini代理 | Endpoint + API Key |
| DeepSeek | DeepSeek官方API | API Key |
| OpenAI兼容 | 兼容OpenAI格式的API | Endpoint + (可选)API Key |

### API调用流程

```javascript
// 统一调用入口
async function callAPI(prompt, taskId = null) {
    if (settings.useTavernApi) {
        return await callSillyTavernAPI(prompt, taskId);
    } else {
        return await callCustomAPI(prompt);
    }
}
```

### 自定义API配置示例

**Gemini：**
```javascript
settings.customApiProvider = 'gemini';
settings.customApiKey = 'your-api-key';
settings.customApiModel = 'gemini-2.5-flash';
```

**OpenAI兼容（本地模型）：**
```javascript
settings.customApiProvider = 'openai';
settings.customApiEndpoint = 'http://127.0.0.1:5000/v1';
settings.customApiModel = 'your-model-name';
```

---

## 处理流程

### 主处理流程

```
1. 用户上传TXT文件
       ↓
2. 文件编码检测与读取
       ↓
3. 按章节正则分割内容
       ↓
4. 合并小块、分割大块 → 生成记忆队列
       ↓
5. 开始AI处理（并行/串行）
       ↓
   ┌─────────────────────────────────────┐
   │  对每个记忆块：                       │
   │  a. 生成系��提示词                    │
   │  b. 调用API获取响应                   │
   │  c. 解析JSON格式的世界书数据          │
   │  d. 合并到全局世界书                  │
   │  e. 保存历史记录                      │
   │  f. 更新UI显示                        │
   └─────────────────────────────────────┘
       ↓
6. 处理完成，显示结果
       ↓
7. 用户可进行：编辑、整理、合并、导出
```

### 记忆分裂机制

当AI返回Token超限错误时，自动触发记忆分裂：

```javascript
function splitMemoryAtIndex(memoryIndex) {
    const memory = memoryQueue[memoryIndex];
    const content = memory.content;
    const midPoint = Math.floor(content.length / 2);

    // 在中点附近寻找合适的分割点（段落或句号）
    let splitPoint = content.lastIndexOf('\n\n', midPoint + 1000);
    if (splitPoint < midPoint - 1000) {
        splitPoint = content.lastIndexOf('。', midPoint + 500);
    }

    // 分裂为两个新记忆块
    const firstHalf = { ...memory, content: content.slice(0, splitPoint) };
    const secondHalf = { ...memory, content: content.slice(splitPoint) };

    memoryQueue.splice(memoryIndex, 1, firstHalf, secondHalf);
}
```

---

## 世界书数据处理

### 数据规范化

将AI返回的各种格式统一转换为标准格式：

```javascript
// 输入可能的格式
{
    "content": "...",      // 英文字段
    "keywords": [...]
}

// 转换后的标准格式
{
    "内容": "...",         // 中文字段
    "关键词": [...]
}
```

### 增量合并

增量模式下，只合并变更的条目：

```javascript
function mergeWorldbookDataIncremental(target, source) {
    for (const category in source) {
        if (!target[category]) {
            target[category] = {};
        }
        for (const entryName in source[category]) {
            const entry = source[category][entryName];
            if (target[category][entryName]) {
                // 合并关键词（去重）
                // 追加内容
            } else {
                // 新增条目
                target[category][entryName] = entry;
            }
        }
    }
}
```

---

## UI功能说明

### 主界面区域

| 区域 | 功能 |
|------|------|
| 文件上传区 | 拖拽或点击上传TXT文件 |
| 设置面板 | API配置、分块设置、并行设置等 |
| 记忆队列 | 显示所有记忆块及其状态 |
| 进度区域 | 显示处理进度和实时日志 |
| 结果预览 | 显示生成的世界书内容 |

### 记忆块状态图标

| 图标 | 状态 |
|------|------|
| ⏳ | 等待处理 |
| 🔄 | 处理中 |
| ✅ | 处理成功 |
| ❗ | 处理失败 |

### 分类灯状态

| 灯色 | 含义 | SillyTavern中的效果 |
|------|------|---------------------|
| 🔵 蓝灯 | 常驻 | 条目始终激活 |
| 🟢 绿灯 | 触发 | 关键词匹配时激活 |

---

## 导出格式

### JSON格式

原始世界书数据的JSON导出：

```json
{
    "角色": {
        "张三": {
            "关键词": ["张三", "老张"],
            "内容": "..."
        }
    },
    "地点": { ... }
}
```

### SillyTavern格式

符合SillyTavern世界书导入规范的格式：

```json
{
    "entries": {
        "0": {
            "uid": 0,
            "key": ["张三", "老张"],
            "keysecondary": [],
            "comment": "张三",
            "content": "...",
            "constant": false,
            "selective": true,
            "order": 100,
            "position": 1,
            "depth": 4,
            "enabled": true,
            // ...其他SillyTavern字段
        }
    }
}
```

### 条目配置参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `position` | 插入位置 | 1 (after_char) |
| `depth` | 插入深度 | 4 |
| `order` | 排序顺序 | 100 |
| `constant` | 是否常驻（蓝灯） | 取决于分类灯状态 |
| `selective` | 是否选择性触发 | true |

---

## 公开API

模块对外暴露的接口（挂载在 `window.TxtToWorldbook`）：

```javascript
window.TxtToWorldbook = {
    // 状态获取
    getWorldbook: () => generatedWorldbook,
    getMemoryQueue: () => memoryQueue,
    getSettings: () => settings,

    // 操作方法
    startProcessing: () => startAIProcessing(),
    stopProcessing: () => { isProcessingStopped = true; },
    exportWorldbook: () => exportWorldbook(),

    // 历史操作
    _showHistoryDetail: (id) => showHistoryDetail(id),
    _rollbackToHistory: (id) => rollbackToHistory(id),

    // 其他内部方法...
};
```

---

## 使用技巧

### 1. 分块大小建议

| API提供商 | 建议分块大小 |
|-----------|-------------|
| Gemini | 15-20万字符 |
| DeepSeek | 8-10万字符 |
| 本地模型 | 根据模型上下文长度调整 |

### 2. 并行处理建议

- **并发数2-3**：平衡速度和API压力
- **独立模式**：适合章节独立性强的小说
- **批量模式**：适合需要上下文连贯的处理

### 3. 处理失败处理

1. 查看失败原因（点击红色记忆块）
2. 可以编辑记忆块内容后重试
3. 使用"修复失败记忆"一键重试所有失败块
4. 单个记忆块可以使用"重Roll"功能

### 4. 断点续传

- 处理中途可以暂停
- 刷新页面后会自动提示恢复
- 进度保存在浏览器IndexedDB中

---

## 常见问题

### Q: 为什么处理失败？

**可能原因：**
1. API连接问题 - 检查网络和API配置
2. Token超限 - 减小分块大小或等待自动分裂
3. API返回格式错误 - 查看详细错误信息

### Q: 如何提高处理质量？

1. 使用更强的模型（如Gemini Pro）
2. 自定义提示词，针对特定类型小说优化
3. 处理后使用"整理条目"功能优化内容
4. 使用"别名合并"合并同一实体的不同称呼

### Q: 导出后如何使用？

1. 下载SillyTavern格式的JSON文件
2. 在SillyTavern中进入"世界信息"
3. 点击导入，选择下载的文件
4. 将世界书绑定到对应角色卡

---

## 版本信息

- **模块名称**：TXT转世界书独立模块
- **适用平台**：SillyTavern
- **依赖**：无外部依赖，纯JavaScript实现
- **浏览器支持**：支持IndexedDB的现代浏览器

---

## 开发者信息

本模块为📚小说自动生成器项目的一部分。

项目地址：https://github.com/CyrilPeng/novel-auto-generator

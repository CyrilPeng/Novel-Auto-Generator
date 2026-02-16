# Worldbook 模块重构方案

> 版本: 1.0  
> 日期: 2026-02-15  
> 目标: 将 txtToWorldbook.js、epubToTxt.js、worldbookExport.js 三个模块重构为统一的世界书处理模块

---

## 1. 重构目标

### 1.1 核心目标

1. **模块化**: 将三大功能模块合并为统一的世界书处理中心
2. **可维护性**: 分离关注点，每个文件职责单一
3. **可扩展性**: 便于后续添加新的世界书相关功能
4. **代码复用**: 提取公共组件，消除重复代码

### 1.2 功能保留清单

#### txtToWorldbook.js 功能保留
- [x] TXT文件解析与编码检测 (UTF-8/GBK/Big5等)
- [x] 智能分块处理 (按字数/章节)
- [x] 多API支持 (酒馆API、Gemini、DeepSeek、OpenAI兼容)
- [x] 并行处理机制 (Semaphore信号量控制)
- [x] 世界书生成功能 (分类、条目、关键词)
- [x] 历史记录与版本回滚 (IndexedDB)
- [x] 条目级别重Roll功能
- [x] 自定义分类系统
- [x] 增量输出模式
- [x] 自动Token超限分裂
- [x] 消息链配置 (多角色提示词)
- [x] 整理条目预设系统
- [x] 条目位置/深度/顺序配置
- [x] 查找替换功能
- [x] 别名合并功能
- [x] 任务导入/导出
- [x] 设置导入/导出
- [x] UI界面 (弹窗、面板、事件)

#### epubToTxt.js 功能保留
- [x] EPUB文件解析 (JSZip)
- [x] HTML转纯文本
- [x] 批量文件导入
- [x] 文件排序 (上移/下移/自然排序)
- [x] 批量合并导出TXT

#### worldbookExport.js 功能保留
- [x] 获取已启用世界书 (多方式兼容)
- [x] 加载世界书数据
- [x] 分别导出 (单个JSON)
- [x] 合并导出 (合并为一个世界书)
- [x] 进度显示

---

## 2. 功能重叠点与依赖分析

### 2.1 公共功能识别

| 功能 | txtToWorldbook | epubToTxt | worldbookExport | 提取为公共组件 |
|------|----------------|-----------|-----------------|----------------|
| 文件下载 | ✅ | ✅ | ✅ | `utils/file.js` |
| HTML转文本 | ✅(简化) | ✅(完整) | ❌ | `utils/html.js` |
| 弹窗UI框架 | ✅ | ✅ | ✅ | `components/Modal.js` |
| SillyTavern API | ✅ | ❌ | ✅ | `api/tavern.js` |
| 请求头获取 | ❌ | ❌ | ✅ | `api/tavern.js` |
| Token估算 | ✅ | ❌ | ❌ | `utils/token.js` |
| 自然排序 | ✅ | ✅ | ❌ | `utils/sort.js` |
| 转义HTML | ❌ | ❌ | ✅ | `utils/html.js` |

### 2.2 数据流向分析

```
┌─────────────────────────────────────────────────────────────────┐
│                     世界书处理模块 (Worldbook)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ EPUB导入    │───▶│ 文本内容     │───▶│ TXT转世界书      │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│         │                                          │            │
│         │                                    ┌─────▼──────┐     │
│         └───────────────────────────────────▶│ 世界书数据  │     │
│                                              └─────┬──────┘     │
│                                                    │            │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────▼──────┐     │
│  │ SillyTavern │───▶│ 已启用世界书列表 │───▶│ 世界书导出  │   │
│  └─────────────┘    └──────────────────┘    └────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 依赖关系图

```
Worldbook/index.js (入口)
    │
    ├── core/
    │   ├── Processor.js      ◄── 主处理器，协调各模块
    │   ├── Config.js         ◄── 配置管理
    │   └── State.js          ◄── 状态管理
    │
    ├── api/
    │   ├── index.js          ◄── API统一入口
    │   ├── TavernAPI.js      ◄── 酒馆API封装
    │   ├── GeminiAPI.js      ◄── Gemini API
    │   ├── DeepSeekAPI.js    ◄── DeepSeek API
    │   └── OpenAICompat.js   ◄── OpenAI兼容API
    │
    ├── db/
    │   ├── index.js          ◄── 数据库统一入口
    │   ├── IndexedDB.js      ◄── IndexedDB封装
    │   ├── HistoryStore.js   ◄── 历史记录存储
    │   ├── StateStore.js     ◄── 状态存储
    │   └── RollStore.js      ◄── Roll历史存储
    │
    ├── parsers/
    │   ├── index.js          ◄── 解析器统一入口
    │   ├── TxtParser.js      ◄── TXT文件解析
    │   ├── EpubParser.js     ◄── EPUB文件解析
    │   └── ChapterSplitter.js◄── 章节分割器
    │
    ├── generators/
    │   ├── index.js          ◄── 生成器统一入口
    │   ├── WorldbookGen.js   ◄── 世界书生成器
    │   ├── CategoryMgr.js    ◄── 分类管理器
    │   └── EntryMgr.js       ◄── 条目管理器
    │
    ├── exporters/
    │   ├── index.js          ◄── 导出器统一入口
    │   ├── TavernExport.js   ◄── SillyTavern格式导出
    │   ├── JsonExport.js     ◄── JSON格式导出
    │   └── TxtExport.js      ◄── TXT格式导出
    │
    ├── ui/
    │   ├── index.js          ◄── UI组件统一入口
    │   ├── MainPanel.js      ◄── 主面板
    │   ├── ConfigPanel.js    ◄── 配置面板
    │   ├── ProgressPanel.js  ◄── 进度面板
    │   └── components/       ◄── 通用UI组件
    │       ├── Modal.js
    │       ├── Button.js
    │       ├── Input.js
    │       └── Select.js
    │
    ├── utils/
    │   ├── index.js          ◄── 工具函数统一入口
    │   ├── file.js           ◄── 文件操作
    │   ├── html.js           ◄── HTML处理
    │   ├── token.js          ◄── Token估算
    │   ├── sort.js           ◄── 排序算法
    │   ├── hash.js           ◄── 哈希计算
    │   └── text.js           ◄── 文本处理
    │
    └── styles/
        └── index.css         ◄── 样式文件
```

---

## 3. 新模块化架构设计

### 3.1 目录结构

```
Worldbook/
│
├── index.js                    # 模块入口点，负责初始化和暴露API
├── manifest.json               # 模块元数据 (可选)
│
├── core/                       # 核心逻辑层
│   ├── index.js               # 核心模块导出
│   ├── Processor.js           # 主处理器，协调各子模块
│   ├── Config.js              # 配置管理 (defaultSettings, 持久化)
│   ├── State.js               # 运行时状态管理
│   └── EventBus.js            # 事件总线 (模块间通信)
│
├── api/                        # API层
│   ├── index.js               # API统一入口
│   ├── BaseAPI.js             # API基类 (抽象接口)
│   ├── TavernAPI.js           # SillyTavern API封装
│   ├── GeminiAPI.js           # Gemini API实现
│   ├── DeepSeekAPI.js         # DeepSeek API实现
│   ├── OpenAICompat.js        # OpenAI兼容API实现
│   └── APIManager.js          # API管理器 (根据配置选择API)
│
├── db/                         # 数据持久化层
│   ├── index.js               # 数据库导出
│   ├── Database.js            # IndexedDB封装 (底层)
│   ├── HistoryStore.js        # 历史记录操作
│   ├── StateStore.js          # 状态保存/恢复
│   ├── RollStore.js           # Roll历史操作
│   └── CategoryStore.js       # 自定义分类存储
│
├── parsers/                    # 解析器层
│   ├── index.js               # 解析器导出
│   ├── BaseParser.js          # 解析器基类
│   ├── TxtParser.js           # TXT文件解析
│   ├── EpubParser.js          # EPUB文件解析
│   └── ContentSplitter.js     # 内容分块/章节分割
│
├── generators/                 # 生成器层
│   ├── index.js               # 生成器导出
│   ├── WorldbookGenerator.js  # 世界书生成主逻辑
│   ├── CategoryManager.js     # 分类管理
│   ├── EntryManager.js        # 条目管理 (CRUD)
│   └── PromptBuilder.js       # 提示词构建器
│
├── exporters/                  # 导出器层
│   ├── index.js               # 导出器导出
│   ├── BaseExporter.js        # 导出器基类
│   ├── TavernExporter.js      # SillyTavern格式导出
│   ├── JSONExporter.js        # JSON格式导出
│   └── TXTExporter.js         # TXT格式导出
│
├── importers/                  # 导入器层 (新增，未来扩展)
│   ├── index.js
│   └── WorldbookImporter.js   # 世界书导入
│
├── ui/                         # UI层
│   ├── index.js               # UI组件导出
│   ├── MainPanel.js           # 主控制面板
│   ├── FileImportPanel.js     # 文件导入面板
│   ├── ConfigPanel.js         # 配置面板
│   ├── ProgressPanel.js       # 进度显示面板
│   ├── PreviewPanel.js        # 预览面板
│   ├── HistoryPanel.js        # 历史记录面板
│   └── components/            # 通用UI组件
│       ├── Modal.js           # 弹窗组件
│       ├── Button.js          # 按钮组件
│       ├── Input.js           # 输入组件
│       ├── Select.js          # 选择组件
│       ├── Checkbox.js        # 复选框组件
│       ├── Tabs.js            # 标签页组件
│       └── Toast.js           # 提示组件
│
├── utils/                      # 工具函数
│   ├── index.js               # 工具函数导出
│   ├── file.js                # 文件操作 (下载、读取)
│   ├── html.js                # HTML处理 (转文本、转义)
│   ├── token.js               # Token估算
│   ├── sort.js                # 排序算法
│   ├── hash.js                # 哈希计算 (SHA-256)
│   ├── text.js                # 文本处理 (编码、截取)
│   ├── validation.js          # 数据验证
│   └── format.js              # 格式化工具
│
└── styles/                     # 样式
    ├── index.css              # 主样式文件
    ├── components.css         # 组件样式
    ├── panels.css             # 面板样式
    └── themes.css             # 主题变量
```

### 3.2 模块详细设计

#### 3.2.1 Core 层 (核心逻辑)

**Processor.js** - 主处理器
```javascript
class WorldbookProcessor {
  constructor() {
    this.config = new Config();
    this.state = new State();
    this.apiManager = new APIManager();
    this.parser = null; // 根据文件类型动态设置
    this.generator = new WorldbookGenerator();
    this.db = new Database();
  }

  // 主要流程控制
  async processTxtFile(file) { /* ... */ }
  async processEpubFile(file) { /* ... */ }
  async exportWorldbook(format, options) { /* ... */ }
  async generateFromContent(content) { /* ... */ }
  
  // 状态控制
  pause() { /* ... */ }
  resume() { /* ... */ }
  stop() { /* ... */ }
  
  // 事件
  on(event, callback) { /* ... */ }
  emit(event, data) { /* ... */ }
}
```

**Config.js** - 配置管理
```javascript
class Config {
  constructor() {
    this.defaults = { /* 所有默认配置 */ };
    this.settings = this.load();
  }
  
  load() { /* 从localStorage读取 */ }
  save() { /* 保存到localStorage */ }
  get(key) { /* ... */ }
  set(key, value) { /* ... */ }
  reset() { /* 重置为默认 */ }
  import(data) { /* 导入配置 */ }
  export() { /* 导出配置 */ }
}
```

**State.js** - 运行时状态
```javascript
class State {
  constructor() {
    this.isProcessing = false;
    this.isPaused = false;
    this.progress = 0;
    this.currentTask = null;
    this.queue = [];
    this.results = [];
  }
  
  saveToDB() { /* 保存到IndexedDB */ }
  loadFromDB() { /* 从IndexedDB恢复 */ }
}
```

#### 3.2.2 API 层

**BaseAPI.js** - 抽象基类
```javascript
class BaseAPI {
  constructor(config) {
    this.config = config;
    this.timeout = config.timeout || 120000;
  }
  
  async generate(messages) {
    throw new Error('Must implement generate method');
  }
  
  async streamGenerate(messages, onChunk) {
    throw new Error('Must implement streamGenerate method');
  }
  
  // 公共工具方法
  createTimeoutPromise() { /* ... */ }
  handleError(error) { /* ... */ }
}
```

**APIManager.js** - API路由
```javascript
class APIManager {
  constructor(config) {
    this.config = config;
    this.api = this.createAPI();
  }
  
  createAPI() {
    switch(this.config.provider) {
      case 'tavern': return new TavernAPI(this.config);
      case 'gemini': return new GeminiAPI(this.config);
      case 'deepseek': return new DeepSeekAPI(this.config);
      case 'openai': return new OpenAICompat(this.config);
      default: throw new Error('Unknown provider');
    }
  }
  
  async generate(messages) {
    return this.api.generate(messages);
  }
}
```

#### 3.2.3 DB 层

**Database.js** - IndexedDB封装
```javascript
class Database {
  constructor() {
    this.dbName = 'WorldbookDB';
    this.version = 1;
    this.db = null;
  }
  
  async open() { /* 打开数据库 */ }
  async close() { /* 关闭数据库 */ }
  
  // 存储管理
  getStore(name, mode = 'readonly') { /* ... */ }
}
```

**HistoryStore.js** - 历史记录
```javascript
class HistoryStore {
  constructor(db) {
    this.db = db;
    this.storeName = 'history';
  }
  
  async save(record) { /* ... */ }
  async getAll() { /* ... */ }
  async getById(id) { /* ... */ }
  async rollbackTo(id) { /* ... */ }
  async clear() { /* ... */ }
}
```

#### 3.2.4 Parsers 层

**BaseParser.js** - 解析器基类
```javascript
class BaseParser {
  constructor() {
    this.encoding = 'UTF-8';
  }
  
  async parse(file) {
    throw new Error('Must implement parse method');
  }
  
  async detectEncoding(file) { /* ... */ }
}
```

**TxtParser.js** - TXT解析
```javascript
class TxtParser extends BaseParser {
  async parse(file) {
    const { encoding, content } = await this.detectEncoding(file);
    return {
      title: file.name.replace(/\.txt$/i, ''),
      content,
      encoding,
      size: content.length
    };
  }
}
```

**EpubParser.js** - EPUB解析
```javascript
class EpubParser extends BaseParser {
  constructor() {
    super();
    this.jsZip = null; // 动态加载
  }
  
  async loadJSZip() { /* 加载JSZip库 */ }
  
  async parse(file) {
    // 解析EPUB容器
    // 提取OPF
    // 遍历章节
    // 返回结构化数据
  }
  
  htmlToText(html) { /* HTML转纯文本 */ }
}
```

**ContentSplitter.js** - 内容分割
```javascript
class ContentSplitter {
  constructor(options) {
    this.chunkSize = options.chunkSize || 15000;
    this.useVolumeMode = options.useVolumeMode || false;
    this.chapterPattern = options.chapterPattern || /第[零一二三四五六七八九十百千万\d]+[章回卷节部篇]/;
  }
  
  split(content) {
    // 按章节或字数分块
    // 返回数组: [{ title, content, index }]
  }
  
  detectChapters(content) {
    // 检测章节边界
  }
}
```

#### 3.2.5 Generators 层

**WorldbookGenerator.js** - 世界书生成
```javascript
class WorldbookGenerator {
  constructor(apiManager, config) {
    this.api = apiManager;
    this.config = config;
    this.categoryManager = new CategoryManager(config);
    this.entryManager = new EntryManager();
    this.promptBuilder = new PromptBuilder(config);
  }
  
  async generate(chunks, options) {
    // 1. 准备队列
    // 2. 并行处理 (使用Semaphore)
    // 3. 解析AI响应
    // 4. 合并结果
    // 5. 保存历史
  }
  
  async processChunk(chunk, taskId) {
    // 构建提示词
    // 调用API
    // 解析响应
    // 返回条目数据
  }
  
  parseAIResponse(text) {
    // 提取JSON
    // 处理格式错误
    // 返回结构化数据
  }
}
```

**CategoryManager.js** - 分类管理
```javascript
class CategoryManager {
  constructor(config) {
    this.config = config;
    this.categories = this.loadCategories();
  }
  
  loadCategories() {
    // 合并默认分类和自定义分类
  }
  
  getEnabled() { /* 获取启用的分类 */ }
  add(category) { /* 添加分类 */ }
  update(name, data) { /* 更新分类 */ }
  remove(name) { /* 删除分类 */ }
  reset() { /* 重置为默认 */ }
}
```

**EntryManager.js** - 条目管理
```javascript
class EntryManager {
  constructor() {
    this.entries = new Map(); // category -> Map<name, entry>
  }
  
  add(category, name, entry) { /* ... */ }
  update(category, name, data) { /* ... */ }
  remove(category, name) { /* ... */ }
  get(category, name) { /* ... */ }
  getAll(category) { /* ... */ }
  mergeEntries(entries) { /* 合并重复条目 */ }
  consolidate(category, name) { /* 整理条目 */ }
}
```

**PromptBuilder.js** - 提示词构建
```javascript
class PromptBuilder {
  constructor(config) {
    this.config = config;
  }
  
  buildForGeneration(chunk, categories) {
    // 构建世界书生成提示词
  }
  
  buildForMerge(entryA, entryB) {
    // 构建合并提示词
  }
  
  buildForConsolidate(entry) {
    // 构建整理提示词
  }
  
  buildForReroll(entry, customPrompt) {
    // 构建重Roll提示词
  }
  
  applyMessageChain(prompt) {
    // 应用消息链配置
  }
}
```

#### 3.2.6 Exporters 层

**BaseExporter.js** - 导出器基类
```javascript
class BaseExporter {
  constructor() {
    this.mimeType = 'application/json';
    this.extension = 'json';
  }
  
  export(data, filename) {
    throw new Error('Must implement export method');
  }
  
  download(content, filename) {
    // 通用下载逻辑
  }
}
```

**TavernExporter.js** - SillyTavern格式
```javascript
class TavernExporter extends BaseExporter {
  export(worldbook, options) {
    // 转换为SillyTavern格式
    // position/depth/order 处理
    // 返回JSON
  }
  
  // 获取当前已启用的世界书
  async getActiveWorldbooks() { /* ... */ }
  
  // 加载世界书数据
  async loadWorldbook(name) { /* ... */ }
}
```

**JSONExporter.js** - JSON格式
```javascript
class JSONExporter extends BaseExporter {
  export(worldbook, options) {
    // 导出原始JSON
    return JSON.stringify(worldbook, null, 2);
  }
}
```

**TXTExporter.js** - TXT格式
```javascript
class TXTExporter extends BaseExporter {
  constructor() {
    super();
    this.mimeType = 'text/plain';
    this.extension = 'txt';
  }
  
  export(worldbook, options) {
    // 转换为TXT格式
  }
}
```

#### 3.2.7 UI 层

**Modal.js** - 弹窗组件
```javascript
class Modal {
  constructor(options) {
    this.id = options.id || 'wb-modal';
    this.title = options.title || '';
    this.content = options.content || '';
    this.width = options.width || '500px';
    this.onClose = options.onClose || (() => {});
  }
  
  create() {
    // 创建DOM结构
    // 绑定事件
    // 返回this
  }
  
  open() { /* 显示弹窗 */ }
  close() { /* 关闭弹窗 */ }
  destroy() { /* 销毁DOM */ }
  
  setContent(html) { /* 更新内容 */ }
  setTitle(title) { /* 更新标题 */ }
}
```

**MainPanel.js** - 主面板
```javascript
class MainPanel {
  constructor(processor) {
    this.processor = processor;
    this.element = null;
  }
  
  create() {
    // 创建主UI结构
    // 绑定事件
    // 返回DOM元素
  }
  
  render() {
    // 插入到SillyTavern扩展面板
  }
  
  updateProgress(progress) { /* 更新进度 */ }
  updateStatus(status) { /* 更新状态 */ }
}
```

#### 3.2.8 Utils 层

**file.js** - 文件操作
```javascript
export function downloadFile(content, filename, mimeType) { /* ... */ }
export function readFileAsText(file, encoding) { /* ... */ }
export function readFileAsArrayBuffer(file) { /* ... */ }
export async function detectFileEncoding(file) { /* ... */ }
```

**token.js** - Token估算
```javascript
export function estimateTokenCount(text) {
  // 中文字符: 1.5 token
  // 英文单词: 1 token
  // 数字: 1 token
  // 标点: 0.5 token
}

export function getEntryTokenCount(entry) {
  // 计算关键词+内容的token数
}
```

**sort.js** - 排序算法
```javascript
export function naturalSort(items, key) {
  // 自然排序 (支持中文数字)
}

export function chineseNumToInt(str) {
  // 中文数字转整数
}
```

**hash.js** - 哈希计算
```javascript
export async function calculateSHA256(content) {
  // 使用crypto.subtle计算SHA256
  // 回退到简易哈希
}
```

**html.js** - HTML处理
```javascript
export function htmlToText(html) {
  // DOMParser解析
  // 移除script/style
  // 块级元素加换行
}

export function escapeHtml(text) {
  // 转义HTML特殊字符
}
```

### 3.3 入口文件 (index.js)

```javascript
import { WorldbookProcessor } from './core/Processor.js';
import { MainPanel } from './ui/MainPanel.js';
import './styles/index.css';

// 创建全局实例
let processor = null;
let panel = null;

function init() {
  if (processor) return;
  
  processor = new WorldbookProcessor();
  panel = new MainPanel(processor);
  panel.create();
  panel.render();
  
  console.log('[Worldbook] 模块已初始化');
}

function open() {
  if (!panel) init();
  panel.show();
}

function close() {
  if (panel) panel.hide();
}

// 暴露到全局
window.WorldbookModule = {
  init,
  open,
  close,
  get processor() { return processor; }
};

// 自动初始化 (如果SillyTavern已加载)
if (typeof SillyTavern !== 'undefined') {
  init();
}

export { WorldbookProcessor, MainPanel };
```

---

## 4. 迁移计划

### 4.1 阶段划分

#### 阶段一: 基础设施搭建 (Day 1-2)
- [ ] 创建 Worldbook/ 目录结构
- [ ] 实现 utils/ 层工具函数
- [ ] 实现 ui/components/ 基础组件
- [ ] 编写单元测试

#### 阶段二: 核心层实现 (Day 3-5)
- [ ] 实现 core/ 层 (Config, State, Processor)
- [ ] 实现 db/ 层 (Database, 各Store)
- [ ] 实现 api/ 层 (各API实现)
- [ ] 集成测试

#### 阶段三: 功能层实现 (Day 6-9)
- [ ] 实现 parsers/ 层 (TxtParser, EpubParser)
- [ ] 实现 generators/ 层 (WorldbookGenerator, CategoryManager, EntryManager)
- [ ] 实现 exporters/ 层 (各Exporter)
- [ ] 功能测试

#### 阶段四: UI层实现 (Day 10-12)
- [ ] 实现各面板组件
- [ ] 集成主面板
- [ ] 样式调整
- [ ] UI测试

#### 阶段五: 集成与验证 (Day 13-14)
- [ ] 集成到主入口
- [ ] 功能验证 (对比原模块)
- [ ] 性能测试
- [ ] Bug修复

#### 阶段六: 替换与清理 (Day 15)
- [ ] 更新 index.js 引用
- [ ] 废弃旧模块
- [ ] 文档更新
- [ ] 发布

### 4.2 代码迁移对照表

| 原文件 | 原函数/类 | 新文件 | 新函数/类 | 备注 |
|--------|-----------|--------|-----------|------|
| txtToWorldbook.js | `MemoryHistoryDB` | `db/Database.js` | `Database` | 重构为类 |
| txtToWorldbook.js | `calculateFileHash` | `utils/hash.js` | `calculateSHA256` | 函数提取 |
| txtToWorldbook.js | `detectBestEncoding` | `utils/file.js` | `detectFileEncoding` | 函数提取 |
| txtToWorldbook.js | `callSillyTavernAPI` | `api/TavernAPI.js` | `TavernAPI.generate` | 封装为类方法 |
| txtToWorldbook.js | `callCustomAPI` | `api/` 各文件 | 相应方法 | 拆分实现 |
| txtToWorldbook.js | `TxtParser` | `parsers/TxtParser.js` | `TxtParser` | 提取为模块 |
| txtToWorldbook.js | `EpubParser` | `parsers/EpubParser.js` | `EpubParser` | 合并原epubToTxt |
| txtToWorldbook.js | `generateWorldbook` | `generators/WorldbookGenerator.js` | `WorldbookGenerator.generate` | 重构 |
| txtToWorldbook.js | `exportAsTavern` | `exporters/TavernExporter.js` | `TavernExporter.export` | 合并原worldbookExport |
| txtToWorldbook.js | UI相关代码 | `ui/` 各面板 | 相应组件 | 组件化重构 |
| epubToTxt.js | `parseEpub` | `parsers/EpubParser.js` | `EpubParser.parse` | 合并 |
| epubToTxt.js | `htmlToText` | `utils/html.js` | `htmlToText` | 提取为工具函数 |
| worldbookExport.js | `getActiveWorldBookNames` | `exporters/TavernExporter.js` | `TavernExporter.getActiveWorldbooks` | 合并 |
| worldbookExport.js | `loadWorldBookData` | `exporters/TavernExporter.js` | `TavernExporter.loadWorldbook` | 合并 |
| worldbookExport.js | `downloadJson` | `utils/file.js` | `downloadFile` | 提取为通用函数 |

### 4.3 依赖处理

#### 外部依赖
- **jQuery**: SillyTavern内置，继续使用
- **JSZip**: 动态加载 (CDN)，用于EPUB解析
- **SillyTavern API**: 通过 `SillyTavern.getContext()` 访问

#### 内部依赖
```
index.js
  ├─▶ core/Processor.js
  │     ├─▶ core/Config.js
  │     ├─▶ core/State.js
  │     ├─▶ api/APIManager.js
  │     │     ├─▶ api/TavernAPI.js
  │     │     ├─▶ api/GeminiAPI.js
  │     │     ├─▶ api/DeepSeekAPI.js
  │     │     └─▶ api/OpenAICompat.js
  │     ├─▶ parsers/TxtParser.js
  │     ├─▶ parsers/EpubParser.js
  │     ├─▶ generators/WorldbookGenerator.js
  │     │     ├─▶ generators/CategoryManager.js
  │     │     ├─▶ generators/EntryManager.js
  │     │     └─▶ generators/PromptBuilder.js
  │     ├─▶ exporters/TavernExporter.js
  │     └─▶ db/Database.js
  │
  └─▶ ui/MainPanel.js
        ├─▶ ui/components/Modal.js
        ├─▶ ui/FileImportPanel.js
        ├─▶ ui/ConfigPanel.js
        ├─▶ ui/ProgressPanel.js
        └─▶ ui/HistoryPanel.js
```

---

## 5. 接口设计

### 5.1 公共 API

```javascript
// 主处理器 API
WorldbookProcessor {
  // 文件处理
  async processTxtFile(File file): Promise<ProcessResult>
  async processEpubFile(File file): Promise<ProcessResult>
  
  // 生成控制
  async generate(options: GenerationOptions): Promise<Worldbook>
  pause(): void
  resume(): void
  stop(): void
  
  // 导出
  async export(format: 'tavern'|'json'|'txt', options): Promise<void>
  
  // 导入
  async import(data: WorldbookData): Promise<void>
  
  // 历史管理
  async saveHistory(): Promise<void>
  async rollback(historyId): Promise<void>
  
  // 事件
  on(event: string, callback: Function): void
  off(event: string, callback: Function): void
}

// 配置 API
Config {
  get(key: string): any
  set(key: string, value: any): void
  save(): void
  load(): void
  export(): ConfigData
  import(data: ConfigData): void
}

// 生成选项
interface GenerationOptions {
  chunkSize?: number;           // 分块大小
  concurrency?: number;         // 并行数
  categories?: string[];        // 启用的分类
  enablePlotOutline?: boolean;  // 启用剧情大纲
  enableLiteraryStyle?: boolean;// 启用文风配置
  startFromIndex?: number;      // 起始索引
  useTavernApi?: boolean;       // 使用酒馆API
  customApiConfig?: ApiConfig;  // 自定义API配置
}

// 处理结果
interface ProcessResult {
  title: string;
  content: string;
  chunks: Chunk[];
  metadata: {
    encoding?: string;
    fileSize: number;
    chapterCount?: number;
  };
}

// 世界书数据结构
interface Worldbook {
  name: string;
  categories: Map<string, Category>;
  entries: Map<string, Entry[]>;
  metadata: {
    createdAt: number;
    version: string;
    source: string;
  };
}
```

### 5.2 事件系统

```javascript
// 处理器事件
processor.on('start', (data) => { /* 开始处理 */ });
processor.on('progress', (data) => { /* 进度更新 */ });
processor.on('chunk.complete', (data) => { /* 单个块完成 */ });
processor.on('pause', () => { /* 暂停 */ });
processor.on('resume', () => { /* 恢复 */ });
processor.on('complete', (result) => { /* 完成 */ });
processor.on('error', (error) => { /* 错误 */ });
processor.on('stop', () => { /* 停止 */ });

// 数据格式
eventData = {
  progress: number,        // 0-100
  current: number,         // 当前处理索引
  total: number,          // 总数
  message?: string,       // 状态消息
  result?: any           // 结果数据
}
```

---

## 6. 测试策略

### 6.1 单元测试

| 模块 | 测试内容 | 测试用例数 |
|------|----------|-----------|
| utils/file.js | 文件读取、编码检测、下载 | 10+ |
| utils/token.js | Token估算准确性 | 10+ |
| utils/sort.js | 自然排序算法 | 10+ |
| parsers/TxtParser.js | TXT解析 | 5+ |
| parsers/EpubParser.js | EPUB解析 | 5+ |
| generators/PromptBuilder.js | 提示词构建 | 10+ |
| db/Database.js | IndexedDB操作 | 10+ |

### 6.2 集成测试

- [ ] TXT文件全流程处理
- [ ] EPUB文件全流程处理
- [ ] 多API调用测试
- [ ] 并行处理测试
- [ ] 历史记录与回滚
- [ ] 导出功能测试

### 6.3 对比测试

与原有模块进行对比，确保功能一致性:
- [ ] 相同输入产生相同输出
- [ ] 性能不低于原有模块
- [ ] 内存占用合理

---

## 7. 风险评估

### 7.1 潜在风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 功能遗漏 | 中 | 高 | 详细功能清单，逐条验证 |
| 性能下降 | 低 | 中 | 性能测试，优化瓶颈 |
| 兼容性问题 | 中 | 高 | 多浏览器测试，渐进式迁移 |
| 数据丢失 | 低 | 高 | 保留原模块备份，数据迁移脚本 |
| 代码复杂度增加 | 中 | 中 | 严格模块化，文档完善 |

### 7.2 回滚策略

1. 保留原模块文件直到新模块稳定运行
2. 使用Git分支管理重构代码
3. 准备快速切换配置 (manifest.json中修改js入口)
4. 数据库版本隔离 (新模块使用新数据库名)

---

## 8. 文档规划

### 8.1 技术文档

- [ ] `README.md` - 模块说明
- [ ] `ARCHITECTURE.md` - 架构设计文档
- [ ] `API.md` - API使用文档
- [ ] `MIGRATION.md` - 迁移指南

### 8.2 代码文档

- [ ] JSDoc注释覆盖率 > 80%
- [ ] 每个公共方法都有使用示例
- [ ] 复杂逻辑添加行内注释

### 8.3 用户文档

- [ ] 使用教程 (更新原有README)
- [ ] 常见问题FAQ
- [ ] 视频演示脚本

---

## 9. 附录

### 9.1 术语表

| 术语 | 说明 |
|------|------|
| 世界书 (Worldbook) | SillyTavern中用于存储背景设定的结构化数据 |
| 分类 (Category) | 世界书中的条目分类，如角色、地点、组织 |
| 条目 (Entry) | 世界书中的单个记录，包含关键词和内容 |
| 记忆块 (Chunk) | 小说文本被分割后的片段 |
| 重Roll | 对单个条目重新生成内容 |
| 分卷 (Volume) | 长篇小说的卷/册划分 |

### 9.2 参考资料

- [SillyTavern Extension API文档](https://docs.sillytavern.app/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [JSZip Documentation](https://stuk.github.io/jszip/)

---

**文档结束**

> 本重构方案由 AI 生成，经人工审核后执行。

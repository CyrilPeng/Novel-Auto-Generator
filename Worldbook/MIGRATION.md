# 世界书模块重构说明

## 重构完成时间
2026-02-15

## 变更说明

### 已废弃的旧模块
- `txtToWorldbook.js` → `txtToWorldbook.js.deprecated`
- `worldbookExport.js` → `worldbookExport.js.deprecated`
- `epubToTxt.js` → `epubToTxt.js.deprecated`

### 新的模块化架构
所有世界书相关功能已重构到 `Worldbook/` 目录下：

```
Worldbook/
├── index.js                    # 模块入口
├── core/                       # 核心逻辑层
│   ├── Config.js              # 配置管理
│   ├── State.js               # 状态管理
│   └── Processor.js           # 主处理器
├── api/                        # API层
│   ├── BaseAPI.js             # API基类
│   ├── TavernAPI.js           # 酒馆API
│   ├── GeminiAPI.js           # Gemini API
│   ├── DeepSeekAPI.js         # DeepSeek API
│   ├── OpenAICompat.js        # OpenAI兼容API
│   └── APIManager.js          # API管理器
├── db/                         # 数据层
│   ├── Database.js            # IndexedDB封装
│   ├── HistoryStore.js        # 历史记录
│   ├── StateStore.js          # 状态存储
│   └── RollStore.js           # Roll历史
├── parsers/                    # 解析器层
│   ├── TxtParser.js           # TXT解析
│   └── EpubParser.js          # EPUB解析
├── generators/                 # 生成器层
│   ├── CategoryManager.js     # 分类管理
│   └── EntryManager.js        # 条目管理
├── exporters/                  # 导出器层
│   ├── TavernExporter.js      # 酒馆格式导出
│   ├── JSONExporter.js        # JSON导出
│   └── TXTExporter.js         # TXT导出
├── utils/                      # 工具函数
│   ├── file.js                # 文件操作
│   ├── html.js                # HTML处理
│   ├── token.js               # Token估算
│   ├── sort.js                # 排序算法
│   └── hash.js                # 哈希计算
└── styles/                     # 样式
    └── index.css              # 主样式
```

## 代码规范改进

### 1. 注释
- 所有注释已统一为中文
- 添加了详细的JSDoc注释

### 2. 控制台输出
- 所有控制台输出已改为中文
- 添加了统一的日志前缀标识模块来源

### 3. 代码结构
- 模块化设计，职责分离
- 类封装，避免全局污染
- 统一的错误处理

## 回滚方法
如需回滚到旧版本，请将以下文件重命名：
1. `txtToWorldbook.js.deprecated` → `txtToWorldbook.js`
2. `worldbookExport.js.deprecated` → `worldbookExport.js`
3. `epubToTxt.js.deprecated` → `epubToTxt.js`

然后修改 `index.js`，注释掉或删除以下行：
```javascript
import './Worldbook/index.js';
```

## 兼容性说明
- 数据库名称已更改为 `WorldbookDB`（原 `TxtToWorldbookDB`）
- 配置项名称保持不变，可自动迁移
- 所有原有功能均已保留

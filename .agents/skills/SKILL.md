# SillyTavern 插件开发指南

本 Skill 用于指导 AI Agent 为 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 编写扩展插件。

## 项目结构

一个标准的 SillyTavern 扩展插件目录结构如下：

```
extensions/novel-auto-generator/
├── manifest.json      # 扩展元数据配置
├── index.js           # 主入口文件（ES6 模块）
├── style.css          # 样式表
├── README.md          # 说明文档
└── Worldinfo/         # 可选：子模块目录
    ├── core/          # 核心业务逻辑
    ├── ui/            # UI 组件和面板
    ├── utils/         # 工具函数
    └── index.js       # 模块导出
```

## 核心文件详解

### 1. manifest.json

扩展的配置文件，定义扩展的基本信息：

```json
{
    "display_name": "插件显示名称",
    "loading_order": 9999,
    "requires": [],
    "optional": [],
    "js": "index.js",
    "css": "style.css",
    "author": "作者名",
    "version": "1.0.0",
    "description": "插件描述"
}
```

关键字段说明：
- `loading_order`: 加载顺序，数字越大加载越晚（SillyTavern 核心约 1000-2000）
- `requires`: 依赖的其他扩展 ID 列表
- `optional`: 可选依赖的扩展 ID 列表

### 2. index.js

主入口文件，使用 ES6 模块系统导入 SillyTavern 核心 API：

```javascript
// 导入 SillyTavern 核心功能
import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

// 扩展名称常量
const extensionName = "your-extension-name";

// 默认设置
const defaultSettings = {
    enabled: true,
    option1: "value1",
    option2: 100,
};

let settings = {};

// ============================================
// 生命周期钩子
// ============================================

// 扩展加载时调用
jQuery(async () => {
    console.log(`[${extensionName}] 扩展加载中...`);
    
    // 加载/初始化设置
    await loadSettings();
    
    // 创建 UI
    createUI();
    
    // 注册事件监听
    registerEventListeners();
    
    console.log(`[${extensionName}] 扩展加载完成`);
});

// ============================================
// 设置管理
// ============================================

async function loadSettings() {
    // 确保扩展设置对象存在
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    
    // 合并默认设置
    settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);
    
    // 保存回全局设置
    extension_settings[extensionName] = settings;
}

function saveSettings() {
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

// ============================================
// SillyTavern 数据访问
// ============================================

function getSTChat() {
    // 方法 1: SillyTavern 全局对象
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const ctx = SillyTavern.getContext();
            if (ctx?.chat && Array.isArray(ctx.chat)) return ctx.chat;
        }
    } catch(e) {}
    
    // 方法 2: getContext 全局函数
    try {
        if (typeof getContext === 'function') {
            const ctx = getContext();
            if (ctx?.chat && Array.isArray(ctx.chat)) return ctx.chat;
        }
    } catch(e) {}
    
    // 方法 3: 全局 chat 对象
    if (window.chat && Array.isArray(window.chat)) return window.chat;
    if (typeof chat !== 'undefined' && Array.isArray(chat)) return chat;
    
    return null;
}

function getContext() {
    try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            return SillyTavern.getContext();
        }
    } catch(e) {}
    
    try {
        if (typeof getContext === 'function') {
            return getContext();
        }
    } catch(e) {}
    
    return null;
}

// ============================================
// UI 创建
// ============================================

function createUI() {
    const html = `
    <div class="your-extension-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>插件标题</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="your-extension-settings">
                    <!-- 设置项 -->
                    <label class="checkbox_label">
                        <input type="checkbox" id="your-ext-enabled" />
                        启用功能
                    </label>
                    
                    <div class="your-ext-input-group">
                        <label for="your-ext-option">选项值:</label>
                        <input type="number" id="your-ext-option" class="text_pole" min="1" max="1000" />
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // 插入到扩展面板
    $('#extensions_settings').append(html);
}

// ============================================
// 事件监听
// ============================================

function registerEventListeners() {
    // 设置变更事件
    $('#your-ext-enabled').on('change', function() {
        settings.enabled = $(this).prop('checked');
        saveSettings();
    });
    
    $('#your-ext-option').on('input', function() {
        settings.option2 = parseInt($(this).val()) || 100;
        saveSettings();
    });
    
    // SillyTavern 事件监听
    eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
    eventSource.on(event_types.MESSAGE_SENT, handleMessageSent);
    eventSource.on(event_types.MESSAGE_EDITED, handleMessageEdited);
}

function handleMessageReceived(data) {
    console.log('[Extension] 收到消息:', data);
}

function handleMessageSent(data) {
    console.log('[Extension] 发送消息:', data);
}

function handleMessageEdited(data) {
    console.log('[Extension] 消息被编辑:', data);
}
```

### 3. style.css

样式文件，使用 SillyTavern 的 CSS 变量保持一致性：

```css
/* ============================================
   扩展基础样式
   ============================================ */

.your-extension-container {
    /* 使用 SillyTavern 的颜色变量 */
    background: var(--SmartThemeBlurTintColor);
    border-radius: 8px;
    margin: 10px 0;
    padding: 10px;
}

.your-extension-settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
}

.your-ext-input-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.your-ext-input-group label {
    font-size: 0.9em;
    color: var(--SmartThemeBodyColor);
}

/* ============================================
   复选框样式
   ============================================ */

.checkbox_label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.checkbox_label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

/* ============================================
   按钮样式
   ============================================ */

.your-ext-btn {
    background: var(--SmartThemeBlurTintColor);
    border: 1px solid var(--SmartThemeBorderColor);
    color: var(--SmartThemeBodyColor);
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.your-ext-btn:hover {
    background: var(--SmartThemeEmColor);
}

.your-ext-btn.primary {
    background: var(--SmartThemeEmColor);
    border-color: var(--SmartThemeEmColor);
}

.your-ext-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* ============================================
   响应式设计
   ============================================ */

@media (max-width: 768px) {
    .your-extension-container {
        margin: 5px 0;
        padding: 8px;
    }
    
    .your-extension-settings {
        padding: 5px;
    }
}
```

## SillyTavern 核心 API 参考

### 全局对象和函数

```javascript
// 获取 SillyTavern 上下文
const context = getContext();
// 或
const context = SillyTavern.getContext();

// 上下文包含以下常用属性：
context.chat          // 消息数组
context.name          // 角色名
context.character     // 角色信息
context.groupId       // 群组 ID（如果在群组中）
```

### 事件系统

```javascript
// 注册事件监听
eventSource.on(event_types.MESSAGE_RECEIVED, callback);
eventSource.on(event_types.MESSAGE_SENT, callback);
eventSource.on(event_types.MESSAGE_EDITED, callback);
eventSource.on(event_types.GENERATION_ENDED, callback);
eventSource.on(event_types.GENERATION_STARTED, callback);

// 可用事件类型：
event_types.MESSAGE_RECEIVED    // 收到 AI 消息
event_types.MESSAGE_SENT       // 用户发送消息
event_types.MESSAGE_EDITED     // 消息被编辑
event_types.MESSAGE_DELETED    // 消息被删除
event_types.GENERATION_STARTED // 开始生成
event_types.GENERATION_ENDED   // 生成结束
```

### 设置管理

```javascript
// 导入设置相关函数
import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

// 读取/保存设置
const settings = extension_settings.yourExtensionName;
extension_settings.yourExtensionName = newSettings;
saveSettingsDebounced();
```

## 常见任务模式

### 模式 1: 发送消息

```javascript
import { sendMessage } from "../../../../script.js";

// 发送消息
await sendMessage({
    message: "消息内容",
    action: 'generate',  // 或 'send' 不触发生成
    ...其他选项
});
```

### 模式 2: 等待 AI 回复

```javascript
async function waitForGeneration() {
    return new Promise((resolve) => {
        const handler = () => {
            eventSource.removeListener(event_types.GENERATION_ENDED, handler);
            resolve();
        };
        eventSource.on(event_types.GENERATION_ENDED, handler);
    });
}

// 使用
await sendMessage({ action: 'generate', message: prompt });
await waitForGeneration();
```

### 模式 3: 读取/操作聊天记录

```javascript
const chat = getContext().chat;

// 获取最新消息
const lastMessage = chat[chat.length - 1];

// 获取 AI 消息（排除用户消息）
const aiMessages = chat.filter(msg => !msg.is_user);

// 获取原始内容
const rawContent = chat[index].mes;
```

## 调试技巧

```javascript
// 在浏览器控制台使用
// 查看 SillyTavern 上下文
console.log(getContext());

// 查看事件系统
console.log(eventSource);

// 查看可用事件类型
console.log(event_types);

// 查看扩展设置
console.log(extension_settings);

// 查看聊天记录
console.log(getContext().chat);
```

## 最佳实践

1. **命名空间**: 始终使用唯一前缀避免冲突（如 `novel-auto-generator`）
2. **设置持久化**: 使用 `extension_settings` 和 `saveSettingsDebounced()`
3. **事件清理**: 组件销毁时清理事件监听
4. **错误处理**: 添加 try-catch 并输出有意义的错误信息
5. **移动端适配**: 使用响应式设计和触摸友好的交互
6. **CSS 变量**: 使用 SillyTavern 的 CSS 变量保持一致性

## 参考资源

- [SillyTavern GitHub](https://github.com/SillyTavern/SillyTavern)
- [SillyTavern 扩展开发文档](https://docs.sillytavern.app/extensions/)
- 本项目示例：`index.js` 展示了完整的扩展结构

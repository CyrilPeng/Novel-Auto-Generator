# Novel Auto Generator | 小说自动生成器

<div align="center">

[![GitHub tag (latest by date)](https://img.shields.io/github/v/tag/CyrilPeng/Novel-Auto-Generator?sort=semver&label=version&color=blue)](https://github.com/CyrilPeng/Novel-Auto-Generator/tags)
[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.10%2B-green.svg)](https://github.com/SillyTavern/SillyTavern)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](https://github.com/CyrilPeng/Novel-Auto-Generator/blob/main/LICENSE)

**SillyTavern 扩展插件 — AI 自动续写小说 + TXT 转世界书**

[快速开始](#快速开始) · [自动生成](#自动生成小说) · [TXT转世界书](txtToWorldbook.md) · [高级功能](#高级功能) · [常见问题](#常见问题)

</div>

---

## 功能概览

本插件包含两个核心功能模块：

**自动生成小说** — 设定章节数和提示词，AI 持续创作，支持断点续传、弹窗兼容、标签提取、多格式导出。

**[TXT转世界书](txtToWorldbook.md)** — 上传 TXT 小说，AI 自动提取角色/地点/组织等信息生成 SillyTavern 世界书。支持并行处理、智能重试、自动断点续传、增量导出、别名合并等。详见 [完整文档](txtToWorldbook.md)。

---

## 快速开始

### 安装

1. SillyTavern 中进入 `扩展` → `安装扩展`
2. 输入仓库地址安装：
   ```
   https://github.com/CyrilPeng/novel-auto-generator
   ```
3. 在扩展栏找到「小说自动生成器」即可使用

---

## 自动生成小说

在已有角色对话的基础上，自动发送提示词让 AI 持续创作。

### 基本用法

1. 打开一个角色对话（确保 AI 已有上下文）
2. 展开插件面板，设置目标章节数
3. 填写提示词（如「继续」「继续推进剧情」）
4. 点击 **开始**，挂机等待

### 控制按钮

| 按钮 | 功能 |
|:---:|:---|
| ▶️ 开始 | 从当前进度开始/继续 |
| ⏸️ 暂停 | 当前章节完成后暂停 |
| ⏯️ 恢复 | 从暂停状态恢复 |
| ⏹️ 停止 | 完全停止任务 |
| 🔄 重置 | 进度归零 |

### 断点续传

进度自动保存在浏览器中。关闭页面后重新打开，可从上次位置继续。

---

## 高级功能

### 标签提取

从 AI 回复中提取指定 XML 标签内容，支持白名单提取和黑名单移除。

```xml
<thinking>AI 的思考过程...</thinking>
<content>小说正文内容...</content>
<summary>本章总结...</summary>
```

**使用方法：**
1. 勾选「原始 (chat.mes)」读取未经正则处理的原始内容
2. 模式选择「只提取指定标签」或「全部内容」
3. 填写要提取/移除的标签名（空格或逗号分隔）
4. 点击「刷新预览」确认效果

| 模式 | 示例 | 效果 |
|:---|:---|:---|
| 白名单提取 | `content` | 只保留 `<content>` 内的内容 |
| 黑名单移除 | `thinking note` | 删除这些标签及其内容 |
| 组合使用 | 提取 `content`，移除 `thinking` | 两者同时生效 |

### 弹窗检测（插件兼容）

同时使用剧情推进、总结等插件时，自动检测弹窗通知，等待其他插件处理完成后再继续。

分为发送阶段（消息发送后）和回复阶段（AI 回复后）两个检测点，分别可配置等待超时和额外等待时间。

### 导出设置

- 支持 TXT / JSON 格式
- 可指定楼层范围
- 可选包含用户消息 / AI 回复
- 可选读取原始内容或显示内容

### 生成控制参数

| 参数 | 默认值 | 说明 |
|:---|:---:|:---|
| 自动保存间隔 | 50 章 | 每 N 章自动导出备份 |
| 最大重试 | 3 次 | 单章失败后重试次数 |
| 最小章节长度 | 100 字 | 低于此字数视为失败 |

---

## TXT转世界书

将 TXT 小说转换为 SillyTavern 世界书格式。这是一个功能丰富的独立模块，详细文档见 **[txtToWorldbook.md](txtToWorldbook.md)**。

快速上手：
1. 点击插件面板中的「TXT转世界书」按钮
2. 选择 API（可直接使用酒馆当前连接的 AI）
3. 上传 TXT 文件 → 开始转换
4. 处理完成后导出为 SillyTavern 世界书格式

---

## 常见问题

<details>
<summary><b>标签提取不生效？</b></summary>

1. 确认已勾选「原始 (chat.mes)」
2. 检查标签名拼写
3. 用 `nagDebug()` 在浏览器控制台查看原始内容
4. 确认黑名单没有误删正文标签
</details>

<details>
<summary><b>生成频繁报错重试？</b></summary>

- AI 回复过短未达最小长度 → 降低最小章节长度
- 网络波动 → 检查连接，增加回复后等待时间
</details>

<details>
<summary><b>使用其他插件时冲突？</b></summary>

展开高级设置，在对应阶段开启弹窗检测，适当增加等待超时和额外等待时间。
</details>

<details>
<summary><b>导出内容为空？</b></summary>

检查是否勾选了 AI 回复、楼层范围是否正确、标签名是否匹配。
</details>

<details>
<summary><b>TXT转世界书相关问题？</b></summary>

请参阅 [txtToWorldbook.md](txtToWorldbook.md) 中的常见问题章节。
</details>

---

## 调试

浏览器控制台 (F12) 中可用：

```javascript
nagDebug()    // 查看最后一条 AI 消息的原始内容
nagDebug(5)   // 查看第 5 楼的原始内容
```

---

## 项目结构

```
novel-auto-generator/
├── manifest.json          # 扩展配置
├── index.js               # 主程序（自动生成模块）
├── style.css              # 样式表
├── txtToWorldbook/        # TXT转世界书模块
│   ├── main.js            # 模块入口
│   ├── core/              # 核心：状态、常量、工具
│   ├── infra/             # 基础设施：API、数据库、事件
│   ├── services/          # 业务逻辑服务层
│   ├── ui/                # UI 组件与视图
│   ├── app/               # 依赖注入与应用组装
│   └── adapters/          # 外部 API 适配器
├── README.md              # 本文档
└── txtToWorldbook.md      # TXT转世界书详细文档
```

---

## 更新日志

### v1.6.0
- 新增自动断点续传：处理期间定时保存，浏览器崩溃后可恢复
- 新增 API 智能重试：覆盖 429/500/502/503 等瞬态错误
- 新增并行批次间世界书摘要同步，减少跨批次重复
- 新增处理进度 ETA 预估
- 新增批量操作前自动快照（替换/整理/合并前保存历史）
- 新增处理完成后自动去重建议
- 新增 Prompt 模板可视化编辑
- 新增增量导出变更条目
- 修复 XSS 注入漏洞
- 修复长篇小说处理必定失败的问题
- 修复数据完整性问题（DB 竞态、事务完整性）
- 修复 ReDoS 防护、静默错误、并发保护等问题

### v1.5.0
- TXT 转世界书模块大范围模块化重构

### v1.4.0
- TXT 转世界书：新增酒馆 API、并行处理、重 Roll、记忆编辑、章节合并、多选删除、查找替换、别名合并、自定义分类、条目配置、任务导入导出等

### v1.3.0
- 新增 TXT 转世界书功能
- 支持多种 AI API、增量输出、记忆分裂、历史追踪

### v1.2.0
- 全新高级设置 UI、双阶段弹窗检测、移动端适配

### v1.1.0
- DOM 稳定性检查、内置帮助系统

### v1.0.0
- 初始版本：自动生成、断点续传、标签提取、多格式导出

---

## 贡献

欢迎提交 [Issue](https://github.com/CyrilPeng/Novel-Auto-Generator/issues) 和 Pull Request。

## 许可证

MIT License

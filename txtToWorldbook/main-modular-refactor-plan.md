# txtToWorldbook/main.js 解耦重构计划

> 历史计划：本文记录 2026-03-27 的代码状态，部分工作已经完成，目录与行数描述不再代表当前项目。后续实施以 [2026-09-30 重构与可靠性改进方案](../docs/refactoring-plan.md) 为准，本文保留作历史参考。

## 1. 当前现状

基于 2026-03-27 仓库实际代码，而不是旧计划假设：

- `txtToWorldbook/main.js` 仍有约 8138 行，依然是主要耦合源。
- 模块化已经启动，不再是“从零拆分”阶段。
- 已落地模块：
  - `app/createApp.js`
  - `app/publicApi.js`
  - `services/processingService.js`
  - `services/rerollService.js`
  - `ui/worldbookView.js`
  - `ui/settingsPanel.js`
  - `ui/rerollModals.js`
  - `ui/eventBindings.js`
  - `ui/renderer.js`
- 但 `main.js` 仍同时承担以下职责：
  - 默认配置与超长提示词常量
  - `Semaphore`、`PerfUtils`、`TokenCache`、`ErrorHandler`、`UI` 等运行时基础设施
  - API 调用实现与模型测试
  - AI 响应解析、Prompt 组装、章节上下文拼接
  - 世界书合并、别名合并、手动合并、整理条目
  - 搜索/替换、历史视图、导入导出、任务状态恢复
  - 主弹窗初始化、恢复流程、服务装配、公开 API 桥接
- 当前状态属于“已经拆出边缘层，但核心流程和编排仍混在主文件”的中后期重构阶段。

## 2. 重构目标

- 将 `main.js` 收敛为“启动入口 + 依赖装配 + 兼容 API 暴露”。
- 让业务逻辑按稳定领域拆分，不再按“功能堆积”继续增长。
- 保持 `window.TxtToWorldbook` 兼容，避免对插件外部调用造成破坏。
- 每一阶段都可独立验证，避免一次性大迁移。

## 3. 重构原则

- 单个模块只负责一个稳定变化轴。
- 模块之间只通过 `deps`/context 通信，不直接依赖 `main.js` 闭包变量。
- 先迁移“高内聚代码块”，再处理跨域流程。
- 不先追求语法层面的完美 ESM 化，先降低维护成本和回归风险。
- 对外 API 名称、DOM id、现有存档格式保持不变。

## 4. 按现状重定义模块边界

### 4.1 app 层

- `main.js`
  - 最终只保留入口 IIFE、模块装配、生命周期绑定、`initTxtToWorldbookBridge/getTxtToWorldbookApi`。
- `app/createApp.js`
  - 扩展为真正的 `AppContext` 组装器，而不是当前仅创建 `AppState + MemoryHistoryDB`。
- `app/publicApi.js`
  - 继续作为唯一对外 API 门面，集中兼容别名。

### 4.2 core / infra 层

- `core/constants.js`
  - 继续承载默认配置。
  - 需要继续迁入 `main.js` 里的默认世界书分类、默认提示词、默认合并/整理提示词。
- `core/runtime.js` 或 `infra/runtimeTools.js`（新建）
  - 迁移 `Semaphore`、`PerfUtils`、`TokenCache`。
- `core/errorHandler.js`（新建）
  - 迁移 `ErrorHandler`。
- `infra/uiState.js` 或 `ui/domRefs.js`（新建）
  - 迁移 `UI` 容器及常用 DOM 获取逻辑，消除散落查询。

### 4.3 services 层

- `services/apiService.js`（新建）
  - 迁移 `callSillyTavernAPI`、自定义 API 调用、模型列表拉取、快速测试。
- `services/promptService.js`（新建）
  - 迁移 `_buildSystemPrompt`、章节强制标记、语言前缀、消息链组装、前文上下文拼接。
- `services/parserService.js`（新建）
  - 迁移 `parseAIResponse` 与相关清洗逻辑。
- `services/historyService.js`（新建）
  - 迁移 `showHistoryView` 对应的数据聚合、回滚、历史查询流程。
- `services/taskStateService.js`（新建）
  - 迁移 `saveTaskState/loadTaskState/_restoreExistingState/restoreExistingState`。
- `services/importExportService.js`（新建）
  - 迁移世界书导入导出、角色卡导出、分卷导出、设置导入导出。
- `services/searchReplaceService.js`（新建）
  - 迁移搜索、替换、批量重 Roll 搜索结果等逻辑。
- `services/mergeWorkflowService.js`（新建）
  - 迁移手动合并、别名合并、整理条目、合并流程编排。

### 4.4 ui 层

- `ui/historyView.js`（新建）
  - 承接 `showHistoryView` 及相关 DOM 事件。
- `ui/searchModal.js`（新建）
  - 承接 `showSearchModal`。
- `ui/replaceModal.js`（新建）
  - 承接 `showReplaceModal`。
- `ui/mergeWorkbench.js`（新建）
  - 承接手动合并 UI、别名合并主界面、整理条目选择器。
- `ui/helpModal.js`（新建）
  - 承接 `showHelpModal`。
- `ui/memoryQueueView.js`（新建）
  - 承接章节队列渲染、起始点选择、内容查看、已处理结果查看。

## 5. 现有模块问题与补强方向

### 5.1 `createAppContext` 过薄

- 现在只创建 `AppState` 与 `MemoryHistoryDB`。
- 下一步要让它组装：
  - core/infra 对象
  - service 实例
  - UI facade
  - 对外动作集合

### 5.2 service 仍依赖过多主文件函数

- `processingService`、`rerollService` 已拆出，但依赖仍很重。
- 这说明“文件搬家”已经发生，但“依赖解耦”还没有完成。
- 下一阶段重点不是继续机械迁文件，而是减少 service 参数中的高耦合函数集合。

### 5.3 UI 模块拆出了大块 HTML，但主流程仍在 `main.js`

- `settingsPanel/worldbookView/rerollModals` 已形成雏形。
- 还缺少：
  - 历史视图
  - 搜索替换视图
  - MemoryQueue 视图
  - Help/Selector 类弹窗

## 6. 分阶段执行计划

## 阶段 0：冻结边界并补齐清单

目标：

- 先停止继续向 `main.js` 增加新逻辑。
- 给所有仍在 `main.js` 的顶层函数做“领域归属表”。

执行：

- 按以下领域标记现有函数：
  - runtime
  - api
  - prompt/parser
  - processing
  - reroll
  - merge
  - search/replace
  - history
  - import/export
  - modal/init
- 形成迁移映射表，避免后续重复拆分。

验收：

- `main.js` 中所有顶层函数都能归入某个目标模块。

## 阶段 1：抽离基础运行时能力

目标：

- 先把最稳定、复用度高、与 UI 无关的能力从 `main.js` 拿走。

执行：

- 新建 `core/errorHandler.js`。
- 新建 `core/runtime.js` 或 `infra/runtimeTools.js`。
- 迁移：
  - `Semaphore`
  - `PerfUtils`
  - `TokenCache`
  - `ErrorHandler`
- 将相关 import 改由模块引入。

验收：

- `processingService/rerollService/rerollModals` 只依赖模块化 runtime 工具，不再依赖 `main.js` 内联定义。

## 阶段 2：抽离 Prompt 与解析链路

目标：

- 把 AI 请求前后的高耦合逻辑从 `main.js` 中心切开。

执行：

- 新建 `services/promptService.js`。
- 新建 `services/parserService.js`。
- 迁移：
  - `_buildSystemPrompt`
  - `getLanguagePrefix`
  - `getChapterForcePrompt`
  - `getPreviousMemoryContext`
  - prompt message chain 组装
  - `parseAIResponse`
  - 响应清洗与非严格 JSON 修复

验收：

- `processingService` 和 `rerollService` 只面向 prompt/parser service，不再依赖 `main.js` 中的 prompt 构造函数。

## 阶段 3：抽离 API 层

目标：

- 统一 SillyTavern API、自定义 API、模型列表、测试逻辑。

执行：

- 新建 `services/apiService.js`。
- 迁移：
  - `callSillyTavernAPI`
  - 自定义 API 请求
  - `handleFetchModelList`
  - `handleQuickTestModel`
- 将 provider 分支判断收敛到单模块。

验收：

- `main.js` 不再直接拼接 HTTP 请求。
- 所有 API 调用只通过 `apiService` 暴露的方法进入。

## 阶段 4：拆 MemoryQueue 与主流程编排 UI

目标：

- 把最大的一类 DOM 交互从主文件中移出。

执行：

- 新建 `ui/memoryQueueView.js`。
- 迁移：
  - `updateMemoryQueueUI`
  - `showStartFromSelector`
  - `showMemoryContentModal`
  - `showProcessedResults`
  - 多选删除模式相关视图逻辑
- `eventBindings.js` 只做绑定，不再承载复杂行为。

验收：

- 章节列表刷新、查看、复制、起始点选择、多选删除行为不变。

## 阶段 5：拆历史、搜索、替换

目标：

- 清掉 `main.js` 中最难维护的长 UI 流程块。

执行：

- 新建 `ui/historyView.js`
- 新建 `ui/searchModal.js`
- 新建 `ui/replaceModal.js`
- 配套新建 `services/historyService.js`、`services/searchReplaceService.js`
- 迁移：
  - `showHistoryView`
  - `_buildSearchResultsHtml`
  - `_batchRerollSearchResults`
  - `showSearchModal`
  - `showReplaceModal`

验收：

- 历史查看/回滚、搜索、替换、从搜索结果批量重 Roll 功能不回归。

## 阶段 6：拆合并工作流

目标：

- 将合并相关复杂交互完全脱离 `main.js`。

执行：

- 新建 `services/mergeWorkflowService.js`
- 新建 `ui/mergeWorkbench.js`
- 迁移：
  - 导入世界书合并流程
  - `showManualMergeUI`
  - `showAliasMergeUI`
  - `showConsolidateCategorySelector`
  - 合并确认、别名分类选择、整理预设相关流程
- 保留 `mergeService.js` 负责纯合并规则，工作流转移到新服务。

验收：

- 导入合并、手动合并、别名合并、条目整理全部可跑通。

## 阶段 7：拆任务状态与导入导出

目标：

- 将持久化和文件 IO 从入口层剥离。

执行：

- 新建 `services/taskStateService.js`
- 新建 `services/importExportService.js`
- 迁移：
  - `saveTaskState`
  - `loadTaskState`
  - `_restoreExistingState`
  - `restoreExistingState`
  - 设置导入导出
  - 角色卡导出
  - 世界书导出
  - 分卷导出

验收：

- 刷新后恢复、任务导入导出、设置导入导出、世界书导出保持兼容。

## 阶段 8：收缩入口并完成装配重构

目标：

- 真正把 `main.js` 变成启动文件。

执行：

- 扩展 `createAppContext`，统一创建：
  - state
  - runtime tools
  - services
  - ui modules
  - action facade
- `main.js` 只保留：
  - 常量 import
  - `createAppContext()`
  - modal open/close
  - bind/unbind
  - public API 导出

验收：

- `main.js` 控制在 1200-1800 行以内。
- 入口文件中不再存在大段 HTML 构建、复杂业务循环、网络请求细节。

## 7. 推荐迁移顺序

按风险和收益排序，建议实际执行顺序为：

1. 阶段 1：runtime/errorHandler
2. 阶段 2：prompt/parser
3. 阶段 3：apiService
4. 阶段 4：memoryQueueView
5. 阶段 5：history/search/replace
6. 阶段 6：merge workflow
7. 阶段 7：taskState/importExport
8. 阶段 8：入口收缩

原因：

- 前三阶段能先降低 `processingService` 和 `rerollService` 的依赖密度。
- 中间三阶段主要削减 `main.js` 的体量。
- 最后两阶段再处理装配与恢复流程，避免中途反复改入口。

## 8. 风险点

- 状态耦合风险：
  - 许多函数直接读写 `AppState` 深层字段，迁移时容易遗漏副作用。
- DOM 绑定风险：
  - 当前有 `eventBindings.js` 与主文件并存，可能出现重复绑定或解绑遗漏。
- 持久化兼容风险：
  - `MemoryHistoryDB`、任务状态文件、设置导出格式不能随意改变。
- 并发停止风险：
  - `processing/reroll` 共享停止状态与信号量，拆错后容易出现“UI 停止了但任务未停”。
- 回归范围大：
  - 本插件功能面很广，必须分阶段回归。

## 9. 每阶段回归清单

- 打开插件弹窗。
- 加载 TXT 并完成一次完整转换。
- 串行模式处理。
- 并行独立模式处理。
- 并行分批模式处理。
- 暂停与继续恢复。
- 修复失败章节。
- 单章重 Roll。
- 单条目重 Roll。
- 批量重 Roll。
- 世界书预览与详细视图。
- 搜索与替换。
- 历史查看与回滚。
- 手动合并、别名合并、整理条目。
- 设置导入导出。
- 任务导入导出。
- 世界书与角色卡导出。

## 10. 完成标准

- `main.js` 不再是业务实现文件，而是入口与装配文件。
- service 之间依赖由显式模块接口组成，而不是大量主文件闭包函数。
- UI 视图逻辑分散到独立模块后，单文件长度可控。
- 公共 API、存档、DOM id、导出格式保持兼容。
- 重构过程可以按阶段提交，每一阶段都可独立回滚。

---

这份计划替代旧版计划。后续执行时，不再按“先创建 createApp/publicApi/processingService/rerollService/worldbookView/settingsPanel”推进，因为这些模块已经存在；重点应转向“削减剩余耦合、让现有模块真正独立”。

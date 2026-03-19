# txtToWorldbook/main.js 模块化重构计划

## 1. 现状诊断（基于 main.js）

- 文件体量过大：`txtToWorldbook/main.js` 约 551KB，包含约 102 个顶层函数。
- 职责集中在单文件：状态、流程、UI 模态框、导入导出、事件绑定、API 调用混合在同一作用域。
- 已有模块化雏形：`core/infra/services/ui` 已存在，且 `main.js` 已引入 `state/logger/utils/modalFactory/apiCaller/memoryHistoryDB/worldbookService/mergeService/eventBindings`。
- 模块化未完成：`services/processingService.js`、`services/rerollService.js`、`ui/worldbookView.js`、`ui/settingsPanel.js`、`ui/rerollModals.js`、`ui/renderer.js` 当前是占位文件。
- 兼容负担较重：`window.TxtToWorldbook` 暴露大量方法，并保留多个向后兼容别名。

## 2. 重构目标

- 将 `main.js` 收敛为“组装层（composition root）+ 对外桥接层（bridge）”。
- 业务逻辑按领域拆分：`processing`、`reroll`、`merge`、`search/replace`、`import/export`、`history`。
- UI 逻辑按视图拆分：`settingsPanel`、`worldbookView`、`historyView`、`rerollModals`、`common modal builders`。
- 统一依赖注入：所有模块通过 `deps` 获取 `AppState`、`Logger`、`ErrorHandler`、`services`，减少隐式全局耦合。
- 维持外部 API 稳定：`window.TxtToWorldbook` 方法名和行为不变，重构期间只改内部实现。

## 3. 目标目录与模块边界

建议最终结构（在现有目录上演进）：

- `txtToWorldbook/main.js`
  - 只做初始化、模块装配、导出桥接。
- `txtToWorldbook/app/createApp.js`（新建）
  - 统一创建 `AppContext`（state + infra + services + ui actions）。
- `txtToWorldbook/app/publicApi.js`（新建）
  - 生成 `window.TxtToWorldbook` 对外 API（兼容别名也集中在此）。
- `txtToWorldbook/services/processingService.js`
  - 迁移 `processMemoryChunk*`、暂停/续跑、并行批次、修复失败等流程。
- `txtToWorldbook/services/rerollService.js`
  - 迁移 `handleRerollMemory`、`handleRerollSingleEntry`、批量重 Roll 调度。
- `txtToWorldbook/services/taskStateService.js`（新建）
  - 迁移 `saveTaskState/loadTaskState/_restoreExistingState`。
- `txtToWorldbook/services/importExportService.js`（新建）
  - 迁移导入世界书、导出 ST/角色卡/分卷等功能。
- `txtToWorldbook/ui/settingsPanel.js`
  - 迁移 `_build*SectionHtml` + 设置面板渲染/初始化。
- `txtToWorldbook/ui/worldbookView.js`
  - 迁移 `formatWorldbookAsCards/renderWorldbookToContainer/showWorldbookView` 与相关绑定。
- `txtToWorldbook/ui/rerollModals.js`
  - 迁移 `showRerollEntryModal/showBatchRerollModal/showRollHistorySelector` 及辅助 HTML 构建。
- `txtToWorldbook/ui/historyView.js`（新建）
  - 迁移 `showHistoryView/rollbackToHistory`。
- `txtToWorldbook/ui/renderer.js`
  - 承接 `ListRenderer`、HTML escape/highlight、公用渲染函数。

## 4. 分阶段迁移计划（可直接按 PR 执行）

## 阶段 0：建立 AppContext 与门面

- 新建 `app/createApp.js`、`app/publicApi.js`。
- 将 `main.js` 中 `AppState`、`Logger`、`ModalFactory`、`APICaller`、`MemoryHistoryDB`、`worldbookService`、`mergeService` 的初始化迁入 `createApp`。
- `main.js` 保留 IIFE，但改为调用 `createApp()` 并从 `publicApi` 注册 `window.TxtToWorldbook`。

验收标准：
- 功能不变，`initTxtToWorldbookBridge/getTxtToWorldbookApi` 行为不变。
- `window.TxtToWorldbook` 字段列表与当前一致。

## 阶段 1：先拆“纯渲染”再拆“交互”

- 将 `ListRenderer` 与 `escape/highlight` 相关函数迁至 `ui/renderer.js`。
- 将世界书卡片格式化函数迁至 `ui/worldbookView.js`，但事件绑定仍可暂时在 `main.js`。
- `main.js` 只保留调用。

验收标准：
- 世界书预览、详细视图、Token 阈值高亮行为一致。

## 阶段 2：拆 settingsPanel（最大 UI 体块）

- 迁移 `_buildSettingsSectionHtml` 到 `_buildModalHtml` 相关函数至 `ui/settingsPanel.js`。
- 将 UI 构建与默认值回填分离：
  - `buildSettingsHtml()` 仅返回模板。
  - `hydrateSettingsFromState()` 负责状态回填。

验收标准：
- 打开弹窗、设置回显、保存设置、章节正则测试均可用。

## 阶段 3：拆 processingService（核心流程）

- 迁移：`processMemoryChunkIndependent`、`processMemoryChunk`、并行批次、`handleStopProcessing`、`handleRepairFailedMemories`。
- 抽出统一流程状态机（建议）：`idle/running/stopped/rerolling/repairing`，替换散落布尔位组合判断。
- 为流程方法定义稳定接口：
  - `startProcessing(options)`
  - `stopProcessing()`
  - `repairFailed()`
  - `rechunk()`

验收标准：
- 串行、并行（independent/batch）、暂停/续跑、修复失败功能一致。
- 历史存档与进度更新行为一致。

## 阶段 4：拆 rerollService + rerollModals

- 服务层：迁移单章重 Roll / 单条目重 Roll / 批量重 Roll 调度。
- UI 层：迁移重 Roll 相关 modal 构建、事件绑定、历史选择器。
- 合并重复并发模板（多个 `processOne + Promise.allSettled` 片段）为共享工具。

验收标准：
- 单条、批量、历史回选三类重 Roll 功能可用；停止按钮和进度提示正常。

## 阶段 5：拆 history/import/export

- 新建 `ui/historyView.js` 承接历史列表、详情、回滚。
- 新建 `services/taskStateService.js`、`services/importExportService.js` 承接任务状态与导入导出。
- `main.js` 仅保留模块组装和 API 暴露。

验收标准：
- 导入导出（任务状态/设置/世界书）完整可用。
- 历史查看与回滚可用。

## 阶段 6：清理兼容层与技术债

- 清理内部未再使用的别名（保留外部 API 别名）。
- 统一命名：`handleX/showX/buildX/renderX` 四类函数按职责分层。
- 可选：将 IIFE 迁移为纯 ESM 模块。

验收标准：
- `main.js` 控制在 800-1200 行以内（仅编排层）。
- 占位文件全部替换为真实实现。

## 5. 风险与控制

- 风险 1：状态引用断裂（大量函数依赖 `AppState` 闭包）。
  - 控制：统一 `deps` 注入，不在模块内直接读写全局变量。
- 风险 2：DOM 选择器分散导致绑定遗漏。
  - 控制：在每个 UI 模块导出 `bindXEvents()`，由 `main.js` 单点调用。
- 风险 3：并发与停止逻辑回归。
  - 控制：为 `processingService` 增加最小回归脚本（串行/并行/停止/续跑）。
- 风险 4：对外 API 兼容破坏。
  - 控制：保留 `publicApi` 快照检查（导出键名 diff）。

## 6. 验收与回归清单

每个阶段都执行以下手工回归：

- 打开插件弹窗，加载 TXT，完成一次全流程转换。
- 并行模式两种策略都跑通。
- 停止/继续、修复失败、单章重 Roll、单条目重 Roll、批量重 Roll。
- 世界书预览与详细视图（含灯状态切换、阈值过滤、条目配置）。
- 导入/导出（设置、任务状态、世界书/ST 格式）。
- 历史查看与回滚。

## 7. 建议执行节奏

- 每阶段一个独立 PR，避免一次性大迁移。
- 每个 PR 限制在“1 个服务层或 1 个 UI 域”内，确保可回滚。
- 先迁移占位文件对应功能，再删 `main.js` 同名实现，始终保证单一实现来源。

---

最后建议：优先按“阶段 0 -> 1 -> 3”推进，这条路径能最快降低 `main.js` 风险密度（先稳定装配层，再拆渲染，再拆核心流程）。

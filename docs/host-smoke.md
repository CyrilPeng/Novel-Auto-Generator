# 真实 SillyTavern 浏览器验收

执行日期：2026-09-30。Windows、Docker Desktop，独立测试数据卷，插件只读挂载；未读取真实聊天、未调用付费模型。

## 结果

| 宿主   | 浏览器             | 验收结果                                                                  |
| ------ | ------------------ | ------------------------------------------------------------------------- |
| 1.19.0 | Edge 154.0.4258.37 | 三种转换模式暂停/继续、完整导出、恢复通过；续写及 generateRaw 通过        |
| 1.13.2 | Firefox 153.0      | 三种转换模式暂停/继续、完整导出、恢复通过                                 |
| 1.19.0 | Firefox 153.0      | 转换、暂停恢复、替换/清理、历史回退、弹窗及窄屏检查通过                   |
| 1.13.2 | Edge 154.0.4258.37 | 转换基础流程、续写发送/完成、暂停/继续、停止/切聊天隔离、generateRaw 通过 |

`smoke-sillytavern.mjs` 在三块输入下断言恰好 4 次模型请求（含快速测试），暂停和恢复不增加重复请求；同 context 第二页面被写入锁拒绝。比较刷新前后完整队列及世界书，检查稳定 ID、ST/角色卡下载、凭据排除、单一样式表、嵌套 Escape 及 390×844 布局。

`ST_EDIT=1` 另验证实际按钮操作的替换、标签清理、刷新持久化、历史回退，以及导入已完成任务后再次刷新。导入/合并各冲突模式、整理、重 Roll、修复和中止事务另有 Vitest 集成回归；不将这些断言称作全部菜单逐项人工验收。

`smoke-novel.mjs` 创建合成角色，操作真实酒馆发送和 API 设置；断言首次续写增加用户/AI 两条消息、暂停不派发下一章、恢复达到 3/3、停止后切换聊天不重发待确认内容，最后调用真实宿主 generateRaw。总计 5 次模型请求，无页面错误。插件停止不会强行取消酒馆上游请求，本测试等待已发请求结束后切换聊天。

模型传输由 Playwright route 返回固定 SSE/JSON。宿主页面、插件、文件读取、IndexedDB、下载、聊天处理及生成 API 都真实运行。未使用的 Horde 后台发现接口返回空 fixture，隔离外网波动；真实模型质量、供应商 CORS 和移动实机不在此结论内。

## 复跑

仅使用临时宿主；脚本会保存测试 API 设置并创建合成角色。安装 Playwright 或设置 `PLAYWRIGHT_MODULE` 为已有包目录，每次使用全新浏览器 context。

```powershell
$env:ST_TEST_URL = 'http://127.0.0.1:18019'
$env:ST_PROCESS_MODE = 'independent' # serial / independent / batch
$env:ST_PAUSE = '1'
$env:ST_EDIT = '1'
node scripts/smoke-sillytavern.mjs
$env:ST_BROWSER = 'firefox' # 默认 Edge
node scripts/smoke-sillytavern.mjs
node scripts/smoke-novel.mjs # 使用 Edge
```

`ST_LARGE=1` 增加 1 MB / 10 MB 实际上传及队列渲染；`ST_EXPORT_PATH` 保存合成的完整任务用于回退测试；`ST_SCREENSHOT` 保存窄屏截图。成功输出 JSON，失败退出非零，结束关闭浏览器。

## 回退演练

以重构前 `c333ca2cd3e00ca4644d550bf20e2bc90f5f014b` 为旧代码，通过 `git archive` 导出到临时目录。`smoke-rollback.mjs` 在全新 context 使用该目录响应插件资源请求，其他请求仍走真实 1.19.0 宿主。它导入新版本完成的三块任务，比较章节/世界书，再用旧代码重新导出并再次比较，全部通过。

```powershell
$env:ST_LEGACY_ROOT = 'C:/temporary/legacy-plugin'
$env:ST_EXPORT_PATH = 'C:/temporary/new-task.json'
node scripts/smoke-rollback.mjs
```

此演练验证成果可携带回旧版，不声称旧版拥有新版本的取消保护、编辑覆盖或新的事务保证。实际回退说明见 [发布与回退](release.md)。

## 环境与性能

容器使用固定 tag 源码，Node 22.14.0，执行 `npm ci --omit=dev --ignore-scripts` 和 `node docker/build-lib.js`。镜像为 `novel-st-qa:1.19.0` / `novel-st-qa:1.13.2`；端口只绑定 127.0.0.1:18019 / 18013，配置将 Docker 网关加入白名单。

Node 22.23.2 Windows x64 的 `node scripts/benchmark-text.mjs`：1/10/100 MB 无分隔符文本分别约 9/63/630 ms，采样 RSS 35/55/159 MB，逐字符检查通过。Edge 实际 1/10 MB 上传及队列显示约 272/2138 ms；这些数据不是全量生成时间或峰值内存。

原合成条目 benchmark 最终样本：10,000 条约 10 MB，解析 16.48 ms、合并 19.26 ms、存取 344.95 ms、采样 RSS 170.6 MB。早一轮样本分别为 15.16/17.70/233.54 ms、164.6 MB；与基线存在计时波动，不据单次样本宣称整体提速。100 MB 仅为桌面切块压力验收，不承诺移动设备同等性能。

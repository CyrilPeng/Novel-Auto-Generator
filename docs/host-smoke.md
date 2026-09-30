# 真实 SillyTavern 浏览器验收

## 已执行结果（2026-09-30）

宿主在 Docker Desktop 中运行，插件仓库只读挂载到 `public/scripts/extensions/third-party/Novel-Auto-Generator`。数据使用独立测试卷，没有读取用户真实聊天或调用付费模型。

| 宿主               | 浏览器                                  | 结果                                             |
| ------------------ | --------------------------------------- | ------------------------------------------------ |
| SillyTavern 1.19.0 | Edge 154.0.4258.37，headless，1440×1000 | 加载、快速测试、单块转换、任务导出、刷新恢复通过 |
| SillyTavern 1.13.2 | Edge 154.0.4258.37，headless，1440×1000 | 同上通过                                         |

每次运行恰好发出 2 个模型请求（快速测试和转换）；刷新恢复不生成新请求。检查章节稳定 ID、完成状态及世界书在刷新前后完全一致、导出 schemaVersion 为 1 且不含 customApiKey、插件面板只初始化一次、没有 pageerror。

模型传输由 Playwright route 返回固定 OpenAI SSE 样本。宿主页面、插件代码、文件上传、IndexedDB、下载及恢复对话框均真实运行。本结果不能证明真实供应商 CORS、真实模型质量、续写发送/切换聊天、三种调度模式、Firefox 或移动端兼容；B06 尚未整体验收完成。

## 复跑

使用独立测试宿主。脚本会向该宿主保存测试 API 设置，禁止指向日常使用的酒馆。测试浏览器每次创建全新 context，不复用个人浏览器资料。

先安装 Playwright，或设置 `PLAYWRIGHT_MODULE` 为已有 Playwright 包目录。默认使用本机 Edge；可以通过 `ST_BROWSER_CHANNEL` 选择已安装的 Chrome。当前脚本面向中文/英文宿主。

```powershell
$env:ST_TEST_URL = 'http://127.0.0.1:18019'
node scripts/smoke-sillytavern.mjs
$env:ST_TEST_URL = 'http://127.0.0.1:18013'
node scripts/smoke-sillytavern.mjs
```

成功输出 JSON（包含浏览器版本、请求数、检查清单、错误列表），失败退出非零；无论成功失败都会关闭浏览器。

本次容器使用从 GitHub 对应固定 tag 下载的源码构建，Node 22.14.0，执行 `npm ci --omit=dev --ignore-scripts` 和 `node docker/build-lib.js`，复制默认 config 后运行 `node server.js --listen --port 8000`。本机镜像名为 `novel-st-qa:1.19.0` / `novel-st-qa:1.13.2`，端口仅绑定 127.0.0.1:18019 / 18013；配置只将 Docker 网关加入白名单。临时构建目录在系统 Temp 中，不属于插件发布内容。

1.13.2 容器在首次验收途中消失，已从上述本地镜像重建并完整重跑通过；旧版欢迎弹窗的“保存”和扩展入口“扩展”与新版不同，脚本已兼容。

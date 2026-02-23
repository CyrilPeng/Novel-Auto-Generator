# Worldinfo 调试系统使用指南

## 概述

Worldinfo 模块提供了完善的调试日志系统，帮助开发者和高级用户诊断问题。

## 快速开始

### 在 UI 中启用调试

1. 打开 TXT 转世界书面板
2. 找到 **🐛 调试选项** 卡片
3. 勾选 **启用调试模式**
4. 选择合适的日志级别

### 在代码中使用

```javascript
import { logger, LogLevel } from './Worldinfo/utils/Logger.js';
import { ConfigKeys } from './Worldinfo/core/Config.js';

// 启用调试
logger.setEnabled(true);

// 设置日志级别
logger.setLevel(LogLevel.DEBUG);  // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR, 4=NONE

// 记录日志
logger.debug('调试信息', { some: 'data' });
logger.info('普通信息');
logger.warn('警告信息');
logger.error('错误信息', error);

// 持久化设置
const config = uiManager.getConfig();
config.set(ConfigKeys.DEBUG_MODE, true);
config.set(ConfigKeys.DEBUG_LOG_LEVEL, LogLevel.DEBUG);
config.save();
```

## 日志级别

| 级别 | 值 | 说明 | 使用场景 |
|------|------|------|----------|
| DEBUG | 0 | 详细调试信息 | 开发阶段 |
| INFO | 1 | 一般信息 | 生产环境默认 |
| WARN | 2 | 警告信息 | 关注隐患 |
| ERROR | 3 | 错误信息 | 紧急问题 |
| NONE | 4 | 禁用日志 | 性能敏感场景 |

## 环境建议

| 环境 | 推荐设置 | 说明 |
|------|----------|------|
| 开发 | 启用 + DEBUG | 详细信息便于调试 |
| 测试 | 启用 + INFO | 关键流程信息 |
| 生产 | 禁用 或 WARN | 仅错误信息 |

## 故障排查

### 调试模式已启用但没有输出

1. 检查浏览器控制台是否打开 (F12)
2. 确认日志级别设置正确
3. 检查是否有过滤器隐藏了日志

### 日志太多影响性能

1. 将日志级别调高 (如 INFO 或 WARN)
2. 禁用调试模式
3. 使用 `LogLevel.NONE` 完全禁用

## 相关文件

- `Worldinfo/utils/Logger.js` - 日志管理器实现
- `Worldinfo/core/Config.js` - 配置键定义
- `Worldinfo/ui/panels/TxtToWorldbookPanel.js` - UI 面板

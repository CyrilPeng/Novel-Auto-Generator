/**
 * TXT 转世界书主面板
 * 完整功能版本
 */
import { Modal, Button, ProgressBar, Card, showSuccess, showError, showInfo, showWarning } from '../components/index.js';
import { uiManager } from '../UIManager.js';
import { splitByChapters, splitBySize, testRegex, DEFAULT_CHAPTER_REGEX } from '../../utils/regex.js';
import { logger, LogLevel } from '../../utils/Logger.js';
import { ConfigKeys } from '../../core/Config.js';
import { HelpModal } from './HelpModal.js';
import { apiService } from '../../services/APIService.js';

/**
 * 主面板配置
 */
export class MainPanelConfig {
    constructor({
        containerId = 'ttw-main-panel'
    } = {}) {
        this.containerId = containerId;
    }
}

/**
 * TXT 转世界书主面板
 */
export class TxtToWorldbookPanel {
    constructor(config = {}) {
        this.config = new MainPanelConfig(config);
        this.element = null;
        this.isVisible = false;
        this.onFileSelect = null;
        this.onStart = null;
        this.onPause = null;
        this.onResume = null;
        this.onStop = null;
        this.onRechunk = null;
        this.chapters = [];
        this.startFromIndex = 0;
        this.isMultiSelectMode = false;
        this.selectedChapterIndices = new Set();
        this.helpModal = null;
        this.eventListeners = []; // 用于跟踪绑定的事件监听器
    }

    /**
     * 创建面板 HTML
     */
    createHTML() {
        return `
            <div id="ttw-main-panel" class="worldinfo-container">
                <!-- 头部 -->
                <div class="worldinfo-header">
                    <div class="worldinfo-title">
                        📚 TXT 转世界书
                    </div>
                    <div class="worldinfo-actions">
                        <button id="ttw-help-btn" class="ww-btn ww-btn-info ww-btn-small" title="帮助">❓</button>
                        <button id="ttw-close-btn" class="ww-btn ww-btn-danger ww-btn-small" title="关闭">✕</button>
                    </div>
                </div>

                <!-- 文件上传区域 -->
                <div id="ttw-upload-section" class="ww-card">
                    <div class="ww-card-header">
                        <span class="ww-card-title">📁 文件导入</span>
                    </div>
                    <div class="ww-card-body">
                        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                            <input type="file" id="ttw-file-input" accept=".txt,.epub" style="display:none;">
                            <button id="ttw-select-file-btn" class="ww-btn ww-btn-primary">
                                📂 选择文件
                            </button>
                            <span id="ttw-file-info" style="color:var(--ww-text-secondary);font-size:13px;"></span>
                            <span id="ttw-encoding-info" style="color:var(--ww-info);font-size:12px;"></span>
                        </div>
                    </div>
                </div>

                <!-- 分块设置 -->
                <div id="ttw-chunk-section" class="ww-card ww-collapsible">
                    <div class="ww-card-header">
                        <span class="ww-card-title">📐 分块设置</span>
                        <div style="display:flex;gap:8px;">
                            <button id="ttw-test-regex-btn" class="ww-btn ww-btn-secondary ww-btn-small" title="测试正则表达式">🧪 测试正则</button>
                            <button id="ttw-rechunk-btn" class="ww-btn ww-btn-warning ww-btn-small" title="重新分块">🔄 重新分块</button>
                            <button class="ww-btn ww-btn-icon ww-toggle-btn">▼</button>
                        </div>
                    </div>
                    <div class="ww-card-body">
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                            <div class="ww-input-group">
                                <label class="ww-input-label">每块字数</label>
                                <input type="number" id="ttw-chunk-size" class="ww-input" value="15000" min="1000" max="200000">
                            </div>
                            <div class="ww-input-group">
                                <label class="ww-input-label">章回正则</label>
                                <input type="text" id="ttw-chapter-regex" class="ww-input" value="${DEFAULT_CHAPTER_REGEX}">
                            </div>
                        </div>
                        <div style="margin-top:10px;">
                            <label class="ww-checkbox">
                                <input type="checkbox" id="ttw-volume-mode">
                                <span class="ww-checkbox-label">📚 分卷模式（适合超长篇）</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- API 设置 -->
                <div id="ttw-api-section" class="ww-card ww-collapsible">
                    <div class="ww-card-header">
                        <span class="ww-card-title">🤖 API 设置</span>
                        <button class="ww-btn ww-btn-icon ww-toggle-btn">▼</button>
                    </div>
                    <div class="ww-card-body">
                        <div class="ww-input-group">
                            <label class="ww-input-label">API 模式</label>
                            <select id="ttw-api-mode" class="ww-select">
                                <option value="tavern">🏆 使用酒馆 API（推荐）</option>
                                <option value="gemini">💎 Gemini API</option>
                                <option value="deepseek">🐬 DeepSeek API</option>
                                <option value="openai">🔌 OpenAI 兼容</option>
                            </select>
                        </div>
                        <div id="ttw-api-custom-settings" style="display:none;">
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                                <div class="ww-input-group">
                                    <label class="ww-input-label">API Endpoint</label>
                                    <input type="text" id="ttw-api-endpoint" class="ww-input" placeholder="http://127.0.0.1:5000/v1">
                                </div>
                                <div class="ww-input-group">
                                    <label class="ww-input-label">API Key</label>
                                    <input type="password" id="ttw-api-key" class="ww-input" placeholder="可选">
                                </div>
                                <div class="ww-input-group">
                                    <label class="ww-input-label">模型名称</label>
                                    <input type="text" id="ttw-api-model" class="ww-input" placeholder="gemini-2.5-flash">
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:10px;display:flex;gap:8px;">
                            <button id="ttw-test-api-btn" class="ww-btn ww-btn-secondary ww-btn-small">⚡ 快速测试</button>
                            <button id="ttw-fetch-models-btn" class="ww-btn ww-btn-secondary ww-btn-small">📋 拉取模型列表</button>
                        </div>
                    </div>
                </div>

                <!-- 调试选项 -->
                <div id="ttw-debug-section" class="ww-card ww-collapsible">
                    <div class="ww-card-header">
                        <span class="ww-card-title">🐛 调试选项</span>
                        <button class="ww-btn ww-btn-icon ww-toggle-btn">▼</button>
                    </div>
                    <div class="ww-card-body">
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                            <div class="ww-input-group">
                                <label class="ww-checkbox" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                    <input type="checkbox" id="ttw-debug-mode" style="margin:0;">
                                    <span class="ww-checkbox-label">启用调试模式</span>
                                </label>
                                <p style="margin:4px 0 0;font-size:12px;color:var(--ww-text-muted);">调试模式将输出详细日志到控制台</p>
                            </div>
                            <div class="ww-input-group">
                                <label class="ww-input-label">日志级别</label>
                                <select id="ttw-log-level" class="ww-select">
                                    <option value="0">🐛 DEBUG (调试)</option>
                                    <option value="1" selected>ℹ️ INFO (信息)</option>
                                    <option value="2">⚠️ WARN (警告)</option>
                                    <option value="3">❌ ERROR (错误)</option>
                                </select>
                            </div>
                        </div>
                        <div id="ttw-debug-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                            <button id="ttw-clear-logs-btn" class="ww-btn ww-btn-secondary ww-btn-small">📝 清空控制台</button>
                            <button id="ttw-test-logger-btn" class="ww-btn ww-btn-secondary ww-btn-small">📉 测试日志</button>
                        </div>
                    </div>
                </div>

                <!-- 章节列表 -->
                <div id="ttw-chapter-section" class="ww-card">
                    <div class="ww-card-header">
                        <span class="ww-card-title">📖 章节列表 <span id="ttw-chapter-count" style="color:var(--ww-text-muted);font-size:12px;">(0 章)</span></span>
                        <div style="display:flex;gap:8px;">
                            <button id="ttw-multi-select-btn" class="ww-btn ww-btn-warning ww-btn-small" title="多选删除模式">✅ 多选</button>
                            <button id="ttw-select-start-btn" class="ww-btn ww-btn-info ww-btn-small" title="选择从哪一章开始处理">📍 选择起始</button>
                        </div>
                    </div>
                    <div class="ww-card-body">
                        <div id="ttw-multi-select-bar" style="display:none;margin-bottom:10px;padding:8px;background:rgba(231,76,60,0.15);border-radius:6px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="color:var(--ww-danger);font-size:13px;">🗑️ 多选删除模式</span>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <span id="ttw-selected-count" style="font-size:12px;color:var(--ww-text-secondary);">已选：0</span>
                                    <button id="ttw-delete-selected-btn" class="ww-btn ww-btn-small ww-btn-danger">🗑️ 删除选中</button>
                                    <button id="ttw-exit-multi-select-btn" class="ww-btn ww-btn-small ww-btn-secondary">退出</button>
                                </div>
                            </div>
                        </div>
                        <div id="ttw-chapter-list" class="ww-chapter-list">
                            <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                                请先上传文件
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 进度控制 -->
                <div id="ttw-progress-section" class="ww-card" style="display:none;">
                    <div class="ww-card-header">
                        <span class="ww-card-title">⚡ 处理进度</span>
                    </div>
                    <div class="ww-card-body">
                        <div id="ttw-progress-bar" class="ww-progress-container">
                            <div class="ww-progress-bar">
                                <div id="ttw-progress-fill" class="ww-progress-fill" style="width:0%;"></div>
                            </div>
                            <div id="ttw-progress-text" class="ww-progress-text">0 / 0 (0%)</div>
                        </div>
                        <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
                            <button id="ttw-start-btn" class="ww-btn ww-btn-success">🚀 开始转换</button>
                            <button id="ttw-pause-btn" class="ww-btn ww-btn-warning" style="display:none;">⏸️ 暂停</button>
                            <button id="ttw-resume-btn" class="ww-btn ww-btn-info" style="display:none;">▶️ 恢复</button>
                            <button id="ttw-stop-btn" class="ww-btn ww-btn-danger" style="display:none;">⏹️ 停止</button>
                        </div>
                        <div id="ttw-stream-content" style="margin-top:10px;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;font-size:11px;color:var(--ww-text-secondary);white-space:pre-wrap;"></div>
                    </div>
                </div>

                <!-- 世界书预览 -->
                <div id="ttw-result-section" class="ww-card" style="display:none;">
                    <div class="ww-card-header">
                        <span class="ww-card-title">📖 世界书预览</span>
                        <div style="display:flex;gap:8px;">
                            <button id="ttw-view-worldbook-btn" class="ww-btn ww-btn-info ww-btn-small">👁️ 详细视图</button>
                            <button id="ttw-history-btn" class="ww-btn ww-btn-secondary ww-btn-small">📜 历史记录</button>
                        </div>
                    </div>
                    <div class="ww-card-body">
                        <div id="ttw-worldbook-preview" style="max-height:400px;overflow-y:auto;">
                            <div style="text-align:center;color:var(--ww-text-muted);padding:40px;">
                                暂无世界书数据
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 导出区域 -->
                <div id="ttw-export-section" class="ww-card">
                    <div class="ww-card-header">
                        <span class="ww-card-title">📤 导出</span>
                    </div>
                    <div class="ww-card-body">
                        <div style="display:flex;gap:10px;flex-wrap:wrap;">
                            <button id="ttw-export-tavern-btn" class="ww-btn ww-btn-success">🏆 导出为酒馆格式</button>
                            <button id="ttw-export-json-btn" class="ww-btn ww-btn-primary">📦 导出为 JSON</button>
                            <button id="ttw-export-txt-btn" class="ww-btn ww-btn-secondary">📄 导出为 TXT</button>
                        </div>
                    </div>
                </div>

                <!-- 工具区域 -->
                <div id="ttw-tools-section" class="ww-card ww-collapsible">
                    <div class="ww-card-header">
                        <span class="ww-card-title">🔧 工具</span>
                        <button class="ww-btn ww-btn-icon ww-toggle-btn">▼</button>
                    </div>
                    <div class="ww-card-body">
                        <div style="display:flex;gap:10px;flex-wrap:wrap;">
                            <button id="ttw-find-replace-btn" class="ww-btn ww-btn-secondary">🔍 查找替换</button>
                            <button id="ttw-alias-merge-btn" class="ww-btn ww-btn-secondary">🔗 别名合并</button>
                            <button id="ttw-clear-tags-btn" class="ww-btn ww-btn-warning">🏷️ 清除标签</button>
                            <button id="ttw-consolidate-btn" class="ww-btn ww-btn-info">🧹 整理条目</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建面板
     */
    create() {
        const container = document.createElement('div');
        container.innerHTML = this.createHTML();
        this.element = container.firstElementChild;
        
        this.bindEvents();
        this.loadDebugSettings();
        return this.element;
    }

    /**
     * 加载调试设置
     */
    loadDebugSettings() {
        try {
            const config = uiManager.getConfig();
            if (!config) return;

            // 加载调试模式设置
            const debugMode = config.get(ConfigKeys.DEBUG_MODE, false);
            logger.setEnabled(debugMode);

            // 加载日志级别设置
            const logLevel = config.get(ConfigKeys.DEBUG_LOG_LEVEL, LogLevel.INFO);
            logger.setLevel(logLevel);

            // 更新UI状态
            const debugModeCheckbox = this.element?.querySelector('#ttw-debug-mode');
            if (debugModeCheckbox) {
                debugModeCheckbox.checked = debugMode;
            }

            const logLevelSelect = this.element?.querySelector('#ttw-log-level');
            if (logLevelSelect) {
                logLevelSelect.value = String(logLevel);
            }

            if (debugMode) {
                logger.info('[TxtToWorldbookPanel] 调试模式已启用，日志级别: ' + logLevel);
            }
        } catch (error) {
            console.error('加载调试设置失败:', error);
        }
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.element) return;

        const el = this.element;

        // 阻止面板内部点击事件冒泡到背景容器
        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 关闭按钮
        el.querySelector('#ttw-close-btn')?.addEventListener('click', () => {
            this.hide();
        });

        // 帮助按钮
        el.querySelector('#ttw-help-btn')?.addEventListener('click', () => {
            this.showHelp();
        });

        // 文件选择
        el.querySelector('#ttw-select-file-btn')?.addEventListener('click', () => {
            el.querySelector('#ttw-file-input')?.click();
        });

        el.querySelector('#ttw-file-input')?.addEventListener('change', (e) => {
            this.onFileSelect?.(e.target.files[0]);
        });

        // 控制按钮
        el.querySelector('#ttw-start-btn')?.addEventListener('click', () => this.onStart?.());
        el.querySelector('#ttw-pause-btn')?.addEventListener('click', () => this.onPause?.());
        el.querySelector('#ttw-resume-btn')?.addEventListener('click', () => this.onResume?.());
        el.querySelector('#ttw-stop-btn')?.addEventListener('click', () => this.onStop?.());

        // 重新分块
        el.querySelector('#ttw-rechunk-btn')?.addEventListener('click', () => {
            if (this.chapters.length === 0) {
                showError('请先上传文件');
                return;
            }
            if (confirm('⚠️ 重新分块将会清除所有已处理状态，确定继续吗？')) {
                this.onRechunk?.();
            }
        });

        // 测试正则
        el.querySelector('#ttw-test-regex-btn')?.addEventListener('click', () => {
            this.testChapterRegex();
        });

        // 选择起始
        el.querySelector('#ttw-select-start-btn')?.addEventListener('click', () => {
            this.showStartFromSelector();
        });

        // 多选删除模式
        el.querySelector('#ttw-multi-select-btn')?.addEventListener('click', () => {
            this.toggleMultiSelectMode();
        });

        // 退出多选
        el.querySelector('#ttw-exit-multi-select-btn')?.addEventListener('click', () => {
            this.exitMultiSelectMode();
        });

        // 删除选中
        el.querySelector('#ttw-delete-selected-btn')?.addEventListener('click', () => {
            this.deleteSelectedChapters();
        });

        // 折叠面板
        el.querySelectorAll('.ww-collapsible').forEach(card => {
            const toggleBtn = card.querySelector('.ww-toggle-btn');
            const body = card.querySelector('.ww-card-body');

            toggleBtn?.addEventListener('click', () => {
                const isCollapsed = body.style.display === 'none';
                body.style.display = isCollapsed ? 'block' : 'none';
                toggleBtn.textContent = isCollapsed ? '▼' : '▲';
            });
        });

        // API 模式切换
        el.querySelector('#ttw-api-mode')?.addEventListener('change', (e) => {
            const isCustom = e.target.value !== 'tavern';
            el.querySelector('#ttw-api-custom-settings').style.display = isCustom ? 'block' : 'none';
        });

        // 快速测试
        el.querySelector('#ttw-test-api-btn')?.addEventListener('click', () => {
            this.quickTestAPI();
        });

        // 拉取模型列表
        el.querySelector('#ttw-fetch-models-btn')?.addEventListener('click', () => {
            this.fetchModelList();
        });

        // 查看世界书
        el.querySelector('#ttw-view-worldbook-btn')?.addEventListener('click', () => {
            this.showWorldbookView();
        });

        // 历史记录
        el.querySelector('#ttw-history-btn')?.addEventListener('click', () => {
            this.showHistory();
        });

        // 导出酒馆格式
        el.querySelector('#ttw-export-tavern-btn')?.addEventListener('click', () => {
            this.exportTavern();
        });

        // 导出 JSON
        el.querySelector('#ttw-export-json-btn')?.addEventListener('click', () => {
            this.exportJSON();
        });

        // 导出 TXT
        el.querySelector('#ttw-export-txt-btn')?.addEventListener('click', () => {
            this.exportTXT();
        });

        // 查找替换
        el.querySelector('#ttw-find-replace-btn')?.addEventListener('click', () => {
            this.showFindReplace();
        });

        // 别名合并
        el.querySelector('#ttw-alias-merge-btn')?.addEventListener('click', () => {
            this.showAliasMerge();
        });

        // 清除标签
        el.querySelector('#ttw-clear-tags-btn')?.addEventListener('click', () => {
            this.showClearTags();
        });

        // 整理条目
        el.querySelector('#ttw-consolidate-btn')?.addEventListener('click', () => {
            this.showConsolidate();
        });

        // 调试选项
        this.bindDebugOptionsEvents();
    }

    /**
     * 绑定调试选项事件
     */
    bindDebugOptionsEvents() {
        const el = this.element;
        if (!el) return;

        // 调试模式开关
        const debugModeCheckbox = el.querySelector('#ttw-debug-mode');
        if (debugModeCheckbox) {
            // 从配置加载当前值
            const isEnabled = logger.isEnabled();
            debugModeCheckbox.checked = isEnabled;
            
            debugModeCheckbox.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                logger.setEnabled(enabled);
                
                // 同步到配置管理器
                const config = uiManager.getConfig();
                if (config) {
                    config.set(ConfigKeys.DEBUG_MODE, enabled);
                    config.save();
                }
                
                if (enabled) {
                    showSuccess('调试模式已启用，详细日志将输出到控制台');
                    logger.info('[TxtToWorldbookPanel] 调试模式已启用');
                } else {
                    showInfo('调试模式已关闭');
                }
            });
        }

        // 日志级别选择
        const logLevelSelect = el.querySelector('#ttw-log-level');
        if (logLevelSelect) {
            // 从配置加载当前值
            const currentLevel = logger.getLevel();
            logLevelSelect.value = String(currentLevel);
            
            logLevelSelect.addEventListener('change', (e) => {
                const level = parseInt(e.target.value, 10);
                logger.setLevel(level);
                
                // 同步到配置管理器
                const config = uiManager.getConfig();
                if (config) {
                    config.set(ConfigKeys.DEBUG_LOG_LEVEL, level);
                    config.save();
                }
                
                logger.info(`[TxtToWorldbookPanel] 日志级别已切换为: ${level}`);
            });
        }

        // 清空控制台按钮
        const clearLogsBtn = el.querySelector('#ttw-clear-logs-btn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => {
                if (typeof console.clear === 'function') {
                    console.clear();
                    showSuccess('控制台已清空');
                } else {
                    // 备用方案：输出分隔线
                    console.log('='.repeat(50));
                    console.log('--- 控制台清空标记 ---');
                    console.log('='.repeat(50));
                    showInfo('控制台标记已添加（浏览器不支持清除控制台）');
                }
            });
        }

        // 测试日志按钮
        const testLoggerBtn = el.querySelector('#ttw-test-logger-btn');
        if (testLoggerBtn) {
            testLoggerBtn.addEventListener('click', () => {
                logger.debug('这是一条 DEBUG 级别的测试日志');
                logger.info('这是一条 INFO 级别的测试日志');
                logger.warn('这是一条 WARN 级别的测试日志');
                logger.error('这是一条 ERROR 级别的测试日志');
                showSuccess('测试日志已发送，请查看控制台');
            });
        }
    }

    /**
     * 测试正则表达式
     */
    testChapterRegex() {
        const regexInput = this.element?.querySelector('#ttw-chapter-regex');
        const pattern = regexInput?.value || DEFAULT_CHAPTER_REGEX;
        
        if (this.chapters.length === 0) {
            showError('请先上传文件');
            return;
        }
        
        const content = this.chapters.map(ch => ch.content).join('');
        const result = testRegex(content, pattern);
        
        if (result.success && result.count > 0) {
            const preview = result.samples.slice(0, 10).join('\n');
            alert(`✅ 检测到 ${result.count} 个章节\n\n前 10 个章节:\n${preview}${result.count > 10 ? '\n...' : ''}`);
        } else if (result.success) {
            alert('⚠️ 未检测到章节，请检查正则表达式是否正确');
        } else {
            alert(`❌ 正则表达式错误:\n${result.error}`);
        }
    }

    /**
     * 显示起始位置选择器
     */
    showStartFromSelector() {
        if (this.chapters.length === 0) {
            showError('请先上传文件');
            return;
        }

        const modal = new Modal({
            title: '📍 选择起始位置',
            width: '500px',
            buttons: [
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '确定', type: 'primary', action: 'confirm' }
            ],
            onButtonClick: (action, event, modalInstance) => {
                if (action === 'confirm') {
                    const select = modalInstance.element?.querySelector('#ttw-start-from-select');
                    if (select) {
                        this.startFromIndex = parseInt(select.value);
                        this.updateStartButtonState();
                        showSuccess(`已从第${this.startFromIndex + 1}章开始`);
                    }
                }
                modalInstance.close();
            }
        });

        const optionsHtml = this.chapters.map((ch, index) => {
            const status = ch.processed ? (ch.failed ? '❗' : '✅') : '⏳';
            const isSelected = index === this.startFromIndex ? 'selected' : '';
            return `<option value="${index}" ${isSelected}>${status} 第${index + 1}章 - ${ch.title} (${(ch.content.length / 1000).toFixed(1)}k 字)</option>`;
        }).join('');

        const content = `
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:8px;font-size:13px;">从哪一章开始：</label>
                <select id="ttw-start-from-select" class="ww-select">${optionsHtml}</select>
            </div>
            <div style="padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:12px;color:#f39c12;">
                ⚠️ 从中间开始时，之前的世界书数据不会自动加载。
            </div>
        `;

        modal.open(content);
    }

    /**
     * 更新起始按钮状态
     */
    updateStartButtonState() {
        const btn = this.element?.querySelector('#ttw-select-start-btn');
        if (btn && this.startFromIndex > 0) {
            btn.textContent = `📍 从第${this.startFromIndex + 1}章开始`;
        }
    }

    /**
     * 显示面板
     */
    show() {
        if (!this.element) {
            this.create();
        }
        if (this.element) {
            const container = document.getElementById('worldinfo-app-container');

            // 如果元素已经有父元素，先移除
            if (this.element.parentElement) {
                this.element.parentElement.removeChild(this.element);
            }

            if (container) {
                // 启用容器的指针事件
                container.style.pointerEvents = 'auto';
                // 显示背景遮罩
                container.style.background = 'rgba(0, 0, 0, 0.5)';
                container.appendChild(this.element);
            }

            // 设置面板样式 - 响应式设计
            this.element.style.display = 'block';
            this.element.style.position = 'relative';
            this.element.style.margin = 'auto';

            // 根据屏幕宽度设置不同的宽度
            const screenWidth = window.innerWidth;
            if (screenWidth <= 480) {
                // 移动端小屏幕
                this.element.style.width = '100%';
                this.element.style.maxWidth = '100vw';
                this.element.style.height = '100%';
                this.element.style.maxHeight = '100vh';
                this.element.style.borderRadius = '0';
                this.element.style.margin = '0';
            } else if (screenWidth <= 768) {
                // 平板/大手机
                this.element.style.width = '95%';
                this.element.style.maxWidth = '95vw';
                this.element.style.height = 'auto';
                this.element.style.maxHeight = '95vh';
            } else {
                // PC端
                this.element.style.width = '900px';
                this.element.style.maxWidth = '95vw';
                this.element.style.height = 'auto';
                this.element.style.maxHeight = '90vh';
            }

            this.element.style.overflow = 'auto';
            this.element.style.pointerEvents = 'auto';
            this.element.style.zIndex = '99999';

            this.isVisible = true;
        }
    }

    /**
     * 隐藏面板
     */
    hide() {
        if (this.element) {
            this.element.style.display = 'none';
            this.isVisible = false;
        }
        // 恢复容器的指针事件和背景
        const container = document.getElementById('worldinfo-app-container');
        if (container) {
            container.style.pointerEvents = 'none';
            container.style.background = 'transparent';
        }
    }

    /**
     * 销毁面板，清理资源
     */
    destroy() {
        // 销毁帮助弹窗
        if (this.helpModal) {
            this.helpModal.destroy();
            this.helpModal = null;
        }
        
        // 清理 DOM 元素引用
        if (this.element && this.element.parentElement) {
            this.element.parentElement.removeChild(this.element);
        }
        this.element = null;
        
        // 清理数据
        this.chapters = [];
        this.selectedChapterIndices.clear();
        this.eventListeners = [];
        
        // 清理回调函数
        this.onFileSelect = null;
        this.onStart = null;
        this.onPause = null;
        this.onResume = null;
        this.onStop = null;
        this.onRechunk = null;
    }

    /**
     * 更新文件信息
     */
    updateFileInfo(filename, chunkCount, encoding = '') {
        const infoEl = this.element?.querySelector('#ttw-file-info');
        const encodingEl = this.element?.querySelector('#ttw-encoding-info');
        
        if (infoEl) {
            infoEl.textContent = `📄 ${filename} (${chunkCount}章)`;
        }
        if (encodingEl && encoding) {
            encodingEl.textContent = `编码：${encoding}`;
        }
    }

    /**
     * 更新章节列表
     */
    updateChapterList(chapters) {
        this.chapters = chapters;
        const listEl = this.element?.querySelector('#ttw-chapter-list');
        const countEl = this.element?.querySelector('#ttw-chapter-count');
        
        if (!listEl) return;
        
        if (chapters.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--ww-text-muted);padding:40px;">请先上传文件</div>';
            return;
        }
        
        countEl.textContent = `(${chapters.length}章)`;
        
        listEl.innerHTML = chapters.map((ch, i) => `
            <div class="ww-chapter-item ${ch.processed ? 'completed' : ''} ${ch.failed ? 'failed' : ''}" data-index="${i}" style="
                display:flex;
                align-items:center;
                padding:8px 12px;
                background:var(--ww-bg-card);
                border-radius:var(--ww-radius);
                cursor:pointer;
                transition:var(--ww-transition);
                border:1px solid transparent;
                ${ch.processed ? 'opacity:0.7;' : ''}
                ${ch.failed ? 'border-left:3px solid var(--ww-danger);' : ''}
            ">
                <span class="ww-chapter-icon" style="margin-right:8px;font-size:16px;">
                    ${ch.processed ? '✅' : ch.failed ? '❗' : '⏳'}
                </span>
                <span class="ww-chapter-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">
                    ${ch.title || `第${i + 1}章`}
                </span>
                <span class="ww-chapter-size" style="font-size:11px;color:var(--ww-text-muted);">
                    ${(ch.content.length / 1000).toFixed(1)}k
                </span>
            </div>
        `).join('');

        // 绑定点击事件 - 打开编辑对话框
        listEl.querySelectorAll('.ww-chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.showMemoryContentModal(index);
            });
        });
    }

    /**
     * 显示记忆内容编辑对话框
     */
    showMemoryContentModal(index) {
        const chapter = this.chapters[index];
        if (!chapter) return;

        const modal = new Modal({
            title: `📄 ${chapter.title} (第${index + 1}章)`,
            width: '900px',
            maxWidth: '95%',
            buttons: [
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '保存', type: 'primary', action: 'save' }
            ],
            onButtonClick: (action, event, modalInstance) => {
                if (action === 'save') {
                    const editor = modalInstance.element?.querySelector('#ttw-memory-content-editor');
                    if (editor) {
                        const newContent = editor.value;
                        if (newContent !== chapter.content) {
                            chapter.content = newContent;
                            chapter.processed = false;
                            chapter.failed = false;
                            chapter.result = null;
                            this.updateChapterList(this.chapters);
                            showSuccess('已保存修改');
                        }
                    }
                }
                modalInstance.close();
            }
        });

        const statusText = chapter.processed ? (chapter.failed ? '❗ 失败' : '✅ 完成') : '⏳ 等待';
        const statusColor = chapter.processed ? (chapter.failed ? 'var(--ww-danger)' : 'var(--ww-success)') : 'var(--ww-warning)';

        const content = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;">
                <div>
                    <span style="color:${statusColor};font-weight:bold;">${statusText}</span>
                    <span style="margin-left:16px;color:var(--ww-text-muted);">字数：<span id="ttw-char-count">${chapter.content.length.toLocaleString()}</span></span>
                </div>
                <div style="display:flex;gap:8px;">
                    <button id="ttw-copy-memory-content" class="ww-btn ww-btn-small">📋 复制</button>
                    ${index > 0 ? `<button id="ttw-append-to-prev" class="ww-btn ww-btn-small ww-btn-warning">⬆️ 合并到上一章</button>` : ''}
                    ${index < this.chapters.length - 1 ? `<button id="ttw-append-to-next" class="ww-btn ww-btn-small ww-btn-warning">⬇️ 合并到下一章</button>` : ''}
                </div>
            </div>
            ${chapter.failedError ? `<div style="margin-bottom:16px;padding:10px;background:rgba(231,76,60,0.2);border-radius:6px;color:var(--ww-danger);font-size:12px;">❌ ${chapter.failedError}</div>` : ''}
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h4 style="color:var(--ww-info);margin:0;">📝 原文内容 <span style="font-size:12px;font-weight:normal;color:var(--ww-text-muted);">(可编辑)</span></h4>
                </div>
                <textarea id="ttw-memory-content-editor" class="ww-input ww-textarea" rows="15" style="white-space:pre-wrap;word-break:break-all;">${chapter.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            </div>
        `;

        modal.open(content);

        // 绑定字符计数
        const editor = modal.element?.querySelector('#ttw-memory-content-editor');
        const charCount = modal.element?.querySelector('#ttw-char-count');
        editor?.addEventListener('input', () => {
            if (charCount) charCount.textContent = editor.value.length.toLocaleString();
        });

        // 绑定复制按钮
        modal.element?.querySelector('#ttw-copy-memory-content')?.addEventListener('click', async () => {
            if (editor) {
                await navigator.clipboard.writeText(editor.value);
                showSuccess('已复制');
            }
        });

        // 绑定合并到上一章
        modal.element?.querySelector('#ttw-append-to-prev')?.addEventListener('click', () => {
            if (index === 0) return;
            const prevChapter = this.chapters[index - 1];
            if (confirm(`将当前内容合并到 "${prevChapter.title}" 的末尾？\n\n⚠️ 合并后当前章将被删除！`)) {
                prevChapter.content += '\n\n' + chapter.content;
                prevChapter.processed = false;
                prevChapter.failed = false;
                prevChapter.result = null;
                this.chapters.splice(index, 1);
                this.chapters.forEach((ch, i) => {
                    if (!ch.title.includes('-')) ch.title = `第${i + 1}章`;
                });
                if (this.startFromIndex > index) {
                    this.startFromIndex = Math.max(0, this.startFromIndex - 1);
                }
                this.updateChapterList(this.chapters);
                this.updateStartButtonState();
                modal.close();
                showSuccess(`已合并到 "${prevChapter.title}"`);
            }
        });

        // 绑定合并到下一章
        modal.element?.querySelector('#ttw-append-to-next')?.addEventListener('click', () => {
            if (index === this.chapters.length - 1) return;
            const nextChapter = this.chapters[index + 1];
            if (confirm(`将当前内容合并到 "${nextChapter.title}" 的开头？\n\n⚠️ 合并后当前章将被删除！`)) {
                nextChapter.content = chapter.content + '\n\n' + nextChapter.content;
                nextChapter.processed = false;
                nextChapter.failed = false;
                nextChapter.result = null;
                this.chapters.splice(index, 1);
                this.chapters.forEach((ch, i) => {
                    if (!ch.title.includes('-')) ch.title = `第${i + 1}章`;
                });
                if (this.startFromIndex > index) {
                    this.startFromIndex = Math.max(0, this.startFromIndex - 1);
                }
                this.updateChapterList(this.chapters);
                this.updateStartButtonState();
                modal.close();
                showSuccess(`已合并到 "${nextChapter.title}"`);
            }
        });
    }

    /**
     * 更新进度
     */
    updateProgress(current, total) {
        const fillEl = this.element?.querySelector('#ttw-progress-fill');
        const textEl = this.element?.querySelector('#ttw-progress-text');
        
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        if (fillEl) {
            fillEl.style.width = `${percentage}%`;
        }
        if (textEl) {
            textEl.textContent = `${current} / ${total} (${percentage}%)`;
        }
    }

    /**
     * 更新按钮状态
     */
    updateButtonState(state) {
        const startBtn = this.element?.querySelector('#ttw-start-btn');
        const pauseBtn = this.element?.querySelector('#ttw-pause-btn');
        const resumeBtn = this.element?.querySelector('#ttw-resume-btn');
        const stopBtn = this.element?.querySelector('#ttw-stop-btn');
        const progressSection = this.element?.querySelector('#ttw-progress-section');
        const resultSection = this.element?.querySelector('#ttw-result-section');
        
        progressSection.style.display = 'block';
        
        switch (state) {
            case 'running':
                startBtn.style.display = 'none';
                pauseBtn.style.display = 'inline-block';
                resumeBtn.style.display = 'none';
                stopBtn.style.display = 'inline-block';
                break;
            case 'paused':
                startBtn.style.display = 'none';
                pauseBtn.style.display = 'none';
                resumeBtn.style.display = 'inline-block';
                stopBtn.style.display = 'inline-block';
                break;
            case 'stopped':
            default:
                startBtn.style.display = 'inline-block';
                pauseBtn.style.display = 'none';
                resumeBtn.style.display = 'none';
                stopBtn.style.display = 'none';
                break;
        }
    }

    /**
     * 更新世界书预览
     */
    updateWorldbookPreview(worldbook) {
        const previewEl = this.element?.querySelector('#ttw-worldbook-preview');
        if (!previewEl || !worldbook) return;
        
        if (Object.keys(worldbook).length === 0) {
            previewEl.innerHTML = '<div style="text-align:center;color:var(--ww-text-muted);padding:40px;">暂无世界书数据</div>';
            return;
        }
        
        let html = '';
        for (const [category, entries] of Object.entries(worldbook)) {
            const entryCount = Object.keys(entries).length;
            if (entryCount === 0) continue;
            
            html += `
                <div class="ww-worldbook-category" style="margin-bottom:12px;border:1px solid var(--ww-primary);border-radius:var(--ww-radius);overflow:hidden;">
                    <div class="ww-worldbook-category-header" style="background:linear-gradient(135deg,var(--ww-primary),var(--ww-primary-dark));padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
                        <span class="ww-worldbook-category-title" style="font-weight:bold;color:#fff;">📁 ${category}</span>
                        <span class="ww-worldbook-category-stats" style="font-size:12px;color:rgba(255,255,255,0.8);">${entryCount} 条目</span>
                    </div>
                    <div class="ww-worldbook-category-body" style="background:var(--ww-bg-secondary);padding:10px;">
            `;
            
            for (const [name, entry] of Object.entries(entries)) {
                const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                html += `
                    <div class="ww-worldbook-entry" style="margin:8px 0;border:1px solid var(--ww-border);border-radius:var(--ww-radius);overflow:hidden;">
                        <div class="ww-worldbook-entry-header" style="background:var(--ww-bg-tertiary);padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
                            <span class="ww-worldbook-entry-title" style="font-weight:bold;font-size:13px;color:var(--ww-text-primary);">📄 ${name}</span>
                            <span style="font-size:11px;color:var(--ww-text-muted);">${keywords ? keywords.substring(0, 30) : ''}</span>
                        </div>
                    </div>
                `;
            }
            
            html += '</div></div>';
        }
        
        previewEl.innerHTML = html;
    }

    /**
     * 添加流式日志
     */
    appendStreamLog(message) {
        const streamEl = this.element?.querySelector('#ttw-stream-content');
        if (streamEl) {
            streamEl.textContent += message + '\n';
            streamEl.scrollTop = streamEl.scrollHeight;
        }
    }

    /**
     * 清空流式日志
     */
    clearStreamLog() {
        const streamEl = this.element?.querySelector('#ttw-stream-content');
        if (streamEl) {
            streamEl.textContent = '';
        }
    }

    /**
     * 切换多选删除模式
     */
    toggleMultiSelectMode() {
        this.isMultiSelectMode = !this.isMultiSelectMode;
        this.updateChapterList(this.chapters);
        
        const multiSelectBar = this.element?.querySelector('#ttw-multi-select-bar');
        const multiSelectBtn = this.element?.querySelector('#ttw-multi-select-btn');
        
        if (this.isMultiSelectMode) {
            if (multiSelectBar) multiSelectBar.style.display = 'block';
            if (multiSelectBtn) {
                multiSelectBtn.textContent = '✅ 已开启';
                multiSelectBtn.classList.add('ww-btn-danger');
            }
        } else {
            this.exitMultiSelectMode();
        }
    }

    /**
     * 退出多选删除模式
     */
    exitMultiSelectMode() {
        this.isMultiSelectMode = false;
        this.selectedChapterIndices.clear();
        this.updateChapterList(this.chapters);
        
        const multiSelectBar = this.element?.querySelector('#ttw-multi-select-bar');
        const multiSelectBtn = this.element?.querySelector('#ttw-multi-select-btn');
        
        if (multiSelectBar) multiSelectBar.style.display = 'none';
        if (multiSelectBtn) {
            multiSelectBtn.textContent = '✅ 多选';
            multiSelectBtn.classList.remove('ww-btn-danger');
        }
    }

    /**
     * 删除选中的章节
     */
    deleteSelectedChapters() {
        if (this.selectedChapterIndices.size === 0) {
            showError('请先选择要删除的章节');
            return;
        }

        if (confirm(`确定要删除选中的 ${this.selectedChapterIndices.size} 个章节吗？\n\n此操作不可恢复！`)) {
            // 从后往前删除，避免索引变化
            const indices = Array.from(this.selectedChapterIndices).sort((a, b) => b - a);
            
            for (const index of indices) {
                this.chapters.splice(index, 1);
            }
            
            // 更新起始索引
            if (this.startFromIndex >= this.chapters.length) {
                this.startFromIndex = Math.max(0, this.chapters.length - 1);
            }
            
            this.selectedChapterIndices.clear();
            this.updateChapterList(this.chapters);
            this.exitMultiSelectMode();
            showSuccess(`已删除 ${indices.length} 个章节`);
        }
    }

    /**
     * 更新章节列表（支持多选模式）
     */
    updateChapterList(chapters) {
        this.chapters = chapters;
        const listEl = this.element?.querySelector('#ttw-chapter-list');
        const countEl = this.element?.querySelector('#ttw-chapter-count');
        
        if (!listEl) return;
        
        if (chapters.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--ww-text-muted);padding:40px;">请先上传文件</div>';
            return;
        }
        
        countEl.textContent = `(${chapters.length}章)`;
        
        if (this.isMultiSelectMode) {
            // 多选模式
            listEl.innerHTML = chapters.map((ch, i) => {
                const isSelected = this.selectedChapterIndices.has(i);
                return `
                    <div class="ww-chapter-item ${isSelected ? 'selected' : ''} ${ch.processed ? 'completed' : ''} ${ch.failed ? 'failed' : ''}" 
                         data-index="${i}" style="
                        display:flex;
                        align-items:center;
                        padding:8px 12px;
                        background:var(--ww-bg-card);
                        border-radius:var(--ww-radius);
                        cursor:pointer;
                        transition:var(--ww-transition);
                        border:2px solid ${isSelected ? 'var(--ww-danger)' : 'transparent'};
                        ${ch.processed ? 'opacity:0.7;' : ''}
                        ${ch.failed ? 'border-left:3px solid var(--ww-danger);' : ''}
                    ">
                        <input type="checkbox" class="ww-chapter-checkbox" data-index="${i}" ${isSelected ? 'checked' : ''} 
                               style="width:18px;height:18px;margin-right:10px;accent-color:var(--ww-danger);cursor:pointer;" 
                               onclick="event.stopPropagation();">
                        <span class="ww-chapter-icon" style="margin-right:8px;font-size:16px;">
                            ${ch.processed ? '✅' : ch.failed ? '❗' : '⏳'}
                        </span>
                        <span class="ww-chapter-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">
                            ${ch.title || `第${i + 1}章`}
                        </span>
                        <span class="ww-chapter-size" style="font-size:11px;color:var(--ww-text-muted);">
                            ${(ch.content.length / 1000).toFixed(1)}k
                        </span>
                    </div>
                `;
            }).join('');

            // 绑定复选框事件
            listEl.querySelectorAll('.ww-chapter-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    if (e.target.checked) {
                        this.selectedChapterIndices.add(index);
                    } else {
                        this.selectedChapterIndices.delete(index);
                    }
                    e.target.closest('.ww-chapter-item').classList.toggle('selected', e.target.checked);
                    
                    // 更新选中计数
                    const countEl = this.element?.querySelector('#ttw-selected-count');
                    if (countEl) countEl.textContent = `已选：${this.selectedChapterIndices.size}`;
                });
            });

            // 绑定点击事件（切换选中）
            listEl.querySelectorAll('.ww-chapter-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT') {
                        const cb = item.querySelector('.ww-chapter-checkbox');
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            });
        } else {
            // 普通模式
            listEl.innerHTML = chapters.map((ch, i) => `
                <div class="ww-chapter-item ${ch.processed ? 'completed' : ''} ${ch.failed ? 'failed' : ''}" data-index="${i}" style="
                    display:flex;
                    align-items:center;
                    padding:8px 12px;
                    background:var(--ww-bg-card);
                    border-radius:var(--ww-radius);
                    cursor:pointer;
                    transition:var(--ww-transition);
                    border:1px solid transparent;
                    ${ch.processed ? 'opacity:0.7;' : ''}
                    ${ch.failed ? 'border-left:3px solid var(--ww-danger);' : ''}
                ">
                    <span class="ww-chapter-icon" style="margin-right:8px;font-size:16px;">
                        ${ch.processed ? '✅' : ch.failed ? '❗' : '⏳'}
                    </span>
                    <span class="ww-chapter-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">
                        ${ch.title || `第${i + 1}章`}
                    </span>
                    <span class="ww-chapter-size" style="font-size:11px;color:var(--ww-text-muted);">
                        ${(ch.content.length / 1000).toFixed(1)}k
                    </span>
                </div>
            `).join('');

            // 绑定点击事件 - 打开编辑对话框
            listEl.querySelectorAll('.ww-chapter-item').forEach(item => {
                item.addEventListener('click', () => {
                    const index = parseInt(item.dataset.index);
                    this.showMemoryContentModal(index);
                });
            });
        }
    }

    /**
     * 显示帮助
     */
    showHelp() {
        console.log('[TxtToWorldbookPanel] showHelp() called');
        console.log('[TxtToWorldbookPanel] HelpModal:', HelpModal);
        
        try {
            // 直接使用 HelpModal，不依赖 window.WorldinfoApp
            if (!this.helpModal) {
                console.log('[TxtToWorldbookPanel] Creating new HelpModal instance');
                this.helpModal = new HelpModal({
                    onClose: () => {
                        console.log('[TxtToWorldbookPanel] HelpModal closed');
                        this.helpModal = null;
                    }
                });
                console.log('[TxtToWorldbookPanel] HelpModal instance created:', this.helpModal);
            }
            
            console.log('[TxtToWorldbookPanel] Opening HelpModal');
            this.helpModal.open();
            console.log('[TxtToWorldbookPanel] HelpModal.open() called');
        } catch (error) {
            console.error('[TxtToWorldbookPanel] showHelp() error:', error);
            showError('打开帮助失败：' + error.message);
        }
    }

    /**
     * 快速测试 API
     */
    async quickTestAPI() {
        const mode = this.element?.querySelector('#ttw-api-mode')?.value;

        if (mode === 'tavern') {
            // 酒馆 API 测试 - 使用 SillyTavern 的 generate 方法
            try {
                if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                    const ctx = SillyTavern.getContext();
                    if (ctx && typeof ctx.generate === 'function') {
                        showInfo('⏳ 正在测试酒馆 API...');
                        // 使用 SillyTavern 的 generate 进行简单测试
                        await ctx.generate('Say "OK" if you can hear me.', false);
                        showSuccess('酒馆 API 连接正常');
                        return;
                    }
                }
                showError('无法连接到酒馆 API，请检查 SillyTavern 是否正常运行');
            } catch (error) {
                showError('酒馆 API 测试失败：' + error.message);
            }
        } else {
            // 自定义 API 测试 - 使用 SillyTavern 后端代理避免 CORS
            showInfo('⏳ 正在测试 API...');

            try {
                const endpoint = this.element?.querySelector('#ttw-api-endpoint')?.value;
                const apiKey = this.element?.querySelector('#ttw-api-key')?.value;
                const model = this.element?.querySelector('#ttw-api-model')?.value;

                if (!endpoint) {
                    showError('请填写 API Endpoint');
                    return;
                }
                if (!model) {
                    showError('请填写模型名称');
                    return;
                }

                // 使用 SillyTavern 后端代理 API 请求，避免 CORS
                const requestBody = {
                    chat_completion_source: 'openai',
                    messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
                    model: model,
                    reverse_proxy: endpoint,
                    proxy_password: apiKey,
                    stream: false,
                    max_tokens: 100,
                    temperature: 0.1
                };

                const response = await fetch('/api/backends/chat-completions/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                const responseText = data.choices?.[0]?.message?.content || '';

                showSuccess(`API 连接正常\n响应: ${responseText}`);
            } catch (error) {
                console.error('[TxtToWorldbookPanel] API test error:', error);
                showError('API 测试失败：' + (error.message || '未知错误'));
            }
        }
    }

    /**
     * 拉取模型列表
     */
    async fetchModelList() {
        const mode = this.element?.querySelector('#ttw-api-mode')?.value;

        if (mode === 'tavern') {
            // 尝试从 SillyTavern 获取模型列表
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (ctx) {
                    // 尝试从 SillyTavern 的模型选择器获取
                    const modelSelector = document.querySelector('#model_select');
                    if (modelSelector) {
                        const models = Array.from(modelSelector.options).map(opt => opt.text || opt.value);
                        if (models.length > 0) {
                            alert('✅ 找到以下模型:\n\n' + models.join('\n'));
                            return;
                        }
                    }
                }
            }
            showInfo('酒馆 API 模式使用 SillyTavern 的模型选择器，无需手动拉取模型列表');
            return;
        }

        // 自定义 API 模式 - 使用 SillyTavern 后端代理避免 CORS
        const endpoint = this.element?.querySelector('#ttw-api-endpoint')?.value;
        const apiKey = this.element?.querySelector('#ttw-api-key')?.value;

        if (!endpoint) {
            showError('请填写 API Endpoint');
            return;
        }

        showInfo('⏳ 正在拉取模型列表...');

        try {
            // 使用 SillyTavern 后端代理 API 请求，避免 CORS
            const response = await fetch('/api/backends/chat-completions/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reverse_proxy: endpoint,
                    proxy_password: apiKey,
                    chat_completion_source: 'openai'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const rawData = await response.json();
            const models = Array.isArray(rawData) ? rawData : (rawData.data || rawData.models || []);

            if (!Array.isArray(models)) {
                throw new Error('API未返回有效的模型列表数组');
            }

            const formattedModels = models
                .map(m => {
                    const modelName = m.name ? m.name.replace('models/', '') : (m.id || m.model || m);
                    return modelName;
                })
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)));

            if (formattedModels.length > 0) {
                // 显示模型列表
                const modelList = formattedModels.map((m, i) => `${i + 1}. ${m}`).join('\n');
                alert(`✅ 找到 ${formattedModels.length} 个模型:\n\n${modelList}`);
            } else {
                showWarning('未找到任何模型，请检查 API 配置');
            }
        } catch (error) {
            console.error('[TxtToWorldbookPanel] 拉取模型列表失败:', error);
            showError('拉取模型列表失败：' + (error.message || '未知错误'));
        }
    }

    /**
     * 查看世界书详细视图
     */
    showWorldbookView() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.txtToWorldbookPanel) {
            window.WorldinfoApp.txtToWorldbookPanel.updateWorldbookPreview(
                window.WorldinfoApp.generatedWorldbook || {}
            );
            showSuccess('已更新世界书预览');
        } else {
            showError('世界书视图未初始化');
        }
    }

    /**
     * 查看历史记录
     */
    showHistory() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.historyViewer) {
            window.WorldinfoApp.historyViewer.open();
        } else {
            showError('历史记录功能未初始化');
        }
    }

    /**
     * 导出酒馆格式
     */
    exportTavern() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.exportWorldbook) {
            window.WorldinfoApp.exportWorldbook('tavern');
        } else {
            showError('导出功能未初始化');
        }
    }

    /**
     * 导出 JSON
     */
    exportJSON() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.exportWorldbook) {
            window.WorldinfoApp.exportWorldbook('json');
        } else {
            showError('导出功能未初始化');
        }
    }

    /**
     * 导出 TXT
     */
    exportTXT() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.exportWorldbook) {
            window.WorldinfoApp.exportWorldbook('txt');
        } else {
            showError('导出功能未初始化');
        }
    }

    /**
     * 查找替换
     */
    showFindReplace() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.findReplaceDialog) {
            window.WorldinfoApp.findReplaceDialog.config.worldbook = window.WorldinfoApp.generatedWorldbook || {};
            window.WorldinfoApp.findReplaceDialog.open();
        } else {
            showError('查找替换功能未初始化');
        }
    }

    /**
     * 别名合并
     */
    showAliasMerge() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.aliasMergeService) {
            showInfo('🔗 别名合并功能请使用世界书工具面板');
        } else {
            showInfo('🔗 别名合并功能即将推出');
        }
    }

    /**
     * 清除标签
     */
    showClearTags() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.clearTagsPanel) {
            window.WorldinfoApp.clearTagsPanel.config.worldbook = window.WorldinfoApp.generatedWorldbook || {};
            window.WorldinfoApp.clearTagsPanel.open();
        } else {
            showError('清除标签功能未初始化');
        }
    }

    /**
     * 整理条目
     */
    showConsolidate() {
        if (typeof window.WorldinfoApp !== 'undefined' && window.WorldinfoApp.consolidatePanel) {
            window.WorldinfoApp.consolidatePanel.open();
        } else {
            showError('整理条目功能未初始化');
        }
    }
}

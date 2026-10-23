import { t } from '../../txtToWorldbook/core/i18n.js';

export function createPanelHtml(totalFloors) {
    return `
    <div id="nag-container">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${t('novel.title')}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                
                <div class="nag-section nag-status-panel">
                    <span id="nag-status" class="nag-status-badge stopped">⏹️ 已停止</span>
                    <div class="nag-progress-container">
                        <div class="nag-progress-bar"><div id="nag-progress-fill" class="nag-progress-fill"></div></div>
                        <div id="nag-progress-text">0 / 1000 (0%)</div>
                    </div>
                    <div class="nag-stats-row">
                        <span>⏱️ <span id="nag-time-elapsed">--:--:--</span></span>
                        <span>⏳ <span id="nag-time-remaining">--:--:--</span></span>
                        <span>❌ <span id="nag-stat-errors">0</span></span>
                    </div>
                </div>
                
                <div class="nag-section nag-controls">
                    <div class="nag-btn-row">
                        <button id="nag-btn-start" class="menu_button">${t('novel.start')}</button>
                        <button id="nag-btn-pause" class="menu_button" disabled>${t('novel.pause')}</button>
                        <button id="nag-btn-resume" class="menu_button" disabled>${t('novel.resume')}</button>
                        <button id="nag-btn-stop" class="menu_button" disabled>${t('novel.stop')}</button>
                    </div>
                    <div class="nag-btn-row"><button id="nag-btn-reset" class="menu_button">${t('novel.reset')}</button></div>
                </div>

                <!-- ${t('novel.generateSettings')}模块 -->
                <div id="nag-panel-generate" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="generate">
                        <span class="nag-panel-title">${t('novel.generateSettings')}</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="generate" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-setting-item"><label>${t('novel.targetChapters')}</label><input type="number" id="nag-set-total" min="1"></div>
                        <div class="nag-setting-item"><label>${t('novel.prompt')}</label><textarea id="nag-set-prompt" rows="2"></textarea></div>
                    </div>
                </div>

                <!-- ${t('novel.exportSettings')}模块 -->
                <div id="nag-panel-export" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="export">
                        <span class="nag-panel-title">${t('novel.exportSettings')}</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="export" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-floor-info">${t('novel.floors', { count: `<span id="nag-total-floors">${totalFloors}</span>` })} <button id="nag-btn-refresh-floors" class="menu_button_icon">🔄</button></div>
                        <div class="nag-checkbox-group"><label class="nag-checkbox-label"><input type="checkbox" id="nag-set-export-all"><span>${t('novel.exportAll')}</span></label></div>
                        <div id="nag-floor-inputs" class="nag-setting-row">
                            <div class="nag-setting-item"><label>${t('novel.startFloor')}</label><input type="number" id="nag-set-start-floor" min="0"></div>
                            <div class="nag-setting-item"><label>${t('novel.endFloor')}</label><input type="number" id="nag-set-end-floor" min="0"></div>
                        </div>
                        <div class="nag-checkbox-group">
                            <label class="nag-checkbox-label"><input type="checkbox" id="nag-set-include-user"><span>${t('novel.includeUser')}</span></label>
                            <label class="nag-checkbox-label"><input type="checkbox" id="nag-set-include-ai"><span>${t('novel.includeAI')}</span></label>
                            <label class="nag-checkbox-label"><input type="checkbox" id="nag-set-use-raw"><span>${t('novel.useRaw')}</span></label>
                        </div>
                        <div class="nag-btn-row">
                            <button id="nag-btn-export-txt" class="menu_button">${t('novel.exportTxt')}</button>
                            <button id="nag-btn-export-json" class="menu_button">${t('novel.exportJson')}</button>
                        </div>
                    </div>
                </div>

                <!-- ${t('novel.tagSettings')}模块 -->
                <div id="nag-panel-extract" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="extract">
                        <span class="nag-panel-title">${t('novel.tagSettings')}</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="extract" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        <div class="nag-setting-item">
                            <label>提取模式</label>
                            <select id="nag-set-extract-mode">
                                <option value="all">全部内容</option>
                                <option value="tags">只提取指定标签</option>
                            </select>
                        </div>
                        <div class="nag-setting-item" id="nag-tags-container">
                            <label>标签名称 <span class="nag-hint">(空格/逗号分隔)</span></label>
                            <textarea id="nag-set-tags" rows="1" placeholder="content detail 正文"></textarea>
                        </div>
                        <div class="nag-setting-item" id="nag-separator-container">
                            <label>分隔符</label>
                            <select id="nag-set-separator">
                                <option value="\\n\\n">空行</option>
                                <option value="\\n">换行</option>
                                <option value="">无</option>
                            </select>
                        </div>
                        <div class="nag-setting-item">
                            <label>移除标签 <span class="nag-hint">(可选，空格/逗号分隔)</span></label>
                            <textarea id="nag-set-exclude-tags" rows="1" placeholder="thinking summary note"></textarea>
                        </div>
                        <div class="nag-extract-preview">
                            <div class="nag-preview-header">
                                <span>📋 预览</span>
                                <button id="nag-btn-refresh-preview" class="menu_button_icon">🔄</button>
                            </div>
                            <div id="nag-preview-content" class="nag-preview-box"><i>点击刷新</i></div>
                        </div>
                    </div>
                </div>

                <!-- ${t('novel.advancedSettings')}模块 -->
                <div id="nag-panel-advanced" class="nag-section nag-settings nag-collapsible">
                    <div class="nag-panel-header" data-panel="advanced">
                        <span class="nag-panel-title">${t('novel.advancedSettings')}</span>
                        <div class="nag-panel-actions">
                            <span class="nag-help-btn" data-help="advanced" title="帮助">❓</span>
                            <span class="nag-collapse-icon">▼</span>
                        </div>
                    </div>
                    <div class="nag-panel-content">
                        
                        <!-- 发送阶段模块 -->
                        <div class="nag-module nag-module-send">
                            <div class="nag-module-header">
                                <span class="nag-module-icon">📤</span>
                                <span class="nag-module-title">发送阶段</span>
                            </div>
                            <div class="nag-module-body">
                                <div class="nag-module-desc">消息发送后，等待剧情推进等插件处理完成</div>
                                <div class="nag-checkbox-group">
                                    <label class="nag-checkbox-label">
                                        <input type="checkbox" id="nag-set-send-toast-detection">
                                        <span>💬 启用弹窗检测</span>
                                    </label>
                                </div>
                                <div id="nag-send-toast-settings">
                                    <div class="nag-setting-row">
                                        <div class="nag-setting-item">
                                            <label>等待超时 (ms)</label>
                                            <input type="number" id="nag-set-send-toast-timeout" min="5000" step="5000">
                                        </div>
                                        <div class="nag-setting-item">
                                            <label>额外等待 (ms)</label>
                                            <input type="number" id="nag-set-send-post-toast-wait" min="0" step="500">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 回复阶段模块 -->
                        <div class="nag-module nag-module-reply">
                            <div class="nag-module-header">
                                <span class="nag-module-icon">📥</span>
                                <span class="nag-module-title">回复阶段</span>
                            </div>
                            <div class="nag-module-body">
                                <div class="nag-module-desc">AI回复完成后，等待总结等插件处理完成</div>
                                <div class="nag-setting-row">
                                    <div class="nag-setting-item">
                                        <label>回复后等待 (ms)</label>
                                        <input type="number" id="nag-set-reply-wait" min="0" step="1000">
                                    </div>
                                    <div class="nag-setting-item">
                                        <label>稳定检查间隔 (ms)</label>
                                        <input type="number" id="nag-set-stability-interval" min="500" step="500">
                                    </div>
                                </div>
                                <div class="nag-setting-item">
                                    <label>稳定次数</label>
                                    <input type="number" id="nag-set-stability-count" min="1" style="width: 100px;">
                                </div>
                                <div class="nag-checkbox-group">
                                    <label class="nag-checkbox-label">
                                        <input type="checkbox" id="nag-set-reply-toast-detection">
                                        <span>💬 启用弹窗检测</span>
                                    </label>
                                </div>
                                <div id="nag-reply-toast-settings">
                                    <div class="nag-setting-row">
                                        <div class="nag-setting-item">
                                            <label>等待超时 (ms)</label>
                                            <input type="number" id="nag-set-reply-toast-timeout" min="10000" step="10000">
                                        </div>
                                        <div class="nag-setting-item">
                                            <label>额外等待 (ms)</label>
                                            <input type="number" id="nag-set-reply-post-toast-wait" min="0" step="500">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 生成控制模块 -->
                        <div class="nag-module nag-module-control">
                            <div class="nag-module-header">
                                <span class="nag-module-icon">🔧</span>
                                <span class="nag-module-title">生成控制</span>
                            </div>
                            <div class="nag-module-body">
                                <div class="nag-module-desc">控制自动生成的行为参数</div>
                                <div class="nag-setting-row">
                                    <div class="nag-setting-item">
                                        <label>${t('novel.autoSave')}</label>
                                        <input type="number" id="nag-set-autosave" min="1">
                                    </div>
                                    <div class="nag-setting-item">
                                        <label>${t('novel.maxRetries')}</label>
                                        <input type="number" id="nag-set-retries" min="1">
                                    </div>
                                </div>
                                <div class="nag-setting-item">
                                    <label>${t('novel.minLength')}</label>
                                    <input type="number" id="nag-set-minlen" min="0" style="width: 100px;">
                                </div>
                            </div>
                        </div>
                        
                        <div class="nag-debug-hint">控制台调试: <code>nagDebug()</code></div>
                    </div>
                </div>

                <!-- ${t('novel.txtToWorldbook')}模块 -->
                <div class="nag-section">
                    <div class="nag-btn-row">
                        <button id="nag-btn-txt-to-worldbook" class="menu_button" style="background: linear-gradient(135deg, #e67e22, #d35400);">
                            ${t('novel.txtToWorldbook')}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </div>`;
}

import { t } from '../core/i18n.js';

function buildCustomApiSectionHtml() {
    return `
<div id="ttw-custom-api-section" style="display:none;margin-bottom:16px;padding:12px;border:1px solid rgba(52,152,219,0.3);border-radius:8px;background:rgba(52,152,219,0.1);">
<div style="font-weight:bold;color:#3498db;margin-bottom:12px;">🔧 自定义API配置</div>
<div class="ttw-setting-item">
<label>${t('worldbook.apiProvider')}</label>
<select id="ttw-api-provider">
<option value="openai-compatible">OpenAI兼容</option>
<option value="gemini">Gemini</option>
<option value="anthropic">Anthropic</option>
</select>
</div>
        <div class="ttw-setting-item">
            <label>${t('worldbook.apiKey')} <span style="opacity:0.6;font-size:11px;">(本地模型可留空)</span></label>
            <input type="password" id="ttw-api-key" placeholder="输入API Key">
        </div>
<div class="ttw-setting-item" id="ttw-endpoint-container" style="display:none;">
<label>${t('worldbook.endpoint')} <span style="opacity:0.6;font-size:11px;">(留空使用默认URL)</span></label>
<input type="text" id="ttw-api-endpoint" placeholder="可选，自定义API地址">
</div>
        <div class="ttw-setting-item" id="ttw-model-input-container">
            <label>${t('worldbook.model')}</label>
            <input type="text" id="ttw-api-model" value="gemini-2.5-flash" placeholder="模型名称">
        </div>
        <div class="ttw-setting-item" id="ttw-model-select-container" style="display:none;">
            <label>${t('worldbook.model')}</label>
            <select id="ttw-model-select">
                <option value="">-- 请先拉取模型列表 --</option>
            </select>
        </div>
        <div class="ttw-model-actions" id="ttw-model-actions" style="display:none;">
            <button id="ttw-fetch-models" class="ttw-btn ttw-btn-small">${t('worldbook.fetchModels')}</button>
            <button id="ttw-quick-test" class="ttw-btn ttw-btn-small">${t('worldbook.quickTest')}</button>
            <span id="ttw-model-status" class="ttw-model-status"></span>
        </div>
    </div>`;
}

function buildParallelConfigHtml() {
    return `
    <div class="ttw-setting-card ttw-setting-card-blue">
        <div style="font-weight:bold;color:#3498db;margin-bottom:10px;">${t('worldbook.parallelTitle')}</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <label class="ttw-checkbox-label">
                <input type="checkbox" id="ttw-parallel-enabled" checked>
                <span>${t('worldbook.enable')}</span>
            </label>
            <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                ${t('worldbook.concurrency')}
                <input type="number" id="ttw-parallel-concurrency" value="3" min="1" max="10" class="ttw-input-small">
            </label>
        </div>
        <div style="margin-top:10px;">
            <select id="ttw-parallel-mode" class="ttw-select">
                <option value="independent">${t('worldbook.independentMode')}</option>
                <option value="batch">${t('worldbook.batchMode')}</option>
            </select>
        </div>
    </div>`;
}

function buildChapterRegexHtml() {
    return `
    <div class="ttw-setting-card" style="background:rgba(230,126,34,0.1);border:1px solid rgba(230,126,34,0.3);">
        <div style="font-weight:bold;color:#e67e22;margin-bottom:10px;">${t('worldbook.chapterRegexTitle')}</div>
        <div class="ttw-setting-hint" style="margin-bottom:8px;">${t('worldbook.chapterRegexHint')}</div>
        <input type="text" id="ttw-chapter-regex" class="ttw-input" value="第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]" style="margin-bottom:8px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="ttw-btn ttw-btn-small ttw-chapter-preset" data-regex="第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇]">${t('worldbook.presetChinese')}</button>
            <button class="ttw-btn ttw-btn-small ttw-chapter-preset" data-regex="Chapter\\s*\\d+">${t('worldbook.presetEnglish')}</button>
            <button class="ttw-btn ttw-btn-small ttw-chapter-preset" data-regex="第\\d+章">${t('worldbook.presetNumeric')}</button>
            <button id="ttw-test-chapter-regex" class="ttw-btn ttw-btn-small" style="background:#e67e22;">${t('worldbook.detect')}</button>
        </div>
    </div>`;
}

function buildBasicSettingsHtml() {
    return `
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-end;">
        <div style="flex:1;">
            <label class="ttw-label">${t('worldbook.chunkSize')}</label>
            <input type="number" id="ttw-chunk-size" value="15000" min="1000" max="500000" class="ttw-input">
        </div>
        <div style="flex:1;">
            <label class="ttw-label">${t('worldbook.apiTimeout')}</label>
            <input type="number" id="ttw-api-timeout" value="120" min="30" max="600" class="ttw-input">
        </div>
        <div>
            <button id="ttw-rechunk-btn" class="ttw-btn ttw-btn-small" style="background:rgba(230,126,34,0.5);" title="修改字数后点击重新分块">${t('worldbook.rechunk')}</button>
        </div>
    </div>`;
}

function buildCheckboxOptionsHtml() {
    return `
    <div style="display:flex;flex-direction:column;gap:8px;">
        <label class="ttw-checkbox-label ttw-checkbox-with-hint">
            <input type="checkbox" id="ttw-incremental-mode" checked>
            <div>
                <span>${t('worldbook.incremental')}</span>
                <div class="ttw-setting-hint">只输出变更的条目，减少重复内容</div>
            </div>
        </label>
        <label class="ttw-checkbox-label ttw-checkbox-with-hint ttw-checkbox-purple">
            <input type="checkbox" id="ttw-volume-mode">
            <div>
                <span>${t('worldbook.volume')}</span>
                <div class="ttw-setting-hint">上下文超限时自动分卷，避免记忆分裂</div>
            </div>
        </label>
        <label class="ttw-checkbox-label ttw-checkbox-with-hint" style="background:rgba(230,126,34,0.15);border:1px solid rgba(230,126,34,0.3);">
            <input type="checkbox" id="ttw-force-chapter-marker" checked>
            <div>
                <span style="color:#e67e22;">${t('worldbook.forceMarker')}</span>
                <div class="ttw-setting-hint">开启后会在提示词中强制AI将每个记忆块视为对应章节</div>
            </div>
        </label>
        <label class="ttw-checkbox-label ttw-checkbox-with-hint" style="background:rgba(52,152,219,0.15);border:1px solid rgba(52,152,219,0.3);">
            <input type="checkbox" id="ttw-allow-recursion">
            <div>
                <span style="color:#3498db;">${t('worldbook.recursion')}</span>
                <div class="ttw-setting-hint">勾选后条目可被其他条目激活，并可触发进一步递归</div>
            </div>
        </label>
    </div>`;
}

function buildFilterTagsHtml() {
    return `
    <div style="margin-top:12px;padding:10px;background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:6px;">
        <div style="font-weight:bold;color:#e74c3c;margin-bottom:6px;font-size:12px;">${t('worldbook.filterTags')}</div>
        <div class="ttw-setting-hint" style="margin-bottom:8px;font-size:11px;">
            用逗号分隔。<code>thinking</code>=移除&lt;thinking&gt;内容&lt;/thinking&gt;；<code>/think</code>=移除开头到&lt;/think&gt;的内容
        </div>
        <input type="text" id="ttw-filter-tags" class="ttw-input" value="thinking,/think" placeholder="例如: thinking,/think,tucao" style="font-size:12px;">
    </div>`;
}

function buildDebugModeHtml() {
    return `
    <div style="margin-top:10px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;">
            <input type="checkbox" id="ttw-debug-mode">
            <span>${t('worldbook.debugMode')}</span>
            <span style="color:#888;font-size:11px;">（在实时输出中打印每步操作和耗时）</span>
        </label>
    </div>`;
}

export function buildSettingsHtml() {
    return `
    <div class="ttw-section ttw-settings-section">
        <div class="ttw-section-header" data-section="settings">
            <span>${t('worldbook.settings')}</span>
            <span class="ttw-collapse-icon">▼</span>
        </div>
        <div class="ttw-section-content" id="ttw-settings-content">
            <div class="ttw-setting-card ttw-setting-card-green">
                <label class="ttw-checkbox-label">
                    <input type="checkbox" id="ttw-use-tavern-api" checked>
                    <div>
                        <span style="font-weight:bold;color:#27ae60;">${t('worldbook.useTavernApi')}</span>
                        <div class="ttw-setting-hint">勾选后使用酒馆当前连接的AI，不勾选则使用下方自定义API</div>
                    </div>
                </label>
            </div>
            ${buildCustomApiSectionHtml()}
            ${buildParallelConfigHtml()}
            ${buildChapterRegexHtml()}
            ${buildBasicSettingsHtml()}
            ${buildCheckboxOptionsHtml()}
            ${buildFilterTagsHtml()}
            ${buildDebugModeHtml()}
        </div>
        <div id="ttw-volume-indicator" class="ttw-volume-indicator"></div>
    </div>`;
}

function buildDefaultEntriesSectionHtml() {
    return `
    <div class="ttw-prompt-section" style="margin-top:16px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;">
        <div class="ttw-prompt-header ttw-prompt-header-green" data-target="ttw-default-entries-content">
            <div style="display:flex;align-items:center;gap:8px;">
                <span>📚</span><span style="font-weight:500;">${t('worldbook.defaultEntries')}</span>
                <span class="ttw-badge ttw-badge-gray">可选</span>
            </div>
            <span class="ttw-collapse-icon">▶</span>
        </div>
        <div id="ttw-default-entries-content" class="ttw-prompt-content">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div class="ttw-setting-hint" style="font-size:11px;">每次转换完成后自动添加的世界书条目</div>
                <div style="display:flex;gap:6px;">
                    <button id="ttw-add-default-entry" class="ttw-btn ttw-btn-small" style="background:#27ae60;">${t('worldbook.add')}</button>
                    <button id="ttw-apply-default-entries" class="ttw-btn ttw-btn-small">${t('worldbook.apply')}</button>
                </div>
            </div>
            <div id="ttw-default-entries-list" class="ttw-default-entries-list"></div>
        </div>
    </div>`;
}

function buildWorldbookPromptSectionHtml() {
    return `
    <div class="ttw-prompt-section">
        <div class="ttw-prompt-header ttw-prompt-header-blue" data-target="ttw-worldbook-content">
            <div style="display:flex;align-items:center;gap:8px;">
                <span>📚</span><span style="font-weight:500;">${t('worldbook.worldbookPrompt')}</span>
                <span class="ttw-badge ttw-badge-blue">必需</span>
            </div>
            <span class="ttw-collapse-icon">▶</span>
        </div>
        <div id="ttw-worldbook-content" class="ttw-prompt-content">
            <div class="ttw-setting-hint" style="margin-bottom:10px;">核心提示词。留空使用默认。</div>
            <div class="ttw-placeholder-hint" style="margin-bottom:10px;padding:8px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);border-radius:6px;">
                <span style="color:#e74c3c;font-weight:bold;">⚠️ 必须包含占位符：</span>
                <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px;color:#f39c12;font-family:monospace;">{DYNAMIC_JSON_TEMPLATE}</code>
                <div style="font-size:11px;color:#888;margin-top:4px;">此占位符会被自动替换为根据启用分类生成的JSON模板</div>
            </div>
            <textarea id="ttw-worldbook-prompt" rows="6" placeholder="留空使用默认..." class="ttw-textarea-small"></textarea>
            <div style="margin-top:8px;"><button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="worldbook">${t('worldbook.resetChain')}</button></div>
        </div>
    </div>`;
}

function buildPlotPromptSectionHtml() {
    return `
    <div class="ttw-prompt-section">
        <div class="ttw-prompt-header ttw-prompt-header-purple" data-target="ttw-plot-content">
            <div style="display:flex;align-items:center;gap:8px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="ttw-enable-plot">
                    <span>📖</span><span style="font-weight:500;">${t('worldbook.plotOutline')}</span>
                </label>
                <span class="ttw-badge ttw-badge-gray">可选</span>
            </div>
            <span class="ttw-collapse-icon">▶</span>
        </div>
        <div id="ttw-plot-content" class="ttw-prompt-content">
            <textarea id="ttw-plot-prompt" rows="4" placeholder="留空使用默认..." class="ttw-textarea-small"></textarea>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                <button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="plot">${t('worldbook.resetChain')}</button>
                <button class="ttw-btn ttw-btn-small" id="ttw-plot-export-config" style="background:rgba(155,89,182,0.3);">⚙️ 导出时的默认配置</button>
            </div>
        </div>
    </div>`;
}

function buildStylePromptSectionHtml() {
    return `
    <div class="ttw-prompt-section">
        <div class="ttw-prompt-header ttw-prompt-header-green" data-target="ttw-style-content">
            <div style="display:flex;align-items:center;gap:8px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" id="ttw-enable-style">
                    <span>🎨</span><span style="font-weight:500;">${t('worldbook.styleConfig')}</span>
                </label>
                <span class="ttw-badge ttw-badge-gray">可选</span>
            </div>
            <span class="ttw-collapse-icon">▶</span>
        </div>
        <div id="ttw-style-content" class="ttw-prompt-content">
            <textarea id="ttw-style-prompt" rows="4" placeholder="留空使用默认..." class="ttw-textarea-small"></textarea>
            <div style="margin-top:8px;"><button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="style">${t('worldbook.resetChain')}</button></div>
        </div>
    </div>`;
}

function buildMessageChainSectionHtml() {
    return `
    <div class="ttw-prompt-section">
        <div class="ttw-prompt-header" style="background:rgba(230,126,34,0.15);" data-target="ttw-suffix-content">
            <div style="display:flex;align-items:center;gap:8px;">
                <span>💬</span><span style="font-weight:500;color:#e67e22;">${t('worldbook.messageChain')}</span>
                <span class="ttw-badge ttw-badge-gray">可选</span>
            </div>
            <span class="ttw-collapse-icon">▶</span>
        </div>
        <div id="ttw-suffix-content" class="ttw-prompt-content">
            <div style="margin-bottom:12px;padding:10px;background:rgba(230,126,34,0.1);border-radius:6px;">
                <label style="font-size:12px;color:#e67e22;font-weight:bold;">📌 ${t('worldbook.extraSystemPrompt')}</label>
                <textarea id="ttw-extra-system-prompt" rows="3" placeholder="留空则不添加。内容由你自行填写；酒馆 API 模式仍可能被酒馆的提示词后处理影响。" class="ttw-textarea-small" style="margin-top:6px;"></textarea>
            </div>
            <div style="margin-bottom:12px;padding:10px;background:rgba(230,126,34,0.1);border-radius:6px;">
                <label style="font-size:12px;color:#e67e22;font-weight:bold;">📌 ${t('worldbook.suffixPrompt')}</label>
                <textarea id="ttw-suffix-prompt" rows="2" placeholder="例如：请特别注意提取XX信息，修复乱码内容，注意区分同名角色..." class="ttw-textarea-small" style="margin-top:6px;"></textarea>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
                <div class="ttw-setting-hint" style="margin-bottom:8px;line-height:1.6;">
                    💬 配置发送给AI的消息链（类似对话补全预设）。每条消息可指定角色。<br>
                    <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px;font-size:11px;">{PROMPT}</code> 占位符会被替换为实际组装好的提示词内容。
                </div>
                <div id="ttw-chain-tavern-warning" style="display:none;margin-bottom:8px;padding:8px 10px;background:rgba(231,76,60,0.15);border-left:3px solid #e74c3c;border-radius:0 6px 6px 0;font-size:11px;color:#e74c3c;line-height:1.6;">
                    ⚠️ <strong>酒馆API模式下</strong>，消息角色（system/assistant）会被酒馆的提示词后处理覆盖，且可能注入预设JB内容。<br>
                    要让角色设置完全生效，请切换到<strong>自定义API模式</strong>（直连API，不经过酒馆处理）。
                </div>
                <div id="ttw-message-chain-list" style="margin-bottom:8px;"></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button id="ttw-add-chain-msg" class="ttw-btn ttw-btn-small" style="background:rgba(52,152,219,0.5);">${t('worldbook.addMessage')}</button>
                    <button id="ttw-reset-chain" class="ttw-btn ttw-btn-small">${t('worldbook.resetChain')}</button>
                </div>
            </div>
        </div>
    </div>`;
}

function buildCategoriesSectionHtml() {
    return `
    <div class="ttw-prompt-section">
        <div class="ttw-prompt-header" style="background:rgba(155,89,182,0.15);" data-target="ttw-categories-content">
            <div style="display:flex;align-items:center;gap:8px;">
                <span>🏷️</span><span style="font-weight:500;color:#9b59b6;">${t('worldbook.categories')}</span>
            </div>
            <span class="ttw-collapse-icon">▶</span>
        </div>
        <div id="ttw-categories-content" class="ttw-prompt-content">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div class="ttw-setting-hint" style="font-size:11px;flex:1;">勾选要提取的分类</div>
                <div style="display:flex;gap:6px;">
                    <button id="ttw-add-category" class="ttw-btn ttw-btn-small" style="background:#9b59b6;">${t('worldbook.add')}</button>
                    <button id="ttw-reset-categories" class="ttw-btn ttw-btn-small">${t('worldbook.reset')}</button>
                </div>
            </div>
            <div id="ttw-categories-list" class="ttw-categories-list"></div>
        </div>
    </div>`;
}

function buildPromptConfigHtml() {
    return `
    <div class="ttw-prompt-config">
        <div class="ttw-prompt-config-header">
            <span>${t('settings.sections.prompt')}</span>
            <div style="display:flex;gap:8px;">
                <button id="ttw-export-settings" class="ttw-btn ttw-btn-small">${t('worldbook.exportSettings')}</button>
                <button id="ttw-import-settings" class="ttw-btn ttw-btn-small">${t('worldbook.importSettings')}</button>
                <button id="ttw-preview-prompt" class="ttw-btn ttw-btn-small">${t('worldbook.preview')}</button>
            </div>
        </div>
        ${buildWorldbookPromptSectionHtml()}
        ${buildPlotPromptSectionHtml()}
        ${buildStylePromptSectionHtml()}
        ${buildMessageChainSectionHtml()}
        ${buildCategoriesSectionHtml()}
    </div>`;
}

function buildFileUploadSectionHtml() {
    return `
    <div class="ttw-section">
        <div class="ttw-section-header">
            <span>${t('worldbook.upload')}</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="ttw-import-json" class="ttw-btn-small" title="导入已有世界书JSON进行合并">${t('worldbook.mergeWorldbook')}</button>
                <button id="ttw-import-task" class="ttw-btn-small">${t('worldbook.importTask')}</button>
                <button id="ttw-export-task" class="ttw-btn-small">${t('worldbook.exportTask')}</button>
                <button id="ttw-export-legacy" class="ttw-btn-small" title="导出升级前保留的旧检查点">${t('worldbook.legacyBackup')}</button>
            </div>
        </div>
        <div class="ttw-section-content">
            <div class="ttw-upload-area" id="ttw-upload-area">
                <div style="font-size:48px;margin-bottom:12px;">📁</div>
                <div style="font-size:14px;opacity:0.8;">点击或拖拽TXT文件到此处</div>
                <input type="file" id="ttw-file-input" accept=".txt" style="display:none;">
            </div>
            <div id="ttw-file-info" class="ttw-file-info">
                <span id="ttw-file-name"></span>
                <span id="ttw-file-size"></span>
                <button id="ttw-clear-file" class="ttw-btn-small">${t('worldbook.clearFile')}</button>
            </div>
            <div id="ttw-novel-name-row" style="display:none;margin-top:6px;padding:6px 10px;background:rgba(52,152,219,0.1);border-radius:6px;border:1px solid rgba(52,152,219,0.25);align-items:center;gap:8px;">
                <span style="font-size:12px;color:#3498db;white-space:nowrap;">📖 导出名称:</span>
                <input type="text" id="ttw-novel-name-input" placeholder="输入小说名（用于导出文件名）" style="flex:1;min-width:0;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:4px;padding:4px 8px;color:#eee;font-size:12px;outline:none;box-sizing:border-box;" />
            </div>
        </div>
    </div>`;
}

function buildQueueSectionHtml() {
    return `
    <div class="ttw-section" id="ttw-queue-section" style="display:none;">
        <div class="ttw-section-header">
            <span>${t('worldbook.queue')}</span>
            <div style="display:flex;gap:8px;margin-left:auto;">
                <button id="ttw-view-processed" class="ttw-btn-small">${t('worldbook.viewProcessed')}</button>
                <button id="ttw-select-start" class="ttw-btn-small">${t('worldbook.selectStart')}</button>
                <button id="ttw-multi-delete-btn" class="ttw-btn-small ttw-btn-warning">${t('worldbook.multiDelete')}</button>
            </div>
        </div>
        <div class="ttw-section-content">
            <div class="ttw-setting-hint" style="margin-bottom:8px;">💡 点击章节可<strong>查看/编辑/复制</strong>，支持<strong>🎲重Roll</strong></div>
            <div id="ttw-multi-select-bar" style="display:none;margin-bottom:8px;padding:8px;background:rgba(231,76,60,0.15);border-radius:6px;border:1px solid rgba(231,76,60,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:#e74c3c;font-weight:bold;">🗑️ 多选删除模式</span>
                    <div style="display:flex;gap:8px;">
                        <span id="ttw-selected-count" style="color:#888;">已选: 0</span>
                        <button id="ttw-confirm-multi-delete" class="ttw-btn ttw-btn-small ttw-btn-warning">${t('worldbook.confirmDelete')}</button>
                        <button id="ttw-cancel-multi-select" class="ttw-btn ttw-btn-small">${t('worldbook.cancel')}</button>
                    </div>
                </div>
            </div>
            <div id="ttw-memory-queue" class="ttw-memory-queue"></div>
        </div>
    </div>`;
}

function buildProgressSectionHtml() {
    return `
    <div class="ttw-section" id="ttw-progress-section" style="display:none;">
        <div class="ttw-section-header"><span>${t('worldbook.progress')}</span></div>
        <div class="ttw-section-content">
            <div class="ttw-progress-bar">
                <div id="ttw-progress-fill" class="ttw-progress-fill"></div>
            </div>
            <div id="ttw-progress-text" class="ttw-progress-text">准备中...</div>
            <div class="ttw-progress-controls">
                <button id="ttw-stop-btn" class="ttw-btn ttw-btn-secondary">${t('worldbook.pause')}</button>
                <button id="ttw-repair-btn" class="ttw-btn ttw-btn-warning" style="display:none;">${t('worldbook.repair')}</button>
                <button id="ttw-toggle-stream" class="ttw-btn ttw-btn-small">${t('worldbook.stream')}</button>
            </div>
            <div id="ttw-stream-container" class="ttw-stream-container">
                <div class="ttw-stream-header">
                    <span>${t('worldbook.streamHeader')}</span>
                    <div style="display:flex;gap:6px;">
                        <button id="ttw-copy-stream" class="ttw-btn-small" style="display:none;">${t('worldbook.copyStream')}</button>
                        <button id="ttw-clear-stream" class="ttw-btn-small">${t('worldbook.clearStream')}</button>
                    </div>
                </div>
                <pre id="ttw-stream-content" class="ttw-stream-content"></pre>
            </div>
        </div>
    </div>`;
}

function buildResultSectionHtml() {
    return `
    <div class="ttw-section" id="ttw-result-section" style="display:none;">
        <div class="ttw-section-header"><span>${t('worldbook.result')}</span></div>
        <div class="ttw-section-content">
            <div id="ttw-result-preview" class="ttw-result-preview"></div>
            <div class="ttw-result-actions">
                <button id="ttw-search-btn" class="ttw-btn">${t('worldbook.search')}</button>
                <button id="ttw-replace-btn" class="ttw-btn">${t('worldbook.replace')}</button>
                <button id="ttw-view-worldbook" class="ttw-btn">${t('worldbook.viewWorldbook')}</button>
                <button id="ttw-view-history" class="ttw-btn">${t('worldbook.history')}</button>
                <button id="ttw-consolidate-entries" class="ttw-btn" title="用AI整理条目，去除重复信息（执行前自动保存快照）">${t('worldbook.consolidate')}</button>
                <button id="ttw-clean-tags" class="ttw-btn" title="清除条目中的标签内容（不消耗Token）">${t('worldbook.cleanTags')}</button>
                <button id="ttw-manual-merge" class="ttw-btn" title="手动选择条目合并，作为自动别名识别漏检时的兜底（执行前自动保存快照）">${t('worldbook.manualMerge')}</button>
                <button id="ttw-alias-merge" class="ttw-btn" title="自动识别各分类中同一事物的不同称呼并合并（执行前自动保存快照）">${t('worldbook.aliasMerge')}</button>
                <button id="ttw-export-json" class="ttw-btn ttw-btn-primary">${t('worldbook.exportCard')}</button>
                <button id="ttw-export-volumes" class="ttw-btn" style="display:none;">${t('worldbook.exportVolumes')}</button>
                <button id="ttw-export-st" class="ttw-btn ttw-btn-primary">${t('worldbook.exportWorldbook')}</button>
                <button id="ttw-export-changed" class="ttw-btn" title="仅导出上次导出以来新增或修改的条目">${t('worldbook.exportChanged')}</button>
            </div>
        </div>
    </div>`;
}

function buildModalBodyHtml() {
    return `
    <div class="ttw-modal-body">
        ${buildSettingsHtml()}
        ${buildDefaultEntriesSectionHtml()}
        ${buildPromptConfigHtml()}
        ${buildFileUploadSectionHtml()}
        ${buildQueueSectionHtml()}
        ${buildProgressSectionHtml()}
        ${buildResultSectionHtml()}
    </div>`;
}

function buildModalFooterHtml() {
    return `
    <div class="ttw-modal-footer">
        <button id="ttw-start-btn" class="ttw-btn ttw-btn-primary" disabled>${t('worldbook.start')}</button>
    </div>`;
}

export function buildModalHtml() {
    return `
    <div class="ttw-modal">
        <div class="ttw-modal-header">
            <span class="ttw-modal-title">${t('worldbook.title')}</span>
            <div class="ttw-header-actions">
                <span class="ttw-help-btn" title="帮助">❓</span>
                <button class="ttw-modal-close" type="button">✕</button>
            </div>
        </div>
        ${buildModalBodyHtml()}
        ${buildModalFooterHtml()}
    </div>`;
}

export function hydrateSettingsFromState(deps = {}) {
    const { AppState, handleUseTavernApiChange, handleProviderChange, renderMessageChainUI } = deps;

    if (!AppState) return;

    const chunkSizeEl = document.getElementById('ttw-chunk-size');
    if (chunkSizeEl) chunkSizeEl.value = AppState.settings.chunkSize;

    const apiTimeoutEl = document.getElementById('ttw-api-timeout');
    if (apiTimeoutEl) apiTimeoutEl.value = Math.round((AppState.settings.apiTimeout || 120000) / 1000);

    const incrementalModeEl = document.getElementById('ttw-incremental-mode');
    if (incrementalModeEl) incrementalModeEl.checked = AppState.processing.incrementalMode;

    const volumeModeEl = document.getElementById('ttw-volume-mode');
    if (volumeModeEl) {
        volumeModeEl.checked = AppState.processing.volumeMode;
        const indicator = document.getElementById('ttw-volume-indicator');
        if (indicator) indicator.style.display = AppState.processing.volumeMode ? 'block' : 'none';
    }

    const enablePlotEl = document.getElementById('ttw-enable-plot');
    if (enablePlotEl) enablePlotEl.checked = AppState.settings.enablePlotOutline;

    const enableStyleEl = document.getElementById('ttw-enable-style');
    if (enableStyleEl) enableStyleEl.checked = AppState.settings.enableLiteraryStyle;

    const worldbookPromptEl = document.getElementById('ttw-worldbook-prompt');
    if (worldbookPromptEl) worldbookPromptEl.value = AppState.settings.customWorldbookPrompt || '';

    const plotPromptEl = document.getElementById('ttw-plot-prompt');
    if (plotPromptEl) plotPromptEl.value = AppState.settings.customPlotPrompt || '';

    const stylePromptEl = document.getElementById('ttw-style-prompt');
    if (stylePromptEl) stylePromptEl.value = AppState.settings.customStylePrompt || '';

    const parallelEnabledEl = document.getElementById('ttw-parallel-enabled');
    if (parallelEnabledEl) parallelEnabledEl.checked = AppState.config.parallel.enabled;

    const parallelConcurrencyEl = document.getElementById('ttw-parallel-concurrency');
    if (parallelConcurrencyEl) parallelConcurrencyEl.value = AppState.config.parallel.concurrency;

    const parallelModeEl = document.getElementById('ttw-parallel-mode');
    if (parallelModeEl) parallelModeEl.value = AppState.config.parallel.mode;

    const useTavernApiEl = document.getElementById('ttw-use-tavern-api');
    if (useTavernApiEl) {
        useTavernApiEl.checked = AppState.settings.useTavernApi;
        if (typeof handleUseTavernApiChange === 'function') {
            handleUseTavernApiChange();
        }
    }

    const apiProviderEl = document.getElementById('ttw-api-provider');
    if (apiProviderEl) apiProviderEl.value = AppState.settings.customApiProvider;

    const apiKeyEl = document.getElementById('ttw-api-key');
    if (apiKeyEl) apiKeyEl.value = AppState.settings.customApiKey;

    const apiEndpointEl = document.getElementById('ttw-api-endpoint');
    if (apiEndpointEl) apiEndpointEl.value = AppState.settings.customApiEndpoint;

    const apiModelEl = document.getElementById('ttw-api-model');
    if (apiModelEl) apiModelEl.value = AppState.settings.customApiModel;

    const forceChapterMarkerEl = document.getElementById('ttw-force-chapter-marker');
    if (forceChapterMarkerEl) forceChapterMarkerEl.checked = AppState.settings.forceChapterMarker;

    const suffixPromptEl = document.getElementById('ttw-suffix-prompt');
    if (suffixPromptEl) suffixPromptEl.value = AppState.settings.customSuffixPrompt || '';

    const extraSystemPromptEl = document.getElementById('ttw-extra-system-prompt');
    if (extraSystemPromptEl) extraSystemPromptEl.value = AppState.settings.extraSystemPrompt || '';

    if (typeof renderMessageChainUI === 'function') {
        renderMessageChainUI();
    }

    if (typeof handleProviderChange === 'function') {
        handleProviderChange();
    }

    const allowRecursionEl = document.getElementById('ttw-allow-recursion');
    if (allowRecursionEl) allowRecursionEl.checked = AppState.settings.allowRecursion;

    const filterTagsEl = document.getElementById('ttw-filter-tags');
    if (filterTagsEl) filterTagsEl.value = AppState.settings.filterResponseTags || 'thinking,/think';

    const debugModeEl = document.getElementById('ttw-debug-mode');
    if (debugModeEl) {
        debugModeEl.checked = AppState.settings.debugMode || false;
        const copyBtn = document.getElementById('ttw-copy-stream');
        if (copyBtn) copyBtn.style.display = AppState.settings.debugMode ? 'inline-block' : 'none';
    }
}

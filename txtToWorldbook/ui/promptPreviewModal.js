export function createPromptPreviewModal(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        alertAction,
        buildSystemPrompt,
        getChapterForcePrompt,
        getEnabledCategories,
        defaultWorldbookPrompt,
        defaultPlotPrompt,
        defaultStylePrompt,
        saveCurrentSettings,
    } = deps;

    function showPromptPreview() {
        try {
            const prompt = buildSystemPrompt() || '';
            const chapterForce = AppState.settings.forceChapterMarker ? getChapterForcePrompt(1) : '(已关闭)';
            const apiMode = AppState.settings.useTavernApi ? '酒馆API' : `自定义API (${AppState.settings.customApiProvider || '未设置'})`;
            const enabledCats = getEnabledCategories().map((c) => c.name).join(', ');
            const chain = Array.isArray(AppState.settings.promptMessageChain)
                ? AppState.settings.promptMessageChain
                : [{ role: 'user', content: '{PROMPT}', enabled: true }];
            const enabledChain = chain.filter((m) => m && m.enabled !== false);
            const chainInfo = enabledChain.map((m, i) => {
                const roleLabel = m.role === 'system' ? '🔷系统' : m.role === 'assistant' ? '🟡AI助手' : '🟢用户';
                const contentStr = typeof m.content === 'string' ? m.content : (m.content ? String(m.content) : '');
                const preview = contentStr.length > 60 ? `${contentStr.substring(0, 60)}...` : contentStr;
                return `  ${i + 1}. [${roleLabel}] ${preview}`;
            }).join('\n');

            const isParallelEnabled = AppState.config && AppState.config.parallel && AppState.config.parallel.enabled;
            const parallelMode = (AppState.config && AppState.config.parallel && AppState.config.parallel.mode) || '关闭';

            const previewContent = `当前提示词预览:\n\nAPI模式: ${apiMode}\n并行模式: ${isParallelEnabled ? parallelMode : '关闭'}\n强制章节标记: ${AppState.settings.forceChapterMarker ? '开启' : '关闭'}\n启用分类: ${enabledCats}\n\n【消息链 (${enabledChain.length}条消息)】\n${chainInfo}\n\n【章节强制标记示例】\n${chapterForce}\n\n【系统提示词】\n${prompt}`;

            const currentWorldbookPrompt = AppState.settings.customWorldbookPrompt || defaultWorldbookPrompt || '';
            const currentPlotPrompt = AppState.settings.customPlotPrompt || defaultPlotPrompt || '';
            const currentStylePrompt = AppState.settings.customStylePrompt || defaultStylePrompt || '';

            const esc = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const bodyHtml = `
<div style="margin-bottom:10px;">
  <div style="display:flex;gap:4px;margin-bottom:8px;" id="ttw-prompt-tabs">
    <button class="ttw-btn ttw-prompt-tab active" data-tab="preview" style="font-size:11px;padding:4px 10px;">预览</button>
    <button class="ttw-btn ttw-prompt-tab" data-tab="worldbook" style="font-size:11px;padding:4px 10px;">世界书提示词</button>
    <button class="ttw-btn ttw-prompt-tab" data-tab="plot" style="font-size:11px;padding:4px 10px;">剧情大纲模板</button>
    <button class="ttw-btn ttw-prompt-tab" data-tab="style" style="font-size:11px;padding:4px 10px;">文风模板</button>
  </div>
  <div style="font-size:10px;color:#888;margin-bottom:6px;">
    占位符: <code>{DYNAMIC_JSON_TEMPLATE}</code> JSON模板 | <code>{ENABLED_CATEGORY_NAMES}</code> 启用分类
  </div>
</div>
<div id="ttw-prompt-tab-preview" class="ttw-prompt-panel">
  <textarea readonly style="width:100%;height:380px;resize:vertical;box-sizing:border-box;background:rgba(0,0,0,0.3);color:#ccc;border:1px solid #555;padding:10px;font-family:monospace;border-radius:4px;white-space:pre-wrap;">${esc(previewContent)}</textarea>
</div>
<div id="ttw-prompt-tab-worldbook" class="ttw-prompt-panel" style="display:none;">
  <textarea id="ttw-edit-worldbook-prompt" style="width:100%;height:380px;resize:vertical;box-sizing:border-box;background:rgba(0,0,0,0.2);color:#ddd;border:1px solid #555;padding:10px;font-family:monospace;border-radius:4px;white-space:pre-wrap;">${esc(currentWorldbookPrompt)}</textarea>
</div>
<div id="ttw-prompt-tab-plot" class="ttw-prompt-panel" style="display:none;">
  <textarea id="ttw-edit-plot-prompt" style="width:100%;height:380px;resize:vertical;box-sizing:border-box;background:rgba(0,0,0,0.2);color:#ddd;border:1px solid #555;padding:10px;font-family:monospace;border-radius:4px;white-space:pre-wrap;">${esc(currentPlotPrompt)}</textarea>
</div>
<div id="ttw-prompt-tab-style" class="ttw-prompt-panel" style="display:none;">
  <textarea id="ttw-edit-style-prompt" style="width:100%;height:380px;resize:vertical;box-sizing:border-box;background:rgba(0,0,0,0.2);color:#ddd;border:1px solid #555;padding:10px;font-family:monospace;border-radius:4px;white-space:pre-wrap;">${esc(currentStylePrompt)}</textarea>
</div>`;

            const footerHtml = `
<button class="ttw-btn" id="ttw-prompt-reset" style="margin-right:auto;">恢复默认</button>
<button class="ttw-btn ttw-btn-primary" id="ttw-prompt-save">保存</button>
<button class="ttw-btn" id="ttw-close-prompt-preview">关闭</button>`;

            const modal = ModalFactory.create({
                id: 'ttw-prompt-preview-modal',
                title: '🔍 提示词预览与编辑',
                body: bodyHtml,
                footer: footerHtml,
                maxWidth: '850px',
            });

            let activeTab = 'preview';

            modal.querySelectorAll('.ttw-prompt-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeTab = btn.getAttribute('data-tab');
                    modal.querySelectorAll('.ttw-prompt-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    modal.querySelectorAll('.ttw-prompt-panel').forEach(p => p.style.display = 'none');
                    const panel = modal.querySelector(`#ttw-prompt-tab-${activeTab}`);
                    if (panel) panel.style.display = 'block';
                });
            });

            modal.querySelector('#ttw-prompt-save').addEventListener('click', () => {
                const wbVal = modal.querySelector('#ttw-edit-worldbook-prompt').value;
                const plotVal = modal.querySelector('#ttw-edit-plot-prompt').value;
                const styleVal = modal.querySelector('#ttw-edit-style-prompt').value;

                AppState.settings.customWorldbookPrompt = wbVal || '';
                AppState.settings.customPlotPrompt = plotVal || '';
                AppState.settings.customStylePrompt = styleVal || '';

                if (typeof saveCurrentSettings === 'function') saveCurrentSettings();
                ErrorHandler.showUserSuccess('提示词模板已保存');
                ModalFactory.close(modal);
            });

            modal.querySelector('#ttw-prompt-reset').addEventListener('click', () => {
                if (activeTab === 'worldbook') {
                    modal.querySelector('#ttw-edit-worldbook-prompt').value = defaultWorldbookPrompt || '';
                } else if (activeTab === 'plot') {
                    modal.querySelector('#ttw-edit-plot-prompt').value = defaultPlotPrompt || '';
                } else if (activeTab === 'style') {
                    modal.querySelector('#ttw-edit-style-prompt').value = defaultStylePrompt || '';
                }
            });

            modal.querySelector('#ttw-close-prompt-preview').addEventListener('click', () => {
                ModalFactory.close(modal);
            });
        } catch (error) {
            console.error('Preview error:', error);
            if (typeof ErrorHandler !== 'undefined' && ErrorHandler.showUserError) {
                ErrorHandler.showUserError(`预览失败: ${error.message}`);
            } else {
                alertAction({ title: '预览失败', message: `预览失败: ${error.message}` });
            }
        }
    }

    return {
        showPromptPreview,
    };
}

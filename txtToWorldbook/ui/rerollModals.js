import { runWithConcurrency } from '../core/concurrency.js';

export function createRerollModals(deps = {}) {
    const {
        AppState,
        ModalFactory,
        MemoryHistoryDB,
        ListRenderer,
        Logger,
        ErrorHandler,
        confirmAction,
        parseAIResponse,
        rebuildWorldbookFromMemories,
        updateMemoryQueueUI,
        findEntrySourceMemories,
        handleRerollMemory,
        handleRerollSingleEntry,
        handleStopProcessing,
        setProcessingStatus,
        getProcessingStatus,
        saveCurrentSettings,
        getEntryTotalTokens,
        updateWorldbookPreview,
    } = deps;

    function buildRerollSourcesHtml(sources) {
        if (sources.length === 0) {
            return '<div style="color:#e74c3c;font-size:12px;">⚠️ 未找到该条目的来源章节（可能是默认条目或导入条目）</div>';
        }
        let html = '<div style="font-size:12px;color:#888;margin-bottom:8px;">该条目来自以下章节（可多选）：</div>';
        sources.forEach(source => {
            html += `
        <label class="ttw-checkbox-label" style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(39,174,96,0.1);border-radius:6px;margin-bottom:6px;cursor:pointer;">
            <input type="checkbox" name="ttw-reroll-source" value="${source.memoryIndex}" ${sources.length === 1 ? 'checked' : ''}>
            <div style="flex:1;">
                <div style="font-weight:bold;color:#27ae60;">第${source.memoryIndex + 1}章 - ${source.memory.title}</div>
                <div style="font-size:11px;color:#888;">${(source.memory.content.length / 1000).toFixed(1)}k字</div>
            </div>
        </label>`;
        });
        return html;
    }

    function buildRerollHistoryHtml(rollHistory) {
        if (rollHistory.length === 0) {
            return '<div style="text-align:center;color:#666;padding:15px;font-size:11px;">暂无Roll历史</div>';
        }
        let html = '<div style="max-height:150px;overflow-y:auto;">';
        rollHistory.forEach((roll, idx) => {
            const time = new Date(roll.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const promptPreview = roll.customPrompt ? `「${roll.customPrompt.substring(0, 20)}${roll.customPrompt.length > 20 ? '...' : ''}」` : '';
            html += `
        <div class="ttw-entry-roll-item" data-roll-id="${roll.id}" style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(155,89,182,0.1);border-radius:6px;margin-bottom:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(155,89,182,0.25)'" onmouseout="this.style.background='rgba(155,89,182,0.1)'">
            <div style="flex:1;">
                <div style="font-size:12px;color:#9b59b6;font-weight:bold;">#${idx + 1} - ${time}</div>
                <div style="font-size:11px;color:#888;">第${roll.memoryIndex + 1}章 ${promptPreview}</div>
            </div>
            <button class="ttw-use-roll-btn" data-roll-id="${roll.id}" style="background:rgba(39,174,96,0.5);border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;color:#fff;">✅ 使用</button>
        </div>`;
        });
        html += '</div>';
        return html;
    }

    function buildRerollEntryModalBodyHtml(options) {
        const { currentKeywords, currentContent, historyHtml, sourcesHtml, sourcesCount, rollHistoryCount } = options;
        return `
        <div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.15);border-radius:8px;">
            <div style="font-weight:bold;color:#e67e22;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <span>📝 当前条目内容（可编辑）</span>
                <button id="ttw-save-entry-edit" class="ttw-btn ttw-btn-small" style="background:rgba(39,174,96,0.5);">💾 保存编辑</button>
            </div>
            <div style="margin-bottom:8px;">
                <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">🔑 关键词（逗号分隔）</label>
                <input type="text" id="ttw-entry-keywords-edit" value="${currentKeywords.replace(/"/g, '&quot;')}" style="width:100%;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;box-sizing:border-box;">
            </div>
            <div>
                <label style="font-size:11px;color:#888;display:block;margin-bottom:4px;">📄 内容</label>
                <textarea id="ttw-entry-content-edit" rows="5" style="width:100%;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;resize:vertical;box-sizing:border-box;">${currentContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            </div>
        </div>
        <div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.1);border-radius:8px;">
            <div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <span>📜 Roll历史 (${rollHistoryCount}条)</span>
                ${rollHistoryCount > 0 ? '<button id="ttw-clear-entry-history" class="ttw-btn ttw-btn-small ttw-btn-warning" style="font-size:10px;">🗑️ 清空</button>' : ''}
            </div>
            <div id="ttw-entry-roll-history">${historyHtml}</div>
        </div>
        <div style="margin-bottom:16px;padding:12px;background:rgba(39,174,96,0.1);border-radius:8px;">
            <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:bold;font-size:13px;">
                <span>📍 选择来源章节重Roll</span>
                ${sourcesCount > 1 ? '<button id="ttw-select-all-sources" class="ttw-btn ttw-btn-small" style="font-size:10px;">全选/取消</button>' : ''}
            </label>
            <div id="ttw-reroll-sources">${sourcesHtml}</div>
        </div>
        <div style="margin-bottom:16px;">
            <label style="display:block;margin-bottom:8px;font-weight:bold;font-size:13px;">📝 额外提示词（可选）</label>
            <textarea id="ttw-reroll-entry-prompt" rows="3" placeholder="例如：请更详细地描述该角色的性格特点、请补充该角色的外貌描写..." class="ttw-textarea" style="width:100%;padding:10px;box-sizing:border-box;"></textarea>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(52,152,219,0.1);border-radius:6px;">
            <label style="font-size:12px;color:#3498db;">⚡ 并发数:</label>
            <input type="number" id="ttw-reroll-concurrency" value="${AppState.config.parallel.concurrency}" min="1" max="10" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;text-align:center;">
            <span style="font-size:11px;color:#888;">（多选时同时处理的数量）</span>
        </div>`;
    }

    function buildRerollEntryModalFooterHtml(sourcesCount) {
        return `
        <div id="ttw-reroll-progress" style="flex:1;font-size:12px;color:#888;display:none;"></div>
        <button class="ttw-btn" id="ttw-cancel-reroll-entry">取消</button>
        <button class="ttw-btn ttw-btn-secondary" id="ttw-stop-reroll-entry" style="display:none;">⏸️ 停止</button>
        <button class="ttw-btn ttw-btn-primary" id="ttw-confirm-reroll-entry" ${sourcesCount === 0 ? 'disabled style="opacity:0.5;"' : ''}>🎯 开始重Roll</button>`;
    }

    async function handleRerollEntryConfirm(modal, category, entryName, callback, progressDiv, confirmBtn, stopBtn) {
        const selectedCheckboxes = modal.querySelectorAll('input[name="ttw-reroll-source"]:checked');
        if (selectedCheckboxes.length === 0) {
            ErrorHandler.showUserError('请至少选择一个来源章节');
            return;
        }

        const selectedIndices = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value, 10));
        const customPrompt = modal.querySelector('#ttw-reroll-entry-prompt').value.trim();
        const concurrency = parseInt(modal.querySelector('#ttw-reroll-concurrency').value, 10) || 3;

        confirmBtn.disabled = true;
        confirmBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        progressDiv.style.display = 'block';
        setProcessingStatus('rerolling');

        let completed = 0;
        let failed = 0;
        const total = selectedIndices.length;
        let lastResult = null;

        const renderProgress = () => {
            progressDiv.textContent = `进度: ${completed}/${total} 完成${failed > 0 ? `, ${failed} 失败` : ''}`;
        };
        renderProgress();

        const processBatch = async () => {
            await runWithConcurrency({
                items: selectedIndices,
                concurrency,
                shouldStop: () => AppState.processing.isStopped,
                runItem: async (memoryIndex) => {
                    try {
                        const result = await handleRerollSingleEntry({ memoryIndex, category, entryName, customPrompt });
                        lastResult = result;
                        completed++;
                    } catch (error) {
                        if (error.message !== 'ABORTED') {
                            failed++;
                        }
                    }
                    renderProgress();
                },
            });
        };

        try {
            await processBatch();

            if (!AppState.processing.isStopped) {
                if (lastResult) {
                    const keywords = Array.isArray(lastResult['关键词']) ? lastResult['关键词'].join(', ') : (lastResult['关键词'] || '');
                    modal.querySelector('#ttw-entry-keywords-edit').value = keywords;
                    modal.querySelector('#ttw-entry-content-edit').value = lastResult['内容'] || '';
                }
                progressDiv.textContent = `✅ 完成! ${completed}/${total} 成功${failed > 0 ? `, ${failed} 失败` : ''}`;

                const newHistory = await MemoryHistoryDB.getEntryRollResults(category, entryName);
                modal.querySelector('#ttw-entry-roll-history').innerHTML = buildRerollHistoryHtml(newHistory);

                modal.querySelectorAll('.ttw-use-roll-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const rollId = parseInt(btn.dataset.rollId, 10);
                        const roll = await MemoryHistoryDB.getEntryRollById(rollId);
                        if (roll && roll.result) {
                            const keywords = Array.isArray(roll.result['关键词']) ? roll.result['关键词'].join(', ') : (roll.result['关键词'] || '');
                            modal.querySelector('#ttw-entry-keywords-edit').value = keywords;
                            modal.querySelector('#ttw-entry-content-edit').value = roll.result['内容'] || '';
                            if (!AppState.worldbook.generated[category]) AppState.worldbook.generated[category] = {};
                            AppState.worldbook.generated[category][entryName] = JSON.parse(JSON.stringify(roll.result));
                            updateWorldbookPreview();
                            btn.textContent = '✅ 已应用';
                            setTimeout(() => { btn.textContent = '✅ 使用'; }, 1500);
                        }
                    });
                });
                if (callback) callback();
            }
        } catch (error) {
            if (error.message !== 'ABORTED') {
                progressDiv.textContent = `❌ 错误: ${error.message}`;
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');
        }
    }

    function bindRerollEntryModalEvents(modal, category, entryName, callback) {
        modal.querySelector('#ttw-cancel-reroll-entry').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-entry-edit').addEventListener('click', () => {
            const keywordsInput = modal.querySelector('#ttw-entry-keywords-edit').value;
            const contentInput = modal.querySelector('#ttw-entry-content-edit').value;
            const keywords = keywordsInput.split(/[,，]/).map(k => k.trim()).filter(Boolean);
            if (!AppState.worldbook.generated[category]) AppState.worldbook.generated[category] = {};
            AppState.worldbook.generated[category][entryName] = { '关键词': keywords, '内容': contentInput };
            updateWorldbookPreview();
            const btn = modal.querySelector('#ttw-save-entry-edit');
            btn.textContent = '✅ 已保存';
            setTimeout(() => { btn.textContent = '💾 保存编辑'; }, 1500);
        });

        const selectAllBtn = modal.querySelector('#ttw-select-all-sources');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const checkboxes = modal.querySelectorAll('input[name="ttw-reroll-source"]');
                const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                checkboxes.forEach(cb => { cb.checked = !allChecked; });
            });
        }

        const clearHistoryBtn = modal.querySelector('#ttw-clear-entry-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', async () => {
                if (await confirmAction('确定清空该条目的所有Roll历史？', { title: '清空条目 Roll 历史', danger: true })) {
                    await MemoryHistoryDB.clearEntryRollResults(category, entryName);
                    ModalFactory.close(modal);
                    showRerollEntryModal(category, entryName, callback);
                }
            });
        }

        const bindUseRollBtn = async (btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rollId = parseInt(btn.dataset.rollId, 10);
                const roll = await MemoryHistoryDB.getEntryRollById(rollId);
                if (roll && roll.result) {
                    const keywords = Array.isArray(roll.result['关键词']) ? roll.result['关键词'].join(', ') : (roll.result['关键词'] || '');
                    modal.querySelector('#ttw-entry-keywords-edit').value = keywords;
                    modal.querySelector('#ttw-entry-content-edit').value = roll.result['内容'] || '';
                    if (!AppState.worldbook.generated[category]) AppState.worldbook.generated[category] = {};
                    AppState.worldbook.generated[category][entryName] = JSON.parse(JSON.stringify(roll.result));
                    updateWorldbookPreview();
                    btn.textContent = '✅ 已应用';
                    setTimeout(() => { btn.textContent = '✅ 使用'; }, 1500);
                }
            });
        };
        modal.querySelectorAll('.ttw-use-roll-btn').forEach(btn => bindUseRollBtn(btn));

        modal.querySelectorAll('.ttw-entry-roll-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.classList.contains('ttw-use-roll-btn')) return;
                const rollId = parseInt(item.dataset.rollId, 10);
                const roll = await MemoryHistoryDB.getEntryRollById(rollId);
                if (roll && roll.result) {
                    const keywords = Array.isArray(roll.result['关键词']) ? roll.result['关键词'].join(', ') : (roll.result['关键词'] || '');
                    const infoModal = ModalFactory.create({
                        id: 'ttw-roll-info-modal',
                        title: `🎲 Roll #${rollId} 信息`,
                        body: `<div style="white-space: pre-wrap; font-family: monospace; max-height: 400px; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.3); color: #ccc; border-radius: 4px; border: 1px solid #555;">【Roll #${rollId}】\n\n关键词:\n${keywords}\n\n内容:\n${roll.result['内容'] || '(无)'}\n\n提示词:\n${roll.customPrompt || '(无)'}</div>`,
                        footer: '<button class="ttw-btn ttw-btn-primary" id="ttw-close-roll-info">关闭</button>',
                    });
                    infoModal.querySelector('#ttw-close-roll-info').addEventListener('click', () => ModalFactory.close(infoModal));
                }
            });
        });

        const confirmBtn = modal.querySelector('#ttw-confirm-reroll-entry');
        const stopBtn = modal.querySelector('#ttw-stop-reroll-entry');
        const progressDiv = modal.querySelector('#ttw-reroll-progress');

        stopBtn.addEventListener('click', () => {
            setProcessingStatus('stopped');
        });

        confirmBtn.addEventListener('click', async () => {
            await handleRerollEntryConfirm(modal, category, entryName, callback, progressDiv, confirmBtn, stopBtn);
        });
    }

    async function showRerollEntryModal(category, entryName, callback) {
        const existingModal = document.getElementById('ttw-reroll-entry-modal');
        if (existingModal) existingModal.remove();

        const sources = findEntrySourceMemories(category, entryName);

        const currentEntry = AppState.worldbook.generated[category]?.[entryName] || {};
        const currentKeywords = Array.isArray(currentEntry['关键词'])
            ? currentEntry['关键词'].join(', ')
            : (currentEntry['关键词'] || '');
        const currentContent = currentEntry['内容'] || '';

        const entryRollHistory = await MemoryHistoryDB.getEntryRollResults(category, entryName);

        const sourcesHtml = buildRerollSourcesHtml(sources);
        const historyHtml = buildRerollHistoryHtml(entryRollHistory);
        const bodyHtml = buildRerollEntryModalBodyHtml({
            currentKeywords,
            currentContent,
            historyHtml,
            sourcesHtml,
            sourcesCount: sources.length,
            rollHistoryCount: entryRollHistory.length,
        });
        const footerHtml = buildRerollEntryModalFooterHtml(sources.length);

        const modal = ModalFactory.create({
            id: 'ttw-reroll-entry-modal',
            title: `🎯 单独重Roll条目 - [${category}] ${entryName}`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '700px',
            onClose: () => {},
        });

        bindRerollEntryModalEvents(modal, category, entryName, callback);
    }

    async function showBatchRerollModal(callback) {
        const existingModal = document.getElementById('ttw-batch-reroll-modal');
        if (existingModal) existingModal.remove();

        const allEntries = [];
        for (const category in AppState.worldbook.generated) {
            for (const entryName in AppState.worldbook.generated[category]) {
                const sources = findEntrySourceMemories(category, entryName);
                if (sources.length > 0) {
                    const entry = AppState.worldbook.generated[category][entryName];
                    const tokenCount = getEntryTotalTokens(entry);
                    allEntries.push({ category, entryName, sources, tokenCount });
                }
            }
        }

        if (allEntries.length === 0) {
            ErrorHandler.showUserError('没有可重Roll的条目（没有找到来源章节）');
            return;
        }

        let entriesHtml = '';
        allEntries.forEach((entry) => {
            const tokenStyle = entry.tokenCount < 100 ? 'color:#ef4444;' : 'color:#f1c40f;';
            entriesHtml += `
<label style="display:flex;align-items:center;gap:8px;padding:6px;background:rgba(230,126,34,0.1);border-radius:4px;margin-bottom:4px;cursor:pointer;">
<input type="checkbox" name="ttw-batch-entry" data-category="${entry.category}" data-entry="${entry.entryName}">
<span style="font-size:12px;flex:1;"><span style="color:#e67e22;">[${ListRenderer.escapeHtml(entry.category)}]</span> ${ListRenderer.escapeHtml(entry.entryName)}</span>
<span style="font-size:10px;${tokenStyle}">${entry.tokenCount}tk</span>
<span style="font-size:10px;color:#888;">${entry.sources.length}章</span>
</label>
`;
        });

        const bodyHtml = `
<div style="margin-bottom:12px;display:flex;gap:8px;">
<button id="ttw-select-all-entries" class="ttw-btn ttw-btn-small">全选</button>
<button id="ttw-deselect-all-entries" class="ttw-btn ttw-btn-small">取消全选</button>
</div>
<div id="ttw-batch-entries" style="max-height:300px;overflow-y:auto;">${entriesHtml}</div>
<div style="margin-top:12px;">
<label style="display:block;margin-bottom:8px;font-weight:bold;font-size:13px;">📝 统一提示词</label>
<textarea id="ttw-batch-prompt" rows="3" placeholder="对所有选中条目使用相同的提示词..." style="width:100%;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;box-sizing:border-box;">${ListRenderer.escapeHtml(AppState.settings.customBatchRerollPrompt || '')}</textarea>
</div>
<div style="margin-top:12px;display:flex;align-items:center;gap:10px;">
<label style="font-size:12px;color:#3498db;">⚡ 并发数:</label>
<input type="number" id="ttw-batch-concurrency" value="${AppState.config.parallel.concurrency}" min="1" max="10" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;text-align:center;">
</div>
`;

        const footerHtml = `
<div id="ttw-batch-progress" style="flex:1;font-size:12px;color:#888;"></div>
<button class="ttw-btn" id="ttw-cancel-batch">取消</button>
<button class="ttw-btn ttw-btn-secondary" id="ttw-stop-batch" style="display:none;">⏸️ 停止</button>
<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-batch">🎲 开始批量重Roll</button>
`;

        const modal = ModalFactory.create({
            id: 'ttw-batch-reroll-modal',
            title: '🎲 批量重Roll条目',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '600px',
            maxHeight: '60vh',
        });

        modal.querySelector('#ttw-select-all-entries').addEventListener('click', () => {
            modal.querySelectorAll('input[name="ttw-batch-entry"]').forEach(cb => { cb.checked = true; });
        });
        modal.querySelector('#ttw-deselect-all-entries').addEventListener('click', () => {
            modal.querySelectorAll('input[name="ttw-batch-entry"]').forEach(cb => { cb.checked = false; });
        });

        const confirmBtn = modal.querySelector('#ttw-confirm-batch');
        const stopBtn = modal.querySelector('#ttw-stop-batch');
        const progressDiv = modal.querySelector('#ttw-batch-progress');

        confirmBtn.addEventListener('click', async () => {
            const selectedEntries = [];
            modal.querySelectorAll('input[name="ttw-batch-entry"]:checked').forEach(cb => {
                selectedEntries.push({ category: cb.dataset.category, entryName: cb.dataset.entry });
            });

            if (selectedEntries.length === 0) {
                ErrorHandler.showUserError('请至少选择一个条目');
                return;
            }

            const customPrompt = modal.querySelector('#ttw-batch-prompt').value.trim();
            AppState.settings.customBatchRerollPrompt = customPrompt;
            saveCurrentSettings();
            const concurrency = parseInt(modal.querySelector('#ttw-batch-concurrency').value, 10) || 3;

            confirmBtn.disabled = true;
            confirmBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            setProcessingStatus('rerolling');

            let completed = 0;
            let failed = 0;
            const total = selectedEntries.length;

            const renderProgress = () => {
                progressDiv.textContent = `进度: ${completed}/${total}${failed > 0 ? `, ${failed} 失败` : ''}`;
            };
            renderProgress();

            await runWithConcurrency({
                items: selectedEntries,
                concurrency,
                shouldStop: () => AppState.processing.isStopped,
                runItem: async ({ category, entryName }) => {
                    const sources = findEntrySourceMemories(category, entryName);

                    if (sources.length > 0) {
                        try {
                            await handleRerollSingleEntry({ memoryIndex: sources[0].memoryIndex, category, entryName, customPrompt });
                            completed++;
                        } catch (error) {
                            if (error.message !== 'ABORTED') {
                                failed++;
                            }
                        }
                    }
                    renderProgress();
                },
            });

            progressDiv.textContent = AppState.processing.isStopped
                ? `已停止: ${completed}/${total} 完成`
                : `✅ 完成: ${completed}/${total}${failed > 0 ? `, ${failed} 失败` : ''}`;

            confirmBtn.disabled = false;
            confirmBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');

            if (callback) callback();
        });

        stopBtn.addEventListener('click', () => {
            setProcessingStatus('stopped');
        });
    }

    function buildRollHistoryListHtml(rollResults, memory) {
        if (rollResults.length === 0) {
            return '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无历史</div>';
        }
        let html = '';
        rollResults.forEach((roll, idx) => {
            const time = new Date(roll.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const entryCount = roll.result ? Object.keys(roll.result).reduce((sum, cat) => sum + (typeof roll.result[cat] === 'object' ? Object.keys(roll.result[cat]).length : 0), 0) : 0;
            const isCurrentSelected = memory.result && JSON.stringify(memory.result) === JSON.stringify(roll.result);
            html += `
        <div class="ttw-roll-item ${isCurrentSelected ? 'selected' : ''}" data-roll-id="${roll.id}" data-roll-index="${idx}">
            <div class="ttw-roll-item-header">
                <span class="ttw-roll-item-title">#${idx + 1}${isCurrentSelected ? ' ✓' : ''}</span>
                <span class="ttw-roll-item-time">${time}</span>
            </div>
            <div class="ttw-roll-item-info">${entryCount}条</div>
        </div>`;
        });
        return html;
    }

    function buildCurrentResultEditorHtml(index, memory) {
        const currentResultJson = memory.result ? JSON.stringify(memory.result, null, 2) : '{}';
        return `
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #444;">
        <h4 style="color:#27ae60;margin:0 0 6px;font-size:14px;">📝 当前处理结果（第${index + 1}章）</h4>
        <div style="font-size:11px;color:#888;">可直接编辑下方JSON，编辑后点击"保存并应用"</div>
    </div>
    <textarea id="ttw-current-result-editor" style="width:100%;min-height:200px;max-height:300px;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:6px;color:#fff;font-size:11px;font-family:monospace;line-height:1.5;resize:vertical;box-sizing:border-box;">${currentResultJson}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <button class="ttw-btn ttw-btn-primary ttw-btn-small" id="ttw-save-current-result">💾 保存并应用</button>
        <button class="ttw-btn ttw-btn-small" id="ttw-copy-current-result">📋 复制</button>
    </div>
    <div style="margin-top:12px;padding:10px;background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);border-radius:6px;">
        <div style="font-weight:bold;color:#9b59b6;margin-bottom:6px;font-size:12px;">📋 粘贴JSON导入</div>
        <div style="font-size:11px;color:#888;margin-bottom:6px;">支持标准JSON、带\`\`\`json代码块的、甚至不完整的JSON</div>
        <textarea id="ttw-paste-json-area" rows="4" placeholder="在此粘贴JSON..." style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:6px;color:#fff;font-size:11px;font-family:monospace;resize:vertical;box-sizing:border-box;"></textarea>
        <button class="ttw-btn ttw-btn-small" id="ttw-parse-and-apply" style="margin-top:8px;background:rgba(155,89,182,0.5);">📋 解析并填入上方</button>
    </div>`;
    }

    function buildRollDetailEditorHtml(rollIndex, roll) {
        const time = new Date(roll.timestamp).toLocaleString('zh-CN');
        return `
    <div class="ttw-roll-detail-header">
        <h4>Roll #${rollIndex + 1}</h4>
        <div class="ttw-roll-detail-time">${time}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            <button class="ttw-btn ttw-btn-primary ttw-btn-small" id="ttw-use-this-roll">✅ 使用此结果</button>
            <button class="ttw-btn ttw-btn-small" id="ttw-save-edited-roll" style="background:rgba(39,174,96,0.5);">💾 保存编辑</button>
        </div>
    </div>
    <textarea id="ttw-roll-edit-area" style="width:100%;min-height:280px;max-height:400px;padding:10px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:6px;color:#fff;font-size:11px;font-family:monospace;line-height:1.5;resize:vertical;box-sizing:border-box;">${JSON.stringify(roll.result, null, 2)}</textarea>
    <div style="margin-top:10px;padding:10px;background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);border-radius:6px;">
        <div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;font-size:12px;">📋 粘贴JSON导入</div>
        <div style="font-size:11px;color:#888;margin-bottom:8px;">将JSON粘贴到上方编辑框后点击"保存编辑"，或粘贴到下方后点击"解析并替换"</div>
        <textarea id="ttw-roll-paste-area" rows="4" placeholder="在此粘贴JSON格式的世界书数据..." style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid #555;border-radius:6px;color:#fff;font-size:11px;font-family:monospace;resize:vertical;box-sizing:border-box;"></textarea>
        <button class="ttw-btn ttw-btn-small" id="ttw-parse-paste-json" style="margin-top:8px;background:rgba(155,89,182,0.5);">📋 解析并替换到上方</button>
    </div>`;
    }

    function bindCurrentResultEditorEvents(detailDiv, index, memory) {
        detailDiv.querySelector('#ttw-save-current-result').addEventListener('click', async () => {
            const editor = detailDiv.querySelector('#ttw-current-result-editor');
            let parsed;
            try { parsed = JSON.parse(editor.value); }
            catch (e) { ErrorHandler.showUserError('JSON格式错误！\n\n' + e.message); return; }
            memory.result = parsed;
            memory.processed = true;
            memory.failed = false;
            try { await MemoryHistoryDB.saveRollResult(index, parsed); }
            catch (dbErr) { Logger.error('DB', '保存到数据库失败:', dbErr); }
            rebuildWorldbookFromMemories();
            updateMemoryQueueUI();
            updateWorldbookPreview();
            const btn = detailDiv.querySelector('#ttw-save-current-result');
            btn.textContent = '✅ 已保存并应用';
            setTimeout(() => { btn.textContent = '💾 保存并应用'; }, 1500);
        });

        detailDiv.querySelector('#ttw-copy-current-result').addEventListener('click', () => {
            const editor = detailDiv.querySelector('#ttw-current-result-editor');
            navigator.clipboard.writeText(editor.value).then(() => {
                const btn = detailDiv.querySelector('#ttw-copy-current-result');
                btn.textContent = '✅ 已复制';
                setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
            });
        });

        detailDiv.querySelector('#ttw-parse-and-apply').addEventListener('click', () => {
            const pasteArea = detailDiv.querySelector('#ttw-paste-json-area');
            const editor = detailDiv.querySelector('#ttw-current-result-editor');
            const rawText = pasteArea.value.trim();
            if (!rawText) { ErrorHandler.showUserError('请先粘贴JSON内容'); return; }
            let parsed;
            try { parsed = parseAIResponse(rawText, { strict: false }); }
            catch (e) { ErrorHandler.showUserError('无法解析！\n\n错误: ' + e.message); return; }
            if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
                ErrorHandler.showUserError('解析结果为空，请检查内容'); return;
            }
            editor.value = JSON.stringify(parsed, null, 2);
            pasteArea.value = '';
            const btn = detailDiv.querySelector('#ttw-parse-and-apply');
            btn.textContent = '✅ 已填入';
            setTimeout(() => { btn.textContent = '📋 解析并填入上方'; }, 1500);
        });
    }

    function bindRollDetailEditorEvents(detailDiv, index, rollIndex, roll, memory, modal) {
        detailDiv.querySelector('#ttw-use-this-roll').addEventListener('click', async () => {
            const editArea = detailDiv.querySelector('#ttw-roll-edit-area');
            let resultToUse;
            try { resultToUse = JSON.parse(editArea.value); }
            catch (e) {
                if (!await confirmAction('编辑框中的JSON格式有误，是否使用原始结果？\n\n点击"取消"可继续编辑修复。', { title: 'JSON 格式有误' })) return;
                resultToUse = roll.result;
            }
            memory.result = resultToUse;
            memory.processed = true;
            memory.failed = false;
            rebuildWorldbookFromMemories();
            updateMemoryQueueUI();
            updateWorldbookPreview();
            ModalFactory.close(modal);
            ErrorHandler.showUserSuccess(`已使用 Roll #${rollIndex + 1}${resultToUse !== roll.result ? '（已编辑）' : ''}`);
        });

        detailDiv.querySelector('#ttw-save-edited-roll').addEventListener('click', async () => {
            const editArea = detailDiv.querySelector('#ttw-roll-edit-area');
            let parsed;
            try { parsed = JSON.parse(editArea.value); }
            catch (e) { ErrorHandler.showUserError('JSON格式错误，无法保存！\n\n错误信息: ' + e.message); return; }
            roll.result = parsed;
            try { await MemoryHistoryDB.saveRollResult(index, parsed); }
            catch (dbErr) { Logger.error('DB', '保存到数据库失败:', dbErr); }
            const btn = detailDiv.querySelector('#ttw-save-edited-roll');
            btn.textContent = '✅ 已保存';
            btn.style.background = 'rgba(39,174,96,0.8)';
            setTimeout(() => { btn.textContent = '💾 保存编辑'; btn.style.background = 'rgba(39,174,96,0.5)'; }, 1500);
        });

        detailDiv.querySelector('#ttw-parse-paste-json').addEventListener('click', () => {
            const pasteArea = detailDiv.querySelector('#ttw-roll-paste-area');
            const editArea = detailDiv.querySelector('#ttw-roll-edit-area');
            const rawText = pasteArea.value.trim();
            if (!rawText) { ErrorHandler.showUserError('请先在下方粘贴JSON内容'); return; }
            let parsed;
            try { parsed = parseAIResponse(rawText, { strict: false }); }
            catch (e) {
                ErrorHandler.showUserError('无法解析粘贴的内容！\n\n支持的格式:\n1. 标准JSON\n2. 带```json```代码块的JSON\n3. 不完整但可修复的JSON\n\n错误: ' + e.message);
                return;
            }
            if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
                ErrorHandler.showUserError('解析结果为空，请检查粘贴的内容是否正确'); return;
            }
            editArea.value = JSON.stringify(parsed, null, 2);
            pasteArea.value = '';
            const btn = detailDiv.querySelector('#ttw-parse-paste-json');
            btn.textContent = '✅ 已替换到上方';
            btn.style.background = 'rgba(39,174,96,0.5)';
            setTimeout(() => { btn.textContent = '📋 解析并替换到上方'; btn.style.background = 'rgba(155,89,182,0.5)'; }, 1500);
        });
    }

    async function showRollHistorySelector(index) {
        const memory = AppState.memory.queue[index];
        if (!memory) return;

        const rollResults = await MemoryHistoryDB.getRollResults(index);
        const existingModal = document.getElementById('ttw-roll-history-modal');
        if (existingModal) existingModal.remove();

        const listHtml = buildRollHistoryListHtml(rollResults, memory);
        const currentEditorHtml = buildCurrentResultEditorHtml(index, memory);

        const bodyHtml = `
<div class="ttw-roll-history-container">
<div class="ttw-roll-history-left">
<button id="ttw-do-reroll" class="ttw-btn ttw-btn-primary ttw-roll-reroll-btn">🎲 重Roll</button>
<div class="ttw-roll-list">${listHtml}</div>
</div>
<div id="ttw-roll-detail" class="ttw-roll-history-right"></div>
</div>
<div class="ttw-reroll-prompt-section" style="margin-top:12px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
<div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;font-size:13px;">📝 重Roll自定义提示词</div>
<textarea id="ttw-reroll-custom-prompt" rows="3" placeholder="可在此添加额外要求，如：重点提取XX角色的信息、更详细地描述XX事件..." style="width:100%;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;resize:vertical;">${AppState.settings.customRerollPrompt || ''}</textarea>
</div>
`;

        const footerHtml = `
<button class="ttw-btn ttw-btn-secondary" id="ttw-stop-reroll" style="display:none;">⏸️ 停止</button>
<button class="ttw-btn ttw-btn-warning" id="ttw-clear-rolls">🗑️ 清空</button>
<button class="ttw-btn" id="ttw-close-roll-history">关闭</button>
`;

        const modal = ModalFactory.create({
            id: 'ttw-roll-history-modal',
            title: `🎲 ${memory.title} (第${index + 1}章) - Roll历史`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
        });

        const initDetailDiv = modal.querySelector('#ttw-roll-detail');
        initDetailDiv.innerHTML = currentEditorHtml;
        bindCurrentResultEditorEvents(initDetailDiv, index, memory);

        modal.querySelector('#ttw-close-roll-history').addEventListener('click', () => ModalFactory.close(modal));

        const stopRerollBtn = modal.querySelector('#ttw-stop-reroll');

        modal.querySelector('#ttw-do-reroll').addEventListener('click', async () => {
            const btn = modal.querySelector('#ttw-do-reroll');
            const customPrompt = modal.querySelector('#ttw-reroll-custom-prompt').value;
            AppState.settings.customRerollPrompt = customPrompt;
            saveCurrentSettings();

            btn.disabled = true;
            btn.textContent = '🔄...';
            stopRerollBtn.style.display = 'inline-block';

            try {
                await handleRerollMemory(index, customPrompt);
                ModalFactory.close(modal);
                showRollHistorySelector(index);
            } catch (error) {
                btn.disabled = false;
                btn.textContent = '🎲 重Roll';
                stopRerollBtn.style.display = 'none';
                if (error.message !== 'ABORTED') { ErrorHandler.showUserError('重Roll失败: ' + error.message); }
            }
        });

        stopRerollBtn.addEventListener('click', () => {
            handleStopProcessing();
            stopRerollBtn.style.display = 'none';
            const btn = modal.querySelector('#ttw-do-reroll');
            btn.disabled = false;
            btn.textContent = '🎲 重Roll';
        });

        modal.querySelector('#ttw-clear-rolls').addEventListener('click', async () => {
            if (await confirmAction(`确定清空 "${memory.title}" 的所有Roll历史？`, { title: '清空章节 Roll 历史', danger: true })) {
                await MemoryHistoryDB.clearRollResults(index);
                ModalFactory.close(modal);
                ErrorHandler.showUserSuccess('已清空');
            }
        });

        modal.querySelectorAll('.ttw-roll-item').forEach(item => {
            item.addEventListener('click', () => {
                const rollIndex = parseInt(item.dataset.rollIndex, 10);
                const roll = rollResults[rollIndex];
                const detailDiv = modal.querySelector('#ttw-roll-detail');

                modal.querySelectorAll('.ttw-roll-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                detailDiv.innerHTML = buildRollDetailEditorHtml(rollIndex, roll);
                bindRollDetailEditorEvents(detailDiv, index, rollIndex, roll, memory, modal);
            });
        });
    }

    return {
        showRerollEntryModal,
        showBatchRerollModal,
        showRollHistorySelector,
    };
}




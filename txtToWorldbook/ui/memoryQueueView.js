import { escapeHtmlForDisplay } from './renderer.js';

export function createMemoryQueueView(deps = {}) {
    const {
        AppState,
        ListRenderer,
        ModalFactory,
        PerfUtils,
        ErrorHandler,
        confirmAction,
        deleteMemoryAt,
        updateStartButtonState,
        showRollHistorySelector,
    } = deps;

    function updateMemoryQueueUI() {
        const container = document.getElementById('ttw-memory-queue');
        if (!container) return;

        const multiSelectBar = document.getElementById('ttw-multi-select-bar');
        if (multiSelectBar) {
            multiSelectBar.style.display = AppState.ui.isMultiSelectMode ? 'block' : 'none';
        }

        const selectedCountEl = document.getElementById('ttw-selected-count');
        if (selectedCountEl) {
            selectedCountEl.textContent = `已选: ${AppState.ui.selectedIndices.size}`;
        }

        const itemsHtml = ListRenderer.renderItems(
            AppState.memory.queue,
            (memory, index) => ListRenderer.renderMemoryItem(memory, index, {
                multiSelect: AppState.ui.isMultiSelectMode,
                selected: AppState.ui.selectedIndices.has(index),
                useChapterLabel: true,
                useApproxK: true,
            }),
            { emptyMessage: '暂无章节数据' }
        );

        ListRenderer.updateContainer(container, itemsHtml);
    }

    function toggleMultiSelectMode() {
        AppState.ui.isMultiSelectMode = !AppState.ui.isMultiSelectMode;
        AppState.ui.selectedIndices.clear();

        const multiSelectBar = document.getElementById('ttw-multi-select-bar');
        if (multiSelectBar) {
            multiSelectBar.style.display = AppState.ui.isMultiSelectMode ? 'block' : 'none';
        }

        updateMemoryQueueUI();
    }

    function showStartFromSelector() {
        if (AppState.memory.queue.length === 0) {
            ErrorHandler.showUserError('请先上传文件');
            return;
        }

        const existingModal = document.getElementById('ttw-start-selector-modal');
        if (existingModal) existingModal.remove();

        let optionsHtml = '';
        AppState.memory.queue.forEach((memory, index) => {
            const status = memory.processed ? (memory.failed ? '❗' : '✅') : '⏳';
            const currentSelected = AppState.memory.userSelectedIndex !== null ? AppState.memory.userSelectedIndex : AppState.memory.startIndex;
            optionsHtml += `<option value="${index}" ${index === currentSelected ? 'selected' : ''}>${status} 第${index + 1}章 - ${ListRenderer.escapeHtml(memory.title)} (${memory.content.length.toLocaleString()}字)</option>`;
        });

        const bodyHtml = `
<div style="margin-bottom:16px;">
<label style="display:block;margin-bottom:8px;font-size:13px;">从哪一章开始：</label>
<select id="ttw-start-from-select" class="ttw-select">${optionsHtml}</select>
</div>
<div style="padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:12px;color:#f39c12;">⚠️ 从中间开始时，之前的世界书数据不会自动加载。</div>
`;

        const footerHtml = `
<button class="ttw-btn" id="ttw-cancel-start-select">取消</button>
<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-start-select">确定</button>
`;

        const selectorModal = ModalFactory.create({
            id: 'ttw-start-selector-modal',
            title: '📍 选择起始位置',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        selectorModal.querySelector('#ttw-cancel-start-select').addEventListener('click', () => ModalFactory.close(selectorModal));
        selectorModal.querySelector('#ttw-confirm-start-select').addEventListener('click', () => {
            const selectedIndex = parseInt(document.getElementById('ttw-start-from-select').value, 10);
            AppState.memory.userSelectedIndex = selectedIndex;
            AppState.memory.startIndex = selectedIndex;

            const startBtn = document.getElementById('ttw-start-btn');
            if (startBtn) startBtn.textContent = `▶️ 从第${selectedIndex + 1}章开始`;
            ModalFactory.close(selectorModal);
        });
    }

    function showMemoryContentModal(index) {
        const memory = AppState.memory.queue[index];
        if (!memory) return;

        const existingModal = document.getElementById('ttw-memory-content-modal');
        if (existingModal) existingModal.remove();

        const statusText = memory.processing ? '🔄 处理中' : (memory.processed ? (memory.failed ? '❗ 失败' : '✅ 完成') : '⏳ 等待');
        const statusColor = memory.processing ? '#3498db' : (memory.processed ? (memory.failed ? '#e74c3c' : '#27ae60') : '#f39c12');

        let resultHtml = '';
        if (memory.processed && memory.result && !memory.failed) {
            resultHtml = `
<div style="margin-top:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">📊 处理结果</h4>
<pre style="max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;font-size:11px;white-space:pre-wrap;word-break:break-all;">${escapeHtmlForDisplay(JSON.stringify(memory.result, null, 2))}</pre>
</div>
`;
        }

        const bodyHtml = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;">
<div>
<span style="color:${statusColor};font-weight:bold;">${statusText}</span>
<span style="margin-left:16px;color:#888;">字数: <span id="ttw-char-count">${memory.content.length.toLocaleString()}</span></span>
</div>
<div style="display:flex;gap:8px;">
<button id="ttw-copy-memory-content" class="ttw-btn ttw-btn-small">📋 复制</button>
<button id="ttw-roll-history-btn" class="ttw-btn ttw-btn-small" style="background:rgba(155,89,182,0.3);">🎲 Roll历史</button>
<button id="ttw-delete-memory-btn" class="ttw-btn ttw-btn-warning ttw-btn-small">🗑️ 删除</button>
</div>
</div>
${memory.failedError ? `<div style="margin-bottom:16px;padding:10px;background:rgba(231,76,60,0.2);border-radius:6px;color:#e74c3c;font-size:12px;">❌ ${escapeHtmlForDisplay(memory.failedError)}</div>` : ''}
<div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
<h4 style="color:#3498db;margin:0;">📝 原文内容 <span style="font-size:12px;font-weight:normal;color:#888;">(可编辑)</span></h4>
<div style="display:flex;gap:8px;">
<button id="ttw-append-to-prev" class="ttw-btn ttw-btn-small" ${index === 0 ? 'disabled style="opacity:0.5;"' : ''} title="追加到上一章末尾，并删除当前章">⬆️ 合并到上一章</button>
<button id="ttw-append-to-next" class="ttw-btn ttw-btn-small" ${index === AppState.memory.queue.length - 1 ? 'disabled style="opacity:0.5;"' : ''} title="追加到下一章开头，并删除当前章">⬇️ 合并到下一章</button>
</div>
</div>
<textarea id="ttw-memory-content-editor" class="ttw-textarea">${memory.content.replace(/</g, '<').replace(/>/g, '>')}</textarea>
</div>
${resultHtml}
`;

        const footerHtml = `
<button class="ttw-btn" id="ttw-cancel-memory-edit">取消</button>
<button class="ttw-btn ttw-btn-primary" id="ttw-save-memory-edit">💾 保存修改</button>
`;

        const contentModal = ModalFactory.create({
            id: 'ttw-memory-content-modal',
            title: `📄 ${escapeHtmlForDisplay(memory.title)} (第${index + 1}章)`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
            maxHeight: '75vh',
        });

        const editor = contentModal.querySelector('#ttw-memory-content-editor');
        const charCount = contentModal.querySelector('#ttw-char-count');
        const updateCharCount = PerfUtils.debounce(() => {
            charCount.textContent = editor.value.length.toLocaleString();
        }, 100);
        editor.addEventListener('input', updateCharCount);

        contentModal.querySelector('#ttw-cancel-memory-edit').addEventListener('click', () => ModalFactory.close(contentModal));

        contentModal.querySelector('#ttw-save-memory-edit').addEventListener('click', () => {
            const newContent = editor.value;
            if (newContent !== memory.content) {
                memory.content = newContent;
                memory.processed = false;
                memory.failed = false;
                memory.result = null;
                updateMemoryQueueUI();
                updateStartButtonState(false);
            }
            ModalFactory.close(contentModal);
        });

        contentModal.querySelector('#ttw-copy-memory-content').addEventListener('click', () => {
            navigator.clipboard.writeText(editor.value).then(() => {
                const btn = contentModal.querySelector('#ttw-copy-memory-content');
                btn.textContent = '✅ 已复制';
                setTimeout(() => {
                    btn.textContent = '📋 复制';
                }, 1500);
            });
        });

        contentModal.querySelector('#ttw-roll-history-btn').addEventListener('click', () => {
            ModalFactory.close(contentModal);
            showRollHistorySelector(index);
        });

        contentModal.querySelector('#ttw-delete-memory-btn').addEventListener('click', () => {
            contentModal.remove();
            deleteMemoryAt(index);
        });

        contentModal.querySelector('#ttw-append-to-prev').addEventListener('click', async () => {
            if (index === 0) return;
            const prevMemory = AppState.memory.queue[index - 1];
            if (await confirmAction(`将当前内容合并到 "${prevMemory.title}" 的末尾？\n\n⚠️ 合并后当前章将被删除！`, { title: '合并到上一章', danger: true })) {
                prevMemory.content += '\n\n' + editor.value;
                prevMemory.processed = false;
                prevMemory.failed = false;
                prevMemory.result = null;
                AppState.memory.queue.splice(index, 1);
                AppState.memory.queue.forEach((m, i) => {
                    if (!m.title.includes('-')) m.title = `记忆${i + 1}`;
                });
                if (AppState.memory.startIndex > index) AppState.memory.startIndex = Math.max(0, AppState.memory.startIndex - 1);
                else if (AppState.memory.startIndex >= AppState.memory.queue.length) AppState.memory.startIndex = Math.max(0, AppState.memory.queue.length - 1);
                if (AppState.memory.userSelectedIndex !== null) {
                    if (AppState.memory.userSelectedIndex > index) AppState.memory.userSelectedIndex = Math.max(0, AppState.memory.userSelectedIndex - 1);
                    else if (AppState.memory.userSelectedIndex >= AppState.memory.queue.length) AppState.memory.userSelectedIndex = null;
                }
                updateMemoryQueueUI();
                updateStartButtonState(false);
                contentModal.remove();
                ErrorHandler.showUserSuccess(`已合并到 "${prevMemory.title}"，当前章已删除`);
            }
        });

        contentModal.querySelector('#ttw-append-to-next').addEventListener('click', async () => {
            if (index === AppState.memory.queue.length - 1) return;
            const nextMemory = AppState.memory.queue[index + 1];
            if (await confirmAction(`将当前内容合并到 "${nextMemory.title}" 的开头？\n\n⚠️ 合并后当前章将被删除！`, { title: '合并到下一章', danger: true })) {
                nextMemory.content = editor.value + '\n\n' + nextMemory.content;
                nextMemory.processed = false;
                nextMemory.failed = false;
                nextMemory.result = null;
                AppState.memory.queue.splice(index, 1);
                AppState.memory.queue.forEach((m, i) => {
                    if (!m.title.includes('-')) m.title = `记忆${i + 1}`;
                });
                if (AppState.memory.startIndex > index) AppState.memory.startIndex = Math.max(0, AppState.memory.startIndex - 1);
                else if (AppState.memory.startIndex >= AppState.memory.queue.length) AppState.memory.startIndex = Math.max(0, AppState.memory.queue.length - 1);
                if (AppState.memory.userSelectedIndex !== null) {
                    if (AppState.memory.userSelectedIndex > index) AppState.memory.userSelectedIndex = Math.max(0, AppState.memory.userSelectedIndex - 1);
                    else if (AppState.memory.userSelectedIndex >= AppState.memory.queue.length) AppState.memory.userSelectedIndex = null;
                }
                updateMemoryQueueUI();
                updateStartButtonState(false);
                contentModal.remove();
                ErrorHandler.showUserSuccess(`已合并到 "${nextMemory.title}"，当前章已删除`);
            }
        });
    }

    function showProcessedResults() {
        const processedMemories = AppState.memory.queue.filter((m) => m.processed && !m.failed && m.result);
        if (processedMemories.length === 0) {
            ErrorHandler.showUserError('暂无已处理的结果');
            return;
        }

        const existingModal = document.getElementById('ttw-processed-results-modal');
        if (existingModal) existingModal.remove();

        let listHtml = '';
        processedMemories.forEach((memory) => {
            const realIndex = AppState.memory.queue.indexOf(memory);
            const entryCount = memory.result
                ? Object.keys(memory.result).reduce((sum, cat) => sum + (typeof memory.result[cat] === 'object' ? Object.keys(memory.result[cat]).length : 0), 0)
                : 0;
            listHtml += `
<div class="ttw-processed-item" data-index="${realIndex}" style="padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:4px;cursor:pointer;border-left:2px solid #27ae60;">
<div style="font-size:11px;font-weight:bold;color:#27ae60;">✅ 第${realIndex + 1}章</div>
<div style="font-size:9px;color:#888;">${entryCount}条 | ${(memory.content.length / 1000).toFixed(1)}k字</div>
</div>
`;
        });

        const bodyHtml = `
<div class="ttw-processed-results-container" style="display:flex;gap:10px;height:450px;">
<div class="ttw-processed-results-left" style="width:100px;min-width:100px;max-width:100px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:8px;">${listHtml}</div>
<div id="ttw-result-detail" style="flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:15px;">
<div style="text-align:center;color:#888;padding:40px;font-size:12px;">👈 点击左侧章节查看结果</div>
</div>
</div>
`;

        const footerHtml = `<button class="ttw-btn" id="ttw-close-processed-results">关闭</button>`;

        const resultsModal = ModalFactory.create({
            id: 'ttw-processed-results-modal',
            title: `📊 已处理结果 (${processedMemories.length}/${AppState.memory.queue.length})`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
        });

        resultsModal.querySelector('#ttw-close-processed-results').addEventListener('click', () => ModalFactory.close(resultsModal));

        resultsModal.querySelectorAll('.ttw-processed-item').forEach((item) => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index, 10);
                const memory = AppState.memory.queue[index];
                const detailDiv = resultsModal.querySelector('#ttw-result-detail');
                resultsModal.querySelectorAll('.ttw-processed-item').forEach((i) => {
                    i.style.background = 'rgba(0,0,0,0.2)';
                });
                item.style.background = 'rgba(0,0,0,0.4)';
                if (memory && memory.result) {
                    detailDiv.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
<h4 style="color:#27ae60;margin:0;font-size:14px;">第${index + 1}章 - ${escapeHtmlForDisplay(memory.title)}</h4>
<button class="ttw-btn ttw-btn-small" id="ttw-copy-result">📋 复制</button>
</div>
<pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;">${escapeHtmlForDisplay(JSON.stringify(memory.result, null, 2))}</pre>
`;
                    detailDiv.querySelector('#ttw-copy-result').addEventListener('click', () => {
                        navigator.clipboard.writeText(JSON.stringify(memory.result, null, 2)).then(() => {
                            const btn = detailDiv.querySelector('#ttw-copy-result');
                            btn.textContent = '✅ 已复制';
                            setTimeout(() => {
                                btn.textContent = '📋 复制';
                            }, 1500);
                        });
                    });
                }
            });
        });
    }

    return {
        updateMemoryQueueUI,
        toggleMultiSelectMode,
        showStartFromSelector,
        showMemoryContentModal,
        showProcessedResults,
    };
}

import { mergeImportedWorldbook } from '../../src/worldbook/commands/importWorldbook.js';
import { executeRun } from '../core/runContext.js';
import { convertSTFormatToInternal } from '../../src/worldbook/formats/sillyTavern.js';
export function createImportMergeService(deps = {}) {
    const {
        AppState,
        Logger,
        ErrorHandler,
        ModalFactory,
        defaultMergePrompt,
        saveCurrentSettings,
        showProgressSection,
        setProcessingStatus,
        updateProgress,
        getProcessingStatus,
        showResultSection,
        updateWorldbookPreview,
        callAPI,
        getLanguagePrefix,
        parseAIResponse,
    } = deps;

    function findDuplicateEntries(existing, imported) {
        const duplicates = [];
        for (const category in imported) {
            if (!existing[category]) continue;
            for (const name in imported[category]) {
                if (existing[category][name]) {
                    const existingStr = JSON.stringify(existing[category][name]);
                    const importedStr = JSON.stringify(imported[category][name]);
                    if (existingStr !== importedStr) {
                        duplicates.push({
                            category,
                            name,
                            existing: existing[category][name],
                            imported: imported[category][name],
                        });
                    }
                }
            }
        }
        return duplicates;
    }

    function findNewEntries(existing, imported) {
        const newEntries = [];
        for (const category in imported) {
            for (const name in imported[category]) {
                if (!existing[category] || !existing[category][name]) {
                    newEntries.push({ category, name, entry: imported[category][name] });
                }
            }
        }
        return newEntries;
    }

    function groupEntriesByCategory(entries) {
        const grouped = {};
        for (const item of entries) {
            if (!grouped[item.category]) grouped[item.category] = [];
            grouped[item.category].push(item);
        }
        return grouped;
    }

    function buildNewEntriesListHtml(newEntries, groupedNew) {
        if (newEntries.length === 0) return '';
        let html = `
    <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:bold;color:#27ae60;">📥 新条目 (${newEntries.length})</span>
            <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-new" checked> 全选</label>
        </div>
        <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">`;
        for (const category in groupedNew) {
            const items = groupedNew[category];
            html += `
        <div class="ttw-merge-category-group" style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(39,174,96,0.2);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">
                <input type="checkbox" class="ttw-new-category-cb" data-category="${category}" checked>
                <span style="color:#27ae60;">${category}</span>
                <span style="color:#888;font-weight:normal;">(${items.length})</span>
            </label>
            <div style="margin-left:16px;margin-top:4px;">`;
            items.forEach((item) => {
                const globalIdx = newEntries.indexOf(item);
                html += `
            <label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
                <input type="checkbox" class="ttw-new-entry-cb" data-index="${globalIdx}" data-category="${category}" checked>
                <span>${item.name}</span>
            </label>`;
            });
            html += '</div></div>';
        }
        html += '</div></div>';
        return html;
    }

    function buildDupEntriesListHtml(allDuplicates, groupedDup, internalDuplicates) {
        if (allDuplicates.length === 0) return '';
        let html = `
    <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:bold;color:#e67e22;">🔀 重复条目 (${allDuplicates.length})</span>
            <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-dup" checked> 全选</label>
        </div>
        <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">`;
        for (const category in groupedDup) {
            const items = groupedDup[category];
            html += `
        <div class="ttw-merge-category-group" style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(230,126,34,0.2);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">
                <input type="checkbox" class="ttw-dup-category-cb" data-category="${category}" checked>
                <span style="color:#e67e22;">${category}</span>
                <span style="color:#888;font-weight:normal;">(${items.length})</span>
            </label>
            <div style="margin-left:16px;margin-top:4px;">`;
            items.forEach((item) => {
                const globalIdx = allDuplicates.indexOf(item);
                const isInternal = internalDuplicates.includes(item);
                const badge = isInternal
                    ? '<span style="font-size:9px;color:#9b59b6;margin-left:4px;">(内部重复)</span>'
                    : '';
                html += `
            <label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
                <input type="checkbox" class="ttw-dup-entry-cb" data-index="${globalIdx}" data-category="${category}" checked>
                <span>${item.name}${badge}</span>
            </label>`;
            });
            html += '</div></div>';
        }
        html += '</div></div>';
        return html;
    }

    function buildMergeOptionsHtml() {
        return `
    <div style="margin-bottom:16px;">
        <div style="font-weight:bold;color:#e67e22;margin-bottom:10px;">🔀 重复条目处理方式</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="ai" checked>
                <div>
                    <div style="font-weight:bold;">🤖 AI智能合并 (支持并发)</div>
                    <div style="font-size:11px;color:#888;">使用AI合并相同名称的条目，保留所有信息</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="replace">
                <div>
                    <div style="font-weight:bold;">📝 使用后者覆盖</div>
                    <div style="font-size:11px;color:#888;">用后面的条目覆盖前面的条目</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="keep">
                <div>
                    <div style="font-weight:bold;">🔒 保留前者</div>
                    <div style="font-size:11px;color:#888;">保留第一个条目，丢弃后面的重复条目</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="rename">
                <div>
                    <div style="font-weight:bold;">📋 重命名保留</div>
                    <div style="font-size:11px;color:#888;">将重复条目添加为新名称（如 角色名_2）</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="append">
                <div>
                    <div style="font-weight:bold;">➕ 内容叠加</div>
                    <div style="font-size:11px;color:#888;">将重复条目的内容追加到原条目后面</div>
                </div>
            </label>
        </div>
    </div>
    <div id="ttw-ai-merge-options" style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
        <div style="font-weight:bold;color:#9b59b6;margin-bottom:10px;">🤖 AI合并设置</div>
        <div style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                <span>并发数:</span>
                <input type="number" id="ttw-merge-concurrency" value="${AppState.config.parallel.concurrency}" min="1" max="10" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;">
            </label>
        </div>
        <textarea id="ttw-merge-prompt" rows="4" style="width:100%;padding:10px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;resize:vertical;" placeholder="留空使用默认提示词...">${AppState.settings.customMergePrompt || ''}</textarea>
        <div style="margin-top:8px;">
            <button class="ttw-btn ttw-btn-small" id="ttw-preview-merge-prompt">👁️ 预览默认提示词</button>
        </div>
    </div>`;
    }

    async function mergeEntriesWithAI(entryA, entryB, customPrompt, signal) {
        const promptTemplate = customPrompt?.trim() || defaultMergePrompt;
        const prompt = promptTemplate
            .replace('{ENTRY_A}', JSON.stringify(entryA, null, 2))
            .replace('{ENTRY_B}', JSON.stringify(entryB, null, 2));

        const response = await callAPI(getLanguagePrefix() + prompt, null, { signal });

        const result = parseAIResponse(response);
        if (!result || typeof result['内容'] !== 'string' || !result['内容'].trim())
            throw new Error('AI 合并结果缺少有效正文，保留原条目');
        return {
            ...entryA,
            关键词: result['关键词'] || [...(entryA['关键词'] || []), ...(entryB['关键词'] || [])],
            内容: result['内容'],
        };
    }

    async function performMergeInternal(
        _importedWorldbook,
        duplicates,
        newEntries,
        mergeMode,
        customPrompt,
        concurrency = 3,
    ) {
        return executeRun(
            AppState.processing,
            'import',
            async (guard) => {
                showProgressSection(true);
                setProcessingStatus('running');
                updateProgress(0, '开始合并...');
                const next = await mergeImportedWorldbook({
                    existing: AppState.worldbook.generated,
                    newEntries,
                    duplicates,
                    mode: mergeMode,
                    concurrency,
                    signal: guard.signal,
                    mergeWithAI: (a, b, signal) => mergeEntriesWithAI(a, b, customPrompt, signal),
                    onProgress: (done, total) => updateProgress((done / total) * 100, '正在合并...'),
                });
                guard.assert();
                if (!deps.commitWorldbook) throw new Error('缺少世界书提交仓储');
                await deps.commitWorldbook(next, guard, '导入世界书');
                AppState.persistent.pendingImport = null;
                showResultSection(true);
                updateWorldbookPreview();
                ErrorHandler.showUserSuccess('世界书导入完成！');
            },
            {
                finish: () => {
                    if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');
                },
            },
        ).catch((error) => ErrorHandler.showUserError('导入失败: ' + error.message));
    }

    function bindMergeModalEvents(modal, newEntries, allDuplicates, importedWorldbook) {
        const selectAllNewCb = modal.querySelector('#ttw-select-all-new');
        if (selectAllNewCb) {
            selectAllNewCb.addEventListener('change', (e) => {
                modal.querySelectorAll('.ttw-new-entry-cb').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
                modal.querySelectorAll('.ttw-new-category-cb').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
            });
        }

        const selectAllDupCb = modal.querySelector('#ttw-select-all-dup');
        if (selectAllDupCb) {
            selectAllDupCb.addEventListener('change', (e) => {
                modal.querySelectorAll('.ttw-dup-entry-cb').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
                modal.querySelectorAll('.ttw-dup-category-cb').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
            });
        }

        modal.querySelectorAll('.ttw-new-category-cb').forEach((cb) => {
            cb.addEventListener('change', (e) => {
                const category = e.target.dataset.category;
                modal.querySelectorAll(`.ttw-new-entry-cb[data-category="${category}"]`).forEach((entryCb) => {
                    entryCb.checked = e.target.checked;
                });
            });
        });

        modal.querySelectorAll('.ttw-dup-category-cb').forEach((cb) => {
            cb.addEventListener('change', (e) => {
                const category = e.target.dataset.category;
                modal.querySelectorAll(`.ttw-dup-entry-cb[data-category="${category}"]`).forEach((entryCb) => {
                    entryCb.checked = e.target.checked;
                });
            });
        });

        modal.querySelector('#ttw-cancel-merge').addEventListener('click', () => ModalFactory.close(modal));

        const aiOptions = modal.querySelector('#ttw-ai-merge-options');
        if (aiOptions) {
            modal.querySelectorAll('input[name="merge-mode"]').forEach((radio) => {
                radio.addEventListener('change', () => {
                    aiOptions.style.display = radio.value === 'ai' ? 'block' : 'none';
                });
            });
        }

        const previewBtn = modal.querySelector('#ttw-preview-merge-prompt');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                const previewModal = ModalFactory.create({
                    id: 'ttw-default-merge-prompt-modal',
                    title: '🔍 默认合并提示词',
                    body: `<textarea readonly style="width: 100%; height: 300px; resize: vertical; box-sizing: border-box; background: rgba(0,0,0,0.3); color: #ccc; border: 1px solid #555; padding: 10px; font-family: monospace; border-radius: 4px; white-space: pre-wrap;">${defaultMergePrompt}</textarea>`,
                    footer: '<button class="ttw-btn ttw-btn-primary" id="ttw-close-merge-prompt">关闭</button>',
                });
                previewModal
                    .querySelector('#ttw-close-merge-prompt')
                    .addEventListener('click', () => ModalFactory.close(previewModal));
            });
        }

        modal.querySelector('#ttw-confirm-merge').addEventListener('click', async () => {
            const mergeMode = modal.querySelector('input[name="merge-mode"]:checked')?.value || 'keep';
            const customPrompt = modal.querySelector('#ttw-merge-prompt')?.value || '';
            const mergeConcurrency =
                parseInt(modal.querySelector('#ttw-merge-concurrency')?.value, 10) ||
                AppState.config.parallel.concurrency;
            AppState.settings.customMergePrompt = customPrompt;
            saveCurrentSettings();

            const selectedNewIndices = [...modal.querySelectorAll('.ttw-new-entry-cb:checked')].map((cb) =>
                parseInt(cb.dataset.index, 10),
            );
            const selectedDupIndices = [...modal.querySelectorAll('.ttw-dup-entry-cb:checked')].map((cb) =>
                parseInt(cb.dataset.index, 10),
            );

            const selectedNew = selectedNewIndices.map((i) => newEntries[i]).filter(Boolean);
            const selectedDup = selectedDupIndices.map((i) => allDuplicates[i]).filter(Boolean);

            ModalFactory.close(modal);
            await performMergeInternal(
                importedWorldbook,
                selectedDup,
                selectedNew,
                mergeMode,
                customPrompt,
                mergeConcurrency,
            );
        });
    }

    function showMergeOptionsModal(importedWorldbook, fileName, internalDuplicates = []) {
        if (!importedWorldbook && AppState.persistent.pendingImport) {
            importedWorldbook = AppState.persistent.pendingImport.worldbook;
            fileName = AppState.persistent.pendingImport.fileName;
            internalDuplicates = AppState.persistent.pendingImport.internalDuplicates || [];
        }

        if (!importedWorldbook) {
            ErrorHandler.showUserError('没有可导入的数据');
            return;
        }

        const existingModal = document.getElementById('ttw-merge-modal');
        if (existingModal) existingModal.remove();

        const duplicatesWithExisting = findDuplicateEntries(AppState.worldbook.generated, importedWorldbook);
        const newEntries = findNewEntries(AppState.worldbook.generated, importedWorldbook);
        const allDuplicates = [...internalDuplicates, ...duplicatesWithExisting];

        const groupedNew = groupEntriesByCategory(newEntries);
        const groupedDup = groupEntriesByCategory(allDuplicates);

        const totalEntries = Object.values(importedWorldbook).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
        const internalDupCount = internalDuplicates.length;
        const externalDupCount = duplicatesWithExisting.length;

        const newEntriesListHtml = buildNewEntriesListHtml(newEntries, groupedNew);
        const dupEntriesListHtml = buildDupEntriesListHtml(allDuplicates, groupedDup, internalDuplicates);
        const mergeOptionsHtml = allDuplicates.length > 0 ? buildMergeOptionsHtml() : '';

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 导入分析</div>
			<div style="font-size:13px;color:#ccc;">
				• 总条目: <span style="color:#3498db;font-weight:bold;">${totalEntries}</span> 个<br>
				• 新条目: <span style="color:#27ae60;font-weight:bold;">${newEntries.length}</span> 个<br>
				• 重复条目: <span style="color:#e67e22;font-weight:bold;">${allDuplicates.length}</span> 个
				${internalDupCount > 0 ? `<span style="color:#9b59b6;font-size:11px;">(其中 ${internalDupCount} 个为文件内部重复)</span>` : ''}
				${externalDupCount > 0 ? `<span style="color:#888;font-size:11px;">(${externalDupCount} 个与现有世界书重复)</span>` : ''}
			</div>
		</div>
		${newEntriesListHtml}
		${dupEntriesListHtml}
		${mergeOptionsHtml}`;

        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-merge">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-merge">✅ 确认导入</button>`;

        const modal = ModalFactory.create({
            id: 'ttw-merge-modal',
            title: `📥 导入世界书: ${fileName}`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '800px',
        });

        bindMergeModalEvents(modal, newEntries, allDuplicates, importedWorldbook);
        Logger.info('ImportMerge', `打开导入合并面板: new=${newEntries.length}, dup=${allDuplicates.length}`);
    }

    async function importAndMergeWorldbook() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const content = await file.text();
                const importedData = JSON.parse(content);

                let worldbookToMerge = {};
                let internalDuplicates = [];

                if (importedData.entries || importedData.data?.character_book || importedData.character_book) {
                    const result = convertSTFormatToInternal(importedData, true);
                    worldbookToMerge = result.worldbook;
                    internalDuplicates = result.duplicates;
                } else if (importedData.merged) {
                    worldbookToMerge = importedData.merged;
                } else {
                    worldbookToMerge = importedData;
                }

                AppState.persistent.pendingImport = {
                    worldbook: worldbookToMerge,
                    fileName: file.name,
                    timestamp: Date.now(),
                    internalDuplicates,
                };

                showMergeOptionsModal(worldbookToMerge, file.name, internalDuplicates);
            } catch (error) {
                Logger.error('ImportMerge', '导入失败:', error);
                ErrorHandler.showUserError(`导入失败: ${error.message}`);
            }
        };

        input.click();
    }

    return {
        importAndMergeWorldbook,
        showMergeOptionsModal,
    };
}

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
        updateStreamContent,
        getProcessingStatus,
        showResultSection,
        updateWorldbookPreview,
        Semaphore,
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

    async function mergeEntriesWithAI(entryA, entryB, customPrompt) {
        const promptTemplate = customPrompt?.trim() || defaultMergePrompt;
        const prompt = promptTemplate
            .replace('{ENTRY_A}', JSON.stringify(entryA, null, 2))
            .replace('{ENTRY_B}', JSON.stringify(entryB, null, 2));

        const response = await callAPI(getLanguagePrefix() + prompt);

        try {
            const result = parseAIResponse(response);
            if (result['关键词'] || result['内容']) {
                return {
                    关键词: result['关键词'] || [...(entryA['关键词'] || []), ...(entryB['关键词'] || [])],
                    内容: result['内容'] || entryA['内容'] || entryB['内容'],
                };
            }
            return result;
        } catch {
            return {
                关键词: [...new Set([...(entryA['关键词'] || []), ...(entryB['关键词'] || [])])],
                内容: `${entryA['内容'] || ''}\n\n---\n\n${entryB['内容'] || ''}`,
            };
        }
    }

    async function performMergeInternal(
        importedWorldbook,
        duplicates,
        newEntries,
        mergeMode,
        customPrompt,
        concurrency = 3,
    ) {
        showProgressSection(true);
        setProcessingStatus('running');
        updateProgress(0, '开始处理...');
        updateStreamContent('', true);
        updateStreamContent(`🔀 开始处理世界书\n处理模式: ${mergeMode}\n并发数: ${concurrency}\n${'='.repeat(50)}\n`);

        const resultWorldbook = JSON.parse(JSON.stringify(importedWorldbook));

        for (const item of newEntries) {
            if (!AppState.worldbook.generated[item.category]) AppState.worldbook.generated[item.category] = {};
            AppState.worldbook.generated[item.category][item.name] = item.entry;
        }
        updateStreamContent(`✅ 添加了 ${newEntries.length} 个新条目到现有世界书\n`);

        if (duplicates.length > 0) {
            updateStreamContent(`\n🔀 处理 ${duplicates.length} 个重复条目...\n`);

            if (mergeMode === 'ai') {
                const semaphore = new Semaphore(concurrency);
                let completed = 0;
                let failed = 0;

                const processOne = async (dup, index) => {
                    if (AppState.processing.isStopped) return;

                    await semaphore.acquire();
                    if (AppState.processing.isStopped) {
                        semaphore.release();
                        return;
                    }

                    try {
                        updateStreamContent(`📝 [${index + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);
                        const mergedEntry = await mergeEntriesWithAI(dup.existing, dup.imported, customPrompt);

                        if (!resultWorldbook[dup.category]) resultWorldbook[dup.category] = {};
                        resultWorldbook[dup.category][dup.name] = mergedEntry;

                        completed++;
                        updateProgress(
                            (completed / duplicates.length) * 100,
                            `AI合并中 (${completed}/${duplicates.length})`,
                        );
                        updateStreamContent('   ✅ 完成\n');
                    } catch (error) {
                        failed++;
                        updateStreamContent(`   ❌ 失败: ${error.message}\n`);
                    } finally {
                        semaphore.release();
                    }
                };

                await Promise.allSettled(duplicates.map((dup, i) => processOne(dup, i)));
                updateStreamContent(`\n📦 AI合并完成: 成功 ${completed}, 失败 ${failed}\n`);
            } else {
                for (let i = 0; i < duplicates.length; i++) {
                    if (AppState.processing.isStopped) break;

                    const dup = duplicates[i];
                    updateProgress(((i + 1) / duplicates.length) * 100, `处理: [${dup.category}] ${dup.name}`);
                    updateStreamContent(`\n📝 [${i + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);

                    if (!resultWorldbook[dup.category]) resultWorldbook[dup.category] = {};

                    if (mergeMode === 'replace') {
                        resultWorldbook[dup.category][dup.name] = dup.imported;
                        updateStreamContent('   ✅ 使用后者覆盖\n');
                    } else if (mergeMode === 'keep') {
                        updateStreamContent('   ⏭️ 保留前者\n');
                    } else if (mergeMode === 'rename') {
                        let newName = `${dup.name}_2`;
                        let counter = 2;
                        while (resultWorldbook[dup.category][newName]) {
                            counter++;
                            newName = `${dup.name}_${counter}`;
                        }
                        resultWorldbook[dup.category][newName] = dup.imported;
                        updateStreamContent(`   ✅ 添加为: ${newName}\n`);
                    } else if (mergeMode === 'append') {
                        const existing = resultWorldbook[dup.category][dup.name] || dup.existing;
                        const keywords = [
                            ...new Set([...(existing['关键词'] || []), ...(dup.imported['关键词'] || [])]),
                        ];
                        const content = (existing['内容'] || '') + '\n\n---\n\n' + (dup.imported['内容'] || '');
                        resultWorldbook[dup.category][dup.name] = { 关键词: keywords, 内容: content };
                        updateStreamContent('   ✅ 内容已叠加\n');
                    }
                }
            }
        }

        for (const category in resultWorldbook) {
            if (!AppState.worldbook.generated[category]) AppState.worldbook.generated[category] = {};
            for (const name in resultWorldbook[category]) {
                AppState.worldbook.generated[category][name] = resultWorldbook[category][name];
            }
        }

        AppState.persistent.pendingImport = null;
        updateProgress(100, '处理完成！');
        updateStreamContent(`\n${'='.repeat(50)}\n✅ 处理完成！\n`);
        if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');

        showResultSection(true);
        updateWorldbookPreview();
        ErrorHandler.showUserSuccess('世界书导入完成！');
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

    function convertSTFormatToInternal(stData, collectDuplicates = false) {
        const result = {};
        const internalDuplicates = [];

        if (!stData.entries) {
            return collectDuplicates ? { worldbook: result, duplicates: internalDuplicates } : result;
        }

        const entriesArray = Array.isArray(stData.entries) ? stData.entries : Object.values(stData.entries);

        for (const entry of entriesArray) {
            if (!entry || typeof entry !== 'object') continue;

            let category = '未分类';
            let name = '';

            if (entry.comment) {
                const parts = entry.comment.split(' - ');
                if (parts.length >= 2) {
                    category = parts[0].trim();
                    name = parts.slice(1).join(' - ').trim();
                } else {
                    name = entry.comment.trim();
                }
            }

            if (category === '未分类' && entry.group) {
                const underscoreIndex = entry.group.indexOf('_');
                category = underscoreIndex > 0 ? entry.group.substring(0, underscoreIndex) : entry.group;
            }

            if (!name) {
                name = `条目_${entry.uid || Math.random().toString(36).slice(2, 11)}`;
            }

            if (!result[category]) {
                result[category] = {};
            }

            const newEntry = {
                关键词: Array.isArray(entry.key) ? entry.key : entry.key ? [entry.key] : [],
                内容: entry.content || '',
            };

            if (result[category][name]) {
                internalDuplicates.push({
                    category,
                    name,
                    existing: result[category][name],
                    imported: newEntry,
                });
            } else {
                result[category][name] = newEntry;
            }
        }

        Logger.info(
            'ImportMerge',
            `ST格式转换完成: ${Object.values(result).reduce((sum, cat) => sum + Object.keys(cat).length, 0)} 个条目, ${internalDuplicates.length} 个内部重复`,
        );

        if (collectDuplicates) {
            return { worldbook: result, duplicates: internalDuplicates };
        }
        return result;
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

                if (importedData.entries) {
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

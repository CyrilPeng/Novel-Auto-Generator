export function createMergeConsolidateView(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        ModalFactory,
        getEntryTotalTokens,
        defaultConsolidatePrompt,
        saveCurrentSettings,
        promptAction,
        confirmAction,
        workflow,
    } = deps;

    function showConsolidateCategorySelector() {
        const categories = Object.keys(AppState.worldbook.generated).filter((cat) => {
            const entries = AppState.worldbook.generated[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
        });

        if (categories.length === 0) {
            ErrorHandler.showUserError('当前世界书中没有任何条目，无法整理');
            return;
        }

        const existingModal = document.getElementById('ttw-consolidate-modal');
        if (existingModal) existingModal.remove();

        let categoriesHtml = '';
        categories.forEach((cat) => {
            const entryNames = Object.keys(AppState.worldbook.generated[cat]);
            const entryCount = entryNames.length;

            let entriesListHtml = '';
            entryNames.forEach((name) => {
                const isFailed = workflow
                    .getLastConsolidateFailedEntries()
                    .some((e) => e.category === cat && e.name === name);
                const failedBadge = isFailed
                    ? '<span style="color:#e74c3c;font-size:9px;margin-left:4px;">❗失败</span>'
                    : '';
                const entryTokens = getEntryTotalTokens(AppState.worldbook.generated[cat][name]);
                entriesListHtml += `
			<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
				<input type="checkbox" class="ttw-consolidate-entry-cb" data-category="${cat}" data-entry="${name}" ${isFailed ? 'checked' : ''}>
				<span style="flex:1;">${name}${failedBadge}</span>
				<span style="color:#888;font-size:10px;white-space:nowrap;">${entryTokens}t</span>
			</label>
			`;
            });

            const hasFailedInCat = workflow.getLastConsolidateFailedEntries().some((e) => e.category === cat);

            let catTotalTokens = 0;
            entryNames.forEach((name) => {
                catTotalTokens += getEntryTotalTokens(AppState.worldbook.generated[cat][name]);
            });

            const presets = AppState.settings.consolidatePromptPresets || [];
            const currentPreset = (AppState.settings.consolidateCategoryPresetMap || {})[cat] || '默认';
            let presetOptionsHtml = `<option value="默认" ${currentPreset === '默认' ? 'selected' : ''}>默认</option>`;
            presets.forEach((p) => {
                presetOptionsHtml += `<option value="${p.name}" ${currentPreset === p.name ? 'selected' : ''}>${p.name}</option>`;
            });

            categoriesHtml += `
		<div class="ttw-consolidate-cat-group" style="margin-bottom:10px;">
			<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(52,152,219,0.15);border-radius:6px;cursor:pointer;" data-cat-toggle="${cat}">
				<input type="checkbox" class="ttw-consolidate-cat-cb" data-category="${cat}" ${hasFailedInCat ? 'checked' : ''}>
				<span style="font-weight:bold;font-size:12px;flex:1;">${cat}</span>
				<select class="ttw-consolidate-cat-preset" data-category="${cat}" style="font-size:10px;padding:2px 4px;border:1px solid #666;border-radius:4px;background:rgba(0,0,0,0.4);color:#ccc;max-width:100px;cursor:pointer;" title="选择此分类使用的整理提示词预设">${presetOptionsHtml}</select>
				<span style="color:#888;font-size:11px;">(${entryCount}条 ~${catTotalTokens}t)</span>
				${hasFailedInCat ? '<span style="color:#e74c3c;font-size:10px;">有失败</span>' : ''}
				<span class="ttw-cat-expand-icon" style="font-size:10px;transition:transform 0.2s;">▶</span>
			</div>
			<div class="ttw-cat-entries-list" data-cat-list="${cat}" style="display:none;margin-left:20px;margin-top:4px;max-height:200px;overflow-y:auto;">
				<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:4px;">
					<button class="ttw-btn-tiny ttw-select-all-entries" data-category="${cat}">全选</button>
					<button class="ttw-btn-tiny ttw-deselect-all-entries" data-category="${cat}">全不选</button>
					${hasFailedInCat ? `<button class="ttw-btn-tiny ttw-select-failed-entries" data-category="${cat}" style="color:#e74c3c;">选失败项</button>` : ''}
				</div>
				${entriesListHtml}
			</div>
		</div>
		`;
        });

        const hasAnyFailed = workflow.getLastConsolidateFailedEntries().length > 0;

        const bodyHtml = `
		<div style="margin-bottom:12px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">展开分类可多选具体条目。AI将去除重复信息并优化格式。</div>
		</div>
		<div style="margin-bottom:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-weight:bold;font-size:12px;color:#e67e22;">📝 整理提示词预设</span>
				<div style="display:flex;gap:6px;">
					<button class="ttw-btn ttw-btn-small" id="ttw-consolidate-add-preset" style="font-size:10px;background:rgba(52,152,219,0.5);">➕ 添加预设</button>
				</div>
			</div>
			<div style="font-size:10px;color:#888;margin-bottom:8px;">
				每个分类可指定不同预设。<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;color:#f39c12;">{CONTENT}</code> 会被替换为条目原始内容。「默认」预设不可删除。
			</div>
			<div id="ttw-consolidate-presets-list" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;"></div>
		</div>
		${
            hasAnyFailed
                ? `
		<div style="margin-bottom:12px;padding:10px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);border-radius:6px;">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<span style="color:#e74c3c;font-weight:bold;font-size:12px;">❗ 上次有 ${workflow.getLastConsolidateFailedEntries().length} 个条目失败</span>
				<button class="ttw-btn ttw-btn-small ttw-btn-warning" id="ttw-select-all-failed">🔧 只选失败项</button>
			</div>
		</div>
		`
                : ''
        }
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
			<span style="font-weight:bold;">选择分类和条目 <span id="ttw-consolidate-selected-count" style="color:#888;font-size:11px;font-weight:normal;"></span></span>
			<div style="display:flex;gap:8px;">
				<button class="ttw-btn-tiny" id="ttw-check-all-cats">全选所有</button>
				<button class="ttw-btn-tiny" id="ttw-uncheck-all-cats">全不选</button>
			</div>
		</div>
		<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">
			${categoriesHtml}
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-consolidate">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-start-consolidate">🧹 开始整理</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-consolidate-modal',
            title: '🧹 整理条目 - 选择条目',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '600px',
        });

        function updateSelectedCount() {
            const count = modal.querySelectorAll('.ttw-consolidate-entry-cb:checked').length;
            const countEl = modal.querySelector('#ttw-consolidate-selected-count');
            if (countEl) countEl.textContent = `(已选 ${count} 条)`;
        }

        modal.querySelectorAll('[data-cat-toggle]').forEach((header) => {
            header.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const cat = header.dataset.catToggle;
                const list = modal.querySelector(`[data-cat-list="${cat}"]`);
                const icon = header.querySelector('.ttw-cat-expand-icon');
                if (list.style.display === 'none') {
                    list.style.display = 'block';
                    icon.style.transform = 'rotate(90deg)';
                } else {
                    list.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }
            });
        });

        modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
            cb.addEventListener('change', (e) => {
                const cat = e.target.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((entryCb) => {
                    entryCb.checked = e.target.checked;
                });
                updateSelectedCount();
            });
        });

        modal.querySelectorAll('.ttw-consolidate-entry-cb').forEach((cb) => {
            cb.addEventListener('change', updateSelectedCount);
        });

        modal.querySelectorAll('.ttw-select-all-entries').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((cb) => {
                    cb.checked = true;
                });
                updateSelectedCount();
            });
        });
        modal.querySelectorAll('.ttw-deselect-all-entries').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((cb) => {
                    cb.checked = false;
                });
                updateSelectedCount();
            });
        });
        modal.querySelectorAll('.ttw-select-failed-entries').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach((cb) => {
                    const isFailed = workflow
                        .getLastConsolidateFailedEntries()
                        .some((e) => e.category === cat && e.name === cb.dataset.entry);
                    cb.checked = isFailed;
                });
                updateSelectedCount();
            });
        });

        modal.querySelector('#ttw-check-all-cats').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
                cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            });
        });
        modal.querySelector('#ttw-uncheck-all-cats').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            });
        });

        const selectAllFailedBtn = modal.querySelector('#ttw-select-all-failed');
        if (selectAllFailedBtn) {
            selectAllFailedBtn.addEventListener('click', () => {
                modal.querySelectorAll('.ttw-consolidate-entry-cb').forEach((cb) => {
                    cb.checked = false;
                });
                modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach((cb) => {
                    cb.checked = false;
                });
                workflow.getLastConsolidateFailedEntries().forEach((failed) => {
                    const cb = modal.querySelector(
                        `.ttw-consolidate-entry-cb[data-category="${failed.category}"][data-entry="${failed.name}"]`,
                    );
                    if (cb) cb.checked = true;
                });
                updateSelectedCount();
            });
        }

        modal.querySelector('#ttw-cancel-consolidate').addEventListener('click', () => ModalFactory.close(modal));

        function getPresetPromptByName(name) {
            if (!name || name === '默认') return defaultConsolidatePrompt;
            const preset = (AppState.settings.consolidatePromptPresets || []).find((p) => p.name === name);
            return preset && preset.prompt && preset.prompt.trim() ? preset.prompt : defaultConsolidatePrompt;
        }

        function renderPresetsListUI() {
            const container = modal.querySelector('#ttw-consolidate-presets-list');
            if (!container) return;
            const presets = AppState.settings.consolidatePromptPresets || [];
            let html = '';

            html += `
                <div class="ttw-consolidate-preset-card" style="padding:8px 10px;background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);border-radius:6px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="font-weight:bold;font-size:11px;color:#2ecc71;flex:1;">📌 默认</span>
                        <span style="font-size:10px;color:#888;">内置·不可删除</span>
                        <button class="ttw-btn-tiny ttw-consolidate-toggle-preview" data-preset-index="-1" style="font-size:9px;">展开</button>
                    </div>
                    <div class="ttw-consolidate-preset-preview" data-preview-index="-1" style="display:none;">
                        <textarea rows="3" style="width:100%;padding:6px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#aaa;font-size:10px;resize:vertical;line-height:1.4;" readonly>${defaultConsolidatePrompt}</textarea>
                    </div>
                </div>
            `;

            presets.forEach((preset, idx) => {
                html += `
                    <div class="ttw-consolidate-preset-card" style="padding:8px 10px;background:rgba(230,126,34,0.1);border:1px solid rgba(230,126,34,0.3);border-radius:6px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <input type="text" class="ttw-consolidate-preset-name" data-preset-index="${idx}" value="${preset.name}" style="font-weight:bold;font-size:11px;color:#e67e22;background:transparent;border:1px solid transparent;border-radius:3px;padding:2px 4px;flex:1;min-width:0;" title="点击编辑预设名称">
                            <button class="ttw-btn-tiny ttw-consolidate-toggle-preview" data-preset-index="${idx}" style="font-size:9px;">展开</button>
                            <button class="ttw-btn-tiny ttw-consolidate-delete-preset" data-preset-index="${idx}" style="font-size:9px;color:#e74c3c;" title="删除预设">🗑️</button>
                        </div>
                        <div class="ttw-consolidate-preset-preview" data-preview-index="${idx}" style="display:none;">
                            <textarea class="ttw-consolidate-preset-prompt" data-preset-index="${idx}" rows="3" style="width:100%;padding:6px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;font-size:10px;resize:vertical;line-height:1.4;" placeholder="输入提示词...必须包含 {CONTENT} 占位符">${preset.prompt || ''}</textarea>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            container.querySelectorAll('.ttw-consolidate-toggle-preview').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const idx = btn.dataset.presetIndex;
                    const preview = container.querySelector(`[data-preview-index="${idx}"]`);
                    if (preview) {
                        const isHidden = preview.style.display === 'none';
                        preview.style.display = isHidden ? 'block' : 'none';
                        btn.textContent = isHidden ? '收起' : '展开';
                    }
                });
            });

            container.querySelectorAll('.ttw-consolidate-preset-name').forEach((input) => {
                input.addEventListener('focus', () => {
                    input.style.borderColor = '#e67e22';
                });
                input.addEventListener('blur', () => {
                    input.style.borderColor = 'transparent';
                    const idx = parseInt(input.dataset.presetIndex, 10);
                    const newName = input.value.trim();
                    if (!newName) {
                        input.value = presets[idx].name;
                        return;
                    }
                    if (newName === '默认') {
                        ErrorHandler.showUserError('不能使用"默认"作为预设名');
                        input.value = presets[idx].name;
                        return;
                    }
                    if (presets.some((p, i) => i !== idx && p.name === newName)) {
                        ErrorHandler.showUserError('预设名已存在');
                        input.value = presets[idx].name;
                        return;
                    }
                    const oldName = presets[idx].name;
                    presets[idx].name = newName;
                    const map = AppState.settings.consolidateCategoryPresetMap || {};
                    Object.keys(map).forEach((cat) => {
                        if (map[cat] === oldName) map[cat] = newName;
                    });
                    AppState.settings.consolidatePromptPresets = presets;
                    saveCurrentSettings();
                    refreshCategoryPresetDropdowns();
                });
            });

            container.querySelectorAll('.ttw-consolidate-preset-prompt').forEach((textarea) => {
                textarea.addEventListener('input', () => {
                    const idx = parseInt(textarea.dataset.presetIndex, 10);
                    presets[idx].prompt = textarea.value;
                    AppState.settings.consolidatePromptPresets = presets;
                    saveCurrentSettings();
                });
            });

            container.querySelectorAll('.ttw-consolidate-delete-preset').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const idx = parseInt(btn.dataset.presetIndex, 10);
                    const deletedName = presets[idx].name;
                    const confirmed = await ModalFactory.confirm({
                        title: '删除预设',
                        message: `确定删除预设「${deletedName}」？`,
                        danger: true,
                    });
                    if (!confirmed) return;
                    presets.splice(idx, 1);
                    const map = AppState.settings.consolidateCategoryPresetMap || {};
                    Object.keys(map).forEach((cat) => {
                        if (map[cat] === deletedName) delete map[cat];
                    });
                    AppState.settings.consolidatePromptPresets = presets;
                    saveCurrentSettings();
                    renderPresetsListUI();
                    refreshCategoryPresetDropdowns();
                });
            });
        }

        function refreshCategoryPresetDropdowns() {
            const presets = AppState.settings.consolidatePromptPresets || [];
            const map = AppState.settings.consolidateCategoryPresetMap || {};
            modal.querySelectorAll('.ttw-consolidate-cat-preset').forEach((select) => {
                const cat = select.dataset.category;
                const current = map[cat] || '默认';
                let optionsHtml = `<option value="默认" ${current === '默认' ? 'selected' : ''}>默认</option>`;
                presets.forEach((p) => {
                    optionsHtml += `<option value="${p.name}" ${current === p.name ? 'selected' : ''}>${p.name}</option>`;
                });
                select.innerHTML = optionsHtml;
            });
        }

        modal.querySelector('#ttw-consolidate-add-preset').addEventListener('click', async () => {
            const name = await promptAction({
                title: '添加预设',
                message: '输入预设名称:',
                placeholder: '例如：角色整理',
                defaultValue: '',
            });
            if (!name || !name.trim()) return;
            const trimmedName = name.trim();
            if (trimmedName === '默认') {
                ErrorHandler.showUserError('不能使用"默认"作为预设名');
                return;
            }
            if (!AppState.settings.consolidatePromptPresets) AppState.settings.consolidatePromptPresets = [];
            if (AppState.settings.consolidatePromptPresets.some((p) => p.name === trimmedName)) {
                ErrorHandler.showUserError('预设名已存在');
                return;
            }
            AppState.settings.consolidatePromptPresets.push({ name: trimmedName, prompt: '' });
            saveCurrentSettings();
            renderPresetsListUI();
            refreshCategoryPresetDropdowns();
            setTimeout(() => {
                const idx = AppState.settings.consolidatePromptPresets.length - 1;
                const btn = modal.querySelector(`.ttw-consolidate-toggle-preview[data-preset-index="${idx}"]`);
                if (btn) btn.click();
            }, 100);
        });

        modal.querySelectorAll('.ttw-consolidate-cat-preset').forEach((select) => {
            select.addEventListener('change', () => {
                const cat = select.dataset.category;
                if (!AppState.settings.consolidateCategoryPresetMap)
                    AppState.settings.consolidateCategoryPresetMap = {};
                if (select.value === '默认') {
                    delete AppState.settings.consolidateCategoryPresetMap[cat];
                } else {
                    AppState.settings.consolidateCategoryPresetMap[cat] = select.value;
                }
                saveCurrentSettings();
            });
        });

        renderPresetsListUI();

        modal.querySelector('#ttw-start-consolidate').addEventListener('click', async () => {
            const selectedEntries = [...modal.querySelectorAll('.ttw-consolidate-entry-cb:checked')].map((cb) => {
                const cat = cb.dataset.category;
                const presetSelect = modal.querySelector(`.ttw-consolidate-cat-preset[data-category="${cat}"]`);
                const presetName = presetSelect ? presetSelect.value : '默认';
                return {
                    category: cat,
                    name: cb.dataset.entry,
                    promptTemplate: getPresetPromptByName(presetName),
                };
            });
            if (selectedEntries.length === 0) {
                ErrorHandler.showUserError('请至少选择一个条目');
                return;
            }
            const presetUsage = {};
            selectedEntries.forEach((e) => {
                const pSelect = modal.querySelector(`.ttw-consolidate-cat-preset[data-category="${e.category}"]`);
                const pName = pSelect ? pSelect.value : '默认';
                presetUsage[pName] = (presetUsage[pName] || 0) + 1;
            });
            const usageSummary = Object.entries(presetUsage)
                .map(([k, v]) => `「${k}」${v}条`)
                .join('，');
            if (
                !(await confirmAction(`确定要整理 ${selectedEntries.length} 个条目吗？\n\n预设分配：${usageSummary}`, {
                    title: '整理条目',
                }))
            )
                return;
            modal.remove();
            await workflow.consolidateSelectedEntries(selectedEntries);
        });

        updateSelectedCount();
    }

    return { showConsolidateCategorySelector };
}

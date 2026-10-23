export function createMergeManualView(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        ModalFactory,
        getEntryTotalTokens,
        naturalSortEntryNames,
        EventDelegate,
        PerfUtils,
        estimateTokenCount,
        confirmAction,
        updateStreamContent,
        saveWorldbookSnapshot,
        workflow,
    } = deps;
    const mergedService = workflow.getMergeService();

    function showManualMergeUI(onMergeComplete) {
        const existingModal = document.getElementById('ttw-manual-merge-modal');
        if (existingModal) existingModal.remove();

        const worldbook = mergedService.getManualMergeViewWorldbook();
        const categories = Object.keys(worldbook).filter((cat) => {
            const entries = worldbook[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
        });

        if (categories.length === 0) {
            ErrorHandler.showUserError('当前世界书中没有条目，无法进行手动合并');
            return;
        }

        let entriesHtml = '';
        let totalEntries = 0;
        for (const cat of categories) {
            const entries = worldbook[cat];
            const entryNames = naturalSortEntryNames(Object.keys(entries));
            totalEntries += entryNames.length;

            entriesHtml += `<div class="ttw-mm-category" style="margin-bottom:10px;">
		<div class="ttw-collapse-toggle" style="background:linear-gradient(135deg,#e67e22,#d35400);padding:8px 12px;border-radius:6px 6px 0 0;cursor:pointer;font-weight:bold;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
			<span>📁 ${cat} (${entryNames.length})</span>
			<span style="font-size:11px;color:rgba(255,255,255,0.7);">点击展开/收起</span>
		</div>
		<div style="background:#2d2d2d;border:1px solid #555;border-top:none;border-radius:0 0 6px 6px;display:none;max-height:300px;overflow-y:auto;">`;

            for (const name of entryNames) {
                const sourceInfo = mergedService.resolveDisplayedEntrySource(cat, name);
                const entry = sourceInfo?.entry || entries[name];
                const sourceType = sourceInfo?.sourceType || 'generated';
                const volumeIndex = Number.isInteger(sourceInfo?.volumeIndex)
                    ? sourceInfo.volumeIndex
                    : AppState.worldbook.currentVolumeIndex;
                const actualName = sourceInfo?.actualName || name;
                const keywords = Array.isArray(entry?.['关键词']) ? entry['关键词'].slice(0, 4).join(', ') : '';
                const tokenCount = getEntryTotalTokens(entry);
                entriesHtml += `
			<label class="ttw-mm-entry-label" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #3a3a3a;cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='rgba(155,89,182,0.15)'" onmouseleave="this.style.background='transparent'">
				<input type="checkbox" class="ttw-mm-entry-cb" data-category="${cat}" data-entry="${name}" data-actual-entry="${actualName}" data-source-type="${sourceType}" data-source-volume="${volumeIndex}" style="width:16px;height:16px;accent-color:#9b59b6;flex-shrink:0;">
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;color:#e0e0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ${name}</div>
					<div style="font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${keywords ? '🔑 ' + keywords : ''} <span style="color:#f1c40f;">${tokenCount}tk</span></div>
				</div>
			</label>`;
            }
            entriesHtml += '</div></div>';
        }

        const bodyHtml = `
		<div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
			💡 勾选2个或更多条目，将它们合并为一个。适用于AI别名识别未能发现的重复条目。<br>
			<span style="color:#f39c12;">支持跨分类合并，合并后条目将归入您指定的目标分类。</span>
		</div>

		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
			<span style="font-size:13px;color:#ccc;">共 ${totalEntries} 个条目</span>
			<div style="display:flex;gap:8px;align-items:center;">
				<input type="text" id="ttw-mm-filter" placeholder="筛选条目名..." style="padding:4px 8px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;width:150px;">
				<button class="ttw-btn ttw-btn-small" id="ttw-mm-expand-all">全部展开</button>
			</div>
		</div>

		<div id="ttw-mm-entries-container" style="max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.15);border-radius:6px;padding:8px;">
			${entriesHtml}
		</div>

		<div id="ttw-mm-selected-bar" style="display:none;margin-top:12px;padding:10px;background:rgba(155,89,182,0.2);border:1px solid #9b59b6;border-radius:6px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-size:13px;color:#9b59b6;font-weight:bold;">已选: <span id="ttw-mm-selected-count">0</span> 个条目</span>
				<button class="ttw-btn ttw-btn-small" id="ttw-mm-clear-selection" style="font-size:11px;">清除选择</button>
			</div>
			<div id="ttw-mm-selected-list" style="font-size:12px;color:#ccc;max-height:80px;overflow-y:auto;"></div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-mm-cancel">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-mm-next" disabled>下一步 → 配置合并</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-manual-merge-modal',
            title: '✋ 手动合并条目',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '800px',
        });

        modal.querySelector('#ttw-mm-cancel').addEventListener('click', () => ModalFactory.close(modal));

        EventDelegate.on(modal, '.ttw-collapse-toggle', 'click', (e, toggleEl) => {
            const contentEl = toggleEl.nextElementSibling;
            if (!contentEl) return;
            contentEl.style.display = contentEl.style.display === 'none' ? 'block' : 'none';
        });

        modal.querySelector('#ttw-mm-expand-all').addEventListener('click', () => {
            const btn = modal.querySelector('#ttw-mm-expand-all');
            const allCatBodies = modal.querySelectorAll('.ttw-mm-category > div:nth-child(2)');
            const anyHidden = [...allCatBodies].some((d) => d.style.display === 'none');
            allCatBodies.forEach((d) => {
                d.style.display = anyHidden ? 'block' : 'none';
            });
            btn.textContent = anyHidden ? '全部收起' : '全部展开';
        });

        const filterEntries = PerfUtils.debounce((keyword) => {
            modal.querySelectorAll('.ttw-mm-entry-label').forEach((label) => {
                const entryName = label.querySelector('.ttw-mm-entry-cb').dataset.entry.toLowerCase();
                label.style.display = !keyword || entryName.includes(keyword) ? 'flex' : 'none';
            });
            if (keyword) {
                modal.querySelectorAll('.ttw-mm-category').forEach((catDiv) => {
                    const body = catDiv.querySelector('div:nth-child(2)');
                    const hasVisible = [...body.querySelectorAll('.ttw-mm-entry-label')].some(
                        (l) => l.style.display !== 'none',
                    );
                    if (hasVisible) body.style.display = 'block';
                });
            }
        }, 150);
        modal.querySelector('#ttw-mm-filter').addEventListener('input', (e) => {
            filterEntries(e.target.value.toLowerCase());
        });

        function updateSelection() {
            const checked = [...modal.querySelectorAll('.ttw-mm-entry-cb:checked')];
            const count = checked.length;
            const bar = modal.querySelector('#ttw-mm-selected-bar');
            const nextBtn = modal.querySelector('#ttw-mm-next');

            if (count > 0) {
                bar.style.display = 'block';
                modal.querySelector('#ttw-mm-selected-count').textContent = count;

                const listHtml = checked
                    .map((cb) => {
                        const cat = cb.dataset.category;
                        const name = cb.dataset.entry;
                        return `<span style="display:inline-block;padding:2px 8px;background:rgba(155,89,182,0.3);border-radius:4px;margin:2px;font-size:11px;">[${cat}] ${name}</span>`;
                    })
                    .join('');
                modal.querySelector('#ttw-mm-selected-list').innerHTML = listHtml;
            } else {
                bar.style.display = 'none';
            }

            nextBtn.disabled = count < 2;
            nextBtn.textContent = count < 2 ? '下一步 → 配置合并（至少选2个）' : `下一步 → 配置合并 (${count}个)`;
        }

        modal.querySelectorAll('.ttw-mm-entry-cb').forEach((cb) => {
            cb.addEventListener('change', updateSelection);
        });

        modal.querySelector('#ttw-mm-clear-selection').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-mm-entry-cb:checked').forEach((cb) => {
                cb.checked = false;
            });
            updateSelection();
        });

        modal.querySelector('#ttw-mm-next').addEventListener('click', () => {
            const checked = [...modal.querySelectorAll('.ttw-mm-entry-cb:checked')];
            if (checked.length < 2) return;

            const selectedEntries = checked.map((cb) => ({
                category: cb.dataset.category,
                name: cb.dataset.entry,
                actualName: cb.dataset.actualEntry || cb.dataset.entry,
                sourceType: cb.dataset.sourceType || 'generated',
                volumeIndex:
                    cb.dataset.sourceVolume !== undefined && cb.dataset.sourceVolume !== ''
                        ? parseInt(cb.dataset.sourceVolume, 10)
                        : AppState.worldbook.currentVolumeIndex,
            }));

            ModalFactory.close(modal);
            showManualMergeConfigModal(selectedEntries, onMergeComplete);
        });
    }

    function showManualMergeConfigModal(selectedEntries, onMergeComplete) {
        const existingModal = document.getElementById('ttw-mm-config-modal');
        if (existingModal) existingModal.remove();

        const worldbook = mergedService.getManualMergeViewWorldbook();
        const entriesInfo = selectedEntries.map((e) => {
            const resolved = mergedService.resolveManualMergeEntryRef(e);
            const entry = resolved?.entry;
            return {
                ...e,
                actualName: resolved?.actualName || e.actualName || e.name,
                sourceType: resolved?.sourceType || e.sourceType || 'generated',
                volumeIndex: Number.isInteger(resolved?.volumeIndex)
                    ? resolved.volumeIndex
                    : Number.isInteger(e.volumeIndex)
                      ? e.volumeIndex
                      : AppState.worldbook.currentVolumeIndex,
                keywords: entry?.['关键词'] || [],
                content: entry?.['内容'] || '',
                tokens: getEntryTotalTokens(entry),
            };
        });

        const involvedCategories = [...new Set(selectedEntries.map((e) => e.category))];
        const nameOptions = selectedEntries.map((e) => e.name);

        let mergedKeywords = [];
        let mergedContent = '';
        for (const info of entriesInfo) {
            mergedKeywords.push(...info.keywords);
            mergedKeywords.push(info.name);
            if (info.content) {
                mergedContent += (mergedContent ? '\n\n---\n\n' : '') + info.content;
            }
        }
        mergedKeywords = [...new Set(mergedKeywords)];

        const allCategories = Object.keys(worldbook);
        const catOptionsHtml = allCategories
            .map((cat) => {
                const selected = cat === involvedCategories[0] ? 'selected' : '';
                return `<option value="${cat}" ${selected}>${cat}</option>`;
            })
            .join('');

        const nameOptionsHtml = nameOptions
            .map((name, idx) => {
                const cat = selectedEntries[idx].category;
                return `
		<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:4px;cursor:pointer;">
			<input type="radio" name="ttw-mm-main-name" value="${name}" ${idx === 0 ? 'checked' : ''} style="accent-color:#27ae60;">
			<span style="color:#e0e0e0;font-size:13px;">${name}</span>
			<span style="color:#888;font-size:11px;margin-left:auto;">[${cat}]</span>
		</label>`;
            })
            .join('');

        const detailsHtml = entriesInfo
            .map((info, idx) => {
                const kwStr = info.keywords.join(', ') || '无';
                const contentPreview =
                    info.content.length > 200 ? info.content.substring(0, 200) + '...' : info.content;
                return `
		<div style="border:1px solid #555;border-radius:6px;margin-bottom:8px;overflow:hidden;">
			<div class="ttw-collapse-toggle" style="background:#3a3a3a;padding:8px 12px;font-size:13px;display:flex;justify-content:space-between;cursor:pointer;">
				<span style="color:#e67e22;">[${info.category}] ${info.name}</span>
				<span style="color:#f1c40f;font-size:11px;">${info.tokens}tk</span>
			</div>
			<div style="display:${idx === 0 ? 'block' : 'none'};padding:10px;background:#1c1c1c;font-size:12px;">
				<div style="margin-bottom:6px;"><span style="color:#9b59b6;">🔑 关键词:</span> <span style="color:#ccc;">${kwStr}</span></div>
				<div style="color:#aaa;line-height:1.5;white-space:pre-wrap;max-height:150px;overflow-y:auto;">${contentPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
			</div>
		</div>`;
            })
            .join('');

        const bodyHtml = `
		<div style="display:flex;gap:16px;flex-wrap:wrap;">
			<div style="flex:1;min-width:300px;">
				<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;font-size:13px;">📌 选择主条目名称</div>
				<div style="margin-bottom:12px;padding:8px;background:rgba(0,0,0,0.15);border-radius:6px;max-height:200px;overflow-y:auto;">
					${nameOptionsHtml}
				</div>
				<div style="margin-bottom:8px;">
					<label style="font-size:12px;color:#ccc;display:block;margin-bottom:4px;">或输入自定义名称：</label>
					<input type="text" id="ttw-mm-custom-name" class="ttw-input" placeholder="留空则使用上面选择的名称" style="font-size:12px;">
				</div>

				<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;margin-top:16px;font-size:13px;">📂 目标分类</div>
				<select id="ttw-mm-target-category" style="width:100%;padding:8px;border:1px solid #555;border-radius:4px;background:#2d2d2d;color:#fff;font-size:13px;">
					${catOptionsHtml}
				</select>

				<div style="margin-top:16px;">
					<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;">
						<input type="checkbox" id="ttw-mm-dedup-keywords" checked style="accent-color:#9b59b6;">
						合并后关键词去重
					</label>
					<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;margin-top:6px;">
						<input type="checkbox" id="ttw-mm-add-separator" checked style="accent-color:#9b59b6;">
						内容间添加分隔线 (---)
					</label>
				</div>
			</div>

			<div style="flex:1;min-width:300px;">
				<div style="font-weight:bold;color:#3498db;margin-bottom:8px;font-size:13px;">📋 待合并条目详情</div>
				<div style="max-height:400px;overflow-y:auto;">
					${detailsHtml}
				</div>
			</div>
		</div>

		<div style="margin-top:16px;padding:12px;background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.3);border-radius:6px;">
			<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;font-size:13px;">🔮 合并预览</div>
			<div style="font-size:12px;color:#ccc;">
				<div style="margin-bottom:4px;"><span style="color:#9b59b6;">🔑 合并关键词 (${mergedKeywords.length}):</span> ${mergedKeywords.join(', ')}</div>
				<div style="margin-bottom:4px;"><span style="color:#f1c40f;">📊 合并后Token:</span> ~${estimateTokenCount(mergedKeywords.join(', ') + mergedContent)} tk</div>
				<div style="color:#888;font-size:11px;">💡 合并后建议使用「整理条目」功能让AI优化内容、去除重复</div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-mm-back">← 返回选择</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-mm-confirm">✅ 确认合并</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-mm-config-modal',
            title: `✋ 手动合并 - 配置 (${selectedEntries.length}个条目)`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '800px',
        });

        modal.querySelector('#ttw-mm-back').addEventListener('click', () => {
            ModalFactory.close(modal);
            showManualMergeUI(onMergeComplete);
        });

        modal.querySelector('#ttw-mm-confirm').addEventListener('click', async () => {
            const customName = modal.querySelector('#ttw-mm-custom-name').value.trim();
            const radioName = modal.querySelector('input[name="ttw-mm-main-name"]:checked')?.value;
            const mainName = customName || radioName || selectedEntries[0].name;
            const targetCategory = modal.querySelector('#ttw-mm-target-category').value;
            const dedupKeywords = modal.querySelector('#ttw-mm-dedup-keywords').checked;
            const addSeparator = modal.querySelector('#ttw-mm-add-separator').checked;

            const involvedStr = selectedEntries.map((e) => `[${e.category}] ${e.name}`).join('\n');
            if (
                !(await confirmAction(
                    `确定将以下 ${selectedEntries.length} 个条目合并为「${mainName}」？\n目标分类: ${targetCategory}\n\n${involvedStr}\n\n⚠️ 原条目将被删除！`,
                    { title: '确认手动合并', danger: true },
                ))
            )
                return;

            if (typeof saveWorldbookSnapshot === 'function') {
                await saveWorldbookSnapshot('快照-手动合并前');
            }
            const mergeResult = await workflow
                .commitPlannedMerge(
                    (planner) =>
                        planner.executeManualMerge(
                            selectedEntries,
                            mainName,
                            targetCategory,
                            dedupKeywords,
                            addSeparator,
                        ),
                    '手工合并',
                )
                .catch((error) => ({ success: false, error: error.message }));
            if (!mergeResult.success) {
                ErrorHandler.showUserError(mergeResult.error || '手动合并失败，未匹配到可合并的条目');
                return;
            }

            updateStreamContent(
                `\n✅ 手动合并完成: ${selectedEntries.length} 个条目 → [${targetCategory}] ${mainName}\n`,
            );
            if (typeof deps.setManualMergeHighlight === 'function') {
                deps.setManualMergeHighlight(targetCategory, mainName);
            }
            ModalFactory.close(modal);

            if (typeof onMergeComplete === 'function') onMergeComplete();
            ErrorHandler.showUserSuccess(
                `合并完成！${selectedEntries.length} 个条目已合并为「${mainName}」。\n\n建议使用「整理条目」功能让AI优化合并后的内容。`,
            );
        });
    }

    return { showManualMergeUI };
}

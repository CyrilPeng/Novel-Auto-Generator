import { executeRun, stopRun } from '../core/runContext.js';
import { clearProcessingStop } from '../../src/shared/tasks/lifecycle.js';

export function createMergeAliasView(deps = {}) {
    const {
        AppState,
        ErrorHandler,
        ModalFactory,
        confirmAction,
        escapeHtml,
        buildAliasCategorySelectModal,
        buildAliasGroupsListHtml,
        buildAliasPairResultsHtml,
        buildAliasMergePlanHtml,
        handleStopProcessing,
        saveWorldbookSnapshot,
        updateStreamContent,
        updateWorldbookPreview,
        workflow,
    } = deps;
    const mergedService = workflow.getMergeService();

    async function handleAliasMergeConfirm(modal, aiResultByCategory) {
        const checkedBoxes = modal.querySelectorAll('.ttw-merge-group-cb:checked');
        if (checkedBoxes.length === 0) {
            ErrorHandler.showUserError('没有勾选任何合并组');
            return;
        }

        const checkedSelections = [...checkedBoxes].map((box) => ({
            category: box.getAttribute('data-category'),
            groupIndex: parseInt(box.getAttribute('data-group-index'), 10),
        }));
        const mergeByCategory = mergedService.collectAliasMergeGroups(checkedSelections, aiResultByCategory);

        const totalSelected = checkedBoxes.length;
        const categoryList = Object.keys(mergeByCategory)
            .map((c) => `${c}(${mergeByCategory[c].length}组)`)
            .join('、');
        if (
            !(await confirmAction(`确定合并选中的 ${totalSelected} 组条目？\n涉及分类: ${categoryList}`, {
                title: '批量合并重复条目',
                danger: true,
            }))
        )
            return;

        if (typeof saveWorldbookSnapshot === 'function') {
            await saveWorldbookSnapshot('快照-别名合并前');
        }
        const totalMerged = await workflow
            .commitPlannedMerge(
                (planner) => planner.executeAliasMergeByCategory(mergeByCategory, aiResultByCategory),
                '别名合并',
            )
            .catch((error) => {
                ErrorHandler.showUserError(error.message);
                return null;
            });
        if (totalMerged === null) return;

        updateWorldbookPreview();
        modal.remove();
        ErrorHandler.showUserSuccess(
            `合并完成！共合并了 ${totalMerged} 组条目。\n\n建议使用"整理条目"功能清理合并后的重复内容。`,
        );
    }

    async function showAliasMergeUI() {
        const availableCategories = Object.keys(AppState.worldbook.generated).filter((cat) => {
            const entries = AppState.worldbook.generated[cat];
            return entries && typeof entries === 'object' && Object.keys(entries).length >= 2;
        });

        if (availableCategories.length === 0) {
            ErrorHandler.showUserError('当前世界书中没有包含2个以上条目的分类，无法进行别名合并');
            return;
        }

        const selectedCategories = await new Promise((resolve) => {
            const existingModal = document.getElementById('ttw-alias-cat-modal');
            if (existingModal) existingModal.remove();

            const catListHtml = buildAliasCategorySelectModal(
                availableCategories,
                AppState.worldbook.generated,
                escapeHtml,
            );
            const bodyHtml = `
			<div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
				💡 请勾选需要让AI识别别名并合并的分类。将对每个选中的分类独立扫描重复条目。
			</div>
			<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
				<label style="font-size:12px;cursor:pointer;"><input type="checkbox" id="ttw-alias-cat-select-all"> 全选</label>
			</div>
			<div style="max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
				${catListHtml}
			</div>
		`;
            const footerHtml = `
			<button class="ttw-btn" id="ttw-alias-cat-cancel">取消</button>
			<button class="ttw-btn ttw-btn-primary" id="ttw-alias-cat-confirm">📍 开始扫描</button>
		`;

            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            const catModal = ModalFactory.create({
                id: 'ttw-alias-cat-modal',
                title: '🔗 别名合并 - 选择要扫描的分类',
                body: bodyHtml,
                footer: footerHtml,
                maxWidth: '500px',
                onClose: () => finish(null),
            });

            catModal.querySelector('#ttw-alias-cat-select-all').addEventListener('change', (e) => {
                catModal.querySelectorAll('.ttw-alias-cat-cb').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
            });

            catModal.querySelector('#ttw-alias-cat-cancel').addEventListener('click', () => {
                ModalFactory.close(catModal);
            });

            catModal.querySelector('#ttw-alias-cat-confirm').addEventListener('click', () => {
                const checked = [...catModal.querySelectorAll('.ttw-alias-cat-cb:checked')].map((cb) => cb.dataset.cat);
                finish(checked.length > 0 ? checked : null);
                ModalFactory.close(catModal);
            });
        });

        if (!selectedCategories || selectedCategories.length === 0) return;

        updateStreamContent('\n🔍 第一阶段：扫描疑似重复条目...\n');

        const allSuspectedByCategory = {};
        let totalGroups = 0;
        let totalPairs = 0;

        for (const cat of selectedCategories) {
            const suspected = mergedService.findPotentialDuplicates(cat);
            if (suspected.length > 0) {
                allSuspectedByCategory[cat] = suspected;
                totalGroups += suspected.length;
                for (const group of suspected) {
                    totalPairs += (group.length * (group.length - 1)) / 2;
                }
                updateStreamContent(`  [${cat}] 发现 ${suspected.length} 组疑似重复\n`);
            } else {
                updateStreamContent(`  [${cat}] 未发现重复\n`);
            }
        }

        if (totalGroups === 0) {
            ErrorHandler.showUserError('在所有选中的分类中未发现疑似重复条目');
            return;
        }

        updateStreamContent(`共发现 ${totalGroups} 组疑似重复，${totalPairs} 对需要判断\n`);

        const existingModal = document.getElementById('ttw-alias-modal');
        if (existingModal) existingModal.remove();

        const groupCategoryMap = [];
        const groupsHtml = buildAliasGroupsListHtml(
            allSuspectedByCategory,
            AppState.worldbook.generated,
            groupCategoryMap,
            escapeHtml,
        );

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 第一阶段：本地检测结果</div>
			<div style="font-size:13px;color:#ccc;">
				扫描了 <span style="color:#e67e22;font-weight:bold;">${selectedCategories.length}</span> 个分类，
				发现 <span style="color:#9b59b6;font-weight:bold;">${totalGroups}</span> 组疑似重复，
				共 <span style="color:#e67e22;font-weight:bold;">${totalPairs}</span> 对需要AI判断
			</div>
		</div>

		<div style="margin-bottom:16px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-weight:bold;">选择要发送给AI判断的组</span>
				<label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-alias" checked> 全选</label>
			</div>
			<div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
				${groupsHtml}
			</div>
		</div>

		<div style="margin-bottom:16px;padding:10px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:11px;color:#f39c12;">
			💡 <strong>两两判断模式</strong>：AI会对每一对条目分别判断是否相同，然后自动合并确认的结果。<br>
			例如：[A,B,C] 会拆成 (A,B) (A,C) (B,C) 三对分别判断，如果A=B且B=C，则A、B、C会被合并。
		</div>

		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:10px;">⚙️ 并发设置</div>
			<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
				<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
					<input type="checkbox" id="ttw-alias-parallel">
					<span>启用并发</span>
				</label>
				<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
					<span>配对数阈值:</span>
					<input type="number" id="ttw-alias-threshold" value="5" min="1" max="50" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;">
				</label>
			</div>
			<div style="font-size:11px;color:#888;margin-top:8px;">
				≥阈值的配对数单独发送，＜阈值的合并发送（合并到接近阈值数量）
			</div>
		</div>

		<div id="ttw-alias-result" style="display:none;margin-bottom:16px;">
			<div style="padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;margin-bottom:12px;">
				<div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;">🔍 配对判断结果</div>
				<div id="ttw-pair-results" style="max-height:150px;overflow-y:auto;"></div>
			</div>
			<div style="padding:12px;background:rgba(39,174,96,0.15);border-radius:8px;">
				<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;">📦 合并方案</div>
				<div id="ttw-merge-plan"></div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn ttw-btn-secondary" id="ttw-stop-alias" style="display:none;">⏸️ 停止</button>
		<button class="ttw-btn" id="ttw-cancel-alias">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-ai-verify-alias">🤖 AI两两判断</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-alias" style="display:none;">✅ 确认合并</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-alias-modal',
            onClose: () => {
                if (AppState.processing.run?.operation === 'verify') stopRun(AppState.processing);
            },
            title: '🔗 别名识别与合并 (两两判断模式)',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '750px',
        });

        let aiResultByCategory = {};

        modal.querySelector('#ttw-select-all-alias').addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-alias-group-cb').forEach((cb) => {
                cb.checked = e.target.checked;
            });
        });

        modal.querySelector('#ttw-cancel-alias').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-ai-verify-alias').addEventListener('click', async () => {
            const checkedCbs = [...modal.querySelectorAll('.ttw-alias-group-cb:checked')];
            if (checkedCbs.length === 0) {
                ErrorHandler.showUserError('请选择要判断的组');
                return;
            }

            const selectedByCategory = {};
            for (const cb of checkedCbs) {
                const cat = cb.dataset.category;
                const globalIdx = parseInt(cb.dataset.index, 10);
                const { localIndex } = groupCategoryMap[globalIdx];
                if (!selectedByCategory[cat]) selectedByCategory[cat] = [];
                selectedByCategory[cat].push(allSuspectedByCategory[cat][localIndex]);
            }

            const btn = modal.querySelector('#ttw-ai-verify-alias');
            const stopBtn = modal.querySelector('#ttw-stop-alias');
            btn.disabled = true;
            btn.textContent = '🔄 AI判断中...';
            stopBtn.style.display = 'inline-block';
            clearProcessingStop(AppState.processing);

            try {
                const useParallel =
                    modal.querySelector('#ttw-alias-parallel')?.checked ?? AppState.config.parallel.enabled;
                const threshold = parseInt(modal.querySelector('#ttw-alias-threshold')?.value, 10) || 5;

                updateStreamContent(
                    `\n🤖 第二阶段：两两配对判断...\n并发: ${useParallel ? '开启' : '关闭'}, 阈值: ${threshold}\n`,
                );

                aiResultByCategory = await executeRun(AppState.processing, 'verify', async (guard) => {
                    const results = {};
                    for (const cat of Object.keys(selectedByCategory)) {
                        updateStreamContent(`\n📂 处理分类「${cat}」...\n`);
                        results[cat] = await mergedService.verifyDuplicatesWithAI(
                            selectedByCategory[cat],
                            useParallel,
                            threshold,
                            cat,
                        );
                    }

                    guard.assert();
                    return results;
                });

                const resultDiv = modal.querySelector('#ttw-alias-result');
                const pairResultsDiv = modal.querySelector('#ttw-pair-results');
                const mergePlanDiv = modal.querySelector('#ttw-merge-plan');
                resultDiv.style.display = 'block';

                pairResultsDiv.innerHTML = buildAliasPairResultsHtml(aiResultByCategory, escapeHtml);

                const { html: mergePlanHtml, hasAnyMerge } = buildAliasMergePlanHtml(aiResultByCategory, escapeHtml);
                mergePlanDiv.innerHTML = mergePlanHtml;

                const selectAllMergeCb = mergePlanDiv.querySelector('#ttw-select-all-merge-groups');
                if (selectAllMergeCb) {
                    selectAllMergeCb.addEventListener('change', (e) => {
                        mergePlanDiv.querySelectorAll('.ttw-merge-group-cb').forEach((cb) => {
                            cb.checked = e.target.checked;
                        });
                    });
                }

                if (hasAnyMerge) {
                    modal.querySelector('#ttw-confirm-alias').style.display = 'inline-block';
                }
                btn.style.display = 'none';
                stopBtn.style.display = 'none';

                updateStreamContent('✅ AI判断完成\n');
            } catch (error) {
                ErrorHandler.handle(error, 'aliasMerge');
                updateStreamContent(`❌ AI判断失败: ${error.message}\n`);
                btn.disabled = false;
                btn.textContent = '🤖 AI两两判断';
                stopBtn.style.display = 'none';
            }
        });

        modal.querySelector('#ttw-stop-alias').addEventListener('click', () => {
            handleStopProcessing();
            modal.querySelector('#ttw-ai-verify-alias').disabled = false;
            modal.querySelector('#ttw-ai-verify-alias').textContent = '🤖 AI两两判断';
            modal.querySelector('#ttw-stop-alias').style.display = 'none';
        });

        modal.querySelector('#ttw-confirm-alias').addEventListener('click', async () => {
            await handleAliasMergeConfirm(modal, aiResultByCategory);
        });
    }

    return { showAliasMergeUI };
}

import { t } from '../core/i18n.js';
import { escapeHtmlForDisplay } from './renderer.js';
import { diffLines, diffStats, renderDiffHtml } from '../core/diff.js';

export function createHistoryView(deps = {}) {
    const { ModalFactory, MemoryHistoryDB, confirmAction, ErrorHandler } = deps;

    async function showHistoryView() {
        const existingModal = document.getElementById('ttw-history-modal');
        if (existingModal) existingModal.remove();

        let historyList = [];
        try {
            await MemoryHistoryDB.cleanDuplicateHistory();
            historyList = await MemoryHistoryDB.getAllHistory();
        } catch (e) {
            console.warn('[TTW] 历史记录加载失败:', e.message);
        }

        let listHtml =
            historyList.length === 0
                ? `<div style="text-align:center;color:#888;padding:10px;font-size:11px;">${t('historyView.empty')}</div>`
                : '';

        if (historyList.length > 0) {
            const sortedList = [...historyList].sort((a, b) => b.timestamp - a.timestamp);
            sortedList.forEach((history) => {
                const time = new Date(history.timestamp).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                });
                const changeCount = history.changedEntries?.length || 0;
                const shortTitle = (
                    history.memoryTitle || `${t('historyView.chapter', { index: history.memoryIndex + 1 })}`
                ).substring(0, 8);
                listHtml += `
			<div class="ttw-history-item" data-history-id="${history.id}">
				<div class="ttw-history-item-title" title="${escapeHtmlForDisplay(history.memoryTitle)}">${escapeHtmlForDisplay(shortTitle)}</div>
				<div class="ttw-history-item-time">${time}</div>
				<div class="ttw-history-item-info">${t('historyView.changeCount', { count: changeCount })}</div>
			</div>
			`;
            });
        }

        const bodyHtml = `
		<div class="ttw-history-container">
			<div class="ttw-history-left">${listHtml}</div>
			<div id="ttw-history-detail" class="ttw-history-right">
				<div style="text-align:center;color:#888;padding:20px;font-size:12px;">${t('historyView.click')}</div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn ttw-btn-warning" id="ttw-clear-history">${t('historyView.clear')}</button>
		<button class="ttw-btn" id="ttw-close-history">${t('historyView.close')}</button>
	`;

        const historyModal = ModalFactory.create({
            id: 'ttw-history-modal',
            title: t('historyView.title', { count: historyList.length }),
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
        });

        historyModal
            .querySelector('#ttw-close-history')
            .addEventListener('click', () => ModalFactory.close(historyModal));
        historyModal.querySelector('#ttw-clear-history').addEventListener('click', async () => {
            if (
                await confirmAction(t('historyView.confirmClear'), { title: t('historyView.clearTitle'), danger: true })
            ) {
                await MemoryHistoryDB.clearAllHistory();
                ModalFactory.close(historyModal);
                showHistoryView();
            }
        });

        historyModal.querySelectorAll('.ttw-history-item').forEach((item) => {
            item.addEventListener('click', async () => {
                const historyId = parseInt(item.dataset.historyId, 10);
                const history = await MemoryHistoryDB.getHistoryById(historyId);
                const detailContainer = historyModal.querySelector('#ttw-history-detail');

                historyModal.querySelectorAll('.ttw-history-item').forEach((i) => i.classList.remove('active'));
                item.classList.add('active');

                if (!history) {
                    detailContainer.innerHTML = `<div style="text-align:center;color:#e74c3c;padding:40px;">${t('historyView.notFound')}</div>`;
                    return;
                }

                const time = new Date(history.timestamp).toLocaleString('zh-CN');
                let html = `
			<div style="margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #444;">
				<h4 style="color:#e67e22;margin:0 0 10px;font-size:14px;">📝 ${escapeHtmlForDisplay(history.memoryTitle)}</h4>
				<div style="font-size:11px;color:#888;">${t('historyView.time', { time })}</div>
				<div style="margin-top:10px;"><button class="ttw-btn ttw-btn-small ttw-btn-warning ttw-history-rollback-btn" data-history-id="${historyId}">${t('historyView.rollback')}</button></div>
			</div>
			<div style="font-size:13px;font-weight:bold;color:#9b59b6;margin-bottom:10px;">${t('historyView.changes', { count: history.changedEntries?.length || 0 })}</div>
			`;

                if (history.changedEntries && history.changedEntries.length > 0) {
                    history.changedEntries.forEach((change, changeIdx) => {
                        const typeIcon = change.type === 'add' ? '➕' : change.type === 'modify' ? '✏️' : '❌';
                        const typeColor =
                            change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';

                        let diffHtml = '';
                        if (change.type === 'modify' && change.oldValue && change.newValue) {
                            const oldContent = String(change.oldValue['内容'] || change.oldValue.content || '');
                            const newContent = String(change.newValue['内容'] || change.newValue.content || '');
                            const hunks = diffLines(oldContent, newContent);
                            const stats = diffStats(hunks);
                            const changeSummary = `+${stats.added} / -${stats.removed}`;

                            const oldKw = Array.isArray(change.oldValue['关键词'])
                                ? change.oldValue['关键词'].join(', ')
                                : '';
                            const newKw = Array.isArray(change.newValue['关键词'])
                                ? change.newValue['关键词'].join(', ')
                                : '';
                            const kwChanged = oldKw !== newKw;

                            const contentId = `ttw-diff-${historyId}-${changeIdx}`;
                            diffHtml = `
                                <div style="margin-top:8px;">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                        <button class="ttw-btn ttw-btn-small ttw-toggle-diff-btn" data-target="${contentId}" style="font-size:10px;padding:2px 8px;">${t('historyView.diff', { summary: changeSummary })}</button>
                                        ${kwChanged ? `<span style="font-size:10px;color:#888;">${t('historyView.keywordChange', { old: escapeHtmlForDisplay(oldKw), new: escapeHtmlForDisplay(newKw) })}</span>` : ''}
                                    </div>
                                    <div id="${contentId}" style="display:none;">
                                        ${renderDiffHtml(hunks)}
                                    </div>
                                </div>
                            `;
                        } else if (change.type === 'add' && change.newValue) {
                            const newContent = String(change.newValue['内容'] || change.newValue.content || '');
                            const newKw = Array.isArray(change.newValue['关键词'])
                                ? change.newValue['关键词'].join(', ')
                                : '';
                            diffHtml = `
                                <div style="margin-top:8px;padding:8px;background:rgba(39,174,96,0.05);border-left:2px solid rgba(39,174,96,0.3);border-radius:4px;">
                                    ${newKw ? `<div style="color:#9b59b6;font-size:11px;margin-bottom:4px;">🔑 ${escapeHtmlForDisplay(newKw)}</div>` : ''}
                                    <pre style="color:#ccc;font-size:11px;white-space:pre-wrap;word-break:break-word;margin:0;max-height:200px;overflow:auto;">${escapeHtmlForDisplay(newContent)}</pre>
                                </div>
                            `;
                        } else if (change.type === 'delete' && change.oldValue) {
                            const oldContent = String(change.oldValue['内容'] || change.oldValue.content || '');
                            const oldKw = Array.isArray(change.oldValue['关键词'])
                                ? change.oldValue['关键词'].join(', ')
                                : '';
                            diffHtml = `
                                <div style="margin-top:8px;padding:8px;background:rgba(231,76,60,0.05);border-left:2px solid rgba(231,76,60,0.3);border-radius:4px;">
                                    ${oldKw ? `<div style="color:#9b59b6;font-size:11px;margin-bottom:4px;">🔑 ${escapeHtmlForDisplay(oldKw)}</div>` : ''}
                                    <pre style="color:#888;font-size:11px;white-space:pre-wrap;word-break:break-word;margin:0;max-height:200px;overflow:auto;text-decoration:line-through;">${escapeHtmlForDisplay(oldContent)}</pre>
                                </div>
                            `;
                        }

                        html += `<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;margin-bottom:6px;border-left:3px solid ${typeColor};font-size:12px;">
                            <span style="color:${typeColor};">${typeIcon}</span>
                            <span style="color:#e67e22;margin-left:6px;">[${escapeHtmlForDisplay(change.category)}] ${escapeHtmlForDisplay(change.entryName)}</span>
                            ${diffHtml}
                        </div>`;
                    });
                } else {
                    html += `<div style="color:#888;text-align:center;padding:20px;font-size:12px;">${t('historyView.noChanges')}</div>`;
                }

                detailContainer.innerHTML = html;
                detailContainer.querySelector('.ttw-history-rollback-btn')?.addEventListener('click', async () => {
                    await rollbackToHistory(historyId);
                });
                // Toggle diff expand/collapse
                detailContainer.querySelectorAll('.ttw-toggle-diff-btn').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const targetId = btn.dataset.target;
                        const target = detailContainer.querySelector(`#${targetId}`);
                        if (!target) return;
                        const isOpen = target.style.display !== 'none';
                        target.style.display = isOpen ? 'none' : 'block';
                        btn.textContent = btn.textContent.replace(isOpen ? '▼' : '▶', isOpen ? '▶' : '▼');
                    });
                });
            });
        });
    }

    async function rollbackToHistory(historyId) {
        if (
            !(await confirmAction(t('historyView.confirmRollback'), {
                title: t('historyView.rollbackTitle'),
                danger: true,
            }))
        )
            return;

        try {
            await MemoryHistoryDB.rollbackToHistory(historyId);
            ErrorHandler.showUserSuccess(t('historyView.rollbackSuccess'));
            location.reload();
        } catch (error) {
            ErrorHandler.showUserError(t('historyView.rollbackError', { message: error.message }));
        }
    }

    return {
        showHistoryView,
        rollbackToHistory,
    };
}

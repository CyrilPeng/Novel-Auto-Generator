import { escapeHtmlForDisplay } from './renderer.js';

export function createHistoryView(deps = {}) {
    const {
        AppState,
        ModalFactory,
        MemoryHistoryDB,
        confirmAction,
        ErrorHandler,
    } = deps;

    async function showHistoryView() {
        const existingModal = document.getElementById('ttw-history-modal');
        if (existingModal) existingModal.remove();

        let historyList = [];
        try {
            await MemoryHistoryDB.cleanDuplicateHistory();
            historyList = await MemoryHistoryDB.getAllHistory();
        } catch (e) {}

        let listHtml = historyList.length === 0
            ? '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无历史</div>'
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
                const shortTitle = (history.memoryTitle || `第${history.memoryIndex + 1}章`).substring(0, 8);
                listHtml += `
			<div class="ttw-history-item" data-history-id="${history.id}">
				<div class="ttw-history-item-title" title="${escapeHtmlForDisplay(history.memoryTitle)}">${escapeHtmlForDisplay(shortTitle)}</div>
				<div class="ttw-history-item-time">${time}</div>
				<div class="ttw-history-item-info">${changeCount}项</div>
			</div>
			`;
            });
        }

        const bodyHtml = `
		<div class="ttw-history-container">
			<div class="ttw-history-left">${listHtml}</div>
			<div id="ttw-history-detail" class="ttw-history-right">
				<div style="text-align:center;color:#888;padding:20px;font-size:12px;">👈 点击左侧查看详情</div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn ttw-btn-warning" id="ttw-clear-history">🗑️ 清空历史</button>
		<button class="ttw-btn" id="ttw-close-history">关闭</button>
	`;

        const historyModal = ModalFactory.create({
            id: 'ttw-history-modal',
            title: `📜 修改历史 (${historyList.length}条)`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
        });

        historyModal.querySelector('#ttw-close-history').addEventListener('click', () => ModalFactory.close(historyModal));
        historyModal.querySelector('#ttw-clear-history').addEventListener('click', async () => {
            if (await confirmAction('确定清空所有历史记录？', { title: '清空历史记录', danger: true })) {
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
                    detailContainer.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:40px;">找不到记录</div>';
                    return;
                }

                const time = new Date(history.timestamp).toLocaleString('zh-CN');
                let html = `
			<div style="margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #444;">
				<h4 style="color:#e67e22;margin:0 0 10px;font-size:14px;">📝 ${escapeHtmlForDisplay(history.memoryTitle)}</h4>
				<div style="font-size:11px;color:#888;">时间: ${time}</div>
				<div style="margin-top:10px;"><button class="ttw-btn ttw-btn-small ttw-btn-warning ttw-history-rollback-btn" data-history-id="${historyId}">⏪ 回退到此版本前</button></div>
			</div>
			<div style="font-size:13px;font-weight:bold;color:#9b59b6;margin-bottom:10px;">变更 (${history.changedEntries?.length || 0}项)</div>
			`;

                if (history.changedEntries && history.changedEntries.length > 0) {
                    history.changedEntries.forEach((change) => {
                        const typeIcon = change.type === 'add' ? '➕' : change.type === 'modify' ? '✏️' : '❌';
                        const typeColor = change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';
                        html += `<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;margin-bottom:6px;border-left:3px solid ${typeColor};font-size:12px;">
						<span style="color:${typeColor};">${typeIcon}</span>
						<span style="color:#e67e22;margin-left:6px;">[${escapeHtmlForDisplay(change.category)}] ${escapeHtmlForDisplay(change.entryName)}</span>
					</div>`;
                    });
                } else {
                    html += '<div style="color:#888;text-align:center;padding:20px;font-size:12px;">无变更记录</div>';
                }

                detailContainer.innerHTML = html;
                detailContainer.querySelector('.ttw-history-rollback-btn')?.addEventListener('click', async () => {
                    await rollbackToHistory(historyId);
                });
            });
        });
    }

    async function rollbackToHistory(historyId) {
        if (!await confirmAction('确定回退到此版本？页面将刷新。', { title: '回退历史版本', danger: true })) return;

        try {
            const history = await MemoryHistoryDB.rollbackToHistory(historyId);
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                if (i < history.memoryIndex) {
                    AppState.memory.queue[i].processed = true;
                } else {
                    AppState.memory.queue[i].processed = false;
                    AppState.memory.queue[i].failed = false;
                }
            }
            await MemoryHistoryDB.saveState(history.memoryIndex);
            ErrorHandler.showUserSuccess('回退成功！页面将刷新。');
            location.reload();
        } catch (error) {
            ErrorHandler.showUserError('回退失败: ' + error.message);
        }
    }

    return {
        showHistoryView,
        rollbackToHistory,
    };
}

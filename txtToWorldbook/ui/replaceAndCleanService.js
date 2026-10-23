import { createTagOperations } from '../../src/worldbook/entries/cleanTags.js';
import { createEditCommand } from '../../src/worldbook/commands/edit.js';
export function createReplaceAndCleanService(deps = {}) {
    const { AppState, ModalFactory, ErrorHandler, confirmAction, updateWorldbookPreview } = deps;

    const { parseTagNames, scanForTags } = createTagOperations(AppState);
    const edit = createEditCommand({ AppState, commitWorldbook: deps.commitWorldbook });

    function updateExecBtnCount(modal) {
        const execBtn = modal.querySelector('#ttw-execute-clean-tags');
        if (!execBtn) return;
        const checkedCount = modal.querySelectorAll('.ttw-clean-match-cb:checked').length;
        execBtn.textContent = `🗑️ 删除选中项 (${checkedCount})`;
    }

    function renderMatchList(container, matches) {
        let html = '';
        const CONTEXT_CHARS = 40;

        matches.forEach((m, idx) => {
            const locationStr =
                m.source === 'worldbook'
                    ? `世界书 / ${m.category} / ${m.entryName}`
                    : `记忆${m.memoryIndex + 1} / ${m.category} / ${m.entryName}`;

            const typeLabels = { full: '完整标签', 'close-only': '开头不闭合', 'open-only': '末尾不闭合' };
            const typeColors = { full: '#3498db', 'close-only': '#e67e22', 'open-only': '#9b59b6' };

            const beforeStart = Math.max(0, m.startInText - CONTEXT_CHARS);
            const beforeText = m.fullText.substring(beforeStart, m.startInText);
            const beforePrefix = beforeStart > 0 ? '...' : '';

            const deletedFull = m.matchedText;
            const deletedDisplay =
                deletedFull.length > 200
                    ? `${deletedFull.substring(0, 100)}\n... (${deletedFull.length}字) ...\n${deletedFull.substring(deletedFull.length - 80)}`
                    : deletedFull;

            const afterEnd = Math.min(m.fullText.length, m.endInText + CONTEXT_CHARS);
            const afterText = m.fullText.substring(m.endInText, afterEnd);
            const afterSuffix = afterEnd < m.fullText.length ? '...' : '';

            const escapedBefore = (beforePrefix + beforeText).replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');
            const escapedDeleted = deletedDisplay.replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');
            const escapedAfter = (afterText + afterSuffix).replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');

            html += `
                <div style="margin-bottom:10px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid ${typeColors[m.type] || '#888'};">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <input type="checkbox" class="ttw-clean-match-cb" data-index="${idx}" checked style="width:16px;height:16px;accent-color:#e74c3c;flex-shrink:0;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${locationStr}">${locationStr}</div>
                            <div style="font-size:10px;margin-top:2px;">
                                <span style="color:${typeColors[m.type]};font-weight:bold;">${typeLabels[m.type]}</span>
                                <span style="color:#888;margin-left:6px;"><${m.tag}> · ${m.matchedText.length}字</span>
                            </div>
                        </div>
                    </div>
                    <div style="font-family:monospace;font-size:11px;line-height:1.6;background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;word-break:break-all;overflow-x:auto;">
                        <span style="color:#888;">${escapedBefore}</span><span style="background:rgba(231,76,60,0.4);color:#ff6b6b;text-decoration:line-through;border:1px dashed #e74c3c;padding:1px 2px;border-radius:2px;">${escapedDeleted}</span><span style="color:#888;">${escapedAfter}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        container.querySelectorAll('.ttw-clean-match-cb').forEach((cb) => {
            cb.addEventListener('change', () => {
                const modal = container.closest('.ttw-modal-container');
                if (modal) updateExecBtnCount(modal);
            });
        });
    }

    function showCleanTagsModal() {
        const existingModal = document.getElementById('ttw-clean-tags-modal');
        if (existingModal) existingModal.remove();

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">
				纯本地处理，不调用AI，不消耗Token。<br>
				扫描后逐条列出匹配，可以单独确认或取消每一条删除。
			</div>
		</div>

		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;font-weight:bold;">要清除的标签名（每行一个）</label>
			<textarea id="ttw-clean-tags-input" rows="4" class="ttw-textarea-small" placeholder="每行一个标签名，例如：
thinking
tucao
tochao">thinking\ntucao\ntochao</textarea>
		</div>

		<div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;font-size:12px;">📋 匹配规则</div>
			<ul style="margin:0;padding-left:18px;font-size:11px;color:#ccc;line-height:1.8;">
				<li><code>&lt;tag&gt;内容&lt;/tag&gt;</code> → 移除标签和标签内的内容</li>
				<li>文本开头就是 <code>...内容&lt;/tag&gt;</code> → 移除开头到该结束标签</li>
				<li>文本末尾有 <code>&lt;tag&gt;内容...</code> 无闭合 → 移除该开始标签到末尾</li>
			</ul>
			<div style="font-size:11px;color:#f39c12;margin-top:6px;">⚠️ 每条匹配都会显示前后文字，请逐条确认再删除</div>
		</div>

		<div style="margin-bottom:16px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-clean-in-worldbook" checked>
				<span>扫描世界书</span>
			</label>
			<label class="ttw-checkbox-label" style="margin-top:8px;">
				<input type="checkbox" id="ttw-clean-in-results" checked>
				<span>扫描各章节处理结果</span>
			</label>
		</div>

		<div id="ttw-clean-tags-results" style="display:none;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
				<span id="ttw-clean-scan-summary" style="font-weight:bold;color:#27ae60;"></span>
				<div style="display:flex;gap:8px;">
					<button class="ttw-btn-tiny" id="ttw-clean-select-all">全选</button>
					<button class="ttw-btn-tiny" id="ttw-clean-deselect-all">全不选</button>
				</div>
			</div>
			<div id="ttw-clean-match-list" style="max-height:350px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;"></div>
		</div>`;

        const footerHtml = `
		<button class="ttw-btn ttw-btn-primary" id="ttw-scan-tags">🔍 扫描</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-execute-clean-tags" style="display:none;">🗑️ 删除选中项</button>
		<button class="ttw-btn" id="ttw-close-clean-tags">关闭</button>`;

        const modal = ModalFactory.create({
            id: 'ttw-clean-tags-modal',
            title: '🏷️ 清除标签内容（不消耗Token）',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '750px',
        });

        let scanResults = [];
        modal.querySelector('#ttw-close-clean-tags').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-scan-tags').addEventListener('click', () => {
            const tagNames = parseTagNames(modal.querySelector('#ttw-clean-tags-input').value);
            if (tagNames.length === 0) {
                ErrorHandler.showUserError('请输入至少一个标签名');
                return;
            }

            const inWorldbook = modal.querySelector('#ttw-clean-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-clean-in-results').checked;
            scanResults = scanForTags(tagNames, inWorldbook, inResults);

            const resultsDiv = modal.querySelector('#ttw-clean-tags-results');
            const summaryEl = modal.querySelector('#ttw-clean-scan-summary');
            const listEl = modal.querySelector('#ttw-clean-match-list');
            const execBtn = modal.querySelector('#ttw-execute-clean-tags');
            resultsDiv.style.display = 'block';

            if (scanResults.length === 0) {
                summaryEl.textContent = '未找到匹配的标签内容';
                summaryEl.style.color = '#888';
                listEl.innerHTML = '';
                execBtn.style.display = 'none';
                return;
            }

            summaryEl.textContent = `找到 ${scanResults.length} 处匹配`;
            summaryEl.style.color = '#27ae60';
            execBtn.style.display = 'inline-block';
            execBtn.textContent = `🗑️ 删除选中项 (${scanResults.length})`;

            renderMatchList(listEl, scanResults);
        });

        modal.querySelector('#ttw-clean-select-all').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-clean-match-cb').forEach((cb) => {
                cb.checked = true;
            });
            updateExecBtnCount(modal);
        });

        modal.querySelector('#ttw-clean-deselect-all').addEventListener('click', () => {
            modal.querySelectorAll('.ttw-clean-match-cb').forEach((cb) => {
                cb.checked = false;
            });
            updateExecBtnCount(modal);
        });

        modal.querySelector('#ttw-execute-clean-tags').addEventListener('click', async () => {
            const selectedIndices = [...modal.querySelectorAll('.ttw-clean-match-cb:checked')].map((cb) =>
                parseInt(cb.dataset.index, 10),
            );
            if (selectedIndices.length === 0) {
                ErrorHandler.showUserError('请至少选择一项');
                return;
            }

            const confirmed = await confirmAction(
                `确定要删除选中的 ${selectedIndices.length} 处标签内容吗？\n\n请确认预览无误！此操作不可撤销！`,
                { title: '删除标签内容', danger: true },
            );
            if (!confirmed) return;

            const toDelete = selectedIndices.map((i) => scanResults[i]).filter(Boolean);
            const deletedCount = await edit(
                (draft) => createTagOperations(draft).deleteMatches(toDelete),
                '清除标签',
            ).catch((error) => {
                ErrorHandler.showUserError(error.message);
                return null;
            });
            if (deletedCount === null) return;

            ModalFactory.close(modal);
            if (typeof updateWorldbookPreview === 'function') updateWorldbookPreview();
            ErrorHandler.showUserSuccess(`清除完成！共删除 ${deletedCount} 处标签内容`);
        });
    }

    return {
        showCleanTagsModal,
    };
}

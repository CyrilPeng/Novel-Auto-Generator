import { createReplaceOperations } from '../../src/worldbook/entries/replace.js';
import { createEditCommand } from '../../src/worldbook/commands/edit.js';
import { escapeHtmlForDisplay, highlightEscapedText } from './renderer.js';

export function createReplaceModal(deps = {}) {
    const { AppState, ModalFactory, ErrorHandler, confirmAction, updateWorldbookPreview, saveWorldbookSnapshot } = deps;

    const { previewReplace } = createReplaceOperations(AppState);
    const edit = createEditCommand({ AppState, commitWorldbook: deps.commitWorldbook });
    const executeSingleReplace = (...args) =>
        edit((draft) => createReplaceOperations(draft).executeSingleReplace(...args), '替换单项');
    const executeReplace = (...args) =>
        edit((draft) => createReplaceOperations(draft).executeReplace(...args), '批量替换');

    function showReplaceModal() {
        const existingModal = document.getElementById('ttw-replace-modal');
        if (existingModal) existingModal.remove();

        const bodyHtml = `
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">查找内容</label>
			<input type="text" id="ttw-replace-find" class="ttw-input" placeholder="输入要查找的词语...">
		</div>
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">替换为（留空则删除该词语）</label>
			<input type="text" id="ttw-replace-with" class="ttw-input" placeholder="输入替换内容，留空则删除...">
		</div>
		<div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-replace-in-worldbook" checked>
				<span>替换世界书中的内容</span>
			</label>
			<label class="ttw-checkbox-label" style="margin-top:8px;">
				<input type="checkbox" id="ttw-replace-in-results" checked>
				<span>替换各章节处理结果中的内容</span>
			</label>
		</div>
		<div id="ttw-replace-preview" style="display:none;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-preview-replace">👁️ 预览</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-do-replace">🔄 执行替换</button>
		<button class="ttw-btn" id="ttw-close-replace">关闭</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-replace-modal',
            title: '🔄 批量替换',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '600px',
        });

        modal.querySelector('#ttw-close-replace').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-preview-replace').addEventListener('click', () => {
            const findText = modal.querySelector('#ttw-replace-find').value;
            const replaceWith = modal.querySelector('#ttw-replace-with').value;
            const inWorldbook = modal.querySelector('#ttw-replace-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-replace-in-results').checked;

            if (!findText) {
                ErrorHandler.showUserError('请输入要查找的内容');
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            const previewDiv = modal.querySelector('#ttw-replace-preview');
            previewDiv.style.display = 'block';
            previewDiv.style.maxHeight = '350px';

            if (preview.count === 0) {
                previewDiv.innerHTML = `<div style="color:#888;text-align:center;padding:20px;">未找到"${escapeHtmlForDisplay(findText)}"</div>`;
            } else {
                const highlightText = (text) => highlightEscapedText(text, findText);

                const itemsHtml = preview.allMatches
                    .map(
                        (match, idx) => `
                    <div class="ttw-replace-item" data-index="${idx}" style="font-size:11px;margin-bottom:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;border-left:3px solid #e67e22;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <div style="color:#888;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtmlForDisplay(match.location)}">${escapeHtmlForDisplay(match.locationShort)}</div>
                            <button class="ttw-btn-tiny ttw-replace-single-btn" data-index="${idx}" style="background:rgba(230,126,34,0.5);flex-shrink:0;margin-left:8px;">替换此项</button>
                        </div>
                        <div style="color:#e74c3c;text-decoration:line-through;word-break:break-all;margin-bottom:4px;">${highlightText(match.before)}</div>
                        <div style="color:#27ae60;word-break:break-all;">${escapeHtmlForDisplay(match.after)}</div>
                    </div>
                `,
                    )
                    .join('');

                previewDiv.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #444;">
                        <span style="color:#27ae60;font-weight:bold;">找到 ${preview.allMatches.length} 处匹配</span>
                        <span style="color:#888;font-size:11px;">点击"替换此项"可单独替换</span>
                    </div>
                    <div style="max-height:280px;overflow-y:auto;">
                        ${itemsHtml}
                    </div>
                `;

                previewDiv.querySelectorAll('.ttw-replace-single-btn').forEach((btn) => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const matchIndex = parseInt(btn.dataset.index, 10);
                        const matchInfo = preview.allMatches[matchIndex];
                        if (!matchInfo) return;

                        const action = replaceWith ? `替换为"${replaceWith}"` : '删除';
                        if (
                            !(await confirmAction(
                                `确定要${action}此处的"${findText}"吗？\n\n位置: ${matchInfo.location}`,
                                { title: '替换单项', danger: true },
                            ))
                        )
                            return;

                        const success = await executeSingleReplace(findText, replaceWith, matchInfo).catch((error) => {
                            ErrorHandler.showUserError(error.message);
                            return false;
                        });
                        if (success) {
                            const itemDiv = btn.closest('.ttw-replace-item');
                            if (itemDiv) {
                                itemDiv.style.opacity = '0.3';
                                itemDiv.style.pointerEvents = 'none';
                                btn.textContent = '✓ 已替换';
                                btn.disabled = true;
                            }
                            updateWorldbookPreview();
                        } else {
                            ErrorHandler.showUserError('替换失败，可能条目已被修改');
                        }
                    });
                });
            }
        });

        modal.querySelector('#ttw-do-replace').addEventListener('click', async () => {
            const findText = modal.querySelector('#ttw-replace-find').value;
            const replaceWith = modal.querySelector('#ttw-replace-with').value;
            const inWorldbook = modal.querySelector('#ttw-replace-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-replace-in-results').checked;

            if (!findText) {
                ErrorHandler.showUserError('请输入要查找的内容');
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            if (preview.count === 0) {
                ErrorHandler.showUserError(`未找到"${findText}"`);
                return;
            }

            const action = replaceWith ? `替换为"${replaceWith}"` : '删除';
            if (
                !(await confirmAction(`确定要${action} ${preview.count} 处"${findText}"吗？\n\n此操作不可撤销！`, {
                    title: '批量替换',
                    danger: true,
                }))
            ) {
                return;
            }

            if (typeof saveWorldbookSnapshot === 'function') {
                await saveWorldbookSnapshot('快照-批量替换前');
            }
            const result = await executeReplace(findText, replaceWith, inWorldbook, inResults).catch((error) => {
                ErrorHandler.showUserError(error.message);
                return null;
            });
            if (!result) return;
            updateWorldbookPreview();

            const previewDiv = modal.querySelector('#ttw-replace-preview');
            previewDiv.style.display = 'block';
            previewDiv.innerHTML = `
                <div style="text-align:center;padding:20px;">
                    <div style="color:#27ae60;font-weight:bold;font-size:14px;margin-bottom:8px;">✅ 替换完成！共替换了 ${result.count} 处</div>
                    <div style="color:#888;font-size:12px;">可继续输入新的查找/替换内容</div>
                </div>
            `;
        });
    }

    return {
        previewReplace,
        executeSingleReplace,
        executeReplace,
        showReplaceModal,
    };
}

import { t } from '../core/i18n.js';
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
			<label style="display:block;margin-bottom:8px;font-size:13px;">${t('replaceView.findLabel')}</label>
			<input type="text" id="ttw-replace-find" class="ttw-input" placeholder="${t('replaceView.findPlaceholder')}">
		</div>
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">${t('replaceView.replaceLabel')}</label>
			<input type="text" id="ttw-replace-with" class="ttw-input" placeholder="${t('replaceView.replacePlaceholder')}">
		</div>
		<div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-replace-in-worldbook" checked>
				<span>${t('replaceView.worldbook')}</span>
			</label>
			<label class="ttw-checkbox-label" style="margin-top:8px;">
				<input type="checkbox" id="ttw-replace-in-results" checked>
				<span>${t('replaceView.memories')}</span>
			</label>
		</div>
		<div id="ttw-replace-preview" style="display:none;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-preview-replace">${t('replaceView.preview')}</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-do-replace">${t('replaceView.execute')}</button>
		<button class="ttw-btn" id="ttw-close-replace">${t('replaceView.close')}</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-replace-modal',
            title: t('replaceView.title'),
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
                ErrorHandler.showUserError(t('replaceView.enterFind'));
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            const previewDiv = modal.querySelector('#ttw-replace-preview');
            previewDiv.style.display = 'block';
            previewDiv.style.maxHeight = '350px';

            if (preview.count === 0) {
                previewDiv.innerHTML = `<div style="color:#888;text-align:center;padding:20px;">${t('replaceView.notFound', { text: escapeHtmlForDisplay(findText) })}</div>`;
            } else {
                const highlightText = (text) => highlightEscapedText(text, findText);

                const itemsHtml = preview.allMatches
                    .map(
                        (match, idx) => `
                    <div class="ttw-replace-item" data-index="${idx}" style="font-size:11px;margin-bottom:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;border-left:3px solid #e67e22;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <div style="color:#888;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtmlForDisplay(match.location)}">${escapeHtmlForDisplay(match.locationShort)}</div>
                            <button class="ttw-btn-tiny ttw-replace-single-btn" data-index="${idx}" style="background:rgba(230,126,34,0.5);flex-shrink:0;margin-left:8px;">${t('replaceView.replaceItem')}</button>
                        </div>
                        <div style="color:#e74c3c;text-decoration:line-through;word-break:break-all;margin-bottom:4px;">${highlightText(match.before)}</div>
                        <div style="color:#27ae60;word-break:break-all;">${escapeHtmlForDisplay(match.after)}</div>
                    </div>
                `,
                    )
                    .join('');

                previewDiv.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #444;">
                        <span style="color:#27ae60;font-weight:bold;">${t('replaceView.foundCount', { count: preview.allMatches.length })}</span>
                        <span style="color:#888;font-size:11px;">${t('replaceView.clickToReplace')}</span>
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

                        const action = replaceWith
                            ? t('replaceView.replaceWithAction', { text: replaceWith })
                            : t('replaceView.deleteAction');
                        if (
                            !(await confirmAction(
                                t('replaceView.confirmSingle', {
                                    action,
                                    text: findText,
                                    location: matchInfo.location,
                                }),
                                { title: t('replaceView.singleTitle'), danger: true },
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
                                btn.textContent = t('replaceView.replaced');
                                btn.disabled = true;
                            }
                            updateWorldbookPreview();
                        } else {
                            ErrorHandler.showUserError(t('replaceView.failed'));
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
                ErrorHandler.showUserError(t('replaceView.enterFind'));
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            if (preview.count === 0) {
                ErrorHandler.showUserError(t('replaceView.notFound', { text: findText }));
                return;
            }

            const action = replaceWith
                ? t('replaceView.replaceWithAction', { text: replaceWith })
                : t('replaceView.deleteAction');
            if (
                !(await confirmAction(t('replaceView.confirmBatch', { action, count: preview.count, text: findText }), {
                    title: t('replaceView.batchTitle'),
                    danger: true,
                }))
            ) {
                return;
            }

            if (typeof saveWorldbookSnapshot === 'function') {
                await saveWorldbookSnapshot(t('replaceView.snapshot'));
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
                    <div style="color:#27ae60;font-weight:bold;font-size:14px;margin-bottom:8px;">${t('replaceView.done', { count: result.count })}</div>
                    <div style="color:#888;font-size:12px;">${t('replaceView.continueInput')}</div>
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

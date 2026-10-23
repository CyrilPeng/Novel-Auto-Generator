import { t } from '../core/i18n.js';
import { escapeHtmlForDisplay, escapeAttrForDisplay } from './renderer.js';

export function createDefaultEntriesView(deps = {}) {
    const { AppState, ListRenderer, PerfUtils, EventDelegate, ModalFactory, ErrorHandler, saveCurrentSettings } = deps;

    function saveDefaultWorldbookEntriesUI() {
        AppState.settings.defaultWorldbookEntriesUI = AppState.persistent.defaultEntries;
        saveCurrentSettings();
    }

    function renderDefaultWorldbookEntriesUI() {
        const container = document.getElementById('ttw-default-entries-list');
        if (!container) return;

        if (AppState.persistent.defaultEntries.length === 0) {
            container.innerHTML = `<div style="text-align:center;color:#888;padding:10px;font-size:11px;">${t('configView.defaultEntries.empty')}</div>`;
            return;
        }

        const itemsHtml = AppState.persistent.defaultEntries
            .map(
                (entry, index) => `
            <div class="ttw-default-entry-item">
                <div class="ttw-default-entry-header">
                    <span class="ttw-default-entry-title">[${ListRenderer.escapeHtml(entry.category || t('configView.defaultEntries.uncategorized'))}] ${ListRenderer.escapeHtml(entry.name || t('configView.defaultEntries.untitled'))}</span>
                    <div class="ttw-default-entry-actions">
                        <button class="ttw-btn-tiny ttw-edit-default-entry" data-index="${index}" title="${t('configView.defaultEntries.edit')}">✏️</button>
                        <button class="ttw-btn-tiny ttw-delete-default-entry" data-index="${index}" title="${t('configView.defaultEntries.delete')}">🗑️</button>
                    </div>
                </div>
                <div class="ttw-default-entry-info">
                    <span style="color:#9b59b6;">${t('configView.defaultEntries.keywords')}</span> ${ListRenderer.escapeHtml((entry.keywords || []).join(', ') || t('configView.defaultEntries.none'))}
                </div>
            </div>
        `,
            )
            .join('');

        PerfUtils.smartUpdate(container, itemsHtml);

        if (!container.dataset.eventsBound) {
            EventDelegate.on(container, '.ttw-edit-default-entry', 'click', (e, btn) => {
                const index = parseInt(btn.dataset.index, 10);
                showEditDefaultEntryModal(index);
            });

            EventDelegate.on(container, '.ttw-delete-default-entry', 'click', async (e, btn) => {
                const index = parseInt(btn.dataset.index, 10);
                const confirmed = await ModalFactory.confirm({
                    title: t('configView.defaultEntries.deleteTitle'),
                    message: t('configView.defaultEntries.deleteMessage'),
                    danger: true,
                });
                if (confirmed) {
                    AppState.persistent.defaultEntries.splice(index, 1);
                    saveDefaultWorldbookEntriesUI();
                    renderDefaultWorldbookEntriesUI();
                }
            });
            container.dataset.eventsBound = 'true';
        }
    }

    function showAddDefaultEntryModal() {
        showEditDefaultEntryModal(null);
    }

    function showEditDefaultEntryModal(editIndex) {
        const isEdit = editIndex !== null;
        const entry = isEdit
            ? AppState.persistent.defaultEntries[editIndex]
            : {
                  category: '',
                  name: '',
                  keywords: [],
                  content: '',
                  position: 0,
                  depth: 4,
                  order: 100,
              };

        const body = `
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.categoryLabel')}</label>
                    <input type="text" id="ttw-default-entry-category" value="${escapeAttrForDisplay(entry.category)}" placeholder="如：角色、地点、系统" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.nameLabel')}</label>
                    <input type="text" id="ttw-default-entry-name" value="${escapeAttrForDisplay(entry.name)}" placeholder="条目名称" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.keywordsLabel')}</label>
                    <input type="text" id="ttw-default-entry-keywords" value="${escapeAttrForDisplay((entry.keywords || []).join(', '))}" placeholder="关键词1, 关键词2" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.contentLabel')}</label>
                    <textarea id="ttw-default-entry-content" rows="6" class="ttw-textarea-small" placeholder="条目内容...">${escapeHtmlForDisplay(entry.content || '')}</textarea>
                </div>
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.positionLabel')}</label>
                    <select id="ttw-default-entry-position" class="ttw-select">
                        <option value="0" ${(entry.position || 0) === 0 ? 'selected' : ''}>${t('configView.defaultEntries.beforeChar')}</option>
                        <option value="1" ${entry.position === 1 ? 'selected' : ''}>${t('configView.defaultEntries.afterChar')}</option>
                        <option value="2" ${entry.position === 2 ? 'selected' : ''}>${t('configView.defaultEntries.beforeAuthor')}</option>
                        <option value="3" ${entry.position === 3 ? 'selected' : ''}>${t('configView.defaultEntries.afterAuthor')}</option>
                        <option value="4" ${entry.position === 4 ? 'selected' : ''}>${t('configView.defaultEntries.customDepth')}</option>
                    </select>
                </div>
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.depthLabel')}</label>
                    <input type="number" id="ttw-default-entry-depth" class="ttw-input" value="${entry.depth || 4}" min="0" max="999">
                </div>
                <div class="ttw-form-group">
                    <label>${t('configView.defaultEntries.orderLabel')}</label>
                    <input type="number" id="ttw-default-entry-order" class="ttw-input" value="${entry.order || 100}" min="0" max="9999">
                </div>
        `;

        const footer = `
                <button class="ttw-btn" id="ttw-cancel-default-entry">${t('configView.defaultEntries.cancel')}</button>
                <button class="ttw-btn ttw-btn-primary" id="ttw-save-default-entry">${t('configView.defaultEntries.save')}</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-default-entry-modal',
            title: isEdit ? t('configView.defaultEntries.editTitle') : t('configView.defaultEntries.addTitle'),
            body,
            footer,
            width: '550px',
        });

        modal.querySelector('#ttw-cancel-default-entry').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-default-entry').addEventListener('click', () => {
            const category = document.getElementById('ttw-default-entry-category').value.trim();
            const name = document.getElementById('ttw-default-entry-name').value.trim();
            const keywordsStr = document.getElementById('ttw-default-entry-keywords').value.trim();
            const content = document.getElementById('ttw-default-entry-content').value;
            const position = parseInt(document.getElementById('ttw-default-entry-position').value, 10) || 0;
            const depth = parseInt(document.getElementById('ttw-default-entry-depth').value, 10) || 4;
            const order = parseInt(document.getElementById('ttw-default-entry-order').value, 10) || 100;

            if (!category) {
                ErrorHandler.showUserError(t('configView.defaultEntries.categoryRequired'));
                return;
            }
            if (!name) {
                ErrorHandler.showUserError(t('configView.defaultEntries.nameRequired'));
                return;
            }

            const keywords = keywordsStr
                ? keywordsStr
                      .split(/[,，]/)
                      .map((k) => k.trim())
                      .filter((k) => k)
                : [];
            const newEntry = { category, name, keywords, content, position, depth, order };

            if (isEdit) {
                AppState.persistent.defaultEntries[editIndex] = newEntry;
            } else {
                AppState.persistent.defaultEntries.push(newEntry);
            }

            saveDefaultWorldbookEntriesUI();
            renderDefaultWorldbookEntriesUI();
            ModalFactory.close(modal);
        });
    }

    return {
        renderDefaultWorldbookEntriesUI,
        showAddDefaultEntryModal,
        showEditDefaultEntryModal,
        saveDefaultWorldbookEntriesUI,
    };
}

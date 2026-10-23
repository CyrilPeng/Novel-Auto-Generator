import { t } from '../core/i18n.js';
import { escapeHtmlForDisplay, escapeAttrForDisplay } from './renderer.js';

export function createCategoryEditorModal(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        setCategoryDefaultConfig,
        saveCustomCategories,
        renderCategoriesList,
    } = deps;

    function showEditCategoryModal(editIndex) {
        const isEdit = editIndex !== null;
        const cat = isEdit
            ? AppState.persistent.customCategories[editIndex]
            : {
                  name: '',
                  enabled: true,
                  isBuiltin: false,
                  entryExample: '',
                  keywordsExample: [],
                  contentGuide: '',
                  defaultPosition: 0,
                  defaultDepth: 4,
                  defaultOrder: 100,
                  autoIncrementOrder: false,
              };

        const body = `
                    <div class="ttw-form-group">
                        <label>${t('configView.categoryEditor.nameLabel')}</label>
                        <input type="text" id="ttw-cat-name" value="${escapeAttrForDisplay(cat.name)}" placeholder="如：道具、玩法" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>${t('configView.categoryEditor.entryExampleLabel')}</label>
                        <input type="text" id="ttw-cat-entry-example" value="${escapeAttrForDisplay(cat.entryExample)}" placeholder="如：道具名称" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>${t('configView.categoryEditor.keywordsExampleLabel')}</label>
                        <input type="text" id="ttw-cat-keywords" value="${escapeAttrForDisplay(cat.keywordsExample.join(', '))}" placeholder="如：道具名, 别名" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>${t('configView.categoryEditor.contentGuideLabel')}</label>
                        <textarea id="ttw-cat-content-guide" rows="4" class="ttw-textarea-small" placeholder="描述AI应该提取哪些信息...">${escapeHtmlForDisplay(cat.contentGuide)}</textarea>
                    </div>

                    <div style="margin-top:16px;padding:12px;background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);border-radius:8px;">
                        <div style="font-weight:bold;color:#9b59b6;margin-bottom:12px;">${t('configView.categoryEditor.defaultConfigTitle')}</div>
                        <div class="ttw-form-group">
                            <label>${t('configView.categoryEditor.positionLabel')}</label>
                            <select id="ttw-cat-default-position" class="ttw-select">
                                <option value="0" ${(cat.defaultPosition || 0) === 0 ? 'selected' : ''}>${t('configView.categoryEditor.beforeChar')}</option>
                                <option value="1" ${cat.defaultPosition === 1 ? 'selected' : ''}>${t('configView.categoryEditor.afterChar')}</option>
                                <option value="2" ${cat.defaultPosition === 2 ? 'selected' : ''}>${t('configView.categoryEditor.beforeAuthor')}</option>
                                <option value="3" ${cat.defaultPosition === 3 ? 'selected' : ''}>${t('configView.categoryEditor.afterAuthor')}</option>
                                <option value="4" ${cat.defaultPosition === 4 ? 'selected' : ''}>${t('configView.categoryEditor.customDepth')}</option>
                            </select>
                        </div>
                        <div class="ttw-form-group">
                            <label>${t('configView.categoryEditor.depthLabel')}</label>
                            <input type="number" id="ttw-cat-default-depth" class="ttw-input" value="${cat.defaultDepth || 4}" min="0" max="999">
                        </div>
                        <div class="ttw-form-group">
                            <label>${t('configView.categoryEditor.orderLabel')}</label>
                            <input type="number" id="ttw-cat-default-order" class="ttw-input" value="${cat.defaultOrder || 100}" min="0" max="9999">
                        </div>
                        <div style="margin-top:10px;">
                            <label class="ttw-checkbox-label" style="padding:8px;background:rgba(39,174,96,0.15);border-radius:6px;">
                                <input type="checkbox" id="ttw-cat-auto-increment" ${cat.autoIncrementOrder ? 'checked' : ''}>
                                <div>
                                    <span style="color:#27ae60;font-weight:bold;">${t('configView.categoryEditor.autoIncrement')}</span>
                                    <div class="ttw-setting-hint">${t('configView.categoryEditor.autoIncrementHint')}</div>
                                </div>
                            </label>
                        </div>
                    </div>
        `;

        const footer = `
                    <button class="ttw-btn" id="ttw-cancel-cat">${t('configView.categoryEditor.cancel')}</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-save-cat">${t('configView.categoryEditor.save')}</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-category-modal',
            title: isEdit ? t('configView.categoryEditor.editTitle') : t('configView.categoryEditor.addTitle'),
            body,
            footer,
            width: '550px',
            maxHeight: '70vh',
        });

        modal.querySelector('#ttw-cancel-cat').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-cat').addEventListener('click', async () => {
            const name = document.getElementById('ttw-cat-name').value.trim();
            if (!name) {
                ErrorHandler.showUserError(t('configView.categoryEditor.nameRequired'));
                return;
            }

            const duplicateIndex = AppState.persistent.customCategories.findIndex(
                (c, i) => c.name === name && i !== editIndex,
            );
            if (duplicateIndex !== -1) {
                ErrorHandler.showUserError(t('configView.categoryEditor.nameExists'));
                return;
            }

            const entryExample = document.getElementById('ttw-cat-entry-example').value.trim();
            const keywordsStr = document.getElementById('ttw-cat-keywords').value.trim();
            const contentGuide = document.getElementById('ttw-cat-content-guide').value.trim();
            const defaultPosition = parseInt(document.getElementById('ttw-cat-default-position').value, 10) || 0;
            const defaultDepth = parseInt(document.getElementById('ttw-cat-default-depth').value, 10) || 4;
            const defaultOrder = parseInt(document.getElementById('ttw-cat-default-order').value, 10) || 100;
            const autoIncrementOrder = document.getElementById('ttw-cat-auto-increment').checked;

            const keywordsExample = keywordsStr
                ? keywordsStr
                      .split(/[,，]/)
                      .map((k) => k.trim())
                      .filter((k) => k)
                : [];

            const newCat = {
                name,
                enabled: isEdit ? cat.enabled : true,
                isBuiltin: isEdit ? cat.isBuiltin : false,
                entryExample: entryExample || `${name}名称`,
                keywordsExample: keywordsExample.length > 0 ? keywordsExample : [`${name}名`],
                contentGuide: contentGuide || `基于原文的${name}描述`,
                defaultPosition,
                defaultDepth,
                defaultOrder,
                autoIncrementOrder,
            };

            if (isEdit) {
                AppState.persistent.customCategories[editIndex] = newCat;
            } else {
                AppState.persistent.customCategories.push(newCat);
            }

            setCategoryDefaultConfig(name, {
                position: defaultPosition,
                depth: defaultDepth,
                order: defaultOrder,
                autoIncrementOrder,
            });

            await saveCustomCategories();
            renderCategoriesList();
            ModalFactory.close(modal);
        });
    }

    function showAddCategoryModal() {
        showEditCategoryModal(null);
    }

    return {
        showAddCategoryModal,
        showEditCategoryModal,
    };
}

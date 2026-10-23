import { t } from '../core/i18n.js';
export function createEntryConfigModals(deps = {}) {
    const {
        AppState,
        ModalFactory,
        ErrorHandler,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        saveCurrentSettings,
        saveCustomCategories,
        updateWorldbookPreview,
    } = deps;

    function showEntryConfigModal(category, entryName) {
        const existingModal = document.getElementById('ttw-entry-config-modal');
        if (existingModal) existingModal.remove();

        const config = getEntryConfig(category, entryName);

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">${t('configView.entryConfig.desc')}</div>
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.entryConfig.positionLabel')}</label>
			<select id="ttw-entry-position" class="ttw-select">
				<option value="0" ${config.position === 0 ? 'selected' : ''}>${t('configView.categoryEditor.beforeChar')}</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>${t('configView.categoryEditor.afterChar')}</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>${t('configView.categoryEditor.beforeAuthor')}</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>${t('configView.categoryEditor.afterAuthor')}</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>${t('configView.categoryEditor.customDepth')}</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.entryConfig.depthLabel')}</label>
			<input type="number" id="ttw-entry-depth" class="ttw-input" value="${config.depth}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.entryConfig.orderLabel')}</label>
			<input type="number" id="ttw-entry-order" class="ttw-input" value="${config.order}" min="0" max="9999">
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-entry-config">${t('configView.entryConfig.cancel')}</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-entry-config">${t('configView.entryConfig.save')}</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-entry-config-modal',
            title: t('configView.entryConfig.title', { name: entryName }),
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        modal.querySelector('#ttw-cancel-entry-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-entry-config').addEventListener('click', () => {
            const position = parseInt(modal.querySelector('#ttw-entry-position').value, 10);
            const depth = parseInt(modal.querySelector('#ttw-entry-depth').value, 10) || 4;
            const order = parseInt(modal.querySelector('#ttw-entry-order').value, 10) || 100;

            setEntryConfig(category, entryName, { position, depth, order });
            ModalFactory.close(modal);
            ErrorHandler.showUserSuccess(t('configView.entryConfig.saved'));
        });
    }

    function showPlotOutlineConfigModal() {
        const existingModal = document.getElementById('ttw-plot-config-modal');
        if (existingModal) existingModal.remove();

        const config = AppState.config.plotOutline;

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">${t('configView.plotConfig.desc')}</div>
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.plotConfig.positionLabel')}</label>
			<select id="ttw-plot-config-position" class="ttw-select">
				<option value="0" ${(config.position || 0) === 0 ? 'selected' : ''}>${t('configView.categoryEditor.beforeChar')}</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>${t('configView.categoryEditor.afterChar')}</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>${t('configView.categoryEditor.beforeAuthor')}</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>${t('configView.categoryEditor.afterAuthor')}</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>${t('configView.categoryEditor.customDepth')}</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.plotConfig.depthLabel')}</label>
			<input type="number" id="ttw-plot-config-depth" class="ttw-input" value="${config.depth || 4}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.plotConfig.orderLabel')}</label>
			<input type="number" id="ttw-plot-config-order" class="ttw-input" value="${config.order || 100}" min="0" max="9999">
		</div>

		<div style="margin-top:12px;">
			<label class="ttw-checkbox-label" style="padding:10px;background:rgba(39,174,96,0.15);border-radius:6px;">
				<input type="checkbox" id="ttw-plot-config-auto-increment" ${config.autoIncrementOrder ? 'checked' : ''}>
				<div>
					<span style="color:#27ae60;font-weight:bold;">${t('configView.plotConfig.autoIncrement')}</span>
					<div class="ttw-setting-hint">${t('configView.plotConfig.autoIncrementHint')}</div>
				</div>
			</label>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-plot-config">${t('configView.entryConfig.cancel')}</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-plot-config">${t('configView.entryConfig.save')}</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-plot-config-modal',
            title: t('configView.plotConfig.title'),
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        modal.querySelector('#ttw-cancel-plot-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-plot-config').addEventListener('click', () => {
            AppState.config.plotOutline = {
                position: parseInt(modal.querySelector('#ttw-plot-config-position').value, 10) || 0,
                depth: parseInt(modal.querySelector('#ttw-plot-config-depth').value, 10) || 4,
                order: parseInt(modal.querySelector('#ttw-plot-config-order').value, 10) || 100,
                autoIncrementOrder: modal.querySelector('#ttw-plot-config-auto-increment').checked,
            };

            setCategoryDefaultConfig('剧情大纲', AppState.config.plotOutline);
            saveCurrentSettings();
            ModalFactory.close(modal);
            ErrorHandler.showUserSuccess(t('configView.plotConfig.saved'));
        });
    }

    function showCategoryConfigModal(category) {
        const existingModal = document.getElementById('ttw-category-config-modal');
        if (existingModal) existingModal.remove();

        let config = AppState.config.categoryDefault[category];
        if (!config) {
            const catConfig = AppState.persistent.customCategories.find((c) => c.name === category);
            if (catConfig) {
                config = {
                    position: catConfig.defaultPosition || 0,
                    depth: catConfig.defaultDepth || 4,
                    order: catConfig.defaultOrder || 100,
                    autoIncrementOrder: catConfig.autoIncrementOrder || false,
                };
            } else {
                config = { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
            }
        }

        const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">${t('configView.categoryConfig.desc')}</div>
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.plotConfig.positionLabel')}</label>
			<select id="ttw-cat-position" class="ttw-select">
				<option value="0" ${(config.position || 0) === 0 ? 'selected' : ''}>${t('configView.categoryEditor.beforeChar')}</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>${t('configView.categoryEditor.afterChar')}</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>${t('configView.categoryEditor.beforeAuthor')}</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>${t('configView.categoryEditor.afterAuthor')}</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>${t('configView.categoryEditor.customDepth')}</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.categoryConfig.depthLabel')}</label>
			<input type="number" id="ttw-cat-depth" class="ttw-input" value="${config.depth || 4}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>${t('configView.plotConfig.orderLabel')}</label>
			<input type="number" id="ttw-cat-order" class="ttw-input" value="${config.order || 100}" min="0" max="9999">
		</div>

		<div style="margin-top:12px;">
			<label class="ttw-checkbox-label" style="padding:10px;background:rgba(39,174,96,0.15);border-radius:6px;">
				<input type="checkbox" id="ttw-cat-auto-increment" ${config.autoIncrementOrder ? 'checked' : ''}>
				<div>
					<span style="color:#27ae60;font-weight:bold;">${t('configView.plotConfig.autoIncrement')}</span>
					<div class="ttw-setting-hint">${t('configView.categoryConfig.autoIncrementHint')}</div>
				</div>
			</label>
		</div>

		<div style="margin-top:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-apply-to-existing">
				<span>${t('configView.categoryConfig.applyToExisting')}</span>
			</label>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-cat-config">${t('configView.entryConfig.cancel')}</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-cat-config">${t('configView.entryConfig.save')}</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-category-config-modal',
            title: t('configView.categoryConfig.title', { category }),
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '500px',
        });

        modal.querySelector('#ttw-cancel-cat-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-cat-config').addEventListener('click', () => {
            const position = parseInt(modal.querySelector('#ttw-cat-position').value, 10);
            const depth = parseInt(modal.querySelector('#ttw-cat-depth').value, 10) || 4;
            const order = parseInt(modal.querySelector('#ttw-cat-order').value, 10) || 100;
            const autoIncrementOrder = modal.querySelector('#ttw-cat-auto-increment').checked;
            const applyToExisting = modal.querySelector('#ttw-apply-to-existing').checked;

            setCategoryDefaultConfig(category, { position, depth, order, autoIncrementOrder });

            if (applyToExisting && AppState.worldbook.generated[category]) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    setEntryConfig(category, entryName, { position, depth, order });
                }
            }

            const catIndex = AppState.persistent.customCategories.findIndex((c) => c.name === category);
            if (catIndex !== -1) {
                AppState.persistent.customCategories[catIndex].defaultPosition = position;
                AppState.persistent.customCategories[catIndex].defaultDepth = depth;
                AppState.persistent.customCategories[catIndex].defaultOrder = order;
                AppState.persistent.customCategories[catIndex].autoIncrementOrder = autoIncrementOrder;
                saveCustomCategories();
            }

            ModalFactory.close(modal);
            if (typeof updateWorldbookPreview === 'function') updateWorldbookPreview();
            ErrorHandler.showUserSuccess(t('configView.entryConfig.saved'));
        });
    }

    return {
        showEntryConfigModal,
        showPlotOutlineConfigModal,
        showCategoryConfigModal,
    };
}

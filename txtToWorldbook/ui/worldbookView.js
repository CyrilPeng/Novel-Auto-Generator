export function createWorldbookView(deps = {}) {
    const {
        ListRenderer,
        naturalSortEntryNames,
        escapeHtmlForDisplay,
        escapeAttrForDisplay,
        EventDelegate,
        ModalFactory,
        getCategoryLightState,
        setCategoryLightState,
        getEntryConfig,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        getEntryTotalTokens,
        getTokenThreshold,
        setTokenThreshold,
        getManualMergeHighlight,
        setManualMergeHighlightState,
        getSearchKeyword,
        showCategoryConfigModal,
        showEntryConfigModal,
        showRerollEntryModal,
        getWorldbookToShow,
        getVolumeCount,
        isVolumeMode,
        showManualMergeUI,
        showBatchRerollModal,
    } = deps;

    function formatWorldbookAsCards(worldbook) {
        if (!worldbook || Object.keys(worldbook).length === 0) {
            return '<div style="text-align:center;color:#888;padding:20px;">暂无世界书数据</div>';
        }

        let html = '';
        let totalEntries = 0;
        let totalTokens = 0;
        let belowThresholdCount = 0;

        const visibleCategories = Object.keys(worldbook).filter((category) => {
            const entries = worldbook[category];
            return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
        });

        for (const category of visibleCategories) {
            const entries = worldbook[category];
            const entryNames = naturalSortEntryNames(Object.keys(entries));
            const entryCount = entryNames.length;
            totalEntries += entryCount;

            const safeCategoryText = escapeHtmlForDisplay(category);
            const safeCategoryAttr = escapeAttrForDisplay(category);
            const isGreen = getCategoryLightState(category);
            const lightClass = isGreen ? 'green' : 'blue';
            const lightIcon = isGreen ? '🟢' : '🔵';
            const lightTitle = isGreen ? '绿灯(触发式) - 点击切换为蓝灯' : '蓝灯(常驻) - 点击切换为绿灯';

            let categoryTokens = 0;
            const entriesHtml = entryNames.map((entryName) => {
                const entry = entries[entryName];
                const config = getEntryConfig(category, entryName);
                const autoIncrement = getCategoryAutoIncrement(category);
                const baseOrder = getCategoryBaseOrder(category);
                let displayOrder = config.order;
                if (autoIncrement) {
                    const entryIndex = entryNames.indexOf(entryName);
                    displayOrder = baseOrder + entryIndex;
                }

                const entryTokens = getEntryTotalTokens(entry);
                categoryTokens += entryTokens;

                const tokenThreshold = getTokenThreshold();
                const isBelowThreshold = tokenThreshold > 0 && entryTokens < tokenThreshold;
                if (isBelowThreshold) belowThresholdCount++;

                const mergeHighlight = getManualMergeHighlight();
                const isManualMergedHighlight = !!mergeHighlight
                    && mergeHighlight.category === category
                    && mergeHighlight.entryName === entryName;

                return ListRenderer.renderWorldbookEntry(category, entryName, entry, {
                    safeCategoryAttr,
                    config,
                    autoIncrement,
                    displayOrder,
                    entryTokens,
                    isBelowThreshold,
                    isManualMergedHighlight,
                    searchKeyword: getSearchKeyword(),
                });
            }).join('');

            totalTokens += categoryTokens;
            html += ListRenderer.renderWorldbookCategory({
                safeCategoryText,
                safeCategoryAttr,
                lightClass,
                lightIcon,
                lightTitle,
                entryCount,
                categoryTokens,
                entriesHtml,
            });
        }

        return ListRenderer.renderWorldbookSummary({
            categoryCount: visibleCategories.length,
            totalEntries,
            totalTokens,
            belowThresholdCount,
            tokenThreshold: getTokenThreshold(),
        }) + html;
    }

    function bindWorldbookCollapseEvents(container) {
        if (container.dataset.ttwWorldbookCollapseBound === 'true') return;
        container.dataset.ttwWorldbookCollapseBound = 'true';

        const toggleSection = (toggleEl) => {
            const contentEl = toggleEl?.nextElementSibling;
            if (!contentEl) return;
            contentEl.style.display = contentEl.style.display === 'none' ? 'block' : 'none';
        };

        EventDelegate.on(container, '.ttw-category-toggle', 'click', (e, toggleEl) => {
            if (e.target.closest('button')) return;
            toggleSection(toggleEl);
        });

        EventDelegate.on(container, '.ttw-entry-toggle', 'click', (e, toggleEl) => {
            if (e.target.closest('button')) return;
            toggleSection(toggleEl);
        });
    }

    function bindLightToggleEvents(container) {
        if (container.dataset.ttwLightToggleBound === 'true') return;
        container.dataset.ttwLightToggleBound = 'true';

        EventDelegate.on(container, '.ttw-light-toggle', 'click', (e, btn) => {
            e.stopPropagation();
            const category = btn.dataset.category;
            const currentState = getCategoryLightState(category);
            const newState = !currentState;
            setCategoryLightState(category, newState);

            btn.className = `ttw-light-toggle ${newState ? 'green' : 'blue'}`;
            btn.textContent = newState ? '🟢' : '🔵';
            btn.title = newState ? '绿灯(触发式) - 点击切换为蓝灯' : '蓝灯(常驻) - 点击切换为绿灯';
        });
    }

    function bindConfigButtonEvents(container) {
        if (container.dataset.ttwConfigBound === 'true') return;
        container.dataset.ttwConfigBound = 'true';

        EventDelegate.on(container, '.ttw-config-btn[data-category]:not([data-entry])', 'click', (e, btn) => {
            e.stopPropagation();
            showCategoryConfigModal(btn.dataset.category);
        });

        EventDelegate.on(container, '.ttw-entry-config-btn', 'click', (e, btn) => {
            e.stopPropagation();
            showEntryConfigModal(btn.dataset.category, btn.dataset.entry);
        });
    }

    function bindEntryRerollEvents(container) {
        if (container.dataset.ttwEntryRerollBound === 'true') return;
        container.dataset.ttwEntryRerollBound = 'true';

        EventDelegate.on(container, '.ttw-entry-reroll-btn', 'click', (e, btn) => {
            e.stopPropagation();
            const category = btn.dataset.category;
            const entryName = btn.dataset.entry;
            showRerollEntryModal(category, entryName, () => {
                updateWorldbookPreview();
                const viewModal = document.getElementById('ttw-worldbook-view-modal');
                if (viewModal) {
                    const bodyContainer = viewModal.querySelector('#ttw-worldbook-view-body');
                    if (bodyContainer) {
                        renderWorldbookToContainer(bodyContainer, getWorldbookToShow());
                    }
                }
            });
        });
    }

    function renderWorldbookToContainer(container, worldbook, options = {}) {
        if (!container) return;
        const { headerInfo = '' } = options;
        const html = `${headerInfo}${formatWorldbookAsCards(worldbook)}`;
        ListRenderer.updateContainer(container, html);
        bindLightToggleEvents(container);
        bindConfigButtonEvents(container);
        bindEntryRerollEvents(container);
        bindWorldbookCollapseEvents(container);
    }

    function showWorldbookView() {
        const existingModal = document.getElementById('ttw-worldbook-view-modal');
        if (existingModal) existingModal.remove();

        const worldbookToShow = getWorldbookToShow();
        const titleSuffix = isVolumeMode() ? ` (${getVolumeCount()}卷合并)` : '';

        const bodyHtml = `
            <div style="padding:10px 15px;background:#1a1a1a;border-bottom:1px solid #444;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:12px;color:#888;">🔍 Token阈值:</span>
                <input type="number" id="ttw-token-threshold-input" value="${getTokenThreshold()}" min="0" step="50" style="width:80px;padding:4px 8px;border-radius:4px;border:1px solid #555;background:#2d2d2d;color:#fff;font-size:12px;" placeholder="0">
                <button class="ttw-btn ttw-btn-small" id="ttw-apply-threshold">应用</button>
                <span style="font-size:11px;color:#666;">低于此值的条目将红色高亮（0=关闭）</span>
            </div>
            <div class="ttw-modal-body" id="ttw-worldbook-view-body">${formatWorldbookAsCards(worldbookToShow)}</div>
        `;

        const footerHtml = `
            <div style="font-size:11px;color:#888;margin-right:auto;">💡 点击⚙️配置，点击🎯单独重Roll条目，点击灯图标切换蓝/绿灯</div>
            <button class="ttw-btn ttw-btn-secondary" id="ttw-manual-merge-btn" title="手动选择条目进行合并（AI识别不到时使用）" style="white-space:nowrap;flex-shrink:0;">✋ 手动合并</button>
            <button class="ttw-btn ttw-btn-secondary" id="ttw-batch-reroll-btn" title="批量选择多个条目重Roll" style="white-space:nowrap;flex-shrink:0;">🎲 批量重Roll</button>
        `;

        const viewModal = ModalFactory.create({
            id: 'ttw-worldbook-view-modal',
            title: `📖 世界书详细视图${titleSuffix}`,
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
        });

        viewModal.querySelector('#ttw-manual-merge-btn').addEventListener('click', () => {
            showManualMergeUI(() => {
                const bodyContainer = viewModal.querySelector('#ttw-worldbook-view-body');
                renderWorldbookToContainer(bodyContainer, getWorldbookToShow());
            });
        });

        viewModal.querySelector('#ttw-batch-reroll-btn').addEventListener('click', () => {
            showBatchRerollModal(() => {
                const bodyContainer = viewModal.querySelector('#ttw-worldbook-view-body');
                renderWorldbookToContainer(bodyContainer, getWorldbookToShow());
            });
        });

        viewModal.querySelector('#ttw-apply-threshold').addEventListener('click', () => {
            const input = viewModal.querySelector('#ttw-token-threshold-input');
            setTokenThreshold(parseInt(input.value, 10) || 0);
            const bodyContainer = viewModal.querySelector('#ttw-worldbook-view-body');
            renderWorldbookToContainer(bodyContainer, getWorldbookToShow());
        });

        viewModal.querySelector('#ttw-token-threshold-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                viewModal.querySelector('#ttw-apply-threshold').click();
            }
        });

        renderWorldbookToContainer(viewModal.querySelector('#ttw-worldbook-view-body'), worldbookToShow);
    }

    function getWorldbookPreviewHeaderInfo() {
        if (isVolumeMode() && getVolumeCount() > 0) {
            return `<div style="margin-bottom:12px;padding:10px;background:rgba(155,89,182,0.2);border-radius:6px;font-size:12px;color:#bb86fc;">📦 分卷模式 | 共 ${getVolumeCount()} 卷</div>`;
        }
        return '';
    }

    function refreshWorldbookViewModal() {
        const viewModal = document.getElementById('ttw-worldbook-view-modal');
        if (!viewModal) return;
        const bodyContainer = viewModal.querySelector('#ttw-worldbook-view-body');
        if (!bodyContainer) return;
        renderWorldbookToContainer(bodyContainer, getWorldbookToShow());
    }

    function updateWorldbookPreview() {
        const container = document.getElementById('ttw-result-preview');
        renderWorldbookToContainer(container, getWorldbookToShow(), {
            headerInfo: getWorldbookPreviewHeaderInfo(),
        });
    }

    function setManualMergeHighlight(category, entryName) {
        setManualMergeHighlightState({ category, entryName, timestamp: Date.now() });
        updateWorldbookPreview();
        refreshWorldbookViewModal();
        setTimeout(() => {
            const current = getManualMergeHighlight();
            if (!current) return;
            if (current.category === category && current.entryName === entryName) {
                setManualMergeHighlightState(null);
                updateWorldbookPreview();
                refreshWorldbookViewModal();
            }
        }, 10000);
    }

    return {
        formatWorldbookAsCards,
        renderWorldbookToContainer,
        bindWorldbookCollapseEvents,
        bindLightToggleEvents,
        bindConfigButtonEvents,
        bindEntryRerollEvents,
        showWorldbookView,
        getWorldbookPreviewHeaderInfo,
        refreshWorldbookViewModal,
        updateWorldbookPreview,
        setManualMergeHighlight,
    };
}

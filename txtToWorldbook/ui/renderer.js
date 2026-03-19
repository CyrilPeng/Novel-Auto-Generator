function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

export function escapeHtmlForDisplay(value) {
    return escapeHtml(value);
}

export function escapeAttrForDisplay(value) {
    return escapeAttribute(value);
}

export function highlightEscapedText(text, keyword) {
    const safeText = escapeHtmlForDisplay(text);
    const safeKeyword = escapeHtmlForDisplay(keyword);
    if (!safeKeyword) return safeText;

    const metaChars = '.+*?^${}()|[]\\';
    let escapedRegex = '';
    for (const ch of safeKeyword) {
        escapedRegex += metaChars.includes(ch) ? `\\${ch}` : ch;
    }

    return safeText.replace(
        new RegExp(escapedRegex, 'g'),
        `<span style="background:#f1c40f;color:#000;padding:1px 2px;border-radius:2px;">${safeKeyword}</span>`
    );
}

export function formatEscapedMultilineContent(text, keyword = '', enableBold = true) {
    let formatted = highlightEscapedText(String(text || ''), keyword);
    if (enableBold) {
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#3498db;">$1</strong>');
    }
    return formatted.split(String.fromCharCode(10)).join('<br>');
}

export function createListRenderer(deps = {}) {
    const {
        smartUpdate,
        tokenCacheGet,
        estimateTokenCount,
        uiIcons,
        getEntryConfig,
        getCategoryAutoIncrement,
        getEntryTotalTokens,
    } = deps;

    return {
        renderItems(items, renderItem, options = {}) {
            const { emptyMessage = '暂无数据' } = options;
            if (!items || items.length === 0) {
                return `<div style="text-align:center;color:#888;padding:20px;">${emptyMessage}</div>`;
            }
            return items.map((item, index) => renderItem(item, index)).join('');
        },

        updateContainer(containerOrId, html) {
            const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
            if (container && typeof smartUpdate === 'function') {
                smartUpdate(container, html);
            }
        },

        renderMemoryItem(memory, index, context = {}) {
            const statusIcon = this.getStatusIcon(memory);
            const multiSelect = !!context.multiSelect;
            const selected = !!context.selected;
            const classes = ['ttw-memory-item'];
            if (multiSelect) classes.push('multi-select-mode');
            if (selected) classes.push('selected-for-delete');

            const styleParts = [];
            if (memory.processing) {
                styleParts.push('border-left:3px solid #3498db;background:rgba(52,152,219,0.15);');
            } else if (memory.processed && !memory.failed) {
                styleParts.push('opacity:0.6;');
            } else if (memory.failed) {
                styleParts.push('border-left:3px solid #e74c3c;');
            }

            const checkboxHtml = multiSelect
                ? `<input type="checkbox" class="ttw-memory-checkbox" data-index="${index}" ${selected ? 'checked' : ''} style="width:16px;height:16px;accent-color:#e74c3c;">`
                : '';
            const failedHtml = memory.failed ? '<small style="color:#e74c3c;font-size:11px;">错误</small>' : '';
            const titleText = context.useChapterLabel ? `第${index + 1}章` : this.escapeHtml(memory.title || `记忆 ${index + 1}`);
            const sizeText = context.useApproxK
                ? `${((memory.content || '').length / 1000).toFixed(1)}k`
                : `${typeof tokenCacheGet === 'function' ? tokenCacheGet(memory.content || '') : 0} tokens`;

            return `<div class="${classes.join(' ')}" data-index="${index}" style="${styleParts.join('')}">
                ${checkboxHtml}
                <span>${statusIcon}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${titleText}</span>
                <small style="font-size:11px;color:#888;">${sizeText}</small>
                ${failedHtml}
            </div>`;
        },

        renderMessageChainItem(msg, idx, chainLength, context = {}) {
            const roleColors = context.roleColors || { system: '#3498db', user: '#27ae60', assistant: '#f39c12' };
            const roleLabels = context.roleLabels || { system: '🔷 系统', user: '🟢 用户', assistant: '🟡 AI助手' };
            const borderColor = roleColors[msg.role] || '#888';
            const isEnabled = msg.enabled !== false;
            return `
                <div class="ttw-chain-msg-item" data-chain-index="${idx}" style="margin-bottom:8px;padding:10px;border-left:3px solid ${borderColor};background:rgba(0,0,0,0.2);border-radius:0 6px 6px 0;opacity:${isEnabled ? 1 : 0.5};">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                        <select class="ttw-chain-role" data-chain-index="${idx}" style="padding:4px 8px;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid ${borderColor};font-size:12px;cursor:pointer;">
                            <option value="system" ${msg.role === 'system' ? 'selected' : ''}>${roleLabels.system}</option>
                            <option value="user" ${msg.role === 'user' ? 'selected' : ''}>${roleLabels.user}</option>
                            <option value="assistant" ${msg.role === 'assistant' ? 'selected' : ''}>${roleLabels.assistant}</option>
                        </select>
                        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#aaa;cursor:pointer;">
                            <input type="checkbox" class="ttw-chain-enabled" data-chain-index="${idx}" ${isEnabled ? 'checked' : ''}> 启用
                        </label>
                        <div style="margin-left:auto;display:flex;gap:4px;">
                            ${idx > 0 ? `<button class="ttw-chain-move-up" data-chain-index="${idx}" style="background:none;border:1px solid #555;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;color:#aaa;" title="上移">⬆️</button>` : ''}
                            ${idx < chainLength - 1 ? `<button class="ttw-chain-move-down" data-chain-index="${idx}" style="background:none;border:1px solid #555;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;color:#aaa;" title="下移">⬇️</button>` : ''}
                            <button class="ttw-chain-delete" data-chain-index="${idx}" style="background:rgba(231,76,60,0.3);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;color:#e74c3c;" title="删除">🗑️</button>
                        </div>
                    </div>
                    <textarea class="ttw-chain-content ttw-textarea-small" data-chain-index="${idx}" rows="3" placeholder="消息内容。使用 {PROMPT} 作为原始提示词占位符" style="width:100%;box-sizing:border-box;font-size:12px;">${this.escapeHtml(msg.content || '')}</textarea>
                </div>`;
        },

        renderCategoryItem(cat, index, context = {}) {
            const hasDefault = !!context.hasDefault;
            return `
                <div class="ttw-category-item">
                    <input type="checkbox" class="ttw-category-cb" data-index="${index}" ${cat.enabled ? 'checked' : ''}>
                    <span class="ttw-category-name">${this.escapeHtml(cat.name)}${cat.isBuiltin ? ' <span style="color:#888;font-size:10px;">(内置)</span>' : ''}</span>
                    <div class="ttw-category-actions">
                        <button class="ttw-btn-tiny ttw-edit-cat" data-index="${index}" title="编辑">✏️</button>
                        <button class="ttw-btn-tiny ttw-reset-single-cat" data-index="${index}" title="重置此项" ${hasDefault ? '' : 'style="opacity:0.3;" disabled'}>🔄</button>
                        <button class="ttw-btn-tiny ttw-delete-cat" data-index="${index}" title="删除" ${cat.isBuiltin ? 'disabled style="opacity:0.3;"' : ''}>🗑️</button>
                    </div>
                </div>`;
        },

        renderWorldbookEntry(category, entryName, entry, context = {}) {
            const safeCategoryAttr = context.safeCategoryAttr || this.escapeAttribute(category);
            const safeEntryNameText = this.escapeHtml(entryName);
            const safeEntryNameAttr = this.escapeAttribute(entryName);
            const config = context.config || (typeof getEntryConfig === 'function' ? getEntryConfig(category, entryName) : {});
            const autoIncrement = context.autoIncrement ?? (typeof getCategoryAutoIncrement === 'function' ? getCategoryAutoIncrement(category) : false);
            const displayOrder = context.displayOrder ?? config.order;
            const entryTokens = context.entryTokens ?? (typeof getEntryTotalTokens === 'function' ? getEntryTotalTokens(entry) : 0);
            const isBelowThreshold = !!context.isBelowThreshold;
            const isManualMergedHighlight = !!context.isManualMergedHighlight;
            const warningIcon = isBelowThreshold ? '⚠️ ' : '';
            const highlightStyle = isBelowThreshold ? 'background:#7f1d1d;border-left:3px solid #ef4444;' : 'border-left:3px solid #3498db;';
            const tokenStyle = isBelowThreshold ? 'color:#ef4444;font-weight:bold;' : 'color:#f1c40f;';
            const mergedBadge = isManualMergedHighlight
                ? `<span style="font-size:10px;color:#f1c40f;background:rgba(241,196,15,0.2);border:1px solid rgba(241,196,15,0.45);padding:1px 6px;border-radius:999px;">✨ 新合并</span>`
                : '';
            const keywordSource = Array.isArray(entry?.['关键词']) ? entry['关键词'].join(', ') : (entry?.['关键词'] || '');
            const keywordTokens = keywordSource && typeof estimateTokenCount === 'function' ? estimateTokenCount(keywordSource) : 0;
            const contentSource = entry?.['内容'] || '';
            const contentTokens = contentSource && typeof estimateTokenCount === 'function' ? estimateTokenCount(contentSource) : 0;
            const keywordHtml = keywordSource ? `
                <div style="margin-bottom:8px;padding:8px;background:#252525;border-left:3px solid #9b59b6;border-radius:4px;">
                    <div style="color:#9b59b6;font-size:11px;margin-bottom:4px;display:flex;justify-content:space-between;">
                        <span>🔑 关键词</span>
                        <span style="color:#888;">~${keywordTokens} tk</span>
                    </div>
                    <div style="font-size:13px;">${highlightEscapedText(keywordSource, context.searchKeyword || '')}</div>
                </div>` : '';
            const contentHtml = contentSource ? `
                <div style="padding:8px;background:#252525;border-left:3px solid #27ae60;border-radius:4px;line-height:1.6;">
                    <div style="color:#27ae60;font-size:11px;margin-bottom:4px;display:flex;justify-content:space-between;">
                        <span>📝 内容</span>
                        <span style="color:#888;">~${contentTokens} tk</span>
                    </div>
                    <div style="font-size:13px;">${formatEscapedMultilineContent(contentSource, context.searchKeyword || '', true)}</div>
                </div>` : '';

            return `
                <div class="${isManualMergedHighlight ? 'ttw-entry-merged-highlight' : ''}" style="margin:8px;border:1px solid #555;border-radius:6px;overflow:hidden;">
                    <div class="ttw-entry-toggle" style="background:#3a3a3a;padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;${highlightStyle}">
                        <span style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${warningIcon}📄 ${safeEntryNameText}${mergedBadge}<button class="ttw-entry-config-btn ttw-config-btn" data-category="${safeCategoryAttr}" data-entry="${safeEntryNameAttr}" title="配置位置/深度/顺序">⚙️</button><button class="ttw-entry-reroll-btn" data-category="${safeCategoryAttr}" data-entry="${safeEntryNameAttr}" title="单独重Roll此条目" style="background:rgba(155,89,182,0.4);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px;color:#fff;">🎯</button></span>
                        <span style="font-size:9px;color:#888;display:flex;gap:4px;align-items:center;">
                            <span style="${tokenStyle}">${entryTokens}tk</span>
                            <span>D${config.depth}O${displayOrder}${autoIncrement ? '↗' : ''}</span>
                        </span>
                    </div>
                    <div style="display:none;background:#1c1c1c;padding:12px;">
                        ${keywordHtml}
                        ${contentHtml}
                    </div>
                </div>`;
        },

        renderWorldbookCategory(config) {
            return `<div style="margin-bottom:12px;border:1px solid #e67e22;border-radius:8px;overflow:hidden;">
                <div class="ttw-category-toggle" style="background:linear-gradient(135deg,#e67e22,#d35400);padding:10px 14px;cursor:pointer;font-weight:bold;display:flex;justify-content:space-between;align-items:center;">
                    <span style="display:flex;align-items:center;">📁 ${config.safeCategoryText}<button class="ttw-light-toggle ${config.lightClass}" data-category="${config.safeCategoryAttr}" title="${this.escapeAttribute(config.lightTitle)}">${config.lightIcon}</button><button class="ttw-config-btn" data-category="${config.safeCategoryAttr}" title="配置分类默认位置/深度">⚙️</button></span>
                    <span style="font-size:12px;">${config.entryCount} 条目 | <span style="color:#f1c40f;">~${config.categoryTokens} tk</span></span>
                </div>
                <div style="background:#2d2d2d;display:none;">${config.entriesHtml}</div>
            </div>`;
        },

        renderWorldbookSummary(stats) {
            const thresholdInfo = stats.tokenThreshold > 0
                ? ` | <span style="color:#ef4444;">⚠️ ${stats.belowThresholdCount}个条目低于${stats.tokenThreshold}tk</span>`
                : '';
            return `<div style="margin-bottom:12px;font-size:13px;">共 ${stats.categoryCount} 个分类, ${stats.totalEntries} 个条目 | <span style="color:#f1c40f;">总计 ~${stats.totalTokens} tk</span>${thresholdInfo}</div>`;
        },

        getStatusIcon(item) {
            if (item.processing) return uiIcons?.PROCESSING || '⏳';
            if (item.failed) return uiIcons?.FAILED || '❌';
            if (item.processed) return uiIcons?.SUCCESS || '✅';
            return '⏳';
        },

        highlightKeyword(text, keyword) {
            if (!keyword) return text;
            const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return text.replace(regex, '<mark style="background:yellow;">$1</mark>');
        },

        updateList(containerId, html) {
            this.updateContainer(containerId, html);
        },

        escapeHtml(text) {
            return escapeHtmlForDisplay(text);
        },

        escapeAttribute(text) {
            return escapeAttrForDisplay(text);
        },
    };
}

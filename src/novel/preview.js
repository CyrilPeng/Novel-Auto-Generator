import { applyTagFilters, extractTagContents, parseTagInput, removeTagContents } from './tagFilters.js';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.split('\n').join('<br>');
}

export function createNovelPreview({ getSTChat, getSettings, $ }) {
    function refreshPreview() {
        const stChat = getSTChat();
        const extractTags = parseTagInput(getSettings().extractTags);
        const excludeTags = parseTagInput(getSettings().excludeTags);
        const useTagExtract = getSettings().extractMode === 'tags' && extractTags.length > 0;
        const useTagExclude = excludeTags.length > 0;

        if (!stChat || stChat.length === 0) {
            $('#nag-preview-content').html(`<div class="nag-preview-warning"><b>⚠️ 无法获取聊天数据</b></div>`);
            return;
        }

        let rawContent = '',
            floor = -1;
        for (let i = stChat.length - 1; i >= 0; i--) {
            const msg = stChat[i];
            if (msg && !msg.is_user && !msg.is_human && msg.mes) {
                rawContent = msg.mes;
                floor = i;
                break;
            }
        }

        if (!rawContent) {
            $('#nag-preview-content').html('<i style="opacity:0.6">没有 AI 消息</i>');
            return;
        }

        const rawPreview = rawContent.substring(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let html = `
        <div class="nag-preview-source">楼层 ${floor} | 长度 ${rawContent.length} 字</div>
        <div class="nag-preview-raw">${rawPreview}${rawContent.length > 200 ? '...' : ''}</div>
    `;

        if (useTagExtract || useTagExclude) {
            let previewText = rawContent;
            if (useTagExtract) {
                previewText = extractTagContents(rawContent, extractTags, getSettings().tagSeparator);
                if (!previewText) {
                    html += `<div class="nag-preview-warning"><b>⚠️ 未找到标签</b> [${extractTags.join(', ')}]</div>`;
                    $('#nag-preview-content').html(html);
                    return;
                }
            }

            if (useTagExclude) {
                previewText = removeTagContents(previewText, excludeTags);
            } else {
                previewText = previewText.trim();
            }

            if (previewText) {
                const actions = [];
                if (useTagExtract) actions.push(`提取标签 [${extractTags.join(', ')}]`);
                if (useTagExclude) actions.push(`移除标签 [${excludeTags.join(', ')}]`);
                html += `<div class="nag-preview-success"><b>✅ ${actions.join(' + ')}</b> (${previewText.length} 字)<div class="nag-preview-text">${escapeHtml(previewText.slice(0, 400))}</div></div>`;
            } else {
                html += `<div class="nag-preview-warning"><b>⚠️ 移除标签后没有可预览内容</b></div>`;
            }
        } else {
            html += `<div class="nag-preview-info"><b>📄 全部内容模式</b></div>`;
        }

        $('#nag-preview-content').html(html);
    }

    function debugRawContent(floorIndex) {
        const stChat = getSTChat();
        if (!stChat) {
            console.log('❌ 无法获取 chat');
            return;
        }

        console.log(`✅ chat 获取成功，共 ${stChat.length} 条`);

        if (floorIndex === undefined) {
            for (let i = stChat.length - 1; i >= 0; i--) {
                if (stChat[i] && !stChat[i].is_user) {
                    floorIndex = i;
                    break;
                }
            }
        }

        const msg = stChat[floorIndex];
        if (!msg) {
            console.log(`楼层 ${floorIndex} 不存在`);
            return;
        }

        console.log(`\n----- 楼层 ${floorIndex} -----`);
        console.log('mes:', msg.mes?.substring(0, 500));

        const extractTags = parseTagInput(getSettings().extractTags);
        const excludeTags = parseTagInput(getSettings().excludeTags);
        if (extractTags.length > 0 || excludeTags.length > 0) {
            console.log(`\n----- 标签处理 -----`);
            if (extractTags.length > 0) {
                console.log(`提取标签: [${extractTags.join(', ')}]`);
                console.log('提取结果:', extractTagContents(msg.mes, extractTags, '\n---\n') || '(无匹配)');
            }
            if (excludeTags.length > 0) {
                console.log(`移除标签: [${excludeTags.join(', ')}]`);
                console.log('移除结果:', removeTagContents(msg.mes, excludeTags) || '(移除后为空)');
            }
            console.log(
                '最终结果:',
                applyTagFilters(msg.mes, {
                    extractTags,
                    excludeTags,
                    extractMode: getSettings().extractMode,
                    separator: getSettings().tagSeparator,
                }) || '(无结果)',
            );
        }
    }

    return { refreshPreview, debugRawContent };
}

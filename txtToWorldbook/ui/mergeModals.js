export function buildAliasCategorySelectModal(availableCategories, worldbookByCategory, escapeHtml) {
    return availableCategories.map((cat) => {
        const count = Object.keys(worldbookByCategory[cat] || {}).length;
        const isChecked = cat === '角色' ? 'checked' : '';
        return `
<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(155,89,182,0.1);border-radius:6px;margin-bottom:6px;cursor:pointer;">
<input type="checkbox" class="ttw-alias-cat-cb" data-cat="${cat}" ${isChecked} style="width:16px;height:16px;accent-color:#9b59b6;">
<span style="color:#e67e22;font-weight:bold;font-size:13px;">${escapeHtml(cat)}</span>
<span style="color:#888;font-size:11px;margin-left:auto;">${count} 个条目</span>
</label>
`;
    }).join('');
}

export function buildAliasGroupsListHtml(allSuspectedByCategory, worldbookByCategory, groupCategoryMap, escapeHtml) {
    let groupsHtml = '';
    let globalGroupIndex = 0;

    for (const cat of Object.keys(allSuspectedByCategory)) {
        const suspected = allSuspectedByCategory[cat];
        const entries = worldbookByCategory[cat] || {};

        groupsHtml += `<div style="margin-bottom:8px;padding:6px 8px;background:rgba(230,126,34,0.15);border-radius:4px;font-size:12px;color:#e67e22;font-weight:bold;">📂 ${escapeHtml(cat)} (${suspected.length}组)</div>`;

        suspected.forEach((group, localIdx) => {
            const pairCount = (group.length * (group.length - 1)) / 2;
            const groupInfo = group.map((name) => {
                const entry = entries[name];
                const keywords = (entry?.['关键词'] || []).slice(0, 3).join(', ');
                return `${escapeHtml(name)}${keywords ? ` [${escapeHtml(keywords)}]` : ''}`;
            }).join(' / ');

            groupsHtml += `
<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:rgba(155,89,182,0.1);border-radius:6px;margin-bottom:6px;cursor:pointer;">
<input type="checkbox" class="ttw-alias-group-cb" data-index="${globalGroupIndex}" data-category="${cat}" checked style="margin-top:3px;">
<div>
<div style="color:#9b59b6;font-weight:bold;font-size:12px;">组${globalGroupIndex + 1} <span style="color:#888;font-weight:normal;">(${group.length}条, ${pairCount}对)</span></div>
<div style="font-size:11px;color:#ccc;word-break:break-all;">${groupInfo}</div>
</div>
</label>
`;

            groupCategoryMap.push({ category: cat, localIndex: localIdx });
            globalGroupIndex++;
        });
    }

    return groupsHtml;
}

export function buildAliasPairResultsHtml(aiResultByCategory, escapeHtml) {
    let pairHtml = '';
    for (const cat of Object.keys(aiResultByCategory)) {
        const catResult = aiResultByCategory[cat];
        if (catResult.pairResults && catResult.pairResults.length > 0) {
            pairHtml += `<div style="font-size:11px;color:#e67e22;font-weight:bold;margin:6px 0 4px;">📂 ${escapeHtml(cat)}</div>`;
            for (const result of catResult.pairResults) {
                const icon = result.isSamePerson ? '✅' : '❌';
                const color = result.isSamePerson ? '#27ae60' : '#e74c3c';
                pairHtml += `
<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(0,0,0,0.2);border-radius:4px;margin:2px;font-size:11px;border-left:2px solid ${color};">
<span style="color:${color};">${icon}</span>
<span>「${escapeHtml(result.nameA)}」vs「${escapeHtml(result.nameB)}」</span>
${result.isSamePerson ? `<span style="color:#888;">→${escapeHtml(result.mainName)}</span>` : ''}
</div>
`;
            }
        }
    }

    return pairHtml || '<div style="color:#888;">无配对结果</div>';
}

export function buildAliasMergePlanHtml(aiResultByCategory, escapeHtml) {
    let mergePlanHtml = '';
    let hasAnyMerge = false;

    for (const cat of Object.keys(aiResultByCategory)) {
        if (aiResultByCategory[cat].mergedGroups && aiResultByCategory[cat].mergedGroups.length > 0) {
            hasAnyMerge = true;
            break;
        }
    }

    if (hasAnyMerge) {
        mergePlanHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span style="font-size:11px;color:#888;">取消勾选可排除不想合并的组</span><label style="font-size:11px;cursor:pointer;"><input type="checkbox" id="ttw-select-all-merge-groups" checked> 全选</label></div>';

        for (const cat of Object.keys(aiResultByCategory)) {
            const catResult = aiResultByCategory[cat];
            if (!catResult.mergedGroups || catResult.mergedGroups.length === 0) continue;

            mergePlanHtml += `<div style="font-size:11px;color:#e67e22;font-weight:bold;margin:8px 0 4px;">📂 ${escapeHtml(cat)}</div>`;

            for (let gi = 0; gi < catResult.mergedGroups.length; gi++) {
                const group = catResult.mergedGroups[gi];
                mergePlanHtml += `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:6px;border-left:3px solid #27ae60;cursor:pointer;"><input type="checkbox" class="ttw-merge-group-cb" data-group-index="${gi}" data-category="${cat}" checked style="margin-top:2px;width:16px;height:16px;accent-color:#27ae60;flex-shrink:0;"><div><div style="color:#27ae60;font-weight:bold;font-size:12px;">→ 合并为「${escapeHtml(group.mainName)}」</div><div style="font-size:11px;color:#ccc;margin-top:4px;">包含: ${escapeHtml(group.names.join(', '))}</div></div></label>`;
            }
        }
    } else {
        mergePlanHtml = '<div style="color:#888;font-size:12px;">没有需要合并的条目（所有配对都是不同事物）</div>';
    }

    return { html: mergePlanHtml, hasAnyMerge };
}

import { escapeHtmlForDisplay, highlightEscapedText } from './renderer.js';

export function createSearchModal(deps = {}) {
    const {
        AppState,
        ModalFactory,
        Logger,
        ErrorHandler,
        confirmAction,
        saveCurrentSettings,
        handleStopProcessing,
        handleRerollMemory,
        batchRerollMemories,
        updateWorldbookPreview,
    } = deps;

    async function batchRerollSearchResults(modal, memoryIndices, customPrompt) {
        const useParallel = AppState.config.parallel.enabled && memoryIndices.length > 1;
        const parallelHint = useParallel ? `\n\n将使用并行处理（${AppState.config.parallel.concurrency}并发）` : '';

        if (!await confirmAction(`确定要重Roll ${memoryIndices.length} 个章节吗？\n\n这将使用当前附加提示词重新生成这些章节的世界书条目。${parallelHint}`, { title: '批量重 Roll 章节' })) {
            return { success: 0, fail: 0, stopped: false };
        }

        const btn = modal.querySelector('#ttw-reroll-all-found');
        const stopBtn = document.createElement('button');
        stopBtn.className = 'ttw-btn ttw-btn-secondary';
        stopBtn.textContent = '⏸️ 停止';
        stopBtn.style.marginLeft = '8px';
        btn.parentNode.insertBefore(stopBtn, btn.nextSibling);

        btn.disabled = true;
        btn.textContent = '🔄 重Roll中...';

        let stopped = false;
        stopBtn.addEventListener('click', () => {
            stopped = true;
            handleStopProcessing();
            stopBtn.textContent = '已停止';
            stopBtn.disabled = true;
        });

        const result = await batchRerollMemories({
            memoryIndices,
            customPrompt,
            useParallel,
            onStep: ({ completed, total }) => {
                btn.textContent = `🔄 进度: ${completed}/${total}`;
            },
        });

        btn.disabled = false;
        btn.textContent = `🎲 重Roll所有匹配章节 (${memoryIndices.length}章)`;
        stopBtn.remove();

        return { success: result.success, fail: result.fail, stopped: stopped || result.stopped };
    }

    function performSearchEnhanced(keyword, resultsContainer, modal) {
        const results = [];
        const memoryIndicesSet = new Set();

        for (let i = 0; i < AppState.memory.queue.length; i++) {
            const memory = AppState.memory.queue[i];
            if (!memory.result || memory.failed) continue;

            for (const category in memory.result) {
                for (const entryName in memory.result[category]) {
                    const entry = memory.result[category][entryName];
                    if (!entry || typeof entry !== 'object') continue;

                    const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                    const content = entry['内容'] || '';
                    const matches = [];

                    if (entryName.includes(keyword)) matches.push({ field: '条目名', text: entryName });
                    if (keywordsStr.includes(keyword)) matches.push({ field: '关键词', text: keywordsStr });
                    if (content.includes(keyword)) {
                        const idx = content.indexOf(keyword);
                        const start = Math.max(0, idx - 30);
                        const end = Math.min(content.length, idx + keyword.length + 30);
                        const context = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
                        matches.push({ field: '内容', text: context });
                    }

                    if (matches.length > 0) {
                        const alreadyExists = results.some((r) => r.memoryIndex === i && r.category === category && r.entryName === entryName);
                        if (!alreadyExists) {
                            results.push({
                                category,
                                entryName,
                                memoryIndex: i,
                                matches,
                                fromMemoryResult: true,
                            });
                        }
                        memoryIndicesSet.add(i);
                    }
                }
            }
        }

        for (const category in AppState.worldbook.generated) {
            for (const entryName in AppState.worldbook.generated[category]) {
                const alreadyFoundInMemory = results.some((r) => r.category === category && r.entryName === entryName);
                if (alreadyFoundInMemory) continue;

                const entry = AppState.worldbook.generated[category][entryName];
                if (!entry || typeof entry !== 'object') continue;

                const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                const content = entry['内容'] || '';
                const matches = [];

                if (entryName.includes(keyword)) matches.push({ field: '条目名', text: entryName });
                if (keywordsStr.includes(keyword)) matches.push({ field: '关键词', text: keywordsStr });
                if (content.includes(keyword)) {
                    const idx = content.indexOf(keyword);
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(content.length, idx + keyword.length + 30);
                    const context = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
                    matches.push({ field: '内容', text: context });
                }

                if (matches.length > 0) {
                    results.push({
                        category,
                        entryName,
                        memoryIndex: -1,
                        matches,
                        fromMemoryResult: false,
                    });
                }
            }
        }

        resultsContainer.dataset.memoryIndices = JSON.stringify([...memoryIndicesSet]);

        if (results.length === 0) {
            resultsContainer.innerHTML = `<div style="text-align:center;color:#888;padding:20px;">未找到包含"${escapeHtmlForDisplay(keyword)}"的内容</div>`;
            return { results: [], memoryIndices: memoryIndicesSet };
        }

        const highlightKw = (text) => {
            if (!text) return '';
            return highlightEscapedText(text, keyword);
        };

        let html = `<div style="margin-bottom:12px;font-size:13px;color:#27ae60;">找到 ${results.length} 个匹配项，涉及 ${memoryIndicesSet.size} 个章节</div>`;
        for (let idx = 0; idx < results.length; idx++) {
            const result = results[idx];
            const memoryLabel = result.memoryIndex >= 0 ? `记忆${result.memoryIndex + 1}` : '默认/导入';
            const memoryColor = result.memoryIndex >= 0 ? '#3498db' : '#888';
            const sourceTag = result.fromMemoryResult
                ? '<span style="font-size:9px;color:#27ae60;margin-left:4px;">✓ 当前结果</span>'
                : '<span style="font-size:9px;color:#f39c12;margin-left:4px;">⚠ 合并数据</span>';
            const matchTexts = result.matches.slice(0, 2).map((m) => {
                const matchText = (m.text || '').substring(0, 80);
                return `<span style="color:#888;">${escapeHtmlForDisplay(m.field || '')}:</span> ${highlightKw(matchText)}${m.text && m.text.length > 80 ? '...' : ''}`;
            }).join('<br>');

            html += '<div class="ttw-search-result-item" data-result-index="' + idx + '" style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;margin-bottom:8px;border-left:3px solid #f1c40f;cursor:pointer;transition:background 0.2s;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
            html += '<span style="font-weight:bold;color:#e67e22;">[' + escapeHtmlForDisplay(result.category) + '] ' + highlightKw(result.entryName) + '</span>';
            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span style="font-size:11px;color:' + memoryColor + ';background:rgba(52,152,219,0.2);padding:2px 6px;border-radius:3px;">📍 ' + memoryLabel + '</span>';
            html += sourceTag;
            if (result.memoryIndex >= 0) html += '<button class="ttw-btn-tiny ttw-reroll-single" data-memory-idx="' + result.memoryIndex + '" title="重Roll此章节">🎲</button>';
            html += '</div></div>';
            html += '<div style="font-size:12px;color:#ccc;">' + matchTexts + '</div>';
            html += '</div>';
        }
        resultsContainer.innerHTML = html;

        resultsContainer.querySelectorAll('.ttw-reroll-single').forEach((btn) => {
            btn.onclick = async function (e) {
                e.stopPropagation();
                const memoryIndex = parseInt(this.dataset.memoryIdx, 10);
                const customPrompt = modal.querySelector('#ttw-search-suffix-prompt')?.value || '';
                if (!await confirmAction(`确定要重Roll 第${memoryIndex + 1}章吗？`, { title: '单章重 Roll' })) return;

                this.disabled = true;
                this.textContent = '🔄';
                try {
                    await handleRerollMemory(memoryIndex, customPrompt);
                    ErrorHandler.showUserSuccess(`第${memoryIndex + 1}章 重Roll完成`);
                    modal.querySelector('#ttw-do-search')?.click();
                    updateWorldbookPreview();
                } catch (error) {
                    ErrorHandler.showUserError(`重Roll失败: ${error.message}`);
                } finally {
                    this.disabled = false;
                    this.textContent = '🎲';
                }
            };
        });

        const allItems = resultsContainer.querySelectorAll('.ttw-search-result-item');
        Logger.debug('Search', '绑定点击事件，共 ' + allItems.length + ' 个条目');

        allItems.forEach((item) => {
            item.onclick = function (e) {
                if (e.target.closest('.ttw-reroll-single')) return;

                const idx = parseInt(this.dataset.resultIndex, 10);
                const result = results[idx];
                if (!result) {
                    Logger.error('Search', '找不到result! idx=' + idx + ' results长度=' + results.length);
                    ErrorHandler.showUserError('调试：找不到result，idx=' + idx + '，results长度=' + results.length);
                    return;
                }

                const detailDiv = modal.querySelector('#ttw-search-detail');
                if (!detailDiv) return;

                resultsContainer.querySelectorAll('.ttw-search-result-item').forEach((i) => {
                    i.style.background = 'rgba(0,0,0,0.2)';
                });
                this.style.background = 'rgba(0,0,0,0.4)';

                let entry = null;
                let dataSource = '';
                if (result.memoryIndex >= 0) {
                    const mem = AppState.memory.queue[result.memoryIndex];
                    if (mem && mem.result && mem.result[result.category]) {
                        entry = mem.result[result.category][result.entryName];
                        dataSource = `来自: 记忆${result.memoryIndex + 1} 的当前处理结果`;
                    }
                }
                if (!entry) {
                    entry = AppState.worldbook.generated[result.category]?.[result.entryName];
                    dataSource = '来自: 合并后的世界书';
                }

                const memoryLabel = result.memoryIndex >= 0
                    ? `记忆${result.memoryIndex + 1} (第${result.memoryIndex + 1}章)`
                    : '默认/导入条目';

                let contentHtml = '';
                if (entry) {
                    const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                    const content = entry['内容'] || '';
                    const escapedContent = highlightKw(content).replace(/\n/g, '<br>');
                    contentHtml = `
                        <div style="margin-bottom:8px;font-size:11px;color:#888;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;">${escapeHtmlForDisplay(dataSource)}</div>
                        <div style="margin-bottom:12px;padding:10px;background:rgba(155,89,182,0.1);border-radius:6px;">
                            <div style="color:#9b59b6;font-size:11px;margin-bottom:4px;">📝 关键词</div>
                            <div style="font-size:12px;">${highlightKw(keywordsStr)}</div>
                        </div>
                        <div style="padding:10px;background:rgba(39,174,96,0.1);border-radius:6px;max-height:250px;overflow-y:auto;">
                            <div style="color:#27ae60;font-size:11px;margin-bottom:4px;">📄 内容</div>
                            <div style="font-size:12px;line-height:1.6;">${escapedContent}</div>
                        </div>
                    `;
                } else {
                    contentHtml = '<div style="color:#888;text-align:center;padding:20px;">无法获取条目详情</div>';
                }

                detailDiv.innerHTML = `
                    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #444;">
                        <h4 style="color:#e67e22;margin:0 0 8px;font-size:14px;">[${escapeHtmlForDisplay(result.category)}] ${escapeHtmlForDisplay(result.entryName)}</h4>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:12px;color:#3498db;">📍 来源: ${memoryLabel}</span>
                            ${result.memoryIndex >= 0 ? `<button class="ttw-btn ttw-btn-small ttw-btn-warning" id="ttw-detail-reroll-btn" data-mem-idx="${result.memoryIndex}">🎲 重Roll此章节</button>` : ''}
                        </div>
                    </div>
                    ${contentHtml}
                `;

                const detailRerollBtn = detailDiv.querySelector('#ttw-detail-reroll-btn');
                if (detailRerollBtn) {
                    detailRerollBtn.onclick = async function () {
                        const memIdx = parseInt(this.dataset.memIdx, 10);
                        const customPrompt = modal.querySelector('#ttw-search-suffix-prompt')?.value || '';
                        if (!await confirmAction(`确定要重Roll 第${memIdx + 1}章吗？`, { title: '单章重 Roll' })) return;

                        this.disabled = true;
                        this.textContent = '🔄 重Roll中...';
                        try {
                            await handleRerollMemory(memIdx, customPrompt);
                            ErrorHandler.showUserSuccess(`第${memIdx + 1}章 重Roll完成`);
                            modal.querySelector('#ttw-do-search')?.click();
                            updateWorldbookPreview();
                        } catch (error) {
                            ErrorHandler.showUserError(`重Roll失败: ${error.message}`);
                        } finally {
                            this.disabled = false;
                            this.textContent = '🎲 重Roll此章节';
                        }
                    };
                }
            };
        });

        return { results, memoryIndices: memoryIndicesSet };
    }

    function showSearchModal() {
        const existingModal = document.getElementById('ttw-search-modal');
        if (existingModal) existingModal.remove();

        const bodyHtml = `
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">输入要查找的字符（如乱码字符 �）</label>
			<input type="text" id="ttw-search-input" class="ttw-input" placeholder="输入要查找的内容..." value="${AppState.ui.searchKeyword}">
		</div>
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;color:#9b59b6;font-weight:bold;">📝 重Roll时附加的提示词（插入到发送给AI的文本最后）</label>
			<textarea id="ttw-search-suffix-prompt" rows="2" class="ttw-textarea-small" placeholder="例如：请特别注意提取XX信息，修复乱码内容...">${AppState.settings.customSuffixPrompt || ''}</textarea>
		</div>
		<div class="ttw-search-results-container" style="display:flex;gap:12px;height:400px;">
			<div id="ttw-search-results" style="flex:1;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;">
				<div style="text-align:center;color:#888;">输入关键词后点击"查找"</div>
			</div>
			<div id="ttw-search-detail" style="flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;display:none;">
				<div style="text-align:center;color:#888;padding:20px;">👈 点击左侧条目查看详情</div>
			</div>
		</div>
	`;
        const footerHtml = `
		<button class="ttw-btn" id="ttw-clear-search">清除高亮</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-do-search">🔍 查找</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-reroll-all-found" style="display:none;">🎲 重Roll所有匹配章节</button>
		<button class="ttw-btn" id="ttw-close-search">关闭</button>
	`;

        const modal = ModalFactory.create({
            id: 'ttw-search-modal',
            title: '🔍 查找内容',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '900px',
        });

        modal.querySelector('#ttw-close-search').addEventListener('click', () => ModalFactory.close(modal));
        modal.querySelector('#ttw-search-suffix-prompt').addEventListener('change', (e) => {
            AppState.settings.customSuffixPrompt = e.target.value;
            saveCurrentSettings();
        });

        modal.querySelector('#ttw-do-search').addEventListener('click', () => {
            const keyword = modal.querySelector('#ttw-search-input').value;
            if (!keyword) {
                ErrorHandler.showUserError('请输入要查找的内容');
                return;
            }

            AppState.ui.searchKeyword = keyword;
            const results = performSearchEnhanced(keyword, modal.querySelector('#ttw-search-results'), modal);
            const rerollAllBtn = modal.querySelector('#ttw-reroll-all-found');

            if (results && results.memoryIndices && results.memoryIndices.size > 0) {
                rerollAllBtn.style.display = 'inline-block';
                rerollAllBtn.textContent = `🎲 重Roll所有匹配章节 (${results.memoryIndices.size}章)`;
            } else {
                rerollAllBtn.style.display = 'none';
            }

            modal.querySelector('#ttw-search-detail').style.display = 'block';
        });

        modal.querySelector('#ttw-reroll-all-found').addEventListener('click', async () => {
            const resultsContainer = modal.querySelector('#ttw-search-results');
            const memoryIndicesAttr = resultsContainer.dataset.memoryIndices;
            if (!memoryIndicesAttr) {
                ErrorHandler.showUserError('请先进行查找');
                return;
            }

            const memoryIndices = JSON.parse(memoryIndicesAttr);
            if (memoryIndices.length === 0) {
                ErrorHandler.showUserError('没有找到匹配的章节');
                return;
            }

            const customPrompt = modal.querySelector('#ttw-search-suffix-prompt').value;
            const { success, fail, stopped } = await batchRerollSearchResults(modal, memoryIndices, customPrompt);
            ErrorHandler.showUserSuccess(`批量重Roll完成！\n成功: ${success}\n失败: ${fail}${stopped ? '\n(已手动停止)' : ''}`);
            modal.querySelector('#ttw-do-search').click();
            updateWorldbookPreview();
        });

        modal.querySelector('#ttw-clear-search').addEventListener('click', () => {
            AppState.ui.searchKeyword = '';
            modal.querySelector('#ttw-search-input').value = '';
            modal.querySelector('#ttw-search-results').innerHTML = '<div style="text-align:center;color:#888;">已清除高亮</div>';
            modal.querySelector('#ttw-search-detail').style.display = 'none';
            modal.querySelector('#ttw-reroll-all-found').style.display = 'none';
            updateWorldbookPreview();
        });

        modal.querySelector('#ttw-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#ttw-do-search').click();
            }
        });
    }

    return {
        batchRerollSearchResults,
        performSearchEnhanced,
        showSearchModal,
    };
}

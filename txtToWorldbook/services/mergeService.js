export function createMergeService(deps = {}) {
    const {
        AppState,
        Logger,
        getAllVolumesWorldbook,
        getLanguagePrefix,
        updateStreamContent,
        Semaphore,
        callAPI,
        parseAIResponse,
    } = deps;

    function generatePairs(group) {
        const pairs = [];
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                pairs.push([group[i], group[j]]);
            }
        }
        return pairs;
    }

    class UnionFind {
        constructor(items) {
            this.parent = {};
            this.rank = {};
            items.forEach((item) => {
                this.parent[item] = item;
                this.rank[item] = 0;
            });
        }

        find(x) {
            if (this.parent[x] !== x) {
                this.parent[x] = this.find(this.parent[x]);
            }
            return this.parent[x];
        }

        union(x, y) {
            const rootX = this.find(x);
            const rootY = this.find(y);
            if (rootX === rootY) return;

            if (this.rank[rootX] < this.rank[rootY]) {
                this.parent[rootX] = rootY;
            } else if (this.rank[rootX] > this.rank[rootY]) {
                this.parent[rootY] = rootX;
            } else {
                this.parent[rootY] = rootX;
                this.rank[rootX]++;
            }
        }

        getGroups() {
            const groups = {};
            for (const item in this.parent) {
                const root = this.find(item);
                if (!groups[root]) groups[root] = [];
                groups[root].push(item);
            }
            return Object.values(groups).filter((g) => g.length > 1);
        }
    }

    function getManualMergeViewWorldbook() {
        return AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated;
    }

    function resolveDisplayedEntrySource(category, displayedName) {
        const categoryFromGenerated = AppState.worldbook.generated?.[category];
        const volumes = AppState.worldbook.volumes || [];

        const suffixMatch = displayedName.match(/^(.*)_卷(\d+)$/);
        if (suffixMatch) {
            const baseName = suffixMatch[1];
            const targetVolumeIndex = parseInt(suffixMatch[2], 10) - 1;

            if (targetVolumeIndex === AppState.worldbook.currentVolumeIndex && categoryFromGenerated?.[baseName]) {
                return { sourceType: 'generated', volumeIndex: AppState.worldbook.currentVolumeIndex, actualName: baseName, entry: categoryFromGenerated[baseName] };
            }

            const volume = volumes.find(v => v.volumeIndex === targetVolumeIndex);
            const fromVolume = volume?.worldbook?.[category]?.[baseName];
            if (fromVolume) {
                return { sourceType: 'volume', volumeIndex: targetVolumeIndex, actualName: baseName, entry: fromVolume };
            }
        }

        for (const volume of volumes) {
            const fromVolume = volume?.worldbook?.[category]?.[displayedName];
            if (fromVolume) {
                return { sourceType: 'volume', volumeIndex: volume.volumeIndex, actualName: displayedName, entry: fromVolume };
            }
        }

        if (categoryFromGenerated?.[displayedName]) {
            return { sourceType: 'generated', volumeIndex: AppState.worldbook.currentVolumeIndex, actualName: displayedName, entry: categoryFromGenerated[displayedName] };
        }

        return null;
    }

    function resolveManualMergeEntryRef(entryRef) {
        if (!entryRef || !entryRef.category || !entryRef.name) return null;

        if (entryRef.sourceType && entryRef.actualName) {
            if (entryRef.sourceType === 'generated') {
                const entry = AppState.worldbook.generated?.[entryRef.category]?.[entryRef.actualName];
                if (entry) return { ...entryRef, entry };
            }
            if (entryRef.sourceType === 'volume' && Number.isInteger(entryRef.volumeIndex)) {
                const volume = (AppState.worldbook.volumes || []).find(v => v.volumeIndex === entryRef.volumeIndex);
                const entry = volume?.worldbook?.[entryRef.category]?.[entryRef.actualName];
                if (entry) return { ...entryRef, entry };
            }
        }

        const fallback = resolveDisplayedEntrySource(entryRef.category, entryRef.name);
        if (!fallback) return null;
        return {
            ...entryRef,
            sourceType: fallback.sourceType,
            volumeIndex: fallback.volumeIndex,
            actualName: fallback.actualName,
            entry: fallback.entry
        };
    }

    function executeManualMerge(selectedEntries, mainName, targetCategory, dedupKeywords, addSeparator) {
        const worldbook = AppState.worldbook.generated;
        const resolvedEntries = selectedEntries.map(resolveManualMergeEntryRef).filter(Boolean);

        const uniqueResolvedMap = new Map();
        resolvedEntries.forEach((entry) => {
            const sourceKey = `${entry.sourceType}:${entry.volumeIndex}:${entry.category}:${entry.actualName}`;
            if (!uniqueResolvedMap.has(sourceKey)) uniqueResolvedMap.set(sourceKey, entry);
        });
        const uniqueResolvedEntries = [...uniqueResolvedMap.values()];

        if (uniqueResolvedEntries.length < 2) {
            Logger.warn('手动合并', `未命中足够条目: 已选${selectedEntries.length}，命中${uniqueResolvedEntries.length}`);
            return { success: false, error: '未命中足够的有效条目，请重新选择后重试' };
        }

        let mergedKeywords = [];
        let mergedContent = '';

        for (const entry of uniqueResolvedEntries) {
            const data = entry.entry;
            if (data['关键词']) {
                mergedKeywords.push(...(Array.isArray(data['关键词']) ? data['关键词'] : [data['关键词']]));
            }
            mergedKeywords.push(entry.name);

            if (data['内容']) {
                if (mergedContent && addSeparator) {
                    mergedContent += '\n\n---\n\n';
                } else if (mergedContent) {
                    mergedContent += '\n\n';
                }
                mergedContent += data['内容'];
            }
        }

        if (!mergedKeywords.length && !mergedContent.trim()) {
            Logger.warn('手动合并', '合并内容为空，终止合并');
            return { success: false, error: '合并结果为空，请检查所选条目是否存在有效内容' };
        }

        if (dedupKeywords) {
            mergedKeywords = [...new Set(mergedKeywords)];
        }

        let deletedCount = 0;
        for (const entry of uniqueResolvedEntries) {
            let sourceCategoryEntries = null;
            if (entry.sourceType === 'generated') {
                sourceCategoryEntries = AppState.worldbook.generated?.[entry.category];
            } else if (entry.sourceType === 'volume' && Number.isInteger(entry.volumeIndex)) {
                const volume = (AppState.worldbook.volumes || []).find(v => v.volumeIndex === entry.volumeIndex);
                sourceCategoryEntries = volume?.worldbook?.[entry.category];
            }

            if (sourceCategoryEntries && sourceCategoryEntries[entry.actualName]) {
                delete sourceCategoryEntries[entry.actualName];
                deletedCount++;
                Logger.info('手动合并', `已删除原条目: [${entry.category}] ${entry.actualName} (${entry.sourceType}${entry.sourceType === 'volume' ? `#${entry.volumeIndex + 1}` : ''})`);
            }
        }

        if (!worldbook[targetCategory]) {
            worldbook[targetCategory] = {};
        }

        worldbook[targetCategory][mainName] = {
            '关键词': mergedKeywords,
            '内容': mergedContent
        };

        Logger.info('手动合并', `手动合并完成: 共${selectedEntries.length}个条目，命中${uniqueResolvedEntries.length}个，删除了${deletedCount}个原条目，合并为 [${targetCategory}] ${mainName}`);
        return { success: true, deletedCount, mergedCount: uniqueResolvedEntries.length };
    }

    function checkShortNameMatch(nameA, nameB) {
        const extractName = (fullName) => {
            if (fullName.length <= 3) return fullName;
            return fullName.slice(-2);
        };

        const shortA = extractName(nameA);
        const shortB = extractName(nameB);
        return shortA === shortB || nameA.includes(shortB) || nameB.includes(shortA);
    }

    function findPotentialDuplicates(categoryName) {
        const entries = AppState.worldbook.generated[categoryName];
        if (!entries) return [];

        const names = Object.keys(entries);
        const suspectedGroups = [];
        const processed = new Set();

        for (let i = 0; i < names.length; i++) {
            if (processed.has(names[i])) continue;

            const group = [names[i]];
            const keywordsA = new Set(entries[names[i]]['关键词'] || []);

            for (let j = i + 1; j < names.length; j++) {
                if (processed.has(names[j])) continue;

                const keywordsB = new Set(entries[names[j]]['关键词'] || []);
                const intersection = [...keywordsA].filter((k) => keywordsB.has(k));
                const nameContains = names[i].includes(names[j]) || names[j].includes(names[i]);
                const shortNameMatch = checkShortNameMatch(names[i], names[j]);

                if (intersection.length > 0 || nameContains || shortNameMatch) {
                    group.push(names[j]);
                    processed.add(names[j]);
                }
            }

            if (group.length > 1) {
                suspectedGroups.push(group);
                group.forEach((n) => processed.add(n));
            }
        }

        return suspectedGroups;
    }

    async function verifyDuplicatesWithAI(suspectedGroups, useParallel = true, threshold = 5, categoryName = '角色') {
        if (suspectedGroups.length === 0) return { pairResults: [], mergedGroups: [] };

        const entries = AppState.worldbook.generated[categoryName];
        const allPairs = [];
        const allNames = new Set();

        for (const group of suspectedGroups) {
            const pairs = generatePairs(group);
            pairs.forEach((pair) => {
                allPairs.push(pair);
                allNames.add(pair[0]);
                allNames.add(pair[1]);
            });
        }

        if (allPairs.length === 0) return { pairResults: [], mergedGroups: [] };

        const buildPairContent = (pairs, startIndex = 0) => {
            return pairs.map((pair, i) => {
                const [nameA, nameB] = pair;
                const entryA = entries[nameA];
                const entryB = entries[nameB];
                const keywordsA = entryA?.['关键词']?.join(', ') || '无';
                const keywordsB = entryB?.['关键词']?.join(', ') || '无';
                const contentA = (entryA?.['内容'] || '').substring(0, 300);
                const contentB = (entryB?.['内容'] || '').substring(0, 300);

                return `配对${startIndex + i + 1}: 「${nameA}」vs「${nameB}」
  【${nameA}】关键词: ${keywordsA}
  内容摘要: ${contentA}${contentA.length >= 300 ? '...' : ''}
  【${nameB}】关键词: ${keywordsB}
  内容摘要: ${contentB}${contentB.length >= 300 ? '...' : ''}`;
            }).join('\n\n');
        };

        const categoryLabel = categoryName === '角色' ? '角色' : `「${categoryName}」分类的条目`;
        const buildPrompt = (pairsContent) => {
            return getLanguagePrefix() + `你是${categoryName}识别专家。请对以下每一对${categoryLabel}进行判断，判断它们是否为同一${categoryName === '角色' ? '人物' : '事物'}。

## 待判断的${categoryLabel}配对
${pairsContent}

## 判断依据
- 仔细阅读每个条目的关键词和内容摘要
- 根据描述的核心特征、身份、背景等信息判断
- 考虑：全名vs简称、别名、昵称、代号等称呼变化
- 如果内容描述明显指向同一${categoryName === '角色' ? '个人' : '个事物'}，则判定为相同
- 【重要】即使名字相似，如果核心特征明显不同，也要判定为不同

## 要求
- 对每一对分别判断
- 如果是同一${categoryName === '角色' ? '人' : '事物'}，选择更完整/更常用的名称作为mainName
- 如果不是同一${categoryName === '角色' ? '人' : '事物'}，说明原因
- 返回JSON格式

## 输出格式
{
    "results": [
        {"pair": 1, "nameA": "条目A名", "nameB": "条目B名", "isSamePerson": true, "mainName": "保留的名称", "reason": "判断依据"},
        {"pair": 2, "nameA": "条目A名", "nameB": "条目B名", "isSamePerson": false, "reason": "不是同一${categoryName === '角色' ? '人' : '事物'}的原因"}
    ]
}`;
        };

        const pairResults = [];

        if (useParallel && allPairs.length > threshold) {
            updateStreamContent('\n🚀 并发模式处理配对判断...\n');

            const batches = [];
            for (let i = 0; i < allPairs.length; i += threshold) {
                batches.push({
                    pairs: allPairs.slice(i, Math.min(i + threshold, allPairs.length)),
                    startIndex: i
                });
            }

            updateStreamContent(`📦 分成 ${batches.length} 批，每批约 ${threshold} 对\n`);

            const semaphore = new Semaphore(AppState.config.parallel.concurrency);
            let completed = 0;

            const processBatch = async (batch, batchIndex) => {
                await semaphore.acquire();
                try {
                    updateStreamContent(`🔄 [批次${batchIndex + 1}/${batches.length}] 处理 ${batch.pairs.length} 对...\n`);

                    const pairsContent = buildPairContent(batch.pairs, batch.startIndex);
                    const prompt = buildPrompt(pairsContent);
                    const response = await callAPI(prompt);
                    const aiResult = parseAIResponse(response);

                    for (const result of aiResult.results || []) {
                        const localPairIndex = (result.pair || 1) - 1;
                        const globalPairIndex = batch.startIndex + localPairIndex;
                        if (globalPairIndex < 0 || globalPairIndex >= allPairs.length) continue;

                        const [nameA, nameB] = allPairs[globalPairIndex];
                        pairResults.push({
                            nameA: result.nameA || nameA,
                            nameB: result.nameB || nameB,
                            isSamePerson: result.isSamePerson,
                            mainName: result.mainName,
                            reason: result.reason,
                            _globalIndex: globalPairIndex
                        });
                    }

                    completed++;
                    updateStreamContent(`✅ [批次${batchIndex + 1}] 完成 (${completed}/${batches.length})\n`);
                } catch (error) {
                    updateStreamContent(`❌ [批次${batchIndex + 1}] 失败: ${error.message}\n`);
                } finally {
                    semaphore.release();
                }
            };

            await Promise.allSettled(batches.map((batch, i) => processBatch(batch, i)));
        } else {
            updateStreamContent('\n🤖 单次请求模式处理配对判断...\n');

            const pairsContent = buildPairContent(allPairs, 0);
            const prompt = buildPrompt(pairsContent);
            const response = await callAPI(prompt);
            const aiResult = parseAIResponse(response);

            for (const result of aiResult.results || []) {
                const pairIndex = (result.pair || 1) - 1;
                if (pairIndex < 0 || pairIndex >= allPairs.length) continue;

                const [nameA, nameB] = allPairs[pairIndex];
                pairResults.push({
                    nameA: result.nameA || nameA,
                    nameB: result.nameB || nameB,
                    isSamePerson: result.isSamePerson,
                    mainName: result.mainName,
                    reason: result.reason,
                    _globalIndex: pairIndex
                });
            }
        }

        const uf = new UnionFind([...allNames]);
        for (const result of pairResults) {
            if (result.isSamePerson) {
                const [nameA, nameB] = allPairs[result._globalIndex];
                uf.union(nameA, nameB);
            }
        }

        const mergedGroups = uf.getGroups();
        const finalGroups = mergedGroups.map((group) => {
            let mainName = null;
            for (const result of pairResults) {
                if (!result.isSamePerson || !result.mainName) continue;
                if ((group.includes(result.nameA) || group.includes(result.nameB)) && group.includes(result.mainName)) {
                    mainName = result.mainName;
                    break;
                }
            }

            if (!mainName) {
                let maxLen = 0;
                for (const name of group) {
                    const len = (entries[name]?.['内容'] || '').length;
                    if (len > maxLen) {
                        maxLen = len;
                        mainName = name;
                    }
                }
            }

            return { names: group, mainName: mainName || group[0] };
        });

        return {
            pairResults,
            mergedGroups: finalGroups,
            _allPairs: allPairs
        };
    }

    async function mergeConfirmedDuplicates(aiResult, categoryName = '角色') {
        const entries = AppState.worldbook.generated[categoryName];
        let mergedCount = 0;
        const mergedGroups = aiResult.mergedGroups || [];

        for (const groupInfo of mergedGroups) {
            const { names, mainName } = groupInfo;
            if (!names || names.length < 2 || !mainName) continue;

            let mergedKeywords = [];
            let mergedContent = '';

            for (const name of names) {
                if (!entries[name]) continue;
                mergedKeywords.push(...(entries[name]['关键词'] || []));
                mergedKeywords.push(name);
                if (entries[name]['内容']) {
                    mergedContent += entries[name]['内容'] + '\n\n---\n\n';
                }
            }

            entries[mainName] = {
                '关键词': [...new Set(mergedKeywords)],
                '内容': mergedContent.replace(/\n\n---\n\n$/, '')
            };

            for (const name of names) {
                if (name !== mainName && entries[name]) {
                    delete entries[name];
                }
            }

            mergedCount++;
        }

        return mergedCount;
    }

    function collectAliasMergeGroups(checkedSelections, aiResultByCategory) {
        const mergeByCategory = {};
        for (const item of checkedSelections) {
            const cat = item.category;
            const gi = item.groupIndex;
            if (!mergeByCategory[cat]) mergeByCategory[cat] = [];
            if (aiResultByCategory[cat] && aiResultByCategory[cat].mergedGroups[gi]) {
                mergeByCategory[cat].push(aiResultByCategory[cat].mergedGroups[gi]);
            }
        }
        return mergeByCategory;
    }

    async function executeAliasMergeByCategory(mergeByCategory, aiResultByCategory) {
        let totalMerged = 0;
        for (const cat in mergeByCategory) {
            const filteredResult = {
                pairResults: aiResultByCategory[cat].pairResults,
                mergedGroups: mergeByCategory[cat]
            };
            const mergedCount = await mergeConfirmedDuplicates(filteredResult, cat);
            totalMerged += mergedCount;
        }
        return totalMerged;
    }

    function quickDuplicateScan(worldbook) {
        const target = worldbook || AppState.worldbook.generated;
        let totalSuspected = 0;
        const categories = [];
        for (const category of Object.keys(target)) {
            const entries = target[category];
            if (!entries || typeof entries !== 'object') continue;
            const groups = findPotentialDuplicates(category);
            if (groups.length > 0) {
                totalSuspected += groups.length;
                categories.push({ name: category, count: groups.length });
            }
        }
        return { totalSuspected, categories };
    }

    return {
        checkShortNameMatch,
        collectAliasMergeGroups,
        executeAliasMergeByCategory,
        findPotentialDuplicates,
        generatePairs,
        getManualMergeViewWorldbook,
        mergeConfirmedDuplicates,
        resolveDisplayedEntrySource,
        resolveManualMergeEntryRef,
        executeManualMerge,
        verifyDuplicatesWithAI,
        quickDuplicateScan,
    };
}



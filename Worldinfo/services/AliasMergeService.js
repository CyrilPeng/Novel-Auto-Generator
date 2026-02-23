/**
 * 别名合并服务层
 * 处理世界书条目别名识别和合并
 */
import { APIService } from './APIService.js';
import { parseAIResponse } from '../generators/ResponseParser.js';

/**
 * 并查集
 */
class UnionFind {
    constructor(items) {
        this.parent = {};
        this.rank = {};
        items.forEach(item => {
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
        return Object.values(groups).filter(g => g.length > 1);
    }
}

/**
 * 别名合并服务
 */
export class AliasMergeService {
    constructor(config, apiService) {
        this.config = config;
        this.apiService = apiService || new APIService();
    }

    /**
     * 查找潜在的重复条目
     * @param {Object} entries - 条目对象
     * @returns {Array<Array>} 疑似重复组数组
     */
    findPotentialDuplicates(entries) {
        if (!entries || typeof entries !== 'object') return [];
        
        const names = Object.keys(entries);
        if (names.length < 2) return [];
        
        const suspectedGroups = [];
        const processed = new Set();
        
        for (let i = 0; i < names.length; i++) {
            if (processed.has(names[i])) continue;
            
            const group = [names[i]];
            
            for (let j = i + 1; j < names.length; j++) {
                if (processed.has(names[j])) continue;
                
                // 检查关键词重叠
                const keywordsA = new Set(entries[names[i]]?.['关键词'] || []);
                const keywordsB = new Set(entries[names[j]]?.['关键词'] || []);
                const intersection = [...keywordsA].filter(k => keywordsB.has(k));
                
                // 检查名称包含
                const nameContains = names[i].includes(names[j]) || names[j].includes(names[i]);
                
                // 检查简称匹配
                const shortNameMatch = this.checkShortNameMatch(names[i], names[j]);
                
                if (intersection.length > 0 || nameContains || shortNameMatch) {
                    group.push(names[j]);
                    processed.add(names[j]);
                }
            }
            
            if (group.length > 1) {
                suspectedGroups.push(group);
                group.forEach(n => processed.add(n));
            }
        }
        
        return suspectedGroups;
    }

    /**
     * 检查简称匹配
     */
    checkShortNameMatch(nameA, nameB) {
        const extractName = (fullName) => {
            if (fullName.length <= 3) return fullName;
            return fullName.slice(-2);
        };
        
        const shortA = extractName(nameA);
        const shortB = extractName(nameB);
        
        return shortA === shortB || nameA.includes(shortB) || nameB.includes(shortA);
    }

    /**
     * 生成配对
     */
    generatePairs(group) {
        const pairs = [];
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                pairs.push([group[i], group[j]]);
            }
        }
        return pairs;
    }



    /**
     * 使用 AI 验证重复条目
     * @param {Array<Array>} suspectedGroups - 疑似重复组
     * @param {Object} entries - 条目对象
     * @param {string} categoryName - 分类名称
     * @param {boolean} useParallel - 是否启用并发
     * @param {number} threshold - 配对数阈值
     * @returns {Promise<Object>} 验证结果
     */
    async verifyDuplicatesWithAI(suspectedGroups, entries, categoryName = '角色', useParallel = true, threshold = 5) {
        if (suspectedGroups.length === 0) {
            return { pairResults: [], mergedGroups: [] };
        }
        
        // 生成所有配对
        const allPairs = [];
        const allNames = new Set();
        
        for (const group of suspectedGroups) {
            const pairs = this.generatePairs(group);
            pairs.forEach(pair => {
                allPairs.push(pair);
                allNames.add(pair[0]);
                allNames.add(pair[1]);
            });
        }
        
        if (allPairs.length === 0) {
            return { pairResults: [], mergedGroups: [] };
        }
        
        // 构建配对内容
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
  【${nameA}】关键词：${keywordsA}
  内容摘要：${contentA}${contentA.length >= 300 ? '...' : ''}
  【${nameB}】关键词：${keywordsB}
  内容摘要：${contentB}${contentB.length >= 300 ? '...' : ''}`;
            }).join('\n\n');
        };
        
        // 构建提示词
        const buildPrompt = (pairsContent, pairCount) => {
            return `你是${categoryName}识别专家。请对以下每一对${categoryName}进行判断，判断它们是否为同一事物。

## 待判断的${categoryName}配对
${pairsContent}

## 判断依据
- 仔细阅读每个条目的关键词和内容摘要
- 考虑：全名 vs 简称、别名、昵称、代号等称呼变化
- 如果内容描述明显指向同一个人，则判定为相同
- 即使名字相似，如果核心特征明显不同，也要判定为不同

## 输出格式
{
    "results": [
        {"pair": 1, "nameA": "条目 A 名", "nameB": "条目 B 名", "isSamePerson": true, "mainName": "保留的名称", "reason": "判断依据"},
        {"pair": 2, "nameA": "条目 A 名", "nameB": "条目 B 名", "isSamePerson": false, "reason": "不是同一人的原因"}
    ]
}`;
        };
        
        const pairResults = [];
        
        if (useParallel && allPairs.length > threshold) {
            // 并发模式处理
            const batches = [];
            for (let i = 0; i < allPairs.length; i += threshold) {
                batches.push({
                    pairs: allPairs.slice(i, Math.min(i + threshold, allPairs.length)),
                    startIndex: i
                });
            }
            
            const semaphore = new Semaphore(this.config.get('parallelConcurrency', 3));
            
            const processBatch = async (batch, batchIndex) => {
                await semaphore.acquire();
                try {
                    const pairsContent = buildPairContent(batch.pairs, batch.startIndex);
                    const prompt = buildPrompt(pairsContent, batch.pairs.length);
                    const response = await this.apiService.callAPI(prompt);
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
                } finally {
                    semaphore.release();
                }
            };
            
            await Promise.allSettled(batches.map((batch, i) => processBatch(batch, i)));
            
        } else {
            // 单次请求模式
            const pairsContent = buildPairContent(allPairs, 0);
            const prompt = buildPrompt(pairsContent, allPairs.length);
            const response = await this.apiService.callAPI(prompt);
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
        
        // 使用并查集合并结果
        const uf = new UnionFind([...allNames]);
        
        for (const result of pairResults) {
            if (result.isSamePerson) {
                const [nameA, nameB] = allPairs[result._globalIndex];
                uf.union(nameA, nameB);
            }
        }
        
        const mergedGroups = uf.getGroups();
        
        // 确定每个组的主名称
        const finalGroups = mergedGroups.map(group => {
            let mainName = null;
            for (const result of pairResults) {
                if (result.isSamePerson && result.mainName) {
                    if (group.includes(result.nameA) || group.includes(result.nameB)) {
                        if (group.includes(result.mainName)) {
                            mainName = result.mainName;
                            break;
                        }
                    }
                }
            }
            
            if (!mainName) {
                // 选择内容最完整的名称
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

    /**
     * 合并确认的重复条目
     * @param {Object} entries - 条目对象
     * @param {Array} mergedGroups - 合并组
     * @returns {number} 合并数量
     */
    mergeConfirmedDuplicates(entries, mergedGroups) {
        let mergedCount = 0;
        
        for (const groupInfo of mergedGroups) {
            const { names, mainName } = groupInfo;
            if (!names || names.length < 2 || !mainName) continue;
            
            let mergedKeywords = [];
            let mergedContent = '';
            
            for (const name of names) {
                if (entries[name]) {
                    mergedKeywords.push(...(entries[name]['关键词'] || []));
                    mergedKeywords.push(name);
                    if (entries[name]['内容']) {
                        mergedContent += entries[name]['内容'] + '\n\n---\n\n';
                    }
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
}

// 信号量类（用于并发控制）
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
        this.aborted = false;
    }
    
    async acquire() {
        if (this.aborted) throw new Error('ABORTED');
        if (this.current < this.max) {
            this.current++;
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
        });
    }
    
    release() {
        this.current--;
        if (this.queue.length > 0 && !this.aborted) {
            this.current++;
            const next = this.queue.shift();
            next.resolve();
        }
    }
    
    abort() {
        this.aborted = true;
        while (this.queue.length > 0) {
            this.queue.shift().reject(new Error('ABORTED'));
        }
    }
}

// 导出单例工厂
export function createAliasMergeService(config, apiService) {
    return new AliasMergeService(config, apiService);
}

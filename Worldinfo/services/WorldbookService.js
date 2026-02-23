/**
 * 业务逻辑服务层
 * 封装从原始模块迁移的核心业务逻辑
 */

import { Config } from '../core/Config.js';
import { HistoryStore, RollStore } from '../db/index.js';
import { CategoryManager } from '../generators/CategoryManager.js';
import { parseAIResponse, filterResponseTags, isTokenLimitError } from '../generators/ResponseParser.js';
import { estimateTokenCount, getEntryTotalTokens } from '../utils/token.js';
import { calculateHash } from '../utils/hash.js';
import { sleep } from '../utils/index.js';

/**
 * 世界书业务服务
 */
export class WorldbookService {
    constructor(config) {
        this.config = config || new Config();
        this.historyStore = new HistoryStore();
        this.rollStore = new RollStore();
        this.categoryManager = new CategoryManager(this.config);
        
        // 运行状态
        this.generatedWorldbook = {};
        this.isProcessing = false;
        this.isPaused = false;
        this.isStopped = false;
    }

    // ============================================================
    // 世界书数据合并
    // ============================================================

    /**
     * 标准化世界书条目
     */
    normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        
        // 统一 content 和「内容」字段
        if (entry.content !== undefined && entry['内容'] !== undefined) {
            const contentLen = String(entry.content || '').length;
            const neirongLen = String(entry['内容'] || '').length;
            if (contentLen > neirongLen) {
                entry['内容'] = entry.content;
            }
            delete entry.content;
        } else if (entry.content !== undefined) {
            entry['内容'] = entry.content;
            delete entry.content;
        }
        
        return entry;
    }

    /**
     * 标准化世界书数据
     */
    normalizeWorldbookData(data) {
        if (!data || typeof data !== 'object') return data;
        
        for (const category in data) {
            if (typeof data[category] === 'object' && data[category] !== null && !Array.isArray(data[category])) {
                // 检查是否是条目对象
                if (data[category]['关键词'] || data[category]['内容'] || data[category].content) {
                    this.normalizeEntry(data[category]);
                } else {
                    // 递归处理分类
                    for (const entryName in data[category]) {
                        if (typeof data[category][entryName] === 'object') {
                            this.normalizeEntry(data[category][entryName]);
                        }
                    }
                }
            }
        }
        return data;
    }

    /**
     * 合并世界书数据（全量模式）
     */
    mergeWorldbookData(target, source) {
        this.normalizeWorldbookData(source);
        
        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) {
                    target[key] = {};
                }
                this.mergeWorldbookData(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }

    /**
     * 合并世界书数据（增量模式）
     */
    mergeWorldbookDataIncremental(target, source) {
        this.normalizeWorldbookData(source);
        
        for (const category in source) {
            if (typeof source[category] !== 'object' || source[category] === null) continue;
            
            if (!target[category]) {
                target[category] = {};
            }
            
            for (const entryName in source[category]) {
                const sourceEntry = source[category][entryName];
                if (typeof sourceEntry !== 'object' || sourceEntry === null) continue;
                
                if (target[category][entryName]) {
                    const targetEntry = target[category][entryName];
                    
                    // 合并关键词
                    if (Array.isArray(sourceEntry['关键词']) && Array.isArray(targetEntry['关键词'])) {
                        targetEntry['关键词'] = [...new Set([...targetEntry['关键词'], ...sourceEntry['关键词']])];
                    } else if (Array.isArray(sourceEntry['关键词'])) {
                        targetEntry['关键词'] = sourceEntry['关键词'];
                    }
                    
                    // 合并内容
                    if (sourceEntry['内容']) {
                        const existingContent = targetEntry['内容'] || '';
                        const newContent = sourceEntry['内容'];
                        
                        // 检查是否已包含
                        if (newContent && !existingContent.includes(newContent.substring(0, 50))) {
                            targetEntry['内容'] = existingContent + '\n\n---\n\n' + newContent;
                        }
                    }
                } else {
                    target[category][entryName] = JSON.parse(JSON.stringify(sourceEntry));
                }
            }
        }
    }

    /**
     * 查找变更的条目
     */
    findChangedEntries(oldWorldbook, newWorldbook) {
        const changes = [];
        
        // 查找新增和修改
        for (const category in newWorldbook) {
            const oldCategory = oldWorldbook[category] || {};
            const newCategory = newWorldbook[category];
            
            for (const entryName in newCategory) {
                const oldEntry = oldCategory[entryName];
                const newEntry = newCategory[entryName];
                
                if (!oldEntry) {
                    changes.push({
                        type: 'add',
                        category,
                        entryName,
                        oldValue: null,
                        newValue: newEntry
                    });
                } else if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
                    changes.push({
                        type: 'modify',
                        category,
                        entryName,
                        oldValue: oldEntry,
                        newValue: newEntry
                    });
                }
            }
        }
        
        // 查找删除
        for (const category in oldWorldbook) {
            const oldCategory = oldWorldbook[category];
            const newCategory = newWorldbook[category] || {};
            
            for (const entryName in oldCategory) {
                if (!newCategory[entryName]) {
                    changes.push({
                        type: 'delete',
                        category,
                        entryName,
                        oldValue: oldCategory[entryName],
                        newValue: null
                    });
                }
            }
        }
        
        return changes;
    }

    /**
     * 合并世界书数据并保存历史
     */
    async mergeWithHistory(target, source, memoryIndex, memoryTitle, incrementalMode = true) {
        // 深拷贝快照
        const previousWorldbook = JSON.parse(JSON.stringify(target));
        
        // 合并数据
        if (incrementalMode) {
            this.mergeWorldbookDataIncremental(target, source);
        } else {
            this.mergeWorldbookData(target, source);
        }
        
        // 计算差异
        const changedEntries = this.findChangedEntries(previousWorldbook, target);
        
        // 保存历史
        if (changedEntries.length > 0) {
            await this.historyStore.save({
                memoryIndex,
                memoryTitle,
                previousWorldbook,
                newWorldbook: target,
                changedEntries,
                timestamp: Date.now()
            });
        }
        
        return changedEntries;
    }

    // ============================================================
    // 后处理 - 添加章节编号后缀
    // ============================================================

    /**
     * 处理结果添加章节编号后缀
     */
    postProcessWithChapterIndex(result, chapterIndex, forceChapterMarker = true) {
        if (!result || typeof result !== 'object') return result;
        if (!forceChapterMarker) return result;

        const processed = {};
        
        for (const category in result) {
            if (typeof result[category] !== 'object' || result[category] === null) {
                processed[category] = result[category];
                continue;
            }
            
            processed[category] = {};
            
            for (const entryName in result[category]) {
                let newEntryName = entryName;
                
                // 特定分类需要添加章节编号
                if (category === '剧情大纲' || category === '剧情节点' || category === '章节剧情') {
                    // 替换原有的章节号
                    newEntryName = entryName.replace(/第 [一二三四五六七八九十百千万\d]+章/g, `第${chapterIndex}章`);
                    
                    // 如果没有章节号，添加后缀
                    if (!newEntryName.includes(`第${chapterIndex}章`) && !newEntryName.includes('-第')) {
                        newEntryName = `${newEntryName}-第${chapterIndex}章`;
                    }
                }
                
                processed[category][newEntryName] = result[category][entryName];
            }
        }
        
        return processed;
    }

    // ============================================================
    // 记忆分裂
    // ============================================================

    /**
     * 将记忆分裂为两个
     */
    splitMemoryIntoTwo(memory, content) {
        if (!memory || !content) return null;
        
        const halfLength = Math.floor(content.length / 2);
        let splitPoint = halfLength;
        
        // 寻找段落分隔符
        const paragraphBreak = content.indexOf('\n\n', halfLength);
        if (paragraphBreak !== -1 && paragraphBreak < halfLength + 1000) {
            splitPoint = paragraphBreak;
        } else {
            // 寻找句子分隔符
            const sentenceBreak = content.indexOf('。', halfLength);
            if (sentenceBreak !== -1 && sentenceBreak < halfLength + 200) {
                splitPoint = sentenceBreak + 1;
            }
        }
        
        const part1 = content.substring(0, splitPoint).trim();
        const part2 = content.substring(splitPoint).trim();
        
        return [
            {
                title: `${memory.title} (上)`,
                content: part1,
                processed: false,
                failed: false,
                result: null
            },
            {
                title: `${memory.title} (下)`,
                content: part2,
                processed: false,
                failed: false,
                result: null
            }
        ];
    }

    /**
     * Token 超限自动分裂
     */
    autoSplitByTokenLimit(memory, maxTokens = 8000) {
        const content = memory.content;
        const tokens = estimateTokenCount(content);
        
        if (tokens <= maxTokens) {
            return [memory];
        }
        
        // 计算分裂点
        const ratio = maxTokens / tokens;
        const splitPoint = Math.floor(content.length * ratio);
        
        // 寻找合适的分割位置
        let actualSplitPoint = splitPoint;
        const paragraphBreak = content.lastIndexOf('\n\n', splitPoint);
        if (paragraphBreak > splitPoint - 2000 && paragraphBreak > 0) {
            actualSplitPoint = paragraphBreak;
        }
        
        const part1 = content.substring(0, actualSplitPoint).trim();
        const part2 = content.substring(actualSplitPoint).trim();
        
        return [
            {
                title: `${memory.title} (上)`,
                content: part1,
                processed: false,
                failed: false,
                result: null,
                isAutoSplit: true
            },
            {
                title: `${memory.title} (下)`,
                content: part2,
                processed: false,
                failed: false,
                result: null,
                isAutoSplit: true
            }
        ];
    }

    // ============================================================
    // 分卷功能
    // ============================================================

    /**
     * 开始新卷
     */
    startNewVolume(currentWorldbook, worldbookVolumes, currentVolumeIndex) {
        if (Object.keys(currentWorldbook).length > 0) {
            worldbookVolumes.push({
                volumeIndex: currentVolumeIndex,
                worldbook: JSON.parse(JSON.stringify(currentWorldbook)),
                timestamp: Date.now()
            });
        }
        
        currentVolumeIndex++;
        
        // 重置世界书（保留基础分类）
        const newWorldbook = {
            地图环境: {},
            剧情节点: {},
            角色: {},
            知识书: {}
        };
        
        return { newWorldbook, currentVolumeIndex };
    }

    /**
     * 合并所有卷
     */
    mergeAllVolumes(worldbookVolumes, currentWorldbook, currentVolumeIndex) {
        const merged = {};
        
        // 合并已完成的卷
        for (const volume of worldbookVolumes) {
            for (const category in volume.worldbook) {
                if (!merged[category]) {
                    merged[category] = {};
                }
                for (const entryName in volume.worldbook[category]) {
                    const key = merged[category][entryName] 
                        ? `${entryName}_卷${volume.volumeIndex + 1}` 
                        : entryName;
                    merged[category][key] = volume.worldbook[category][entryName];
                }
            }
        }
        
        // 合并当前卷
        for (const category in currentWorldbook) {
            if (!merged[category]) {
                merged[category] = {};
            }
            for (const entryName in currentWorldbook[category]) {
                const key = merged[category][entryName] 
                    ? `${entryName}_卷${currentVolumeIndex + 1}` 
                    : entryName;
                merged[category][key] = currentWorldbook[category][entryName];
            }
        }
        
        return merged;
    }

    // ============================================================
    // 工具函数
    // ============================================================

    /**
     * 获取启用的分类名称
     */
    getEnabledCategoryNames() {
        const categories = this.categoryManager.getEnabledCategories();
        const names = categories.map(cat => cat.name);
        // 添加固定分类
        names.push('剧情大纲', '知识书', '文风配置', '地图环境', '剧情节点');
        return names;
    }

    /**
     * 计算文件哈希
     */
    async calculateFileHash(content) {
        return await calculateHash(content);
    }

    /**
     * 检查是否是 Token 超限错误
     */
    checkIsTokenLimitError(error) {
        return isTokenLimitError(error?.message || '');
    }
}

// 导出单例
export const worldbookService = new WorldbookService();

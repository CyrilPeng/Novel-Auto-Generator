/**
 * Roll 功能服务层
 * 处理重 Roll 相关的业务逻辑
 */
import { RollStore, HistoryStore } from '../db/index.js';
import { APIService } from './APIService.js';
import { WorldbookService } from './WorldbookService.js';
import { parseAIResponse } from '../generators/ResponseParser.js';
import { estimateTokenCount } from '../utils/token.js';

/**
 * Roll 功能服务
 */
export class RollService {
    constructor(config, apiService) {
        this.config = config;
        this.rollStore = new RollStore();
        this.historyStore = new HistoryStore();
        this.apiService = apiService || new APIService();
        this.worldbookService = new WorldbookService(config);
    }

    /**
     * 保存 Roll 结果
     * @param {number} memoryIndex - 记忆块索引
     * @param {Object} result - Roll 结果
     */
    async saveRollResult(memoryIndex, result) {
        return await this.rollStore.save(memoryIndex, result);
    }

    /**
     * 获取 Roll 历史
     * @param {number} memoryIndex - 记忆块索引
     * @returns {Promise<Array>} Roll 历史记录
     */
    async getRollHistory(memoryIndex) {
        return await this.rollStore.getByMemoryIndex(memoryIndex);
    }

    /**
     * 清空 Roll 历史
     * @param {number} memoryIndex - 记忆块索引
     */
    async clearRollHistory(memoryIndex) {
        await this.rollStore.clear(memoryIndex);
    }

    /**
     * 执行 Roll（重新生成）
     * @param {Object} chapter - 章节数据
     * @param {number} chapterIndex - 章节索引
     * @param {Function} onProgress - 进度回调
     * @returns {Promise<Object>} Roll 结果
     */
    async executeRoll(chapter, chapterIndex, onProgress = null) {
        try {
            onProgress?.({ status: 'processing', chapterIndex });

            // 构建提示词
            const prompt = this.buildRollPrompt(chapter);
            
            // 调用 API
            const response = await this.apiService.callAPI(prompt, chapterIndex);
            
            // 解析响应
            const result = parseAIResponse(response);
            
            // 后处理
            const processedResult = this.worldbookService.postProcessWithChapterIndex(
                result,
                chapterIndex + 1,
                this.config.get('forceChapterMarker', true)
            );
            
            // 保存 Roll 结果
            await this.saveRollResult(chapterIndex, {
                timestamp: Date.now(),
                result: processedResult,
                prompt,
                response
            });
            
            onProgress?.({ status: 'completed', chapterIndex, result: processedResult });
            
            return processedResult;
            
        } catch (error) {
            onProgress?.({ status: 'failed', chapterIndex, error: error.message });
            throw error;
        }
    }

    /**
     * 批量 Roll
     * @param {Array} chapters - 章节数组
     * @param {Array} indices - 要重 Roll 的索引数组
     * @param {Function} onProgress - 进度回调
     * @returns {Promise<Object>} Roll 结果
     */
    async executeBatchRoll(chapters, indices, onProgress = null) {
        const results = {};
        const errors = {};
        
        for (const index of indices) {
            try {
                const chapter = chapters[index];
                if (!chapter) continue;
                
                const result = await this.executeRoll(chapter, index, onProgress);
                results[index] = result;
                
            } catch (error) {
                errors[index] = error;
                onProgress?.({ status: 'failed', chapterIndex: index, error: error.message });
            }
        }
        
        return { results, errors };
    }

    /**
     * 条目级别的重 Roll
     * @param {string} category - 分类名称
     * @param {string} entryName - 条目名称
     * @param {Object} currentEntry - 当前条目数据
     * @param {string} customPrompt - 自定义提示词
     * @returns {Promise<Object>} 重 Roll 结果
     */
    async rerollEntry(category, entryName, currentEntry, customPrompt = '') {
        const prompt = this.buildEntryRerollPrompt(category, entryName, currentEntry, customPrompt);
        
        const response = await this.apiService.callAPI(prompt);
        
        // 尝试解析 JSON
        let result;
        try {
            result = parseAIResponse(response);
        } catch (e) {
            // 如果不是 JSON，直接返回文本
            result = { '内容': response };
        }
        
        return result;
    }

    /**
     * 构建 Roll 提示词
     * @param {Object} chapter - 章节数据
     * @returns {string} 提示词
     */
    buildRollPrompt(chapter) {
        const categories = this.worldbookService.getEnabledCategoryNames();
        const categoryNames = categories.join(',');
        
        return `你是专业的小说世界书生成专家。请仔细阅读以下小说内容，提取其中的关键信息，生成高质量的世界书条目。

需要提取的分类：${categoryNames}

## 小说内容
${chapter.content}

## 要求
1. 必须基于提供的具体小说内容
2. 只输出指定分类的条目
3. 关键词必须是文中实际出现的名称
4. 内容必须基于原文描述
5. 使用 JSON 格式输出

请直接输出 JSON 格式，不要包含代码块标记。`;
    }

    /**
     * 构建条目重 Roll 提示词
     * @param {string} category - 分类名称
     * @param {string} entryName - 条目名称
     * @param {Object} currentEntry - 当前条目数据
     * @param {string} customPrompt - 自定义提示词
     * @returns {string} 提示词
     */
    buildEntryRerollPrompt(category, entryName, currentEntry, customPrompt = '') {
        const keywords = currentEntry['关键词']?.join(', ') || '无';
        const content = currentEntry['内容'] || '无';
        
        let prompt = `你是世界书条目优化专家。请重新生成以下条目，使其更加准确和完整。

## 当前条目
分类：${category}
名称：${entryName}
关键词：${keywords}
内容：${content}

## 要求
1. 保留所有重要信息
2. 优化表达和结构
3. 补充可能的遗漏
4. 使用 markdown 格式

`;
        
        if (customPrompt) {
            prompt += `## 额外要求\n${customPrompt}\n\n`;
        }
        
        prompt += `请直接输出优化后的条目内容（JSON 格式）：`;
        
        return prompt;
    }

    /**
     * 比较两个 Roll 结果
     * @param {Object} resultA - 结果 A
     * @param {Object} resultB - 结果 B
     * @returns {Object} 比较结果
     */
    compareRollResults(resultA, resultB) {
        const changes = [];
        
        // 比较分类
        const allCategories = new Set([
            ...Object.keys(resultA || {}),
            ...Object.keys(resultB || {})
        ]);
        
        for (const category of allCategories) {
            const entriesA = resultA?.[category] || {};
            const entriesB = resultB?.[category] || {};
            
            const allEntries = new Set([
                ...Object.keys(entriesA),
                ...Object.keys(entriesB)
            ]);
            
            for (const entryName of allEntries) {
                const entryA = entriesA[entryName];
                const entryB = entriesB[entryName];
                
                if (!entryA && entryB) {
                    changes.push({ type: 'add', category, entryName });
                } else if (entryA && !entryB) {
                    changes.push({ type: 'delete', category, entryName });
                } else if (entryA && entryB) {
                    const jsonA = JSON.stringify(entryA);
                    const jsonB = JSON.stringify(entryB);
                    if (jsonA !== jsonB) {
                        changes.push({ type: 'modify', category, entryName });
                    }
                }
            }
        }
        
        return { changes, totalChanges: changes.length };
    }

    /**
     * 获取 Roll 统计信息
     * @param {number} memoryIndex - 记忆块索引
     * @returns {Promise<Object>} 统计信息
     */
    async getRollStats(memoryIndex) {
        const rolls = await this.getRollHistory(memoryIndex);
        
        return {
            count: rolls.length,
            latestRoll: rolls.length > 0 ? rolls[rolls.length - 1] : null,
            totalTokens: rolls.reduce((sum, roll) => {
                const tokens = estimateTokenCount(JSON.stringify(roll.result || {}));
                return sum + tokens;
            }, 0)
        };
    }
}

// 导出单例工厂
export function createRollService(config, apiService) {
    return new RollService(config, apiService);
}

/**
 * 世界书处理器主类
 * 协调各模块完成世界书生成任务
 */
import { Config } from './Config.js';
import { State } from './State.js';
import { APIManager } from '../api/APIManager.js';
import { HistoryStore, RollStore } from '../db/index.js';
import { CategoryManager } from '../generators/CategoryManager.js';
import { EntryManager } from '../generators/EntryManager.js';
import { TavernExporter, JSONExporter, TXTExporter } from '../exporters/index.js';
import { downloadFile } from '../utils/file.js';

export class WorldbookProcessor {
    constructor() {
        this.config = new Config();
        this.state = new State();
        this.apiManager = null;
        this.historyStore = new HistoryStore();
        this.rollStore = new RollStore();
        this.categoryManager = new CategoryManager(this.config);
        this.entryManager = new EntryManager();
        
        this.exporters = {
            tavern: new TavernExporter(),
            json: new JSONExporter(),
            txt: new TXTExporter()
        };

        // 事件监听器
        this.listeners = {};
    }

    /**
     * 初始化API管理器
     */
    initAPI() {
        const apiConfig = {
            provider: this.config.get('useTavernApi') ? 'tavern' : this.config.get('customApiProvider'),
            apiKey: this.config.get('customApiKey'),
            model: this.config.get('customApiModel'),
            baseUrl: this.config.get('customApiEndpoint'),
            timeout: this.config.get('apiTimeout'),
            filterResponseTags: this.config.get('filterResponseTags')
        };
        this.apiManager = new APIManager(apiConfig);
    }

    /**
     * 注册事件监听器
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {any} data - 事件数据
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`[处理器] 事件处理错误:`, e);
                }
            });
        }
    }

    /**
     * 开始处理文本生成世界书
     * @param {Array<Object>} chunks - 文本块数组
     * @param {Object} options - 处理选项
     */
    async process(chunks, options = {}) {
        this.initAPI();
        this.state.reset();
        this.state.memoryQueue = chunks;
        this.state.updateProgress(0, chunks.length);
        this.state.start();

        this.emit('start', { total: chunks.length });

        try {
            for (let i = 0; i < chunks.length; i++) {
                // 检查是否停止
                if (this.state.isStopped) {
                    break;
                }

                // 等待暂停恢复
                while (this.state.isPaused && !this.state.isStopped) {
                    await this.sleep(500);
                }

                if (this.state.isStopped) break;

                const chunk = chunks[i];
                this.state.currentIndex = i;
                this.emit('chunk.start', { index: i, total: chunks.length, title: chunk.title });

                try {
                    // 处理单个块
                    const result = await this.processChunk(chunk, i);
                    
                    // 合并结果
                    this.mergeResult(result);
                    
                    // 更新统计
                    this.state.recordSuccess();
                    
                    // 保存历史
                    await this.saveHistory(i, chunk.title, result);
                    
                    this.emit('chunk.complete', { index: i, result });
                } catch (error) {
                    console.error(`[处理器] 处理块${i}失败:`, error);
                    this.state.recordError();
                    this.state.failedQueue.push({ index: i, chunk, error: error.message });
                    this.emit('chunk.error', { index: i, error: error.message });
                }

                // 更新进度
                this.state.updateProgress(i + 1, chunks.length);
                this.emit('progress', this.state.progress);

                // 定期保存状态
                if ((i + 1) % 5 === 0) {
                    await this.state.saveToDB();
                }
            }

            this.state.complete();
            this.emit('complete', { 
                worldbook: this.state.generatedWorldbook,
                stats: this.state.stats 
            });

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * 处理单个文本块
     * @param {Object} chunk - 文本块
     * @param {number} index - 块索引
     * @returns {Promise<Object>} 处理结果
     */
    async processChunk(chunk, index) {
        // 构建提示词
        const prompt = this.buildPrompt(chunk);
        const messages = [{ role: 'user', content: prompt }];

        // 调用API生成
        let response;
        if (this.config.get('debugMode')) {
            // 调试模式：流式输出
            response = await this.apiManager.streamGenerate(messages, (chunk, full) => {
                this.emit('stream.chunk', { index, chunk, full });
            });
        } else {
            response = await this.apiManager.generate(messages);
        }

        // 解析响应
        return this.parseResponse(response);
    }

    /**
     * 构建提示词
     * @param {Object} chunk - 文本块
     * @returns {string} 提示词
     */
    buildPrompt(chunk) {
        const categories = this.categoryManager.getEnabledCategories();
        const categoryNames = categories.map(c => c.name).join('、');

        let prompt = `请仔细阅读以下小说内容，提取关键信息，生成世界书条目。\n\n`;
        prompt += `需要提取的分类：${categoryNames}\n\n`;
        prompt += `小说内容：\n${chunk.content}\n\n`;
        prompt += `请输出JSON格式，包含上述分类的条目信息。`;

        return prompt;
    }

    /**
     * 解析AI响应
     * @param {string} response - AI响应文本
     * @returns {Object} 解析结果
     */
    parseResponse(response) {
        try {
            // 尝试直接解析JSON
            return JSON.parse(response);
        } catch (e) {
            // 尝试从代码块中提取
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            
            // 尝试提取任何JSON对象
            const objMatch = response.match(/\{[\s\S]*\}/);
            if (objMatch) {
                return JSON.parse(objMatch[0]);
            }
            
            throw new Error('无法解析AI响应');
        }
    }

    /**
     * 合并处理结果到世界书
     * @param {Object} result - 处理结果
     */
    mergeResult(result) {
        for (const [categoryName, entries] of Object.entries(result)) {
            if (!this.state.generatedWorldbook[categoryName]) {
                this.state.generatedWorldbook[categoryName] = [];
            }
            
            if (typeof entries === 'object') {
                for (const [entryName, entryData] of Object.entries(entries)) {
                    const entry = {
                        name: entryName,
                        category: categoryName,
                        keywords: entryData.关键词 || [],
                        content: entryData.内容 || ''
                    };
                    this.state.generatedWorldbook[categoryName].push(entry);
                }
            }
        }
    }

    /**
     * 保存历史记录
     * @param {number} index - 索引
     * @param {string} title - 标题
     * @param {Object} result - 结果
     */
    async saveHistory(index, title, result) {
        const previousWorldbook = JSON.parse(JSON.stringify(this.state.generatedWorldbook));
        await this.historyStore.save({
            memoryIndex: index,
            memoryTitle: title,
            previousWorldbook: previousWorldbook,
            newWorldbook: this.state.generatedWorldbook,
            changedEntries: Object.keys(result),
            fileHash: this.state.currentFileHash
        });
    }

    /**
     * 导出世界书
     * @param {string} format - 导出格式: 'tavern'|'json'|'txt'
     * @param {Object} options - 导出选项
     */
    export(format, options = {}) {
        const exporter = this.exporters[format];
        if (!exporter) {
            throw new Error(`不支持的导出格式: ${format}`);
        }

        const content = exporter.export(this.state.generatedWorldbook, options);
        const filename = options.filename || `worldbook_${Date.now()}.${exporter.extension}`;
        downloadFile(content, filename, exporter.mimeType);
    }

    /**
     * 暂停处理
     */
    pause() {
        this.state.pause();
        this.emit('pause');
    }

    /**
     * 恢复处理
     */
    resume() {
        this.state.resume();
        this.emit('resume');
    }

    /**
     * 停止处理
     */
    stop() {
        this.state.stop();
        this.emit('stop');
    }

    /**
     * 延迟函数
     * @param {number} ms - 毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

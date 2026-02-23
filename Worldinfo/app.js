/**
 * Worldinfo 应用集成模块
 * 整合 TXT 转世界书、EPUB 转 TXT、世界书导出三大功能
 * 完整集成所有 UI 面板和事件系统
 */

import { WorldbookProcessor, Config, State, VolumeManager, ParallelProcessor } from './core/index.js';
import { TxtParser, EpubParser, ContentSplitter, ChapterDetector } from './parsers/index.js';
import { TavernExporter, JSONExporter, TXTExporter } from './exporters/index.js';
import { CategoryManager, PromptBuilder, parseAIResponse, filterResponseTags } from './generators/index.js';
import { HistoryStore, RollStore, FileMetaStore } from './db/index.js';
import { WorldbookService, APIService, RollService, AliasMergeService } from './services/index.js';
import {
    TxtToWorldbookPanel,
    EpubToTxtPanel,
    WorldbookExportPanel,
    HistoryViewer,
    RollSelector,
    FindReplacePanel,
    ConsolidatePanel,
    ClearTagsPanel,
    HelpModal,
    BatchRerollPanel,
    ProcessedResultsPanel,
    WorldbookImportPanel
} from './ui/panels/index.js';
import { UIManager, Modal, ProgressBar, showSuccess, showError, showInfo, showWarning } from './ui/index.js';
import { detectFileEncoding, calculateHash, deepClone, debugLogger, taskManager, errorHandler, withErrorHandling } from './utils/index.js';
// 注意：detectFileEncoding 和 calculateHash 在当前文件中未直接使用，但保留导入以备将来使用

/**
 * 应用配置
 */
export class WorldinfoAppConfig {
    constructor({
        containerId = 'worldinfo-app-container',
        debugMode = false,
        autoSave = true,
        autoSaveInterval = 5
    } = {}) {
        this.containerId = containerId;
        this.debugMode = debugMode;
        this.autoSave = autoSave;
        this.autoSaveInterval = autoSaveInterval;
    }
}

/**
 * Worldinfo 应用主类
 */
export class WorldinfoApp {
    constructor(config = {}) {
        this.config = new WorldinfoAppConfig(config);
        this.isInitialized = false;
        this.isProcessing = false;

        // 核心组件
        this.processor = null;
        this.uiManager = null;
        this.configManager = null;
        this.state = null;

        // 功能模块
        this.categoryManager = null;
        this.historyStore = null;
        this.rollStore = null;
        this.fileMetaStore = null;

        // 服务层
        this.worldbookService = null;
        this.apiService = null;
        this.rollService = null;
        this.aliasMergeService = null;

        // 解析器
        this.txtParser = null;
        this.epubParser = null;
        this.chapterDetector = null;
        this.contentSplitter = null;

        // 导出器
        this.exporters = {};

        // UI 面板
        this.txtToWorldbookPanel = null;
        this.epubToTxtPanel = null;
        this.worldbookExportPanel = null;
        this.historyViewer = null;
        this.rollSelector = null;
        this.findReplaceDialog = null;
        this.consolidatePanel = null;
        this.clearTagsPanel = null;
        this.helpModal = null;
        this.batchRerollPanel = null;
        this.processedResultsPanel = null;
        this.worldbookImportPanel = null;

        // 工具
        this.debugLogger = debugLogger;
        this.taskManager = taskManager;

        // 当前状态
        this.currentFile = null;
        this.currentFileHash = null;
        this.chapters = [];
        this.generatedWorldbook = {};
        this.currentChapterIndex = 0;
    }

    /**
     * 初始化应用
     */
    async init() {
        if (this.isInitialized) return this;

        this.log('应用初始化开始...');

        // 初始化配置管理器
        this.configManager = new Config();

        // 初始化状态
        this.state = new State();

        // 初始化 UI 管理器
        this.uiManager = new UIManager({
            containerId: this.config.containerId,
            debugMode: this.config.debugMode,
            toastEnabled: true
        });
        this.uiManager.init();

        // 初始化处理器
        this.processor = new WorldbookProcessor(this.configManager);

        // 初始化功能模块
        this.categoryManager = new CategoryManager(this.configManager);
        this.historyStore = new HistoryStore();
        this.rollStore = new RollStore();
        this.fileMetaStore = new FileMetaStore();

        // 初始化服务层
        this.worldbookService = new WorldbookService(this.configManager);
        this.apiService = new APIService({
            useTavernApi: this.configManager.get('useTavernApi', true),
            customApiProvider: this.configManager.get('customApiProvider', 'gemini'),
            customApiKey: this.configManager.get('customApiKey', ''),
            customApiEndpoint: this.configManager.get('customApiEndpoint', ''),
            customApiModel: this.configManager.get('customApiModel', 'gemini-2.5-flash'),
            apiTimeout: this.configManager.get('apiTimeout', 120000),
            filterResponseTags: this.configManager.get('filterResponseTags', 'thinking,/think'),
            promptMessageChain: this.configManager.get('promptMessageChain', [{ role: 'user', content: '{PROMPT}', enabled: true }]),
            debugMode: this.config.debugMode
        });
        this.rollService = new RollService(this.configManager, this.apiService);
        this.aliasMergeService = new AliasMergeService(this.configManager, this.apiService);

        // 初始化解析器
        this.txtParser = new TxtParser();
        this.epubParser = new EpubParser();
        this.chapterDetector = new ChapterDetector({
            pattern: this.configManager.get('chapterRegexPattern')
        });
        this.contentSplitter = new ContentSplitter({
            chunkSize: this.configManager.get('chunkSize', 15000)
        });

        // 初始化导出器
        this.exporters = {
            tavern: new TavernExporter(),
            json: new JSONExporter(),
            txt: new TXTExporter()
        };

        // 创建 UI 面板
        this.createPanels();

        // 绑定事件
        this.bindEvents();

        // 加载保存的状态
        await this.loadSavedState();

        this.isInitialized = true;
        this.log('应用初始化完成');

        return this;
    }

    /**
     * 创建 UI 面板
     */
    createPanels() {
        // TXT 转世界书主面板
        this.txtToWorldbookPanel = new TxtToWorldbookPanel();
        this.txtToWorldbookPanel.onFileSelect = (file) => this.handleFileSelect(file);
        this.txtToWorldbookPanel.onStart = () => this.startConversion();
        this.txtToWorldbookPanel.onPause = () => this.pauseConversion();
        this.txtToWorldbookPanel.onResume = () => this.resumeConversion();
        this.txtToWorldbookPanel.onStop = () => this.stopConversion();

        // EPUB 转 TXT 面板
        this.epubToTxtPanel = new EpubToTxtPanel();
        this.epubToTxtPanel.onConvert = (files) => this.convertEpubToTxt(files);

        // 世界书导出面板
        this.worldbookExportPanel = new WorldbookExportPanel();
        this.worldbookExportPanel.onExport = (format, options) => this.exportWorldbook(format, options);

        // 历史记录查看器
        this.historyViewer = new HistoryViewer({
            onClose: () => this.log('历史记录查看器已关闭'),
            onRollback: (history) => this.handleHistoryRollback(history)
        });

        // Roll 选择器
        this.rollSelector = new RollSelector({
            memoryIndex: 0,
            chapterTitle: '',
            currentResult: null,
            onSelect: (roll) => this.log('选择 Roll:', roll),
            onApply: (result) => this.applyRollResult(result),
            onClose: () => this.log('Roll 选择器已关闭')
        });
        this.rollSelector.init(this.configManager, this.apiService);

        // 查找替换对话框
        this.findReplaceDialog = new FindReplacePanel({
            worldbook: this.generatedWorldbook,
            onFind: (results) => this.log('查找结果:', results),
            onReplace: (data) => this.handleReplace(data),
            onClose: () => this.log('查找替换已关闭')
        });

        // 整理条目面板
        this.consolidatePanel = new ConsolidatePanel({
            category: '',
            entries: {},
            onConsolidate: (data) => this.handleConsolidate(data),
            onClose: () => this.log('整理条目已关闭')
        });

        // 清除标签面板
        this.clearTagsPanel = new ClearTagsPanel({
            worldbook: this.generatedWorldbook,
            defaultTags: 'thinking,/think,thought,/thought',
            onClear: (data) => this.handleClearTags(data),
            onClose: () => this.log('清除标签已关闭')
        });

        // 帮助弹窗
        this.helpModal = new HelpModal({
            onClose: () => this.log('帮助弹窗已关闭')
        });

        // 批量重 Roll 面板
        this.batchRerollPanel = new BatchRerollPanel({
            onClose: () => this.log('批量重 Roll 面板已关闭'),
            onBatchReroll: (data) => this.handleBatchReroll(data)
        });

        // 已处理结果查看面板
        this.processedResultsPanel = new ProcessedResultsPanel({
            onClose: () => this.log('已处理结果面板已关闭'),
            onViewEntry: (entry) => this.log('查看条目:', entry)
        });

        // 世界书导入面板
        this.worldbookImportPanel = new WorldbookImportPanel({
            onClose: () => this.log('世界书导入面板已关闭'),
            onImport: (data) => this.handleWorldbookImport(data)
        });

        // 注册到 UI 管理器
        this.uiManager.registerPanel('txtToWorldbook', this.txtToWorldbookPanel);
        this.uiManager.registerPanel('epubToTxt', this.epubToTxtPanel);
        this.uiManager.registerPanel('worldbookExport', this.worldbookExportPanel);
        this.uiManager.registerPanel('history', this.historyViewer);
        this.uiManager.registerPanel('roll', this.rollSelector);
        this.uiManager.registerPanel('findReplace', this.findReplaceDialog);
        this.uiManager.registerPanel('consolidate', this.consolidatePanel);
        this.uiManager.registerPanel('clearTags', this.clearTagsPanel);
        this.uiManager.registerPanel('help', this.helpModal);
        this.uiManager.registerPanel('batchReroll', this.batchRerollPanel);
        this.uiManager.registerPanel('processedResults', this.processedResultsPanel);
        this.uiManager.registerPanel('worldbookImport', this.worldbookImportPanel);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 处理器事件
        this.processor?.on('start', (data) => {
            this.isProcessing = true;
            this.uiManager.emit('processing.start', data);
            this.txtToWorldbookPanel?.updateButtonState('running');
            this.log('处理开始', data);
        });

        this.processor?.on('progress', (data) => {
            this.uiManager.emit('processing.progress', data);
            this.txtToWorldbookPanel?.updateProgress(data.index + 1, data.total);
            this.txtToWorldbookPanel?.appendStreamLog(`✅ 第${data.index + 1}章完成`);
            this.log('处理进度', data);

            // 自动保存
            if (this.config.autoSave && (data.index + 1) % this.config.autoSaveInterval === 0) {
                this.autoSave();
            }
        });

        this.processor?.on('complete', (data) => {
            this.isProcessing = false;
            this.uiManager.emit('processing.complete', data);
            this.txtToWorldbookPanel?.updateButtonState('stopped');
            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);
            this.log('处理完成', data);
            this.autoSave();
            showSuccess('转换完成！');
        });

        this.processor?.on('error', (error) => {
            this.isProcessing = false;
            this.uiManager.emit('processing.error', error);
            this.txtToWorldbookPanel?.updateButtonState('stopped');
            this.error('处理错误', error);
            showError('处理失败：' + error.message);
        });

        // UI 管理器事件
        this.uiManager?.on('ui.open', () => {
            this.log('UI 打开');
        });

        this.uiManager?.on('ui.close', () => {
            this.log('UI 关闭');
        });

        // 工具按钮事件（通过 UI 管理器触发）
        this.uiManager?.on('tool.history', () => this.openHistoryViewer());
        this.uiManager?.on('tool.roll', (index) => this.openRollSelector(index));
        this.uiManager?.on('tool.findReplace', () => this.openFindReplaceDialog());
        this.uiManager?.on('tool.consolidate', (category) => this.openConsolidatePanel(category));
        this.uiManager?.on('tool.clearTags', () => this.openClearTagsPanel());
    }

    /**
     * 处理文件选择
     */
    async handleFileSelect(file) {
        if (!file) return;

        try {
            this.txtToWorldbookPanel?.appendStreamLog(`📂 正在读取文件：${file.name}...`);

            // 检测文件类型
            const ext = this.getFileExtension(file.name).toLowerCase();
            let content;
            let encoding = 'UTF-8';

            if (ext === 'epub') {
                this.txtToWorldbookPanel?.appendStreamLog('📖 检测到 EPUB 文件，开始解析...');
                const result = await this.epubParser.parse(file);
                content = result.content;
                encoding = 'EPUB';
            } else {
                this.txtToWorldbookPanel?.appendStreamLog('📄 检测到 TXT 文件，开始检测编码...');
                const detectResult = await detectFileEncoding(file);
                content = detectResult.content;
                encoding = detectResult.encoding;
            }

            // 保存文件信息
            this.currentFile = file;
            this.currentFileHash = await calculateHash(content);

            // 分割内容
            this.txtToWorldbookPanel?.appendStreamLog('📐 开始分割章节...');
            this.chapters = this.contentSplitter.split(content);

            // 更新 UI
            this.txtToWorldbookPanel?.updateFileInfo(file.name, this.chapters.length, encoding);
            this.txtToWorldbookPanel?.updateChapterList(this.chapters);
            this.txtToWorldbookPanel?.appendStreamLog(`✅ 文件加载完成，共${this.chapters.length}章`);

            // 保存文件元数据
            await this.fileMetaStore.save({
                fileName: file.name,
                fileSize: file.size,
                encoding,
                chunkCount: this.chapters.length,
                fileHash: this.currentFileHash
            });

        } catch (error) {
            this.error('文件处理失败', error);
            showError('文件处理失败：' + error.message);
        }
    }

    /**
     * 开始转换
     */
    async startConversion() {
        if (this.chapters.length === 0) {
            showError('请先上传文件');
            return;
        }

        try {
            this.txtToWorldbookPanel?.clearStreamLog();
            this.txtToWorldbookPanel?.appendStreamLog('🚀 开始转换...');

            // 开始处理
            await this.processor.process(this.chapters, {
                file: this.currentFile,
                fileHash: this.currentFileHash
            });

        } catch (error) {
            this.error('转换失败', error);
            showError('转换失败：' + error.message);
        }
    }

    /**
     * 暂停转换
     */
    pauseConversion() {
        this.processor?.pause();
        this.txtToWorldbookPanel?.updateButtonState('paused');
        this.txtToWorldbookPanel?.appendStreamLog('⏸️ 已暂停');
    }

    /**
     * 恢复转换
     */
    resumeConversion() {
        this.processor?.resume();
        this.txtToWorldbookPanel?.updateButtonState('running');
        this.txtToWorldbookPanel?.appendStreamLog('▶️ 已恢复');
    }

    /**
     * 停止转换
     */
    stopConversion() {
        this.processor?.stop();
        this.isProcessing = false;
        this.txtToWorldbookPanel?.updateButtonState('stopped');
        this.txtToWorldbookPanel?.appendStreamLog('⏹️ 已停止');
    }

    /**
     * EPUB 转 TXT
     */
    async convertEpubToTxt(files) {
        if (!files || files.length === 0) {
            showError('请选择 EPUB 文件');
            return;
        }

        try {
            const results = [];

            for (const file of files) {
                this.log(`正在转换：${file.name}`);
                const result = await this.epubParser.parse(file);
                results.push({
                    fileName: file.name,
                    title: result.title,
                    content: result.content
                });
            }

            // 合并内容
            const allContent = results.map(r => `══ ${r.title || r.fileName} ══\n\n${r.content}`).join('\n\n');

            // 下载
            const firstName = results[0].fileName.replace(/\.epub$/i, '');
            const filename = results.length === 1
                ? `${firstName}.txt`
                : `${firstName}_合并${results.length}本.txt`;

            const blob = new Blob([allContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showSuccess(`已转换 ${results.length} 个文件`);

        } catch (error) {
            this.error('EPUB 转换失败', error);
            showError('EPUB 转换失败：' + error.message);
        }
    }

    /**
     * 导出世界书
     */
    exportWorldbook(format = 'tavern', options = {}) {
        const worldbook = this.generatedWorldbook;

        if (Object.keys(worldbook).length === 0) {
            showError('没有可导出的数据');
            return;
        }

        try {
            const exporter = this.exporters[format];
            if (!exporter) {
                showError('不支持的导出格式：' + format);
                return;
            }

            const content = exporter.export(worldbook, options);
            const filename = options.filename || `worldbook_${Date.now()}.${exporter.config.extension}`;

            exporter.download(content, filename);
            showSuccess(`已导出${format.toUpperCase()}格式`);

        } catch (error) {
            this.error('导出失败', error);
            showError('导出失败：' + error.message);
        }
    }

    /**
     * 打开历史记录查看器
     */
    openHistoryViewer() {
        this.historyViewer.open();
    }

    /**
     * 处理历史回滚
     */
    async handleHistoryRollback(history) {
        try {
            // 恢复世界书数据
            this.generatedWorldbook = deepClone(history.previousWorldbook);
            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);
            showSuccess('已成功回滚到历史版本');
        } catch (error) {
            this.error('历史回滚失败', error);
            showError('历史回滚失败：' + error.message);
        }
    }

    /**
     * 打开 Roll 选择器
     */
    openRollSelector(chapterIndex = 0) {
        this.currentChapterIndex = chapterIndex;
        const chapter = this.chapters[chapterIndex];

        this.rollSelector.config.memoryIndex = chapterIndex;
        this.rollSelector.config.chapterTitle = chapter?.title || `第${chapterIndex + 1}章`;
        this.rollSelector.config.currentResult = this.processor?.state?.generatedWorldbook || {};

        this.rollSelector.open();
    }

    /**
     * 应用 Roll 结果
     */
    applyRollResult(result) {
        try {
            // 合并结果
            this.worldbookService.mergeWorldbookData(this.generatedWorldbook, result);
            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);
            showSuccess('已应用 Roll 结果');
        } catch (error) {
            this.error('应用 Roll 结果失败', error);
            showError('应用 Roll 结果失败：' + error.message);
        }
    }

    /**
     * 打开查找替换对话框
     */
    openFindReplaceDialog() {
        this.findReplaceDialog.config.worldbook = this.generatedWorldbook;
        this.findReplaceDialog.open();
    }

    /**
     * 处理替换
     */
    handleReplace(data) {
        try {
            const { results, replaceTerm, mode } = data;
            let replaceCount = 0;

            for (const result of results) {
                const { category, entryName } = result;
                const entry = this.generatedWorldbook[category]?.[entryName];
                if (!entry) continue;

                if (entry['关键词']) {
                    const newKeywords = entry['关键词'].map(k => k.replace(new RegExp(data.searchTerm, 'g'), replaceTerm));
                    entry['关键词'] = newKeywords;
                    replaceCount += newKeywords.length;
                }

                if (entry['内容']) {
                    entry['内容'] = entry['内容'].replace(new RegExp(data.searchTerm, 'g'), replaceTerm);
                    replaceCount++;
                }
            }

            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);
            showSuccess(`已替换 ${replaceCount} 处`);

        } catch (error) {
            this.error('替换失败', error);
            showError('替换失败：' + error.message);
        }
    }

    /**
     * 打开整理条目面板
     */
    openConsolidatePanel(category = '') {
        const entries = this.generatedWorldbook[category] || {};
        this.consolidatePanel.config.category = category;
        this.consolidatePanel.config.entries = entries;
        this.consolidatePanel.open();
    }

    /**
     * 处理整理条目
     */
    async handleConsolidate(data) {
        try {
            const { category, entries, preset, customPrompt } = data;
            this.log('整理条目:', data);

            // 这里应该调用 AI 服务进行整理
            // 目前仅作为框架演示
            showInfo(`整理功能已触发\n分类：${category}\n条目数：${Object.keys(entries).length}\n预设：${preset}`);

        } catch (error) {
            this.error('整理条目失败', error);
            showError('整理条目失败：' + error.message);
        }
    }

    /**
     * 打开清除标签面板
     */
    openClearTagsPanel() {
        this.clearTagsPanel.config.worldbook = this.generatedWorldbook;
        this.clearTagsPanel.open();
    }

    /**
     * 处理清除标签
     */
    async handleClearTags(data) {
        try {
            const { tags, categories, onProgress } = data;
            let clearedCount = 0;
            let totalEntries = 0;

            // 统计总数
            for (const category of categories) {
                const entries = this.generatedWorldbook[category] || {};
                totalEntries += Object.keys(entries).length;
            }

            // 执行清理
            for (const category of categories) {
                const entries = this.generatedWorldbook[category] || {};

                for (const entry of Object.values(entries)) {
                    if (entry['内容']) {
                        let content = entry['内容'];
                        for (const tag of tags) {
                            if (tag.startsWith('/')) {
                                const tagName = tag.substring(1);
                                content = content.replace(new RegExp(`^[\\s\\S]*?<\\/${tagName}>`, 'gi'), '');
                            } else {
                                content = content.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
                            }
                        }
                        entry['内容'] = content;
                        clearedCount++;
                    }

                    onProgress?.(clearedCount, totalEntries);
                }
            }

            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);
            showSuccess(`已清理 ${clearedCount} 个条目的标签`);

        } catch (error) {
            this.error('清除标签失败', error);
            showError('清除标签失败：' + error.message);
        }
    }

    /**
     * 自动保存
     */
    async autoSave() {
        if (!this.processor?.state) return;

        try {
            await this.processor.state.saveToDB();
            this.log('自动保存完成');
        } catch (error) {
            this.error('自动保存失败', error);
        }
    }

    /**
     * 加载保存的状态
     */
    async loadSavedState() {
        if (!this.processor?.state) return false;

        try {
            const loaded = await this.processor.state.loadFromDB();
            if (loaded) {
                this.log('已加载保存的状态');
                this.generatedWorldbook = this.processor.state.generatedWorldbook || {};
            }
            return loaded;
        } catch (error) {
            this.error('加载状态失败', error);
            return false;
        }
    }

    /**
     * 获取文件扩展名
     */
    getFileExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    /**
     * 日志
     */
    log(message, data = null) {
        if (this.config.debugMode) {
            console.log('[Worldinfo App]', message, data || '');
        }
    }

    /**
     * 错误日志
     */
    error(message, error) {
        errorHandler.handle(error, 'Worldinfo App', { silent: false });
        console.error('[Worldinfo App]', message, error);
    }

    /**
     * 销毁应用
     */
    destroy() {
        this.stopConversion();
        this.uiManager?.destroy();
        this.isInitialized = false;
        this.isProcessing = false;
    }

    /**
     * 处理批量重 Roll
     */
    async handleBatchReroll(data) {
        const { entries, prompt, concurrency, onProgress } = data;

        try {
            let completed = 0;
            const total = entries.length;

            for (const entry of entries) {
                try {
                    await this.rollService.rerollEntry(
                        entry.memoryIndex,
                        entry.category,
                        entry.entryName,
                        prompt
                    );
                    completed++;
                    onProgress?.(completed, total);
                } catch (error) {
                    console.error(`[批量重 Roll] 失败：${entry.category}/${entry.entryName}`, error);
                }
            }

            showSuccess(`批量重 Roll 完成！成功：${completed}/${total}`);
            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);

        } catch (error) {
            this.error('批量重 Roll 失败', error);
            showError('批量重 Roll 失败：' + error.message);
        }
    }

    /**
     * 处理世界书导入
     */
    async handleWorldbookImport(data) {
        const { data: importData, duplicateMode, onProgress } = data;

        try {
            const entries = Object.values(importData.entries);
            const total = entries.length;
            let imported = 0;

            for (const entry of entries) {
                const category = entry.group || '未分类';
                const entryName = entry.comment || `条目${entry.uid}`;

                if (!this.generatedWorldbook[category]) {
                    this.generatedWorldbook[category] = [];
                }

                // 检查是否重复
                const existing = this.generatedWorldbook[category].find(e => e.name === entryName);

                if (existing) {
                    switch (duplicateMode) {
                        case 'overwrite':
                            existing.keywords = entry.key || [];
                            existing.content = entry.content || '';
                            break;
                        case 'append':
                            existing.content += '\n\n' + (entry.content || '');
                            break;
                        case 'rename':
                            const newName = `${entryName}_imported_${Date.now()}`;
                            this.generatedWorldbook[category].push({
                                name: newName,
                                keywords: entry.key || [],
                                content: entry.content || ''
                            });
                            break;
                        case 'keep':
                            // 保留现有，跳过
                            break;
                        case 'merge':
                        default:
                            // AI 智能合并（简化版：直接合并内容）
                            existing.keywords = [...new Set([...(existing.keywords || []), ...(entry.key || [])])];
                            existing.content += '\n\n' + (entry.content || '');
                    }
                } else {
                    this.generatedWorldbook[category].push({
                        name: entryName,
                        keywords: entry.key || [],
                        content: entry.content || ''
                    });
                }

                imported++;
                onProgress?.(imported);
            }

            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);

        } catch (error) {
            this.error('世界书导入失败', error);
            showError('世界书导入失败：' + error.message);
        }
    }

    /**
     * 启用调试模式
     */
    enableDebug() {
        this.debugLogger.enable();
        this.config.debugMode = true;
        showInfo('调试模式已启用');
    }

    /**
     * 禁用调试模式
     */
    disableDebug() {
        this.debugLogger.disable();
        this.config.debugMode = false;
        showInfo('调试模式已禁用');
    }

    /**
     * 导出任务
     */
    exportTask() {
        const data = {
            fileName: this.currentFile?.name || 'unknown',
            fileHash: this.currentFileHash,
            processedIndex: this.currentChapterIndex,
            memoryQueue: this.chapters,
            generatedWorldbook: this.generatedWorldbook,
            settings: this.configManager.export()
        };

        const filename = this.taskManager.createFilename(
            this.currentFile ? this.currentFile.name.replace(/\.[^.]+$/, '') : 'backup'
        );

        this.taskManager.exportTask(data, filename);
        showSuccess('任务已导出');
    }

    /**
     * 导入任务
     */
    async importTask(file) {
        try {
            const data = await this.taskManager.importTask(file);

            this.chapters = data.memoryQueue || [];
            this.currentChapterIndex = data.processedIndex || 0;
            this.generatedWorldbook = data.generatedWorldbook || {};
            this.currentFileHash = data.fileHash;

            if (data.settings) {
                this.configManager.import(data.settings);
            }

            this.txtToWorldbookPanel?.updateChapterList(this.chapters);
            this.txtToWorldbookPanel?.updateWorldbookPreview(this.generatedWorldbook);

            showSuccess(`任务已导入！已恢复 ${data.processedIndex || 0}/${this.chapters.length} 进度`);

        } catch (error) {
            this.error('任务导入失败', error);
            showError('任务导入失败：' + error.message);
        }
    }

    /**
     * 显示帮助
     */
    showHelp() {
        this.helpModal?.open();
    }

    /**
     * 显示批量重 Roll
     */
    showBatchReroll() {
        this.batchRerollPanel?.open(this.chapters);
    }

    /**
     * 显示已处理结果
     */
    showProcessedResults() {
        this.processedResultsPanel?.open(this.chapters);
    }

    /**
     * 显示世界书导入
     */
    showWorldbookImport() {
        this.worldbookImportPanel?.open();
    }
}

/**
 * 创建应用实例
 */
export function createWorldinfoApp(config = {}) {
    const app = new WorldinfoApp(config);
    if (config.autoInit !== false) {
        app.init();
    }
    return app;
}

// 全局暴露
if (typeof window !== 'undefined') {
    window.WorldinfoApp = WorldinfoApp;
    window.createWorldinfoApp = createWorldinfoApp;
}

console.log('[Worldinfo App] 应用模块已加载');

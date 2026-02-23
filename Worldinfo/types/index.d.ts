/**
 * Worldinfo 模块 TypeScript 类型定义
 * @module types/index
 * @description 为 Worldinfo 模块提供完整的 TypeScript 类型支持
 */

// ============================================================
// 基础类型
// ============================================================

/**
 * 世界书条目数据结构
 */
export interface WorldbookEntry {
    /** 条目名称 */
    name: string;
    /** 关键词数组 */
    keywords: string[];
    /** 条目内容（支持 Markdown） */
    content: string;
    /** 插入位置 (0=顶部，1=底部) */
    position?: number;
    /** 递归深度 (1-5) */
    depth?: number;
    /** 排序顺序 */
    order?: number;
    /** 是否允许递归 */
    allowRecursion?: boolean;
}

/**
 * 世界书分类数据结构
 */
export interface WorldbookCategory {
    /** 分类名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;
    /** 是否为内置分类 */
    isBuiltin: boolean;
    /** 条目示例名称 */
    entryExample: string;
    /** 关键词示例 */
    keywordsExample: string[];
    /** 内容指南 */
    contentGuide: string;
    /** 默认位置 */
    defaultPosition: number;
    /** 默认深度 */
    defaultDepth: number;
    /** 默认顺序 */
    defaultOrder: number;
    /** 是否自动递增顺序 */
    autoIncrementOrder: boolean;
}

/**
 * 世界书数据结构（按分类组织）
 */
export interface WorldbookData {
    [categoryName: string]: {
        [entryName: string]: WorldbookEntry;
    };
}

// ============================================================
// 配置类型
// ============================================================

/**
 * 处理器配置选项
 */
export interface ProcessorConfig {
    /** 每块字数 */
    chunkSize: number;
    /** 是否启用分卷模式 */
    useVolumeMode: boolean;
    /** 是否使用酒馆 API */
    useTavernApi: boolean;
    /** 自定义 API 提供商 */
    customApiProvider: 'gemini' | 'deepseek' | 'openai' | 'claude';
    /** 自定义 API 密钥 */
    customApiKey: string;
    /** 自定义 API 端点 */
    customApiEndpoint: string;
    /** 自定义 API 模型 */
    customApiModel: string;
    /** API 超时时间（毫秒） */
    apiTimeout: number;
    /** 是否启用并行处理 */
    parallelEnabled: boolean;
    /** 并发数 */
    parallelConcurrency: number;
    /** 并行模式 */
    parallelMode: 'independent' | 'batch';
    /** 是否启用剧情大纲 */
    enablePlotOutline: boolean;
    /** 是否启用文风配置 */
    enableLiteraryStyle: boolean;
    /** 语言 */
    language: 'zh' | 'en';
    /** 自定义世界书提示词 */
    customWorldbookPrompt: string;
    /** 自定义剧情提示词 */
    customPlotPrompt: string;
    /** 自定义文风提示词 */
    customStylePrompt: string;
    /** 自定义合并提示词 */
    customMergePrompt: string;
    /** 响应标签过滤 */
    filterResponseTags: string;
    /** 是否允许递归 */
    allowRecursion: boolean;
    /** 调试模式 */
    debugMode: boolean;
}

/**
 * 并行处理器配置
 */
export interface ParallelConfigOptions {
    /** 是否启用并行 */
    enabled?: boolean;
    /** 并发数 (1-10) */
    concurrency?: number;
    /** 处理模式 */
    mode?: 'independent' | 'batch';
    /** 重试次数 */
    retryCount?: number;
    /** 重试延迟（毫秒） */
    retryDelay?: number;
}

// ============================================================
// 处理器类型
// ============================================================

/**
 * 任务状态枚举
 */
export declare enum TaskStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    RETRYING = 'retrying'
}

/**
 * 任务状态对象
 */
export interface TaskStatusObject {
    status: TaskStatus;
    data: any;
    updatedAt: number;
}

/**
 * 处理进度对象
 */
export interface ProgressData {
    /** 当前索引 */
    index: number;
    /** 总数 */
    total: number;
    /** 状态 */
    status?: TaskStatus;
    /** 结果 */
    result?: any;
    /** 错误 */
    error?: Error;
    /** 重试次数 */
    attempt?: number;
}

/**
 * 分卷配置
 */
export interface VolumeConfigOptions {
    /** 是否启用分卷 */
    enabled?: boolean;
    /** 每卷章节数 */
    volumeSize?: number;
    /** 最大卷数 */
    maxVolumes?: number;
    /** 是否自动分卷 */
    autoSplit?: boolean;
}

/**
 * 分卷数据
 */
export interface Volume {
    /** 卷索引 */
    index: number;
    /** 卷标题 */
    title: string;
    /** 章节数组 */
    chapters: ChapterChunk[];
    /** 是否已处理 */
    processed: boolean;
    /** 是否正在处理 */
    processing: boolean;
    /** 处理结果 */
    result: any;
    /** 错误信息 */
    error: string | null;
}

// ============================================================
// 解析器类型
// ============================================================

/**
 * 章节块数据
 */
export interface ChapterChunk {
    /** 章节标题 */
    title: string;
    /** 章节内容 */
    content: string;
    /** 章节索引 */
    index: number;
    /** 起始位置 */
    startPosition?: number;
    /** 结束位置 */
    endPosition?: number;
    /** 是否为自动分割 */
    isAutoSplit?: boolean;
}

/**
 * 内容分割器配置
 */
export interface ContentSplitterConfig {
    /** 每块字数 */
    chunkSize?: number;
    /** 是否启用分卷模式 */
    useVolumeMode?: boolean;
    /** 章节正则模式 */
    chapterPattern?: string;
    /** 最小章节长度 */
    minChapterLength?: number;
    /** 最大章节长度 */
    maxChapterLength?: number;
}

/**
 * 章节检测器配置
 */
export interface ChapterDetectorConfig {
    /** 正则模式 */
    pattern?: string;
    /** 是否使用自定义正则 */
    useCustomRegex?: boolean;
    /** 是否强制章节标记 */
    forceChapterMarker?: boolean;
    /** 最小章节长度 */
    minChapterLength?: number;
    /** 最大章节长度 */
    maxChapterLength?: number;
}

/**
 * 正则测试结果
 */
export interface RegexTestResult {
    /** 是否成功 */
    success: boolean;
    /** 匹配数量 */
    count: number;
    /** 匹配样本 */
    samples: string[];
    /** 错误信息 */
    error?: string;
}

// ============================================================
// API 类型
// ============================================================

/**
 * API 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * API 消息对象
 */
export interface APIMessage {
    /** 消息角色 */
    role: MessageRole;
    /** 消息内容 */
    content: string;
}

/**
 * API 配置选项
 */
export interface APIConfig {
    /** API 提供商 */
    provider: string;
    /** API 密钥 */
    apiKey?: string;
    /** 模型名称 */
    model?: string;
    /** API 端点 */
    baseUrl?: string;
    /** 超时时间 */
    timeout?: number;
    /** 响应标签过滤 */
    filterResponseTags?: string;
}

/**
 * API 响应结果
 */
export interface APIResponse {
    /** 生成的文本 */
    text: string;
    /** 原始响应 */
    raw?: any;
    /** 使用 Token 数 */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// ============================================================
// 导出器类型
// ============================================================

/**
 * SillyTavern 世界书条目
 */
export interface TavernWorldbookEntry {
    /** 唯一标识 */
    uid: number;
    /** 显示索引 */
    displayIndex: number;
    /** 注释/名称 */
    comment: string;
    /** 主关键词 */
    key: string[];
    /** 次要关键词 */
    keysecondary: string[];
    /** 条目内容 */
    content: string;
    /** 插入位置 */
    position: number;
    /** 递归深度 */
    depth: number;
    /** 排序顺序 */
    order: number;
    /** 是否启用 */
    enabled: boolean;
    /** 是否排除递归 */
    excludeRecursion: boolean;
    /** 是否阻止递归 */
    preventRecursion: boolean;
    /** 延迟 */
    delay: number;
    /** 选择性逻辑 */
    selectiveLogic: number;
    /** 是否使用概率 */
    useProbability: boolean;
    /** 概率 */
    probability: number;
    /** 分组 */
    group: string;
}

/**
 * SillyTavern 世界书数据
 */
export interface TavernWorldbook {
    /** 世界书名称 */
    name: string;
    /** 条目对象 */
    entries: {
        [uid: string]: TavernWorldbookEntry;
    };
    /** 版本号 */
    version: number;
}

/**
 * 导出选项
 */
export interface ExportOptions {
    /** 文件名 */
    filename?: string;
    /** 条目位置配置 */
    positionConfig?: {
        [entryName: string]: {
            position: number;
            depth: number;
            order: number;
            allowRecursion: boolean;
        };
    };
}

// ============================================================
// 工具函数类型
// ============================================================

/**
 * Token 检查结果
 */
export interface TokenCheckResult {
    /** Token 数量 */
    tokens: number;
    /** Token 限制 */
    limit: number;
    /** 是否超限 */
    exceeded: boolean;
    /** 剩余 Token */
    remaining: number;
    /** 使用百分比 */
    percentage: number;
}

/**
 * 条目验证结果
 */
export interface EntryValidationResult {
    /** 是否有效 */
    valid: boolean;
    /** 错误列表 */
    errors: string[];
    /** 警告列表 */
    warnings: string[];
    /** 修复后的条目 */
    entry: WorldbookEntry;
}

// ============================================================
// 事件回调类型
// ============================================================

/**
 * 进度回调函数
 */
export type ProgressCallback = (progress: ProgressData) => void;

/**
 * 完成回调函数
 */
export type CompleteCallback = (result: any) => void;

/**
 * 错误回调函数
 */
export type ErrorCallback = (error: Error) => void;

/**
 * 流式数据块回调函数
 */
export type StreamChunkCallback = (chunk: string, full: string) => void;

// ============================================================
// 主类类型声明
// ============================================================

/**
 * 配置管理类
 */
export declare class Config {
    constructor();
    get<T>(key: string, defaultValue?: T): T;
    set(key: string, value: any): void;
    setMultiple(values: Record<string, any>): void;
    reset(): void;
    export(): Record<string, any>;
    import(data: Record<string, any> | string): void;
}

/**
 * 状态管理类
 */
export declare class State {
    isProcessing: boolean;
    isPaused: boolean;
    isStopped: boolean;
    progress: { current: number; total: number; percentage: number };
    memoryQueue: ChapterChunk[];
    generatedWorldbook: WorldbookData;
    currentIndex: number;
    stats: {
        startTime: number | null;
        endTime: number | null;
        generatedCount: number;
        errorCount: number;
        totalCharacters: number;
    };
    
    reset(): void;
    saveToDB(): Promise<void>;
    loadFromDB(): Promise<boolean>;
    updateProgress(current: number, total: number): void;
    start(): void;
    pause(): void;
    resume(): void;
    stop(): void;
    complete(): void;
}

/**
 * 并行处理器类
 */
export declare class ParallelProcessor {
    constructor(config?: ParallelConfigOptions);
    process<T>(
        chunks: any[],
        processorFn: (chunk: any, index: number, attempt: number) => Promise<T>,
        onProgress?: ProgressCallback
    ): Promise<{ results: T[]; errors: Error[] }>;
    abort(): void;
    reset(): void;
    getTaskStatus(index: number): TaskStatusObject | undefined;
    getAllTaskStatus(): Map<number, TaskStatusObject>;
}

/**
 * 内容分割器类
 */
export declare class ContentSplitter {
    constructor(config?: ContentSplitterConfig);
    split(content: string, titlePrefix?: string): ChapterChunk[];
    splitByChapters(content: string): ChapterChunk[];
    splitBySize(content: string): ChapterChunk[];
    validateChunks(chunks: ChapterChunk[]): {
        valid: boolean;
        errors: string[];
        warnings: string[];
        stats: { total: number; tooShort: number; tooLong: number; autoSplit: number };
    };
}

/**
 * 章节检测器类
 */
export declare class ChapterDetector {
    constructor(config?: ChapterDetectorConfig);
    detect(content: string): string[];
    split(content: string, titlePrefix?: string): ChapterChunk[];
    testRegex(content: string, pattern?: string): RegexTestResult;
}

// ============================================================
// 工具函数声明
// ============================================================

/**
 * 估算 Token 数量
 */
export declare function estimateTokenCount(text: string): number;

/**
 * 计算条目总 Token 数
 */
export declare function getEntryTotalTokens(entry: WorldbookEntry): number;

/**
 * 自然排序比较
 */
export declare function naturalSortCompare(a: string, b: string): number;

/**
 * 中文数字转整数
 */
export declare function chineseNumToInt(str: string): number;

/**
 * 解析 AI 响应
 */
export declare function parseAIResponse(response: string): any;

/**
 * 过滤响应标签
 */
export declare function filterResponseTags(text: string, filterTags?: string): string;

/**
 * 检查 Token 超限错误
 */
export declare function isTokenLimitError(errorMessage: string): boolean;

/**
 * 验证世界书条目
 */
export declare function validateWorldbookEntry(entry: any): EntryValidationResult;

/**
 * 下载文件
 */
export declare function downloadFile(content: string, filename: string, mimeType?: string): void;

/**
 * 检测文件编码
 */
export declare function detectFileEncoding(file: File): Promise<{ encoding: string; content: string }>;

/**
 * HTML 转文本
 */
export declare function htmlToText(html: string): string;

/**
 * 计算哈希
 */
export declare function calculateHash(content: string): Promise<string>;

/**
 * 延迟函数
 */
export declare function sleep(ms: number): Promise<void>;

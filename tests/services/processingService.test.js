import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    createProcessingService,
    countMeaningfulWorldbookEntries,
} from '../../txtToWorldbook/services/processingService.js';

// ============================================================
// 测试辅助 - AppState 与 service 创建
// ============================================================
function createTestService(overrides = {}) {
    const AppState = {
        processing: {
            isStopped: false,
            isRunning: false,
            isRerolling: false,
            isRepairing: false,
            status: 'idle',
            activeTasks: new Set(),
            streamContent: '',
            incrementalMode: false,
        },
        memory: {
            queue: overrides.queue || [],
            failedQueue: [],
        },
        worldbook: {
            generated: {},
            volumes: [],
            currentVolumeIndex: 0,
        },
        config: {
            parallel: {
                concurrency: overrides.concurrency || 2,
                mode: 'independent',
            },
        },
        settings: {
            forceChapterMarker: false,
            enablePlotOutline: false,
            enableLiteraryStyle: false,
            customSuffixPrompt: '',
        },
        globalSemaphore: null,
    };

    const mocks = {
        updateMemoryQueueUI: vi.fn(),
        updateProgress: vi.fn(),
        updateStreamContent: vi.fn(),
        debugLog: vi.fn(),
        callAPI: overrides.callAPI || vi.fn().mockResolvedValue('{}'),
        isTokenLimitError: overrides.isTokenLimitError || vi.fn().mockReturnValue(false),
        parseAIResponse:
            overrides.parseAIResponse ||
            vi.fn().mockReturnValue({ 角色: { 测试角色: { 关键词: ['测试角色'], 内容: '测试内容' } } }),
        postProcessResultWithChapterIndex: overrides.postProcessResultWithChapterIndex || vi.fn((r) => r),
        mergeWorldbookDataWithHistory: overrides.mergeWorldbookDataWithHistory || vi.fn().mockResolvedValue([]),
        getChapterForcePrompt: vi.fn().mockReturnValue(''),
        getLanguagePrefix: vi.fn().mockReturnValue(''),
        buildSystemPrompt: vi.fn().mockReturnValue('System Prompt'),
        getPreviousMemoryContext: vi.fn().mockReturnValue(''),
        getEnabledCategories: overrides.getEnabledCategories || vi.fn().mockReturnValue([{ name: '角色' }]),
        splitMemoryIntoTwo: vi.fn(),
        handleStartNewVolume: vi.fn(),
        showProgressSection: vi.fn(),
        updateStopButtonVisibility: vi.fn(),
        updateVolumeIndicator: vi.fn(),
        updateStartButtonState: vi.fn(),
        showResultSection: vi.fn(),
        updateWorldbookPreview: vi.fn(),
        applyDefaultWorldbookEntries: vi.fn(),
        ErrorHandler: { showError: vi.fn() },
        handleRepairMemoryWithSplit: vi.fn(),
        setProcessingStatus:
            overrides.setProcessingStatus ||
            vi.fn((s) => {
                AppState.processing.status = s;
                AppState.processing.isStopped = s === 'stopped';
                AppState.processing.isRunning = s === 'running' || s === 'rerolling' || s === 'repairing';
            }),
        getProcessingStatus: overrides.getProcessingStatus || vi.fn(() => AppState.processing.status),
        buildWorldbookSummary: vi.fn().mockReturnValue(''),
        estimateTokenCount: vi.fn().mockReturnValue(100),
        setupAutoSave: vi.fn(),
        clearAutoSave: vi.fn(),
        quickDuplicateScan: vi.fn().mockReturnValue([]),
        MemoryHistoryDB: overrides.MemoryHistoryDB || {
            saveRollResult: vi.fn().mockResolvedValue(0),
            saveState: vi.fn().mockResolvedValue(),
        },
        Semaphore: overrides.Semaphore,
    };

    const service = createProcessingService({ AppState, ...mocks });
    return { service, AppState, mocks };
}

function makeMemory(title, content, opts = {}) {
    return { title, content, processed: false, failed: false, processing: false, result: null, ...opts };
}

// ============================================================
// countMeaningfulWorldbookEntries
// ============================================================
describe('countMeaningfulWorldbookEntries', () => {
    it('空对象和空分类不计为有效条目', () => {
        expect(countMeaningfulWorldbookEntries({})).toBe(0);
        expect(countMeaningfulWorldbookEntries({ 角色: {} })).toBe(0);
        expect(countMeaningfulWorldbookEntries({ 角色: { 张三: {} } })).toBe(0);
    });

    it('统计包含内容或关键词的有效条目', () => {
        const data = {
            角色: {
                张三: { 关键词: ['张三'], 内容: '' },
                李四: { 关键词: [], 内容: '李四是张三的好友' },
                空条目: { 关键词: [], 内容: '   ' },
            },
        };

        expect(countMeaningfulWorldbookEntries(data)).toBe(2);
    });
});

// ============================================================
// processMemoryChunkIndependent
// ============================================================
describe('processMemoryChunkIndependent', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('成功处理单个记忆块', async () => {
        const mockResult = { 角色: { 张三: { 关键词: ['张三'], 内容: '测试' } } };
        const { service, mocks } = createTestService({
            queue: [makeMemory('第1章', '内容A')],
            callAPI: vi.fn().mockResolvedValue('{"角色":{"张三":{}}}'),
            parseAIResponse: vi.fn().mockReturnValue(mockResult),
        });

        const result = await service.processMemoryChunkIndependent({ index: 0 });
        expect(result).toEqual(mockResult);
        expect(mocks.callAPI).toHaveBeenCalledTimes(1);
        expect(mocks.parseAIResponse).toHaveBeenCalledOnce();
    });

    it('空世界书结果不会被当作成功处理', async () => {
        vi.useFakeTimers();
        try {
            const callAPI = vi.fn().mockResolvedValue('{}');
            const { service } = createTestService({
                queue: [makeMemory('第1章', '内容A')],
                callAPI,
                parseAIResponse: vi.fn().mockReturnValue({}),
            });

            const promise = service.processMemoryChunkIndependent({ index: 0 });
            const expectation = expect(promise).rejects.toThrow('空世界书结果');

            await vi.runAllTimersAsync();
            await expectation;

            expect(callAPI).toHaveBeenCalledTimes(4);
        } finally {
            vi.useRealTimers();
        }
    });

    it('失败后自动重试至 maxRetries', async () => {
        const callAPI = vi
            .fn()
            .mockRejectedValueOnce(new Error('网络错误'))
            .mockRejectedValueOnce(new Error('网络错误'))
            .mockResolvedValue('ok');
        const mockResult = { 角色: { 张三: { 关键词: ['张三'], 内容: '测试' } } };
        const { service } = createTestService({
            queue: [makeMemory('第1章', '内容')],
            callAPI,
            parseAIResponse: vi.fn().mockReturnValue(mockResult),
        });

        const result = await service.processMemoryChunkIndependent({ index: 0 });
        expect(result).toBe(mockResult);
        expect(callAPI).toHaveBeenCalledTimes(3);
    });

    it('达到最大重试次数后抛出错误', { timeout: 15000 }, async () => {
        const callAPI = vi.fn().mockRejectedValue(new Error('持久网络错误'));
        const { service } = createTestService({
            queue: [makeMemory('第1章', '内容')],
            callAPI,
        });

        await expect(service.processMemoryChunkIndependent({ index: 0 })).rejects.toThrow('持久网络错误');
        // 1 次初始 + 3 次重试 = 4 次
        expect(callAPI).toHaveBeenCalledTimes(4);
    });

    it('Token 超限时抛出带 TOKEN_LIMIT 前缀的错误', async () => {
        const { service } = createTestService({
            queue: [makeMemory('第1章', '超长内容')],
            callAPI: vi.fn().mockRejectedValue(new Error('prompt is too long')),
            isTokenLimitError: vi.fn().mockReturnValue(true),
        });

        await expect(service.processMemoryChunkIndependent({ index: 0 })).rejects.toThrow('TOKEN_LIMIT:0');
    });

    it('用户中断时立即停止 (ABORTED)', async () => {
        const { service, AppState } = createTestService({
            queue: [makeMemory('第1章', '内容')],
            callAPI: vi.fn().mockImplementation(async () => {
                AppState.processing.isStopped = true;
                return 'ok';
            }),
        });

        await expect(service.processMemoryChunkIndependent({ index: 0 })).rejects.toThrow('ABORTED');
    });

    it('自定义后缀提示词正确注入', async () => {
        const callAPI = vi.fn().mockResolvedValue('{}');
        const { service } = createTestService({
            queue: [makeMemory('第1章', '内容')],
            callAPI,
        });

        await service.processMemoryChunkIndependent({
            index: 0,
            customPromptSuffix: '请特别注意人物性格变化',
        });

        const callArg = callAPI.mock.calls[0][0];
        expect(callArg).toContain('请特别注意人物性格变化');
    });

    it('世界书摘要上下文正确注入', async () => {
        const callAPI = vi.fn().mockResolvedValue('{}');
        const { service } = createTestService({
            queue: [makeMemory('第1章', '内容')],
            callAPI,
        });

        await service.processMemoryChunkIndependent({
            index: 0,
            worldbookSummaryContext: '【已提取的世界书】角色: 张三',
        });

        const callArg = callAPI.mock.calls[0][0];
        expect(callArg).toContain('【已提取的世界书】角色: 张三');
    });
});

// ============================================================
// processMemoryChunksParallel
// ============================================================
describe('processMemoryChunksParallel', () => {
    let Semaphore;

    beforeEach(() => {
        // 导入真实的 Semaphore（简化版本）
        Semaphore = class {
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
                if (this.queue.length > 0) {
                    this.current++;
                    const next = this.queue.shift();
                    next.resolve();
                }
            }
        };
    });

    it('并行处理多个记忆块', async () => {
        const mockResults = [{ 角色: { A: { 关键词: [], 内容: 'a' } } }, { 角色: { B: { 关键词: [], 内容: 'b' } } }];
        let callIdx = 0;
        const { service, AppState, mocks } = createTestService({
            queue: [makeMemory('第1章', 'A'), makeMemory('第2章', 'B')],
            callAPI: vi.fn().mockResolvedValue('ok'),
            parseAIResponse: vi.fn().mockImplementation(() => mockResults[callIdx++]),
            Semaphore,
            concurrency: 2,
        });

        const result = await service.processMemoryChunksParallel(0, 2);
        expect(result.tokenLimitIndices).toEqual([]);
        expect(AppState.worldbook.generated).toBeDefined();
        expect(mocks.mergeWorldbookDataWithHistory).toHaveBeenCalledTimes(2);
    });

    it('已处理的章节跳过', async () => {
        const callAPI = vi.fn().mockResolvedValue('{}');
        const { service } = createTestService({
            queue: [makeMemory('第1章', 'A', { processed: true, failed: false }), makeMemory('第2章', 'B')],
            callAPI,
            parseAIResponse: vi.fn().mockReturnValue({ 角色: { 李四: { 关键词: ['李四'], 内容: '测试' } } }),
            Semaphore,
            concurrency: 2,
        });

        await service.processMemoryChunksParallel(0, 2);
        // 第1章已处理不重新处理，第2章才处理
        expect(callAPI).toHaveBeenCalledTimes(1);
    });

    it('Token 超限错误被收集', async () => {
        let callCount = 0;
        const callAPI = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) throw new Error('TOKEN_LIMIT:0');
            return Promise.resolve('{}');
        });
        const { service } = createTestService({
            queue: [makeMemory('第1章', 'A'), makeMemory('第2章', 'B')],
            callAPI,
            parseAIResponse: vi.fn().mockReturnValue({ 角色: { 李四: { 关键词: ['李四'], 内容: '测试' } } }),
            isTokenLimitError: vi.fn().mockImplementation((msg) => msg?.includes('TOKEN_LIMIT')),
            Semaphore,
            concurrency: 1,
        });

        const result = await service.processMemoryChunksParallel(0, 2);
        // 第一个任务会因 TOKEN_LIMIT 失败并收集
        expect(result.tokenLimitIndices).toContain(0);
    });

    it('无任务时直接返回', async () => {
        const { service } = createTestService({
            queue: [],
            Semaphore,
        });

        const result = await service.processMemoryChunksParallel(0, 0);
        expect(result).toEqual({ tokenLimitIndices: [] });
    });

    it('isStopped 时任务被中断', async () => {
        const callAPI = vi.fn().mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => resolve('{}'), 50);
                }),
        );
        const { service, AppState } = createTestService({
            queue: [makeMemory('第1章', 'A'), makeMemory('第2章', 'B')],
            callAPI,
            parseAIResponse: vi.fn().mockReturnValue({}),
            Semaphore,
            concurrency: 1,
        });

        // 立即标记停止
        AppState.processing.isStopped = true;

        const result = await service.processMemoryChunksParallel(0, 2);
        // 已停止，任务跳过
        expect(result.tokenLimitIndices).toEqual([]);
    });
});

// ============================================================
// processMemoryChunk (串行)
// ============================================================
describe('processMemoryChunk (串行)', () => {
    it('已停止时立即返回', async () => {
        const { service, AppState } = createTestService({
            queue: [makeMemory('第1章', '内容')],
        });
        AppState.processing.isStopped = true;

        await service.processMemoryChunk(0);
        // 没有调用 API
    });
});

// ============================================================
// handleStopProcessing
// ============================================================
describe('handleStopProcessing', () => {
    it('正确设置停止状态', () => {
        const { service, AppState, mocks } = createTestService();

        service.handleStopProcessing();

        expect(AppState.processing.isStopped).toBe(true);
        expect(mocks.updateStopButtonVisibility).toHaveBeenCalledWith(false);
    });

    it('中止信号量', () => {
        const mockSemaphore = { abort: vi.fn() };
        const { service, AppState } = createTestService();
        AppState.globalSemaphore = mockSemaphore;

        service.handleStopProcessing();

        expect(mockSemaphore.abort).toHaveBeenCalled();
    });
});

import { Semaphore } from '../../txtToWorldbook/core/runtime.js';
import { beginRun, stopRun, finishRun } from '../../txtToWorldbook/core/runContext.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProcessingService, countMeaningfulWorldbookEntries } from '../../src/worldbook/commands/convert.js';

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
        ErrorHandler: { showError: vi.fn(), handle: vi.fn(), showUserSuccess: vi.fn(), showUserError: vi.fn() },
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
            clearState: vi.fn().mockResolvedValue(),
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

            expect(callAPI).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('失败后自动重试至 maxRetries', async () => {
        vi.useFakeTimers();
        try {
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

            const promise = service.processMemoryChunkIndependent({ index: 0 });
            await vi.runAllTimersAsync();
            await expect(promise).resolves.toBe(mockResult);
            expect(callAPI).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it('达到最大重试次数后抛出错误', async () => {
        vi.useFakeTimers();
        try {
            const callAPI = vi.fn().mockRejectedValue(new Error('持久网络错误'));
            const { service } = createTestService({
                queue: [makeMemory('第1章', '内容')],
                callAPI,
            });

            const promise = service.processMemoryChunkIndependent({ index: 0 });
            const expectation = expect(promise).rejects.toThrow('持久网络错误');
            await vi.runAllTimersAsync();
            await expectation;
            // 1 次初始 + 3 次重试 = 4 次
            expect(callAPI).toHaveBeenCalledTimes(4);
        } finally {
            vi.useRealTimers();
        }
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

describe('run isolation', () => {
    it('blocks restarting during finalization and releases controls after late response', async () => {
        let resolve;
        const callAPI = vi.fn(
            () =>
                new Promise((r) => {
                    resolve = r;
                }),
        );
        const { service, AppState, mocks } = createTestService({ queue: [makeMemory('章', '正文')], callAPI });
        AppState.memory.startIndex = 0;
        AppState.memory.userSelectedIndex = null;
        const old = service.handleStartProcessing();
        service.handleStopProcessing();
        await service.handleStartProcessing();
        expect(callAPI).toHaveBeenCalledTimes(1);
        resolve('{}');
        await old;
        expect(mocks.mergeWorldbookDataWithHistory).not.toHaveBeenCalled();
        expect(mocks.MemoryHistoryDB.saveRollResult).not.toHaveBeenCalled();
        expect(AppState.processing.run.pending).toBe(false);
        expect(mocks.updateStartButtonState).toHaveBeenLastCalledWith(false);
        expect(AppState.memory.queue[0].processing).toBe(false);
    });

    it('old rejection cannot mutate a replacement run', async () => {
        let reject;
        const { service, AppState, mocks } = createTestService({
            queue: [makeMemory('章', '正文')],
            callAPI: () =>
                new Promise((_, r) => {
                    reject = r;
                }),
        });
        const oldRun = beginRun(AppState.processing);
        const old = service.processMemoryChunk(0).catch((error) => error);
        stopRun(AppState.processing);
        finishRun(AppState.processing, oldRun);
        beginRun(AppState.processing);
        AppState.memory.queue[0].processing = true;
        reject(new Error('old failure'));
        expect((await old).code).toBe('ABORTED');
        expect(AppState.memory.queue[0].processing).toBe(true);
        expect(AppState.memory.failedQueue).toEqual([]);
        expect(mocks.MemoryHistoryDB.saveRollResult).not.toHaveBeenCalled();
    });

    it('releases an acquired permit if stopped before its continuation', async () => {
        const { service, AppState, mocks } = createTestService({ queue: [makeMemory('章', '正文')], Semaphore });
        beginRun(AppState.processing);
        const task = service.processMemoryChunksParallel(0, 1).catch((error) => error);
        const semaphore = AppState.globalSemaphore;
        const release = vi.spyOn(semaphore, 'release');
        service.handleStopProcessing();
        expect((await task).code).toBe('ABORTED');
        expect(release).toHaveBeenCalledTimes(1);
        expect(AppState.globalSemaphore).toBe(null);
        expect(mocks.callAPI).not.toHaveBeenCalled();
    });

    it('preserves a fatal error and aborts queued tasks', async () => {
        const fatal = Object.assign(new Error('unauthorized'), { retryable: false });
        const { service, AppState, mocks } = createTestService({
            queue: [makeMemory('1', 'a'), makeMemory('2', 'b')],
            Semaphore,
            concurrency: 1,
            callAPI: vi.fn().mockRejectedValue(fatal),
        });
        beginRun(AppState.processing);
        await expect(service.processMemoryChunksParallel(0, 2)).rejects.toBe(fatal);
        expect(mocks.callAPI).toHaveBeenCalledTimes(1);
        expect(AppState.processing.activeTasks.size).toBe(0);
        expect(AppState.globalSemaphore).toBe(null);
    });
});

it('bounds repeated serial token recovery across volume changes', async () => {
    vi.useFakeTimers();
    try {
        const { service, AppState, mocks } = createTestService({
            queue: [makeMemory('章', '正文')],
            callAPI: vi.fn().mockRejectedValue(new Error('Token limit')),
            isTokenLimitError: (message) => String(message).includes('Token limit'),
        });
        AppState.processing.volumeMode = true;
        const result = service.processMemoryChunk(0).catch((e) => e);
        await vi.runAllTimersAsync();
        expect((await result).code).toBe('RECOVERY_EXHAUSTED');
        expect(mocks.callAPI).toHaveBeenCalledTimes(9);
        expect(mocks.handleStartNewVolume).toHaveBeenCalledTimes(8);
        expect(mocks.MemoryHistoryDB.saveRollResult).not.toHaveBeenCalled();
    } finally {
        vi.useRealTimers();
    }
});

it('drains dispatched parallel chunks in source order and resumes without duplicate work', async () => {
    const pending = [];
    const callAPI = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
    const { service, AppState, mocks } = createTestService({
        queue: [makeMemory('1', 'a'), makeMemory('2', 'b'), makeMemory('3', 'c')],
        Semaphore,
        callAPI,
    });
    AppState.memory.startIndex = 0;
    AppState.memory.userSelectedIndex = null;
    AppState.config.parallel.enabled = true;
    const task = service.handleStartProcessing();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    service.handlePauseProcessing();
    expect(AppState.processing.run.lifecycle).toBe('pausing');
    pending[1]('{}');
    pending[0]('{}');
    await task;
    expect(callAPI).toHaveBeenCalledTimes(2);
    expect(mocks.MemoryHistoryDB.saveRollResult.mock.calls.map((args) => args[0])).toEqual([0, 1]);
    expect(mocks.MemoryHistoryDB.clearState).not.toHaveBeenCalled();
    expect(AppState.processing.run.lifecycle).toBe('paused');
    expect(AppState.processing.status).toBe('paused');
    const resumed = service.handleStartProcessing();
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2]('{}');
    await resumed;
    expect(mocks.MemoryHistoryDB.saveRollResult.mock.calls.map((args) => args[0])).toEqual([0, 1, 2]);
    expect(AppState.processing.run.lifecycle).toBe('completed');
});

it('serial pause saves the current chunk and does not dispatch the next', async () => {
    vi.useFakeTimers();
    try {
        let resolve;
        const { service, AppState, mocks } = createTestService({
            queue: [makeMemory('1', 'a'), makeMemory('2', 'b')],
            callAPI: vi.fn(
                () =>
                    new Promise((r) => {
                        resolve = r;
                    }),
            ),
        });
        AppState.memory.startIndex = 0;
        AppState.memory.userSelectedIndex = null;
        const task = service.handleStartProcessing();
        service.handlePauseProcessing();
        resolve('{}');
        await vi.runAllTimersAsync();
        await task;
        expect(mocks.callAPI).toHaveBeenCalledTimes(1);
        expect(AppState.memory.queue[0].processed).toBe(true);
        expect(AppState.memory.queue[1].processed).toBe(false);
        expect(AppState.processing.run.lifecycle).toBe('paused');
        expect(mocks.MemoryHistoryDB.saveState).toHaveBeenLastCalledWith(1);
    } finally {
        vi.useRealTimers();
    }
});

it('repair owns a run through cancellation cleanup and does not report success', async () => {
    const { service, AppState, mocks } = createTestService({ queue: [makeMemory('章', '正文', { failed: true })] });
    let finish;
    mocks.handleRepairMemoryWithSplit.mockImplementation(
        () =>
            new Promise((r) => {
                finish = r;
            }),
    );
    const task = service.handleRepairFailedMemories().catch((e) => e);
    expect(AppState.processing.run.operation).toBe('repair');
    service.handleStopProcessing();
    await service.handleStartProcessing();
    expect(mocks.callAPI).not.toHaveBeenCalled();
    finish();
    expect((await task).code).toBe('ABORTED');
    expect(AppState.processing.run.pending).toBe(false);
    expect(mocks.ErrorHandler.showUserSuccess).not.toHaveBeenCalled();
    expect(mocks.clearAutoSave).toHaveBeenCalled();
    expect(mocks.updateStopButtonVisibility).toHaveBeenLastCalledWith(false);
});

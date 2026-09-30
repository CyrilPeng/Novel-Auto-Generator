import { expect, it, vi } from 'vitest';
import { createRerollService } from '../../txtToWorldbook/services/rerollService.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { stopRun } from '../../txtToWorldbook/core/runContext.js';
import { Semaphore } from '../../txtToWorldbook/core/runtime.js';

function setup() {
    const AppState = createInitialAppState();
    AppState.config.parallel = { enabled: true, concurrency: 1 };
    AppState.memory.queue = [
        { title: '1', content: '正文' },
        { title: '2', content: '正文' },
    ];
    const deps = {
        AppState,
        MemoryHistoryDB: { saveRollResult: vi.fn(), saveEntryRollResult: vi.fn() },
        updateStopButtonVisibility: vi.fn(),
        updateStreamContent: vi.fn(),
        updateMemoryQueueUI: vi.fn(),
        processMemoryChunkIndependent: vi.fn(),
        mergeWorldbookDataWithHistory: vi.fn(),
        updateWorldbookPreview: vi.fn(),
        callAPI: vi.fn(),
        parseAIResponse: JSON.parse,
        getChapterForcePrompt: () => '',
        getLanguagePrefix: () => '',
        getPreviousMemoryContext: () => '',
        Semaphore,
        updateProgress: vi.fn(),
        showProgressSection: vi.fn(),
    };
    return { AppState, deps, service: createRerollService(deps) };
}

it('blocks another reroll until an old cancelled call finishes and ignores its response', async () => {
    const { AppState, deps, service } = setup();
    let resolve;
    deps.processMemoryChunkIndependent.mockImplementation(
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    const old = service.handleRerollMemory(0).catch((e) => e);
    stopRun(AppState.processing);
    await expect(service.handleRerollMemory(1)).rejects.toMatchObject({ code: 'USER_ERROR' });
    resolve({ 角色: { 人: { 内容: '旧' } } });
    expect((await old).code).toBe('ABORTED');
    expect(deps.MemoryHistoryDB.saveRollResult).not.toHaveBeenCalled();
    expect(deps.mergeWorldbookDataWithHistory).not.toHaveBeenCalled();
    expect(AppState.processing.run.pending).toBe(false);
    expect(AppState.processing.run.lifecycle).toBe('stopped');
    expect(deps.updateStopButtonVisibility).toHaveBeenLastCalledWith(false);
});

it('does not apply a late single-entry reply after stopping', async () => {
    const { AppState, deps, service } = setup();
    let resolve;
    deps.callAPI.mockImplementation(
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    const old = service.handleRerollSingleEntry({ memoryIndex: 0, category: '角色', entryName: '人' }).catch((e) => e);
    stopRun(AppState.processing);
    resolve('{"角色":{"人":{"内容":"旧"}}}');
    expect((await old).code).toBe('ABORTED');
    expect(AppState.memory.queue[0].result).toBeUndefined();
    expect(AppState.worldbook.generated).toEqual({});
    expect(deps.MemoryHistoryDB.saveEntryRollResult).not.toHaveBeenCalled();
});

it('a fatal batch error aborts queued rerolls and releases its run', async () => {
    const { AppState, deps, service } = setup();
    const error = Object.assign(new Error('authentication failed'), { retryable: false });
    deps.processMemoryChunkIndependent.mockRejectedValue(error);
    await expect(service.batchRerollMemories({ memoryIndices: [0, 1] })).rejects.toBe(error);
    expect(deps.processMemoryChunkIndependent).toHaveBeenCalledTimes(1);
    expect(AppState.processing.run.lifecycle).toBe('failed');
    expect(AppState.processing.isRunning).toBe(false);
});

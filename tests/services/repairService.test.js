import { afterEach, expect, it, vi } from 'vitest';
import { createRepairService } from '../../src/worldbook/commands/repair.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { beginRun, stopRun } from '../../txtToWorldbook/core/runContext.js';
import { createRecoveryBudget } from '../../txtToWorldbook/core/recoveryBudget.js';

afterEach(() => vi.useRealTimers());
function setup() {
    const AppState = createInitialAppState();
    AppState.memory.queue = [{ title: '章', content: '正文', failed: true }];
    AppState.worldbook.generated = {};
    const deps = {
        AppState,
        MemoryHistoryDB: { saveState: vi.fn(), saveRollResult: vi.fn() },
        updateProgress: vi.fn(),
        updateMemoryQueueUI: vi.fn(),
        isTokenLimitError: (message) => message.includes('Token limit'),
        getChapterForcePrompt: () => '',
        getLanguagePrefix: () => '',
        generateDynamicJsonTemplate: () => '',
        getPreviousMemoryContext: () => '',
        callAPI: vi.fn(),
        parseAIResponse: JSON.parse,
        postProcessResultWithChapterIndex: (x) => x,
        mergeWorldbookDataWithHistory: vi.fn(),
        handleStartNewVolume: vi.fn(),
        splitMemoryIntoTwo: vi.fn(),
        buildWorldbookSummary: () => '',
    };
    return { deps, AppState, service: createRepairService(deps) };
}

it('bounds repeated volume recovery without declaring success', async () => {
    vi.useFakeTimers();
    const { deps, AppState, service } = setup();
    AppState.processing.volumeMode = true;
    deps.callAPI.mockRejectedValue(new Error('Token limit'));
    const stats = { successCount: 0, stillFailedCount: 0 };
    const result = service.handleRepairMemoryWithSplit(0, stats, createRecoveryBudget(2)).catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await result).code).toBe('RECOVERY_EXHAUSTED');
    expect(deps.callAPI).toHaveBeenCalledTimes(3);
    expect(deps.handleStartNewVolume).toHaveBeenCalledTimes(2);
    expect(stats.successCount).toBe(0);
});

it('ignores a repair response received after stop', async () => {
    const { deps, AppState, service } = setup();
    let resolve;
    deps.callAPI.mockImplementation(
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    beginRun(AppState.processing);
    const result = service.handleRepairMemoryWithSplit(0, { successCount: 0, stillFailedCount: 0 }).catch((e) => e);
    stopRun(AppState.processing);
    resolve('{"角色":{"人":{"内容":"新"}}}');
    expect((await result).code).toBe('ABORTED');
    expect(deps.mergeWorldbookDataWithHistory).not.toHaveBeenCalled();
    expect(deps.MemoryHistoryDB.saveRollResult).not.toHaveBeenCalled();
    expect(AppState.memory.queue[0].failed).toBe(true);
});

it('shares a finite recovery budget across split descendants', async () => {
    vi.useFakeTimers();
    const { deps, AppState, service } = setup();
    deps.callAPI.mockRejectedValue(new Error('Token limit'));
    deps.splitMemoryIntoTwo.mockImplementation((index) => {
        const part1 = { title: '1', content: 'a' },
            part2 = { title: '2', content: 'b' };
        AppState.memory.queue.splice(index, 1, part1, part2);
        return { part1, part2 };
    });
    const result = service
        .handleRepairMemoryWithSplit(0, { successCount: 0, stillFailedCount: 0 }, createRecoveryBudget(2))
        .catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await result).code).toBe('RECOVERY_EXHAUSTED');
    expect(deps.splitMemoryIntoTwo).toHaveBeenCalledTimes(2);
    expect(AppState.memory.queue).toHaveLength(3);
});

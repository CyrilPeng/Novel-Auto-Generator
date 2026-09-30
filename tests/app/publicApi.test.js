import { describe, it, expect, vi } from 'vitest';
import { createPublicApi } from '../../txtToWorldbook/app/publicApi.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import names from '../fixtures/public-api.json';
import { createLegacyTask } from '../fixtures/legacy.js';

function setup() {
    const AppState = createInitialAppState();
    AppState.worldbook.generated = createLegacyTask().generatedWorldbook;
    const deps = {
        AppState,
        saveTaskState: vi.fn(),
        loadTaskState: vi.fn(),
        handleRerollMemory: vi.fn(),
        handleRerollSingleEntry: vi.fn(),
        MemoryHistoryDB: { getEntryRollResults: vi.fn(), clearEntryRollResults: vi.fn() },
    };
    return { AppState, deps, api: createPublicApi(deps) };
}

describe('legacy public API contract', () => {
    it('preserves every published name and alias', () => {
        const { api, deps } = setup();
        expect(Object.keys(api).sort()).toEqual([...names].sort());
        expect(api.exportTaskState).toBe(deps.saveTaskState);
        expect(api.importTaskState).toBe(deps.loadTaskState);
        expect(api.rerollMemory).toBe(deps.handleRerollMemory);
        expect(api.rerollSingleEntry).toBe(deps.handleRerollSingleEntry);
    });

    it('preserves live getter references and observes replaced state', () => {
        const { api, AppState } = setup();
        expect(api.getWorldbook()).toBe(AppState.worldbook.generated);
        api.getWorldbook().角色.林舟.内容 = '人工编辑';
        expect(AppState.worldbook.generated.角色.林舟.内容).toBe('人工编辑');
        AppState.worldbook.generated = { 地点: {} };
        expect(api.getWorldbook()).toBe(AppState.worldbook.generated);
        expect(api.getMemoryQueue()).toBe(AppState.memory.queue);
        expect(api.getSettings()).toBe(AppState.settings);
        expect(api.getVolumes()).toBe(AppState.worldbook.volumes);
        expect(api.getCustomCategories()).toBe(AppState.persistent.customCategories);
    });

    it('forwards entry history identifiers and promises unchanged', async () => {
        const { api, deps } = setup();
        deps.MemoryHistoryDB.getEntryRollResults.mockResolvedValue([{ result: '旧结果' }]);
        expect(await api.getEntryRollHistory('角色', '林舟')).toEqual([{ result: '旧结果' }]);
        api.clearEntryRollHistory('角色', '林舟');
        expect(deps.MemoryHistoryDB.getEntryRollResults).toHaveBeenCalledWith('角色', '林舟');
        expect(deps.MemoryHistoryDB.clearEntryRollResults).toHaveBeenCalledWith('角色', '林舟');
    });
});

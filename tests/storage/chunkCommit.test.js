import { afterEach, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createMemoryHistoryDB } from '../../txtToWorldbook/infra/memoryHistoryDB.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { createWorldbookService } from '../../txtToWorldbook/services/worldbookService.js';
import { createChunkCommitService } from '../../src/storage/chunkCommitService.js';
import { beginRun, captureRun } from '../../txtToWorldbook/core/runContext.js';
const databases = [];
afterEach(() => {
    vi.restoreAllMocks();
    for (const db of databases) db.db?.close();
    databases.length = 0;
});
function setup() {
    const AppState = createInitialAppState();
    AppState.file.hash = 'fixture';
    AppState.memory.queue = [{ title: '章', content: '正文', processed: false }];
    const db = createMemoryHistoryDB(AppState);
    db.dbName = 'commit-test-' + Math.random();
    databases.push(db);
    const worldbookService = createWorldbookService();
    const service = createChunkCommitService({ AppState, MemoryHistoryDB: db, worldbookService });
    beginRun(AppState.processing);
    return { AppState, db, service, guard: captureRun(AppState.processing), worldbookService };
}
const result = { 角色: { 人: { 内容: '新正文' } } };

it('atomically stores result/history/checkpoint and replays without duplicate history', async () => {
    const { AppState, db, service, guard } = setup();
    await service.commit(0, result, guard);
    const snapshot = structuredClone(AppState.worldbook.generated);
    await service.commit(0, { 角色: { 人: { 内容: '不应重复提交' } } }, guard);
    expect(AppState.worldbook.generated).toEqual(snapshot);
    expect(AppState.memory.queue[0].processed).toBe(true);
    expect((await db.loadState()).task.revision).toBe(1);
    expect(await db.getAllHistory()).toHaveLength(1);
    expect(await db.getRollResults(0)).toHaveLength(1);
});

it('rolls back all stores and leaves progress unchanged on a late transaction abort', async () => {
    const { AppState, db, service, guard } = setup();
    await db.openDB();
    const original = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (...args) {
        const request = original.apply(this, args);
        if (this.name === 'history') request.addEventListener('success', () => this.transaction.abort());
        return request;
    });
    await expect(service.commit(0, result, guard)).rejects.toMatchObject({ code: 'STORAGE_COMMIT_FAILED' });
    spy.mockRestore();
    expect(AppState.memory.queue[0].processed).toBe(false);
    expect(AppState.worldbook.generated).toEqual({});
    expect(await db.loadState()).toBe(null);
    expect(await db.getAllHistory()).toEqual([]);
    expect(await db.getRollResults(0)).toEqual([]);
    await service.commit(0, result, guard);
    expect(AppState.task.revision).toBe(1);
});

it('rejects a stale writer for another chunk instead of overwriting its checkpoint', async () => {
    const { AppState, db, service, guard, worldbookService } = setup();
    AppState.task = { id: 'shared-task', revision: 0, fileHash: 'fixture' };
    const other = structuredClone({
        ...AppState,
        processing: {},
        memory: { queue: [{ id: 'other', title: '别章', content: '文本' }] },
    });
    beginRun(other.processing);
    const stale = createChunkCommitService({ AppState: other, MemoryHistoryDB: db, worldbookService });
    await service.commit(0, result, guard);
    await expect(stale.commit(0, result, captureRun(other.processing))).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
    });
    expect((await db.loadState()).memoryQueue[0].id).toBe(AppState.memory.queue[0].id);
    expect(await db.getAllHistory()).toHaveLength(1);
});

it('serializes two entry rerolls without losing either patch and saves entry history atomically', async () => {
    const { AppState, db, service, guard } = setup();
    const first = { 角色: { 甲: { 内容: '甲' } } },
        second = { 角色: { 乙: { 内容: '乙' } } };
    await Promise.all([
        service.commit(0, first, guard, {
            operation: 'entry-reroll',
            replaceEntries: true,
            patch: first,
            entryRoll: { entryKey: '角色:甲', category: '角色', entryName: '甲', result: first.角色.甲 },
        }),
        service.commit(0, second, guard, {
            operation: 'entry-reroll',
            replaceEntries: true,
            patch: second,
            entryRoll: { entryKey: '角色:乙', category: '角色', entryName: '乙', result: second.角色.乙 },
        }),
    ]);
    expect(Object.keys(AppState.memory.queue[0].result.角色)).toEqual(['甲', '乙']);
    expect(Object.keys(AppState.worldbook.generated.角色)).toEqual(['甲', '乙']);
    expect(await db.getEntryRollResults('角色', '甲')).toHaveLength(1);
    expect(await db.getEntryRollResults('角色', '乙')).toHaveLength(1);
    expect((await db.loadState()).task.revision).toBe(2);
});

import { afterEach, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createMemoryHistoryDB } from '../../txtToWorldbook/infra/memoryHistoryDB.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { createWorldbookService } from '../../src/worldbook/entries/worldbook.js';
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
    const history = await db.getAllHistory();
    expect(history).toHaveLength(1);
    expect(history[0].previousWorldbook).toEqual({});
    expect(history[0].newWorldbook).toBeUndefined();
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

it('commits whole-worldbook edits with history and no fictitious chapter roll', async () => {
    const { AppState, db, service, guard } = setup();
    await service.commitWorldbook(result, guard, '导入测试');
    expect(AppState.worldbook.generated).toEqual(result);
    expect((await db.loadState()).generatedWorldbook).toEqual(result);
    expect(await db.getAllHistory()).toHaveLength(1);
    expect(await db.getRollResults(0)).toHaveLength(0);
});

it('keeps the legacy checkpoint when the first new write is an atomic result commit', async () => {
    const { db, service, guard } = setup();
    const connection = await db.openDB();
    const legacy = { key: 'currentState', memoryQueue: [{ content: '旧正文' }] };
    await new Promise((resolve, reject) => {
        const tx = connection.transaction([db.stateStoreName], 'readwrite');
        tx.objectStore(db.stateStoreName).put(legacy);
        tx.oncomplete = resolve;
        tx.onabort = reject;
    });
    await service.commit(0, result, guard);
    expect(await db.loadLegacyStateBackup()).toEqual(legacy);
});

it('preserves edited and deleted entries when later chunk results are rebuilt', async () => {
    const { AppState, service, guard, db } = setup();
    await service.commit(0, { 角色: { 人: { 内容: 'AI原文' }, 删除项: { 内容: '旧' } } }, guard);
    await service.commitWorldbook({ 角色: { 人: { 内容: '人工修订' } } }, guard, '手工修改');
    await service.commit(0, { 角色: { 人: { 内容: '重生成' }, 删除项: { 内容: '重生成' } } }, guard, {
        operation: 'reroll',
    });
    expect(AppState.worldbook.generated.角色.人.内容).toBe('人工修订');
    expect(AppState.worldbook.generated.角色.删除项).toBeUndefined();
    const stored = await db.loadState();
    expect(stored.entryOverrides[0].角色.人.内容).toBe('人工修订');
    expect(stored.entryOverrides[0].角色.删除项).toBeNull();
});

it('explicit entry reroll replaces a manual override and survives later rebuilds', async () => {
    const { AppState, service, guard, db } = setup();
    await service.commit(0, result, guard);
    await service.commitWorldbook({ 角色: { 人: { 内容: '人工修订' } } }, guard);
    const patch = { 角色: { 人: { 内容: '明确要求重写' } } };
    await service.commit(0, patch, guard, { operation: 'entry-reroll', replaceEntries: true, patch });
    expect(AppState.worldbook.generated).toEqual(patch);
    expect((await db.loadState()).entryOverrides[0]).toEqual(patch);
    await service.commit(0, result, guard, { operation: 'reroll' });
    expect(AppState.worldbook.generated).toEqual(patch);
});

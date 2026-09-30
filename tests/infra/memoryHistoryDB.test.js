import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createMemoryHistoryDB } from '../../txtToWorldbook/infra/memoryHistoryDB.js';

// ============================================================
// 测试辅助
// ============================================================
function createTestDB() {
    // 创建独立的 AppState 供每个测试使用
    const AppState = {
        file: { hash: 'test-hash-123', current: null, novelName: '测试小说' },
        worldbook: { generated: {}, volumes: [], currentVolumeIndex: 0 },
        memory: { queue: [], failedQueue: [], currentIndex: 0, startIndex: 0 },
        processing: { status: 'idle' },
        ui: {},
        config: {},
        persistent: {},
        settings: {},
    };
    const Logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
    };
    const db = createMemoryHistoryDB(AppState, Logger);
    return { db, AppState };
}

// ============================================================
// openDB / 基础连接
// ============================================================
describe('MemoryHistoryDB', () => {
    let testDB;

    beforeEach(async () => {
        // 每个测试前重置 IndexedDB，避免跨测试数据泄漏
        try {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('TxtToWorldbookDB');
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
            });
        } catch {
            /* ignore */
        }

        testDB = createTestDB();
        await testDB.db.openDB();
    });

    afterEach(() => {
        if (testDB.db.db) {
            testDB.db.db.close();
            testDB.db.db = null;
        }
    });

    it('rejects state saving if the transaction aborts after a successful put and keeps the old checkpoint', async () => {
        await testDB.db.saveState(1);
        const original = IDBObjectStore.prototype.put;
        const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
            const request = original.apply(this, args);
            request.addEventListener('success', () => this.transaction.abort());
            return request;
        });
        try {
            await expect(testDB.db.saveState(2)).rejects.toMatchObject({ name: 'AbortError' });
        } finally {
            spy.mockRestore();
        }
        expect((await testDB.db.loadState()).processedIndex).toBe(1);
    });

    it('rejects roll and history writes on post-request transaction abort without leaving partial records', async () => {
        const original = IDBObjectStore.prototype.add;
        const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (...args) {
            const request = original.apply(this, args);
            request.addEventListener('success', () => this.transaction.abort());
            return request;
        });
        try {
            await expect(testDB.db.saveRollResult(0, { result: 'test' })).rejects.toMatchObject({ name: 'AbortError' });
            await expect(testDB.db.saveHistory(0, '章', {}, { result: 'test' }, [])).rejects.toMatchObject({
                name: 'AbortError',
            });
        } finally {
            spy.mockRestore();
        }
        expect(await testDB.db.getAllHistory()).toEqual([]);
        expect(await testDB.db.getRollResults(0)).toEqual([]);
    });

    it('loads rolls by stable chunk identity after reordering and isolates files', async () => {
        testDB.AppState.memory.queue = [
            { title: '同名', content: 'a' },
            { title: '同名', content: 'b' },
        ];
        await testDB.db.saveRollResult(0, { text: 'a' });
        await testDB.db.saveRollResult(1, { text: 'b' });
        testDB.AppState.memory.queue.reverse();
        expect((await testDB.db.getRollResults(0))[0].result).toEqual({ text: 'b' });
        expect((await testDB.db.getRollResults(1))[0].result).toEqual({ text: 'a' });
        testDB.AppState.file.hash = 'another-file';
        expect(await testDB.db.getRollResults(0)).toEqual([]);
    });

    describe('openDB', () => {
        it('首次打开数据库成功', async () => {
            const db2 = createTestDB();
            const result = await db2.db.openDB();
            expect(result).toBeTruthy();
            db2.db.db?.close();
        });

        it('重复打开返回已有连接', async () => {
            const first = await testDB.db.openDB();
            const second = await testDB.db.openDB();
            expect(first).toBe(second);
        });

        it('数据库版本为 7', async () => {
            const db = await testDB.db.openDB();
            expect(db.version).toBe(7);
        });

        it('数据库包含所有预期存储表', async () => {
            const db = await testDB.db.openDB();
            const names = db.objectStoreNames;
            expect(names.contains('history')).toBe(true);
            expect(names.contains('meta')).toBe(true);
            expect(names.contains('state')).toBe(true);
            expect(names.contains('rolls')).toBe(true);
            expect(names.contains('categories')).toBe(true);
            expect(names.contains('entryRolls')).toBe(true);
        });
    });

    // ============================================================
    // saveHistory / getAllHistory / getHistoryById
    // ============================================================
    describe('历史管理', () => {
        it('保存历史记录', async () => {
            const id = await testDB.db.saveHistory(0, '第1章', {}, { 角色: {} }, []);
            expect(id).toBeGreaterThan(0);
        });

        it('获取所有历史记录', async () => {
            await testDB.db.saveHistory(0, '第1章', {}, { a: 1 }, []);
            await testDB.db.saveHistory(1, '第2章', { a: 1 }, { a: 2 }, []);
            const history = await testDB.db.getAllHistory();
            expect(history.length).toBeGreaterThanOrEqual(2);
        });

        it('通过 ID 获取历史记录', async () => {
            const id = await testDB.db.saveHistory(0, '第1章', { old: 'prev' }, { test: '数据' }, []);
            const history = await testDB.db.getHistoryById(id);
            expect(history).toBeTruthy();
            expect(history.memoryTitle).toBe('第1章');
            expect(history.newWorldbook.test).toBe('数据');
            expect(history.previousWorldbook.old).toBe('prev');
        });

        it('相同 memoryTitle + fileHash 的记录自动去重', async () => {
            await testDB.db.saveHistory(0, '第1章', {}, { old: 1 }, []);
            await testDB.db.saveHistory(0, '第1章', {}, { new: 2 }, []);
            const history = await testDB.db.getAllHistory();
            const filtered = history.filter((h) => h.memoryTitle === '第1章');
            expect(filtered.length).toBe(1);
            expect(filtered[0].newWorldbook.new).toBe(2);
        });

        it('并发保存相同 memoryTitle 的记录保持原子性', async () => {
            // 同时发起 3 个保存请求
            const promises = [
                testDB.db.saveHistory(0, '第1章', {}, { v: 1 }, []),
                testDB.db.saveHistory(0, '第1章', {}, { v: 2 }, []),
                testDB.db.saveHistory(0, '第1章', {}, { v: 3 }, []),
            ];
            await Promise.all(promises);

            const history = await testDB.db.getAllHistory();
            const filtered = history.filter((h) => h.memoryTitle === '第1章');
            // 去重逻辑应确保每条唯一记录
            expect(filtered.length).toBe(1);
            // 最后一个保存应胜出
            expect(filtered[0].newWorldbook.v).toBe(3);
        });

        it('允许重复的标题 (记忆-优化) 不去重', async () => {
            await testDB.db.saveHistory(0, '记忆-优化', {}, { v1: 1 }, []);
            await testDB.db.saveHistory(0, '记忆-优化', {}, { v2: 2 }, []);
            const history = await testDB.db.getAllHistory();
            const filtered = history.filter((h) => h.memoryTitle === '记忆-优化');
            expect(filtered.length).toBe(2);
        });

        it('清空所有历史记录', async () => {
            await testDB.db.saveHistory(0, '第1章', {}, {}, []);
            await testDB.db.clearAllHistory();
            const history = await testDB.db.getAllHistory();
            expect(history).toEqual([]);
        });
    });

    // ============================================================
    // 分类持久化
    // ============================================================
    describe('分类管理', () => {
        it('保存自定义分类', async () => {
            const categories = [{ name: '角色', enabled: true }];
            await testDB.db.saveCustomCategories(categories);
            const loaded = await testDB.db.getCustomCategories();
            expect(loaded).toEqual(categories);
        });

        it('更新自定义分类', async () => {
            await testDB.db.saveCustomCategories([{ name: 'A' }]);
            await testDB.db.saveCustomCategories([{ name: 'B' }, { name: 'C' }]);
            const loaded = await testDB.db.getCustomCategories();
            expect(loaded).toEqual([{ name: 'B' }, { name: 'C' }]);
        });

        it('保存分类后能读取正确内容', async () => {
            // 新实例（共享同一 IndexedDB）
            const db2 = createTestDB();
            await db2.db.openDB();
            await db2.db.saveCustomCategories([{ name: 'X' }]);
            const loaded = await db2.db.getCustomCategories();
            expect(loaded).toEqual([{ name: 'X' }]);
            db2.db.db?.close();
        });
    });

    // ============================================================
    // 状态保存/加载
    // ============================================================
    describe('状态管理', () => {
        it('保存处理状态', async () => {
            testDB.AppState.memory.queue = [{ title: '章节A' }];
            testDB.AppState.worldbook.generated = { 角色: { 张三: {} } };
            await testDB.db.saveState(5);

            const state = await testDB.db.loadState();
            expect(state).toBeTruthy();
            expect(state.processedIndex).toBe(5);
            expect(state.memoryQueue).toEqual(testDB.AppState.memory.queue);
            expect(state.memoryQueue[0]).toMatchObject({ title: '章节A', id: expect.any(String) });
            expect(state.generatedWorldbook['角色']['张三']).toBeDefined();
        });

        it('loadState 无数据时返回 null', async () => {
            await testDB.db.clearState();
            const state = await testDB.db.loadState();
            expect(state).toBeNull();
        });

        it('clearState 移除状态', async () => {
            await testDB.db.saveState(3);
            await testDB.db.clearState();
            const state = await testDB.db.loadState();
            expect(state).toBeNull();
        });
    });

    // ============================================================
    // Roll 历史
    // ============================================================
    describe('章节 Roll 历史', () => {
        it('保存 Roll 结果', async () => {
            const id = await testDB.db.saveRollResult(0, { success: true });
            expect(id).toBeGreaterThan(0);
        });

        it('获取指定章节的 Roll 结果', async () => {
            await testDB.db.saveRollResult(0, { success: true });
            await testDB.db.saveRollResult(0, { success: false });
            await testDB.db.saveRollResult(1, { success: true });

            const results = await testDB.db.getRollResults(0);
            expect(results.length).toBe(2);
        });

        it('清空指定章节的 Roll 结果', async () => {
            await testDB.db.saveRollResult(0, { v: 1 });
            await testDB.db.saveRollResult(0, { v: 2 });
            await testDB.db.clearRollResults(0);

            const results = await testDB.db.getRollResults(0);
            expect(results).toEqual([]);
        });

        it('清空所有章节的 Roll 结果', async () => {
            await testDB.db.saveRollResult(0, { v: 1 });
            await testDB.db.saveRollResult(1, { v: 2 });
            await testDB.db.clearAllRolls();

            const results0 = await testDB.db.getRollResults(0);
            const results1 = await testDB.db.getRollResults(1);
            expect(results0).toEqual([]);
            expect(results1).toEqual([]);
        });
    });

    // ============================================================
    // 条目级别 Roll 历史
    // ============================================================
    describe('条目 Roll 历史', () => {
        it('保存条目 Roll 结果', async () => {
            const id = await testDB.db.saveEntryRollResult('角色', '张三', 0, { v: 1 });
            expect(id).toBeGreaterThan(0);
        });

        it('获取条目 Roll 结果（按时间倒序）', async () => {
            await testDB.db.saveEntryRollResult('角色', '张三', 0, { v: 1 });
            await new Promise((r) => setTimeout(r, 10)); // 确保时间戳不同
            await testDB.db.saveEntryRollResult('角色', '张三', 1, { v: 2 });

            const results = await testDB.db.getEntryRollResults('角色', '张三');
            expect(results.length).toBe(2);
            expect(results[0].timestamp).toBeGreaterThan(results[1].timestamp);
        });

        it('清空条目 Roll 结果', async () => {
            await testDB.db.saveEntryRollResult('角色', '张三', 0, { v: 1 });
            await testDB.db.clearEntryRollResults('角色', '张三');
            const results = await testDB.db.getEntryRollResults('角色', '张三');
            expect(results).toEqual([]);
        });

        it('清空所有条目 Roll 结果', async () => {
            await testDB.db.saveEntryRollResult('角色', '张三', 0, {});
            await testDB.db.saveEntryRollResult('地点', '京城', 0, {});
            await testDB.db.clearAllEntryRolls();

            const r1 = await testDB.db.getEntryRollResults('角色', '张三');
            const r2 = await testDB.db.getEntryRollResults('地点', '京城');
            expect(r1).toEqual([]);
            expect(r2).toEqual([]);
        });

        it('通过 ID 获取条目 Roll', async () => {
            const id = await testDB.db.saveEntryRollResult('角色', '张三', 0, { data: 'A' });
            const roll = await testDB.db.getEntryRollById(id);
            expect(roll.category).toBe('角色');
            expect(roll.entryName).toBe('张三');
            expect(roll.result.data).toBe('A');
        });

        it('通过 ID 删除条目 Roll', async () => {
            const id = await testDB.db.saveEntryRollResult('角色', '张三', 0, {});
            await testDB.db.deleteEntryRollById(id);
            const roll = await testDB.db.getEntryRollById(id);
            expect(roll).toBeUndefined();
        });
    });

    // ============================================================
    // 文件哈希
    // ============================================================
    describe('文件哈希管理', () => {
        it('保存和读取文件哈希', async () => {
            await testDB.db.saveFileHash('abc123');
            const hash = await testDB.db.getSavedFileHash();
            expect(hash).toBe('abc123');
        });

        it('清除文件哈希', async () => {
            await testDB.db.saveFileHash('abc123');
            await testDB.db.clearFileHash();
            const hash = await testDB.db.getSavedFileHash();
            expect(hash).toBeNull();
        });
    });

    // ============================================================
    // 回滚
    // ============================================================
    describe('回滚到历史', () => {
        it('回滚移除该历史及之后的所有记录', async () => {
            await testDB.db.saveHistory(0, '第1章', {}, { step: 1 }, []);
            const id2 = await testDB.db.saveHistory(1, '第2章', {}, { step: 2 }, []);
            await testDB.db.saveHistory(2, '第3章', {}, { step: 3 }, []);

            await testDB.db.rollbackToHistory(id2);

            const history = await testDB.db.getAllHistory();
            expect(history.length).toBe(1);
            expect(history[0].memoryTitle).toBe('第1章');
        });

        it('回滚恢复 AppState', async () => {
            testDB.AppState.worldbook.generated = { 角色: { 张三: {} } };
            const prevWB = { 角色: { 李四: {} } };
            const id = await testDB.db.saveHistory(0, '第1章', prevWB, { 角色: { 张三: {} } }, []);

            await testDB.db.rollbackToHistory(id);
            expect(testDB.AppState.worldbook.generated['角色']['李四']).toBeDefined();
            expect(testDB.AppState.worldbook.generated['角色']['张三']).toBeUndefined();
        });

        it('不存在的历史 ID 抛出错误', async () => {
            await expect(testDB.db.rollbackToHistory(99999)).rejects.toThrow('找不到');
        });
    });

    // ============================================================
    // 导出时间戳
    // ============================================================
    describe('导出时间戳', () => {
        it('保存和读取导出时间', async () => {
            const before = Date.now();
            await testDB.db.saveExportTimestamp();
            const ts = await testDB.db.getLastExportTimestamp();
            expect(ts).toBeGreaterThanOrEqual(before);
            expect(ts).toBeLessThanOrEqual(Date.now());
        });
    });
});

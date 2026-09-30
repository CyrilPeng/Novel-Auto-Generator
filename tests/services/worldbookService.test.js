import { describe, it, expect } from 'vitest';
import { createWorldbookService } from '../../src/worldbook/entries/worldbook.js';

// ============================================================
// 测试辅助
// ============================================================
function createTestService(overrides = {}) {
    const historyCalls = [];
    const service = createWorldbookService({
        getIncrementalMode: overrides.incrementalMode || (() => false),
        saveHistory: async (idx, title, prev, current, changes) => {
            historyCalls.push({ idx, title, prev, current, changes });
        },
        debugLog: () => {},
    });
    return { service, historyCalls };
}

// ============================================================
// normalizeWorldbookEntry
// ============================================================
describe('normalizeWorldbookEntry', () => {
    it('将 content 字段转换为 内容', () => {
        const { service } = createTestService();
        const entry = { 关键词: ['a'], content: '正文内容' };
        service.normalizeWorldbookEntry(entry);
        expect(entry['内容']).toBe('正文内容');
        expect(entry.content).toBeUndefined();
    });

    it('同时存在 content 和 内容时保留较长的', () => {
        const { service } = createTestService();
        const entry = { 关键词: ['a'], content: '长内容在这里', 内容: '短' };
        service.normalizeWorldbookEntry(entry);
        expect(entry['内容']).toBe('长内容在这里');
        expect(entry.content).toBeUndefined();
    });

    it('已有 内容 字段则保留', () => {
        const { service } = createTestService();
        const entry = { 关键词: ['a'], 内容: '已有的内容' };
        service.normalizeWorldbookEntry(entry);
        expect(entry['内容']).toBe('已有的内容');
    });

    it('空/无效输入原样返回', () => {
        const { service } = createTestService();
        expect(service.normalizeWorldbookEntry(null)).toBe(null);
        expect(service.normalizeWorldbookEntry(undefined)).toBeUndefined();
        expect(service.normalizeWorldbookEntry([])).toEqual([]);
    });
});

// ============================================================
// normalizeWorldbookData
// ============================================================
describe('normalizeWorldbookData', () => {
    it('规范化分类下所有条目', () => {
        const { service } = createTestService();
        const data = {
            角色: {
                张三: { 关键词: ['张三'], content: '内容A' },
                李四: { 关键词: ['李四'], content: '内容B' },
            },
        };
        service.normalizeWorldbookData(data);
        expect(data['角色']['张三']['内容']).toBe('内容A');
        expect(data['角色']['张三'].content).toBeUndefined();
        expect(data['角色']['李四']['内容']).toBe('内容B');
    });

    it('空输入原样返回', () => {
        const { service } = createTestService();
        expect(service.normalizeWorldbookData(null)).toBeNull();
        expect(service.normalizeWorldbookData(undefined)).toBeUndefined();
    });
});

// ============================================================
// mergeWorldbookData
// ============================================================
describe('mergeWorldbookData', () => {
    it('合并新分类到目标', () => {
        const { service } = createTestService();
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };
        const source = { 地点: { 京城: { 关键词: ['京城'], 内容: 'B' } } };
        service.mergeWorldbookData(target, source);
        expect(target['地点']).toBeDefined();
        expect(target['地点']['京城']['内容']).toBe('B');
    });

    it('覆盖同名字段', () => {
        const { service } = createTestService();
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: '旧内容' } } };
        const source = { 角色: { 张三: { 关键词: ['张三', '老张'], 内容: '新内容' } } };
        service.mergeWorldbookData(target, source);
        expect(target['角色']['张三']['内容']).toBe('新内容');
        expect(target['角色']['张三']['关键词']).toEqual(['张三', '老张']);
    });

    it('规范化后合并', () => {
        const { service } = createTestService();
        const target = {};
        const source = { 角色: { 张三: { 关键词: ['张三'], content: '原始字段' } } };
        service.mergeWorldbookData(target, source);
        expect(target['角色']['张三']['内容']).toBe('原始字段');
    });
});

// ============================================================
// mergeWorldbookDataIncremental
// ============================================================
describe('mergeWorldbookDataIncremental', () => {
    it('新条目直接添加', () => {
        const { service } = createTestService();
        const target = {};
        const source = { 角色: { 张三: { 关键词: ['张三'], 内容: '新角色' } } };
        service.mergeWorldbookDataIncremental(target, source);
        expect(target['角色']['张三']['内容']).toBe('新角色');
    });

    it('已存在条目时合并关键词', () => {
        const { service } = createTestService();
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };
        const source = { 角色: { 张三: { 关键词: ['老张'], 内容: 'A' } } };
        service.mergeWorldbookDataIncremental(target, source);
        expect(target['角色']['张三']['关键词']).toEqual(['张三', '老张']);
        expect(target['角色']['张三']['内容']).toBe('A');
    });

    it('已存在条目时追加新内容', () => {
        const { service } = createTestService();
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: '旧内容' } } };
        const source = { 角色: { 张三: { 关键词: ['张三'], 内容: '新信息' } } };
        service.mergeWorldbookDataIncremental(target, source);
        expect(target['角色']['张三']['内容']).toBe('旧内容\n\n---\n\n新信息');
    });

    it('已包含新内容时不重复追加', () => {
        const { service } = createTestService();
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: '已有新信息' } } };
        const source = { 角色: { 张三: { 关键词: ['张三'], 内容: '新信息' } } };
        service.mergeWorldbookDataIncremental(target, source);
        expect(target['角色']['张三']['内容']).toBe('已有新信息');
    });
});

// ============================================================
// findChangedEntries
// ============================================================
describe('findChangedEntries', () => {
    it('空世界书无变更', () => {
        const { service } = createTestService();
        const changes = service.findChangedEntries({}, {});
        expect(changes).toEqual([]);
    });

    it('新添条目被识别为 add', () => {
        const { service } = createTestService();
        const oldWB = {};
        const newWB = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };
        const changes = service.findChangedEntries(oldWB, newWB);
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('add');
        expect(changes[0].entryName).toBe('张三');
    });

    it('删除条目被识别为 delete', () => {
        const { service } = createTestService();
        const oldWB = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };
        const newWB = {};
        const changes = service.findChangedEntries(oldWB, newWB);
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('delete');
        expect(changes[0].entryName).toBe('张三');
    });

    it('修改条目被识别为 modify', () => {
        const { service } = createTestService();
        const oldWB = { 角色: { 张三: { 关键词: ['张三'], 内容: '旧' } } };
        const newWB = { 角色: { 张三: { 关键词: ['张三'], 内容: '新' } } };
        const changes = service.findChangedEntries(oldWB, newWB);
        expect(changes).toHaveLength(1);
        expect(changes[0].type).toBe('modify');
    });

    it('多分类多条目变更', () => {
        const { service } = createTestService();
        const oldWB = {
            角色: { 张三: { 关键词: ['张三'], 内容: 'A' } },
            地点: { 京城: { 关键词: ['京城'], 内容: 'B' } },
        };
        const newWB = {
            角色: { 张三: { 关键词: ['张三'], 内容: 'A' }, 李四: { 关键词: ['李四'], 内容: 'C' } },
            地点: {},
        };
        const changes = service.findChangedEntries(oldWB, newWB);
        expect(changes.some((c) => c.type === 'add' && c.entryName === '李四')).toBe(true);
        expect(changes.some((c) => c.type === 'delete' && c.entryName === '京城')).toBe(true);
    });
});

// ============================================================
// mergeWorldbookDataWithHistory
// ============================================================
describe('mergeWorldbookDataWithHistory', () => {
    it('有变更时调用 saveHistory', async () => {
        const { service, historyCalls } = createTestService();
        const target = {};
        const source = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };

        await service.mergeWorldbookDataWithHistory({
            target,
            source,
            memoryIndex: 0,
            memoryTitle: '第1章',
        });

        expect(historyCalls).toHaveLength(1);
        expect(historyCalls[0].title).toBe('第1章');
        expect(target['角色']['张三']).toBeDefined();
    });

    it('无变更时不调用 saveHistory', async () => {
        const { service, historyCalls } = createTestService();
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };
        const source = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };

        await service.mergeWorldbookDataWithHistory({
            target,
            source,
            memoryIndex: 0,
            memoryTitle: '第1章',
        });

        expect(historyCalls).toHaveLength(0);
    });

    it('增量模式下使用增量合并', async () => {
        const { service } = createTestService({ incrementalMode: () => true });
        const target = { 角色: { 张三: { 关键词: ['张三'], 内容: 'A' } } };
        const source = { 角色: { 张三: { 关键词: ['老张'], 内容: 'B' } } };

        await service.mergeWorldbookDataWithHistory({
            target,
            source,
            memoryIndex: 0,
            memoryTitle: '第1章',
        });

        // 增量模式：关键词被合并，内容被追加
        expect(target['角色']['张三']['关键词']).toEqual(['张三', '老张']);
        expect(target['角色']['张三']['内容']).toContain('A');
        expect(target['角色']['张三']['内容']).toContain('B');
    });
});

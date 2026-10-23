import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { beginRun, captureRun, configureRunEnvironment, finishRun } from '../../txtToWorldbook/core/runContext.js';
import { createMemoryHistoryDB } from '../../txtToWorldbook/infra/memoryHistoryDB.js';
import { createParserService } from '../../txtToWorldbook/services/parserService.js';
import { createWorldbookService } from '../../src/worldbook/entries/worldbook.js';
import { createChunkCommitService } from '../../src/storage/chunkCommitService.js';
import { createExportFormatService } from '../../src/worldbook/formats/exportWorldbook.js';
import { splitText } from '../../src/worldbook/processing/splitText.js';
import { naturalSortEntryNames } from '../../txtToWorldbook/core/utils.js';

const databases = [];
afterEach(() => {
    for (const db of databases) db.db?.close();
    databases.length = 0;
});

describe('世界书完整数据链路', () => {
    it('导入、模拟模型解析、事务提交、重开、导出与历史回退保持一致', async () => {
        const AppState = createInitialAppState();
        AppState.file.hash = 'integration-fixture';
        AppState.file.novelName = '集成测试';
        const novel = '第一章\n' + '第一章正文。'.repeat(1200) + '\n第二章\n' + '第二章正文。'.repeat(1200);
        AppState.memory.queue = splitText(novel, {
            chunkSize: 1500,
            pattern: '第[一二三四五六七八九十0-9]+章',
        });
        expect(AppState.memory.queue.length).toBeGreaterThan(1);

        const db = createMemoryHistoryDB(AppState, {});
        db.dbName = 'integration-flow-' + Math.random();
        databases.push(db);
        configureRunEnvironment(AppState, async () => () => {});

        const parser = createParserService({
            AppState,
            debugLog: () => {},
            getEnabledCategoryNames: () => ['角色'],
        });
        const worldbookService = createWorldbookService({ getIncrementalMode: () => false });
        const commits = createChunkCommitService({ AppState, MemoryHistoryDB: db, worldbookService });
        const run = beginRun(AppState.processing);
        const guard = captureRun(AppState.processing);
        for (let index = 0; index < AppState.memory.queue.length; index++) {
            const response = JSON.stringify({
                角色: {
                    [`角色${index}`]: { 关键词: [`角色${index}`], 内容: `第${index + 1}章摘要` },
                },
            });
            await commits.commit(index, parser.parseAIResponse(response), guard);
        }
        finishRun(AppState.processing, run);

        const reopenedState = createInitialAppState();
        const reopenedDb = createMemoryHistoryDB(reopenedState, {});
        reopenedDb.dbName = db.dbName;
        databases.push(reopenedDb);
        const persisted = await reopenedDb.loadState();
        expect(persisted.memoryQueue).toHaveLength(AppState.memory.queue.length);
        expect(Object.keys(persisted.generatedWorldbook.角色)).toHaveLength(AppState.memory.queue.length);
        expect(persisted.task.revision).toBe(AppState.memory.queue.length);

        const exportService = createExportFormatService({
            AppState,
            naturalSortEntryNames,
            getCategoryLightState: () => false,
            getCategoryAutoIncrement: () => false,
            getCategoryBaseOrder: () => 100,
            getEntryConfig: () => ({ position: 0, depth: 4, order: 100 }),
        });
        const stFormat = exportService.convertToSillyTavernFormat(persisted.generatedWorldbook);
        expect(stFormat.entries).toHaveLength(AppState.memory.queue.length);
        expect(stFormat.entries[0].content).toContain('摘要');

        const history = await db.getAllHistory();
        expect(history).toHaveLength(AppState.memory.queue.length);
        await db.rollbackToHistory(history[0].id);
        expect(AppState.worldbook.generated).toEqual(history[0].previousWorldbook);
        expect(await db.getAllHistory()).toHaveLength(0);
    });
});

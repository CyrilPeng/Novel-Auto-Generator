// Node/fake-indexeddb baseline, not a browser performance claim.
import 'fake-indexeddb/auto';
import { performance } from 'node:perf_hooks';
import { createParserService } from '../../txtToWorldbook/services/parserService.js';
import { createWorldbookService } from '../../txtToWorldbook/services/worldbookService.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { createMemoryHistoryDB } from '../../txtToWorldbook/infra/memoryHistoryDB.js';

const rows = [];
for (const targetMB of [1, 10]) {
    const AppState = createInitialAppState();
    const parser = createParserService({ AppState, debugLog: () => {}, getEnabledCategoryNames: () => ['角色'] });
    const merger = createWorldbookService();
    const worldbook = { 角色: {} };
    const count = targetMB * 1000;
    for (let i = 0; i < count; i++)
        worldbook.角色[`角色${i}`] = { 关键词: [`角色${i}`], 内容: '合成正文。'.repeat(64) };
    const text = JSON.stringify(worldbook);
    const started = performance.now();
    const parsed = parser.parseAIResponse(text);
    const parsedAt = performance.now();
    merger.mergeWorldbookData(AppState.worldbook.generated, parsed);
    const mergedAt = performance.now();
    AppState.memory.queue = [{ title: '合成块', content: text, processed: true, result: parsed }];
    const db = createMemoryHistoryDB(AppState, {});
    db.dbName = `SyntheticBenchmark${targetMB}`;
    try {
        await db.openDB();
        await db.saveState(1);
        const restored = await db.loadState();
        if (Object.keys(restored.generatedWorldbook.角色).length !== count) throw new Error('Lost benchmark entries');
        rows.push({
            entries: count,
            bytes: Buffer.byteLength(text),
            parseMs: +(parsedAt - started).toFixed(2),
            mergeMs: +(mergedAt - parsedAt).toFixed(2),
            saveAndLoadMs: +(performance.now() - mergedAt).toFixed(2),
            rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(1),
        });
    } finally {
        db.db?.close();
    }
}
console.log(
    JSON.stringify(
        {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            note: 'Synthetic Node benchmark; RSS is sampled, not peak browser memory.',
            rows,
        },
        null,
        2,
    ),
);

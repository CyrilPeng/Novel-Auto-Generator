// Synthetic Node/fake-indexeddb benchmark for the worldbook commit path.
import 'fake-indexeddb/auto';
import { performance } from 'node:perf_hooks';
import { createInitialAppState } from '../txtToWorldbook/core/state.js';
import { createWorldbookService } from '../src/worldbook/entries/worldbook.js';
import { createMemoryHistoryDB } from '../txtToWorldbook/infra/memoryHistoryDB.js';
import { createChunkCommitService } from '../src/storage/chunkCommitService.js';

const entryCount = Number(process.env.BENCH_ENTRIES || 2000);
const commitCount = Number(process.env.BENCH_COMMITS || 30);
const AppState = createInitialAppState();
AppState.file.hash = 'commit-benchmark';
AppState.file.novelName = 'commit-benchmark';
AppState.worldbook.generated = { 角色: {} };
for (let index = 0; index < entryCount; index++) {
    AppState.worldbook.generated.角色[`已有角色${index}`] = {
        关键词: [`已有角色${index}`],
        内容: '合成条目正文。'.repeat(8),
    };
}
AppState.memory.queue = Array.from({ length: commitCount }, (_, index) => ({
    title: `记忆${index + 1}`,
    content: '合成章节正文。'.repeat(100),
    processed: false,
    failed: false,
    processing: false,
}));

const MemoryHistoryDB = createMemoryHistoryDB(AppState, {});
MemoryHistoryDB.dbName = 'CommitBenchmark';
const worldbookService = createWorldbookService();
const commits = createChunkCommitService({ AppState, MemoryHistoryDB, worldbookService });
const guard = { assert() {}, signal: new AbortController().signal };

try {
    await MemoryHistoryDB.openDB();
    const start = performance.now();
    let firstCommitMs = 0;
    for (let index = 0; index < commitCount; index++) {
        const startedAt = performance.now();
        await commits.commit(
            index,
            { 角色: { [`新增角色${index}`]: { 关键词: [`新增角色${index}`], 内容: '提交测试正文。'.repeat(8) } } },
            guard,
        );
        if (index === 0) firstCommitMs = performance.now() - startedAt;
    }
    const elapsed = performance.now() - start;
    const state = await MemoryHistoryDB.loadState();
    const generatedEntries = Object.keys(state.generatedWorldbook.角色).length;
    console.log(
        JSON.stringify(
            {
                node: process.version,
                entries: entryCount,
                commits: commitCount,
                generatedEntries,
                firstCommitMs: +firstCommitMs.toFixed(2),
                totalMs: +elapsed.toFixed(2),
                averageMs: +(elapsed / commitCount).toFixed(2),
                rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(1),
                note: 'Synthetic Node/fake-indexeddb benchmark; history keeps one previous snapshot per commit.',
            },
            null,
            2,
        ),
    );
} finally {
    MemoryHistoryDB.db?.close();
}

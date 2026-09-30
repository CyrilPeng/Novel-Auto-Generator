import assert from 'node:assert/strict';
import { splitText } from '../src/worldbook/processing/splitText.js';
for (const megabytes of [1, 10, 100]) {
    const content = 'A'.repeat(megabytes * 1024 * 1024);
    const start = performance.now();
    const queue = splitText(content, { chunkSize: 15000 });
    const elapsed = performance.now() - start;
    assert.equal(queue.map((chunk) => chunk.content).join(''), content);
    assert.equal(new Set(queue.map((chunk) => chunk.id)).size, queue.length);
    console.log(
        JSON.stringify({
            megabytes,
            chunks: queue.length,
            elapsedMs: Math.round(elapsed),
            rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        }),
    );
}

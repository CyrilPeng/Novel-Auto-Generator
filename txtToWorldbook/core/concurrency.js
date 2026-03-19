/**
 * Run async tasks with a fixed concurrency limit.
 *
 * @param {Object} options
 * @param {Array<any>} options.items
 * @param {number} [options.concurrency=1]
 * @param {(item:any, index:number)=>Promise<void>} options.runItem
 * @param {()=>boolean} [options.shouldStop]
 * @returns {Promise<void>}
 */
export async function runWithConcurrency(options = {}) {
    const {
        items = [],
        concurrency = 1,
        runItem,
        shouldStop = () => false,
    } = options;

    if (!Array.isArray(items) || items.length === 0) return;
    if (typeof runItem !== 'function') {
        throw new Error('runWithConcurrency requires runItem');
    }

    const maxWorkers = Math.max(1, Math.min(concurrency || 1, items.length));
    let cursor = 0;

    const worker = async () => {
        while (!shouldStop()) {
            const current = cursor;
            if (current >= items.length) break;
            cursor += 1;
            await runItem(items[current], current);
        }
    };

    const workers = [];
    for (let i = 0; i < maxWorkers; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
}


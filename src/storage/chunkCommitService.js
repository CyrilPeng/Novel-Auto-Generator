import { applyEntryOverrides } from '../worldbook/entries/overrides.js';
import { captureTaskState } from './taskSchema.js';
import { ensureChunkIdentities, newIdentity } from '../../txtToWorldbook/core/chunkIdentity.js';
import { AbortedError } from '../../txtToWorldbook/core/errors.js';
import { createChunkRepository } from './chunkRepository.js';

export function createChunkCommitService({ AppState, MemoryHistoryDB, worldbookService }) {
    const repository = createChunkRepository(MemoryHistoryDB);
    let tail = Promise.resolve();
    function commit(index, result, guard, options = {}) {
        ensureChunkIdentities(AppState.memory.queue);
        const chunk = AppState.memory.queue[index];
        let source = structuredClone(result);
        const patch = structuredClone(options.patch || result);
        const operation = options.operation || 'extract';
        const revisionId = operation === 'extract' ? 'extract' : newIdentity(operation);
        const execute = async () => {
            guard.assert();
            if (AppState.memory.queue[index] !== chunk) throw new AbortedError('章节队列已改变');
            if (options.patch) {
                source = structuredClone(chunk.result || {});
                for (const [category, entries] of Object.entries(patch)) {
                    source[category] ??= {};
                    Object.assign(source[category], entries);
                }
            }
            if (!AppState.task || AppState.task.fileHash !== AppState.file.hash)
                AppState.task = { id: newIdentity('task'), revision: 0, fileHash: AppState.file.hash };
            const previous = structuredClone(AppState.worldbook.generated),
                next = structuredClone(previous);
            if (options.replaceEntries) {
                for (const [category, entries] of Object.entries(patch)) {
                    next[category] ??= {};
                    Object.assign(next[category], entries);
                }
            } else if (AppState.processing.incrementalMode) worldbookService.mergeWorldbookDataIncremental(next, patch);
            else worldbookService.mergeWorldbookData(next, patch);
            applyEntryOverrides(next, AppState.worldbook.overrides?.[AppState.worldbook.currentVolumeIndex]);
            const queue = structuredClone(AppState.memory.queue);
            Object.assign(queue[index], {
                result: source,
                processed: true,
                failed: false,
                failedError: null,
                processing: false,
            });
            const state = { ...captureTaskState(AppState, index + 1), memoryQueue: queue, generatedWorldbook: next };
            const saved = await repository.commit({
                taskId: AppState.task.id,
                expectedRevision: AppState.task.revision,
                commitId: AppState.task.id + ':' + chunk.id + ':' + revisionId,
                entryRoll: options.entryRoll,
                chunkId: chunk.id,
                memoryIndex: index,
                memoryTitle: chunk.title,
                result: source,
                previousWorldbook: previous,
                changedEntries: worldbookService.findChangedEntries(previous, next),
                state,
                signal: guard.signal,
            });
            guard.assert();
            const stored = saved.state?.memoryQueue.find((memory) => memory.id === chunk.id);
            if (!stored || saved.state.task.id !== AppState.task.id) throw new AbortedError('任务检查点已改变');
            for (const key of Object.keys(AppState.worldbook.generated)) delete AppState.worldbook.generated[key];
            Object.assign(AppState.worldbook.generated, saved.state.generatedWorldbook);
            Object.assign(chunk, stored);
            AppState.task = saved.state.task;
            return chunk.result;
        };
        const next = tail.then(execute, execute);
        tail = next.catch(() => {});
        return next;
    }
    function commitWorldbook(nextWorldbook, guard, title = '世界书编辑', options = {}) {
        const next = structuredClone(nextWorldbook);
        const execute = async () => {
            guard.assert();
            const previous = structuredClone(AppState.worldbook.generated);
            const state = captureTaskState(AppState, AppState.memory.queue.filter((m) => m.processed).length);
            state.generatedWorldbook = next;
            if (options.volumes) state.worldbookVolumes = structuredClone(options.volumes);
            if (options.memoryQueue) state.memoryQueue = structuredClone(options.memoryQueue);
            if (options.entryPosition) state.entryPositionConfig = structuredClone(options.entryPosition);
            const changes = worldbookService.findChangedEntries(previous, next);
            state.entryOverrides ??= {};
            const overrides = (state.entryOverrides[AppState.worldbook.currentVolumeIndex] ??= {});
            for (const change of changes) {
                overrides[change.category] ??= {};
                overrides[change.category][change.entryName] =
                    change.type === 'delete' ? null : structuredClone(change.newValue);
            }
            const saved = await repository.commit({
                taskId: state.task.id,
                expectedRevision: state.task.revision,
                commitId: newIdentity('edit'),
                worldbookEdit: true,
                memoryIndex: -1,
                previousVolumes: structuredClone(AppState.worldbook.volumes),
                previousMemoryQueue: options.memoryQueue ? structuredClone(AppState.memory.queue) : undefined,
                previousOverrides: structuredClone(AppState.worldbook.overrides || {}),
                memoryTitle: title,
                chunkId: 'worldbook',
                previousWorldbook: previous,
                changedEntries: worldbookService.findChangedEntries(previous, next),
                state,
                signal: guard.signal,
            });
            guard.assert();
            for (const key of Object.keys(AppState.worldbook.generated)) delete AppState.worldbook.generated[key];
            Object.assign(AppState.worldbook.generated, saved.state.generatedWorldbook);
            AppState.task = saved.state.task;
            AppState.worldbook.volumes = saved.state.worldbookVolumes;
            AppState.worldbook.overrides = saved.state.entryOverrides;
            if (options.memoryQueue) AppState.memory.queue = saved.state.memoryQueue;
            if (options.entryPosition) AppState.config.entryPosition = saved.state.entryPositionConfig;
        };
        const job = tail.then(execute, execute);
        tail = job.catch(() => {});
        return job;
    }
    return { commit, commitWorldbook };
}

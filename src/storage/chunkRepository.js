import { AbortedError, FatalError } from '../../txtToWorldbook/core/errors.js';

/** One commit writes its receipt, result, history and checkpoint in the same IDB transaction. */
export function createChunkRepository(database) {
    return {
        async commit(input) {
            const { signal, ...payload } = input;
            const data = structuredClone(payload);
            if (signal?.aborted) throw new AbortedError();
            const db = await database.openDB();
            if (signal?.aborted) throw new AbortedError();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(
                    [
                        database.metaStoreName,
                        database.stateStoreName,
                        database.rollStoreName,
                        database.storeName,
                        database.entryRollStoreName,
                    ],
                    'readwrite',
                );
                const meta = tx.objectStore(database.metaStoreName),
                    states = tx.objectStore(database.stateStoreName);
                let outcome;
                let failure;
                const abort = () => tx.abort();
                const cleanup = () => signal?.removeEventListener('abort', abort);
                tx.oncomplete = () => {
                    cleanup();
                    resolve(outcome);
                };
                tx.onabort = () => {
                    cleanup();
                    reject(
                        signal?.aborted
                            ? new AbortedError()
                            : failure ||
                                  new FatalError('章节提交失败，已回滚事务', {
                                      code: 'STORAGE_COMMIT_FAILED',
                                      cause: tx.error,
                                  }),
                    );
                };
                tx.onerror = () => {};
                signal?.addEventListener('abort', abort, { once: true });
                const fail = (error) => {
                    failure = error;
                    tx.abort();
                };
                const receiptKey = 'commit:' + data.commitId;
                const check = meta.get(receiptKey);
                check.onsuccess = () => {
                    try {
                        if (check.result) {
                            const current = states.get('currentState');
                            current.onsuccess = () => {
                                outcome = { duplicate: true, state: current.result };
                            };
                            return;
                        }
                        const revision = meta.get('task:' + data.taskId);
                        revision.onsuccess = () => {
                            try {
                                const actual = revision.result?.revision || 0;
                                if (actual !== data.expectedRevision) {
                                    fail(
                                        new FatalError('任务已被其他页面更新，请重新载入后继续', {
                                            code: 'REVISION_CONFLICT',
                                        }),
                                    );
                                    return;
                                }
                                const nextRevision = actual + 1;
                                const state = {
                                    ...data.state,
                                    key: 'currentState',
                                    task: {
                                        ...data.state.task,
                                        id: data.taskId,
                                        revision: nextRevision,
                                        fileHash: data.state.fileHash,
                                    },
                                };
                                states.put(state);
                                if (!data.worldbookEdit)
                                    tx.objectStore(database.rollStoreName).add({
                                        memoryIndex: data.memoryIndex,
                                        chunkId: data.chunkId,
                                        fileHash: state.fileHash,
                                        result: data.result,
                                        timestamp: Date.now(),
                                        commitId: data.commitId,
                                    });
                                if (data.changedEntries.length)
                                    tx.objectStore(database.storeName).add({
                                        memoryIndex: data.memoryIndex,
                                        memoryTitle: data.memoryTitle,
                                        chunkId: data.chunkId,
                                        fileHash: state.fileHash,
                                        previousWorldbook: data.previousWorldbook,
                                        newWorldbook: state.generatedWorldbook,
                                        changedEntries: data.changedEntries,
                                        volumeIndex: state.currentVolumeIndex,
                                        timestamp: Date.now(),
                                        commitId: data.commitId,
                                    });
                                if (data.entryRoll)
                                    tx.objectStore(database.entryRollStoreName).add({
                                        ...data.entryRoll,
                                        chunkId: data.chunkId,
                                        memoryIndex: data.memoryIndex,
                                        fileHash: state.fileHash,
                                        timestamp: Date.now(),
                                        commitId: data.commitId,
                                    });
                                meta.put({
                                    key: receiptKey,
                                    taskId: data.taskId,
                                    chunkId: data.chunkId,
                                    revision: nextRevision,
                                });
                                meta.put({ key: 'task:' + data.taskId, revision: nextRevision });
                                outcome = { duplicate: false, state };
                            } catch (error) {
                                fail(error);
                            }
                        };
                    } catch (error) {
                        fail(error);
                    }
                };
            });
        },
    };
}

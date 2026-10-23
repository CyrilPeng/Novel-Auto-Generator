import { captureTaskState } from '../../src/storage/taskSchema.js';
import { newIdentity } from '../core/chunkIdentity.js';
import { FatalError } from '../core/errors.js';
import { executeRun } from '../core/runContext.js';
import { clearProcessingStop } from '../../src/shared/tasks/lifecycle.js';

export function createHistoryRepositoryMethods({ AppState, enqueue }) {
    return {
        buildHistoryDedupKey(memoryTitle) {
            return [memoryTitle, AppState.file.hash || null];
        },

        async getDuplicateHistoryRecords(memoryTitle) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                if (!store.indexNames.contains('memoryTitleFileHash')) {
                    const request = store.getAll();
                    request.onsuccess = () => {
                        const fileHash = AppState.file.hash || null;
                        resolve(
                            (request.result || []).filter(
                                (item) => item.memoryTitle === memoryTitle && (item.fileHash || null) === fileHash,
                            ),
                        );
                    };
                    request.onerror = () => reject(request.error);
                    return;
                }
                const index = store.index('memoryTitleFileHash');
                const request = index.getAll(this.buildHistoryDedupKey(memoryTitle));
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * saveHistory
         * 并发保护：同一 (memoryTitle, fileHash) 的写操作被序列化，
         * 避免并行处理时多个 saveHistory 交叉执行读-改-写导致数据覆盖。
         *
         * @param {*} memoryIndex
         * @param {*} memoryTitle
         * @param {*} previousWorldbook
         * @param {*} newWorldbook
         * @param {*} changedEntries
         * @returns {Promise<any>}
         */

        async saveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries) {
            const fileHash = AppState.file.hash || '';
            const queueKey = `history:${memoryTitle}:${fileHash}`;
            return enqueue(queueKey, () =>
                this._doSaveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries),
            );
        },

        async _doSaveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries) {
            const db = await this.openDB();
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.storeName);

                const record = {
                    timestamp: Date.now(),
                    memoryIndex,
                    memoryTitle,
                    previousWorldbook: JSON.parse(JSON.stringify(previousWorldbook || {})),
                    newWorldbook: JSON.parse(JSON.stringify(newWorldbook || {})),
                    changedEntries: changedEntries || [],
                    fileHash: AppState.file.hash || null,
                    volumeIndex: AppState.worldbook.currentVolumeIndex,
                };

                if (!allowedDuplicates.includes(memoryTitle)) {
                    const fileHash = AppState.file.hash || null;
                    let lookupRequest;
                    if (store.indexNames.contains('memoryTitleFileHash')) {
                        const index = store.index('memoryTitleFileHash');
                        lookupRequest = index.getAll([memoryTitle, fileHash]);
                    } else {
                        lookupRequest = store.getAll();
                    }
                    lookupRequest.onsuccess = () => {
                        let duplicates = lookupRequest.result || [];
                        if (!store.indexNames.contains('memoryTitleFileHash')) {
                            duplicates = duplicates.filter(
                                (item) => item.memoryTitle === memoryTitle && (item.fileHash || null) === fileHash,
                            );
                        }
                        for (const dup of duplicates) {
                            store.delete(dup.id);
                        }
                        const addRequest = store.add(record);
                        addRequest.onsuccess = () => (commitResult = addRequest.result);
                        addRequest.onerror = () => reject(addRequest.error);
                    };
                    lookupRequest.onerror = () => {
                        const addRequest = store.add(record);
                        addRequest.onsuccess = () => (commitResult = addRequest.result);
                        addRequest.onerror = () => reject(addRequest.error);
                    };
                } else {
                    const addRequest = store.add(record);
                    addRequest.onsuccess = () => (commitResult = addRequest.result);
                    addRequest.onerror = () => reject(addRequest.error);
                }

                transaction.onerror = () => reject(transaction.error);
            });
        },

        /**
         * getAllHistory
         *
         * @returns {Promise<any>}
         */

        async getAllHistory() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * getHistoryById
         *
         * @param {*} id
         * @returns {Promise<any>}
         */

        async getHistoryById(id) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearAllHistory
         *
         * @returns {Promise<any>}
         */

        async clearAllHistory() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearAllRolls
         *
         * @returns {Promise<any>}
         */

        async rollbackToHistory(historyId) {
            return executeRun(AppState.processing, 'rollback', async (guard) => {
                clearProcessingStop(AppState.processing);
                const history = await this.getHistoryById(historyId);
                if (!history) throw new Error('找不到指定的历史记录');
                const state = captureTaskState(AppState, Math.max(0, history.memoryIndex));
                const priorTask = { ...state.task };
                state.generatedWorldbook = structuredClone(history.previousWorldbook);
                if (history.previousMemoryQueue) state.memoryQueue = structuredClone(history.previousMemoryQueue);
                else if (history.memoryIndex >= 0) {
                    for (let index = history.memoryIndex; index < state.memoryQueue.length; index++) {
                        Object.assign(state.memoryQueue[index], {
                            processed: false,
                            failed: false,
                            processing: false,
                            result: null,
                        });
                    }
                }
                if (history.previousVolumes) state.worldbookVolumes = structuredClone(history.previousVolumes);
                if (history.previousEntryPosition)
                    state.entryPositionConfig = structuredClone(history.previousEntryPosition);
                if (history.previousOverrides) state.entryOverrides = structuredClone(history.previousOverrides);
                state.task = {
                    ...priorTask,
                    id: newIdentity('task'),
                    sourceTaskId: priorTask.id,
                    revision: 0,
                    lifecycle: 'paused',
                };
                const records = await this.getAllHistory();
                const db = await this.openDB();
                guard.assert();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction([this.storeName, this.stateStoreName, this.metaStoreName], 'readwrite');
                    const abort = () => tx.abort();
                    guard.signal?.addEventListener('abort', abort, { once: true });
                    const cleanup = () => guard.signal?.removeEventListener('abort', abort);
                    let failure;
                    tx.oncomplete = () => {
                        cleanup();
                        resolve();
                    };
                    tx.onabort = () => {
                        cleanup();
                        reject(
                            failure ||
                                new FatalError('回退保存失败，原数据未改变', { code: 'STORAGE_ROLLBACK_FAILED' }),
                        );
                    };
                    tx.onerror = () => {};
                    const meta = tx.objectStore(this.metaStoreName);
                    const current = meta.get('task:' + priorTask.id);
                    current.onsuccess = () => {
                        if (current.result && current.result.revision !== priorTask.revision) {
                            failure = new FatalError('任务已被其他页面更新，请重新加载', { code: 'REVISION_CONFLICT' });
                            tx.abort();
                            return;
                        }
                        for (const record of records)
                            if (record.id >= historyId) tx.objectStore(this.storeName).delete(record.id);
                        meta.put({ key: 'task:' + priorTask.id, revision: priorTask.revision + 1 });
                        meta.put({ key: 'task:' + state.task.id, revision: 0 });
                        tx.objectStore(this.stateStoreName).put(state);
                    };
                });
                guard.assert();
                AppState.worldbook.generated = state.generatedWorldbook;
                AppState.worldbook.volumes = state.worldbookVolumes;
                AppState.worldbook.overrides = state.entryOverrides;
                AppState.config.entryPosition = state.entryPositionConfig;
                AppState.memory.queue = state.memoryQueue;
                AppState.task = state.task;
                return history;
            });
        },

        /**
         * cleanDuplicateHistory
         *
         * @returns {Promise<any>}
         */

        async cleanDuplicateHistory() {
            const db = await this.openDB();
            const allHistory = await this.getAllHistory();
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            const grouped = {};
            for (const record of allHistory) {
                const title = record.memoryTitle;
                if (allowedDuplicates.includes(title)) continue;
                const key = `${title}||${record.fileHash || ''}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(record);
            }
            const toDelete = [];
            for (const key in grouped) {
                const records = grouped[key];
                if (records.length > 1) {
                    records.sort((a, b) => b.timestamp - a.timestamp);
                    toDelete.push(...records.slice(1));
                }
            }
            if (toDelete.length > 0) {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                for (const record of toDelete) {
                    store.delete(record.id);
                }
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                    transaction.onabort = () =>
                        reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                });
                return toDelete.length;
            }
            return 0;
        },
    };
}

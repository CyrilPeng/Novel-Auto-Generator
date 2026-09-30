import { captureTaskState } from '../../src/storage/taskSchema.js';
import { FatalError } from '../core/errors.js';
import { executeRun } from '../core/runContext.js';
import { newIdentity, ensureChunkIdentities } from '../core/chunkIdentity.js';
export function createMemoryHistoryDB(AppState, _Logger) {
    // ========== 写操作并发队列 ==========
    // 保护 saveHistory 等复合读-改-写操作的原子性
    // 同一 memoryTitle 的写操作被序列化，避免并行处理时互相覆盖
    const _writeQueues = new Map();

    function enqueue(key, fn) {
        const existing = _writeQueues.get(key) || Promise.resolve();
        const next = existing.then(fn, fn); // 前一个失败也继续执行后续
        // 清理：最后一个完成后移除
        const cleanup = () => {
            if (_writeQueues.get(key) === next) _writeQueues.delete(key);
        };
        next.then(cleanup, cleanup);
        _writeQueues.set(key, next);
        return next;
    }

    const MemoryHistoryDB = {
        dbName: 'TxtToWorldbookDB',
        storeName: 'history',
        metaStoreName: 'meta',
        stateStoreName: 'state',
        rollStoreName: 'rolls',
        categoriesStoreName: 'categories',
        entryRollStoreName: 'entryRolls', // 新增：条目级别Roll历史
        db: null,

        /**
         * openDB
         *
         * @returns {Promise<any>}
         */
        async openDB() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 7); // 升级版本号
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    let historyStore;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        historyStore = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    } else {
                        historyStore = request.transaction.objectStore(this.storeName);
                    }
                    if (!historyStore.indexNames.contains('timestamp')) {
                        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                    if (!historyStore.indexNames.contains('memoryIndex')) {
                        historyStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                    }
                    if (!historyStore.indexNames.contains('memoryTitleFileHash')) {
                        historyStore.createIndex('memoryTitleFileHash', ['memoryTitle', 'fileHash'], { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.metaStoreName)) {
                        db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains(this.stateStoreName)) {
                        db.createObjectStore(this.stateStoreName, { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains(this.rollStoreName)) {
                        const rollStore = db.createObjectStore(this.rollStoreName, {
                            keyPath: 'id',
                            autoIncrement: true,
                        });
                        rollStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.categoriesStoreName)) {
                        db.createObjectStore(this.categoriesStoreName, { keyPath: 'key' });
                    }
                    // 新增：条目级别Roll历史存储
                    if (!db.objectStoreNames.contains(this.entryRollStoreName)) {
                        const entryRollStore = db.createObjectStore(this.entryRollStoreName, {
                            keyPath: 'id',
                            autoIncrement: true,
                        });
                        entryRollStore.createIndex('entryKey', 'entryKey', { unique: false }); // category:entryName
                        entryRollStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };
                request.onerror = (event) => reject(event.target.error);
            });
        },

        /**
         * saveCustomCategories
         *
         * @param {*} categories
         * @returns {Promise<any>}
         */
        async saveCustomCategories(categories) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.categoriesStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.categoriesStoreName);
                const request = store.put({ key: 'customCategories', value: categories });
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * getCustomCategories
         *
         * @returns {Promise<any>}
         */
        async getCustomCategories() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.categoriesStoreName], 'readonly');
                const store = transaction.objectStore(this.categoriesStoreName);
                const request = store.get('customCategories');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

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
        async clearAllRolls() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.rollStoreName);
                const request = store.clear();
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * saveFileHash
         *
         * @param {*} hash
         * @returns {Promise<any>}
         */
        async saveFileHash(hash) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'AppState.file.hash', value: hash });
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * getSavedFileHash
         *
         * @returns {Promise<any>}
         */
        async getSavedFileHash() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readonly');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.get('AppState.file.hash');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearFileHash
         *
         * @returns {Promise<any>}
         */
        async clearFileHash() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.delete('AppState.file.hash');
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * saveState
         *
         * @param {*} processedIndex
         * @returns {Promise<any>}
         */
        async saveState(processedIndex) {
            const state = captureTaskState(AppState, processedIndex);
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([this.stateStoreName, this.metaStoreName], 'readwrite');
                const store = tx.objectStore(this.stateStoreName),
                    meta = tx.objectStore(this.metaStoreName);
                let failure;
                tx.oncomplete = () => resolve();
                tx.onabort = () =>
                    reject(
                        failure ||
                            new FatalError('检查点保存失败，已保留上次结果', {
                                code: 'STORAGE_SAVE_FAILED',
                                cause: tx.error,
                            }),
                    );
                tx.onerror = () => {};
                const revision = meta.get('task:' + state.task.id);
                revision.onsuccess = () => {
                    if (revision.result && revision.result.revision !== state.task.revision) {
                        failure = new FatalError('检查点已更新，拒绝覆盖较新的任务结果', { code: 'REVISION_CONFLICT' });
                        tx.abort();
                        return;
                    }
                    const previous = store.get('currentState');
                    previous.onsuccess = () => {
                        if (previous.result && previous.result.schemaVersion !== 1)
                            meta.put({ key: 'legacyStateBackup', value: previous.result });
                        store.put(state);
                    };
                };
            });
        },

        /**
         * loadState
         *
         * @returns {Promise<any>}
         */
        async loadLegacyStateBackup() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([this.metaStoreName], 'readonly');
                const request = tx.objectStore(this.metaStoreName).get('legacyStateBackup');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async loadState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readonly');
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.get('currentState');
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearState
         *
         * @returns {Promise<any>}
         */
        async clearState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.delete('currentState');
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * saveRollResult
         *
         * @param {*} memoryIndex
         * @param {*} result
         * @returns {Promise<any>}
         */
        async saveRollResult(memoryIndex, result) {
            ensureChunkIdentities(AppState.memory.queue);
            const chunkId = AppState.memory.queue[memoryIndex]?.id;
            const fileHash = AppState.file.hash;
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.rollStoreName);
                const record = {
                    memoryIndex,
                    chunkId,
                    fileHash,
                    result: JSON.parse(JSON.stringify(result)),
                    timestamp: Date.now(),
                };
                const request = store.add(record);
                request.onsuccess = () => (commitResult = request.result);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * getRollResults
         *
         * @param {*} memoryIndex
         * @returns {Promise<any>}
         */
        async getRollResults(memoryIndex) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readonly');
                const store = transaction.objectStore(this.rollStoreName);
                const chunkId = AppState.memory.queue[memoryIndex]?.id;
                const request = store.getAll();
                request.onsuccess = () =>
                    resolve(
                        (request.result || []).filter(
                            (record) =>
                                (record.fileHash == null || record.fileHash === AppState.file.hash) &&
                                (record.chunkId ? record.chunkId === chunkId : record.memoryIndex === memoryIndex),
                        ),
                    );
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearRollResults
         *
         * @param {*} memoryIndex
         * @returns {Promise<any>}
         */
        async clearRollResults(memoryIndex) {
            const db = await this.openDB();
            const results = await this.getRollResults(memoryIndex);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                const store = transaction.objectStore(this.rollStoreName);
                for (const r of results) {
                    store.delete(r.id);
                }
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        },

        // ========== 新增：条目级别Roll历史方法 ==========
        async saveEntryRollResult(category, entryName, memoryIndex, result, customPrompt = '') {
            ensureChunkIdentities(AppState.memory.queue);
            const chunkId = AppState.memory.queue[memoryIndex]?.id;
            const fileHash = AppState.file.hash;
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.entryRollStoreName);
                const entryKey = `${category}:${entryName}`;
                const record = {
                    entryKey,
                    category,
                    entryName,
                    memoryIndex,
                    chunkId,
                    fileHash,
                    result: JSON.parse(JSON.stringify(result)),
                    customPrompt,
                    timestamp: Date.now(),
                };
                const request = store.add(record);
                request.onsuccess = () => (commitResult = request.result);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * getEntryRollResults
         *
         * @param {*} category
         * @param {*} entryName
         * @returns {Promise<any>}
         */
        async getEntryRollResults(category, entryName) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readonly');
                const store = transaction.objectStore(this.entryRollStoreName);
                const index = store.index('entryKey');
                const entryKey = `${category}:${entryName}`;
                const request = index.getAll(entryKey);
                request.onsuccess = () => {
                    const results = request.result || [];
                    // 按时间倒序排列
                    results.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(results);
                };
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearEntryRollResults
         *
         * @param {*} category
         * @param {*} entryName
         * @returns {Promise<any>}
         */
        async clearEntryRollResults(category, entryName) {
            const db = await this.openDB();
            const results = await this.getEntryRollResults(category, entryName);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                const store = transaction.objectStore(this.entryRollStoreName);
                for (const r of results) {
                    store.delete(r.id);
                }
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        },

        /**
         * clearAllEntryRolls
         *
         * @returns {Promise<any>}
         */
        async clearAllEntryRolls() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.entryRollStoreName);
                const request = store.clear();
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * deleteEntryRollById
         *
         * @param {*} rollId
         * @returns {Promise<any>}
         */
        async deleteEntryRollById(rollId) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.entryRollStoreName);
                const request = store.delete(rollId);
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * getEntryRollById
         *
         * @param {*} rollId
         * @returns {Promise<any>}
         */
        async getEntryRollById(rollId) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readonly');
                const store = transaction.objectStore(this.entryRollStoreName);
                const request = store.get(rollId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * rollbackToHistory
         *
         * @param {*} historyId
         * @returns {Promise<any>}
         */
        async rollbackToHistory(historyId) {
            return executeRun(AppState.processing, 'rollback', async (guard) => {
                AppState.processing.isStopped = false;
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

        async saveExportTimestamp() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'lastExportTimestamp', value: Date.now() });
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },

        async getLastExportTimestamp() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readonly');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.get('lastExportTimestamp');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },
    };
    return MemoryHistoryDB;
}

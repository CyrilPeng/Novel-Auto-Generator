export function createMemoryHistoryDB(AppState, Logger) {
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
                        const rollStore = db.createObjectStore(this.rollStoreName, { keyPath: 'id', autoIncrement: true });
                        rollStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.categoriesStoreName)) {
                        db.createObjectStore(this.categoriesStoreName, { keyPath: 'key' });
                    }
                    // 新增：条目级别Roll历史存储
                    if (!db.objectStoreNames.contains(this.entryRollStoreName)) {
                        const entryRollStore = db.createObjectStore(this.entryRollStoreName, { keyPath: 'id', autoIncrement: true });
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
                const store = transaction.objectStore(this.categoriesStoreName);
                const request = store.put({ key: 'customCategories', value: categories });
                request.onsuccess = () => resolve();
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
                        resolve((request.result || []).filter(item => item.memoryTitle === memoryTitle && (item.fileHash || null) === fileHash));
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
         * 
         * @param {*} memoryIndex
         * @param {*} memoryTitle
         * @param {*} previousWorldbook
         * @param {*} newWorldbook
         * @param {*} changedEntries
         * @returns {Promise<any>}
         */
        async saveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries) {
            const db = await this.openDB();
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);

                const record = {
                    timestamp: Date.now(),
                    memoryIndex,
                    memoryTitle,
                    previousWorldbook: JSON.parse(JSON.stringify(previousWorldbook || {})),
                    newWorldbook: JSON.parse(JSON.stringify(newWorldbook || {})),
                    changedEntries: changedEntries || [],
                    fileHash: AppState.file.hash || null,
                    volumeIndex: AppState.worldbook.currentVolumeIndex
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
                            duplicates = duplicates.filter(item => item.memoryTitle === memoryTitle && (item.fileHash || null) === fileHash);
                        }
                        for (const dup of duplicates) {
                            store.delete(dup.id);
                        }
                        const addRequest = store.add(record);
                        addRequest.onsuccess = () => resolve(addRequest.result);
                        addRequest.onerror = () => reject(addRequest.error);
                    };
                    lookupRequest.onerror = () => {
                        const addRequest = store.add(record);
                        addRequest.onsuccess = () => resolve(addRequest.result);
                        addRequest.onerror = () => reject(addRequest.error);
                    };
                } else {
                    const addRequest = store.add(record);
                    addRequest.onsuccess = () => resolve(addRequest.result);
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
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
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
                const store = transaction.objectStore(this.rollStoreName);
                const request = store.clear();
                request.onsuccess = () => resolve();
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
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'AppState.file.hash', value: hash });
                request.onsuccess = () => resolve();
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
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.delete('AppState.file.hash');
                request.onsuccess = () => resolve();
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
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                const store = transaction.objectStore(this.stateStoreName);
                const state = {
                    key: 'currentState',
                    processedIndex,
                    memoryQueue: JSON.parse(JSON.stringify(AppState.memory.queue)),
                    generatedWorldbook: JSON.parse(JSON.stringify(AppState.worldbook.generated)),
                    worldbookVolumes: JSON.parse(JSON.stringify(AppState.worldbook.volumes)),
                    currentVolumeIndex: AppState.worldbook.currentVolumeIndex,
                    fileHash: AppState.file.hash,
                    novelName: AppState.file.novelName || '',
                    timestamp: Date.now()
                };
                const request = store.put(state);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * loadState
         * 
         * @returns {Promise<any>}
         */
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
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.delete('currentState');
                request.onsuccess = () => resolve();
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
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.rollStoreName], 'readwrite');
                const store = transaction.objectStore(this.rollStoreName);
                const record = {
                    memoryIndex,
                    result: JSON.parse(JSON.stringify(result)),
                    timestamp: Date.now()
                };
                const request = store.add(record);
                request.onsuccess = () => resolve(request.result);
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
                const index = store.index('memoryIndex');
                const request = index.getAll(memoryIndex);
                request.onsuccess = () => resolve(request.result || []);
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
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.entryRollStoreName], 'readwrite');
                const store = transaction.objectStore(this.entryRollStoreName);
                const entryKey = `${category}:${entryName}`;
                const record = {
                    entryKey,
                    category,
                    entryName,
                    memoryIndex,
                    result: JSON.parse(JSON.stringify(result)),
                    customPrompt,
                    timestamp: Date.now()
                };
                const request = store.add(record);
                request.onsuccess = () => resolve(request.result);
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
                const store = transaction.objectStore(this.entryRollStoreName);
                const request = store.clear();
                request.onsuccess = () => resolve();
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
                const store = transaction.objectStore(this.entryRollStoreName);
                const request = store.delete(rollId);
                request.onsuccess = () => resolve();
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
            const history = await this.getHistoryById(historyId);
            if (!history) throw new Error('找不到指定的历史记录');

            const db = await this.openDB();
            const allHistory = await this.getAllHistory();
            const toDelete = allHistory.filter(h => h.id >= historyId);

            await new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                for (const h of toDelete) {
                    store.delete(h.id);
                }
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });

            AppState.worldbook.generated = JSON.parse(JSON.stringify(history.previousWorldbook));
            return history;
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
                });
                return toDelete.length;
            }
            return 0;
        }
    };
    return MemoryHistoryDB;
}

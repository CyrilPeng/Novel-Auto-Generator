import { ensureChunkIdentities } from '../core/chunkIdentity.js';

export function createRollRepositoryMethods({ AppState }) {
    return {
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
    };
}

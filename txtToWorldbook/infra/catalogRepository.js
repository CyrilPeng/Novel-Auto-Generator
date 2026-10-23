export function createCatalogRepositoryMethods() {
    return {
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
}

/**
 * IndexedDB数据库封装
 * 提供数据库连接、存储管理等基础功能
 */
export class Database {
    constructor() {
        this.dbName = 'WorldbookDB';
        this.version = 1;
        this.db = null;
        this.stores = {
            history: 'history',
            state: 'state',
            rolls: 'rolls',
            categories: 'categories',
            entryRolls: 'entryRolls'
        };
    }

    /**
     * 打开数据库连接
     * @returns {Promise<IDBDatabase>} 数据库实例
     */
    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 历史记录存储
                if (!db.objectStoreNames.contains(this.stores.history)) {
                    const store = db.createObjectStore(this.stores.history, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                }

                // 状态存储
                if (!db.objectStoreNames.contains(this.stores.state)) {
                    db.createObjectStore(this.stores.state, { keyPath: 'key' });
                }

                // Roll历史存储
                if (!db.objectStoreNames.contains(this.stores.rolls)) {
                    const rollStore = db.createObjectStore(this.stores.rolls, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    rollStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                }

                // 分类存储
                if (!db.objectStoreNames.contains(this.stores.categories)) {
                    db.createObjectStore(this.stores.categories, { keyPath: 'key' });
                }

                // 条目级别Roll历史
                if (!db.objectStoreNames.contains(this.stores.entryRolls)) {
                    const entryRollStore = db.createObjectStore(this.stores.entryRolls, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    entryRollStore.createIndex('entryKey', 'entryKey', { unique: false });
                    entryRollStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('[数据库] 打开失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    /**
     * 获取存储对象
     * @param {string} storeName - 存储名称
     * @param {string} mode - 访问模式: 'readonly'|'readwrite'
     * @returns {Promise<IDBObjectStore>} 存储对象
     */
    async getStore(storeName, mode = 'readonly') {
        const db = await this.open();
        const transaction = db.transaction([storeName], mode);
        return transaction.objectStore(storeName);
    }

    /**
     * 添加记录
     * @param {string} storeName - 存储名称
     * @param {Object} data - 要添加的数据
     * @returns {Promise<number>} 新记录的ID
     */
    async add(storeName, data) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新记录
     * @param {string} storeName - 存储名称
     * @param {Object} data - 要更新的数据(必须包含keyPath字段)
     * @returns {Promise<void>}
     */
    async put(storeName, data) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取记录
     * @param {string} storeName - 存储名称
     * @param {any} key - 记录键
     * @returns {Promise<Object|null>} 记录数据
     */
    async get(storeName, key) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有记录
     * @param {string} storeName - 存储名称
     * @returns {Promise<Array>} 所有记录
     */
    async getAll(storeName) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除记录
     * @param {string} storeName - 存储名称
     * @param {any} key - 记录键
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 清空存储
     * @param {string} storeName - 存储名称
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 使用索引查询
     * @param {string} storeName - 存储名称
     * @param {string} indexName - 索引名称
     * @param {any} key - 查询键
     * @returns {Promise<Array>} 匹配的记录
     */
    async getByIndex(storeName, indexName, key) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const index = store.index(indexName);
            const request = index.getAll(key);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
}

// 导出单例
export const db = new Database();

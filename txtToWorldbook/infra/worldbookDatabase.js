export const WORLDBOOK_DB_NAME = 'TxtToWorldbookDB';
export const WORLDBOOK_DB_VERSION = 7;
export const WORLDBOOK_STORE_NAMES = Object.freeze({
    history: 'history',
    meta: 'meta',
    state: 'state',
    rolls: 'rolls',
    categories: 'categories',
    entryRolls: 'entryRolls',
});

function ensureStore(db, transaction, name, options) {
    if (db.objectStoreNames.contains(name)) return transaction.objectStore(name);
    return db.createObjectStore(name, options);
}

export function upgradeWorldbookDatabase(db, transaction) {
    const historyStore = ensureStore(db, transaction, WORLDBOOK_STORE_NAMES.history, {
        keyPath: 'id',
        autoIncrement: true,
    });
    if (!historyStore.indexNames.contains('timestamp'))
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
    if (!historyStore.indexNames.contains('memoryIndex'))
        historyStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });
    if (!historyStore.indexNames.contains('memoryTitleFileHash'))
        historyStore.createIndex('memoryTitleFileHash', ['memoryTitle', 'fileHash'], { unique: false });

    ensureStore(db, transaction, WORLDBOOK_STORE_NAMES.meta, { keyPath: 'key' });
    ensureStore(db, transaction, WORLDBOOK_STORE_NAMES.state, { keyPath: 'key' });
    ensureStore(db, transaction, WORLDBOOK_STORE_NAMES.categories, { keyPath: 'key' });

    const rollStore = ensureStore(db, transaction, WORLDBOOK_STORE_NAMES.rolls, {
        keyPath: 'id',
        autoIncrement: true,
    });
    if (!rollStore.indexNames.contains('memoryIndex'))
        rollStore.createIndex('memoryIndex', 'memoryIndex', { unique: false });

    const entryRollStore = ensureStore(db, transaction, WORLDBOOK_STORE_NAMES.entryRolls, {
        keyPath: 'id',
        autoIncrement: true,
    });
    if (!entryRollStore.indexNames.contains('entryKey'))
        entryRollStore.createIndex('entryKey', 'entryKey', { unique: false });
    if (!entryRollStore.indexNames.contains('timestamp'))
        entryRollStore.createIndex('timestamp', 'timestamp', { unique: false });
}

export function openWorldbookDatabase(dbName = WORLDBOOK_DB_NAME, version = WORLDBOOK_DB_VERSION) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = (event) => upgradeWorldbookDatabase(event.target.result, request.transaction);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

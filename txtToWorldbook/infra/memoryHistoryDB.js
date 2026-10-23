import { openWorldbookDatabase, WORLDBOOK_DB_NAME, WORLDBOOK_STORE_NAMES } from './worldbookDatabase.js';
import { createCatalogRepositoryMethods } from './catalogRepository.js';
import { createHistoryRepositoryMethods } from './historyRepository.js';
import { createRollRepositoryMethods } from './rollRepository.js';
import { createStateRepositoryMethods } from './stateRepository.js';

export function createMemoryHistoryDB(AppState, _Logger) {
    const _writeQueues = new Map();

    function enqueue(key, fn) {
        const existing = _writeQueues.get(key) || Promise.resolve();
        const next = existing.then(fn, fn);
        const cleanup = () => {
            if (_writeQueues.get(key) === next) _writeQueues.delete(key);
        };
        next.then(cleanup, cleanup);
        _writeQueues.set(key, next);
        return next;
    }

    const MemoryHistoryDB = {
        dbName: WORLDBOOK_DB_NAME,
        storeName: WORLDBOOK_STORE_NAMES.history,
        metaStoreName: WORLDBOOK_STORE_NAMES.meta,
        stateStoreName: WORLDBOOK_STORE_NAMES.state,
        rollStoreName: WORLDBOOK_STORE_NAMES.rolls,
        categoriesStoreName: WORLDBOOK_STORE_NAMES.categories,
        entryRollStoreName: WORLDBOOK_STORE_NAMES.entryRolls,
        db: null,

        async openDB() {
            if (this.db) return this.db;
            this.db = await openWorldbookDatabase(this.dbName);
            return this.db;
        },
    };

    Object.assign(
        MemoryHistoryDB,
        createCatalogRepositoryMethods(),
        createStateRepositoryMethods({ AppState }),
        createHistoryRepositoryMethods({ AppState, enqueue }),
        createRollRepositoryMethods({ AppState }),
    );
    return MemoryHistoryDB;
}

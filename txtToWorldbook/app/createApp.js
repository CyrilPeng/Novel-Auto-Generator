import { createInitialAppState } from '../core/state.js';
import { createMemoryHistoryDB } from '../infra/memoryHistoryDB.js';

/**
 * Create shared app context used by the TXT-to-Worldbook runtime.
 */
export function createAppContext(options = {}) {
    const {
        defaultCategoryLight,
        defaultPlotOutlineConfig,
        defaultParallelConfig,
        defaultChapterRegex,
        defaultWorldbookCategories,
        defaultSettings,
        Logger,
    } = options;

    const AppState = createInitialAppState({
        defaultCategoryLight,
        defaultPlotOutlineConfig,
        defaultParallelConfig,
        defaultChapterRegex,
        defaultWorldbookCategories,
        defaultSettings,
    });

    const MemoryHistoryDB = createMemoryHistoryDB(AppState, Logger);

    return {
        AppState,
        MemoryHistoryDB,
    };
}

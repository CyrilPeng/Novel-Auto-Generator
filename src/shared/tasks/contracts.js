// @ts-check

/**
 * @typedef {'idle'|'running'|'repairing'|'rerolling'|'pausing'|'paused'|'stopping'|'stopped'|'completed'|'failed'} TaskStatus
 */

/**
 * @typedef {Object} WorldbookEntry
 * @property {string[]} [关键词]
 * @property {string} [内容]
 * @property {Record<string, any>} [_st] Preserved SillyTavern fields.
 */

/**
 * @typedef {Object} ChunkRecord
 * @property {string} [id]
 * @property {string} [parentId]
 * @property {string} title
 * @property {string} content
 * @property {boolean} [processed]
 * @property {boolean} [failed]
 * @property {string|null} [failedError]
 * @property {boolean} [processing]
 * @property {Record<string, Record<string, WorldbookEntry>>|null} [result]
 * @property {{rootId: string, start: number, end: number}} [source]
 */

/**
 * @typedef {Object} TaskRecord
 * @property {string} id
 * @property {number} revision
 * @property {string|null} [fileHash]
 * @property {string} [lifecycle]
 * @property {string} [sourceTaskId]
 */

/**
 * @typedef {Object} HistoryRecord
 * @property {number} [id]
 * @property {string} [commitId]
 * @property {number} memoryIndex
 * @property {string} memoryTitle
 * @property {Record<string, Record<string, WorldbookEntry>>} [previousWorldbook]
 * @property {{type: string, category: string, entryName: string}[]} [changedEntries]
 * @property {number} [timestamp]
 */

/**
 * @typedef {Object} ProcessingState
 * @property {TaskStatus|string} status
 * @property {boolean} isStopped
 * @property {boolean} isRunning
 * @property {boolean} isRepairing
 * @property {boolean} isRerolling
 * @property {boolean} incrementalMode
 * @property {boolean} volumeMode
 * @property {string} streamContent
 * @property {Set<number>} activeTasks
 */

export {};

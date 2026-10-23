// @ts-check

/** @typedef {'idle'|'running'|'repairing'|'rerolling'|'pausing'|'paused'|'stopping'|'stopped'|'completed'|'failed'} ProcessingStatus */

/** @type {ReadonlySet<ProcessingStatus>} */
export const ACTIVE_PROCESSING_STATUSES = new Set(['running', 'repairing', 'rerolling']);

/** @param {unknown} status @returns {string} */
export function normalizeProcessingStatus(status) {
    return typeof status === 'string' && status ? status : 'idle';
}

/**
 * @param {unknown} status
 * @returns {{status: string, isStopped: boolean, isRerolling: boolean, isRepairing: boolean, isRunning: boolean}}
 */
export function deriveProcessingFlags(status) {
    const next = normalizeProcessingStatus(status);
    return {
        status: next,
        isStopped: next === 'stopped',
        isRerolling: next === 'rerolling',
        isRepairing: next === 'repairing',
        isRunning: ACTIVE_PROCESSING_STATUSES.has(/** @type {ProcessingStatus} */ (next)),
    };
}

/**
 * @param {{status?: string, isStopped?: boolean, isRerolling?: boolean, isRepairing?: boolean, isRunning?: boolean}} processing
 * @param {unknown} status
 */
export function applyProcessingStatus(processing, status) {
    Object.assign(processing, deriveProcessingFlags(status));
    return processing.status;
}

/** @param {{isStopped?: boolean, status?: string}} processing */
export function clearProcessingStop(processing) {
    if (!processing.isStopped) return;
    processing.isStopped = false;
    if (processing.status === 'stopped') applyProcessingStatus(processing, 'idle');
}

/** @param {{status?: string}} processing */
export function readProcessingStatus(processing) {
    return normalizeProcessingStatus(processing.status);
}

import { stopRun } from '../core/runContext.js';
export function createProcessingStateService(deps = {}) {
    const { AppState } = deps;

    function setProcessingStatus(status) {
        const next = status || 'idle';
        if (next === 'stopped') stopRun(AppState.processing);
        AppState.processing.status = next;
        AppState.processing.isStopped = next === 'stopped';
        AppState.processing.isRerolling = next === 'rerolling';
        AppState.processing.isRepairing = next === 'repairing';
        AppState.processing.isRunning = next === 'running' || next === 'rerolling' || next === 'repairing';
    }

    function getProcessingStatus() {
        return AppState.processing.status || 'idle';
    }

    return {
        setProcessingStatus,
        getProcessingStatus,
    };
}

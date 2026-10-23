import { stopRun } from '../core/runContext.js';
import { applyProcessingStatus, readProcessingStatus } from '../../src/shared/tasks/lifecycle.js';

export function createProcessingStateService(deps = {}) {
    const { AppState } = deps;

    function setProcessingStatus(status) {
        if (status === 'stopped') stopRun(AppState.processing);
        applyProcessingStatus(AppState.processing, status);
    }

    function getProcessingStatus() {
        return readProcessingStatus(AppState.processing);
    }

    return {
        setProcessingStatus,
        getProcessingStatus,
    };
}

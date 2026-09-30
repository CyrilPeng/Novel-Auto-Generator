import { expect, it, vi } from 'vitest';
import { createModalController } from '../../txtToWorldbook/ui/modalController.js';
import { beginRun } from '../../txtToWorldbook/core/runContext.js';

it('closing a conversion requests a drain without discarding in-flight work', () => {
    const AppState = { processing: { activeTasks: new Set([0]) }, memory: { queue: [{ processing: true }] } };
    const run = beginRun(AppState.processing);
    const abort = vi.fn(),
        remove = vi.fn(),
        setProcessingStatus = vi.fn();
    const controller = createModalController({
        AppState,
        setProcessingStatus,
        getGlobalSemaphore: () => ({ abort }),
        getModalContainer: () => ({ remove }),
        setModalContainer: vi.fn(),
        removeEscListener: vi.fn(),
    });
    controller.closeModal();
    expect(run.lifecycle).toBe('pausing');
    expect(run.controller.signal.aborted).toBe(false);
    expect(abort).not.toHaveBeenCalled();
    expect(AppState.processing.activeTasks.size).toBe(1);
    expect(AppState.memory.queue[0].processing).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
});

import { AbortedError, UserError } from './errors.js';

let nextId = 0;

export function beginRun(processing, operation = 'convert') {
    if (processing.run?.pending || processing.isRunning) throw new UserError('上一任务正在结束，请稍后再开始');
    processing.run?.controller.abort();
    const run = {
        id: ++nextId,
        operation,
        lifecycle: 'running',
        controller: new AbortController(),
        pending: true,
        pauseRequested: false,
    };
    processing.run = run;
    return run;
}

export function pauseRun(processing) {
    const run = processing.run;
    if (!run?.pending || run.controller.signal.aborted) return false;
    run.pauseRequested = true;
    run.lifecycle = 'pausing';
    return true;
}

export function stopRun(processing) {
    const run = processing.run;
    if (!run?.pending) return;
    run.lifecycle = 'stopping';
    run.controller.abort();
}

export function finishRun(processing, run, error = null) {
    if (!run.pending) return processing.run === run;
    run.pending = false;
    run.lifecycle = run.controller.signal.aborted
        ? 'stopped'
        : error
          ? 'failed'
          : run.pauseRequested
            ? 'paused'
            : 'completed';
    return processing.run === run;
}

export async function guardAwait(guard, operation) {
    const result = await operation;
    guard.assert();
    return result;
}

/** Also works for legacy direct calls with no top-level run. */
export function captureRun(processing) {
    const run = processing.run;
    return {
        signal: run?.controller.signal,
        canDispatch: () =>
            processing.run === run && !run?.pauseRequested && !run?.controller.signal.aborted && !processing.isStopped,
        owns: () => processing.run === run,
        assert() {
            if (processing.run !== run || run?.controller.signal.aborted || processing.isStopped)
                throw new AbortedError('ABORTED');
        },
    };
}

/** Owns the complete async command, including cleanup, across all entry points. */
export async function executeRun(processing, operation, callback, hooks = {}) {
    const run = beginRun(processing, operation);
    const guard = captureRun(processing);
    let failure = null;
    try {
        hooks.start?.(run);
        const result = await callback(guard);
        guard.assert();
        return result;
    } catch (error) {
        failure = error;
        throw error;
    } finally {
        if (finishRun(processing, run, failure)) hooks.finish?.(run);
    }
}

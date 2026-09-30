import { AbortedError, UserError } from './errors.js';

let nextId = 0;

export function beginRun(processing) {
    if (processing.run?.pending) throw new UserError('上一任务正在结束，请稍后再开始');
    processing.run?.controller.abort();
    const run = { id: ++nextId, controller: new AbortController(), pending: true };
    processing.run = run;
    return run;
}

export function stopRun(processing) {
    processing.run?.controller.abort();
}

export function finishRun(processing, run) {
    run.pending = false;
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
        owns: () => processing.run === run,
        assert() {
            if (processing.run !== run || run?.controller.signal.aborted || processing.isStopped)
                throw new AbortedError('ABORTED');
        },
    };
}

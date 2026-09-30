import { expect, it } from 'vitest';
import { beginRun, captureRun, pauseRun, stopRun, finishRun } from '../../txtToWorldbook/core/runContext.js';

it('separates operation from lifecycle and rejects overlapping starts', () => {
    const processing = { isStopped: false };
    const run = beginRun(processing, 'repair');
    const guard = captureRun(processing);
    expect(run.operation).toBe('repair');
    expect(() => beginRun(processing)).toThrow();
    pauseRun(processing);
    pauseRun(processing);
    expect(run.lifecycle).toBe('pausing');
    expect(guard.canDispatch()).toBe(false);
    expect(() => guard.assert()).not.toThrow();
    finishRun(processing, run);
    expect(run.lifecycle).toBe('paused');
    const resumed = beginRun(processing, 'repair');
    expect(resumed.id).not.toBe(run.id);
    expect(() => guard.assert()).toThrow();
    stopRun(processing);
    stopRun(processing);
    expect(resumed.lifecycle).toBe('stopping');
    expect(() => captureRun(processing).assert()).toThrow();
    finishRun(processing, resumed);
    expect(resumed.lifecycle).toBe('stopped');
});

it('keeps a completed run terminal and records failure', () => {
    const processing = {};
    const run = beginRun(processing);
    finishRun(processing, run, new Error('save failed'));
    finishRun(processing, run);
    expect(run.lifecycle).toBe('failed');
    expect(pauseRun(processing)).toBe(false);
});

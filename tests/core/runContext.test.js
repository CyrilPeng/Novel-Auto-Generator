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

it('captures run configuration and releases the writer only after finalization', async () => {
    const { configureRunEnvironment, runConfiguration, executeRun } =
        await import('../../txtToWorldbook/core/runContext.js');
    let released = 0;
    const state = {
        processing: {},
        settings: { customApiModel: 'first' },
        config: { parallel: { concurrency: 2 } },
        persistent: { customCategories: [] },
    };
    configureRunEnvironment(state, async () => () => released++);
    const task = executeRun(state.processing, 'convert', async () => {
        expect(runConfiguration(state).settings.customApiModel).toBe('first');
        expect(runConfiguration(state).config.parallel.concurrency).toBe(2);
        expect(released).toBe(0);
    });
    state.settings.customApiModel = 'second';
    state.config.parallel.concurrency = 8;
    await task;
    expect(released).toBe(1);
    expect(runConfiguration(state).settings.customApiModel).toBe('second');
});

it('does not enter the command when another page holds the writer', async () => {
    const { configureRunEnvironment, executeRun } = await import('../../txtToWorldbook/core/runContext.js');
    const state = { processing: {}, settings: {}, config: {}, persistent: { customCategories: [] } };
    configureRunEnvironment(state, async () => {
        throw new Error('busy');
    });
    let entered = false;
    await expect(
        executeRun(state.processing, 'convert', () => {
            entered = true;
        }),
    ).rejects.toThrow('busy');
    expect(entered).toBe(false);
    expect(state.processing.run.pending).toBe(false);
});

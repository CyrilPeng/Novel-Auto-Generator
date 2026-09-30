import { describe, it, expect } from 'vitest';
import { captureTaskState, migrateTaskState, withoutCredentials } from '../../src/storage/taskSchema.js';

describe('task schema migration', () => {
    const legacy = () => ({
        version: '2.9.0',
        fileHash: 'fixture',
        memoryQueue: [{ title: '第一章', content: '正文', processing: true, processed: true, result: { 角色: {} } }],
        settings: { customApiKey: 'secret', temperature: 0.4 },
        generatedWorldbook: { 角色: {} },
    });
    it('migrates without mutating the source and remains idempotent', () => {
        const input = legacy();
        const migrated = migrateTaskState(input);
        expect(migrated.memoryQueue[0]).toMatchObject({ processing: false, processed: true });
        expect(migrated.memoryQueue[0].id).toBeTruthy();
        expect(migrateTaskState(migrated)).toEqual(migrated);
        expect(input.memoryQueue[0].id).toBeUndefined();
        expect(input.settings.customApiKey).toBe('secret');
        expect(migrated.settings).toEqual({ temperature: 0.4 });
    });
    it('forks imported identity while preserving completed outcome and results', () => {
        const input = { ...legacy(), task: { id: 'old-task', revision: 9, lifecycle: 'completed' } };
        const migrated = migrateTaskState(input, { fork: true });
        expect(migrated.task).toMatchObject({ revision: 0, lifecycle: 'completed', sourceTaskId: 'old-task' });
        expect(migrated.task.id).not.toBe('old-task');
        expect(migrated.generatedWorldbook).toEqual(input.generatedWorldbook);
    });
    it.each([
        { schemaVersion: 2 },
        { settings: [] },
        { memoryQueue: [[]] },
        { task: { id: 1, revision: 0 } },
        { task: { id: 'x', revision: -1 } },
    ])('rejects invalid schema %j', (change) => {
        expect(() => migrateTaskState({ ...legacy(), ...change })).toThrow();
    });
    it('rejects prototype keys before applying imported data', () => {
        const input = JSON.parse('{"memoryQueue":[],"settings":{"__proto__":{"polluted":true}}}');
        expect(() => migrateTaskState(input)).toThrow('不安全');
        expect({}.polluted).toBeUndefined();
    });
    it('removes credentials from normal task snapshots and endpoint URLs', () => {
        expect(
            withoutCredentials({
                customApiKey: 'secret',
                customApiEndpoint: 'https://user:pass@example.org/v1?key=secret&mode=test',
            }),
        ).toEqual({ customApiEndpoint: 'https://example.org/v1?mode=test' });
        const state = {
            file: { hash: 'f' },
            memory: { queue: [] },
            worldbook: { generated: {}, volumes: [] },
            settings: { customApiKey: 'secret' },
            config: { parallel: { mode: 'batch' } },
        };
        const snapshot = captureTaskState(state, 0);
        state.config.parallel.mode = 'serial';
        expect(snapshot.parallelConfig.mode).toBe('batch');
        expect(snapshot.settings.customApiKey).toBeUndefined();
    });
});

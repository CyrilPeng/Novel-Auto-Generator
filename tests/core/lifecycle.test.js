import { describe, expect, it } from 'vitest';
import {
    applyProcessingStatus,
    clearProcessingStop,
    deriveProcessingFlags,
    readProcessingStatus,
} from '../../src/shared/tasks/lifecycle.js';

describe('processing lifecycle', () => {
    it.each([
        ['running', { isRunning: true, isStopped: false, isRepairing: false, isRerolling: false }],
        ['rerolling', { isRunning: true, isStopped: false, isRepairing: false, isRerolling: true }],
        ['repairing', { isRunning: true, isStopped: false, isRepairing: true, isRerolling: false }],
        ['stopped', { isRunning: false, isStopped: true, isRepairing: false, isRerolling: false }],
        ['idle', { isRunning: false, isStopped: false, isRepairing: false, isRerolling: false }],
    ])('derives %s flags from one status', (status, expected) => {
        expect(deriveProcessingFlags(status)).toMatchObject({ status, ...expected });
    });

    it('applies status flags and clears a stale stop', () => {
        const processing = { status: 'stopped', isStopped: true, isRunning: false };
        applyProcessingStatus(processing, 'running');
        expect(processing).toMatchObject({ status: 'running', isRunning: true, isStopped: false });
        processing.status = 'stopped';
        processing.isStopped = true;
        clearProcessingStop(processing);
        expect(processing).toMatchObject({ status: 'idle', isStopped: false });
    });

    it('normalizes missing and unknown values without losing custom operations', () => {
        expect(readProcessingStatus({})).toBe('idle');
        expect(deriveProcessingFlags(undefined).status).toBe('idle');
        expect(deriveProcessingFlags('merge').status).toBe('merge');
        expect(deriveProcessingFlags('merge').isRunning).toBe(false);
    });
});

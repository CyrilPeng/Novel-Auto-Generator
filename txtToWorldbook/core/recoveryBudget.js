import { FatalError } from './errors.js';

/** Shared by all descendants of a source chunk; never reset by split/volume retries. */
export function createRecoveryBudget(limit = 8) {
    let remaining = limit;
    return {
        consume() {
            if (remaining <= 0)
                throw new FatalError('自动拆分/分卷次数已达上限，请缩短原文或调整上下文后重试', {
                    code: 'RECOVERY_EXHAUSTED',
                });
            remaining--;
        },
        get remaining() {
            return remaining;
        },
    };
}

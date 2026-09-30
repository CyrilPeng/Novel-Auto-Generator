// @ts-check
import { UserError } from '../../txtToWorldbook/core/errors.js';

/** Web Locks are origin-wide and automatically released when a page closes. */
/** @param {AbortSignal} signal @param {LockManager} locks @returns {Promise<() => void>} */
export function acquireWriter(signal, locks = globalThis.navigator?.locks) {
    if (!locks)
        return Promise.reject(new UserError('当前浏览器无法锁定任务，请使用支持 Web Locks 的本地或 HTTPS 酒馆页面'));
    return new Promise((resolve, reject) => {
        locks
            .request('novel-auto-generator:worldbook-writer', { ifAvailable: true }, async (lock) => {
                if (!lock) throw new UserError('另一个酒馆页面正在执行任务，请等待该任务停止后重试');
                if (signal.aborted) throw signal.reason || new UserError('任务已停止');
                await new Promise((release) => resolve(() => release(undefined)));
            })
            .catch(reject);
    });
}

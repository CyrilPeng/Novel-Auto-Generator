import { captureTaskState } from '../../src/storage/taskSchema.js';
import { FatalError } from '../core/errors.js';

export function createStateRepositoryMethods({ AppState }) {
    return {
        async saveState(processedIndex, importedState = null) {
            const state = importedState
                ? { ...structuredClone(importedState), key: 'currentState', processedIndex }
                : captureTaskState(AppState, processedIndex);
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([this.stateStoreName, this.metaStoreName], 'readwrite');
                const store = tx.objectStore(this.stateStoreName),
                    meta = tx.objectStore(this.metaStoreName);
                let failure;
                tx.oncomplete = () => resolve();
                tx.onabort = () =>
                    reject(
                        failure ||
                            new FatalError('检查点保存失败，已保留上次结果', {
                                code: 'STORAGE_SAVE_FAILED',
                                cause: tx.error,
                            }),
                    );
                tx.onerror = () => {};
                const revision = meta.get('task:' + state.task.id);
                revision.onsuccess = () => {
                    if (revision.result && revision.result.revision !== state.task.revision) {
                        failure = new FatalError('检查点已更新，拒绝覆盖较新的任务结果', { code: 'REVISION_CONFLICT' });
                        tx.abort();
                        return;
                    }
                    const previous = store.get('currentState');
                    previous.onsuccess = () => {
                        if (previous.result && previous.result.schemaVersion !== 1)
                            meta.put({ key: 'legacyStateBackup', value: previous.result });
                        store.put(state);
                    };
                };
            });
        },

        /**
         * loadState
         *
         * @returns {Promise<any>}
         */

        async loadLegacyStateBackup() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction([this.metaStoreName], 'readonly');
                const request = tx.objectStore(this.metaStoreName).get('legacyStateBackup');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async loadState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readonly');
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.get('currentState');
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * clearState
         *
         * @returns {Promise<any>}
         */

        async clearState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                transaction.onabort = () => reject(transaction.error || new DOMException('事务已中止', 'AbortError'));
                let commitResult;
                transaction.oncomplete = () => resolve(commitResult);
                transaction.onerror = () => reject(transaction.error);
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.delete('currentState');
                request.onsuccess = () => (commitResult = undefined);
                request.onerror = () => reject(request.error);
            });
        },
    };
}

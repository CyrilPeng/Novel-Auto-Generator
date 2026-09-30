import { executeRun } from '../../../txtToWorldbook/core/runContext.js';

/** UI supplies a synchronous edit over a detached draft; only committed data becomes visible. */
export function createEditCommand({ AppState, commitWorldbook }) {
    return (edit, title) =>
        executeRun(AppState.processing, 'edit', async (guard) => {
            AppState.processing.isStopped = false;
            const draft = {
                ...AppState,
                worldbook: structuredClone(AppState.worldbook),
                memory: { ...AppState.memory, queue: structuredClone(AppState.memory.queue) },
                config: structuredClone(AppState.config),
            };
            const result = edit(draft);
            guard.assert();
            if (!commitWorldbook) throw new Error('缺少世界书提交仓储');
            await commitWorldbook(draft.worldbook.generated, guard, title, {
                volumes: draft.worldbook.volumes,
                memoryQueue: draft.memory.queue,
                entryPosition: draft.config.entryPosition,
            });
            return result;
        });
}

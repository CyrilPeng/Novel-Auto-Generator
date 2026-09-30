import { assignSplitIdentities } from '../core/chunkIdentity.js';
export function createMemoryQueueActionsService(deps = {}) {
    const { AppState, ErrorHandler, confirmAction, updateMemoryQueueUI, updateStartButtonState } = deps;

    function normalizeUntitledMemories() {
        AppState.memory.queue.forEach((memory, index) => {
            if (!memory.title.includes('-')) {
                memory.title = `记忆${index + 1}`;
            }
        });
    }

    function syncQueueSelectionAfterDelete(index) {
        if (AppState.memory.startIndex > index) {
            AppState.memory.startIndex = Math.max(0, AppState.memory.startIndex - 1);
        } else if (AppState.memory.startIndex >= AppState.memory.queue.length) {
            AppState.memory.startIndex = Math.max(0, AppState.memory.queue.length - 1);
        }

        if (AppState.memory.userSelectedIndex !== null) {
            if (AppState.memory.userSelectedIndex > index) {
                AppState.memory.userSelectedIndex = Math.max(0, AppState.memory.userSelectedIndex - 1);
            } else if (AppState.memory.userSelectedIndex >= AppState.memory.queue.length) {
                AppState.memory.userSelectedIndex = null;
            }
        }
    }

    function splitMemoryIntoTwo(memoryIndex, options = {}) {
        if (AppState.processing?.run?.pending && !options.allowDuringRun) {
            ErrorHandler.showUserError('请先暂停任务并等待保存完成后再拆分章节');
            return null;
        }
        const memory = AppState.memory.queue[memoryIndex];
        if (!memory) return null;

        const content = memory.content;
        const halfLength = Math.floor(content.length / 2);
        let splitPoint = halfLength;

        const paragraphBreak = content.indexOf('\n\n', halfLength);
        if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
            splitPoint = paragraphBreak + 2;
        } else {
            const sentenceBreak = content.indexOf('。', halfLength);
            if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                splitPoint = sentenceBreak + 1;
            }
        }

        if (splitPoint <= 0 || splitPoint >= content.length) return null;
        const content1 = content.substring(0, splitPoint);
        const content2 = content.substring(splitPoint);
        const originalTitle = memory.title;
        let baseName = originalTitle;
        let suffix1;
        let suffix2;

        const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
        if (splitMatch) {
            baseName = splitMatch[1];
            const currentNum = parseInt(splitMatch[2], 10);
            suffix1 = `-${currentNum}-1`;
            suffix2 = `-${currentNum}-2`;
        } else {
            suffix1 = '-1';
            suffix2 = '-2';
        }

        const memory1 = {
            title: baseName + suffix1,
            content: content1,
            processed: false,
            failed: false,
            failedError: null,
        };
        const memory2 = {
            title: baseName + suffix2,
            content: content2,
            processed: false,
            failed: false,
            failedError: null,
        };
        assignSplitIdentities(memory, memory1, memory2);
        AppState.memory.queue.splice(memoryIndex, 1, memory1, memory2);
        return { part1: memory1, part2: memory2 };
    }

    async function deleteMemoryAt(index) {
        if (AppState.processing?.run?.pending) {
            ErrorHandler.showUserError('请先暂停并等待保存完成');
            return;
        }
        if (index < 0 || index >= AppState.memory.queue.length) return;
        const memory = AppState.memory.queue[index];

        if (!(await confirmAction(`确定要删除 "${memory.title}" 吗？`, { title: '删除章节', danger: true }))) {
            return;
        }

        if (AppState.processing?.run?.pending) return;
        AppState.memory.queue.splice(index, 1);
        normalizeUntitledMemories();
        syncQueueSelectionAfterDelete(index);
        updateMemoryQueueUI();
        updateStartButtonState(false);
    }

    async function deleteSelectedMemories() {
        if (AppState.processing?.run?.pending) {
            ErrorHandler.showUserError('请先暂停并等待保存完成');
            return;
        }
        if (AppState.ui.selectedIndices.size === 0) {
            ErrorHandler.showUserError('请先选择要删除的章节');
            return;
        }

        const hasProcessed = [...AppState.ui.selectedIndices].some(
            (index) => AppState.memory.queue[index]?.processed && !AppState.memory.queue[index]?.failed,
        );
        let confirmMsg = `确定要删除选中的 ${AppState.ui.selectedIndices.size} 个章节吗？`;
        if (hasProcessed) {
            confirmMsg += '\n\n⚠️ 警告：选中的章节中包含已处理的章节，删除后相关的世界书数据不会自动更新！';
        }

        if (!(await confirmAction(confirmMsg, { title: '批量删除章节', danger: true }))) {
            return;
        }

        if (AppState.processing?.run?.pending) return;
        const sortedIndices = [...AppState.ui.selectedIndices].sort((a, b) => b - a);
        for (const index of sortedIndices) {
            AppState.memory.queue.splice(index, 1);
        }

        normalizeUntitledMemories();
        AppState.memory.startIndex = Math.min(
            AppState.memory.startIndex,
            Math.max(0, AppState.memory.queue.length - 1),
        );
        if (AppState.memory.userSelectedIndex !== null) {
            AppState.memory.userSelectedIndex = Math.min(
                AppState.memory.userSelectedIndex,
                Math.max(0, AppState.memory.queue.length - 1),
            );
        }

        AppState.ui.selectedIndices.clear();
        AppState.ui.isMultiSelectMode = false;

        updateMemoryQueueUI();
        updateStartButtonState(false);
    }

    return {
        splitMemoryIntoTwo,
        deleteMemoryAt,
        deleteSelectedMemories,
    };
}

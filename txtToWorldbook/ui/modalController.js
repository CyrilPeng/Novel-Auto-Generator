import { stopRun } from '../core/runContext.js';

export function createModalController(deps) {
    const {
        AppState,
        setProcessingStatus,
        getGlobalSemaphore,
        getModalContainer,
        setModalContainer,
        removeEscListener,
        buildModalHtml,
        initializeModalState,
        restoreModalData,
        restoreExistingState,
        onRestoreStateError,
    } = deps;

    async function createModal() {
        const previousContainer = getModalContainer();
        if (previousContainer) previousContainer.remove();

        const modalContainer = document.createElement('div');
        modalContainer.id = 'txt-to-worldbook-modal';
        modalContainer.className = 'ttw-modal-container';
        modalContainer.innerHTML = buildModalHtml();
        document.body.appendChild(modalContainer);
        setModalContainer(modalContainer);

        initializeModalState();
        restoreModalData();
        restoreExistingState().catch(onRestoreStateError);
    }

    function handleEscKey(e) {
        if (e.key !== 'Escape') return;

        // 误触保护：ESC只关闭子模态框（世界书预览、历史记录等），不关闭主UI
        const subModals = document.querySelectorAll('.ttw-modal-container:not(#txt-to-worldbook-modal)');
        if (subModals.length <= 0) return;

        e.stopPropagation();
        e.preventDefault();
        subModals[subModals.length - 1].remove(); // 关闭最顶层的子模态框
        // 主模态框不响应ESC，只能通过右上角关闭按钮退出
    }

    function closeModal() {
        stopRun(AppState.processing);
        setProcessingStatus('stopped');

        const globalSemaphore = getGlobalSemaphore();
        if (globalSemaphore) globalSemaphore.abort();

        AppState.processing.activeTasks.clear();
        AppState.memory.queue.forEach((memory) => {
            if (memory.processing) memory.processing = false;
        });

        const modalContainer = getModalContainer();
        if (modalContainer) {
            modalContainer.remove();
            setModalContainer(null);
        }

        removeEscListener(handleEscKey);
    }

    function open() {
        createModal();
    }

    return {
        createModal,
        handleEscKey,
        closeModal,
        open,
    };
}

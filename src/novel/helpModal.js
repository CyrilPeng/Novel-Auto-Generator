import { getHelpContent } from './helpContent.js';

let cleanupHelp = null;

export function showHelp(topic) {
    const helpData = getHelpContent(topic);

    cleanupHelp?.();
    // 移除已存在的弹窗
    const existingModal = document.getElementById('nag-help-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // 创建弹窗容器
    const modalContainer = document.createElement('div');
    modalContainer.className = 'nag-modal-container';
    modalContainer.id = 'nag-help-modal';
    modalContainer.innerHTML = `
        <div class="nag-modal">
            <div class="nag-modal-header">
                <span class="nag-modal-title">${helpData.title}</span>
                <button class="nag-modal-close" type="button">✕</button>
            </div>
            <div class="nag-modal-body">${helpData.content}</div>
        </div>
    `;

    // 关闭弹窗函数
    const closeModal = (e) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        modalContainer.remove();
        document.removeEventListener('keydown', escHandler, true);
    };

    // ESC 关闭 - 使用捕获阶段，优先处理
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            closeModal();
        }
    };
    cleanupHelp = () => closeModal();
    document.addEventListener('keydown', escHandler, true);

    // 关闭按钮点击
    modalContainer.querySelector('.nag-modal-close').addEventListener(
        'click',
        (e) => {
            closeModal(e);
        },
        false,
    );

    // 阻止弹窗内部点击冒泡
    modalContainer.querySelector('.nag-modal').addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
        },
        false,
    );

    modalContainer.querySelector('.nag-modal').addEventListener(
        'mousedown',
        (e) => {
            e.stopPropagation();
        },
        false,
    );

    modalContainer.querySelector('.nag-modal').addEventListener(
        'touchstart',
        (e) => {
            e.stopPropagation();
        },
        { passive: true },
    );

    // 点击容器背景关闭
    modalContainer.addEventListener(
        'click',
        (e) => {
            if (e.target === modalContainer) {
                closeModal(e);
            }
        },
        false,
    );

    modalContainer.addEventListener(
        'mousedown',
        (e) => {
            if (e.target === modalContainer) {
                e.stopPropagation();
            }
        },
        false,
    );

    modalContainer.addEventListener(
        'touchstart',
        (e) => {
            e.stopPropagation();
        },
        { passive: true },
    );

    // 添加到 body 最后，确保在最顶层
    document.body.appendChild(modalContainer);

    // 强制重新计算位置（修复某些浏览器的渲染问题）
    requestAnimationFrame(() => {
        modalContainer.style.opacity = '1';
    });
}

export function disposeHelp() {
    cleanupHelp?.();
    cleanupHelp = null;
}

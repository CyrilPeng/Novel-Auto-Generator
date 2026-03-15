const ModalFactory = {
    _escape(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _formatPlainText(text) {
        return this._escape(text).replace(/\n/g, '<br>');
    },

    // 创建模态框
    create(config) {
        const {
            id,
            title,
            body = '',
            footer = '',
            bodyNode = null,
            footerNode = null,
            width = '600px',
            maxWidth = '90vw',
            maxHeight = '80vh',
            onClose = null,
            closeOnOverlay = true,
            closeOnEscape = true
        } = config;

        const container = document.createElement('div');
        container.id = id || `ttw-modal-${Date.now()}`;
        container.className = 'ttw-modal-container';

        const modal = document.createElement('div');
        modal.className = 'ttw-modal';
        modal.style.width = width;
        modal.style.maxWidth = maxWidth;

        const header = document.createElement('div');
        header.className = 'ttw-modal-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'ttw-modal-title';
        titleEl.textContent = String(title || '');

        const closeBtnEl = document.createElement('button');
        closeBtnEl.className = 'ttw-modal-close';
        closeBtnEl.type = 'button';
        closeBtnEl.textContent = '✕';

        header.appendChild(titleEl);
        header.appendChild(closeBtnEl);
        modal.appendChild(header);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'ttw-modal-body';
        bodyEl.style.maxHeight = maxHeight;
        bodyEl.style.overflowY = 'auto';
        const resolvedBodyNode = bodyNode || ((typeof Node !== 'undefined' && body instanceof Node) ? body : null);
        if (resolvedBodyNode) {
            bodyEl.appendChild(resolvedBodyNode);
        } else {
            bodyEl.innerHTML = body;
        }
        modal.appendChild(bodyEl);

        const resolvedFooterNode = footerNode || ((typeof Node !== 'undefined' && footer instanceof Node) ? footer : null);
        if (footer || resolvedFooterNode) {
            const footerEl = document.createElement('div');
            footerEl.className = 'ttw-modal-footer';
            if (resolvedFooterNode) {
                footerEl.appendChild(resolvedFooterNode);
            } else {
                footerEl.innerHTML = footer;
            }
            modal.appendChild(footerEl);
        }

        container.appendChild(modal);
        document.body.appendChild(container);

        let escapeHandler;
        const cleanupCallbacks = [];
        const registerCleanup = (fn) => {
            if (typeof fn === 'function') cleanupCallbacks.push(fn);
        };
        const doClose = () => {
            this.close(container, onClose);
        };

        if (closeBtnEl) {
            closeBtnEl.addEventListener('click', doClose);
        }

        if (closeOnOverlay) {
            const overlayHandler = (e) => {
                if (e.target === container) {
                    doClose();
                }
            };
            container.addEventListener('click', overlayHandler);
            registerCleanup(() => container.removeEventListener('click', overlayHandler));
        }

        // 阻止事件冒泡到 SillyTavern 外层（如扩展栏折叠监听）
        const stopPropagationEvents = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
        const stopPropagationHandler = (e) => e.stopPropagation();
        stopPropagationEvents.forEach((eventName) => {
            container.addEventListener(eventName, stopPropagationHandler);
            registerCleanup(() => container.removeEventListener(eventName, stopPropagationHandler));
        });

        if (closeOnEscape) {
            escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    doClose();
                }
            };
            document.addEventListener('keydown', escapeHandler);
            registerCleanup(() => document.removeEventListener('keydown', escapeHandler));
        }

        container.__ttwModalCleanup = cleanupCallbacks;
        container.__ttwModalOnClose = onClose;
        container.__ttwModalClosed = false;
        return container;
    },

    close(container, onClose) {
        if (!container || container.__ttwModalClosed) return;
        container.__ttwModalClosed = true;

        const cleanupCallbacks = Array.isArray(container.__ttwModalCleanup) ? container.__ttwModalCleanup : [];
        while (cleanupCallbacks.length) {
            const cleanup = cleanupCallbacks.pop();
            try {
                cleanup();
            } catch (error) {
                console.warn('Modal cleanup failed:', error);
            }
        }

        const resolvedOnClose = onClose || container.__ttwModalOnClose;
        if (typeof resolvedOnClose === 'function') {
            resolvedOnClose();
        }
        container.remove();
    },

    alert(config) {
        return new Promise((resolve) => {
            const {
                title = '提示',
                message = '',
                confirmText = '知道了'
            } = typeof config === 'string' ? { message: config } : config;

            let settled = false;
            const modal = this.create({
                title,
                body: `<div style="padding:20px;line-height:1.7;">${this._formatPlainText(message)}</div>`,
                footer: `<button class="ttw-btn ttw-btn-primary" data-action="confirm">${this._escape(confirmText)}</button>`,
                width: '420px',
                onClose: () => {
                    if (settled) return;
                    settled = true;
                    resolve();
                }
            });

            modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                if (settled) return;
                settled = true;
                this.close(modal);
                resolve();
            });
        });
    },

    confirm(config) {
        return new Promise((resolve) => {
            const {
                title = '确认',
                message = '',
                confirmText = '确定',
                cancelText = '取消',
                danger = false
            } = config;

            let settled = false;
            const footer = `
                <button class="ttw-btn" data-action="cancel">${this._escape(cancelText)}</button>
                <button class="ttw-btn ${danger ? 'ttw-btn-danger' : 'ttw-btn-primary'}" data-action="confirm">${this._escape(confirmText)}</button>
            `;

            const modal = this.create({
                title,
                body: `<div style="padding:20px;line-height:1.7;">${this._formatPlainText(message)}</div>`,
                footer,
                width: '420px',
                onClose: () => {
                    if (settled) return;
                    settled = true;
                    resolve(false);
                }
            });

            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                if (settled) return;
                settled = true;
                this.close(modal);
                resolve(false);
            });

            modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                if (settled) return;
                settled = true;
                this.close(modal);
                resolve(true);
            });
        });
    },

    prompt(config) {
        return new Promise((resolve) => {
            const {
                title = '输入',
                message = '',
                defaultValue = '',
                placeholder = '',
                confirmText = '确定',
                cancelText = '取消',
                multiline = false,
                rows = 3,
                trimResult = true
            } = typeof config === 'string' ? { message: config } : config;

            const inputHtml = multiline
                ? `<textarea data-role="prompt-input" rows="${rows}" placeholder="${this._escape(placeholder)}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:13px;resize:vertical;">${this._escape(defaultValue)}</textarea>`
                : `<input data-role="prompt-input" type="text" value="${this._escape(defaultValue)}" placeholder="${this._escape(placeholder)}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:13px;">`;

            let settled = false;
            const modal = this.create({
                title,
                body: `
                    <div style="padding:20px;line-height:1.7;display:flex;flex-direction:column;gap:12px;">
                        ${message ? `<div>${this._formatPlainText(message)}</div>` : ''}
                        ${inputHtml}
                    </div>
                `,
                footer: `
                    <button class="ttw-btn" data-action="cancel">${this._escape(cancelText)}</button>
                    <button class="ttw-btn ttw-btn-primary" data-action="confirm">${this._escape(confirmText)}</button>
                `,
                width: '460px',
                onClose: () => {
                    if (settled) return;
                    settled = true;
                    resolve(null);
                }
            });

            const input = modal.querySelector('[data-role="prompt-input"]');
            setTimeout(() => {
                if (!input) return;
                input.focus();
                if (typeof input.select === 'function') input.select();
            }, 0);

            const finish = (value) => {
                if (settled) return;
                settled = true;
                this.close(modal);
                resolve(value);
            };

            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
            modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                let value = input ? input.value : '';
                if (trimResult) value = value.trim();
                finish(value);
            });

            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !multiline) {
                        e.preventDefault();
                        modal.querySelector('[data-action="confirm"]').click();
                    }
                });
            }
        });
    },

    listSelect(config) {
        return new Promise((resolve) => {
            const {
                title = '选择',
                items = [],
                multiSelect = false,
                selectedIndices = []
            } = config;

            const listHtml = items.map((item, i) => `
                <label class="ttw-list-item" style="display:block;padding:8px;border-bottom:1px solid #eee;cursor:pointer;">
                    <input type="${multiSelect ? 'checkbox' : 'radio'}" name="ttw-list-select" 
                           value="${i}" ${selectedIndices.includes(i) ? 'checked' : ''}>
                    <span>${typeof item === 'object' ? item.label || item.name : item}</span>
                </label>
            `).join('');

            const footer = `
                <button class="ttw-btn ttw-btn-small" data-action="select-all">全选</button>
                <button class="ttw-btn ttw-btn-small" data-action="deselect-all">取消全选</button>
                <button class="ttw-btn" data-action="cancel">取消</button>
                <button class="ttw-btn ttw-btn-primary" data-action="confirm">确定</button>
            `;

            let settled = false;
            const modal = this.create({
                title,
                body: `<div class="ttw-list-container" style="max-height:400px;overflow-y:auto;">${listHtml}</div>`,
                footer,
                width: '500px',
                onClose: () => {
                    if (settled) return;
                    settled = true;
                    resolve(null);
                }
            });

            modal.querySelector('[data-action="select-all"]').addEventListener('click', () => {
                modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
            });

            modal.querySelector('[data-action="deselect-all"]').addEventListener('click', () => {
                modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            });

            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                if (settled) return;
                settled = true;
                this.close(modal);
                resolve(null);
            });

            modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                const selected = Array.from(modal.querySelectorAll('input:checked')).map(cb => parseInt(cb.value));
                if (settled) return;
                settled = true;
                this.close(modal);
                resolve(multiSelect ? selected : selected[0]);
            });
        });
    }
};

export { ModalFactory };

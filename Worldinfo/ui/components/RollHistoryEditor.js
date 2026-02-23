/**
 * Roll 历史编辑器组件
 * 支持 JSON 编辑和粘贴导入功能
 */
import { Modal } from './Modal.js';
import { showSuccess, showError } from './Toast.js';

export class RollHistoryEditor {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.onSave = options.onSave || (() => {});
        this.modal = null;
        this.currentRoll = null;
        this.readonly = options.readonly || false;
    }

    /**
     * 打开编辑器
     * @param {Object} roll - Roll 历史记录
     */
    open(roll, readonly = false) {
        this.currentRoll = roll;
        this.readonly = readonly;
        this.createModal();
        this.modal.open(this.createContent());
        this.bindEvents();
    }

    /**
     * 关闭编辑器
     */
    close() {
        if (this.modal) {
            this.modal.close();
            this.modal.destroy();
            this.modal = null;
        }
        this.onClose();
    }

    /**
     * 创建内容 HTML
     */
    createContent() {
        const roll = this.currentRoll;
        if (!roll) return '<div>无数据</div>';

        const resultJson = JSON.stringify(roll.result || {}, null, 2);
        const timestamp = new Date(roll.timestamp).toLocaleString('zh-CN');

        return `
            <div class="ww-roll-editor-content">
                <!-- 信息栏 -->
                <div style="
                    padding:12px;
                    background:rgba(155,89,182,0.15);
                    border-radius:8px;
                    margin-bottom:16px;
                ">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <div>
                            <span style="color:#9b59b6;font-weight:bold;">📝 ${roll.category || '未知分类'}</span>
                            <span style="margin-left:12px;color:#888;">${roll.entryName || '未知条目'}</span>
                        </div>
                        <div style="color:#888;font-size:12px;">${timestamp}</div>
                    </div>
                    ${roll.customPrompt ? `
                        <div style="font-size:11px;color:#888;">
                            <span style="color:#9b59b6;">📋 提示词:</span> ${roll.customPrompt.substring(0, 100)}${roll.customPrompt.length > 100 ? '...' : ''}
                        </div>
                    ` : ''}
                </div>

                <!-- JSON 编辑器 -->
                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="font-size:13px;font-weight:bold;color:#fff;">📄 JSON 内容</label>
                        <div style="display:flex;gap:8px;">
                            <button id="ww-roll-format-json" style="
                                padding:6px 10px;
                                background:rgba(52,152,219,0.3);
                                border:1px solid #3498db;
                                border-radius:4px;
                                color:#fff;
                                font-size:11px;
                                cursor:pointer;
                            ">格式化</button>
                            <button id="ww-roll-copy-json" style="
                                padding:6px 10px;
                                background:rgba(52,152,219,0.3);
                                border:1px solid #3498db;
                                border-radius:4px;
                                color:#fff;
                                font-size:11px;
                                cursor:pointer;
                            ">复制</button>
                            <button id="ww-roll-paste-json" style="
                                padding:6px 10px;
                                background:rgba(39,174,96,0.3);
                                border:1px solid #27ae60;
                                border-radius:4px;
                                color:#fff;
                                font-size:11px;
                                cursor:pointer;
                            ">粘贴</button>
                        </div>
                    </div>
                    <textarea id="ww-roll-json-editor" ${this.readonly ? 'readonly' : ''} style="
                        width:100%;
                        min-height:300px;
                        padding:12px;
                        background:rgba(0,0,0,0.3);
                        border:1px solid #444;
                        border-radius:6px;
                        color:#fff;
                        font-family:'Consolas','Monaco',monospace;
                        font-size:12px;
                        resize:vertical;
                        white-space:pre;
                        overflow-x:auto;
                    ">${resultJson}</textarea>
                    ${this.readonly ? '<small style="color:#888;display:block;margin-top:6px;">只读模式</small>' : ''}
                </div>

                <!-- 验证结果 -->
                <div id="ww-roll-validation" style="
                    display:none;
                    padding:10px;
                    border-radius:6px;
                    margin-bottom:16px;
                    font-size:12px;
                "></div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        const buttons = [];

        if (!this.readonly) {
            buttons.push(
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '💾 保存', type: 'primary', action: 'save' }
            );
        } else {
            buttons.push({ text: '关闭', type: 'secondary', action: 'close' });
        }

        this.modal = new Modal({
            title: this.readonly ? '📜 查看 Roll 历史' : '📝 编辑 Roll 历史',
            width: '800px',
            maxWidth: '95%',
            closable: true,
            maskClosable: !this.readonly,
            buttons,
            onButtonClick: (action, event, modalInstance) => {
                if (action === 'cancel' || action === 'close') {
                    this.close();
                } else if (action === 'save') {
                    this.save();
                }
            },
            onClose: () => this.onClose()
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.modal?.element) return;

        const el = this.modal.element;

        // 格式化 JSON
        el.querySelector('#ww-roll-format-json')?.addEventListener('click', () => {
            this.formatJson();
        });

        // 复制 JSON
        el.querySelector('#ww-roll-copy-json')?.addEventListener('click', () => {
            this.copyJson();
        });

        // 粘贴 JSON
        el.querySelector('#ww-roll-paste-json')?.addEventListener('click', () => {
            this.pasteJson();
        });

        // 实时验证
        const editor = el.querySelector('#ww-roll-json-editor');
        if (editor) {
            editor.addEventListener('input', () => {
                this.validateJson();
            });
        }
    }

    /**
     * 格式化 JSON
     */
    formatJson() {
        const editor = this.modal?.element?.querySelector('#ww-roll-json-editor');
        if (!editor) return;

        try {
            const json = JSON.parse(editor.value);
            editor.value = JSON.stringify(json, null, 2);
            this.showValidation('✅ JSON 格式正确', 'success');
        } catch (error) {
            this.showValidation(`❌ JSON 格式错误：${error.message}`, 'error');
        }
    }

    /**
     * 复制 JSON
     */
    async copyJson() {
        const editor = this.modal?.element?.querySelector('#ww-roll-json-editor');
        if (!editor) return;

        try {
            await navigator.clipboard.writeText(editor.value);
            showSuccess('已复制到剪贴板');
        } catch (error) {
            showError('复制失败：' + error.message);
        }
    }

    /**
     * 粘贴 JSON
     */
    async pasteJson() {
        const editor = this.modal?.element?.querySelector('#ww-roll-json-editor');
        if (!editor) return;

        try {
            const text = await navigator.clipboard.readText();
            // 验证是否为有效 JSON
            JSON.parse(text);
            editor.value = text;
            this.showValidation('✅ 粘贴成功', 'success');
        } catch (error) {
            this.showValidation(`❌ 粘贴失败：不是有效的 JSON - ${error.message}`, 'error');
        }
    }

    /**
     * 验证 JSON
     */
    validateJson() {
        const editor = this.modal?.element?.querySelector('#ww-roll-json-editor');
        if (!editor) return;

        try {
            JSON.parse(editor.value);
            this.showValidation('✅ JSON 格式正确', 'success');
            return true;
        } catch (error) {
            this.showValidation(`❌ ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 显示验证结果
     */
    showValidation(message, type = 'info') {
        const el = this.modal?.element?.querySelector('#ww-roll-validation');
        if (!el) return;

        const colors = {
            success: { bg: 'rgba(39,174,96,0.15)', text: '#27ae60' },
            error: { bg: 'rgba(231,76,60,0.15)', text: '#e74c3c' },
            info: { bg: 'rgba(52,152,219,0.15)', text: '#3498db' }
        };

        el.style.display = 'block';
        el.style.background = colors[type]?.bg || colors.info.bg;
        el.style.color = colors[type]?.text || colors.info.text;
        el.textContent = message;
    }

    /**
     * 保存
     */
    save() {
        const editor = this.modal?.element?.querySelector('#ww-roll-json-editor');
        if (!editor) return;

        try {
            const json = JSON.parse(editor.value);
            this.onSave(json, this.currentRoll);
            this.close();
        } catch (error) {
            this.showValidation(`❌ 无法保存：${error.message}`, 'error');
        }
    }
}

import { abortableDelay } from '../../txtToWorldbook/core/requestPolicy.js';

export function getSillyTavernContext() {
    return globalThis.SillyTavern?.getContext?.() ?? globalThis.getContext?.() ?? null;
}

/** All host reads are live, so a chat switch is checked immediately before dispatch. */
export function createSillyTavernHost({
    getContext = getSillyTavernContext,
    getLegacyChat = () => globalThis.chat,
    getDocument = () => globalThis.document,
    getStyle = (element) => globalThis.getComputedStyle(element),
    jquery = (...args) => globalThis.jQuery(...args),
    extensionSettings = {},
    saveSettings = () => {},
} = {}) {
    function getChat() {
        try {
            const chat = getContext()?.chat;
            if (Array.isArray(chat)) return chat;
        } catch {}
        const legacy = getLegacyChat();
        return Array.isArray(legacy) ? legacy : null;
    }
    function snapshot() {
        const context = getContext();
        const chat = getChat();
        const chatId = context?.chatId ?? context?.getCurrentChatId?.();
        const identity = chatId != null ? String(context?.groupId ?? context?.characterId ?? '') + ':' + chatId : chat;
        const document = getDocument();
        const stop = document.querySelector('#mes_stop');
        return {
            identity,
            messages: (chat || []).filter(Boolean).map((message) => ({
                isUser: Boolean(message.is_user || message.is_human),
                isSystem: Boolean(message.is_system),
                text: String(message.mes || ''),
            })),
            generating: stop ? getStyle(stop).display !== 'none' : null,
            toast: Boolean(document.querySelector('#toast-container .toast')),
        };
    }
    async function send(text, { signal, assertCurrent }) {
        assertCurrent();
        const input = jquery('#send_textarea'),
            button = jquery('#send_but');
        if (!input.length || !button.length || button.prop('disabled'))
            throw Object.assign(new Error('发送控件尚未就绪，请稍后重试'), { dispatched: false });
        input.val(text);
        input[0].value = text;
        input.trigger('input').trigger('change');
        await abortableDelay(100, signal);
        assertCurrent();
        if (button.prop('disabled')) throw Object.assign(new Error('发送控件已禁用'), { dispatched: false });
        button.trigger('click');
    }
    return {
        getChat,
        snapshot,
        send,
        readSettings(name) {
            return extensionSettings[name] || {};
        },
        writeSettings(name, value) {
            extensionSettings[name] ??= {};
            Object.assign(extensionSettings[name], value);
            saveSettings();
        },
    };
}

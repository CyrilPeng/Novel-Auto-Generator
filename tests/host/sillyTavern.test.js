import { afterEach, expect, it, vi } from 'vitest';
import { createSillyTavernHost } from '../../src/host/sillyTavern.js';

afterEach(() => vi.useRealTimers());
function setup() {
    const context = { chatId: 'a', characterId: 1, chat: [{ is_user: false, mes: '正文' }] };
    const button = { length: 1, prop: vi.fn(() => false), trigger: vi.fn() };
    const input = { 0: { value: '' }, length: 1, val: vi.fn(), trigger: vi.fn() };
    input.trigger.mockReturnValue(input);
    const settings = {},
        save = vi.fn();
    const host = createSillyTavernHost({
        getContext: () => context,
        getDocument: () => ({ querySelector: () => null }),
        jquery: (selector) => (selector === '#send_but' ? button : input),
        extensionSettings: settings,
        saveSettings: save,
    });
    return { host, context, button, input, settings, save };
}

it('reads live identity and retains raw system message identity', () => {
    const { host, context } = setup();
    expect(host.snapshot().identity).toBe('1:a');
    context.chatId = 'b';
    context.chat.push({ is_system: true, mes: '系统' });
    expect(host.snapshot().identity).toBe('1:b');
    expect(host.snapshot().messages[1].isSystem).toBe(true);
});

it('checks the chat identity immediately before clicking send', async () => {
    vi.useFakeTimers();
    const { host, context, button } = setup();
    const identity = host.snapshot().identity;
    const task = host
        .send('继续', {
            assertCurrent: () => {
                if (host.snapshot().identity !== identity) throw new Error('switched');
            },
        })
        .catch((e) => e);
    context.chatId = 'b';
    await vi.runAllTimersAsync();
    expect((await task).message).toBe('switched');
    expect(button.trigger).not.toHaveBeenCalled();
});

it('cancels before dispatch and preserves settings container identity', async () => {
    vi.useFakeTimers();
    const { host, button, settings, save } = setup();
    host.writeSettings('plugin', { a: 1 });
    const original = settings.plugin;
    host.writeSettings('plugin', { b: 2 });
    expect(settings.plugin).toBe(original);
    expect(host.readSettings('plugin')).toEqual({ a: 1, b: 2 });
    expect(save).toHaveBeenCalledTimes(2);
    const controller = new AbortController();
    const task = host.send('继续', { signal: controller.signal, assertCurrent: () => {} }).catch((e) => e);
    controller.abort();
    expect((await task).code).toBe('ABORTED');
    expect(button.trigger).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
});

it('reports unavailable controls as definitely not dispatched', async () => {
    const { host, button } = setup();
    button.length = 0;
    await expect(host.send('继续', { assertCurrent: () => {} })).rejects.toMatchObject({ dispatched: false });
});

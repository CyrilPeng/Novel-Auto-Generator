import { afterEach, expect, it, vi } from 'vitest';
import { createNovelRecoveryStore } from '../../src/novel/recoveryStore.js';
import { createNovelRunner } from '../../src/novel/generation.js';

afterEach(() => vi.useRealTimers());
function setup(recovery) {
    const state = { identity: 'chat-a', messages: [], generating: false, toast: false };
    const settings = {
        currentChapter: 0,
        totalChapters: 1,
        prompt: '继续',
        minChapterLength: 2,
        stabilityCheckInterval: 10,
        stabilityRequiredCount: 1,
        replyTimeoutMs: 100,
        replyStartTimeoutMs: 40,
        replyWaitTime: 0,
    };
    const send = vi.fn(async (text) => {
        state.messages.push({ isUser: true, text });
    });
    const notify = vi.fn();
    const exportNovel = vi.fn();
    const runner = createNovelRunner({
        recovery,
        getSettings: () => settings,
        snapshot: () => state,
        send,
        notify,
        exportNovel,
        onStats: vi.fn(),
        onChange: vi.fn(),
    });
    return { state, settings, send, notify, exportNovel, runner };
}

it('advances only after a complete stable reply', async () => {
    vi.useFakeTimers();
    const { state, settings, runner, exportNovel } = setup();
    const task = runner.start();
    state.messages.push({ isUser: false, text: '完整正文' });
    await vi.runAllTimersAsync();
    await task;
    expect(settings.currentChapter).toBe(1);
    expect(exportNovel).toHaveBeenCalledWith(false);
});

it('bounds empty and continuously generating replies without resending', async () => {
    vi.useFakeTimers();
    const { state, settings, runner, send, notify } = setup();
    const task = runner.start();
    state.generating = true;
    state.messages.push({ isUser: false, text: '' });
    await vi.runAllTimersAsync();
    await task;
    expect(settings.currentChapter).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('超时'));
});

it('waits for the original uncertain reply on restart instead of dispatching again', async () => {
    vi.useFakeTimers();
    const { runner, send, state, settings } = setup();
    const first = runner.start();
    await vi.runAllTimersAsync();
    await first;
    const second = runner.start();
    state.messages.push({ isUser: false, text: '迟来的正文' });
    await vi.runAllTimersAsync();
    await second;
    expect(send).toHaveBeenCalledTimes(1);
    expect(settings.currentChapter).toBe(1);
});

it('stopping and immediately restarting cannot let the old finally clear new state', async () => {
    vi.useFakeTimers();
    const { runner, send, state, settings } = setup();
    const old = runner.start();
    runner.stop();
    const current = runner.start();
    await old;
    expect(settings.isRunning).toBe(true);
    state.messages.push({ isUser: false, text: '新回复' });
    await vi.runAllTimersAsync();
    await current;
    expect(send).toHaveBeenCalledTimes(1);
    expect(settings.currentChapter).toBe(1);
});

it('stops on chat switching and never sends to the new chat', async () => {
    vi.useFakeTimers();
    const { runner, send, state, settings, notify } = setup();
    const task = runner.start();
    state.identity = 'chat-b';
    await vi.runAllTimersAsync();
    await task;
    await runner.start();
    expect(send).toHaveBeenCalledTimes(1);
    expect(settings.currentChapter).toBe(0);
    expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('原聊天'));
});

it('does not count short replies as successful chapters', async () => {
    vi.useFakeTimers();
    const { runner, state, settings, exportNovel } = setup();
    const task = runner.start();
    state.messages.push({ isUser: false, text: '短' });
    await vi.runAllTimersAsync();
    await task;
    expect(settings.currentChapter).toBe(0);
    expect(exportNovel).not.toHaveBeenCalled();
});

it('rejects a manual message arriving during the final toast wait', async () => {
    vi.useFakeTimers();
    const { runner, state, settings, exportNovel } = setup();
    settings.enableReplyToastDetection = true;
    settings.replyPostToastWaitTime = 30;
    const task = runner.start();
    state.messages.push({ isUser: false, text: '完整正文' });
    await vi.advanceTimersByTimeAsync(15);
    state.messages.push({ isUser: true, text: '手动消息' });
    await vi.runAllTimersAsync();
    await task;
    expect(settings.currentChapter).toBe(0);
    expect(exportNovel).not.toHaveBeenCalled();
});

it('bounds post-toast waiting by the full reply deadline', async () => {
    vi.useFakeTimers();
    const { runner, state, settings } = setup();
    settings.enableReplyToastDetection = true;
    settings.replyPostToastWaitTime = 1000;
    const start = Date.now();
    const task = runner.start();
    state.messages.push({ isUser: false, text: '完整正文' });
    await vi.runAllTimersAsync();
    await task;
    expect(Date.now() - start).toBe(100);
    expect(settings.currentChapter).toBe(0);
});

function journal() {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
    return { storage, recovery: createNovelRecoveryStore(() => storage) };
}

it('restores uncertainty in a new runner without sending the same prompt again', async () => {
    vi.useFakeTimers();
    const { recovery } = journal();
    const original = setup(recovery);
    const first = original.runner.start();
    await vi.runAllTimersAsync();
    await first;
    expect(recovery.read().pending.floor).toBe(0);
    const reloaded = setup(recovery);
    reloaded.state.messages.push(...original.state.messages, { isUser: false, text: '迟来的正文' });
    const second = reloaded.runner.start();
    await vi.runAllTimersAsync();
    await second;
    expect(reloaded.send).not.toHaveBeenCalled();
    expect(reloaded.settings.currentChapter).toBe(1);
    expect(recovery.read()).toMatchObject({ chapter: 1, pending: null });
    const again = setup(recovery);
    await again.runner.start();
    expect(again.send).not.toHaveBeenCalled();
    expect(again.settings.currentChapter).toBe(1);
});

it('does not send when recording uncertainty fails', async () => {
    const { storage, recovery } = journal();
    storage.setItem = () => {
        throw new Error('Quota exceeded');
    };
    const { runner, send, notify } = setup(recovery);
    await runner.start();
    expect(send).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('warning', 'Quota exceeded');
});

it('requires the original chat after a reload and lets an explicit reset clear the journal', async () => {
    const { recovery } = journal();
    recovery.write({ identity: 'chat-b', chapter: 0, pending: { identity: 'chat-b', floor: 2, prompt: 'private' } });
    expect(JSON.stringify(recovery.read())).not.toContain('private');
    const { runner, send, notify } = setup(recovery);
    await runner.start();
    expect(send).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('原聊天'));
    runner.resetPending();
    expect(recovery.read()).toBeNull();
});

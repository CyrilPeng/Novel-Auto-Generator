import { afterEach, expect, it, vi } from 'vitest';
import { createNovelRunner } from '../../src/novel/generation.js';

afterEach(() => vi.useRealTimers());
function setup() {
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

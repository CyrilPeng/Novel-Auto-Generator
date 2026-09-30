import { AbortedError, UserError } from '../../txtToWorldbook/core/errors.js';
import { abortableDelay, throwIfAborted } from '../../txtToWorldbook/core/requestPolicy.js';

/** Host-independent continuation runner. Sending a chat message is not idempotent. */
export function createNovelRunner(deps) {
    const { getSettings, snapshot, send, onChange, notify, exportNovel, onStats } = deps;
    let active = null;
    let pending = null;
    let nextId = 0;

    function assertRun(run) {
        throwIfAborted(run.controller.signal);
        if (active !== run) throw new AbortedError();
        if (snapshot().identity !== run.identity) throw new UserError('聊天已切换，续写已停止；请回到原聊天后继续');
    }

    async function wait(run, ms) {
        assertRun(run);
        await abortableDelay(ms, run.controller.signal);
        assertRun(run);
    }

    async function waitForReply(run, attempt) {
        const config = run.config;
        const deadline = Date.now() + (config.replyTimeoutMs || 600000);
        const startDeadline = Date.now() + (config.replyStartTimeoutMs || 120000);
        const interval = Math.max(10, config.stabilityCheckInterval || 1000);
        let lastText = null;
        let stable = 0;
        let readyAt = null;
        while (Date.now() < deadline) {
            assertRun(run);
            const state = snapshot();
            if (state.messages.length < attempt.floor) throw new UserError('聊天内容已被删除或重置，请检查后再继续');
            const tail = state.messages.slice(attempt.floor);
            if (tail.filter((message) => message.isUser).length > 1)
                throw new UserError('检测到其他用户消息，已停止自动续写');
            const reply = tail.find((message) => !message.isUser);
            if (!reply && Date.now() >= startDeadline)
                throw new UserError('等待 AI 开始回复超时；再次开始将继续等待，不会重复发送');
            const text = reply?.text || '';
            if (text && text === lastText && state.generating !== true) stable++;
            else {
                stable = 0;
                readyAt = null;
            }
            lastText = text;
            if (stable >= (config.stabilityRequiredCount || 3)) {
                readyAt ??= Date.now();
                const postWait = Math.max(0, config.replyWaitTime || 0);
                const toastWait =
                    config.enableReplyToastDetection &&
                    state.toast &&
                    Date.now() - readyAt < (config.replyToastWaitTimeout || 300000);
                if (!toastWait && Date.now() - readyAt >= postWait) {
                    await wait(
                        run,
                        Math.min(
                            Math.max(0, deadline - Date.now()),
                            config.enableReplyToastDetection ? Math.max(0, config.replyPostToastWaitTime || 0) : 0,
                        ),
                    );
                    if (Date.now() >= deadline) break;
                    const final = snapshot();
                    if (final.messages.slice(attempt.floor).filter((message) => message.isUser).length > 1)
                        throw new UserError('检测到其他用户消息，已停止自动续写');
                    const current = final.messages.slice(attempt.floor).find((message) => !message.isUser);
                    if (current?.text === text && final.generating !== true) return text.length;
                    stable = 0;
                    readyAt = null;
                }
            }
            await wait(run, Math.min(interval, Math.max(1, deadline - Date.now())));
        }
        throw new UserError('等待 AI 完整回复超时；请检查酒馆生成状态后继续');
    }

    async function start() {
        if (active) {
            notify('warning', '任务仍在运行');
            return;
        }
        const settings = getSettings();
        const initial = snapshot();
        if (initial.identity == null) {
            notify('warning', '请先打开一个聊天');
            return;
        }
        if (pending && pending.identity !== initial.identity) {
            notify('warning', '原聊天还有待确认的回复，请回到原聊天或检查后重置进度');
            return;
        }
        const run = {
            id: ++nextId,
            identity: initial.identity,
            config: { ...settings },
            controller: new AbortController(),
            paused: false,
        };
        active = run;
        settings.isRunning = true;
        settings.isPaused = false;
        const stats = { startTime: Date.now(), chaptersGenerated: 0, totalCharacters: 0, errors: [] };
        onStats(stats);
        onChange();
        try {
            for (let chapter = settings.currentChapter; chapter < run.config.totalChapters; chapter++) {
                while (run.paused) await wait(run, 100);
                assertRun(run);
                if (!pending) {
                    const before = snapshot();
                    if (before.generating === true) throw new UserError('酒馆仍在生成，请等待完成后再开始');
                    pending = { identity: run.identity, floor: before.messages.length, prompt: run.config.prompt };
                    // Record uncertainty before sending: a thrown error may occur after dispatch.
                    for (let retry = 0; ; retry++) {
                        try {
                            await send(run.config.prompt, {
                                signal: run.controller.signal,
                                assertCurrent: () => assertRun(run),
                            });
                            break;
                        } catch (error) {
                            assertRun(run);
                            if (error.dispatched !== false) throw error;
                            if (retry + 1 >= Math.max(1, run.config.maxRetries || 3)) {
                                pending = null;
                                throw error;
                            }
                            await wait(run, 1000);
                        }
                    }
                    assertRun(run);
                    if (run.config.enableSendToastDetection) {
                        await wait(run, 500);
                        const deadline = Date.now() + (run.config.sendToastWaitTimeout || 60000);
                        while (snapshot().toast && Date.now() < deadline) await wait(run, 100);
                        await wait(run, Math.max(0, run.config.sendPostToastWaitTime || 0));
                    }
                }
                const length = await waitForReply(run, pending);
                assertRun(run);
                pending = null;
                if (length < run.config.minChapterLength)
                    throw new UserError(`响应过短 (${length} 字)，本章未计为成功，请检查后重新开始`);
                settings.currentChapter = chapter + 1;
                stats.chaptersGenerated++;
                stats.totalCharacters += length;
                onChange();
                if (run.config.autoSaveInterval > 0 && settings.currentChapter % run.config.autoSaveInterval === 0) {
                    await exportNovel(true);
                    assertRun(run);
                }
            }
            notify('success', '生成完成');
            await exportNovel(false);
        } catch (error) {
            if (active === run && !run.controller.signal.aborted) {
                stats.errors.push({ chapter: settings.currentChapter + 1, error: error.message });
                notify('warning', error.message);
            }
        } finally {
            if (active === run) {
                active = null;
                settings.isRunning = false;
                settings.isPaused = false;
                onChange();
            }
        }
    }

    return {
        start,
        pause() {
            if (active) {
                active.paused = true;
                getSettings().isPaused = true;
                onChange();
            }
        },
        resume() {
            if (active) {
                active.paused = false;
                getSettings().isPaused = false;
                onChange();
            }
        },
        stop() {
            const run = active;
            active = null;
            run?.controller.abort();
            getSettings().isRunning = false;
            getSettings().isPaused = false;
            onChange();
        },
        resetPending() {
            if (!active) pending = null;
        },
    };
}

import { runConfiguration } from '../../txtToWorldbook/core/runContext.js';
import { ensureChunkIdentities, newIdentity } from '../../txtToWorldbook/core/chunkIdentity.js';
import { UserError } from '../../txtToWorldbook/core/errors.js';

function validateTree(value) {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new UserError('任务包含不安全的字段');
        validateTree(value[key]);
    }
}

export function withoutCredentials(settings = {}) {
    const copy = structuredClone(settings);
    for (const key of Object.keys(copy))
        if (/api.?key|password|secret|authorization|access.?token/i.test(key)) delete copy[key];
    if (copy.customApiEndpoint) {
        try {
            const url = new URL(copy.customApiEndpoint);
            url.username = '';
            url.password = '';
            for (const key of [...url.searchParams.keys()])
                if (/^(key|api_key|apikey|token|access_token|secret)$/i.test(key)) url.searchParams.delete(key);
            copy.customApiEndpoint = url.toString();
        } catch {
            /* A partial endpoint is preserved for editing. */
        }
    }
    return copy;
}

export function captureTaskState(state, processedIndex) {
    ensureChunkIdentities(state.memory.queue);
    if (!state.task || state.task.fileHash !== state.file.hash)
        state.task = { id: newIdentity('task'), revision: 0, fileHash: state.file.hash };
    const configuration = runConfiguration(state);
    return structuredClone({
        schemaVersion: 1,
        version: '2.9.0',
        key: 'currentState',
        processedIndex,
        task: state.task,
        memoryQueue: state.memory.queue,
        generatedWorldbook: state.worldbook.generated,
        worldbookVolumes: state.worldbook.volumes,
        entryOverrides: state.worldbook.overrides || {},
        currentVolumeIndex: state.worldbook.currentVolumeIndex,
        fileHash: state.file.hash,
        novelName: state.file.novelName || '',
        timestamp: Date.now(),
        settings: withoutCredentials(configuration.settings),
        processingOptions: {
            volumeMode: configuration.processing?.volumeMode,
            incrementalMode: configuration.processing?.incrementalMode,
        },
        parallelConfig: configuration.config?.parallel,
        categoryLightSettings: configuration.config?.categoryLight,
        customWorldbookCategories: configuration.persistent?.customCategories,
        chapterRegexSettings: configuration.config?.chapterRegex,
        defaultWorldbookEntriesUI: state.persistent?.defaultEntries,
        categoryDefaultConfig: configuration.config?.categoryDefault,
        entryPositionConfig: configuration.config?.entryPosition,
    });
}

export function migrateTaskState(input, { fork = false } = {}) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.memoryQueue))
        throw new UserError('无效的任务状态文件');
    validateTree(input);
    if (input.schemaVersion != null && input.schemaVersion !== 1)
        throw new UserError('任务格式版本较新，请升级插件后导入');
    for (const key of [
        'settings',
        'parallelConfig',
        'categoryLightSettings',
        'chapterRegexSettings',
        'categoryDefaultConfig',
        'entryPositionConfig',
        'task',
    ]) {
        if (input[key] != null && (typeof input[key] !== 'object' || Array.isArray(input[key])))
            throw new UserError('任务配置格式不正确');
    }
    const state = structuredClone(input);
    for (const memory of state.memoryQueue) {
        if (
            !memory ||
            typeof memory !== 'object' ||
            Array.isArray(memory) ||
            (memory.content != null && typeof memory.content !== 'string')
        )
            throw new UserError('任务章节格式不正确');
        memory.content ??= '';
        memory.title = String(memory.title || '未命名章节');
        memory.processing = false;
        if (typeof memory.id !== 'string') delete memory.id;
    }
    ensureChunkIdentities(state.memoryQueue);
    if (
        state.generatedWorldbook &&
        (typeof state.generatedWorldbook !== 'object' || Array.isArray(state.generatedWorldbook))
    )
        throw new UserError('任务世界书格式不正确');
    if (state.worldbookVolumes && !Array.isArray(state.worldbookVolumes)) throw new UserError('任务分卷格式不正确');
    state.generatedWorldbook ??= {};
    state.worldbookVolumes ??= [];
    state.schemaVersion = 1;
    if (state.task?.id != null && typeof state.task.id !== 'string') throw new UserError('任务身份无效');
    const lifecycle = state.task?.lifecycle;
    if (fork || !state.task?.id)
        state.task = {
            id: newIdentity('task'),
            revision: 0,
            fileHash: state.fileHash || null,
            sourceTaskId: state.task?.id,
        };
    if (!Number.isInteger(state.task.revision) || state.task.revision < 0) throw new UserError('任务修订号无效');
    state.task.lifecycle = lifecycle === 'completed' ? 'completed' : 'paused';
    state.settings = withoutCredentials(state.settings);
    return state;
}

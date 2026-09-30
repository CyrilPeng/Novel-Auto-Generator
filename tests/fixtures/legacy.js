// Synthetic compatibility fixtures. No user data or real credentials.
export function createLegacyTask() {
    const entry = { 关键词: ['林舟', '旅人'], 内容: '林舟抵达青石镇，寻找失散的伙伴。' };
    const worldbook = { 角色: { 林舟: entry } };
    return {
        version: '2.9.0',
        timestamp: 1780272000000,
        memoryQueue: [
            {
                title: '记忆 1',
                content: '第一章 初来\n林舟抵达青石镇。',
                processed: true,
                failed: false,
                result: structuredClone(worldbook),
            },
            { title: '记忆 2', content: '第二章 重逢\n林舟遇见旧友。', processed: false, failed: false },
        ],
        generatedWorldbook: worldbook,
        worldbookVolumes: [{ volumeIndex: 0, timestamp: 1780272000000, worldbook: structuredClone(worldbook) }],
        currentVolumeIndex: 0,
        fileHash: 'synthetic-novel-v1',
        novelName: '兼容测试小说',
        originalFileName: 'synthetic-novel.txt',
        settings: { chunkSize: 15000, useTavernApi: true, customApiKey: '', filterResponseTags: 'thinking,/think' },
        parallelConfig: { enabled: true, concurrency: 3, mode: 'batch' },
        categoryLightSettings: { 角色: false },
        customWorldbookCategories: [{ name: '角色', enabled: true }],
        chapterRegexSettings: { pattern: '第[一二三0-9]+章', useCustomRegex: false },
        defaultWorldbookEntriesUI: [],
        categoryDefaultConfig: {},
        entryPositionConfig: {},
    };
}

export function createSTWorldbook(asObject = false) {
    const entry = {
        uid: 7,
        key: ['林舟'],
        keysecondary: ['青石镇'],
        comment: '角色 - 林舟',
        content: '旅人。',
        constant: false,
        selective: true,
        disable: true,
        position: 4,
        depth: 6,
        order: 120,
        excludeRecursion: true,
        preventRecursion: true,
        probability: 80,
        extensions: { syntheticFutureField: 'preserve-me' },
    };
    return { entries: asObject ? { 7: entry } : [entry] };
}

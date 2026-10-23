export const defaultSettings = {
    totalChapters: 1000,
    currentChapter: 0,
    prompt: '继续推进剧情，保证剧情流畅自然，注意人物性格一致性',
    isRunning: false,
    isPaused: false,

    // 发送检测设置
    enableSendToastDetection: true,
    sendToastWaitTimeout: 60000,
    sendPostToastWaitTime: 1000,

    // 回复等待设置
    replyWaitTime: 5000,
    stabilityCheckInterval: 1000,
    stabilityRequiredCount: 3,
    enableReplyToastDetection: true,
    replyToastWaitTimeout: 300000,
    replyPostToastWaitTime: 2000,

    // 生成设置
    autoSaveInterval: 50,
    maxRetries: 3,
    minChapterLength: 100,

    // 导出设置
    exportAll: true,
    exportStartFloor: 0,
    exportEndFloor: 99999,
    exportIncludeUser: false,
    exportIncludeAI: true,
    useRawContent: true,
    extractTags: '',
    excludeTags: '',
    extractMode: 'all',
    tagSeparator: '\n\n',

    panelCollapsed: {
        generate: false,
        export: false,
        extract: true,
        advanced: true,
    },
};

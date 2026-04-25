export function createTaskStateService(deps = {}) {
    const {
        AppState,
        MemoryHistoryDB,
        Logger,
        ErrorHandler,
        confirmAction,
        defaultSettings,
        getExportBaseName,
        rebuildWorldbookFromMemories,
        showQueueSection,
        updateMemoryQueueUI,
        updateVolumeIndicator,
        updateStartButtonState,
        updateSettingsUI,
        renderCategoriesList,
        renderDefaultWorldbookEntriesUI,
        updateChapterRegexUI,
        showResultSection,
        updateWorldbookPreview,
    } = deps;

    let autoSaveTimerId = null;
    let beforeUnloadHandler = null;

    function setupAutoSave(interval = 60000) {
        clearAutoSave();
        autoSaveTimerId = setInterval(async () => {
            if (!AppState.processing.isRunning) return;
            try {
                const processedCount = AppState.memory.queue.filter(m => m.processed).length;
                await MemoryHistoryDB.saveState(processedCount);
            } catch (e) {
                Logger.warn('AutoSave', '自动保存失败:', e.message);
            }
        }, interval);

        beforeUnloadHandler = () => {
            if (AppState.processing.isRunning && AppState.memory.queue.length > 0) {
                const processedCount = AppState.memory.queue.filter(m => m.processed).length;
                try { MemoryHistoryDB.saveState(processedCount); } catch (e) {}
            }
        };
        window.addEventListener('beforeunload', beforeUnloadHandler);
    }

    function clearAutoSave() {
        if (autoSaveTimerId) {
            clearInterval(autoSaveTimerId);
            autoSaveTimerId = null;
        }
        if (beforeUnloadHandler) {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            beforeUnloadHandler = null;
        }
    }

    async function saveTaskState() {
        const state = {
            version: '2.9.0',
            timestamp: Date.now(),
            memoryQueue: AppState.memory.queue,
            generatedWorldbook: AppState.worldbook.generated,
            worldbookVolumes: AppState.worldbook.volumes,
            currentVolumeIndex: AppState.worldbook.currentVolumeIndex,
            fileHash: AppState.file.hash,
            settings: AppState.settings,
            parallelConfig: AppState.config.parallel,
            categoryLightSettings: AppState.config.categoryLight,
            customWorldbookCategories: AppState.persistent.customCategories,
            chapterRegexSettings: AppState.config.chapterRegex,
            defaultWorldbookEntriesUI: AppState.persistent.defaultEntries,
            categoryDefaultConfig: AppState.config.categoryDefault,
            entryPositionConfig: AppState.config.entryPosition,
            originalFileName: AppState.file.current ? AppState.file.current.name : null,
            novelName: AppState.file.novelName || '',
        };
        const timeString = new Date()
            .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            .replace(/[:/\s]/g, '')
            .replace(/,/g, '-');

        const baseName = getExportBaseName('任务状态');
        const fileName = `${baseName}-任务状态-${timeString}.json`;

        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
        ErrorHandler.showUserSuccess(`任务状态已导出！已处理: ${processedCount}/${AppState.memory.queue.length}`);
    }

    async function loadTaskState() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const content = await file.text();
                const state = JSON.parse(content);
                if (!state.memoryQueue || !Array.isArray(state.memoryQueue)) throw new Error('无效的任务状态文件');
                AppState.memory.queue = state.memoryQueue;
                AppState.worldbook.generated = state.generatedWorldbook || {};
                AppState.worldbook.volumes = state.worldbookVolumes || [];
                AppState.worldbook.currentVolumeIndex = state.currentVolumeIndex || 0;
                AppState.file.hash = state.fileHash || null;

                if (state.settings) AppState.settings = { ...defaultSettings, ...state.settings };
                if (state.parallelConfig) AppState.config.parallel = { ...AppState.config.parallel, ...state.parallelConfig };
                if (state.categoryLightSettings) AppState.config.categoryLight = { ...AppState.config.categoryLight, ...state.categoryLightSettings };
                if (state.customWorldbookCategories) AppState.persistent.customCategories = state.customWorldbookCategories;
                if (state.chapterRegexSettings) AppState.config.chapterRegex = state.chapterRegexSettings;
                if (state.defaultWorldbookEntriesUI) AppState.persistent.defaultEntries = state.defaultWorldbookEntriesUI;
                if (state.categoryDefaultConfig) AppState.config.categoryDefault = state.categoryDefaultConfig;
                if (state.entryPositionConfig) AppState.config.entryPosition = state.entryPositionConfig;

                if (state.novelName) {
                    AppState.file.novelName = state.novelName;
                } else if (state.originalFileName) {
                    AppState.file.novelName = state.originalFileName.replace(/\.[^/.]+$/, '');
                }

                const fileNameEl = document.getElementById('ttw-file-name');
                if (fileNameEl && state.originalFileName) {
                    fileNameEl.textContent = state.originalFileName;
                }
                const novelNameInput = document.getElementById('ttw-novel-name-input');
                if (novelNameInput && AppState.file.novelName) {
                    novelNameInput.value = AppState.file.novelName;
                }
                const novelNameRow = document.getElementById('ttw-novel-name-row');
                if (novelNameRow) novelNameRow.style.display = 'flex';

                if (Object.keys(AppState.worldbook.generated).length === 0) {
                    rebuildWorldbookFromMemories();
                }

                const firstUnprocessed = AppState.memory.queue.findIndex((m) => !m.processed || m.failed);
                AppState.memory.startIndex = firstUnprocessed !== -1 ? firstUnprocessed : 0;
                AppState.memory.userSelectedIndex = null;

                showQueueSection(true);
                updateMemoryQueueUI();
                if (AppState.processing.volumeMode) updateVolumeIndicator();
                updateStartButtonState(false);
                updateSettingsUI();
                renderCategoriesList();
                renderDefaultWorldbookEntriesUI();
                updateChapterRegexUI();

                if (Object.keys(AppState.worldbook.generated).length > 0) {
                    showResultSection(true);
                    updateWorldbookPreview();
                }

                const processedCount = AppState.memory.queue.filter((m) => m.processed).length;
                ErrorHandler.showUserSuccess(`导入成功！已处理: ${processedCount}/${AppState.memory.queue.length}`);
                document.getElementById('ttw-start-btn').disabled = false;
            } catch (error) {
                ErrorHandler.showUserError('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    async function restoreExistingState() {
        if (AppState.memory.queue.length > 0) {
            document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = AppState.file.current ? AppState.file.current.name : '已加载的文件';
            const totalChars = AppState.memory.queue.reduce((sum, m) => sum + m.content.length, 0);
            document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${AppState.memory.queue.length}章)`;
            if (AppState.file.novelName) {
                const novelNameRow = document.getElementById('ttw-novel-name-row');
                if (novelNameRow) novelNameRow.style.display = 'flex';
                const novelNameInput = document.getElementById('ttw-novel-name-input');
                if (novelNameInput) novelNameInput.value = AppState.file.novelName;
            }

            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (memory.processed && !memory.failed && !memory.result) {
                    try {
                        const rollResults = await MemoryHistoryDB.getRollResults(i);
                        if (rollResults.length > 0) {
                            const latestRoll = rollResults[rollResults.length - 1];
                            memory.result = latestRoll.result;
                            Logger.info('Restore', `✅ 恢复第${i + 1}章的result`);
                        }
                    } catch (e) {
                        Logger.error('Restore', `恢复第${i + 1}章result失败:`, e);
                    }
                }
            }

            showQueueSection(true);
            updateMemoryQueueUI();

            document.getElementById('ttw-start-btn').disabled = false;
            updateStartButtonState(false);

            if (AppState.processing.volumeMode) updateVolumeIndicator();

            if (Object.keys(AppState.worldbook.generated).length === 0) {
                const hasProcessedWithResult = AppState.memory.queue.some((m) => m.processed && !m.failed && m.result);
                if (hasProcessedWithResult) {
                    rebuildWorldbookFromMemories();
                }
            }

            if (Object.keys(AppState.worldbook.generated).length > 0) {
                showResultSection(true);
                updateWorldbookPreview();
            }
        }
    }

    async function checkAndRestoreState() {
        try {
            const savedState = await MemoryHistoryDB.loadState();
            if (savedState && savedState.memoryQueue && savedState.memoryQueue.length > 0) {
                const processedCount = savedState.memoryQueue.filter((m) => m.processed).length;
                if (await confirmAction(`检测到未完成任务\n已处理: ${processedCount}/${savedState.memoryQueue.length}\n\n是否恢复？`, { title: '恢复未完成任务' })) {
                    AppState.memory.queue = savedState.memoryQueue;
                    AppState.worldbook.generated = savedState.generatedWorldbook || {};
                    AppState.worldbook.volumes = savedState.worldbookVolumes || [];
                    AppState.worldbook.currentVolumeIndex = savedState.currentVolumeIndex || 0;
                    AppState.file.hash = savedState.fileHash;

                    if (savedState.novelName) AppState.file.novelName = savedState.novelName;

                    if (Object.keys(AppState.worldbook.generated).length === 0) {
                        rebuildWorldbookFromMemories();
                    }

                    AppState.memory.startIndex = AppState.memory.queue.findIndex((m) => !m.processed || m.failed);
                    if (AppState.memory.startIndex === -1) AppState.memory.startIndex = AppState.memory.queue.length;
                    AppState.memory.userSelectedIndex = null;

                    showQueueSection(true);
                    updateMemoryQueueUI();
                    if (AppState.processing.volumeMode) updateVolumeIndicator();
                    if (AppState.memory.startIndex >= AppState.memory.queue.length || Object.keys(AppState.worldbook.generated).length > 0) {
                        showResultSection(true);
                        updateWorldbookPreview();
                    }
                    updateStartButtonState(false);
                    updateSettingsUI();
                    document.getElementById('ttw-start-btn').disabled = false;

                    document.getElementById('ttw-upload-area').style.display = 'none';
                    document.getElementById('ttw-file-info').style.display = 'flex';
                    document.getElementById('ttw-file-name').textContent = '已恢复的任务';
                    const totalChars = AppState.memory.queue.reduce((sum, m) => sum + m.content.length, 0);
                    document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${AppState.memory.queue.length}章)`;
                    const novelNameRow = document.getElementById('ttw-novel-name-row');
                    if (novelNameRow) novelNameRow.style.display = 'flex';
                    const novelNameInput = document.getElementById('ttw-novel-name-input');
                    if (novelNameInput && AppState.file.novelName) novelNameInput.value = AppState.file.novelName;
                } else {
                    await MemoryHistoryDB.clearState();
                }
            }
        } catch (e) {
            Logger.error('Restore', '恢复状态失败:', e);
        }
    }

    return {
        saveTaskState,
        loadTaskState,
        checkAndRestoreState,
        restoreExistingState,
        setupAutoSave,
        clearAutoSave,
    };
}

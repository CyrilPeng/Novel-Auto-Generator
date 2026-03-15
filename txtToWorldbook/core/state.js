export function createInitialAppState(options = {}) {
    const {
        defaultCategoryLight,
        defaultPlotOutlineConfig,
        defaultParallelConfig,
        defaultChapterRegex,
        defaultWorldbookCategories,
        defaultSettings,
    } = options;

    return {
        worldbook: {
            generated: {},
            volumes: [],
            currentVolumeIndex: 0
        },
        memory: {
            queue: [],
            failedQueue: [],
            currentIndex: 0,
            startIndex: 0,
            userSelectedIndex: null
        },
        file: {
            current: null,
            hash: null,
            novelName: ''
        },
        processing: {
            isStopped: false,
            isRepairing: false,
            isRerolling: false,
            incrementalMode: true,
            volumeMode: false,
            streamContent: '',
            activeTasks: new Set()
        },
        ui: {
            isMultiSelectMode: false,
            selectedIndices: new Set(),
            searchKeyword: '',
            tokenThreshold: 0,
            manualMergeHighlight: null
        },
        config: {
            entryPosition: {},
            categoryLight: { ...(defaultCategoryLight || {}) },
            categoryDefault: {},
            plotOutline: { ...(defaultPlotOutlineConfig || {}) },
            parallel: { ...(defaultParallelConfig || {}) },
            chapterRegex: { ...(defaultChapterRegex || {}) }
        },
        persistent: {
            defaultEntries: [],
            customCategories: JSON.parse(JSON.stringify(defaultWorldbookCategories || [])),
            pendingImport: null
        },
        settings: { ...(defaultSettings || {}) },
        globalSemaphore: null
    };
}

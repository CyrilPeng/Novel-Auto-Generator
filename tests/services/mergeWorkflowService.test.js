import { describe, it, expect, vi } from 'vitest';
import {
    createMergeWorkflowService,
    isConsolidateErrorResponse,
} from '../../txtToWorldbook/services/mergeWorkflowService.js';

const PROXY_QUEUE_ERROR = `### **Proxy queue error (too many concurrent requests)**
Your IP or user token already has another request in the queue.`;

function createTestService(overrides = {}) {
    const AppState = {
        worldbook: {
            generated: {
                角色: {
                    张三: {
                        关键词: ['张三', '张三'],
                        内容: '原始条目内容',
                    },
                },
            },
        },
        config: {
            parallel: {
                enabled: true,
                concurrency: 3,
            },
        },
        processing: {
            isStopped: false,
        },
        settings: {},
    };

    const mocks = {
        callAPI: overrides.callAPI || vi.fn().mockResolvedValue('整理后的内容：整理后的条目内容'),
        getLanguagePrefix: vi.fn().mockReturnValue(''),
        parseAIResponse:
            overrides.parseAIResponse ||
            vi.fn((text) => {
                try {
                    return JSON.parse(text);
                } catch {
                    throw new Error('plain text');
                }
            }),
        filterResponseContent: overrides.filterResponseContent || ((text) => String(text || '')),
        updateStreamContent: vi.fn(),
        updateProgress: vi.fn(),
        showProgressSection: vi.fn(),
        setProcessingStatus: vi.fn(),
        updateWorldbookPreview: vi.fn(),
        saveWorldbookSnapshot: vi.fn(),
    };

    const service = createMergeWorkflowService({
        AppState,
        ErrorHandler: {
            showUserError: vi.fn(),
            showUserSuccess: vi.fn(),
            handle: vi.fn(),
        },
        ModalFactory: {},
        getEntryTotalTokens: vi.fn().mockReturnValue(1),
        naturalSortEntryNames: (names) => [...names].sort(),
        EventDelegate: {},
        PerfUtils: {},
        estimateTokenCount: vi.fn().mockReturnValue(1),
        mergeService: {
            quickDuplicateScan: vi.fn().mockReturnValue([]),
            getManualMergeViewWorldbook: vi.fn().mockReturnValue({}),
            findPotentialDuplicates: vi.fn().mockReturnValue([]),
            executeManualMerge: vi.fn(),
            resolveDisplayedEntrySource: vi.fn(),
            verifyDuplicatesWithAI: vi.fn(),
            collectAliasMergeGroups: vi.fn(),
            executeAliasMergeByCategory: vi.fn(),
            mergeConfirmedDuplicates: vi.fn(),
        },
        Logger: {},
        getAllVolumesWorldbook: vi.fn(),
        defaultConsolidatePrompt: '整理：{CONTENT}',
        saveCurrentSettings: vi.fn(),
        promptAction: vi.fn(),
        confirmAction: vi.fn(),
        showProgressSection: mocks.showProgressSection,
        setProcessingStatus: mocks.setProcessingStatus,
        updateProgress: mocks.updateProgress,
        updateStreamContent: mocks.updateStreamContent,
        Semaphore: class {},
        getProcessingStatus: vi.fn().mockReturnValue('idle'),
        updateWorldbookPreview: mocks.updateWorldbookPreview,
        callAPI: mocks.callAPI,
        getLanguagePrefix: mocks.getLanguagePrefix,
        parseAIResponse: mocks.parseAIResponse,
        filterResponseContent: mocks.filterResponseContent,
        escapeHtml: (value) => String(value),
        buildAliasCategorySelectModal: vi.fn(),
        buildAliasGroupsListHtml: vi.fn(),
        buildAliasPairResultsHtml: vi.fn(),
        buildAliasMergePlanHtml: vi.fn(),
        handleStopProcessing: vi.fn(),
        saveWorldbookSnapshot: mocks.saveWorldbookSnapshot,
    });

    return { service, AppState, mocks };
}

describe('isConsolidateErrorResponse', () => {
    it('识别代理排队错误文本', () => {
        expect(isConsolidateErrorResponse(PROXY_QUEUE_ERROR)).toBe(true);
    });

    it('不把普通条目内容误判为错误', () => {
        expect(isConsolidateErrorResponse('张三：主角好友，负责联络各方情报。')).toBe(false);
    });
});

describe('consolidateEntry', () => {
    it('AI/API 返回代理排队错误时保留原条目内容', async () => {
        const { service, AppState } = createTestService({
            callAPI: vi.fn().mockResolvedValue(PROXY_QUEUE_ERROR),
        });

        await expect(service.consolidateEntry('角色', '张三', '整理：{CONTENT}')).rejects.toThrow('排队或限流错误');

        expect(AppState.worldbook.generated['角色']['张三']['内容']).toBe('原始条目内容');
    });

    it('正常整理成功时写回清洗后的内容并去重关键词', async () => {
        const { service, AppState } = createTestService({
            callAPI: vi.fn().mockResolvedValue('整理后的内容：整理后的条目内容'),
        });

        await service.consolidateEntry('角色', '张三', '整理：{CONTENT}');

        expect(AppState.worldbook.generated['角色']['张三']['内容']).toBe('整理后的条目内容');
        expect(AppState.worldbook.generated['角色']['张三']['关键词']).toEqual(['张三']);
    });
});

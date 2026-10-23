// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createMergeWorkflowView } from '../../txtToWorldbook/ui/mergeWorkflowView.js';

it('空世界书时由视图层给出明确提示', () => {
    const showUserError = vi.fn();
    const view = createMergeWorkflowView({
        AppState: { worldbook: { generated: {} }, settings: {} },
        ErrorHandler: { showUserError, showUserSuccess: vi.fn(), handle: vi.fn() },
        workflow: {
            getMergeService: () => ({ getManualMergeViewWorldbook: () => ({}) }),
            getLastConsolidateFailedEntries: () => [],
        },
    });

    view.showConsolidateCategorySelector();
    expect(showUserError).toHaveBeenCalledWith(expect.stringContaining('没有任何条目'));

    view.showManualMergeUI();
    expect(showUserError).toHaveBeenCalledWith(expect.stringContaining('没有条目'));
});

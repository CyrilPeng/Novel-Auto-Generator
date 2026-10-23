import { createMergeAliasView } from './mergeAliasView.js';
import { createMergeConsolidateView } from './mergeConsolidateView.js';
import { createMergeManualView } from './mergeManualView.js';

export function createMergeWorkflowView(deps = {}) {
    const consolidate = createMergeConsolidateView(deps);
    const manual = createMergeManualView(deps);
    const alias = createMergeAliasView(deps);
    return {
        showConsolidateCategorySelector: consolidate.showConsolidateCategorySelector,
        showManualMergeUI: manual.showManualMergeUI,
        showAliasMergeUI: alias.showAliasMergeUI,
    };
}

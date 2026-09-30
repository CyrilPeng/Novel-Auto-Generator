import { createWorldbookService } from '../../src/worldbook/entries/worldbook.js';
import { createProcessingService } from '../../src/worldbook/commands/convert.js';
import { createRerollService } from '../../src/worldbook/commands/reroll.js';
import { createApiService } from '../services/apiService.js';
import { createPromptService } from '../services/promptService.js';
import { createParserService } from '../services/parserService.js';
import { createTokenMetricsService } from '../services/tokenMetricsService.js';
import { createExportFormatService } from '../../src/worldbook/formats/exportWorldbook.js';
import { createRerollModals } from '../ui/rerollModals.js';

function resolveDeps(factoryDeps, context) {
    if (typeof factoryDeps === 'function') {
        return factoryDeps(context) || {};
    }
    return factoryDeps || {};
}

export function createCoreServices(deps = {}) {
    const promptService = createPromptService(deps.promptDeps);
    const parserService = createParserService(deps.parserDeps);
    const apiService = createApiService(deps.apiDeps);
    const worldbookService = createWorldbookService(deps.worldbookDeps);
    const tokenMetricsService = createTokenMetricsService(deps.tokenMetricsDeps);
    const exportFormatService = createExportFormatService(deps.exportFormatDeps);

    const context = {
        promptService,
        parserService,
        apiService,
        worldbookService,
        tokenMetricsService,
        exportFormatService,
    };

    let processingService = null;
    function getProcessingService() {
        if (processingService) return processingService;
        processingService = createProcessingService(resolveDeps(deps.processingDeps, context));
        return processingService;
    }

    let rerollService = null;
    function getRerollService() {
        if (rerollService) return rerollService;
        rerollService = createRerollService(
            resolveDeps(deps.rerollDeps, {
                ...context,
                getProcessingService,
            }),
        );
        return rerollService;
    }

    let rerollModals = null;
    function getRerollModals() {
        if (rerollModals) return rerollModals;
        rerollModals = createRerollModals(
            resolveDeps(deps.rerollModalsDeps, {
                ...context,
                getProcessingService,
                getRerollService,
            }),
        );
        return rerollModals;
    }

    return {
        promptService,
        parserService,
        apiService,
        worldbookService,
        tokenMetricsService,
        exportFormatService,
        getProcessingService,
        getRerollService,
        getRerollModals,
    };
}

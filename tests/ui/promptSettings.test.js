// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildModalHtml, hydrateSettingsFromState } from '../../txtToWorldbook/ui/settingsPanel.js';
import { bindPromptEvents } from '../../txtToWorldbook/ui/eventBindings.js';
import { createSettingsPersistenceService } from '../../txtToWorldbook/ui/settingsPersistenceService.js';
import { createInitialAppState } from '../../txtToWorldbook/core/state.js';
import { defaultSettings } from '../../txtToWorldbook/core/constants.js';

function setup() {
    localStorage.clear();
    document.body.innerHTML = buildModalHtml();
    const AppState = createInitialAppState({ defaultSettings });
    const save = vi.fn();
    const service = createSettingsPersistenceService({
        AppState,
        defaultSettings,
        updateSettingsUI: () => {},
        updateChapterRegexUI: () => {},
        handleProviderChange: () => {},
    });
    return { AppState, save, service };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('TXT 转世界书设置面板', () => {
    it('装配并回填附加系统提示词', () => {
        const { AppState } = setup();
        AppState.settings.extraSystemPrompt = '附加系统指令';
        hydrateSettingsFromState({
            AppState,
            handleUseTavernApiChange: () => {},
            handleProviderChange: () => {},
            renderMessageChainUI: () => {},
        });
        expect(document.getElementById('ttw-extra-system-prompt').value).toBe('附加系统指令');
    });

    it('保存附加系统提示词并写入本地设置', () => {
        const { AppState, service } = setup();
        const input = document.getElementById('ttw-extra-system-prompt');
        input.value = '仅输出 JSON';
        service.saveCurrentSettings();
        expect(AppState.settings.extraSystemPrompt).toBe('仅输出 JSON');
        const stored = JSON.parse(localStorage.getItem('txtToWorldbookSettings'));
        expect(stored.extraSystemPrompt).toBe('仅输出 JSON');
    });

    it('输入时触发设置保存', () => {
        const { save } = setup();
        bindPromptEvents({ saveCurrentSettings: save });
        const input = document.getElementById('ttw-extra-system-prompt');
        input.value = '新指令';
        input.dispatchEvent(new Event('input'));
        expect(save).toHaveBeenCalledTimes(1);
    });
});

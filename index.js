import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { initTxtToWorldbookBridge } from './txtToWorldbook/main.js';
import { createSillyTavernHost } from './src/host/sillyTavern.js';
import { initNovelUI } from './src/novel/runtime.js';

initTxtToWorldbookBridge().catch((error) => {
    console.error('[NovelGen] TxtToWorldbook bridge init failed:', error);
});
initNovelUI(createSillyTavernHost({ extensionSettings: extension_settings, saveSettings: saveSettingsDebounced }));

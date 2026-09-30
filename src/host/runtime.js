import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { createSillyTavernHost } from './sillyTavern.js';
export const host = createSillyTavernHost({
    extensionSettings: extension_settings,
    saveSettings: saveSettingsDebounced,
});

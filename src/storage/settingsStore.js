import { withoutCredentials } from './taskSchema.js';

export function saveSettingsRecord(storage, settings, key = 'txtToWorldbookSettings') {
    const clean = withoutCredentials(settings);
    const credentials = {};
    for (const [name, value] of Object.entries(settings)) {
        if (!(name in clean) || (name === 'customApiEndpoint' && value !== clean[name])) credentials[name] = value;
    }
    // Save credentials first so a failed second write cannot discard an existing API key.
    storage.setItem(key + ':credentials', JSON.stringify(credentials));
    storage.setItem(key, JSON.stringify(clean));
}

export function loadSettingsRecord(storage, key = 'txtToWorldbookSettings') {
    const raw = storage.getItem(key);
    const settings = raw ? JSON.parse(raw) : {};
    const credentials = JSON.parse(storage.getItem(key + ':credentials') || '{}');
    const merged = { ...settings, ...credentials };
    if (raw && JSON.stringify(withoutCredentials(settings)) !== JSON.stringify(settings))
        saveSettingsRecord(storage, merged, key);
    return merged;
}

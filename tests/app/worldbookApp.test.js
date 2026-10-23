// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorldbookApp } from '../../txtToWorldbook/app/createWorldbookApp.js';
import { Logger } from '../../txtToWorldbook/core/logger.js';

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="extensions_settings"></div>';
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('组装完整世界书应用并暴露稳定的公开 API', async () => {
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    const app = createWorldbookApp();
    expect(Object.keys(app.api)).toHaveLength(45);
    expect(app.api.getWorldbook()).toBeDefined();
    expect(app.shellRuntime.modalController).toBeTruthy();
    expect(app.shellRuntime.modalEventBinder).toBeTruthy();

    await app.api.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('txt-to-worldbook-modal')).toBeTruthy();
    app.api.close();
    expect(document.getElementById('txt-to-worldbook-modal')).toBeNull();
});

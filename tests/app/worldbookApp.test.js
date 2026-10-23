// @vitest-environment jsdom
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

it('组装完整世界书应用并暴露稳定的公开 API', () => {
    vi.spyOn(Logger, 'info').mockImplementation(() => {});
    const app = createWorldbookApp();
    expect(Object.keys(app.api)).toHaveLength(45);
    expect(app.api.getWorldbook()).toBeDefined();
    expect(app.shellRuntime.modalController).toBeTruthy();
    expect(app.shellRuntime.modalEventBinder).toBeTruthy();
});

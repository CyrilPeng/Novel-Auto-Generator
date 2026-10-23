import { createWorldbookApp } from './app/createWorldbookApp.js';

let app = null;

function ensureApp() {
    if (typeof window === 'undefined') return null;
    if (!app) app = createWorldbookApp();
    window.TxtToWorldbook = app.api;
    return app;
}

if (typeof window !== 'undefined') ensureApp();

let __txtToWorldbookInitPromise = null;

export async function initTxtToWorldbookBridge() {
    if (!__txtToWorldbookInitPromise) {
        __txtToWorldbookInitPromise = Promise.resolve({
            loadedFrom: 'txtToWorldbook/main.js',
            api: ensureApp()?.api ?? getTxtToWorldbookApi(),
        });
    }
    return __txtToWorldbookInitPromise;
}

export function getTxtToWorldbookApi() {
    if (typeof window === 'undefined') return null;
    return window.TxtToWorldbook || null;
}

export default {
    initTxtToWorldbookBridge,
    getTxtToWorldbookApi,
};

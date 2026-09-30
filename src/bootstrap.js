import { host } from './host/runtime.js';
import { initNovelUI } from './novel/runtime.js';
import { initTxtToWorldbookBridge } from '../txtToWorldbook/main.js';
import { ensureModalStyles } from '../txtToWorldbook/ui/modalStyles.js';
ensureModalStyles();
initTxtToWorldbookBridge().catch((error) => console.error('[NovelGen] TxtToWorldbook bridge init failed:', error));
initNovelUI(host);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.ST_TEST_URL || 'http://127.0.0.1:18019';
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/?$/);
assert.ok(process.env.ST_LEGACY_ROOT && process.env.ST_EXPORT_PATH);
const root = resolve(process.env.ST_LEGACY_ROOT);
const exported = JSON.parse(await readFile(process.env.ST_EXPORT_PATH, 'utf8'));
assert.ok(exported.memoryQueue.every((chunk) => chunk.processed));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const prefix = '/scripts/extensions/third-party/Novel-Auto-Generator/';
    await page.route('**' + prefix + '**', async (route) => {
        const path = resolve(root, decodeURIComponent(new URL(route.request().url()).pathname.split(prefix)[1]));
        assert.ok(path.startsWith(root + sep));
        const type = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[
            extname(path)
        ];
        try {
            await route.fulfill({ body: await readFile(path), contentType: type || 'text/plain' });
        } catch (error) {
            if (error.code === 'ENOENT') await route.fulfill({ status: 404 });
            else throw error;
        }
    });
    await page.route('**/api/horde/text-models', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', (route) => route.fulfill({ json: [] }));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#nag-container').waitFor({ state: 'attached' });
    if (!(await page.locator('#nag-container').isVisible()))
        await page
            .getByTitle(/^扩展(程序)?$|^Extensions$/)
            .first()
            .click();
    if (!(await page.locator('#nag-btn-txt-to-worldbook').isVisible()))
        await page.locator('#nag-container .inline-drawer-toggle').click();
    await page.locator('#nag-btn-txt-to-worldbook').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#ttw-import-task').click();
    await (await chooser).setFiles(process.env.ST_EXPORT_PATH);
    await page.waitForFunction(() => window.TxtToWorldbook.getMemoryQueue().length > 0);
    const actual = await page.evaluate(() => ({
        queue: window.TxtToWorldbook.getMemoryQueue(),
        worldbook: window.TxtToWorldbook.getWorldbook(),
    }));
    assert.deepEqual(actual.queue, exported.memoryQueue);
    assert.deepEqual(actual.worldbook, exported.generatedWorldbook);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#ttw-export-task').click();
    const stream = await (await downloadPromise).createReadStream();
    const parts = [];
    for await (const part of stream) parts.push(part);
    const roundtrip = JSON.parse(Buffer.concat(parts).toString());
    assert.deepEqual(roundtrip.generatedWorldbook, exported.generatedWorldbook);
    assert.deepEqual(roundtrip.memoryQueue, exported.memoryQueue);
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            url,
            legacyRoot: root,
            chunks: actual.queue.length,
            checks: ['old-code-load', 'import-new-completed-task', 'old-code-reexport'],
            errors,
        }),
    );
} finally {
    await browser.close();
}

import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Point PLAYWRIGHT_MODULE at an existing Playwright installation, or install it locally.
const require = createRequire(import.meta.url);
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.ST_TEST_URL || 'http://127.0.0.1:18019';
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/?$/, 'Use an isolated local test host');
const browserType = process.env.ST_BROWSER === 'firefox' ? firefox : chromium;
const browser = await browserType.launch({
    headless: true,
    ...(process.env.ST_BROWSER === 'firefox' ? {} : { channel: process.env.ST_BROWSER_CHANNEL || 'msedge' }),
});
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    let requests = 0;
    let lastRequestBody = null;
    let holdResponses = process.env.ST_PAUSE === '1';
    const releases = [];
    page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error(error.stack);
    });
    // Isolate unused Horde background discovery from external network availability.
    await page.route('**/api/horde/text-models', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', (route) => route.fulfill({ json: { ok: false } }));
    await page.route('http://127.0.0.1:18080/**', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        requests++;
        lastRequestBody = route.request().postDataJSON();
        if (requests > 1 && holdResponses) await new Promise((resolve) => releases.push(resolve));
        const content = JSON.stringify({ 角色: { 张三: { 关键词: ['张三'], 内容: '张三是一位旅行者。' } } });
        const chunks = [{ choices: [{ delta: { content } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }];
        await route.fulfill({
            status: 200,
            headers: { ...headers, 'Content-Type': 'text/event-stream' },
            body: chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const welcome = page.getByRole('dialog');
    if (await welcome.locator('textarea:visible').count()) {
        await welcome.locator('textarea:visible').last().fill('PluginQA');
        await welcome.locator('.popup-button-ok').click();
    }
    async function openPlugin() {
        await page.locator('#nag-container').waitFor({ state: 'attached' });
        if (!(await page.locator('#nag-container').isVisible()))
            await page
                .getByTitle(/^扩展(程序)?$|^Extensions$/)
                .first()
                .click();
        if (!(await page.locator('#nag-btn-txt-to-worldbook').isVisible()))
            await page.locator('#nag-container .inline-drawer-toggle').click();
        await page.locator('#nag-btn-txt-to-worldbook').click();
        await page.locator('#txt-to-worldbook-modal').waitFor();
    }
    await openPlugin();
    await page.locator('#ttw-use-tavern-api').uncheck();
    await page.locator('#ttw-api-provider').selectOption('openai-compatible');
    await page.locator('#ttw-api-endpoint').fill('http://127.0.0.1:18080/v1');
    await page.locator('#ttw-api-model').fill('fixture-model');
    await page.locator('#ttw-api-model').blur();
    await page.evaluate(() => {
        const input = document.getElementById('ttw-extra-system-prompt');
        input.value = 'QA 附加系统指令';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const mode = process.env.ST_PROCESS_MODE || 'independent';
    await page.locator('#ttw-parallel-enabled').setChecked(mode !== 'serial');
    if (mode !== 'serial') await page.locator('#ttw-parallel-mode').selectOption(mode);
    await page.locator('#ttw-parallel-concurrency').fill('2');
    await page.locator('#ttw-parallel-concurrency').blur();
    if (process.env.ST_LARGE === '1') {
        for (const megabytes of [1, 10]) {
            const start = Date.now();
            await page.locator('#ttw-file-input').setInputFiles({
                name: 'large.txt',
                mimeType: 'text/plain',
                buffer: Buffer.alloc(megabytes * 1024 * 1024, 'A'),
            });
            await page.waitForFunction(
                (size) => window.TxtToWorldbook.getMemoryQueue().reduce((sum, m) => sum + m.content.length, 0) === size,
                megabytes * 1024 * 1024,
            );
            console.log(
                JSON.stringify({
                    browser: browser.version(),
                    uploadedMB: megabytes,
                    uploadAndRenderMs: Date.now() - start,
                }),
            );
        }
    }
    await page.locator('#ttw-file-input').setInputFiles({
        name: 'fixture.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('第一章\n张三来到城里。\n'.repeat(process.env.ST_PROCESS_MODE ? 4000 : 500)),
    });
    await page.waitForFunction(() => !document.querySelector('#ttw-start-btn').disabled);
    await page.locator('#ttw-quick-test').click();
    await page.waitForFunction(() => document.body.innerText.includes('测试成功'));
    await page.locator('#ttw-start-btn').click();
    if (holdResponses) {
        for (let attempt = 0; !releases.length && attempt < 100; attempt++)
            await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(releases.length, 'Conversion reached the model');
        const competing = await context.newPage();
        await competing.goto(url, { waitUntil: 'networkidle' });
        await competing.waitForFunction(() => window.TxtToWorldbook);
        const refusal = await competing.evaluate(async () => {
            try {
                await window.TxtToWorldbook.rechunkMemories();
                return '';
            } catch (error) {
                return error.message;
            }
        });
        assert.match(refusal, /另一个酒馆页面/);
        await competing.close();
        await page.locator('#ttw-stop-btn').click();
        holdResponses = false;
        releases.forEach((release) => release());
        await page.waitForFunction(() => document.querySelector('#ttw-start-btn').textContent.includes('继续转换'));
        const processed = await page.evaluate(
            () => window.TxtToWorldbook.getMemoryQueue().filter((m) => m.processed).length,
        );
        assert.ok(processed > 0 && processed <= 2, 'Pause drains only dispatched chunks');
        await page.locator('#ttw-start-btn').click();
    }
    await page.waitForFunction(() => document.querySelector('#ttw-start-btn').textContent.includes('重新转换'));
    const before = await page.evaluate(() => ({
        queue: window.TxtToWorldbook.getMemoryQueue(),
        worldbook: window.TxtToWorldbook.getWorldbook(),
    }));
    assert.equal(before.worldbook.角色.张三.内容, '张三是一位旅行者。');
    assert.ok(before.queue.every((chunk) => chunk.processed && chunk.id));
    assert.ok(JSON.stringify(lastRequestBody).includes('QA 附加系统指令'), 'Extra system prompt reaches the model');
    for (const selector of ['#ttw-export-st', '#ttw-export-json']) {
        const pending = page.waitForEvent('download');
        await page.locator(selector).click();
        const source = await (await pending).createReadStream();
        const parts = [];
        for await (const part of source) parts.push(part);
        const data = JSON.parse(Buffer.concat(parts).toString());
        const entries = selector === '#ttw-export-st' ? data.entries : data.data.character_book.entries;
        assert.ok(Object.values(entries).some((entry) => entry.content.includes('张三是一位旅行者。')));
    }
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#ttw-export-task').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    if (process.env.ST_EXPORT_PATH) await writeFile(process.env.ST_EXPORT_PATH, JSON.stringify(exported));
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.settings.customApiKey, undefined);
    await page.reload({ waitUntil: 'networkidle' });
    await openPlugin();
    await page.locator('[data-action="confirm"]').last().click();
    await page.waitForFunction(() => window.TxtToWorldbook.getMemoryQueue().length > 0);
    const after = await page.evaluate(() => ({
        queue: window.TxtToWorldbook.getMemoryQueue(),
        worldbook: window.TxtToWorldbook.getWorldbook(),
    }));
    assert.deepEqual(after, before);
    assert.equal(
        requests,
        before.queue.length + 1,
        'One request per chunk plus quick test; pause/recovery must not generate twice',
    );
    if (process.env.ST_EDIT === '1') {
        await page.locator('#ttw-replace-btn').click();
        await page.locator('#ttw-replace-find').fill('旅行者');
        await page.locator('#ttw-replace-with').fill('<qa>移除</qa>探险家');
        await page.locator('#ttw-do-replace').click();
        await page.locator('[data-action="confirm"]').last().click();
        await page.waitForFunction(() => window.TxtToWorldbook.getWorldbook().角色.张三.内容.includes('探险家'));
        await page.locator('#ttw-close-replace').click();
        await page.locator('#ttw-clean-tags').click();
        await page.locator('#ttw-clean-tags-input').fill('qa');
        await page.locator('#ttw-scan-tags').click();
        await page.locator('#ttw-execute-clean-tags').click();
        await page.locator('[data-action="confirm"]').last().click();
        await page.waitForFunction(() => window.TxtToWorldbook.getWorldbook().角色.张三.内容 === '张三是一位探险家。');
        await page.reload({ waitUntil: 'networkidle' });
        await openPlugin();
        await page.locator('[data-action="confirm"]').last().click();
        await page.waitForFunction(
            () => window.TxtToWorldbook.getWorldbook().角色?.张三?.内容 === '张三是一位探险家。',
        );
        await page.locator('#ttw-view-history').click();
        await page.locator('.ttw-history-item').first().click();
        await page.locator('.ttw-history-rollback-btn').click();
        await page.locator('[data-action="confirm"]').last().click();
        await page.waitForEvent('load');
        await openPlugin();
        await page.locator('[data-action="confirm"]').last().click();
        await page.waitForFunction(
            () => window.TxtToWorldbook.getWorldbook().角色?.张三?.内容 === '张三是一位<qa>移除</qa>探险家。',
        );
    }
    if (process.env.ST_EDIT === '1') {
        const chooser = page.waitForEvent('filechooser');
        await page.locator('#ttw-import-task').click();
        await (
            await chooser
        ).setFiles({
            name: 'completed-task.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(exported)),
        });
        await page.waitForFunction(
            () => window.TxtToWorldbook.getWorldbook().角色?.张三?.内容 === '张三是一位旅行者。',
        );
        await page.reload({ waitUntil: 'networkidle' });
        await openPlugin();
        await page.locator('[data-action="confirm"]').last().click();
        await page.waitForFunction(
            () => window.TxtToWorldbook.getWorldbook().角色?.张三?.内容 === '张三是一位旅行者。',
        );
    }
    assert.equal(await page.locator('#nag-container').count(), 1);
    assert.equal(await page.locator('#ttw-styles').count(), 1);
    await page.evaluate(async () => {
        const { ModalFactory } =
            await import('/scripts/extensions/third-party/Novel-Auto-Generator/txtToWorldbook/infra/modalFactory.js');
        ModalFactory.create({ id: 'qa-outer', title: '外层测试', body: '<button id="qa-focus">焦点测试</button>' });
        ModalFactory.create({ id: 'qa-inner', title: '内层测试' });
    });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#qa-inner').count(), 0);
    assert.equal(await page.locator('#qa-outer').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#qa-outer').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await page.locator('#txt-to-worldbook-modal .ttw-modal').boundingBox();
    assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= 391, 'Mobile panel stays in viewport');
    if (process.env.ST_SCREENSHOT) await page.screenshot({ path: process.env.ST_SCREENSHOT });
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            url,
            mode,
            paused: process.env.ST_PAUSE === '1',
            browser: browser.version(),
            requests,
            chunks: after.queue.length,
            checks: [
                'load',
                'quick-test',
                'convert',
                'export-task',
                'reload-restore',
                'nested-modal-escape',
                'mobile-layout',
                'export-st-and-card',
                'extra-system-prompt',
                ...(process.env.ST_PAUSE === '1' ? ['cross-page-writer-refusal'] : []),
                ...(process.env.ST_EDIT === '1'
                    ? ['replace-clean-reload', 'history-rollback', 'import-completed-reload']
                    : []),
            ],
            errors,
        }),
    );
} finally {
    await browser.close();
}

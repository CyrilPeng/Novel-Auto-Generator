import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Point PLAYWRIGHT_MODULE at an existing Playwright installation, or install it locally.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.ST_TEST_URL || 'http://127.0.0.1:18019';
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/?$/, 'Use an isolated local test host');
const browser = await chromium.launch({ headless: true, channel: process.env.ST_BROWSER_CHANNEL || 'msedge' });
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    let requests = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://127.0.0.1:18080/**', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        requests++;
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
    await page.locator('#ttw-file-input').setInputFiles({
        name: 'fixture.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('第一章\n张三来到城里。\n'.repeat(500)),
    });
    await page.waitForFunction(() => !document.querySelector('#ttw-start-btn').disabled);
    await page.locator('#ttw-quick-test').click();
    await page.waitForFunction(() => document.body.innerText.includes('测试成功'));
    await page.locator('#ttw-start-btn').click();
    await page.waitForFunction(() => document.querySelector('#ttw-start-btn').textContent.includes('重新转换'));
    const before = await page.evaluate(() => ({
        queue: window.TxtToWorldbook.getMemoryQueue(),
        worldbook: window.TxtToWorldbook.getWorldbook(),
    }));
    assert.equal(before.worldbook.角色.张三.内容, '张三是一位旅行者。');
    assert.ok(before.queue.every((chunk) => chunk.processed && chunk.id));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#ttw-export-task').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
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
    assert.equal(requests, 2, 'Quick test + conversion; recovery must not generate');
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
            ],
            errors,
        }),
    );
} finally {
    await browser.close();
}

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.ST_TEST_URL || 'http://127.0.0.1:18019';
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/?$/);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const context = await browser.newContext();
    const page = await context.newPage();
    let requests = 0;
    let held = false;
    let releaseResponse;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/horde/text-models', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', (route) => route.fulfill({ json: { ok: false } }));
    await page.route('**/api/backends/chat-completions/status', (route) =>
        route.fulfill({ json: { data: [{ id: 'fixture-model' }] } }),
    );
    await page.route('**/api/backends/chat-completions/generate', async (route) => {
        requests++;
        if (held)
            await new Promise((resolve) => {
                releaseResponse = resolve;
            });
        const text = '测试小说正文，旅行者来到城里。'.repeat(25);
        if (!route.request().postDataJSON().stream) {
            await route.fulfill({ json: { choices: [{ message: { content: text }, finish_reason: 'stop' }] } });
            return;
        }
        await route
            .fulfill({
                contentType: 'text/event-stream',
                body:
                    'data: ' +
                    JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] }) +
                    '\n\ndata: ' +
                    JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
                    '\n\ndata: [DONE]\n\n',
            })
            .catch((error) => {
                if (!String(error).includes('closed') && !String(error).includes('Invalid')) throw error;
            });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const token = (await (await page.request.get(url + '/csrf-token')).json()).token;
    const name = 'NovelQA-' + Date.now();
    const created = await page.request.post(url + '/api/characters/create', {
        headers: { 'X-CSRF-Token': token },
        multipart: {
            ch_name: name,
            description: '用于插件自动化验收的合成角色',
            first_mes: '测试开始',
            creatorcomment: 'Synthetic QA only',
        },
    });
    assert.ok(created.ok(), await created.text());
    const avatar = await created.text();
    const otherCreated = await page.request.post(url + '/api/characters/create', {
        headers: { 'X-CSRF-Token': token },
        multipart: { ch_name: name + '-other', first_mes: '另一个测试聊天' },
    });
    assert.ok(otherCreated.ok());
    const otherAvatar = await otherCreated.text();
    await page.reload({ waitUntil: 'networkidle' });
    const index = await page.evaluate(
        (avatar) => window.SillyTavern.getContext().characters.findIndex((character) => character.avatar === avatar),
        avatar,
    );
    assert.ok(index >= 0);
    if (!(await page.locator('#CharID' + index).isVisible())) await page.locator('#rightNavDrawerIcon').click();
    await page.locator('#CharID' + index).click();
    await page.waitForFunction(() => window.SillyTavern.getContext().chat.length > 0);
    await page.locator('#main_api').selectOption('openai', { force: true });
    await page.locator('#chat_completion_source').selectOption('custom', { force: true });
    await page.locator('#custom_api_url_text').fill('http://127.0.0.1:18080/v1', { force: true });
    await page.locator('#custom_api_url_text').dispatchEvent('input');
    await page.locator('#custom_model_id').fill('fixture-model', { force: true });
    await page.locator('#custom_model_id').dispatchEvent('input');
    await page.locator('#api_button_openai').dispatchEvent('click');
    if (!(await page.locator('#nag-container').isVisible()))
        await page
            .getByTitle(/^扩展(程序)?$|^Extensions$/)
            .first()
            .click();
    if (!(await page.locator('#nag-btn-start').isVisible()))
        await page.locator('#nag-container .inline-drawer-toggle').click();
    await page.evaluate(() => {
        const values = {
            'nag-set-total': '1',
            'nag-set-minlen': '1',
            'nag-set-stability-interval': '500',
            'nag-set-stability-count': '1',
            'nag-set-reply-wait': '0',
        };
        for (const [id, value] of Object.entries(values)) {
            const node = document.getElementById(id);
            node.value = value;
            node.dispatchEvent(new Event('change', { bubbles: true }));
        }
        for (const id of ['nag-set-send-toast-detection', 'nag-set-reply-toast-detection']) {
            const node = document.getElementById(id);
            node.checked = false;
            node.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await page.locator('#nag-btn-reset').click();
    const before = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
    await page.locator('#nag-btn-start').click();
    await page.waitForFunction(
        () => document.querySelector('#nag-progress-text').textContent.startsWith('1 / 1'),
        null,
        { timeout: 30000 },
    );
    const after = await page.evaluate(() =>
        window.SillyTavern.getContext().chat.map((message) => ({ user: message.is_user, text: message.mes })),
    );
    assert.equal(requests, 1);
    assert.equal(after.length, before + 2);
    assert.ok(after.at(-1).text.includes('测试小说正文'));
    async function targetChapters(total) {
        await page.evaluate((total) => {
            const node = document.getElementById('nag-set-total');
            node.value = total;
            node.dispatchEvent(new Event('change', { bubbles: true }));
        }, total);
    }
    async function waitHeld() {
        for (let attempt = 0; !releaseResponse && attempt < 100; attempt++)
            await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(releaseResponse, 'Host dispatched generation');
    }
    await targetChapters(3);
    held = true;
    await page.locator('#nag-btn-start').click();
    await waitHeld();
    await page.locator('#nag-btn-pause').click();
    held = false;
    releaseResponse();
    releaseResponse = null;
    await page.waitForFunction(() => document.querySelector('#nag-progress-text').textContent.startsWith('2 / 3'));
    assert.equal(requests, 2, 'Paused runner must not dispatch the next chapter');
    await page.locator('#nag-btn-resume').click();
    await page.waitForFunction(() => document.querySelector('#nag-progress-text').textContent.startsWith('3 / 3'));
    assert.equal(requests, 3);
    await targetChapters(4);
    held = true;
    await page.locator('#nag-btn-start').click();
    await waitHeld();
    await page.locator('#nag-btn-stop').click();
    held = false;
    releaseResponse();
    releaseResponse = null;
    await page.locator('#mes_stop').waitFor({ state: 'hidden' });
    const otherIndex = await page.evaluate(
        (avatar) => window.SillyTavern.getContext().characters.findIndex((c) => c.avatar === avatar),
        otherAvatar,
    );
    if (!(await page.locator('#CharID' + otherIndex).isVisible())) await page.locator('#rightNavDrawerIcon').click();
    await page.locator('#rm_button_characters').click();
    await page.locator('#CharID' + otherIndex).click();
    await page.waitForFunction((avatar) => {
        const c = window.SillyTavern.getContext();
        return c.characters[c.characterId]?.avatar === avatar;
    }, otherAvatar);
    if (!(await page.locator('#nag-container').isVisible()))
        await page
            .getByTitle(/^扩展(程序)?$|^Extensions$/)
            .first()
            .click();
    await page.locator('#nag-btn-start').click();
    await page.waitForFunction(() => document.body.innerText.includes('原聊天还有待确认'));
    assert.equal(requests, 4, 'Switching chat must not dispatch the pending prompt again');
    const raw = await page.evaluate(() =>
        window.TxtToWorldbook.callSillyTavernAPI([
            { role: 'system', content: '测试' },
            { role: 'user', content: '返回正文' },
        ]),
    );
    assert.ok(raw.includes('测试小说正文'));
    assert.equal(requests, 5);
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({
            url,
            browser: browser.version(),
            requests,
            chatMessagesAdded: after.length - before,
            checks: [
                'real-host-send',
                'stable-completion',
                'pause-resume',
                'stop',
                'chat-switch-no-resend',
                'host-generateRaw',
            ],
        }),
    );
} finally {
    await browser.close();
}

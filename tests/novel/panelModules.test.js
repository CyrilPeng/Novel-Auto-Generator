import { afterEach, describe, expect, it } from 'vitest';
import { createPanelHtml } from '../../src/novel/panelTemplate.js';
import { getHelpContent } from '../../src/novel/helpContent.js';
import { defaultSettings } from '../../src/novel/defaultSettings.js';
import { setLocale } from '../../txtToWorldbook/core/i18n.js';

afterEach(() => setLocale('zh-CN'));

describe('续写面板静态模块', () => {
    it('模板保留关键控件并注入楼层数', () => {
        const html = createPanelHtml(7);
        expect(html).toContain('id="nag-btn-start"');
        expect(html).toContain('id="nag-btn-txt-to-worldbook"');
        expect(html).toContain('<span id="nag-total-floors">7</span>');
    });

    it('四个帮助主题均可解析且保留兜底', () => {
        for (const topic of ['generate', 'export', 'extract', 'advanced']) {
            expect(getHelpContent(topic).title).toBeTruthy();
            expect(getHelpContent(topic).content).toContain('<h4>');
        }
        expect(getHelpContent('missing').title).toBe('帮助');
    });

    it('英文面板与帮助不遗留未翻译的 key', () => {
        setLocale('en-US');
        const html = createPanelHtml(2);
        expect(html).not.toMatch(/novel\.[a-zA-Z]/);
        expect(getHelpContent('advanced').title).toBe('⚙️ Advanced settings');
    });

    it('默认设置覆盖运行和导出字段', () => {
        expect(defaultSettings.maxRetries).toBeGreaterThan(0);
        expect(defaultSettings.panelCollapsed).toMatchObject({ generate: false, advanced: true });
    });
});

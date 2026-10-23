// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createNovelPreview } from '../../src/novel/preview.js';

it('extracts whitelisted tags into the preview container', () => {
    const html = vi.fn();
    const preview = createNovelPreview({
        getSTChat: () => [{ is_user: false, mes: '<content>正文内容</content><thinking>隐藏</thinking>' }],
        getSettings: () => ({
            extractTags: 'content',
            excludeTags: '',
            extractMode: 'tags',
            tagSeparator: '\n',
        }),
        $: () => ({ html }),
    });

    preview.refreshPreview();
    const rendered = html.mock.calls.at(-1)[0];
    expect(rendered).toContain('<div class="nag-preview-text">正文内容</div>');
    expect(rendered).toContain('提取标签 [content]');
});

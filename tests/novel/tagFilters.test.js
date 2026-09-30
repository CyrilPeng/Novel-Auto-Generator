import { expect, it } from 'vitest';
import { parseTagInput, applyTagFilters } from '../../src/novel/tagFilters.js';
it('preserves extraction and exclusion when moved out of the entry module', () => {
    expect(parseTagInput('正文，内容;备注')).toEqual(['正文', '内容', '备注']);
    expect(
        applyTagFilters('<正文>内容<备注>隐藏</备注></正文>', {
            extractMode: 'tags',
            extractTags: ['正文'],
            excludeTags: ['备注'],
        }),
    ).toBe('内容');
});
it('treats regex characters in tag names literally', () => {
    expect(applyTagFilters('<a.b>正确</a.b><axb>错误</axb>', { extractMode: 'tags', extractTags: ['a.b'] })).toBe(
        '正确',
    );
});

import { expect, it } from 'vitest';
import { splitText } from '../../src/worldbook/processing/splitText.js';

it('preserves every source character for chapter-aware and fixed-size splitting', () => {
    const content = '序言\n' + '第一章 开始\n正文。\n\n'.repeat(8000);
    for (const pattern of ['第.+章[^\\n]*', '(?!)', '']) {
        const queue = splitText(content, { chunkSize: 15000, pattern });
        expect(queue.map((chunk) => chunk.content).join('')).toBe(content);
        expect(new Set(queue.map((chunk) => chunk.id)).size).toBe(queue.length);
        expect(queue.every((chunk) => !chunk.processed)).toBe(true);
    }
});

it('rejects invalid split settings without changing the input', () => {
    expect(() => splitText('正文', { chunkSize: 0 })).toThrow();
    expect(() => splitText('正文', { pattern: '[' })).toThrow();
    expect(splitText('', { chunkSize: 100 })).toEqual([]);
});

import { describe, expect, it } from 'vitest';
import { isTokenLimitError } from '../../txtToWorldbook/core/runtime.js';

describe('isTokenLimitError', () => {
    it.each([
        'prompt is too long: 250000 tokens > 128000 maximum',
        'INVALID_ARGUMENT: The input token count (1048577) exceeds the maximum number of tokens allowed.',
        'context length exceeded: 200000 > 128000',
        "This model's maximum context length is 8192 tokens.",
        'Request too large for model',
        'string_above_max_length',
        'Token limit exceeded',
        '上下文长度超出限制',
    ])('recognizes explicit token or context overflow: %s', (message) => {
        expect(isTokenLimitError(message)).toBe(true);
    });

    it.each([
        'INVALID_ARGUMENT',
        'INVALID_ARGUMENT: Unsupported parameter: response_format',
        '400 INVALID_ARGUMENT: API key not valid. Please pass a valid API key.',
        'request contains an invalid argument',
        'content filter triggered',
        'rate limit exceeded',
        '',
    ])('does not classify unrelated failures as token overflow: %s', (message) => {
        expect(isTokenLimitError(message)).toBe(false);
    });

    it('accepts missing values', () => {
        expect(isTokenLimitError(null)).toBe(false);
        expect(isTokenLimitError(undefined)).toBe(false);
    });
});

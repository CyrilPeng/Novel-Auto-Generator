const CONSOLIDATE_ERROR_RESPONSE_PATTERNS = [
    /proxy queue error/i,
    /too many concurrent requests/i,
    /another request in the queue/i,
    /your ip or user token/i,
    /resource[_\s-]?exhausted/i,
    /rate limit(?:ed)?/i,
    /\b429\b/,
    /overloaded/i,
    /temporarily unavailable/i,
    /service unavailable/i,
    /server error/i,
    /bad gateway/i,
    /internal server error/i,
    /请求过于频繁/,
    /请求太频繁/,
    /限流/,
];

const STRICT_CONSOLIDATE_ERROR_RESPONSE_PATTERNS = [
    /proxy queue error/i,
    /too many concurrent requests/i,
    /another request in the queue/i,
    /resource[_\s-]?exhausted/i,
];

export function isConsolidateErrorResponse(responseText) {
    const text = String(responseText || '').trim();
    if (!text) return false;

    const compactText = text.replace(/\s+/g, ' ');
    const patterns =
        compactText.length > 2000 ? STRICT_CONSOLIDATE_ERROR_RESPONSE_PATTERNS : CONSOLIDATE_ERROR_RESPONSE_PATTERNS;
    return patterns.some((pattern) => pattern.test(compactText));
}

function createConsolidateRetryableError() {
    const error = new Error('AI/API 返回排队或限流错误，已保留原条目内容。请稍后重试，或降低并发数后再整理');
    error.retryable = true;
    error.code = 'CONSOLIDATE_RETRYABLE_RESPONSE';
    return error;
}

export function createConsolidationService({
    callAPI,
    getLanguagePrefix,
    parseAIResponse,
    filterResponseContent,
    defaultConsolidatePrompt,
}) {
    function cleanConsolidateResponse(response) {
        let text = filterResponseContent(response || '').trim();
        const fenced = text.match(/```(?:markdown|md|text|txt)?\s*([\s\S]*?)```/i);
        if (fenced) text = fenced[1].trim();

        try {
            const parsed = parseAIResponse(text, { strict: false });
            if (typeof parsed === 'string') return parsed.trim();
            if (parsed && typeof parsed === 'object') {
                const content = parsed['内容'] || parsed.content || parsed.text || parsed.result;
                if (typeof content === 'string') return content.trim();
            }
        } catch {
            // 整理条目允许纯文本输出，JSON解析失败时保留清洗后的文本。
        }

        return text.replace(/^整理后的内容[:：]\s*/i, '').trim();
    }

    async function transformEntry(entry, promptTemplate, signal) {
        if (!entry || !entry['内容']) return;

        const template = promptTemplate && promptTemplate.trim() ? promptTemplate.trim() : defaultConsolidatePrompt;
        const originalContent = entry['内容'];
        const prompt = template.replace('{CONTENT}', originalContent);

        const response = await callAPI(getLanguagePrefix() + prompt, null, { signal });
        const finalContent = cleanConsolidateResponse(response);
        if (!finalContent) {
            throw new Error('AI 返回了空内容，保留原条目内容');
        }
        if (isConsolidateErrorResponse(finalContent)) {
            throw createConsolidateRetryableError();
        }

        const result = structuredClone(entry);
        result['内容'] = finalContent;
        if (Array.isArray(result['关键词'])) {
            result['关键词'] = [...new Set(result['关键词'])];
        }
        return result;
    }

    return { transformEntry };
}

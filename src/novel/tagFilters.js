export function parseTagInput(s) {
    if (!s || typeof s !== 'string') return [];
    return s
        .split(/[,;，；\s\n\r]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

export function escapeTagName(tag) {
    return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractTagContents(text, tags, separator = '\n\n') {
    if (!text || !tags || tags.length === 0) return '';
    const parts = [];
    for (const tag of tags) {
        const t = tag.trim();
        if (!t) continue;
        const escaped = escapeTagName(t);
        const pattern = new RegExp(`<\\s*${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\s*/\\s*${escaped}\\s*>`, 'gi');
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const content = match[1].trim();
            if (content) parts.push(content);
        }
    }
    return parts.join(separator);
}

export function removeTagContents(text, tags) {
    if (!text || !tags || tags.length === 0) return text || '';
    let result = text;
    for (const tag of tags) {
        const t = tag.trim();
        if (!t) continue;
        const escaped = escapeTagName(t);
        const pairPattern = new RegExp(`<\\s*${escaped}(?:\\s[^>]*)?>[\\s\\S]*?<\\s*/\\s*${escaped}\\s*>`, 'gi');
        const selfClosingPattern = new RegExp(`<\\s*${escaped}(?:\\s[^>]*)?/\\s*>`, 'gi');
        result = result.replace(pairPattern, '').replace(selfClosingPattern, '');
    }
    return result.trim();
}

export function applyTagFilters(text, options = {}) {
    const { extractTags = [], excludeTags = [], extractMode = 'all', separator = '\n\n' } = options;
    if (!text) return '';

    let result = text;
    if (extractMode === 'tags' && extractTags.length > 0) {
        result = extractTagContents(result, extractTags, separator);
        if (!result) return '';
    }

    if (excludeTags.length > 0) {
        result = removeTagContents(result, excludeTags);
    }

    return result.trim();
}

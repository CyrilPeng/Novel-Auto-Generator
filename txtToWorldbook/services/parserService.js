export function createParserService(deps = {}) {
    const {
        AppState,
        debugLog,
        getEnabledCategoryNames,
    } = deps;

    function filterResponseContent(text) {
        if (!text) return text;
        const filterTagsStr = AppState.settings.filterResponseTags || 'thinking,/think';
        const filterTags = filterTagsStr.split(',').map((t) => t.trim()).filter((t) => t);
        let cleaned = text;
        for (const tag of filterTags) {
            if (tag.startsWith('/')) {
                const tagName = tag.substring(1);
                cleaned = cleaned.replace(new RegExp(`^[\\s\\S]*?<\\/${tagName}>`, 'gi'), '');
            } else {
                cleaned = cleaned.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
            }
        }
        return cleaned;
    }

    function extractWorldbookDataByRegex(jsonString) {
        const result = {};
        const categories = getEnabledCategoryNames();
        for (const category of categories) {
            const categoryPattern = new RegExp(`"${category}"\\s*:\\s*\\{`, 'g');
            const categoryMatch = categoryPattern.exec(jsonString);
            if (!categoryMatch) continue;
            const startPos = categoryMatch.index + categoryMatch[0].length;
            let braceCount = 1;
            let endPos = startPos;
            while (braceCount > 0 && endPos < jsonString.length) {
                if (jsonString[endPos] === '{') braceCount++;
                if (jsonString[endPos] === '}') braceCount--;
                endPos++;
            }
            if (braceCount !== 0) continue;
            const categoryContent = jsonString.substring(startPos, endPos - 1);
            result[category] = {};
            const entryPattern = /"([^"]+)"\s*:\s*\{/g;
            let entryMatch;
            while ((entryMatch = entryPattern.exec(categoryContent)) !== null) {
                const entryName = entryMatch[1];
                const entryStartPos = entryMatch.index + entryMatch[0].length;
                let entryBraceCount = 1;
                let entryEndPos = entryStartPos;
                while (entryBraceCount > 0 && entryEndPos < categoryContent.length) {
                    if (categoryContent[entryEndPos] === '{') entryBraceCount++;
                    if (categoryContent[entryEndPos] === '}') entryBraceCount--;
                    entryEndPos++;
                }
                if (entryBraceCount !== 0) continue;
                const entryContent = categoryContent.substring(entryStartPos, entryEndPos - 1);
                let keywords = [];
                const keywordsMatch = entryContent.match(/"关键词"\s*:\s*\[([\s\S]*?)\]/);
                if (keywordsMatch) {
                    const keywordStrings = keywordsMatch[1].match(/"([^"]+)"/g);
                    if (keywordStrings) keywords = keywordStrings.map((s) => s.replace(/"/g, ''));
                }
                let content = '';
                const contentMatch = entryContent.match(/"内容"\s*:\s*"/);
                if (contentMatch) {
                    const contentStartPos = contentMatch.index + contentMatch[0].length;
                    let contentEndPos = contentStartPos;
                    let escaped = false;
                    while (contentEndPos < entryContent.length) {
                        const char = entryContent[contentEndPos];
                        if (escaped) {
                            escaped = false;
                        } else if (char === '\\') {
                            escaped = true;
                        } else if (char === '"') {
                            let peekPos = contentEndPos + 1;
                            while (peekPos < entryContent.length && /[\s\r\n]/.test(entryContent[peekPos])) peekPos++;
                            const nextChar = entryContent[peekPos];
                            if (nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === undefined) {
                                break;
                            }
                        }
                        contentEndPos++;
                    }
                    content = entryContent.substring(contentStartPos, contentEndPos);
                    try {
                        content = JSON.parse(`"${content.replace(/(?<!\\)"/g, '\\"')}"`);
                    } catch (e) {
                        content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    }
                }
                if (content || keywords.length > 0) {
                    result[category][entryName] = { '关键词': keywords, '内容': content };
                }
            }
            if (Object.keys(result[category]).length === 0) delete result[category];
        }
        return result;
    }

    function repairJsonUnescapedQuotes(jsonStr) {
        let result = '';
        let inString = false;
        let i = 0;

        while (i < jsonStr.length) {
            const char = jsonStr[i];

            if (inString && char === '\\') {
                result += char;
                if (i + 1 < jsonStr.length) {
                    result += jsonStr[i + 1];
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (char === '"') {
                if (!inString) {
                    inString = true;
                    result += char;
                    i++;
                    continue;
                }

                let j = i + 1;
                while (j < jsonStr.length && /[\s\r\n]/.test(jsonStr[j])) j++;
                const nextChar = jsonStr[j];

                if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === undefined) {
                    inString = false;
                    result += char;
                } else {
                    result += '\\"';
                }
                i++;
                continue;
            }

            result += char;
            i++;
        }

        return result;
    }

    function normalizeJsonLikeText(text) {
        return String(text || '')
            .replace(/^\uFEFF/, '')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/,\s*([}\]])/g, '$1')
            .trim();
    }

    function extractJsonCandidate(text) {
        const cleaned = normalizeJsonLikeText(text);
        const fencedMatch = cleaned.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
        let candidate = fencedMatch ? fencedMatch[1].trim() : cleaned;
        const firstObject = candidate.indexOf('{');
        const firstArray = candidate.indexOf('[');
        let first = -1;
        if (firstObject !== -1 && firstArray !== -1) first = Math.min(firstObject, firstArray);
        else first = Math.max(firstObject, firstArray);

        const lastObject = candidate.lastIndexOf('}');
        const lastArray = candidate.lastIndexOf(']');
        const last = Math.max(lastObject, lastArray);
        if (first !== -1 && last > first) candidate = candidate.substring(first, last + 1);
        return normalizeJsonLikeText(candidate);
    }

    function getMissingJsonClosers(text) {
        const stack = [];
        let inString = false;
        let escaped = false;

        for (const char of text) {
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                stack.push('}');
            } else if (char === '[') {
                stack.push(']');
            } else if ((char === '}' || char === ']') && stack[stack.length - 1] === char) {
                stack.pop();
            }
        }

        return stack.reverse().join('');
    }

    function parseLenientJson(input) {
        const attempts = [];
        const base = extractJsonCandidate(input);
        attempts.push(base);
        attempts.push(repairJsonUnescapedQuotes(base));

        const missingClosers = getMissingJsonClosers(base);
        if (missingClosers) {
            const patched = base + missingClosers;
            attempts.push(patched);
            attempts.push(repairJsonUnescapedQuotes(patched));
        }

        let lastError = null;
        for (const attempt of attempts) {
            if (!attempt) continue;
            try {
                return { ok: true, value: JSON.parse(attempt), candidate: attempt };
            } catch (error) {
                lastError = error;
            }
        }
        return { ok: false, error: lastError, candidate: base };
    }

    function parseAIResponse(response, options = {}) {
        const { strict = true } = options;
        const rawResponse = String(response ?? '');
        debugLog(`解析响应开始, 响应长度=${rawResponse.length}字符, strict=${strict}`);

        const directText = filterResponseContent(rawResponse).trim();
        const tryParse = (input) => {
            try {
                return { ok: true, value: JSON.parse(input) };
            } catch (error) {
                return { ok: false, error };
            }
        };

        const directResult = tryParse(directText);
        if (directResult.ok) return directResult.value;

        let fenced = extractJsonCandidate(directText);

        const fencedResult = tryParse(fenced);
        if (fencedResult.ok) return fencedResult.value;

        const repairedResult = parseLenientJson(fenced);
        if (repairedResult.ok) {
            debugLog(`JSON直接解析失败，已通过${strict ? '严格模式兼容修复' : '宽松修复'}解析成功`);
            return repairedResult.value;
        }

        const extracted = extractWorldbookDataByRegex(fenced);
        if (extracted && typeof extracted === 'object' && Object.keys(extracted).length > 0) {
            debugLog('JSON解析失败，已通过世界书正则兜底提取成功');
            return extracted;
        }

        const summary = directText.slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`JSON解析失败${strict ? '（已尝试自动修复）' : ''}。响应摘要: ${summary}${directText.length > 200 ? '...' : ''}`);
    }

    return {
        filterResponseContent,
        parseAIResponse,
    };
}

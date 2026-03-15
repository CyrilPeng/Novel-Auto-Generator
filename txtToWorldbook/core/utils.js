export function estimateTokenCount(text) {
    if (!text) return 0;
    const str = String(text);
    let tokens = 0;

    const chineseChars = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    tokens += chineseChars * 1.5;

    const englishWords = (str.match(/[a-zA-Z]+/g) || []).length;
    tokens += englishWords;

    const numbers = (str.match(/\d+/g) || []).length;
    tokens += numbers;

    const punctuation = (str.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g) || []).length;
    tokens += punctuation * 0.5;

    return Math.ceil(tokens);
}

export function chineseNumToInt(str) {
    if (/^\d+$/.test(str)) return parseInt(str, 10);

    const numMap = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    const unitMap = { '十': 10, '百': 100, '千': 1000, '万': 10000 };
    let result = 0;
    let section = 0;
    let current = 0;

    for (const ch of str) {
        if (numMap[ch] !== undefined) {
            current = numMap[ch];
        } else if (unitMap[ch] !== undefined) {
            const unit = unitMap[ch];
            if (unit === 10000) {
                section = (current === 0 && section === 0) ? unit : (section + current) * unit;
                result += section;
                section = 0;
            } else {
                section += (current === 0 ? 1 : current) * unit;
            }
            current = 0;
        }
    }

    return result + section + current;
}

export function naturalSortEntryNames(names) {
    return [...names].sort((a, b) => {
        const chapterRegex = /第([零一二三四五六七八九十百千万\d]+)[章回卷节部篇]/;
        const matchA = a.match(chapterRegex);
        const matchB = b.match(chapterRegex);

        if (matchA && matchB) {
            const numA = chineseNumToInt(matchA[1]);
            const numB = chineseNumToInt(matchB[1]);
            if (numA !== numB) return numA - numB;
        }

        return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
    });
}

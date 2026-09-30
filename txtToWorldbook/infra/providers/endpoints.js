/**
 * 构造 OpenAI 兼容 API 的 chat/completions 完整 URL
 *
 * 遵循 OpenAI SDK 标准行为：仅追加 /chat/completions 后缀。
 * 版本号路径由用户自行输入，不再做任何智能识别。
 *
 * 规则：
 *   - endpoint 为空时使用默认值 http://127.0.0.1:5000/v1
 *   - 去除末尾斜杠
 *   - 如 URL 已包含 /chat/completions，则不再追加（信任用户输入的完整 URL）
 *   - 否则追加 /chat/completions
 *   - 缺失协议前缀时补 http://
 *
 * @param {string} [endpoint] 用户输入的 endpoint
 * @returns {string}
 */
export function buildChatUrl(endpoint) {
    const suffix = '/chat/completions';
    let url = endpoint || 'http://127.0.0.1:5000/v1';
    url = url.replace(/\/+$/, '');
    if (!url.includes(suffix)) {
        url += suffix;
    }
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }
    return url;
}

/**
 * 构造 OpenAI 兼容 API 的 /models 完整 URL
 *
 * 遵循 OpenAI SDK 标准行为：
 *   - 若 URL 以 /chat/completions 结尾，替换为 /models
 *   - 若 URL 已以 /models 结尾，不修改
 *   - 否则追加 /models
 *
 * @param {string} endpoint 用户输入的 endpoint（可能带或不带 /chat/completions）
 * @returns {string}
 */
export function buildModelsUrl(endpoint) {
    const chatSuffix = '/chat/completions';
    const modelsSuffix = '/models';
    let url = endpoint.replace(/\/+$/, '');
    if (url.endsWith(chatSuffix)) {
        url = url.slice(0, -chatSuffix.length) + modelsSuffix;
    } else if (!url.endsWith(modelsSuffix)) {
        url += modelsSuffix;
    }
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }
    return url;
}

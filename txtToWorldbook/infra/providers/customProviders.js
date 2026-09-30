import { FatalError, UserError, RetryableError, TokenLimitError, HTTP_RETRYABLE } from '../../core/errors.js';
import { buildChatUrl, buildModelsUrl } from './endpoints.js';
export function buildCustomApiRequest(settings, messages, convertToGeminiContents, options = {}) {
    const provider = settings.customApiProvider;
    const apiKey = settings.customApiKey;
    const endpoint = settings.customApiEndpoint;
    const model = settings.customApiModel;
    const openaiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    let requestUrl = '';
    let requestOptions = {};
    let isStreamRequest = false;

    switch (provider) {
        case 'anthropic': {
            if (!apiKey) throw new UserError('Anthropic API Key 未设置');
            requestUrl = anthropicUrl(endpoint, 'messages');
            requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: model || 'claude-sonnet-4-20250514',
                    messages: openaiMessages.filter((message) => message.role !== 'system'),
                    ...(openaiMessages.some((message) => message.role === 'system')
                        ? {
                              system: openaiMessages
                                  .filter((message) => message.role === 'system')
                                  .map((message) => message.content)
                                  .join('\n\n'),
                          }
                        : {}),
                    temperature: options.temperature ?? 0.3,
                    max_tokens: options.maxOutputTokens ?? 8192,
                }),
            };
            break;
        }

        case 'gemini': {
            if (!apiKey) throw new UserError('Gemini API Key 未设置');
            const geminiModel = model || 'gemini-2.5-flash';
            requestUrl = geminiUrl(endpoint, geminiModel).toString();
            const geminiData = convertToGeminiContents(messages);
            requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                    ...geminiData,
                    generationConfig: {
                        maxOutputTokens: options.maxOutputTokens ?? 65536,
                        temperature: options.temperature ?? 0.3,
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
                    ],
                }),
            };
            break;
        }

        case 'openai-compatible': {
            const openaiEndpoint = buildChatUrl(endpoint);
            const openaiModel = model || 'local-model';

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers.Authorization = `Bearer ${apiKey}`;
            }

            requestUrl = openaiEndpoint;
            requestOptions = {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: openaiModel,
                    messages: openaiMessages,
                    temperature: options.temperature ?? 0.3,
                    max_tokens: options.maxOutputTokens ?? 64000,
                    stream: true,
                }),
            };
            isStreamRequest = true;
            break;
        }

        default:
            throw new UserError(`不支持的API提供商: ${provider}`);
    }

    return { provider, requestUrl, requestOptions, isStreamRequest, model };
}

export function extractCustomApiText(provider, data) {
    if (!data || typeof data !== 'object') throw new RetryableError('API 响应格式不正确', { code: 'INVALID_RESPONSE' });
    if (data.error) {
        const status = Number(data.error.code || data.error.status);
        const permanent = [
            'authentication_error',
            'permission_error',
            'invalid_request_error',
            'not_found_error',
        ].includes(data.error.type);
        const ErrorClass = permanent || (status >= 400 && !HTTP_RETRYABLE.has(status)) ? FatalError : RetryableError;
        throw new ErrorClass('API错误: ' + (data.error.message || '未知错误'), {
            code: 'API_ERROR',
            httpStatus: status >= 400 ? status : undefined,
            provider,
        });
    }
    if (data.promptFeedback?.blockReason)
        throw new FatalError('模型拒绝生成: ' + data.promptFeedback.blockReason, { code: 'GENERATION_BLOCKED' });
    const finish =
        provider === 'gemini'
            ? data.candidates?.[0]?.finishReason
            : provider === 'anthropic'
              ? data.stop_reason
              : data.choices?.[0]?.finish_reason;
    if (['MAX_TOKENS', 'max_tokens', 'length'].includes(finish)) {
        throw new TokenLimitError('Token limit exceeded: 模型输出被截断');
    }
    if (finish && !['STOP', 'end_turn', 'stop_sequence', 'stop'].includes(finish)) {
        throw new FatalError('模型未正常完成: ' + finish, { code: 'INVALID_FINISH_REASON' });
    }
    if (provider === 'gemini') {
        return (data.candidates?.[0]?.content?.parts || [])
            .filter((part) => !part.thought && typeof part.text === 'string')
            .map((part) => part.text)
            .join('');
    }
    if (provider === 'anthropic') {
        return (data.content || [])
            .filter((part) => (!part.type || part.type === 'text') && typeof part.text === 'string')
            .map((part) => part.text)
            .join('');
    }
    return data.choices?.[0]?.message?.content || '';
}

function endpointUrl(endpoint, fallback) {
    let input = endpoint?.trim() || fallback;
    if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol)) throw new UserError('API Endpoint 必须是 HTTP(S) 地址');
    url.hash = '';
    return url;
}

function anthropicUrl(endpoint, resource) {
    const url = endpointUrl(endpoint, 'https://api.anthropic.com/v1');
    let path = url.pathname.replace(/\/+$/, '').replace(/\/(messages|models)$/, '');
    if (!path) path = '/v1';
    url.pathname = path + '/' + resource;
    return url.toString();
}

function geminiUrl(endpoint, model) {
    const url = endpointUrl(endpoint, 'https://generativelanguage.googleapis.com/v1beta/models');
    let path = url.pathname
        .replace(/\/+$/, '')
        .replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/, '/models');
    if (!path) path = '/v1beta/models';
    else if (!path.endsWith('/models')) path += '/models';
    if (model) path += '/' + encodeURIComponent(model.replace(/^models\//, '')) + ':generateContent';
    url.pathname = path;
    url.searchParams.delete('key');
    return url;
}

export function buildModelsRequest(settings) {
    const provider = settings.customApiProvider;
    const apiKey = settings.customApiKey;
    const endpoint = settings.customApiEndpoint;
    if (provider === 'anthropic') {
        if (!apiKey) throw new UserError('Anthropic API Key 未设置');
        return {
            url: anthropicUrl(endpoint, 'models'),
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
        };
    }
    if (provider === 'gemini') {
        if (!apiKey) throw new UserError('Gemini API Key 未设置');
        return { url: geminiUrl(endpoint).toString(), headers: { 'x-goog-api-key': apiKey } };
    }
    if (provider !== 'openai-compatible') throw new UserError('此供应商不支持获取模型列表');
    return {
        url: buildModelsUrl(endpoint || 'http://127.0.0.1:5000/v1'),
        headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
    };
}

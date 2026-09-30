import { FatalError, RetryableError, TokenLimitError, HTTP_RETRYABLE } from '../core/errors.js';

/** OpenAI-compatible SSE events; transport owns timeouts and byte limits. */
export function createSSEParser({ onChunk, allowEOF = false } = {}) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '';
    let data = [];
    let event = '';
    let content = '';
    let complete = false;

    const dispatch = () => {
        const payload = data.join('\n');
        if (payload.length > 1024 * 1024) {
            throw new FatalError('流式事件过大', { code: 'RESPONSE_TOO_LARGE' });
        }
        const eventName = event;
        data = [];
        event = '';
        if (!payload && eventName !== 'error') return;
        if (payload === '[DONE]') {
            complete = true;
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(payload);
        } catch (cause) {
            throw new RetryableError('流式事件不是有效 JSON', { code: 'INVALID_STREAM', cause });
        }
        if (eventName === 'error' || parsed.error) {
            const status = Number(parsed.error?.status ?? parsed.status ?? parsed.error?.code);
            const ErrorClass = status >= 400 && !HTTP_RETRYABLE.has(status) ? FatalError : RetryableError;
            throw new ErrorClass(`API流式错误: ${parsed.error?.message || parsed.message || '未知错误'}`, {
                code: 'STREAM_API_ERROR',
                httpStatus: status || undefined,
            });
        }
        const choice = parsed.choices?.find((item) => item.index === 0) ?? parsed.choices?.[0];
        if (!choice) return; // Usage-only records are allowed.
        const delta = choice.delta?.content;
        if (typeof delta === 'string' && delta) {
            content += delta;
            onChunk?.(delta, content, parsed);
        }
        if (choice.finish_reason === 'length') throw new TokenLimitError('Token limit exceeded: 模型输出被截断');
        if (choice.finish_reason === 'content_filter')
            throw new FatalError('模型返回内容被过滤', { code: 'CONTENT_FILTER' });
        if (choice.finish_reason && choice.finish_reason !== 'stop') {
            throw new RetryableError(`不支持的模型结束原因: ${choice.finish_reason}`, { code: 'INVALID_RESPONSE' });
        }
        if (choice.finish_reason === 'stop') complete = true;
    };

    const consumeLine = (line) => {
        if (!line) {
            dispatch();
            return;
        }
        if (line.startsWith(':')) return;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') data.push(value);
        if (field === 'event') event = value;
    };

    const drain = (final) => {
        let match;
        while ((match = /\r\n|\r|\n/.exec(buffer))) {
            if (!final && match[0] === '\r' && match.index === buffer.length - 1) break;
            const line = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            consumeLine(line);
            if (complete) {
                buffer = '';
                return;
            }
        }
        if (buffer.length > 1024 * 1024 || data.reduce((sum, item) => sum + item.length, 0) > 1024 * 1024) {
            throw new FatalError('流式事件过大', { code: 'RESPONSE_TOO_LARGE' });
        }
    };

    return {
        get complete() {
            return complete;
        },
        push(bytes) {
            buffer += decoder.decode(bytes, { stream: true });
            drain(false);
        },
        finish() {
            if (!complete) {
                buffer += decoder.decode();
                drain(true);
                if (buffer) consumeLine(buffer);
                if (data.length) dispatch();
            }
            if (!complete && !allowEOF)
                throw new RetryableError('流式响应提前结束，缺少完成标记', { code: 'INCOMPLETE_STREAM' });
            if (!content.trim()) throw new RetryableError('模型返回空内容', { code: 'EMPTY_RESPONSE' });
            return content;
        },
    };
}

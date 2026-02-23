/**
 * API基类
 * 定义所有API实现的通用接口
 */
export class BaseAPI {
    /**
     * @param {Object} config - API配置
     * @param {number} config.timeout - 超时时间(毫秒)
     */
    constructor(config = {}) {
        this.config = config;
        this.timeout = config.timeout || 120000;
    }

    /**
     * 生成文本(非流式)
     * 子类必须实现此方法
     * 
     * @param {Array<Object>} messages - 消息数组
     * @param {string} messages[].role - 角色(system/user/assistant)
     * @param {string} messages[].content - 消息内容
     * @returns {Promise<string>} 生成的文本
     */
    async generate(messages) {
        throw new Error('子类必须实现generate方法');
    }

    /**
     * 流式生成文本
     * 子类必须实现此方法
     * 
     * @param {Array<Object>} messages - 消息数组
     * @param {Function} onChunk - 接收到数据块时的回调
     * @returns {Promise<string>} 完整生成的文本
     */
    async streamGenerate(messages, onChunk) {
        throw new Error('子类必须实现streamGenerate方法');
    }

    /**
     * 创建超时Promise
     * @returns {Promise<never>} 超时后reject的Promise
     */
    createTimeoutPromise() {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`请求超时(${this.timeout}ms)`));
            }, this.timeout);
        });
    }

    /**
     * 统一错误处理
     * @param {Error} error - 错误对象
     * @returns {Error} 处理后的错误
     */
    handleError(error) {
        console.error(`[API错误] ${error.message}`);
        return error;
    }

    /**
     * 检查是否为Token限制错误
     * @param {string} errorMsg - 错误信息
     * @returns {boolean} 是否为Token限制错误
     */
    isTokenLimitError(errorMsg) {
        if (!errorMsg) return false;
        const checkStr = String(errorMsg).substring(0, 500);
        const patterns = [
            /prompt is too long/i,
            /tokens? >\s*\d+\s*maximum/i,
            /max_prompt_tokens/i,
            /tokens?.*exceeded/i,
            /context.?length.*exceeded/i,
            /exceeded.*(?:token|limit|context|maximum)/i,
            /input tokens/i,
            /context_length/i,
            /too many tokens/i,
            /token limit/i,
            /maximum.*tokens/i,
            /20015.*limit/i,
            /INVALID_ARGUMENT/i
        ];
        return patterns.some(pattern => pattern.test(checkStr));
    }

    /**
     * 过滤响应内容中的标签
     * 移除thinking等内部思考标签
     * 
     * @param {string} text - 原始响应文本
     * @param {string} filterTags - 要过滤的标签列表(逗号分隔)
     * @returns {string} 过滤后的文本
     */
    filterResponseTags(text, filterTags = 'thinking,/think') {
        if (!text) return text;
        const tags = filterTags.split(',').map(t => t.trim()).filter(t => t);
        let cleaned = text;
        
        for (const tag of tags) {
            if (tag.startsWith('/')) {
                // 特殊格式：移除从开始到闭合标签的所有内容
                const tagName = tag.substring(1);
                cleaned = cleaned.replace(new RegExp(`^[\\s\\S]*?<\\/${tagName}>`, 'gi'), '');
            } else {
                // 正常格式：移除标签及其内容
                cleaned = cleaned.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
            }
        }
        
        return cleaned;
    }
}

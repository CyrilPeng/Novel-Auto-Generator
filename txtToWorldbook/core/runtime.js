import { estimateTokenCount } from './utils.js';

/**
 * 检测是否为 Token 限制错误
 * @param {*} errorMsg
 * @returns {boolean}
 */
export function isTokenLimitError(errorMsg) {
    if (!errorMsg) return false;
    const checkStr = String(errorMsg).substring(0, 800);
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
        /request too large/i,
        /payload too large/i,
        /content.?length.?limit/i,
        /max.?context/i,
        /model.?(?:maximum|max).?(?:context|length)/i,
        /reduce.?(?:the|your).?(?:prompt|input)/i,
        /too.?(?:long|large).?(?:for|to)/i,
        /string_above_max_length/i,
        /over.?(?:the|token).?limit/i,
        /input token count/i,
        /INVALID_ARGUMENT.*(?:token|context|too (?:long|large)|maximum|limit)/i,
        /上下文.{0,10}(?:超出|超过|上限)/,
    ];
    return patterns.some((pattern) => pattern.test(checkStr));
}

export class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
        this.aborted = false;
    }

    async acquire() {
        if (this.aborted) throw new Error('ABORTED');
        if (this.current < this.max) {
            this.current++;
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
        });
    }

    release() {
        this.current--;
        if (this.queue.length > 0 && !this.aborted) {
            this.current++;
            const next = this.queue.shift();
            next.resolve();
        }
    }

    abort() {
        this.aborted = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            item.reject(new Error('ABORTED'));
        }
    }

    reset() {
        this.aborted = false;
        this.current = 0;
        this.queue = [];
    }
}

export const PerfUtils = {
    debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    throttle(fn, limit) {
        let inThrottle = false;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
    },

    batchUpdate(container, elements) {
        const fragment = document.createDocumentFragment();
        elements.forEach((el) => fragment.appendChild(el));
        container.innerHTML = '';
        container.appendChild(fragment);
    },

    smartUpdate(container, newHtml) {
        if (container.innerHTML !== newHtml) {
            container.innerHTML = newHtml;
            return true;
        }
        return false;
    },
};

export const TokenCache = {
    cache: new Map(),
    maxSize: 1000,

    hash(str) {
        let hash = 0;
        const len = str.length;
        if (len === 0) return '0';
        const sample =
            len < 500
                ? str
                : str.slice(0, 100) + str.slice(Math.floor(len / 2), Math.floor(len / 2) + 100) + str.slice(-100);
        for (let i = 0; i < sample.length; i++) {
            hash = (hash << 5) - hash + sample.charCodeAt(i);
            hash &= hash;
        }
        return hash.toString(16) + '-' + len;
    },

    get(text) {
        if (!text || typeof text !== 'string') return 0;
        const key = this.hash(text);
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        const count = estimateTokenCount(text);
        if (this.cache.size >= this.maxSize) {
            const keys = Array.from(this.cache.keys()).slice(0, this.maxSize / 2);
            keys.forEach((k) => this.cache.delete(k));
        }
        this.cache.set(key, count);
        return count;
    },

    clear() {
        this.cache.clear();
    },
};

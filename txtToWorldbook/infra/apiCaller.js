import { Logger } from '../core/logger.js';

const APICaller = {
	/**
	 * fetchWithTimeout
	 * 
	 * @param {*} url
	 * @param {*} options
	 * @param {*} timeout
	 * @returns {Promise<any>}
	 */
	async fetchWithTimeout(url, options = {}, timeout = 120000) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === 'AbortError') {
				throw new Error('请求超时');
			}
			throw error;
		}
	},

	async request(url, options = {}) {
		const { timeout, ...fetchOptions } = options;
		const response = await this.fetchWithTimeout(url, fetchOptions, timeout || 120000);
		if (!response.ok) {
			let text = '';
			try {
				text = await response.text();
			} catch (e) { }
			const error = new Error(`API请求失败: ${response.status} ${response.statusText}${text ? ` - ${text.substring(0, 200)}` : ''}`);
			error.status = response.status;
			error.responseText = text;
			error.response = response;
			throw error;
		}
		return response;
	},

	/**
	 * parseResponse
	 * 
	 * @param {*} response
	 * @returns {Promise<any>}
	 */
	async parseResponse(response) {
		return response.text();
	},

	/**
	 * extractJSON
	 * 
	 * @param {*} text
	 * @returns {*}
	 */
	extractJSON(text) {
		try { return JSON.parse(text); } catch (e) { }

		const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonBlockMatch) {
			try { return JSON.parse(jsonBlockMatch[1].trim()); } catch (e) { }
		}

		const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
		if (jsonObjectMatch) {
			try { return JSON.parse(jsonObjectMatch[0]); } catch (e) { }
		}

		throw new Error('无法从响应中提取有效的JSON');
	},

	async requestJSON(url, options = {}) {
		const response = await this.request(url, options);
		const text = await this.parseResponse(response);
		return this.extractJSON(text);
	},

	async requestText(url, options = {}) {
		const response = await this.request(url, options);
		return this.parseResponse(response);
	},

	async parseSSEStream(response, config = {}) {
		const { onChunk = null, inactivityTimeout = 120000 } = config;
		if (!response.body) {
			throw new Error('流式响应不可用');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = '';
		let buffer = '';
		let inactivityTimer = null;

		const resetInactivityTimer = () => {
			if (inactivityTimer) clearTimeout(inactivityTimer);
			inactivityTimer = setTimeout(() => {
				try { reader.cancel(); } catch (e) { }
			}, inactivityTimeout);
		};

		const consumeLine = (line) => {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) return;
			const dataStr = trimmed.slice(6).trim();
			if (dataStr === '[DONE]') return;
			try {
				const parsed = JSON.parse(dataStr);
				const delta = parsed.choices?.[0]?.delta?.content || '';
				if (delta) {
					fullContent += delta;
					if (typeof onChunk === 'function') onChunk(delta, fullContent, parsed);
				}
			} catch (e) { }
		};

		resetInactivityTimer();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				resetInactivityTimer();
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';
				for (const line of lines) {
					consumeLine(line);
				}
			}
		} finally {
			if (inactivityTimer) clearTimeout(inactivityTimer);
		}

		if (buffer.trim()) {
			consumeLine(buffer);
		}

		return fullContent;
	},

	async requestStream(url, options = {}) {
		const { onChunk = null, inactivityTimeout = 120000, ...requestOptions } = options;
		const response = await this.request(url, requestOptions);
		return this.parseSSEStream(response, { onChunk, inactivityTimeout });
	},

	isRateLimitError(error) {
		const message = String(error?.responseText || error?.message || '').toLowerCase();
		return error?.status === 429 || message.includes('resource_exhausted') || message.includes('rate limit');
	},

	async withRetry(task, config = {}) {
		const { retries = 0, onRetry = null, shouldRetry = null } = config;
		let attempt = 0;
		while (true) {
			try {
				return await task(attempt);
			} catch (error) {
				const canRetry = attempt < retries && (typeof shouldRetry === 'function' ? shouldRetry(error, attempt) : this.isRateLimitError(error));
				if (!canRetry) throw error;
				const delay = Math.pow(2, attempt) * 1000;
				if (typeof onRetry === 'function') {
					await onRetry(error, attempt + 1, delay);
				}
				await new Promise(resolve => setTimeout(resolve, delay));
				attempt += 1;
			}
		}
	},

	/**
	 * handleError
	 * 
	 * @param {*} error
	 * @param {*} context
	 * @returns {*}
	 */
	handleError(error, context = '') {
		const prefix = context ? `[${context}] ` : '';
		Logger.error('APICaller', prefix + error.message);

		if (error.message.includes('超时')) {
			return { type: 'timeout', message: '请求超时，请稍后重试' };
		}
		if (error.message.includes('网络') || error.message.includes('fetch')) {
			return { type: 'network', message: '网络错误，请检查连接' };
		}
		if (error.message.includes('API Key')) {
			return { type: 'auth', message: 'API Key 无效或已过期' };
		}

		return { type: 'unknown', message: error.message };
	},

	/**
	 * getJSON
	 * 
	 * @param {*} url
	 * @param {*} options
	 * @returns {Promise<any>}
	 */
	async getJSON(url, options = {}) {
		return this.requestJSON(url, options);
	},

	/**
	 * getText
	 * 
	 * @param {*} url
	 * @param {*} options
	 * @returns {Promise<any>}
	 */
	async getText(url, options = {}) {
		return this.requestText(url, options);
	}
};

export { APICaller };

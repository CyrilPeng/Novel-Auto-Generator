/**
* TXT转世界书模块
*
* @file txtToWorldbook/main.js
* @version 1.5.0
* @author Novel-Auto-Generator
* @license MIT
*
* @description
* 将TXT小说文件转换为SillyTavern世界书格式
 *
 * @features
 * - 多API支持（酒馆/Gemini/DeepSeek/OpenAI兼容）
 * - 并行处理（独立模式/分批模式）
 * - 断点续传
 * - 历史回滚（Roll历史选择器）
 * - 条目合并与别名合并
 * - 自定义分类配置
 * - 默认世界书条目
 * - 条目配置（位置/深度/顺序/递归）
 * - Token计数缓存优化
 * - 事件委托性能优化
 *
 * @structure
 * - 第一区：配置与常量 (~200行)
 * - 第二区：应用状态 (~100行)
 * - 第三区：工具函数 (~500行) - 含PerfUtils/TokenCache/EventDelegate/Logger/ErrorHandler
 * - 第四区：数据持久层 (~400行)
 * - 第五区：API通信层 (~400行)
 * - 第六区：核心业务逻辑 (~1500行)
 * - 第七区：UI组件层 (~4000行)
 * - 第八区：初始化与导出 (~200行)
 *
 * @example
 * // 基本使用
 * window.TxtToWorldbook.open();
 *
 * // 获取世界书数据
 * const worldbook = window.TxtToWorldbook.getWorldbook();
 *
 * @typedef {Object} MemoryItem
 * @property {string} title - 记忆标题
 * @property {string} content - 记忆内容
 * @property {boolean} processed - 是否已处理
 * @property {boolean} failed - 是否失败
 * @property {boolean} processing - 是否正在处理
 * @property {string} [failedError] - 失败原因
 * @property {Object} [result] - 处理结果
 *
 * @typedef {Object} WorldbookEntry
 * @property {string[]} 关键词 - 关键词数组
 * @property {string} 内容 - 条目内容
 * @property {string} [comment] - 备注信息
 * @property {boolean} [enabled] - 是否启用
 * @property {number} [position] - 位置
 * @property {number} [depth] - 深度
 * @property {boolean} [recursive] - 是否递归
 *
 * @typedef {Object} CategoryConfig
 * @property {string} name - 分类名称
 * @property {string} description - 分类描述
 * @property {string} prompt - 分类提示词
 * @property {boolean} enabled - 是否启用
 * @property {string} color - 显示颜色
 */

import {
    DEFAULT_CHAPTER_REGEX,
    DEFAULT_CATEGORY_LIGHT,
    DEFAULT_PLOT_OUTLINE_CONFIG,
    DEFAULT_PARALLEL_CONFIG,
    defaultSettings
} from './core/constants.js';
import { Logger } from './core/logger.js';
import { estimateTokenCount, naturalSortEntryNames } from './core/utils.js';
import { ModalFactory } from './infra/modalFactory.js';
import { APICaller } from './infra/apiCaller.js';
import { createWorldbookService } from './services/worldbookService.js';
import { createMergeService } from './services/mergeService.js';
import { createProcessingService } from './services/processingService.js';
import { createRerollService } from './services/rerollService.js';
import { createAppContext } from './app/createApp.js';
import { createPublicApi } from './app/publicApi.js';
import {
    buildAliasCategorySelectModal,
    buildAliasGroupsListHtml,
    buildAliasPairResultsHtml,
    buildAliasMergePlanHtml,
} from './ui/mergeModals.js';
import {
    bindActionEvents as bindActionEventsUI,
    bindCollapsePanelEvents as bindCollapsePanelEventsUI,
    bindExportEvents as bindExportEventsUI,
    bindFileEvents as bindFileEventsUI,
    bindMessageChainEvents as bindMessageChainEventsUI,
    bindModalBasicEvents as bindModalBasicEventsUI,
    bindPromptEvents as bindPromptEventsUI,
    bindSettingEvents as bindSettingEventsUI,
    bindStreamEvents as bindStreamEventsUI,
} from './ui/eventBindings.js';
import { createWorldbookView } from './ui/worldbookView.js';
import {
    createListRenderer,
    escapeHtmlForDisplay,
    escapeAttrForDisplay,
} from './ui/renderer.js';
import { createRerollModals } from './ui/rerollModals.js';
import {
    buildModalHtml,
    hydrateSettingsFromState,
} from './ui/settingsPanel.js';

(function () {
'use strict';

// ============================================================
// 第一区：配置与常量
// ============================================================
// 第一区：配置与常量
// ============================================================
// - 版本信息
// - 默认配置对象
// - 常量定义
// - Semaphore 类

// ========== 默认世界书分类系统 ==========
const DEFAULT_WORLDBOOK_CATEGORIES = [
{
            name: "角色",
            enabled: true,
            isBuiltin: true,
            entryExample: "角色真实姓名",
            keywordsExample: ["真实姓名", "称呼1", "称呼2", "绰号"],
            contentGuide: "基于原文的角色描述，包含但不限于**名称**:（必须要）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        },
        {
            name: "地点",
            enabled: true,
            isBuiltin: true,
            entryExample: "地点真实名称",
            keywordsExample: ["地点名", "别称", "俗称"],
            contentGuide: "基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        },
        {
            name: "组织",
            enabled: true,
            isBuiltin: true,
            entryExample: "组织真实名称",
            keywordsExample: ["组织名", "简称", "代号"],
            contentGuide: "基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        },
        {
            name: "道具",
            enabled: false,
            isBuiltin: false,
            entryExample: "道具名称",
            keywordsExample: ["道具名", "别名"],
            contentGuide: "基于原文的道具描述，包含但不限于**名称**:、**类型**:、**功能**:、**来源**:、**持有者**:等",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        },
        {
            name: "玩法",
            enabled: false,
            isBuiltin: false,
            entryExample: "玩法名称",
            keywordsExample: ["玩法名", "规则名"],
            contentGuide: "基于原文的玩法/规则描述，包含但不限于**名称**:、**规则说明**:、**参与条件**:、**奖惩机制**:等",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        },
        {
            name: "章节剧情",
            enabled: false,
            isBuiltin: false,
            entryExample: "第X章",
            keywordsExample: ["章节名", "章节号"],
            contentGuide: "该章节的剧情概要，包含但不限于**章节标题**:、**主要事件**:、**出场角色**:、**关键转折**:、**伏笔线索**:等",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        },
        {
            name: "角色内心",
            enabled: false,
            isBuiltin: false,
            entryExample: "角色名-内心世界",
            keywordsExample: ["角色名", "内心", "心理"],
            contentGuide: "角色的内心想法和心理活动，包含但不限于**原文内容**:、**内心独白**:、**情感变化**:、**动机分析**:、**心理矛盾**:等",
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        }
];

// ========== 默认提示词模板 ==========
const defaultWorldbookPrompt = `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **只输出以下指定分类：{ENABLED_CATEGORY_NAMES}**，禁止输出其他未指定的分类
3. **关键词必须是文中实际出现的名称**，用逗号分隔
4. **内容必须基于原文描述**，不要添加原文没有的信息
5. **内容使用markdown格式**，可以层层嵌套或使用序号标题

## 📤 输出格式
请生成标准JSON格式，确保能被JavaScript正确解析：

\`\`\`json
{DYNAMIC_JSON_TEMPLATE}
\`\`\`

## 重要提醒
- 直接输出JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁
- **严格只输出上述指定的分类，不要自作主张添加其他分类**`;

const defaultPlotPrompt = `"剧情大纲": {
    "主线剧情": {
        "关键词": ["主线", "核心剧情", "故事线"],
        "内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响\\n3. **转折点3**: 描述和影响\\n\\n## 伏笔与暗线\\n**已揭示的伏笔**: 已经揭晓的铺垫\\n**未解之谜**: 尚未解答的疑问\\n**暗线推测**: 可能的隐藏剧情线"
    },
    "支线剧情": {
        "关键词": ["支线", "副线", "分支剧情"],
        "内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n**支线3标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
    }
}`;

const defaultStylePrompt = `"文风配置": {
    "作品文风": {
        "关键词": ["文风", "写作风格", "叙事特点"],
        "内容": "## 叙事视角\\n**视角类型**: 第一人称/第三人称/全知视角\\n**叙述者特点**: 叙述者的语气和态度\\n\\n## 语言风格\\n**用词特点**: 华丽/简洁/口语化/书面化\\n**句式特点**: 长句/短句/对话多/描写多\\n**修辞手法**: 常用的修辞手法\\n\\n## 情感基调\\n**整体氛围**: 轻松/沉重/悬疑/浪漫\\n**情感表达**: 直接/含蓄/细腻/粗犷"
    }
}`;

const defaultMergePrompt = `你是世界书条目合并专家。请将以下两个相同名称的世界书条目合并为一个，保留所有重要信息，去除重复内容。

## 合并规则
1. 关键词：合并两者的关键词，去重
2. 内容：整合两者的描述，保留所有独特信息，用markdown格式组织
3. 如有矛盾信息，保留更详细/更新的版本
4. 输出格式必须是JSON

## 条目A
{ENTRY_A}

## 条目B
{ENTRY_B}

请直接输出合并后的JSON格式条目：
{"关键词": [...], "内容": "..."}`;

const defaultConsolidatePrompt = `你是世界书条目整理专家。请整理以下条目内容，去除重复信息，合并相似描述，保留所有独特细节。

## 整理规则
1. 合并重复的属性描述（如多个"性别"只保留一个）
2. 整合相似的段落，去除冗余
3. 保留所有独特信息，不要丢失细节
4. 使用清晰的markdown格式输出
5. 关键信息放在前面

## 原始内容
{CONTENT}

请直接输出整理后的内容（纯文本，不要JSON包装）：`;

// ========== 信号量类（用于并发控制）==========
class Semaphore {
    constructor(max) {
        this.max = max;
        this.current = 0;
        this.queue = [];
        this.aborted = false;
    }

    /**
     * acquire
     * 
     * @returns {Promise<any>}
     */
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

    /**
     * release
     * 
     * @returns {*}
     */
    release() {
        this.current--;
        if (this.queue.length > 0 && !this.aborted) {
            this.current++;
            const next = this.queue.shift();
            next.resolve();
        }
    }

    /**
     * abort
     * 
     * @returns {*}
     */
    abort() {
        this.aborted = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            item.reject(new Error('ABORTED'));
        }
    }

    /**
     * reset
     * 
     * @returns {*}
     */
    reset() {
        this.aborted = false;
        this.current = 0;
        this.queue = [];
    }
}

// ============================================================
// 第二区：应用状态
// ============================================================
// - AppState 统一状态对象
// - 兼容层 getter/setter
// - 运行时状态

// ========== AppState 统一状态对象 ==========
const { AppState, MemoryHistoryDB } = createAppContext({
    defaultCategoryLight: DEFAULT_CATEGORY_LIGHT,
    defaultPlotOutlineConfig: DEFAULT_PLOT_OUTLINE_CONFIG,
    defaultParallelConfig: DEFAULT_PARALLEL_CONFIG,
    defaultChapterRegex: DEFAULT_CHAPTER_REGEX,
    defaultWorldbookCategories: DEFAULT_WORLDBOOK_CATEGORIES,
    defaultSettings,
    Logger,
});

// ============================================================
// 第三区：工具函数
// ============================================================
// - Token 计数
// - 中文数字转换
// - 文件哈希
// - 编码检测
// - JSON 修复

/**
 * getEntryTotalTokens
 * 
 * @param {*} entry
 * @returns {*}
 */
function getEntryTotalTokens(entry) {
if (!entry || typeof entry !== 'object') return 0;
let total = 0;

if (entry['关键词']) {
const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
total += TokenCache.get(keywords);
}

if (entry['内容']) {
total += TokenCache.get(entry['内容']);
}

return total;
}

// ============================================================
// 第三区-C：自然排序与中文数字处理
// ============================================================

// naturalSortEntryNames / chineseNumToInt 已抽离到 core/utils.js

// ============================================================
// 第三区-A：性能优化工具
// ============================================================
// - 防抖节流
// - DOM批量更新
// - Token计数缓存
// - 事件委托管理

// ========== 防抖与节流 ==========
const PerfUtils = {
	/**
	 * 防抖函数 - 延迟执行，重复调用会重置计时器
	 * @param {Function} fn - 要执行的函数
	 * @param {number} delay - 延迟时间(毫秒)
	 * @returns {Function} 防抖后的函数
	 */
	debounce(fn, delay) {
		let timer = null;
		return function(...args) {
			clearTimeout(timer);
			timer = setTimeout(() => fn.apply(this, args), delay);
		};
	},

	/**
	 * 节流函数 - 限制执行频率
	 * @param {Function} fn - 要执行的函数
	 * @param {number} limit - 时间间隔(毫秒)
	 * @returns {Function} 节流后的函数
	 */
	throttle(fn, limit) {
		let inThrottle = false;
		return function(...args) {
			if (!inThrottle) {
				fn.apply(this, args);
				inThrottle = true;
				setTimeout(() => inThrottle = false, limit);
			}
		};
	},

	/**
	 * 批量更新DOM - 使用DocumentFragment减少重排
	 * @param {HTMLElement} container - 容器元素
	 * @param {Array<HTMLElement>} elements - 要添加的元素数组
	 */
	batchUpdate(container, elements) {
		const fragment = document.createDocumentFragment();
		elements.forEach(el => fragment.appendChild(el));
		container.innerHTML = '';
		container.appendChild(fragment);
	},

	/**
	 * 批量设置HTML - 比较后只在变化时更新
	 * @param {HTMLElement} container - 容器元素
	 * @param {string} newHtml - 新的HTML内容
	 * @returns {boolean} 是否更新了
	 */
	smartUpdate(container, newHtml) {
		if (container.innerHTML !== newHtml) {
			container.innerHTML = newHtml;
			return true;
		}
		return false;
	}
};

// ========== Token计数缓存 ==========
const TokenCache = {
	cache: new Map(),
	maxSize: 1000,

	/**
	 * 简单哈希函数
	 * @param {string} str - 输入字符串
	 * @returns {string} 哈希值
	 */
	hash(str) {
		let hash = 0;
		const len = str.length;
		if (len === 0) return '0';
		// 采样策略：长字符串只采样关键部分
		const sample = len < 500 ? str : str.slice(0, 100) + str.slice(Math.floor(len/2), Math.floor(len/2)+100) + str.slice(-100);
		for (let i = 0; i < sample.length; i++) {
			hash = ((hash << 5) - hash) + sample.charCodeAt(i);
			hash = hash & hash;
		}
		return hash.toString(16) + '-' + len;
	},

	/**
	 * 获取Token计数（带缓存）
	 * @param {string} text - 输入文本
	 * @returns {number} Token计数
	 */
	get(text) {
		if (!text || typeof text !== 'string') return 0;
		const key = this.hash(text);
		if (this.cache.has(key)) {
			return this.cache.get(key);
		}
		const count = estimateTokenCount(text);
		// LRU策略：超过最大容量时清除一半
		if (this.cache.size >= this.maxSize) {
			const keys = Array.from(this.cache.keys()).slice(0, this.maxSize / 2);
			keys.forEach(k => this.cache.delete(k));
		}
		this.cache.set(key, count);
		return count;
	},

	/**
	 * 清除缓存
	 */
	clear() {
		this.cache.clear();
	}
};

// ========== 事件委托管理器 ==========
const EventDelegate = {
	/**
	 * 创建委托处理器
	 * @param {HTMLElement} container - 容器元素
	 * @param {string} selector - 目标选择器
	 * @param {string} eventType - 事件类型
	 * @param {Function} handler - 处理函数
	 * @returns {Function} 清理函数
	 */
	on(container, selector, eventType, handler) {
		/**
		 * delegateHandler
		 * 
		 * @param {*} e
		 * @returns {*}
		 */
		const delegateHandler = (e) => {
			const target = e.target.closest(selector);
			if (target && container.contains(target)) {
				handler.call(target, e, target);
			}
		};
		container.addEventListener(eventType, delegateHandler);
		return () => container.removeEventListener(eventType, delegateHandler);
	},

	/**
	 * 批量事件委托
	 * @param {HTMLElement} container - 容器元素
	 * @param {Object} config - 配置对象 { selector: { eventType: handler } }
	 */
	batchOn(container, config) {
		const cleanups = [];
		for (const [selector, events] of Object.entries(config)) {
			for (const [eventType, handler] of Object.entries(events)) {
cleanups.push(this.on(container, selector, eventType, handler));
	}
	}
	return () => cleanups.forEach(fn => fn());
}
};

// ============================================================
// 第三区-A2：错误处理与日志
// ============================================================
// - ErrorHandler: 统一错误处理
// - Logger: 日志系统

// Logger 已抽离到 core/logger.js

// ========== ErrorHandler 错误处理 ==========
const ErrorHandler = {
	/**
	 * 统一错误处理
	 * @param {Error} error - 错误对象
	 * @param {string} context - 上下文
	 * @returns {{handled: boolean, message: string}}
	 */
	handle(error, context = '') {
		Logger.error(context || 'App', error.message || error);

		// 特殊错误处理
		if (error.message === 'ABORTED') {
			return { handled: true, message: '操作已取消' };
		}

		if (error.message?.startsWith('TOKEN_LIMIT:')) {
			return { handled: true, message: 'Token超限', isTokenLimit: true };
		}

		// API 错误
		if (error.status || error.message?.includes('API') || error.message?.includes('请求')) {
			return this.handleAPIError(error);
		}

		// 网络错误
		if (error.message?.includes('network') || error.message?.includes('网络') || error.message?.includes('fetch')) {
			this.showUserError('网络连接失败，请检查网络设置');
			return { handled: true, message: '网络错误' };
		}

		// 通用错误
		this.showUserError(error.message || '未知错误');
		return { handled: false, message: error.message || '未知错误' };
	},

	/**
	 * 处理API错误
	 * @param {Error} error - 错误对象
	 */
	handleAPIError(error) {
		const messages = {
			401: 'API Key 无效',
			403: '没有权限访问此API',
			404: 'API端点不存在',
			429: '请求过于频繁，请稍后重试',
			500: '服务器内部错误',
			502: '网关错误',
			503: '服务暂时不可用',
			504: '网关超时'
		};

		const status = error.status || this.extractStatus(error.message);
		const msg = messages[status] || error.message || `API错误 (${status || '未知'})`;
		this.showUserError(msg);
		return { handled: true, message: msg };
	},

	/**
	 * 从错误消息中提取状态码
	 * @param {string} message - 错误消息
	 * @returns {number|null}
	 */
	extractStatus(message) {
		if (!message) return null;
		const match = message.match(/\b(\d{3})\b/);
		return match ? parseInt(match[1]) : null;
	},

	/**
	 * 显示用户错误提示
	 * @param {string} message - 错误消息
	 */
	showUserError(message) {
		const bodyNode = document.createElement('div');
		bodyNode.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-family: monospace; color: #ff6b6b; padding: 10px;';
		bodyNode.textContent = String(message ?? '未知错误');

		const footerNode = document.createElement('button');
		footerNode.className = 'ttw-btn ttw-btn-primary';
		footerNode.id = 'ttw-close-error-modal';
		footerNode.type = 'button';
		footerNode.textContent = '我知道了';

		const modal = ModalFactory.create({
			id: 'ttw-error-modal',
			title: '❌ 错误',
			bodyNode,
			footerNode,
			maxWidth: '500px'
		});
		modal.querySelector('#ttw-close-error-modal').addEventListener('click', () => ModalFactory.close(modal));
	},

	/**
	 * showUserSuccess
	 * 
	 * @param {*} message
	 * @returns {*}
	 */
	showUserSuccess(message) {
		const existingToast = document.getElementById('ttw-success-toast');
		if (existingToast) existingToast.remove();

		const toast = document.createElement('div');
		toast.id = 'ttw-success-toast';
toast.style.cssText = `
position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
padding: 12px 24px; background: #27ae60; color: #fff;
border-radius: 8px; z-index: 999999; font-size: 14px;
box-shadow: 0 4px 12px rgba(0,0,0,0.3);
animation: ttw-toast-in 0.3s ease;
`;
toast.textContent = message;
document.body.appendChild(toast);

setTimeout(() => {
toast.style.animation = 'ttw-toast-out 0.3s ease';
setTimeout(() => toast.remove(), 300);
}, 2000);
},

/**
 * confirmAsync
 * 
 * @param {*} message
 * @param {*} title
 * @returns {*}
 */
confirmAsync(message, title = '确认') {
return confirmAction(message, { title });
}
};

// ========== UI常量 ==========
const UI = {
	TEXT: {
		CONFIRM_DELETE: '确定要删除吗？',
		CONFIRM_MERGE: '确定要合并这些条目吗？',
		CONFIRM_RESET: '确定要重置吗？此操作不可撤销。',
		PROCESSING: '处理中...',
		SUCCESS: '操作成功',
		FAILED: '操作失败',
		NO_FILE: '请先选择文件',
		NO_API_KEY: '请输入API Key',
		SELECT_START: '请选择起始位置'
	},
	ICON: {
		SUCCESS: '✅',
		FAILED: '❌',
		PROCESSING: '🔄',
		WARNING: '⚠️',
		INFO: 'ℹ️',
		DELETE: '🗑️',
		EDIT: '✏️',
		SAVE: '💾',
		CANCEL: '❌'
	}
};

// ============================================================
// 第三区-B：工厂模式（模态框、API、列表渲染）
// ============================================================
// - ModalFactory: 统一模态框创建
// - APICaller: 统一API调用封装
// - ListRenderer: 列表渲染工具

// ========== ModalFactory 模态框工厂 ==========
async function confirmAction(message, options = {}) {
    return ModalFactory.confirm({ message, ...options });
}

async function promptAction(config, options = {}) {
    if (typeof config === 'string') {
        return ModalFactory.prompt({ message: config, ...options });
    }
    return ModalFactory.prompt(config || options);
}

async function alertAction(config, options = {}) {
    if (typeof config === 'string') {
        return ModalFactory.alert({ message: config, ...options });
    }
    return ModalFactory.alert(config || options);
}
// ========== ListRenderer 列表渲染工具 ==========
const ListRenderer = createListRenderer({
    smartUpdate: PerfUtils.smartUpdate,
    tokenCacheGet: (text) => TokenCache.get(text),
    estimateTokenCount,
    uiIcons: UI.ICON,
    getEntryConfig: (category, entryName) => getEntryConfig(category, entryName),
    getCategoryAutoIncrement: (category) => getCategoryAutoIncrement(category),
    getEntryTotalTokens: (entry) => getEntryTotalTokens(entry),
});
// ============================================================
// 第四区：数据持久层
// ============================================================
// - IndexedDB 封装 (MemoryHistoryDB)
// - LocalStorage 操作
// - 设置保存/加载
// - 自定义分类持久化

// ========== IndexedDB ==========
    // ========== 新增：自定义分类管理函数 ==========
    async function saveCustomCategories() {
        try {
            await MemoryHistoryDB.saveCustomCategories(AppState.persistent.customCategories);
            Logger.info('Category', '自定义分类配置已保存');
        } catch (error) {
            Logger.error('Category', '保存自定义分类配置失败:', error);
        }
    }

    /**
     * loadCustomCategories
     * 
     * @returns {Promise<any>}
     */
    async function loadCustomCategories() {
        try {
            const saved = await MemoryHistoryDB.getCustomCategories();
            if (saved && Array.isArray(saved) && saved.length > 0) {
                AppState.persistent.customCategories = saved;
            }
        } catch (error) {
            Logger.error('Category', '加载自定义分类配置失败:', error);
        }
    }

    /**
     * resetToDefaultCategories
     * 
     * @returns {Promise<any>}
     */
    async function resetToDefaultCategories() {
        AppState.persistent.customCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));
        await saveCustomCategories();
        Logger.info('Category', '已重置为默认分类配置');
    }

    /**
     * resetSingleCategory
     * 
     * @param {*} index
     * @returns {Promise<any>}
     */
    async function resetSingleCategory(index) {
        const cat = AppState.persistent.customCategories[index];
        if (!cat) return;

        const defaultCat = DEFAULT_WORLDBOOK_CATEGORIES.find(c => c.name === cat.name);
        if (defaultCat) {
            AppState.persistent.customCategories[index] = JSON.parse(JSON.stringify(defaultCat));
        } else {
            AppState.persistent.customCategories.splice(index, 1);
        }
        await saveCustomCategories();
    }

    /**
     * getEnabledCategories
     * 
     * @returns {*}
     */
    function getEnabledCategories() {
        return AppState.persistent.customCategories.filter(cat => cat.enabled);
    }

    /**
     * generateDynamicJsonTemplate
     * 
     * @returns {*}
     */
    function generateDynamicJsonTemplate() {
        const enabledCategories = getEnabledCategories();
        let template = '{\n';
        const parts = [];

        for (const cat of enabledCategories) {
            parts.push(`"${cat.name}": {
"${cat.entryExample}": {
"关键词": ${JSON.stringify(cat.keywordsExample)},
"内容": "${cat.contentGuide}"
}
}`);
        }

        template += parts.join(',\n');
        template += '\n}';
        return template;
    }

    /**
     * getEnabledCategoryNames
     * 
     * @returns {*}
     */
    function getEnabledCategoryNames() {
        const names = getEnabledCategories().map(cat => cat.name);
        names.push('剧情大纲', '知识书', '文风配置', '地图环境', '剧情节点');
        return names;
    }

    // ========== 工具函数 ==========
    async function calculateFileHash(content) {
        if (window.crypto && window.crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(content);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                Logger.warn('Hash', 'Crypto API 失败，回退到简易哈希');
            }
        }
        let hash = 0;
        const len = content.length;
        if (len === 0) return 'hash-empty';
        const sample = len < 100000 ? content : content.slice(0, 1000) + content.slice(Math.floor(len / 2), Math.floor(len / 2) + 1000) + content.slice(-1000);
        for (let i = 0; i < sample.length; i++) {
            hash = ((hash << 5) - hash) + sample.charCodeAt(i);
            hash = hash & hash;
        }
        return 'simple-' + Math.abs(hash).toString(16) + '-' + len;
    }

    /**
     * getLanguagePrefix
     * 
     * @returns {*}
     */
    function getLanguagePrefix() {
        return AppState.settings.language === 'zh' ? '请用中文回复。\n\n' : '';
    }

    // ========== 消息链辅助函数 ==========
    // 将messages数组转换为拼接字符串（用于回退/日志）
    function messagesToString(messages) {
        if (typeof messages === 'string') return messages;
        if (!Array.isArray(messages) || messages.length === 0) return '';
        if (messages.length === 1) return messages[0].content || '';
        return messages.map(m => {
            const roleLabel = m.role === 'system' ? '[System]' : m.role === 'assistant' ? '[Assistant]' : '[User]';
            return `${roleLabel}\n${m.content}`;
        }).join('\n\n');
    }

    // 将字符串prompt通过消息链模板转换为messages数组
    function applyMessageChain(prompt) {
        const chain = AppState.settings.promptMessageChain;
        if (!Array.isArray(chain) || chain.length === 0) {
            return [{ role: 'user', content: prompt }];
        }
        const enabledMessages = chain.filter(m => m.enabled !== false);
        if (enabledMessages.length === 0) {
            return [{ role: 'user', content: prompt }];
        }
        return enabledMessages.map(msg => ({
            role: msg.role || 'user',
            content: (msg.content || '').replace(/\{PROMPT\}/g, prompt)
        })).filter(m => m.content.trim().length > 0);
    }

    // 将messages转换为Gemini原生格式
    function convertToGeminiContents(messages) {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // Gemini要求contents中role交替出现，合并连续同角色消息
        const merged = [];
        for (const msg of nonSystemMsgs) {
            const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
            if (merged.length > 0 && merged[merged.length - 1].role === geminiRole) {
                merged[merged.length - 1].parts[0].text += '\n\n' + msg.content;
            } else {
                merged.push({ role: geminiRole, parts: [{ text: msg.content }] });
            }
        }
        // Gemini要求第一条必须是user
        if (merged.length > 0 && merged[0].role !== 'user') {
            merged.unshift({ role: 'user', parts: [{ text: '请根据以下对话执行任务。' }] });
        }

        const result = { contents: merged };
        if (systemMsgs.length > 0) {
            result.systemInstruction = {
                parts: [{ text: systemMsgs.map(m => m.content).join('\n\n') }]
            };
        }
        return result;
    }

    // 响应内容过滤（移除thinking等标签）
    function filterResponseContent(text) {
        if (!text) return text;
        const filterTagsStr = AppState.settings.filterResponseTags || 'thinking,/think';
        const filterTags = filterTagsStr.split(',').map(t => t.trim()).filter(t => t);
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

    /**
     * isTokenLimitError
     * 
     * @param {*} errorMsg
     * @returns {*}
     */
    function isTokenLimitError(errorMsg) {
        if (!errorMsg) return false;
        // 【修复】只检查前500字符（错误信息不会太长，避免在AI正常响应内容中误匹配）
        const checkStr = String(errorMsg).substring(0, 500);
        const patterns = [
            /prompt is too long/i, /tokens? >\s*\d+\s*maximum/i, /max_prompt_tokens/i,
            /tokens?.*exceeded/i, /context.?length.*exceeded/i, /exceeded.*(?:token|limit|context|maximum)/i,
            /input tokens/i, /context_length/i, /too many tokens/i,
            /token limit/i, /maximum.*tokens/i, /20015.*limit/i, /INVALID_ARGUMENT/i
        ];
        return patterns.some(pattern => pattern.test(checkStr));
    }

    /**
     * detectBestEncoding
     * 
     * @param {*} file
     * @returns {Promise<any>}
     */
    async function detectBestEncoding(file) {
        const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'Big5'];
        for (const encoding of encodings) {
            try {
                const content = await readFileWithEncoding(file, encoding);
                if (!content.includes('�') && !content.includes('\uFFFD')) {
                    return { encoding, content };
                }
            } catch (e) { continue; }
        }
        const content = await readFileWithEncoding(file, 'UTF-8');
        return { encoding: 'UTF-8', content };
    }

    /**
     * readFileWithEncoding
     * 
     * @param {*} file
     * @param {*} encoding
     * @returns {*}
     */
    function readFileWithEncoding(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, encoding);
        });
    }

    /**
     * updateStreamContent
     * 
     * @param {*} content
     * @param {*} clear
     * @returns {*}
     */
    function updateStreamContent(content, clear = false) {
        if (clear) {
            AppState.processing.streamContent = '';
        } else {
            AppState.processing.streamContent += content;
        }
        const streamEl = document.getElementById('ttw-stream-content');
        if (streamEl) {
            streamEl.textContent = AppState.processing.streamContent;
            streamEl.scrollTop = streamEl.scrollHeight;
        }
    }

    // 【新增】调试模式日志 - 带时间戳输出到实时输出面板
    function debugLog(msg) {
        if (!AppState.settings.debugMode) return;
        const now = new Date();
        const ts = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
        updateStreamContent(`[${ts}] 🔍 ${msg}\n`);
    }
    // 位置值转中文显示
    function getPositionDisplayName(position) {
        const positionNames = {
            0: '在角色定义之前',
            1: '在角色定义之后',
            2: '在作者注释之前',
            3: '在作者注释之后',
            4: '自定义深度'
        };
        return positionNames[position] || '在角色定义之前';
    }

    // ========== 分类灯状态管理 ==========
    function getCategoryLightState(category) {
        if (AppState.config.categoryLight.hasOwnProperty(category)) {
            return AppState.config.categoryLight[category];
        }
        return false;
    }

    /**
     * setCategoryLightState
     * 
     * @param {*} category
     * @param {*} isGreen
     * @returns {*}
     */
    function setCategoryLightState(category, isGreen) {
        AppState.config.categoryLight[category] = isGreen;
        saveCategoryLightSettings();
    }

    /**
     * saveCategoryLightSettings
     * 
     * @returns {*}
     */
    function saveCategoryLightSettings() {
        AppState.settings.categoryLightSettings = { ...AppState.config.categoryLight };
        try { localStorage.setItem('txtToWorldbookSettings', JSON.stringify(AppState.settings)); } catch (e) { }
    }

    /**
     * loadCategoryLightSettings
     * 
     * @returns {*}
     */
    function loadCategoryLightSettings() {
        if (AppState.settings.categoryLightSettings) {
            AppState.config.categoryLight = { ...AppState.config.categoryLight, ...AppState.settings.categoryLightSettings };
        }
    }

    // ========== 新增：条目位置/深度/顺序配置管理 ==========
    function getEntryConfig(category, entryName) {
        const key = `${category}::${entryName}`;
        if (AppState.config.entryPosition[key]) {
            return AppState.config.entryPosition[key];
        }
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return {
                position: AppState.config.plotOutline.position || 0,
                depth: AppState.config.plotOutline.depth || 4,
                order: AppState.config.plotOutline.order || 100,
                autoIncrementOrder: AppState.config.plotOutline.autoIncrementOrder || false
            };
        }
        // 优先从分类配置获取
        if (AppState.config.categoryDefault[category]) {
            return { ...AppState.config.categoryDefault[category] };
        }
        // 从自定义分类获取默认配置
        const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
        if (catConfig) {
            return {
                position: catConfig.defaultPosition || 0,
                depth: catConfig.defaultDepth || 4,
                order: catConfig.defaultOrder || 100,
                autoIncrementOrder: catConfig.autoIncrementOrder || false
            };
        }
        return { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
    }


    // 新增：获取分类是否自动递增顺序
    // 获取分类是否自动递增顺序
    function getCategoryAutoIncrement(category) {
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.autoIncrementOrder || false;
        }
        if (AppState.config.categoryDefault[category]?.autoIncrementOrder !== undefined) {
            return AppState.config.categoryDefault[category].autoIncrementOrder;
        }
        const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
        return catConfig?.autoIncrementOrder || false;
    }

    // 获取分类的起始顺序
    function getCategoryBaseOrder(category) {
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.order || 100;
        }
        if (AppState.config.categoryDefault[category]?.order !== undefined) {
            return AppState.config.categoryDefault[category].order;
        }
        const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
        return catConfig?.defaultOrder || 100;
    }



    /**
     * setEntryConfig
     * 
     * @param {*} category
     * @param {*} entryName
     * @param {*} config
     * @returns {*}
     */
    function setEntryConfig(category, entryName, config) {
        const key = `${category}::${entryName}`;
        AppState.config.entryPosition[key] = { ...config };
        AppState.settings.entryPositionConfig = AppState.config.entryPosition;
        saveCurrentSettings();
    }

    /**
     * setCategoryDefaultConfig
     * 
     * @param {*} category
     * @param {*} config
     * @returns {*}
     */
    function setCategoryDefaultConfig(category, config) {
        AppState.config.categoryDefault[category] = {
            position: config.position !== undefined ? config.position : 0,
            depth: config.depth !== undefined ? config.depth : 4,
            order: config.order !== undefined ? config.order : 100,
            autoIncrementOrder: config.autoIncrementOrder || false
        };
        AppState.settings.categoryDefaultConfig = AppState.config.categoryDefault;
        saveCurrentSettings();
}


// ============================================================
// 第五区：API通信层
// ============================================================
// - 酒馆 API 调用
// - Gemini API 调用
// - DeepSeek API 调用
// - OpenAI 兼容 API
// - 模型列表获取
// - 连接测试

/**
 * 调用SillyTavern API生成内容
 * @param {Array|Object} messages - 消息数组或消息对象
 * @param {number} [taskId=null] - 任务ID（用于日志）
 * @returns {Promise<string>} AI生成的文本
 * @throws {Error} API调用失败时抛出
 * @description
 * 支持两种格式：
 * - ST 1.13.2+: generateRaw({ prompt: messages[] })
 * - 旧版: generateRaw(string)
 */
async function callSillyTavernAPI(messages, taskId = null) {
        const timeout = AppState.settings.apiTimeout || 120000;
        const logPrefix = taskId !== null ? `[任务${taskId}]` : '';
        const combinedPrompt = messagesToString(messages);
        updateStreamContent(`\n📤 ${logPrefix} 发送请求到酒馆API (${messages.length}条消息)...\n`);
        debugLog(`${logPrefix} 酒馆API开始调用, 消息数=${messages.length}, 总长度=${combinedPrompt.length}, 超时=${timeout / 1000}秒`);

        try {
            if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
                throw new Error('无法访问SillyTavern上下文');
            }

            const context = SillyTavern.getContext();
            debugLog(`${logPrefix} 获取到SillyTavern上下文`);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`API请求超时 (${timeout / 1000}秒)`)), timeout);
            });

            let result;

            if (typeof context.generateRaw === 'function') {
                try {
                    // 尝试新版格式：ST 1.13.2+ 支持 generateRaw({ prompt: messages[] })
                    debugLog(`${logPrefix} 尝试generateRaw消息数组格式 (ST 1.13.2+)`);
                    result = await Promise.race([
                        context.generateRaw({ prompt: messages }),
                        timeoutPromise
                    ]);
                    debugLog(`${logPrefix} generateRaw消息数组格式成功`);
                } catch (rawError) {
                    // 超时/API本身的错误直接抛出
                    if (rawError.message?.includes('超时') || rawError.message?.includes('timeout') ||
                        rawError.message?.includes('API') || rawError.message?.includes('limit')) {
                        throw rawError;
                    }
                    // 其他错误（可能是旧版ST不支持对象参数），回退字符串格式
                    debugLog(`${logPrefix} 消息数组格式不支持(${rawError.message})，回退字符串模式`);
                    updateStreamContent(`⚠️ ${logPrefix} 酒馆不支持消息数组格式，已回退为字符串模式\n`);
                    result = await Promise.race([
                        context.generateRaw(combinedPrompt, '', false),
                        timeoutPromise
                    ]);
                }
            } else if (typeof context.generateQuietPrompt === 'function') {
                debugLog(`${logPrefix} 使用generateQuietPrompt（字符串模式）`);
                updateStreamContent(`ℹ️ ${logPrefix} 酒馆API: 使用generateQuietPrompt（字符串模式，消息角色不生效）\n`);
                result = await Promise.race([
                    context.generateQuietPrompt(combinedPrompt, false, false),
                    timeoutPromise
                ]);
            } else {
                throw new Error('无法找到可用的生成函数');
            }

            debugLog(`${logPrefix} 收到响应, 长度=${result.length}字符`);
            updateStreamContent(`📥 ${logPrefix} 收到响应 (${result.length}字符)\n`);
            return result;

        } catch (error) {
            debugLog(`${logPrefix} 酒馆API出错: ${error.message}`);
            updateStreamContent(`\n❌ ${logPrefix} 错误: ${error.message}\n`);
            throw error;
        }
    }

    // ========== API调用 - 自定义API ==========
    function buildCustomApiRequest(messages) {
        const provider = AppState.settings.customApiProvider;
        const apiKey = AppState.settings.customApiKey;
        const endpoint = AppState.settings.customApiEndpoint;
        const model = AppState.settings.customApiModel;
        const openaiMessages = messages.map(m => ({ role: m.role, content: m.content }));
        let requestUrl = '';
        let requestOptions = {};
        let isStreamRequest = false;

        switch (provider) {
            case 'anthropic': {
                if (!apiKey) throw new Error('Anthropic API Key 未设置');
                requestUrl = 'https://api.anthropic.com/v1/messages';
                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: model || 'claude-sonnet-4-20250514',
                        messages: openaiMessages,
                        temperature: 0.3,
                        max_tokens: 8192
                    })
                };
                break;
            }

            case 'gemini': {
                if (!apiKey) throw new Error('Gemini API Key 未设置');
                const geminiModel = model || 'gemini-2.5-flash';
                let geminiBaseUrl = endpoint ? endpoint.trim() : '';
                if (geminiBaseUrl) {
                    if (!geminiBaseUrl.startsWith('http')) geminiBaseUrl = 'https://' + geminiBaseUrl;
                    if (geminiBaseUrl.endsWith('/')) geminiBaseUrl = geminiBaseUrl.slice(0, -1);
                    if (geminiBaseUrl.includes('?')) {
                        requestUrl = `${geminiBaseUrl}/${geminiModel}:generateContent&key=${apiKey}`;
                    } else {
                        requestUrl = `${geminiBaseUrl}/${geminiModel}:generateContent?key=${apiKey}`;
                    }
                } else {
                    requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
                }
                const geminiData = convertToGeminiContents(messages);
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...geminiData,
                        generationConfig: { maxOutputTokens: 65536, temperature: 0.3 },
                        safetySettings: [
                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' }
                        ]
                    })
                };
                break;
            }

            case 'openai-compatible': {
                let openaiEndpoint = endpoint || 'http://127.0.0.1:5000/v1/chat/completions';
                const openaiModel = model || 'local-model';

                if (!openaiEndpoint.includes('/chat/completions')) {
                    if (openaiEndpoint.endsWith('/v1')) {
                        openaiEndpoint += '/chat/completions';
                    } else {
                        openaiEndpoint = openaiEndpoint.replace(/\/$/, '') + '/chat/completions';
                    }
                }

                if (!openaiEndpoint.startsWith('http')) {
                    openaiEndpoint = 'http://' + openaiEndpoint;
                }

                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                requestUrl = openaiEndpoint;
                requestOptions = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: openaiMessages,
                        temperature: 0.3,
                        max_tokens: 64000,
                        stream: true
                    })
                };
                isStreamRequest = true;
                break;
            }

            default:
                throw new Error(`不支持的API提供商: ${provider}`);
        }

        return { provider, requestUrl, requestOptions, isStreamRequest, model };
    }

    function extractCustomApiText(provider, data) {
        if (provider === 'gemini') {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        if (provider === 'anthropic') {
            return data.content?.[0]?.text || '';
        }
        return data.choices?.[0]?.message?.content || '';
    }

    async function callCustomAPI(messages) {
        const maxRetries = 3;
        const timeout = AppState.settings.apiTimeout || 120000;
        const requestConfig = buildCustomApiRequest(messages);
        const combinedPrompt = messagesToString(messages);

        updateStreamContent(`\n📤 发送请求到自定义API (${requestConfig.provider}, ${messages.length}条消息)...\n`);
        debugLog(`自定义API开始调用, provider=${requestConfig.provider}, model=${requestConfig.model}, 消息数=${messages.length}, 总长度=${combinedPrompt.length}`);

        try {
            return await APICaller.withRetry(async () => {
                debugLog(`自定义API请求目标: ${requestConfig.requestUrl.substring(0, 80)}...`);

                if (requestConfig.isStreamRequest) {
                    const result = await APICaller.requestStream(requestConfig.requestUrl, {
                        ...requestConfig.requestOptions,
                        timeout,
                        inactivityTimeout: Math.min(timeout, 120000)
                    });
                    debugLog(`自定义API流式读取完成, 结果长度=${result.length}字符`);
                    updateStreamContent(`📥 收到流式响应 (${result.length}字符)\n`);
                    return result;
                }

                const data = await APICaller.requestJSON(requestConfig.requestUrl, {
                    ...requestConfig.requestOptions,
                    timeout
                });
                debugLog('自定义API JSON解析完成, 开始提取内容');
                const result = extractCustomApiText(requestConfig.provider, data);
                debugLog(`自定义API提取完成, 结果长度=${result.length}字符`);
                updateStreamContent(`📥 收到响应 (${result.length}字符)\n`);
                return result;
            }, {
                retries: maxRetries,
                shouldRetry: (error) => APICaller.isRateLimitError(error),
                onRetry: async (error, nextAttempt, delay) => {
                    Logger.warn('API', `限流重试 #${nextAttempt}: ${error.message}`);
                    updateStreamContent(`⏳ 遇到限流，${delay}ms后重试...\n`);
                }
            });
        } catch (error) {
            const normalized = APICaller.handleError(error, '自定义API');
            debugLog(`自定义API出错: ${error.name || 'Error'} - ${error.message}`);
            if (normalized.type === 'timeout') {
                throw new Error(`API请求超时 (${timeout / 1000}秒)`);
            }
            throw error;
        }
    }

// ========== 拉取模型列表 ==========// ========== 拉取模型列表 ==========
async function handleFetchModelList() {
const endpoint = AppState.settings.customApiEndpoint || '';
if (!endpoint) {
throw new Error('请先设置 API Endpoint');
}

let modelsUrl = endpoint;
if (modelsUrl.endsWith('/chat/completions')) {
modelsUrl = modelsUrl.replace('/chat/completions', '/models');
} else if (modelsUrl.endsWith('/v1')) {
modelsUrl = modelsUrl + '/models';
} else if (!modelsUrl.endsWith('/models')) {
modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
}

if (!modelsUrl.startsWith('http')) {
modelsUrl = 'http://' + modelsUrl;
}

const headers = { 'Content-Type': 'application/json' };
if (AppState.settings.customApiKey) {
headers['Authorization'] = `Bearer ${AppState.settings.customApiKey}`;
}

Logger.info('API', '拉取模型列表: ' + modelsUrl);

const data = await APICaller.getJSON(modelsUrl, { method: 'GET', headers });
Logger.info('API', '模型列表响应: ' + JSON.stringify(data).substring(0, 200));

let models = [];
if (data.data && Array.isArray(data.data)) {
models = data.data.map(m => m.id || m.name || m);
} else if (Array.isArray(data)) {
models = data.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
} else if (data.models && Array.isArray(data.models)) {
models = data.models.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
}

return models;
}

// ========== 快速测试 ==========
async function handleQuickTestModel() {
const endpoint = AppState.settings.customApiEndpoint || '';
const model = AppState.settings.customApiModel || '';

if (!endpoint) {
throw new Error('请先设置 API Endpoint');
}
if (!model) {
throw new Error('请先设置模型名称');
}

let requestUrl = endpoint;
if (!requestUrl.includes('/chat/completions')) {
if (requestUrl.endsWith('/v1')) {
requestUrl += '/chat/completions';
} else {
requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
}
}

if (!requestUrl.startsWith('http')) {
requestUrl = 'http://' + requestUrl;
}

const headers = { 'Content-Type': 'application/json' };
if (AppState.settings.customApiKey) {
headers['Authorization'] = `Bearer ${AppState.settings.customApiKey}`;
}

Logger.info('API', `快速测试: ${requestUrl} 模型: ${model}`);

const startTime = Date.now();

const data = await APICaller.getJSON(requestUrl, {
method: 'POST',
headers,
body: JSON.stringify({
model: model,
messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
max_tokens: 100,
temperature: 0.1
})
});

const elapsed = Date.now() - startTime;
Logger.info('API', '测试响应: ' + JSON.stringify(data).substring(0, 200));

let responseText = '';

if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
const choice = data.choices[0];
if (choice.message && choice.message.content) {
responseText = choice.message.content;
} else if (choice.text) {
responseText = choice.text;
} else if (typeof choice.content === 'string') {
responseText = choice.content;
}
} else if (data.response) {
responseText = data.response;
} else if (data.content) {
responseText = data.content;
} else if (data.text) {
responseText = data.text;
} else if (data.output) {
responseText = data.output;
} else if (data.generated_text) {
responseText = data.generated_text;
}

if (!responseText || responseText.trim() === '') {
Logger.warn('API', '无法解析响应，完整数据: ' + JSON.stringify(data, null, 2));

const possibleFields = ['result', 'message', 'data', 'completion'];
for (const field of possibleFields) {
if (data[field]) {
if (typeof data[field] === 'string') {
responseText = data[field];
break;
} else if (typeof data[field] === 'object' && data[field].content) {
responseText = data[field].content;
break;
}
}
}
}

if (!responseText || responseText.trim() === '') {
throw new Error(`API返回了无法解析的响应格式。\n响应数据: ${JSON.stringify(data).substring(0, 200)}`);
}

return {
success: true,
            elapsed: elapsed,
            response: responseText.substring(0, 100)
        };
    }

    // ========== 统一API调用入口 ==========
    async function callAPI(prompt, taskId = null) {
        // 将字符串prompt通过消息链模板转换为messages数组
        const messages = applyMessageChain(prompt);
        debugLog(`callAPI: 消息链转换完成, ${messages.length}条消息, roles=[${messages.map(m => m.role).join(',')}]`);
        if (AppState.settings.useTavernApi) {
            return await callSillyTavernAPI(messages, taskId);
        } else {
            return await callCustomAPI(messages);
        }
}

// ============================================================
// 第六区：核心业务逻辑
// ============================================================
// - 内容分块
// - 记忆处理
// - 世界书生成
// - 条目合并
// - 历史回滚
// - 数据规范化

// ========== 世界书数据处理 ==========
const worldbookService = createWorldbookService({
    getIncrementalMode: () => AppState.processing.incrementalMode,
    saveHistory: (...args) => MemoryHistoryDB.saveHistory(...args),
    debugLog: (msg) => debugLog(msg),
});
const {
    normalizeWorldbookEntry,
    normalizeWorldbookData,
    mergeWorldbookData,
    mergeWorldbookDataIncremental,
    findChangedEntries,
    mergeWorldbookDataWithHistory,
} = worldbookService;

    // ========== 后处理添加章节编号后缀 ==========
    function postProcessResultWithChapterIndex(result, chapterIndex) {
        if (!result || typeof result !== 'object') return result;
        if (!AppState.settings.forceChapterMarker) return result;

        const processed = {};
        for (const category in result) {
            if (typeof result[category] !== 'object' || result[category] === null) {
                processed[category] = result[category];
                continue;
            }
            processed[category] = {};
            for (const entryName in result[category]) {
                let newEntryName = entryName;
                if (category === '剧情大纲' || category === '剧情节点' || category === '章节剧情') {
                    newEntryName = entryName.replace(/第[一二三四五六七八九十百千万\d]+章/g, `第${chapterIndex}章`);
                    if (!newEntryName.includes(`第${chapterIndex}章`) && !newEntryName.includes('-第')) {
                        newEntryName = `${newEntryName}-第${chapterIndex}章`;
                    }
                }
                processed[category][newEntryName] = result[category][entryName];
            }
        }
        return processed;
    }

    // ========== 解析AI响应 ==========
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
                    if (keywordStrings) keywords = keywordStrings.map(s => s.replace(/"/g, ''));
                }
                let content = '';
                const contentMatch = entryContent.match(/"内容"\s*:\s*"/);
                if (contentMatch) {
                    const contentStartPos = contentMatch.index + contentMatch[0].length;
                    let contentEndPos = contentStartPos;
                    let escaped = false;
                    while (contentEndPos < entryContent.length) {
                        const char = entryContent[contentEndPos];
                        if (escaped) { escaped = false; }
                        else if (char === '\\') { escaped = true; }
                        else if (char === '"') {
                            // 【v3.0.6修复】不再无条件break，判断这个"是否是真正的字符串结束引号
                            // 向后跳过空白，看下一个有意义字符是否是JSON结构字符
                            let peekPos = contentEndPos + 1;
                            while (peekPos < entryContent.length && /[\s\r\n]/.test(entryContent[peekPos])) peekPos++;
                            const nextChar = entryContent[peekPos];
                            if (nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === undefined) {
                                break; // 真正的字符串结束
                            }
                            // 否则是内容中未转义的引号，跳过继续
                        }
                        contentEndPos++;
                    }
                    content = entryContent.substring(contentStartPos, contentEndPos);
                    try { content = JSON.parse(`"${content.replace(/(?<!\\)"/g, '\\"')}"`); }
                    catch (e) { content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }
                }
                if (content || keywords.length > 0) {
                    result[category][entryName] = { '关键词': keywords, '内容': content };
                }
            }
            if (Object.keys(result[category]).length === 0) delete result[category];
        }
        return result;
    }

    // 【v3.0.6新增】修复JSON字符串值中未转义的双引号
    // AI常见错误：输出 "搜索传说生物"发神"" 而非 "搜索传说生物\"发神\""
    // 状态机扫描JSON，识别出字符串值内部的未转义 " 并转义为 \"
    function repairJsonUnescapedQuotes(jsonStr) {
        let result = '';
        let inString = false;
        let i = 0;

        while (i < jsonStr.length) {
            const char = jsonStr[i];

            // 在字符串内遇到反斜杠，保留转义序列原样
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
                    // 进入字符串
                    inString = true;
                    result += char;
                    i++;
                    continue;
                }

                // 在字符串内遇到 " —— 判断是字符串结束还是未转义的内容引号
                // 向后跳过空白，看下一个有意义字符
                let j = i + 1;
                while (j < jsonStr.length && /[\s\r\n]/.test(jsonStr[j])) j++;
                const nextChar = jsonStr[j];

                if (nextChar === ':' || nextChar === ',' ||
                    nextChar === '}' || nextChar === ']' ||
                    nextChar === undefined) {
                    // 后面是JSON结构字符 → 这是字符串的结束引号
                    inString = false;
                    result += char;
                } else {
                    // 后面不是JSON结构字符 → 这是内容中的未转义引号，修复它
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

    /**
 * 解析AI响应，提取JSON数据
 * @param {string} response - AI返回的原始响应
 * @returns {Object} 解析后的JSON对象
 * @throws {Error} 无法解析JSON时抛出错误
 * @description
 * 解析流程：
 * 1. 过滤用户指定的标签（如thinking）
 * 2. 尝试直接JSON解析
 * 3. 尝试提取代码块中的JSON
 * 4. 尝试修复未转义的引号
 * 5. 尝试补全缺失的括号
 * 6. 最后使用正则表达式提取
 */
function parseAIResponse(response, options = {}) {
        const { strict = true } = options;
        const rawResponse = String(response ?? '');
        debugLog(`解析响应开始, 响应长度=${rawResponse.length}字符, strict=${strict}`);
        const filterTagsStr = AppState.settings.filterResponseTags || 'thinking,/think';
        const filterTags = filterTagsStr.split(',').map(t => t.trim()).filter(t => t);

        let cleaned = rawResponse;
        for (const tag of filterTags) {
            if (tag.startsWith('/')) {
                const tagName = tag.substring(1);
                const endTagRegex = new RegExp(`^[\s\S]*?<\/${tagName}>`, 'gi');
                cleaned = cleaned.replace(endTagRegex, '');
            } else {
                const fullTagRegex = new RegExp(`<${tag}>[\s\S]*?<\/${tag}>`, 'gi');
                cleaned = cleaned.replace(fullTagRegex, '');
            }
        }

        const directText = cleaned.trim();
        const tryParse = (input) => {
            try {
                return { ok: true, value: JSON.parse(input) };
            } catch (error) {
                return { ok: false, error };
            }
        };

        const directResult = tryParse(directText);
        if (directResult.ok) return directResult.value;

        let fenced = directText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const first = fenced.indexOf('{');
        const last = fenced.lastIndexOf('}');
        if (first !== -1 && last > first) fenced = fenced.substring(first, last + 1);

        const fencedResult = tryParse(fenced);
        if (fencedResult.ok) return fencedResult.value;

        if (strict) {
            const summary = directText.slice(0, 200).replace(/\s+/g, ' ');
            throw new Error(`JSON解析失败（严格模式）。请检查模型输出是否为完整JSON。响应摘要: ${summary}${directText.length > 200 ? '...' : ''}`);
        }

        try {
            const repaired = repairJsonUnescapedQuotes(fenced);
            return JSON.parse(repaired);
        } catch (repairError) {
            debugLog('修复未转义引号后仍解析失败，进入bracket补全/regex fallback');
        }

        const open = (fenced.match(/{/g) || []).length;
        const close = (fenced.match(/}/g) || []).length;
        if (open > close) {
            let patched = fenced + '}'.repeat(open - close);
            try {
                return JSON.parse(patched);
            } catch (patchError) {
                try {
                    const repairedPatched = repairJsonUnescapedQuotes(patched);
                    return JSON.parse(repairedPatched);
                } catch (patchRepairError) {
                    debugLog('补全括号与修复引号后仍失败，进入regex fallback');
                }
            }
        }

        const extracted = extractWorldbookDataByRegex(fenced);
        if (extracted && typeof extracted === 'object' && Object.keys(extracted).length > 0) {
            return extracted;
        }

        const summary = directText.slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`JSON修复失败。响应摘要: ${summary}${directText.length > 200 ? '...' : ''}`);
    }

// ========== 分卷功能 ==========
function handleStartNewVolume() {
    if (Object.keys(AppState.worldbook.generated).length > 0) {
        AppState.worldbook.volumes.push({
            volumeIndex: AppState.worldbook.currentVolumeIndex,
            worldbook: JSON.parse(JSON.stringify(AppState.worldbook.generated)),
            timestamp: Date.now()
        });
    }
    AppState.worldbook.currentVolumeIndex++;
    
    AppState.worldbook.generated = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
    updateVolumeIndicator();
}

    /**
     * updateVolumeIndicator
     * 
     * @returns {*}
     */
    function updateVolumeIndicator() {
        const indicator = document.getElementById('ttw-volume-indicator');
        if (indicator) {
            indicator.textContent = `当前: 第${AppState.worldbook.currentVolumeIndex + 1}卷 | 已完成: ${AppState.worldbook.volumes.length}卷`;
            indicator.style.display = 'block';
        }
    }

    /**
     * getAllVolumesWorldbook
     * 
     * @returns {*}
     */
    function getAllVolumesWorldbook() {
        const merged = {};
        for (const volume of AppState.worldbook.volumes) {
            for (const category in volume.worldbook) {
                if (!merged[category]) merged[category] = {};
                for (const entryName in volume.worldbook[category]) {
                    const key = merged[category][entryName] ? `${entryName}_卷${volume.volumeIndex + 1}` : entryName;
                    merged[category][key] = volume.worldbook[category][entryName];
                }
            }
        }
        for (const category in AppState.worldbook.generated) {
            if (!merged[category]) merged[category] = {};
            for (const entryName in AppState.worldbook.generated[category]) {
                const key = merged[category][entryName] ? `${entryName}_卷${AppState.worldbook.currentVolumeIndex + 1}` : entryName;
                merged[category][key] = AppState.worldbook.generated[category][entryName];
            }
        }
        return merged;
    }

    // ========== 记忆分裂 ==========
    function splitMemoryIntoTwo(memoryIndex) {
        const memory = AppState.memory.queue[memoryIndex];
        if (!memory) return null;
        const content = memory.content;
        const halfLength = Math.floor(content.length / 2);
        let splitPoint = halfLength;
        const paragraphBreak = content.indexOf('\n\n', halfLength);
        if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
            splitPoint = paragraphBreak + 2;
        } else {
            const sentenceBreak = content.indexOf('。', halfLength);
            if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                splitPoint = sentenceBreak + 1;
            }
        }
        const content1 = content.substring(0, splitPoint);
        const content2 = content.substring(splitPoint);
        const originalTitle = memory.title;
        let baseName = originalTitle;
        let suffix1, suffix2;
        const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
        if (splitMatch) {
            baseName = splitMatch[1];
            const currentNum = parseInt(splitMatch[2]);
            suffix1 = `-${currentNum}-1`;
            suffix2 = `-${currentNum}-2`;
        } else {
            suffix1 = '-1';
            suffix2 = '-2';
        }
        const memory1 = { title: baseName + suffix1, content: content1, processed: false, failed: false, failedError: null };
        const memory2 = { title: baseName + suffix2, content: content2, processed: false, failed: false, failedError: null };
        AppState.memory.queue.splice(memoryIndex, 1, memory1, memory2);
        return { part1: memory1, part2: memory2 };
    }

    /**
     * deleteMemoryAt
     * 
     * @param {*} index
     * @returns {*}
     */
    async function deleteMemoryAt(index) {
        if (index < 0 || index >= AppState.memory.queue.length) return;
        const memory = AppState.memory.queue[index];
        if (await confirmAction(`确定要删除 "${memory.title}" 吗？`, { title: '删除章节', danger: true })) {
            AppState.memory.queue.splice(index, 1);
            AppState.memory.queue.forEach((m, i) => { if (!m.title.includes('-')) m.title = `记忆${i + 1}`; });
            if (AppState.memory.startIndex > index) AppState.memory.startIndex = Math.max(0, AppState.memory.startIndex - 1);
            else if (AppState.memory.startIndex >= AppState.memory.queue.length) AppState.memory.startIndex = Math.max(0, AppState.memory.queue.length - 1);
            if (AppState.memory.userSelectedIndex !== null) {
                if (AppState.memory.userSelectedIndex > index) AppState.memory.userSelectedIndex = Math.max(0, AppState.memory.userSelectedIndex - 1);
                else if (AppState.memory.userSelectedIndex >= AppState.memory.queue.length) AppState.memory.userSelectedIndex = null;
            }
            updateMemoryQueueUI();
            updateStartButtonState(false);
        }
    }

    /**
     * deleteSelectedMemories
     * 
     * @returns {*}
     */
    async function deleteSelectedMemories() {
        if (AppState.ui.selectedIndices.size === 0) {
            ErrorHandler.showUserError('请先选择要删除的章节');
            return;
        }

        const hasProcessed = [...AppState.ui.selectedIndices].some(i => AppState.memory.queue[i]?.processed && !AppState.memory.queue[i]?.failed);
        let confirmMsg = `确定要删除选中的 ${AppState.ui.selectedIndices.size} 个章节吗？`;
        if (hasProcessed) {
            confirmMsg += '\n\n⚠️ 警告：选中的章节中包含已处理的章节，删除后相关的世界书数据不会自动更新！';
        }

        if (!await confirmAction(confirmMsg, { title: '批量删除章节', danger: true })) return;

        const sortedIndices = [...AppState.ui.selectedIndices].sort((a, b) => b - a);
        for (const index of sortedIndices) {
            AppState.memory.queue.splice(index, 1);
        }

        AppState.memory.queue.forEach((m, i) => {
            if (!m.title.includes('-')) m.title = `记忆${i + 1}`;
        });

        AppState.memory.startIndex = Math.min(AppState.memory.startIndex, Math.max(0, AppState.memory.queue.length - 1));
        if (AppState.memory.userSelectedIndex !== null) {
            AppState.memory.userSelectedIndex = Math.min(AppState.memory.userSelectedIndex, Math.max(0, AppState.memory.queue.length - 1));
        }

        AppState.ui.selectedIndices.clear();
        AppState.ui.isMultiSelectMode = false;

        updateMemoryQueueUI();
        updateStartButtonState(false);
    }

/**
 * 获取系统提示词
 * @returns {string} 完整的系统提示词
 * @description
 * 构建流程：
 * 1. 使用自定义提示词或默认提示词
 * 2. 替换动态模板占位符
 * 3. 添加剧情大纲/文风配置（如启用）
 */
function _buildSystemPrompt() {
        let worldbookPrompt = AppState.settings.customWorldbookPrompt?.trim() || defaultWorldbookPrompt;

        const dynamicTemplate = generateDynamicJsonTemplate();
        worldbookPrompt = worldbookPrompt.replace('{DYNAMIC_JSON_TEMPLATE}', dynamicTemplate);

        // 【修复】动态替换启用的分类名称
        const enabledCatNames = getEnabledCategories().map(c => c.name);
        if (AppState.settings.enablePlotOutline) enabledCatNames.push('剧情大纲');
        if (AppState.settings.enableLiteraryStyle) enabledCatNames.push('文风配置');
        worldbookPrompt = worldbookPrompt.replace('{ENABLED_CATEGORY_NAMES}', enabledCatNames.join('、'));

        const additionalParts = [];
        if (AppState.settings.enablePlotOutline) {
            additionalParts.push(AppState.settings.customPlotPrompt?.trim() || defaultPlotPrompt);
        }
        if (AppState.settings.enableLiteraryStyle) {
            additionalParts.push(AppState.settings.customStylePrompt?.trim() || defaultStylePrompt);
        }
        if (additionalParts.length === 0) return worldbookPrompt;
        let fullPrompt = worldbookPrompt;
        const insertContent = ',\n' + additionalParts.join(',\n');
        fullPrompt = fullPrompt.replace(/(\}\s*)\n\`\`\`/, `${insertContent}\n$1\n\`\`\``);
        return fullPrompt;
    }

    // ========== 获取上一个记忆的处理结果摘要 ==========
    function getPreviousMemoryContext(index) {
        if (index <= 0) return '';

        for (let i = index - 1; i >= 0; i--) {
            const prevMemory = AppState.memory.queue[i];
            if (prevMemory && prevMemory.processed && prevMemory.result && !prevMemory.failed) {
                const plotContext = [];
                const result = prevMemory.result;

                if (result['剧情大纲']) {
                    for (const entryName in result['剧情大纲']) {
                        plotContext.push(`${entryName}: ${result['剧情大纲'][entryName]['内容']?.substring(0, 200) || ''}`);
                    }
                }
                if (result['剧情节点']) {
                    for (const entryName in result['剧情节点']) {
                        plotContext.push(`${entryName}: ${result['剧情节点'][entryName]['内容']?.substring(0, 200) || ''}`);
                    }
                }
                if (result['章节剧情']) {
                    for (const entryName in result['章节剧情']) {
                        plotContext.push(`${entryName}: ${result['章节剧情'][entryName]['内容']?.substring(0, 200) || ''}`);
                    }
                }

                if (plotContext.length > 0) {
                    return `\n\n【上一章节(第${i + 1}章)的剧情进展】：\n${plotContext.join('\n')}\n\n请在此基础上继续分析后续剧情，不要重复输出已有的章节。`;
                }
                break;
            }
        }
        return '';
    }

    // ========== 生成章节强制标记提示词 ==========
    function getChapterForcePrompt(chapterIndex) {
        return `
【强制章节标记 - 开始】
强制无视内容中的任何章节信息！本轮全文章节统一为：第${chapterIndex}章
无论原文中出现"第一章"、"第二章"等任何章节标记，你输出时都必须将其替换为"第${chapterIndex}章"。
【强制章节标记 - 结束】
`;
    }

    function setProcessingStatus(status) {
        const next = status || 'idle';
        AppState.processing.status = next;
        AppState.processing.isStopped = next === 'stopped';
        AppState.processing.isRerolling = next === 'rerolling';
        AppState.processing.isRepairing = next === 'repairing';
        AppState.processing.isRunning = next === 'running' || next === 'rerolling' || next === 'repairing';
    }

    function getProcessingStatus() {
        return AppState.processing.status || 'idle';
    }

    let _processingService = null;
    function getProcessingService() {
        if (_processingService) return _processingService;
        _processingService = createProcessingService({
            AppState,
            MemoryHistoryDB,
            Semaphore,
            updateMemoryQueueUI,
            updateProgress,
            updateStreamContent,
            debugLog,
            callAPI,
            isTokenLimitError,
            parseAIResponse,
            postProcessResultWithChapterIndex,
            mergeWorldbookDataWithHistory,
            getChapterForcePrompt,
            getLanguagePrefix,
            buildSystemPrompt: _buildSystemPrompt,
            getPreviousMemoryContext,
            getEnabledCategories,
            splitMemoryIntoTwo,
            handleStartNewVolume,
            showProgressSection,
            updateStopButtonVisibility,
            updateVolumeIndicator,
            updateStartButtonState,
            showResultSection,
            updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
            applyDefaultWorldbookEntries,
            ErrorHandler,
            handleRepairMemoryWithSplit,
            setProcessingStatus,
            getProcessingStatus,
        });
        return _processingService;
    }

    let _rerollService = null;
    function getRerollService() {
        if (_rerollService) return _rerollService;
        _rerollService = createRerollService({
            AppState,
            MemoryHistoryDB,
            updateStopButtonVisibility,
            updateStreamContent,
            updateMemoryQueueUI,
            processMemoryChunkIndependent,
            mergeWorldbookDataWithHistory,
            updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
            setProcessingStatus,
            getProcessingStatus,
            callAPI,
            parseAIResponse,
            getChapterForcePrompt,
            getLanguagePrefix,
            getPreviousMemoryContext,
            updateProgress,
            showProgressSection,
        });
        return _rerollService;
    }

    let _rerollModals = null;
    function getRerollModals() {
        if (_rerollModals) return _rerollModals;
        _rerollModals = createRerollModals({
            AppState,
            ModalFactory,
            MemoryHistoryDB,
            ListRenderer,
            Logger,
            ErrorHandler,
            confirmAction,
            parseAIResponse,
            rebuildWorldbookFromMemories,
            updateMemoryQueueUI,
            findEntrySourceMemories,
            handleRerollMemory,
            handleRerollSingleEntry,
            handleStopProcessing,
            setProcessingStatus,
            getProcessingStatus,
            saveCurrentSettings,
            getEntryTotalTokens,
            updateWorldbookPreview: () => worldbookView.updateWorldbookPreview(),
        });
        return _rerollModals;
    }

// ========== 并行处理 ==========
/**
 * 处理单个记忆块（独立模式，用于并行处理和重Roll）
 * @param {Object} options - 处理选项
 * @param {number} options.index - 记忆索引
 * @param {number} [options.retryCount=0] - 重试次数
 * @param {string} [options.customPromptSuffix=''] - 自定义提示词后缀
 * @returns {Promise<Object>} 处理结果
 */
async function processMemoryChunkIndependent(options) {
    return getProcessingService().processMemoryChunkIndependent(options);
}

    async function processMemoryChunksParallel(startIndex, endIndex) {
        return getProcessingService().processMemoryChunksParallel(startIndex, endIndex);
    }

// ============================================================
// 第六区：核心业务逻辑
// ============================================================
// - 内容分块
// - 记忆处理
// - 世界书生成
// - 条目合并
// - 历史回滚

/**
 * 处理单个记忆块（串行模式）
 * @param {number} index - 记忆索引
 * @param {number} [retryCount=0] - 重试次数
 * @returns {Promise<void>}
 * @throws {Error} 处理过程中发生错误
 */
async function processMemoryChunk(index, retryCount = 0) {
    return getProcessingService().processMemoryChunk(index, retryCount);
}

function handleStopProcessing() {
    return getProcessingService().handleStopProcessing();
}

    function updateStopButtonVisibility(show) {
        const stopBtn = document.getElementById('ttw-stop-btn');
        if (stopBtn) {
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = !show;
        }
    }

    // ========== 应用默认世界书条目 ==========
    // ========== 应用默认世界书条目 ==========
    function applyDefaultWorldbookEntries() {
        // 优先使用UI数据
        if (AppState.persistent.defaultEntries && AppState.persistent.defaultEntries.length > 0) {
            for (const entry of AppState.persistent.defaultEntries) {
                if (!entry.category || !entry.name) continue;
                if (!AppState.worldbook.generated[entry.category]) {
                    AppState.worldbook.generated[entry.category] = {};
                }
                AppState.worldbook.generated[entry.category][entry.name] = {
                    '关键词': entry.keywords || [],
                    '内容': entry.content || ''
                };

                // 【新增】同步位置/深度/顺序配置到 AppState.config.entryPosition
                if (entry.position !== undefined || entry.depth !== undefined || entry.order !== undefined) {
                    setEntryConfig(entry.category, entry.name, {
                        position: entry.position ?? 0,
                        depth: entry.depth ?? 4,
                        order: entry.order ?? 100
                    });
                }
            }
            updateStreamContent(`\n📚 已添加 ${AppState.persistent.defaultEntries.length} 个默认世界书条目\n`);
            return true;
        }

        // 兼容旧的JSON格式
        if (!AppState.settings.defaultWorldbookEntries?.trim()) return false;

        try {
            const defaultEntries = JSON.parse(AppState.settings.defaultWorldbookEntries);
            mergeWorldbookDataIncremental(AppState.worldbook.generated, defaultEntries);
            updateStreamContent(`\n📚 已添加默认世界书条目\n`);
            return true;
        } catch (e) {
            Logger.error('Worldbook', '解析默认世界书条目失败:', e);
            updateStreamContent(`\n⚠️ 默认世界书条目格式错误，跳过\n`);
            return false;
        }
    }


    // ========== 主处理流程 ==========
    async function handleStartProcessing() {
        return getProcessingService().handleStartProcessing();
    }

    function updateStartButtonState(isProcessing) {
        const startBtn = document.getElementById('ttw-start-btn');
        if (!startBtn) return;

        if (!isProcessing && AppState.processing.activeTasks.size > 0) {
            return;
        }

    if (isProcessing) {
        startBtn.disabled = true;
        startBtn.textContent = '转换中...';
    } else {
        startBtn.disabled = false;
if (AppState.memory.userSelectedIndex !== null) {
            startBtn.textContent = `▶️ 从第${AppState.memory.userSelectedIndex + 1}章开始`;
            AppState.memory.startIndex = AppState.memory.userSelectedIndex;

            return;
        }
        const firstUnprocessed = AppState.memory.queue.findIndex(m => !m.processed || m.failed);
        const hasProcessedMemories = AppState.memory.queue.some(m => m.processed && !m.failed);
        if (hasProcessedMemories && firstUnprocessed !== -1 && firstUnprocessed < AppState.memory.queue.length) {
            startBtn.textContent = `▶️ 继续转换 (从第${firstUnprocessed + 1}章)`;
            AppState.memory.startIndex = firstUnprocessed;
        } else if (AppState.memory.queue.length > 0 && AppState.memory.queue.every(m => m.processed && !m.failed)) {
            startBtn.textContent = '🚀 重新转换';
            AppState.memory.startIndex = 0;
        } else {
            startBtn.textContent = '🚀 开始转换';
            AppState.memory.startIndex = 0;
        }
        
    }
}

    // ========== 修复失败记忆 ==========
    async function handleRepairSingleMemory(index) {
        const memory = AppState.memory.queue[index];
        const chapterIndex = index + 1;

        const chapterForcePrompt = AppState.settings.forceChapterMarker ? getChapterForcePrompt(chapterIndex) : '';

        let prompt = chapterForcePrompt;
        prompt += getLanguagePrefix() + `你是世界书生成专家。请提取关键信息。

输出JSON格式：
${generateDynamicJsonTemplate()}
`;

        const prevContext = getPreviousMemoryContext(index);
        if (prevContext) {
            prompt += prevContext;
        }

        if (Object.keys(AppState.worldbook.generated).length > 0) {
            prompt += `当前世界书：\n${JSON.stringify(AppState.worldbook.generated, null, 2)}\n\n`;
        }
        prompt += `阅读内容（第${chapterIndex}章）：\n---\n${memory.content}\n---\n\n请输出JSON。`;

        if (AppState.settings.forceChapterMarker) {
            prompt += chapterForcePrompt;
        }

        const response = await callAPI(prompt);
        let memoryUpdate = parseAIResponse(response);
        memoryUpdate = postProcessResultWithChapterIndex(memoryUpdate, chapterIndex);
            await mergeWorldbookDataWithHistory({ target: AppState.worldbook.generated, source: memoryUpdate, memoryIndex: index, memoryTitle: `修复-${memory.title}` });
        await MemoryHistoryDB.saveRollResult(index, memoryUpdate);
        memory.result = memoryUpdate;
    }

    /**
     * repairMemoryWithSplit
     * 
     * @param {*} memoryIndex
     * @param {*} stats
     * @returns {Promise<any>}
     */
    async function handleRepairMemoryWithSplit(memoryIndex, stats) {
        const memory = AppState.memory.queue[memoryIndex];
        if (!memory) return;
        updateProgress((memoryIndex / AppState.memory.queue.length) * 100, `正在修复: ${memory.title}`);

        try {
            await handleRepairSingleMemory(memoryIndex);
            memory.failed = false;
            memory.failedError = null;
            memory.processed = true;
            stats.successCount++;
            updateMemoryQueueUI();
            await MemoryHistoryDB.saveState(AppState.memory.queue.filter(m => m.processed).length);
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            if (isTokenLimitError(error.message || '')) {
                if (AppState.processing.volumeMode) {
                    handleStartNewVolume();
                    await MemoryHistoryDB.saveState(AppState.memory.queue.filter(m => m.processed).length);
                    await new Promise(r => setTimeout(r, 500));
                    await handleRepairMemoryWithSplit(memoryIndex, stats);
                    return;
                }
                const splitResult = splitMemoryIntoTwo(memoryIndex);
                if (splitResult) {
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(AppState.memory.queue.filter(m => m.processed).length);
                    await new Promise(r => setTimeout(r, 500));
                    const part1Index = AppState.memory.queue.indexOf(splitResult.part1);
                    await handleRepairMemoryWithSplit(part1Index, stats);
                    const part2Index = AppState.memory.queue.indexOf(splitResult.part2);
                    await handleRepairMemoryWithSplit(part2Index, stats);
                } else {
                    stats.stillFailedCount++;
                    memory.failedError = error.message;
                }
            } else {
                stats.stillFailedCount++;
                memory.failedError = error.message;
                updateMemoryQueueUI();
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

/**
 * startRepairFailedMemories
 * 
 * @returns {Promise<any>}
 */
async function handleRepairFailedMemories() {
    return getProcessingService().handleRepairFailedMemories();
}

// ========== 重Roll功能 ==========
async function handleRerollMemory(index, customPrompt = '') {
    return getRerollService().handleRerollMemory(index, customPrompt);
}

    // ========== 新增：查找条目来源章节 ==========
    function findEntrySourceMemories(category, entryName) {
        return getRerollService().findEntrySourceMemories(category, entryName);
    }

// ========== 新增：单独重Roll条目（不影响已整理/合并的其他条目） ==========
async function handleRerollSingleEntry(options) {
    return getRerollService().handleRerollSingleEntry(options);
}

// 第七区：UI组件层
// ============================================================
// - 模态框工厂
// - 表单处理
// - 事件绑定
// - UI 更新函数
// - 列表渲染

// ========== 新增：显示单独重Roll条目弹窗（v3.0.4 升级版：多选+并发+编辑+历史） ==========

/**
 * 构建来源章节选择HTML
 * @param {Array} sources - 来源章节列表
 * @returns {string} HTML字符串
 */
async function showRerollEntryModal(category, entryName, callback) {
    return getRerollModals().showRerollEntryModal(category, entryName, callback);
}

async function showBatchRerollModal(callback) {
    return getRerollModals().showBatchRerollModal(callback);
}

async function showRollHistorySelector(index) {
    return getRerollModals().showRollHistorySelector(index);
}

    // ========== 导入JSON合并世界书 ==========
    async function importAndMergeWorldbook() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const content = await file.text();
                const importedData = JSON.parse(content);

                let worldbookToMerge = {};
                let internalDuplicates = [];

                if (importedData.entries) {
                    // ST格式，需要检测内部重复
                    const result = convertSTFormatToInternal(importedData, true);
                    worldbookToMerge = result.worldbook;
                    internalDuplicates = result.duplicates;
                } else if (importedData.merged) {
                    worldbookToMerge = importedData.merged;
                } else {
                    worldbookToMerge = importedData;
                }

                AppState.persistent.pendingImport = {
                    worldbook: worldbookToMerge,
                    fileName: file.name,
                    timestamp: Date.now(),
                    internalDuplicates: internalDuplicates
                };

                showMergeOptionsModal(worldbookToMerge, file.name, internalDuplicates);

            } catch (error) {
                Logger.error('Import', '导入失败:', error);
                ErrorHandler.showUserError('导入失败: ' + error.message);
            }
        };

        input.click();
    }


    /**
     * convertSTFormatToInternal
     * 
     * @param {*} stData
     * @param {*} collectDuplicates
     * @returns {*}
     */
    function convertSTFormatToInternal(stData, collectDuplicates = false) {
        const result = {};
        const internalDuplicates = []; // 记录内部重复

        if (!stData.entries) return collectDuplicates ? { worldbook: result, duplicates: internalDuplicates } : result;

        const entriesArray = Array.isArray(stData.entries)
            ? stData.entries
            : Object.values(stData.entries);

        for (const entry of entriesArray) {
            if (!entry || typeof entry !== 'object') continue;

            let category = '未分类';
            let name = '';

            // 从comment解析："分类名 - 条目名"
            if (entry.comment) {
                const parts = entry.comment.split(' - ');
                if (parts.length >= 2) {
                    category = parts[0].trim();
                    name = parts.slice(1).join(' - ').trim();
                } else {
                    name = entry.comment.trim();
                }
            }

            // comment解析不出来，用group
            if (category === '未分类' && entry.group) {
                const underscoreIndex = entry.group.indexOf('_');
                if (underscoreIndex > 0) {
                    category = entry.group.substring(0, underscoreIndex);
                } else {
                    category = entry.group;
                }
            }

            if (!name) {
                name = `条目_${entry.uid || Math.random().toString(36).substr(2, 9)}`;
            }

            if (!result[category]) {
                result[category] = {};
            }

            const newEntry = {
                '关键词': Array.isArray(entry.key) ? entry.key : (entry.key ? [entry.key] : []),
                '内容': entry.content || ''
            };

            // 【关键】如果已存在同名条目，记录为内部重复
            if (result[category][name]) {
                internalDuplicates.push({
                    category,
                    name,
                    existing: result[category][name],  // 第一个遇到的
                    imported: newEntry                  // 后面遇到的
                });
            } else {
                result[category][name] = newEntry;
            }
        }

        Logger.info('Export', `ST格式转换完成: ${Object.values(result).reduce((sum, cat) => sum + Object.keys(cat).length, 0)} 个条目, ${internalDuplicates.length} 个内部重复`);

        if (collectDuplicates) {
            return { worldbook: result, duplicates: internalDuplicates };
        }
        return result;
    }






    /**
     * findDuplicateEntries
     * 
     * @param {*} existing
     * @param {*} imported
     * @returns {*}
     */
    function findDuplicateEntries(existing, imported) {
        const duplicates = [];
        for (const category in imported) {
            if (!existing[category]) continue;
            for (const name in imported[category]) {
                if (existing[category][name]) {
                    const existingStr = JSON.stringify(existing[category][name]);
                    const importedStr = JSON.stringify(imported[category][name]);
                    if (existingStr !== importedStr) {
                        duplicates.push({
                            category,
                            name,
                            existing: existing[category][name],
                            imported: imported[category][name]
                        });
                    }
                }
            }
        }
        return duplicates;
    }

    /**
     * findNewEntries
     * 
     * @param {*} existing
     * @param {*} imported
     * @returns {*}
     */
    function findNewEntries(existing, imported) {
        const newEntries = [];
        for (const category in imported) {
            for (const name in imported[category]) {
                if (!existing[category] || !existing[category][name]) {
                    newEntries.push({ category, name, entry: imported[category][name] });
                }
            }
        }
        return newEntries;
    }

    /**
     * groupEntriesByCategory
     * 
     * @param {*} entries
     * @returns {*}
     */
    function groupEntriesByCategory(entries) {
        const grouped = {};
        for (const item of entries) {
            if (!grouped[item.category]) {
                grouped[item.category] = [];
            }
            grouped[item.category].push(item);
        }
        return grouped;
    }


// ========== 合并世界书模态框辅助函数 ==========

/**
 * 构建新条目列表HTML
 * @param {Array} newEntries - 新条目列表
 * @param {Object} groupedNew - 按分类分组的新条目
 * @returns {string} HTML字符串
 */
function _buildNewEntriesListHtml(newEntries, groupedNew) {
    if (newEntries.length === 0) return '';
    let html = `
    <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:bold;color:#27ae60;">📥 新条目 (${newEntries.length})</span>
            <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-new" checked> 全选</label>
        </div>
        <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">`;
    for (const category in groupedNew) {
        const items = groupedNew[category];
        html += `
        <div class="ttw-merge-category-group" style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(39,174,96,0.2);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">
                <input type="checkbox" class="ttw-new-category-cb" data-category="${category}" checked>
                <span style="color:#27ae60;">${category}</span>
                <span style="color:#888;font-weight:normal;">(${items.length})</span>
            </label>
            <div style="margin-left:16px;margin-top:4px;">`;
        items.forEach((item) => {
            const globalIdx = newEntries.indexOf(item);
            html += `
            <label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
                <input type="checkbox" class="ttw-new-entry-cb" data-index="${globalIdx}" data-category="${category}" checked>
                <span>${item.name}</span>
            </label>`;
        });
        html += `</div></div>`;
    }
    html += `</div></div>`;
    return html;
}

/**
 * 构建重复条目列表HTML
 * @param {Array} allDuplicates - 所有重复条目
 * @param {Object} groupedDup - 按分类分组的重复条目
 * @param {Array} internalDuplicates - 内部重复条目
 * @returns {string} HTML字符串
 */
function _buildDupEntriesListHtml(allDuplicates, groupedDup, internalDuplicates) {
    if (allDuplicates.length === 0) return '';
    let html = `
    <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:bold;color:#e67e22;">🔀 重复条目 (${allDuplicates.length})</span>
            <label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-dup" checked> 全选</label>
        </div>
        <div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">`;
    for (const category in groupedDup) {
        const items = groupedDup[category];
        html += `
        <div class="ttw-merge-category-group" style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(230,126,34,0.2);border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">
                <input type="checkbox" class="ttw-dup-category-cb" data-category="${category}" checked>
                <span style="color:#e67e22;">${category}</span>
                <span style="color:#888;font-weight:normal;">(${items.length})</span>
            </label>
            <div style="margin-left:16px;margin-top:4px;">`;
        items.forEach((item) => {
            const globalIdx = allDuplicates.indexOf(item);
            const isInternal = internalDuplicates.includes(item);
            const badge = isInternal ? '<span style="font-size:9px;color:#9b59b6;margin-left:4px;">(内部重复)</span>' : '';
            html += `
            <label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
                <input type="checkbox" class="ttw-dup-entry-cb" data-index="${globalIdx}" data-category="${category}" checked>
                <span>${item.name}${badge}</span>
            </label>`;
        });
        html += `</div></div>`;
    }
    html += `</div></div>`;
    return html;
}

/**
 * 构建合并选项HTML
 * @returns {string} HTML字符串
 */
function _buildMergeOptionsHtml() {
    return `
    <div style="margin-bottom:16px;">
        <div style="font-weight:bold;color:#e67e22;margin-bottom:10px;">🔀 重复条目处理方式</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="ai" checked>
                <div>
                    <div style="font-weight:bold;">🤖 AI智能合并 (支持并发)</div>
                    <div style="font-size:11px;color:#888;">使用AI合并相同名称的条目，保留所有信息</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="replace">
                <div>
                    <div style="font-weight:bold;">📝 使用后者覆盖</div>
                    <div style="font-size:11px;color:#888;">用后面的条目覆盖前面的条目</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="keep">
                <div>
                    <div style="font-weight:bold;">🔒 保留前者</div>
                    <div style="font-size:11px;color:#888;">保留第一个条目，丢弃后面的重复条目</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="rename">
                <div>
                    <div style="font-weight:bold;">📋 重命名保留</div>
                    <div style="font-size:11px;color:#888;">将重复条目添加为新名称（如 角色名_2）</div>
                </div>
            </label>
            <label class="ttw-merge-option">
                <input type="radio" name="merge-mode" value="append">
                <div>
                    <div style="font-weight:bold;">➕ 内容叠加</div>
                    <div style="font-size:11px;color:#888;">将重复条目的内容追加到原条目后面</div>
                </div>
            </label>
        </div>
    </div>
    <div id="ttw-ai-merge-options" style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
        <div style="font-weight:bold;color:#9b59b6;margin-bottom:10px;">🤖 AI合并设置</div>
        <div style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                <span>并发数:</span>
                <input type="number" id="ttw-merge-concurrency" value="${AppState.config.parallel.concurrency}" min="1" max="10" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;">
            </label>
        </div>
        <textarea id="ttw-merge-prompt" rows="4" style="width:100%;padding:10px;border:1px solid #555;border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;resize:vertical;" placeholder="留空使用默认提示词...">${AppState.settings.customMergePrompt || ''}</textarea>
        <div style="margin-top:8px;">
            <button class="ttw-btn ttw-btn-small" id="ttw-preview-merge-prompt">👁️ 预览默认提示词</button>
        </div>
    </div>`;
}

/**
 * 绑定合并模态框事件
 * @param {HTMLElement} modal - 模态框元素
 * @param {Array} newEntries - 新条目列表
 * @param {Array} allDuplicates - 所有重复条目
 * @param {Object} importedWorldbook - 导入的世界书
 */
function _bindMergeModalEvents(modal, newEntries, allDuplicates, importedWorldbook) {
    // 全选新条目
    const selectAllNewCb = modal.querySelector('#ttw-select-all-new');
    if (selectAllNewCb) {
        selectAllNewCb.addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-new-entry-cb').forEach(cb => cb.checked = e.target.checked);
            modal.querySelectorAll('.ttw-new-category-cb').forEach(cb => cb.checked = e.target.checked);
        });
    }

    // 全选重复条目
    const selectAllDupCb = modal.querySelector('#ttw-select-all-dup');
    if (selectAllDupCb) {
        selectAllDupCb.addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-dup-entry-cb').forEach(cb => cb.checked = e.target.checked);
            modal.querySelectorAll('.ttw-dup-category-cb').forEach(cb => cb.checked = e.target.checked);
        });
    }

    // 分类checkbox联动
    modal.querySelectorAll('.ttw-new-category-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            modal.querySelectorAll(`.ttw-new-entry-cb[data-category="${category}"]`).forEach(entryCb => {
                entryCb.checked = e.target.checked;
            });
        });
    });

    modal.querySelectorAll('.ttw-dup-category-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const category = e.target.dataset.category;
            modal.querySelectorAll(`.ttw-dup-entry-cb[data-category="${category}"]`).forEach(entryCb => {
                entryCb.checked = e.target.checked;
            });
        });
    });

	// 关闭事件
	modal.querySelector('#ttw-cancel-merge').addEventListener('click', () => ModalFactory.close(modal));

    // AI选项显示切换
    const aiOptions = modal.querySelector('#ttw-ai-merge-options');
    if (aiOptions) {
        modal.querySelectorAll('input[name="merge-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                aiOptions.style.display = radio.value === 'ai' ? 'block' : 'none';
            });
        });
    }

    // 预览合并提示词
    const previewBtn = modal.querySelector('#ttw-preview-merge-prompt');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const modal = ModalFactory.create({
                id: 'ttw-default-merge-prompt-modal',
                title: '🔍 默认合并提示词',
                body: `<textarea readonly style="width: 100%; height: 300px; resize: vertical; box-sizing: border-box; background: rgba(0,0,0,0.3); color: #ccc; border: 1px solid #555; padding: 10px; font-family: monospace; border-radius: 4px; white-space: pre-wrap;">${defaultMergePrompt}</textarea>`,
                footer: `<button class="ttw-btn ttw-btn-primary" id="ttw-close-merge-prompt">关闭</button>`
            });
            modal.querySelector('#ttw-close-merge-prompt').addEventListener('click', () => ModalFactory.close(modal));
        });
    }

    // 确认导入
    modal.querySelector('#ttw-confirm-merge').addEventListener('click', async () => {
        const mergeMode = modal.querySelector('input[name="merge-mode"]:checked')?.value || 'keep';
        const customPrompt = modal.querySelector('#ttw-merge-prompt')?.value || '';
        const mergeConcurrency = parseInt(modal.querySelector('#ttw-merge-concurrency')?.value) || AppState.config.parallel.concurrency;
        AppState.settings.customMergePrompt = customPrompt;
        saveCurrentSettings();

        const selectedNewIndices = [...modal.querySelectorAll('.ttw-new-entry-cb:checked')].map(cb => parseInt(cb.dataset.index));
        const selectedDupIndices = [...modal.querySelectorAll('.ttw-dup-entry-cb:checked')].map(cb => parseInt(cb.dataset.index));

        const selectedNew = selectedNewIndices.map(i => newEntries[i]).filter(Boolean);
        const selectedDup = selectedDupIndices.map(i => allDuplicates[i]).filter(Boolean);

	ModalFactory.close(modal);
	await performMergeInternal(importedWorldbook, selectedDup, selectedNew, mergeMode, customPrompt, mergeConcurrency);
    });
}

/**
 * showMergeOptionsModal
 * 
 * @param {*} importedWorldbook
 * @param {*} fileName
 * @param {*} internalDuplicates
 * @returns {*}
 */
function showMergeOptionsModal(importedWorldbook, fileName, internalDuplicates = []) {
	if (!importedWorldbook && AppState.persistent.pendingImport) {
		importedWorldbook = AppState.persistent.pendingImport.worldbook;
		fileName = AppState.persistent.pendingImport.fileName;
		internalDuplicates = AppState.persistent.pendingImport.internalDuplicates || [];
	}

	if (!importedWorldbook) {
		ErrorHandler.showUserError('没有可导入的数据');
		return;
	}

	const existingModal = document.getElementById('ttw-merge-modal');
	if (existingModal) existingModal.remove();

	// 与现有世界书的重复检测
	const duplicatesWithExisting = findDuplicateEntries(AppState.worldbook.generated, importedWorldbook);
	const newEntries = findNewEntries(AppState.worldbook.generated, importedWorldbook);

	// 合并：内部重复 + 与现有世界书的重复
	const allDuplicates = [...internalDuplicates, ...duplicatesWithExisting];

	const groupedNew = groupEntriesByCategory(newEntries);
	const groupedDup = groupEntriesByCategory(allDuplicates);

	// 计算条目总数
	const totalEntries = Object.values(importedWorldbook).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
	const internalDupCount = internalDuplicates.length;
	const externalDupCount = duplicatesWithExisting.length;

	// 构建HTML
	const newEntriesListHtml = _buildNewEntriesListHtml(newEntries, groupedNew);
	const dupEntriesListHtml = _buildDupEntriesListHtml(allDuplicates, groupedDup, internalDuplicates);
	const mergeOptionsHtml = allDuplicates.length > 0 ? _buildMergeOptionsHtml() : '';

	const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 导入分析</div>
			<div style="font-size:13px;color:#ccc;">
				• 总条目: <span style="color:#3498db;font-weight:bold;">${totalEntries}</span> 个<br>
				• 新条目: <span style="color:#27ae60;font-weight:bold;">${newEntries.length}</span> 个<br>
				• 重复条目: <span style="color:#e67e22;font-weight:bold;">${allDuplicates.length}</span> 个
				${internalDupCount > 0 ? `<span style="color:#9b59b6;font-size:11px;">(其中 ${internalDupCount} 个为文件内部重复)</span>` : ''}
				${externalDupCount > 0 ? `<span style="color:#888;font-size:11px;">(${externalDupCount} 个与现有世界书重复)</span>` : ''}
			</div>
		</div>
		${newEntriesListHtml}
		${dupEntriesListHtml}
		${mergeOptionsHtml}`;

	const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-merge">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-merge">✅ 确认导入</button>`;

	const modal = ModalFactory.create({
		id: 'ttw-merge-modal',
		title: `📥 导入世界书: ${fileName}`,
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '800px'
	});

	_bindMergeModalEvents(modal, newEntries, allDuplicates, importedWorldbook);
}


    /**
     * performMerge
     * 
     * @param {*} importedWorldbook
     * @param {*} duplicates
     * @param {*} newEntries
     * @param {*} mergeMode
     * @param {*} customPrompt
     * @param {*} concurrency
     * @returns {Promise<any>}
     */
    async function performMerge(importedWorldbook, duplicates, newEntries, mergeMode, customPrompt, concurrency = 3) {
        showProgressSection(true);
        setProcessingStatus('running');
        updateProgress(0, '开始合并...');
        updateStreamContent('', true);
        updateStreamContent(`🔀 开始合并世界书\n合并模式: ${mergeMode}\n并发数: ${concurrency}\n${'='.repeat(50)}\n`);

        for (const item of newEntries) {
            if (!AppState.worldbook.generated[item.category]) AppState.worldbook.generated[item.category] = {};
            AppState.worldbook.generated[item.category][item.name] = item.entry;
        }
        updateStreamContent(`✅ 添加了 ${newEntries.length} 个新条目\n`);

        if (duplicates.length > 0) {
            updateStreamContent(`\n🔀 处理 ${duplicates.length} 个重复条目...\n`);

            if (mergeMode === 'ai') {
                const semaphore = new Semaphore(concurrency);
                let completed = 0;
                let failed = 0;

                /**
                 * processOne
                 * 
                 * @param {*} dup
                 * @param {*} index
                 * @returns {Promise<any>}
                 */
                const processOne = async (dup, index) => {
                    if (AppState.processing.isStopped) return;

                    await semaphore.acquire();
                    if (AppState.processing.isStopped) {
                        semaphore.release();
                        return;
                    }

                    try {
                        updateStreamContent(`📝 [${index + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);
                        const mergedEntry = await mergeEntriesWithAI(dup.existing, dup.imported, customPrompt);
                        AppState.worldbook.generated[dup.category][dup.name] = mergedEntry;
                        completed++;
                        updateProgress((completed / duplicates.length) * 100, `AI合并中 (${completed}/${duplicates.length})`);
                        updateStreamContent(`   ✅ 完成\n`);
                    } catch (error) {
                        failed++;
                        updateStreamContent(`   ❌ 失败: ${error.message}\n`);
                    } finally {
                        semaphore.release();
                    }
                };

                await Promise.allSettled(duplicates.map((dup, i) => processOne(dup, i)));
                updateStreamContent(`\n📦 AI合并完成: 成功 ${completed}, 失败 ${failed}\n`);

            } else {
                for (let i = 0; i < duplicates.length; i++) {
                    if (AppState.processing.isStopped) break;

                    const dup = duplicates[i];
                    updateProgress(((i + 1) / duplicates.length) * 100, `处理: [${dup.category}] ${dup.name}`);
                    updateStreamContent(`\n📝 [${i + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);

                    if (mergeMode === 'replace') {
                        AppState.worldbook.generated[dup.category][dup.name] = dup.imported;
                        updateStreamContent(`   ✅ 已覆盖\n`);
                    } else if (mergeMode === 'keep') {
                        updateStreamContent(`   ⏭️ 保留原有\n`);
                    } else if (mergeMode === 'rename') {
                        const newName = `${dup.name}_导入`;
                        AppState.worldbook.generated[dup.category][newName] = dup.imported;
                        updateStreamContent(`   ✅ 添加为: ${newName}\n`);
                    } else if (mergeMode === 'append') {
                        const existing = AppState.worldbook.generated[dup.category][dup.name];
                        const keywords = [...new Set([...(existing['关键词'] || []), ...(dup.imported['关键词'] || [])])];
                        const content = (existing['内容'] || '') + '\n\n---\n\n' + (dup.imported['内容'] || '');
                        AppState.worldbook.generated[dup.category][dup.name] = { '关键词': keywords, '内容': content };
                        updateStreamContent(`   ✅ 内容已叠加\n`);
                    }
                }
            }
        }

        AppState.persistent.pendingImport = null;

        updateProgress(100, '合并完成！');
        updateStreamContent(`\n${'='.repeat(50)}\n✅ 合并完成！\n`);
        if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');

        showResultSection(true);
        worldbookView.updateWorldbookPreview();
        ErrorHandler.showUserSuccess('世界书合并完成！');
    }
    /**
     * performMergeInternal
     * 
     * @param {*} importedWorldbook
     * @param {*} duplicates
     * @param {*} newEntries
     * @param {*} mergeMode
     * @param {*} customPrompt
     * @param {*} concurrency
     * @returns {Promise<any>}
     */
    async function performMergeInternal(importedWorldbook, duplicates, newEntries, mergeMode, customPrompt, concurrency = 3) {
        showProgressSection(true);
        setProcessingStatus('running');
        updateProgress(0, '开始处理...');
        updateStreamContent('', true);
        updateStreamContent(`🔀 开始处理世界书\n处理模式: ${mergeMode}\n并发数: ${concurrency}\n${'='.repeat(50)}\n`);

        // 先把导入的世界书作为基础
        const resultWorldbook = JSON.parse(JSON.stringify(importedWorldbook));

        // 添加新条目到现有世界书
        for (const item of newEntries) {
            if (!AppState.worldbook.generated[item.category]) AppState.worldbook.generated[item.category] = {};
            AppState.worldbook.generated[item.category][item.name] = item.entry;
        }
        updateStreamContent(`✅ 添加了 ${newEntries.length} 个新条目到现有世界书\n`);

        if (duplicates.length > 0) {
            updateStreamContent(`\n🔀 处理 ${duplicates.length} 个重复条目...\n`);

            if (mergeMode === 'ai') {
                const semaphore = new Semaphore(concurrency);
                let completed = 0;
                let failed = 0;

                /**
                 * processOne
                 * 
                 * @param {*} dup
                 * @param {*} index
                 * @returns {Promise<any>}
                 */
                const processOne = async (dup, index) => {
                    if (AppState.processing.isStopped) return;

                    await semaphore.acquire();
                    if (AppState.processing.isStopped) {
                        semaphore.release();
                        return;
                    }

                    try {
                        updateStreamContent(`📝 [${index + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);
                        const mergedEntry = await mergeEntriesWithAI(dup.existing, dup.imported, customPrompt);

                        // 更新到结果世界书
                        if (!resultWorldbook[dup.category]) resultWorldbook[dup.category] = {};
                        resultWorldbook[dup.category][dup.name] = mergedEntry;

                        completed++;
                        updateProgress((completed / duplicates.length) * 100, `AI合并中 (${completed}/${duplicates.length})`);
                        updateStreamContent(`   ✅ 完成\n`);
                    } catch (error) {
                        failed++;
                        updateStreamContent(`   ❌ 失败: ${error.message}\n`);
                    } finally {
                        semaphore.release();
                    }
                };

                await Promise.allSettled(duplicates.map((dup, i) => processOne(dup, i)));
                updateStreamContent(`\n📦 AI合并完成: 成功 ${completed}, 失败 ${failed}\n`);

            } else {
                for (let i = 0; i < duplicates.length; i++) {
                    if (AppState.processing.isStopped) break;

                    const dup = duplicates[i];
                    updateProgress(((i + 1) / duplicates.length) * 100, `处理: [${dup.category}] ${dup.name}`);
                    updateStreamContent(`\n📝 [${i + 1}/${duplicates.length}] ${dup.category} - ${dup.name}\n`);

                    if (!resultWorldbook[dup.category]) resultWorldbook[dup.category] = {};

                    if (mergeMode === 'replace') {
                        resultWorldbook[dup.category][dup.name] = dup.imported;
                        updateStreamContent(`   ✅ 使用后者覆盖\n`);
                    } else if (mergeMode === 'keep') {
                        // 保持第一个，不做改动
                        updateStreamContent(`   ⏭️ 保留前者\n`);
                    } else if (mergeMode === 'rename') {
                        let newName = `${dup.name}_2`;
                        let counter = 2;
                        while (resultWorldbook[dup.category][newName]) {
                            counter++;
                            newName = `${dup.name}_${counter}`;
                        }
                        resultWorldbook[dup.category][newName] = dup.imported;
                        updateStreamContent(`   ✅ 添加为: ${newName}\n`);
                    } else if (mergeMode === 'append') {
                        const existing = resultWorldbook[dup.category][dup.name] || dup.existing;
                        const keywords = [...new Set([...(existing['关键词'] || []), ...(dup.imported['关键词'] || [])])];
                        const content = (existing['内容'] || '') + '\n\n---\n\n' + (dup.imported['内容'] || '');
                        resultWorldbook[dup.category][dup.name] = { '关键词': keywords, '内容': content };
                        updateStreamContent(`   ✅ 内容已叠加\n`);
                    }
                }
            }
        }

        // 把处理结果合并到现有世界书
        for (const category in resultWorldbook) {
            if (!AppState.worldbook.generated[category]) AppState.worldbook.generated[category] = {};
            for (const name in resultWorldbook[category]) {
                AppState.worldbook.generated[category][name] = resultWorldbook[category][name];
            }
        }

        AppState.persistent.pendingImport = null;

        updateProgress(100, '处理完成！');
        updateStreamContent(`\n${'='.repeat(50)}\n✅ 处理完成！\n`);
        if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');

        showResultSection(true);
        worldbookView.updateWorldbookPreview();
        ErrorHandler.showUserSuccess('世界书导入完成！');
    }


    /**
     * mergeEntriesWithAI
     * 
     * @param {*} entryA
     * @param {*} entryB
     * @param {*} customPrompt
     * @returns {Promise<any>}
     */
    async function mergeEntriesWithAI(entryA, entryB, customPrompt) {
        const promptTemplate = customPrompt?.trim() || defaultMergePrompt;
        const prompt = promptTemplate
            .replace('{ENTRY_A}', JSON.stringify(entryA, null, 2))
            .replace('{ENTRY_B}', JSON.stringify(entryB, null, 2));

        const response = await callAPI(getLanguagePrefix() + prompt);

        try {
            const result = parseAIResponse(response);
            if (result['关键词'] || result['内容']) {
                return {
                    '关键词': result['关键词'] || [...(entryA['关键词'] || []), ...(entryB['关键词'] || [])],
                    '内容': result['内容'] || entryA['内容'] || entryB['内容']
                };
            }
            return result;
        } catch (e) {
            return {
                '关键词': [...new Set([...(entryA['关键词'] || []), ...(entryB['关键词'] || [])])],
                '内容': `${entryA['内容'] || ''}\n\n---\n\n${entryB['内容'] || ''}`
            };
        }
    }

    // ========== 条目内容整理功能 - 修改为支持多选分类 ==========
    async function consolidateEntry(category, entryName, promptTemplate) {
        const entry = AppState.worldbook.generated[category]?.[entryName];
        if (!entry || !entry['内容']) return;

        const template = (promptTemplate && promptTemplate.trim()) ? promptTemplate.trim() : defaultConsolidatePrompt;
        const prompt = template.replace('{CONTENT}', entry['内容']);
        let response = await callAPI(getLanguagePrefix() + prompt);

        // 【v3.0.8修复】应用响应过滤标签（移除thinking等）
        response = filterResponseContent(response);

        const finalContent = response ? response.trim() : '';
        if (!finalContent) {
            throw new Error('AI 返回了空内容，保留原条目内容');
        }

        entry['内容'] = finalContent;
        if (Array.isArray(entry['关键词'])) {
            entry['关键词'] = [...new Set(entry['关键词'])];
        }
    }

    // 显示整理条目选择弹窗（两级：分类→条目，支持失败重试）
    let lastConsolidateFailedEntries = [];

/**
 * showConsolidateCategorySelector
 * 
 * @returns {*}
 */
function showConsolidateCategorySelector() {
	const categories = Object.keys(AppState.worldbook.generated).filter(cat => {
		const entries = AppState.worldbook.generated[cat];
		return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
	});

	if (categories.length === 0) {
		ErrorHandler.showUserError('当前世界书中没有任何条目，无法整理');
		return;
	}

	const existingModal = document.getElementById('ttw-consolidate-modal');
	if (existingModal) existingModal.remove();

	let categoriesHtml = '';
	categories.forEach(cat => {
		const entryNames = Object.keys(AppState.worldbook.generated[cat]);
		const entryCount = entryNames.length;

		let entriesListHtml = '';
		entryNames.forEach(name => {
			const isFailed = lastConsolidateFailedEntries.some(e => e.category === cat && e.name === name);
			const failedBadge = isFailed ? '<span style="color:#e74c3c;font-size:9px;margin-left:4px;">❗失败</span>' : '';
			const entryTokens = getEntryTotalTokens(AppState.worldbook.generated[cat][name]);
			entriesListHtml += `
			<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px;cursor:pointer;">
				<input type="checkbox" class="ttw-consolidate-entry-cb" data-category="${cat}" data-entry="${name}" ${isFailed ? 'checked' : ''}>
				<span style="flex:1;">${name}${failedBadge}</span>
				<span style="color:#888;font-size:10px;white-space:nowrap;">${entryTokens}t</span>
			</label>
			`;
		});

		const hasFailedInCat = lastConsolidateFailedEntries.some(e => e.category === cat);

		let catTotalTokens = 0;
		entryNames.forEach(name => { catTotalTokens += getEntryTotalTokens(AppState.worldbook.generated[cat][name]); });

		const presets = AppState.settings.consolidatePromptPresets || [];
		const currentPreset = (AppState.settings.consolidateCategoryPresetMap || {})[cat] || '默认';
		let presetOptionsHtml = `<option value="默认" ${currentPreset === '默认' ? 'selected' : ''}>默认</option>`;
		presets.forEach(p => {
			presetOptionsHtml += `<option value="${p.name}" ${currentPreset === p.name ? 'selected' : ''}>${p.name}</option>`;
		});

		categoriesHtml += `
		<div class="ttw-consolidate-cat-group" style="margin-bottom:10px;">
			<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(52,152,219,0.15);border-radius:6px;cursor:pointer;" data-cat-toggle="${cat}">
				<input type="checkbox" class="ttw-consolidate-cat-cb" data-category="${cat}" ${hasFailedInCat ? 'checked' : ''}>
				<span style="font-weight:bold;font-size:12px;flex:1;">${cat}</span>
				<select class="ttw-consolidate-cat-preset" data-category="${cat}" style="font-size:10px;padding:2px 4px;border:1px solid #666;border-radius:4px;background:rgba(0,0,0,0.4);color:#ccc;max-width:100px;cursor:pointer;" title="选择此分类使用的整理提示词预设">${presetOptionsHtml}</select>
				<span style="color:#888;font-size:11px;">(${entryCount}条 ~${catTotalTokens}t)</span>
				${hasFailedInCat ? '<span style="color:#e74c3c;font-size:10px;">有失败</span>' : ''}
				<span class="ttw-cat-expand-icon" style="font-size:10px;transition:transform 0.2s;">▶</span>
			</div>
			<div class="ttw-cat-entries-list" data-cat-list="${cat}" style="display:none;margin-left:20px;margin-top:4px;max-height:200px;overflow-y:auto;">
				<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:4px;">
					<button class="ttw-btn-tiny ttw-select-all-entries" data-category="${cat}">全选</button>
					<button class="ttw-btn-tiny ttw-deselect-all-entries" data-category="${cat}">全不选</button>
					${hasFailedInCat ? '<button class="ttw-btn-tiny ttw-select-failed-entries" data-category="' + cat + '" style="color:#e74c3c;">选失败项</button>' : ''}
				</div>
				${entriesListHtml}
			</div>
		</div>
		`;
	});

	const hasAnyFailed = lastConsolidateFailedEntries.length > 0;

	const bodyHtml = `
		<div style="margin-bottom:12px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">展开分类可多选具体条目。AI将去除重复信息并优化格式。</div>
		</div>
		<div style="margin-bottom:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-weight:bold;font-size:12px;color:#e67e22;">📝 整理提示词预设</span>
				<div style="display:flex;gap:6px;">
					<button class="ttw-btn ttw-btn-small" id="ttw-consolidate-add-preset" style="font-size:10px;background:rgba(52,152,219,0.5);">➕ 添加预设</button>
				</div>
			</div>
			<div style="font-size:10px;color:#888;margin-bottom:8px;">
				每个分类可指定不同预设。<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;color:#f39c12;">{CONTENT}</code> 会被替换为条目原始内容。「默认」预设不可删除。
			</div>
			<div id="ttw-consolidate-presets-list" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;"></div>
		</div>
		${hasAnyFailed ? `
		<div style="margin-bottom:12px;padding:10px;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.3);border-radius:6px;">
			<div style="display:flex;justify-content:space-between;align-items:center;">
				<span style="color:#e74c3c;font-weight:bold;font-size:12px;">❗ 上次有 ${lastConsolidateFailedEntries.length} 个条目失败</span>
				<button class="ttw-btn ttw-btn-small ttw-btn-warning" id="ttw-select-all-failed">🔧 只选失败项</button>
			</div>
		</div>
		` : ''}
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
			<span style="font-weight:bold;">选择分类和条目 <span id="ttw-consolidate-selected-count" style="color:#888;font-size:11px;font-weight:normal;"></span></span>
			<div style="display:flex;gap:8px;">
				<button class="ttw-btn-tiny" id="ttw-check-all-cats">全选所有</button>
				<button class="ttw-btn-tiny" id="ttw-uncheck-all-cats">全不选</button>
			</div>
		</div>
		<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">
			${categoriesHtml}
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-consolidate">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-start-consolidate">🧹 开始整理</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-consolidate-modal',
		title: '🧹 整理条目 - 选择条目',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '600px'
	});

	/**
	 * updateSelectedCount
	 * 
	 * @returns {*}
	 */
	function updateSelectedCount() {
		const count = modal.querySelectorAll('.ttw-consolidate-entry-cb:checked').length;
		const countEl = modal.querySelector('#ttw-consolidate-selected-count');
		if (countEl) countEl.textContent = `(已选 ${count} 条)`;
	}

	modal.querySelectorAll('[data-cat-toggle]').forEach(header => {
		header.addEventListener('click', (e) => {
			if (e.target.type === 'checkbox') return;
			const cat = header.dataset.catToggle;
			const list = modal.querySelector(`[data-cat-list="${cat}"]`);
			const icon = header.querySelector('.ttw-cat-expand-icon');
			if (list.style.display === 'none') {
				list.style.display = 'block';
				icon.style.transform = 'rotate(90deg)';
			} else {
				list.style.display = 'none';
				icon.style.transform = 'rotate(0deg)';
			}
		});
	});

	modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach(cb => {
		cb.addEventListener('change', (e) => {
			const cat = e.target.dataset.category;
			modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach(entryCb => {
				entryCb.checked = e.target.checked;
			});
			updateSelectedCount();
		});
	});

	modal.querySelectorAll('.ttw-consolidate-entry-cb').forEach(cb => {
		cb.addEventListener('change', updateSelectedCount);
	});

	modal.querySelectorAll('.ttw-select-all-entries').forEach(btn => {
		btn.addEventListener('click', () => {
			const cat = btn.dataset.category;
			modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach(cb => cb.checked = true);
			updateSelectedCount();
		});
	});
	modal.querySelectorAll('.ttw-deselect-all-entries').forEach(btn => {
		btn.addEventListener('click', () => {
			const cat = btn.dataset.category;
			modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach(cb => cb.checked = false);
			updateSelectedCount();
		});
	});
	modal.querySelectorAll('.ttw-select-failed-entries').forEach(btn => {
		btn.addEventListener('click', () => {
			const cat = btn.dataset.category;
			modal.querySelectorAll(`.ttw-consolidate-entry-cb[data-category="${cat}"]`).forEach(cb => {
				const isFailed = lastConsolidateFailedEntries.some(e => e.category === cat && e.name === cb.dataset.entry);
				cb.checked = isFailed;
			});
			updateSelectedCount();
		});
	});

	modal.querySelector('#ttw-check-all-cats').addEventListener('click', () => {
		modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change')); });
	});
	modal.querySelector('#ttw-uncheck-all-cats').addEventListener('click', () => {
		modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach(cb => { cb.checked = false; cb.dispatchEvent(new Event('change')); });
	});

	const selectAllFailedBtn = modal.querySelector('#ttw-select-all-failed');
	if (selectAllFailedBtn) {
		selectAllFailedBtn.addEventListener('click', () => {
			modal.querySelectorAll('.ttw-consolidate-entry-cb').forEach(cb => cb.checked = false);
			modal.querySelectorAll('.ttw-consolidate-cat-cb').forEach(cb => cb.checked = false);
			lastConsolidateFailedEntries.forEach(failed => {
				const cb = modal.querySelector(`.ttw-consolidate-entry-cb[data-category="${failed.category}"][data-entry="${failed.name}"]`);
				if (cb) cb.checked = true;
			});
			updateSelectedCount();
		});
	}

	modal.querySelector('#ttw-cancel-consolidate').addEventListener('click', () => ModalFactory.close(modal));

        // ========== 预设管理 ==========
        function getPresetPromptByName(name) {
            if (!name || name === '默认') return defaultConsolidatePrompt;
            const preset = (AppState.settings.consolidatePromptPresets || []).find(p => p.name === name);
            return (preset && preset.prompt && preset.prompt.trim()) ? preset.prompt : defaultConsolidatePrompt;
        }

        /**
         * renderPresetsListUI
         * 
         * @returns {*}
         */
        function renderPresetsListUI() {
            const container = modal.querySelector('#ttw-consolidate-presets-list');
            if (!container) return;
            const presets = AppState.settings.consolidatePromptPresets || [];
            let html = '';

            // 默认预设（不可删除）
            html += `
                <div class="ttw-consolidate-preset-card" style="padding:8px 10px;background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);border-radius:6px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="font-weight:bold;font-size:11px;color:#2ecc71;flex:1;">📌 默认</span>
                        <span style="font-size:10px;color:#888;">内置·不可删除</span>
                        <button class="ttw-btn-tiny ttw-consolidate-toggle-preview" data-preset-index="-1" style="font-size:9px;">展开</button>
                    </div>
                    <div class="ttw-consolidate-preset-preview" data-preview-index="-1" style="display:none;">
                        <textarea rows="3" style="width:100%;padding:6px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#aaa;font-size:10px;resize:vertical;line-height:1.4;" readonly>${defaultConsolidatePrompt}</textarea>
                    </div>
                </div>
            `;

            // 用户自定义预设
            presets.forEach((preset, idx) => {
                html += `
                    <div class="ttw-consolidate-preset-card" style="padding:8px 10px;background:rgba(230,126,34,0.1);border:1px solid rgba(230,126,34,0.3);border-radius:6px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <input type="text" class="ttw-consolidate-preset-name" data-preset-index="${idx}" value="${preset.name}" style="font-weight:bold;font-size:11px;color:#e67e22;background:transparent;border:1px solid transparent;border-radius:3px;padding:2px 4px;flex:1;min-width:0;" title="点击编辑预设名称">
                            <button class="ttw-btn-tiny ttw-consolidate-toggle-preview" data-preset-index="${idx}" style="font-size:9px;">展开</button>
                            <button class="ttw-btn-tiny ttw-consolidate-delete-preset" data-preset-index="${idx}" style="font-size:9px;color:#e74c3c;" title="删除预设">🗑️</button>
                        </div>
                        <div class="ttw-consolidate-preset-preview" data-preview-index="${idx}" style="display:none;">
                            <textarea class="ttw-consolidate-preset-prompt" data-preset-index="${idx}" rows="3" style="width:100%;padding:6px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;font-size:10px;resize:vertical;line-height:1.4;" placeholder="输入提示词...必须包含 {CONTENT} 占位符">${preset.prompt || ''}</textarea>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // 展开/收起预览
            container.querySelectorAll('.ttw-consolidate-toggle-preview').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = btn.dataset.presetIndex;
                    const preview = container.querySelector(`[data-preview-index="${idx}"]`);
                    if (preview) {
                        const isHidden = preview.style.display === 'none';
                        preview.style.display = isHidden ? 'block' : 'none';
                        btn.textContent = isHidden ? '收起' : '展开';
                    }
                });
            });

            // 编辑预设名称
            container.querySelectorAll('.ttw-consolidate-preset-name').forEach(input => {
                input.addEventListener('focus', () => { input.style.borderColor = '#e67e22'; });
                input.addEventListener('blur', () => {
                    input.style.borderColor = 'transparent';
                    const idx = parseInt(input.dataset.presetIndex);
                    const newName = input.value.trim();
                    if (!newName) { input.value = presets[idx].name; return; }
                    if (newName === '默认') { ErrorHandler.showUserError('不能使用"默认"作为预设名'); input.value = presets[idx].name; return; }
                    if (presets.some((p, i) => i !== idx && p.name === newName)) { ErrorHandler.showUserError('预设名已存在'); input.value = presets[idx].name; return; }
                    const oldName = presets[idx].name;
                    presets[idx].name = newName;
                    // 同步更新分类映射中引用旧名称的
                    const map = AppState.settings.consolidateCategoryPresetMap || {};
                    Object.keys(map).forEach(cat => { if (map[cat] === oldName) map[cat] = newName; });
                    AppState.settings.consolidatePromptPresets = presets;
                    saveCurrentSettings();
                    refreshCategoryPresetDropdowns();
                });
            });

            // 编辑预设内容
            container.querySelectorAll('.ttw-consolidate-preset-prompt').forEach(textarea => {
                textarea.addEventListener('input', () => {
                    const idx = parseInt(textarea.dataset.presetIndex);
                    presets[idx].prompt = textarea.value;
                    AppState.settings.consolidatePromptPresets = presets;
                    saveCurrentSettings();
                });
            });

            // 删除预设
container.querySelectorAll('.ttw-consolidate-delete-preset').forEach(btn => {
btn.addEventListener('click', async () => {
const idx = parseInt(btn.dataset.presetIndex);
const deletedName = presets[idx].name;
const confirmed = await ModalFactory.confirm({ title: '删除预设', message: `确定删除预设「${deletedName}」？`, danger: true });
if (!confirmed) return;
presets.splice(idx, 1);
const map = AppState.settings.consolidateCategoryPresetMap || {};
Object.keys(map).forEach(cat => { if (map[cat] === deletedName) delete map[cat]; });
AppState.settings.consolidatePromptPresets = presets;
saveCurrentSettings();
renderPresetsListUI();
refreshCategoryPresetDropdowns();
});
});
        }

        // 刷新所有分类的预设下拉
        function refreshCategoryPresetDropdowns() {
            const presets = AppState.settings.consolidatePromptPresets || [];
            const map = AppState.settings.consolidateCategoryPresetMap || {};
            modal.querySelectorAll('.ttw-consolidate-cat-preset').forEach(select => {
                const cat = select.dataset.category;
                const current = map[cat] || '默认';
                let optionsHtml = `<option value="默认" ${current === '默认' ? 'selected' : ''}>默认</option>`;
                presets.forEach(p => {
                    optionsHtml += `<option value="${p.name}" ${current === p.name ? 'selected' : ''}>${p.name}</option>`;
                });
                select.innerHTML = optionsHtml;
            });
        }

        // 添加预设
        modal.querySelector('#ttw-consolidate-add-preset').addEventListener('click', async () => {
            const name = await promptAction({ title: '添加预设', message: '输入预设名称:', placeholder: '例如：角色整理', defaultValue: '' });
            if (!name || !name.trim()) return;
            const trimmedName = name.trim();
            if (trimmedName === '默认') { ErrorHandler.showUserError('不能使用"默认"作为预设名'); return; }
            if (!AppState.settings.consolidatePromptPresets) AppState.settings.consolidatePromptPresets = [];
            if (AppState.settings.consolidatePromptPresets.some(p => p.name === trimmedName)) { ErrorHandler.showUserError('预设名已存在'); return; }
            AppState.settings.consolidatePromptPresets.push({ name: trimmedName, prompt: '' });
            saveCurrentSettings();
            renderPresetsListUI();
            refreshCategoryPresetDropdowns();
            // 自动展开新预设的编辑区
            setTimeout(() => {
                const idx = AppState.settings.consolidatePromptPresets.length - 1;
                const btn = modal.querySelector(`.ttw-consolidate-toggle-preview[data-preset-index="${idx}"]`);
                if (btn) btn.click();
            }, 100);
        });

        // 分类预设下拉变更 → 保存映射
        modal.querySelectorAll('.ttw-consolidate-cat-preset').forEach(select => {
            select.addEventListener('change', () => {
                const cat = select.dataset.category;
                if (!AppState.settings.consolidateCategoryPresetMap) AppState.settings.consolidateCategoryPresetMap = {};
                if (select.value === '默认') {
                    delete AppState.settings.consolidateCategoryPresetMap[cat];
                } else {
                    AppState.settings.consolidateCategoryPresetMap[cat] = select.value;
                }
                saveCurrentSettings();
            });
        });

        renderPresetsListUI();

        modal.querySelector('#ttw-start-consolidate').addEventListener('click', async () => {
            const selectedEntries = [...modal.querySelectorAll('.ttw-consolidate-entry-cb:checked')].map(cb => {
                const cat = cb.dataset.category;
                const presetSelect = modal.querySelector(`.ttw-consolidate-cat-preset[data-category="${cat}"]`);
                const presetName = presetSelect ? presetSelect.value : '默认';
                return {
                    category: cat,
                    name: cb.dataset.entry,
                    promptTemplate: getPresetPromptByName(presetName)
                };
            });
            if (selectedEntries.length === 0) {
                ErrorHandler.showUserError('请至少选择一个条目');
                return;
            }
            // 汇总各预设使用情况
            const presetUsage = {};
            selectedEntries.forEach(e => {
                const pSelect = modal.querySelector(`.ttw-consolidate-cat-preset[data-category="${e.category}"]`);
                const pName = pSelect ? pSelect.value : '默认';
                presetUsage[pName] = (presetUsage[pName] || 0) + 1;
            });
            const usageSummary = Object.entries(presetUsage).map(([k, v]) => `「${k}」${v}条`).join('，');
            if (!await confirmAction(`确定要整理 ${selectedEntries.length} 个条目吗？\n\n预设分配：${usageSummary}`, { title: '整理条目' })) return;
            modal.remove();
            await consolidateSelectedEntries(selectedEntries);
        });

        updateSelectedCount();
    }


    /**
     * consolidateSelectedCategories
     * 
     * @param {*} categories
     * @returns {Promise<any>}
     */
    async function consolidateSelectedCategories(categories) {
        const allEntries = [];
        for (const cat of categories) {
            for (const name of Object.keys(AppState.worldbook.generated[cat] || {})) {
                allEntries.push({ category: cat, name });
            }
        }
        if (allEntries.length === 0) { ErrorHandler.showUserError('没有条目'); return; }
        if (!await confirmAction(`确定要整理 ${allEntries.length} 个条目吗？`, { title: '整理条目' })) return;
        await consolidateSelectedEntries(allEntries);
    }

    /**
     * consolidateSelectedEntries
     * 
     * @param {*} entries
     * @returns {Promise<any>}
     */
    async function consolidateSelectedEntries(entries) {
        showProgressSection(true);
        setProcessingStatus('running');
        updateProgress(0, '开始整理条目...');
        updateStreamContent('', true);
        updateStreamContent(`🧹 开始整理 ${entries.length} 个条目\n${'='.repeat(50)}\n`);

        const semaphore = new Semaphore(AppState.config.parallel.concurrency);
        let completed = 0;
        let failed = 0;
        const failedEntries = [];

        /**
         * processOne
         * 
         * @param {*} entry
         * @param {*} index
         * @returns {Promise<any>}
         */
        const processOne = async (entry, index) => {
            if (AppState.processing.isStopped) return;

            try {
                await semaphore.acquire();
            } catch (e) {
                if (e.message === 'ABORTED') return;
                throw e;
            }

            if (AppState.processing.isStopped) {
                semaphore.release();
                return;
            }

            try {
                updateStreamContent(`📝 [${index + 1}/${entries.length}] ${entry.category} - ${entry.name}\n`);
                await consolidateEntry(entry.category, entry.name, entry.promptTemplate);
                completed++;
                updateProgress(((completed + failed) / entries.length) * 100, `整理中 (${completed}✅ ${failed}❌ / ${entries.length})`);
                updateStreamContent(`   ✅ 完成\n`);
            } catch (error) {
                failed++;
                failedEntries.push({ category: entry.category, name: entry.name, error: error.message });
                updateProgress(((completed + failed) / entries.length) * 100, `整理中 (${completed}✅ ${failed}❌ / ${entries.length})`);
                updateStreamContent(`   ❌ 失败: ${error.message}\n`);
            } finally {
                semaphore.release();
            }
        };

        await Promise.allSettled(entries.map((entry, i) => processOne(entry, i)));

        // 记录失败条目供下次重试
        lastConsolidateFailedEntries = failedEntries;

        updateProgress(100, `整理完成: 成功 ${completed}, 失败 ${failed}`);
        updateStreamContent(`\n${'='.repeat(50)}\n✅ 整理完成！成功 ${completed}, 失败 ${failed}\n`);

        if (failedEntries.length > 0) {
            updateStreamContent(`\n❗ 失败条目:\n`);
            failedEntries.forEach(f => {
                updateStreamContent(`   • [${f.category}] ${f.name}: ${f.error}\n`);
            });
            updateStreamContent(`\n💡 再次打开"整理条目"可以只选失败项重试\n`);
        }
        if (getProcessingStatus() !== 'stopped') setProcessingStatus('idle');

        worldbookView.updateWorldbookPreview();

        let msg = `条目整理完成！\n成功: ${completed}\n失败: ${failed}`;
        if (failed > 0) {
            msg += `\n\n再次点击"整理条目"可以只选失败项重试`;
        }
        ErrorHandler.showUserError(msg);
    }

// ========== 清除标签功能（不消耗Token） ==========
function showCleanTagsModal() {
	const existingModal = document.getElementById('ttw-clean-tags-modal');
	if (existingModal) existingModal.remove();

	const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">
				纯本地处理，不调用AI，不消耗Token。<br>
				扫描后逐条列出匹配，可以单独确认或取消每一条删除。
			</div>
		</div>

		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;font-weight:bold;">要清除的标签名（每行一个）</label>
			<textarea id="ttw-clean-tags-input" rows="4" class="ttw-textarea-small" placeholder="每行一个标签名，例如：
thinking
tucao
tochao">thinking\ntucao\ntochao</textarea>
		</div>

		<div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;font-size:12px;">📋 匹配规则</div>
			<ul style="margin:0;padding-left:18px;font-size:11px;color:#ccc;line-height:1.8;">
				<li><code>&lt;tag&gt;内容&lt;/tag&gt;</code> → 移除标签和标签内的内容</li>
				<li>文本开头就是 <code>...内容&lt;/tag&gt;</code> → 移除开头到该结束标签</li>
				<li>文本末尾有 <code>&lt;tag&gt;内容...</code> 无闭合 → 移除该开始标签到末尾</li>
			</ul>
			<div style="font-size:11px;color:#f39c12;margin-top:6px;">⚠️ 每条匹配都会显示前后文字，请逐条确认再删除</div>
		</div>

		<div style="margin-bottom:16px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-clean-in-worldbook" checked>
				<span>扫描世界书</span>
			</label>
			<label class="ttw-checkbox-label" style="margin-top:8px;">
				<input type="checkbox" id="ttw-clean-in-results" checked>
				<span>扫描各章节处理结果</span>
			</label>
		</div>

		<div id="ttw-clean-tags-results" style="display:none;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
				<span id="ttw-clean-scan-summary" style="font-weight:bold;color:#27ae60;"></span>
				<div style="display:flex;gap:8px;">
					<button class="ttw-btn-tiny" id="ttw-clean-select-all">全选</button>
					<button class="ttw-btn-tiny" id="ttw-clean-deselect-all">全不选</button>
				</div>
			</div>
			<div id="ttw-clean-match-list" style="max-height:350px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;"></div>
		</div>`;

	const footerHtml = `
		<button class="ttw-btn ttw-btn-primary" id="ttw-scan-tags">🔍 扫描</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-execute-clean-tags" style="display:none;">🗑️ 删除选中项</button>
		<button class="ttw-btn" id="ttw-close-clean-tags">关闭</button>`;

	const modal = ModalFactory.create({
		id: 'ttw-clean-tags-modal',
		title: '🏷️ 清除标签内容（不消耗Token）',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '750px'
	});

	let scanResults = [];

	modal.querySelector('#ttw-close-clean-tags').addEventListener('click', () => ModalFactory.close(modal));

	// 扫描
	modal.querySelector('#ttw-scan-tags').addEventListener('click', () => {
		const tagNames = parseTagNames(modal.querySelector('#ttw-clean-tags-input').value);
		if (tagNames.length === 0) { ErrorHandler.showUserError('请输入至少一个标签名'); return; }

		const inWorldbook = modal.querySelector('#ttw-clean-in-worldbook').checked;
		const inResults = modal.querySelector('#ttw-clean-in-results').checked;

		scanResults = scanForTags(tagNames, inWorldbook, inResults);

		const resultsDiv = modal.querySelector('#ttw-clean-tags-results');
		const summaryEl = modal.querySelector('#ttw-clean-scan-summary');
		const listEl = modal.querySelector('#ttw-clean-match-list');
		const execBtn = modal.querySelector('#ttw-execute-clean-tags');

		resultsDiv.style.display = 'block';

		if (scanResults.length === 0) {
			summaryEl.textContent = '未找到匹配的标签内容';
			summaryEl.style.color = '#888';
			listEl.innerHTML = '';
			execBtn.style.display = 'none';
			return;
		}

		summaryEl.textContent = `找到 ${scanResults.length} 处匹配`;
		summaryEl.style.color = '#27ae60';
		execBtn.style.display = 'inline-block';
		execBtn.textContent = `🗑️ 删除选中项 (${scanResults.length})`;

		renderMatchList(listEl, scanResults, execBtn);
	});

	// 全选/全不选
	modal.querySelector('#ttw-clean-select-all').addEventListener('click', () => {
		modal.querySelectorAll('.ttw-clean-match-cb').forEach(cb => cb.checked = true);
		updateExecBtnCount(modal, scanResults);
	});
	modal.querySelector('#ttw-clean-deselect-all').addEventListener('click', () => {
		modal.querySelectorAll('.ttw-clean-match-cb').forEach(cb => cb.checked = false);
		updateExecBtnCount(modal, scanResults);
	});

	// 执行删除
	modal.querySelector('#ttw-execute-clean-tags').addEventListener('click', async () => {
		const selectedIndices = [...modal.querySelectorAll('.ttw-clean-match-cb:checked')].map(cb => parseInt(cb.dataset.index));
		if (selectedIndices.length === 0) { ErrorHandler.showUserError('请至少选择一项'); return; }

		if (!await confirmAction(`确定要删除选中的 ${selectedIndices.length} 处标签内容吗？\n\n请确认预览无误！此操作不可撤销！`, { title: '删除标签内容', danger: true })) return;

		// 按从后往前排序，避免删除偏移
		const toDelete = selectedIndices.map(i => scanResults[i]).filter(Boolean);
		const grouped = groupMatchesBySource(toDelete);

		let deletedCount = 0;
		for (const key in grouped) {
			const matches = grouped[key];
			// 同一个文本内的匹配，从后往前删
			matches.sort((a, b) => b.startInText - a.startInText);

			const textRef = getTextRef(matches[0]);
			if (!textRef) continue;

			let text = textRef.get();
			for (const m of matches) {
				const before = text.substring(0, m.startInText);
				const after = text.substring(m.endInText);
				text = before + after;
				deletedCount++;
			}
			// 清理多余空行
			text = text.replace(/\n{3,}/g, '\n\n').trim();
			textRef.set(text);
		}

		ModalFactory.close(modal);
		worldbookView.updateWorldbookPreview();
		ErrorHandler.showUserSuccess(`清除完成！共删除 ${deletedCount} 处标签内容`);
	});
}

    /**
     * parseTagNames
     * 
     * @param {*} input
     * @returns {*}
     */
    function parseTagNames(input) {
        return input.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(line));
    }

    /**
     * scanForTags
     * 
     * @param {*} tagNames
     * @param {*} inWorldbook
     * @param {*} inResults
     * @returns {*}
     */
    function scanForTags(tagNames, inWorldbook, inResults) {
        const allMatches = [];

        /**
         * scanText
         * 
         * @param {*} text
         * @param {*} source
         * @param {*} category
         * @param {*} entryName
         * @param {*} memoryIndex
         * @returns {*}
         */
        const scanText = (text, source, category, entryName, memoryIndex) => {
            if (!text || typeof text !== 'string') return;

            for (const tag of tagNames) {
                const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // 规则1：完整闭合 <tag>...</tag>
                const fullRegex = new RegExp(`<${escaped}>[\\s\\S]*?</${escaped}>`, 'gi');
                let match;
                while ((match = fullRegex.exec(text)) !== null) {
                    allMatches.push({
                        source, category, entryName, memoryIndex, tag,
                        type: 'full',
                        startInText: match.index,
                        endInText: match.index + match[0].length,
                        matchedText: match[0],
                        fullText: text
                    });
                }

                // 规则2：文本开头到</tag>（不闭合的结束标签）
                // 只在文本前500字符内找</tag>，且前面没有对应的<tag>
                const closeTagRegex = new RegExp(`</${escaped}>`, 'i');
                const closeMatch = text.substring(0, 500).match(closeTagRegex);
                if (closeMatch) {
                    const closePos = closeMatch.index + closeMatch[0].length;
                    const textBefore = text.substring(0, closeMatch.index);
                    const openTagCheck = new RegExp(`<${escaped}[\\s>]`, 'i');
                    // 如果前面没有开始标签，说明是不闭合的
                    if (!openTagCheck.test(textBefore)) {
                        allMatches.push({
                            source, category, entryName, memoryIndex, tag,
                            type: 'close-only',
                            startInText: 0,
                            endInText: closePos,
                            matchedText: text.substring(0, closePos),
                            fullText: text
                        });
                    }
                }

                // 规则3：<tag>到文本末尾（不闭合的开始标签）
                // 只在文本后500字符内找<tag>，且后面没有对应的</tag>
                const tailStart = Math.max(0, text.length - 500);
                const tailText = text.substring(tailStart);
                const openTagRegex = new RegExp(`<${escaped}>`, 'i');
                const openMatch = tailText.match(openTagRegex);
                if (openMatch) {
                    const absPos = tailStart + openMatch.index;
                    const textAfter = text.substring(absPos);
                    const closeTagCheck = new RegExp(`</${escaped}>`, 'i');
                    // 如果后面没有结束标签，说明是不闭合的
                    if (!closeTagCheck.test(textAfter.substring(openMatch[0].length))) {
                        // 排除和规则1重复的（已被完整匹配过）
                        const alreadyMatched = allMatches.some(m =>
                            m.source === source && m.category === category &&
                            m.entryName === entryName && m.memoryIndex === memoryIndex &&
                            m.startInText <= absPos && m.endInText >= text.length
                        );
                        if (!alreadyMatched) {
                            allMatches.push({
                                source, category, entryName, memoryIndex, tag,
                                type: 'open-only',
                                startInText: absPos,
                                endInText: text.length,
                                matchedText: text.substring(absPos),
                                fullText: text
                            });
                        }
                    }
                }
            }
        };

        if (inWorldbook) {
            for (const cat in AppState.worldbook.generated) {
                for (const name in AppState.worldbook.generated[cat]) {
                    const entry = AppState.worldbook.generated[cat][name];
                    if (entry && entry['内容']) {
                        scanText(entry['内容'], 'worldbook', cat, name, -1);
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;
                for (const cat in memory.result) {
                    for (const name in memory.result[cat]) {
                        const entry = memory.result[cat][name];
                        if (entry && entry['内容']) {
                            scanText(entry['内容'], 'memory', cat, name, i);
                        }
                    }
                }
            }
        }

        return allMatches;
    }

    /**
     * renderMatchList
     * 
     * @param {*} container
     * @param {*} matches
     * @param {*} execBtn
     * @returns {*}
     */
    function renderMatchList(container, matches, execBtn) {
        let html = '';
        const CONTEXT_CHARS = 40;

        matches.forEach((m, idx) => {
            const locationStr = m.source === 'worldbook'
                ? `世界书 / ${m.category} / ${m.entryName}`
                : `记忆${m.memoryIndex + 1} / ${m.category} / ${m.entryName}`;

            const typeLabels = { 'full': '完整标签', 'close-only': '开头不闭合', 'open-only': '末尾不闭合' };
            const typeColors = { 'full': '#3498db', 'close-only': '#e67e22', 'open-only': '#9b59b6' };

            // 前文
            const beforeStart = Math.max(0, m.startInText - CONTEXT_CHARS);
            const beforeText = m.fullText.substring(beforeStart, m.startInText);
            const beforePrefix = beforeStart > 0 ? '...' : '';

            // 被删内容（截断显示）
            const deletedFull = m.matchedText;
            const deletedDisplay = deletedFull.length > 200
                ? deletedFull.substring(0, 100) + `\n... (${deletedFull.length}字) ...\n` + deletedFull.substring(deletedFull.length - 80)
                : deletedFull;

            // 后文
            const afterEnd = Math.min(m.fullText.length, m.endInText + CONTEXT_CHARS);
            const afterText = m.fullText.substring(m.endInText, afterEnd);
            const afterSuffix = afterEnd < m.fullText.length ? '...' : '';

            const escapedBefore = (beforePrefix + beforeText).replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');
            const escapedDeleted = deletedDisplay.replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');
            const escapedAfter = (afterText + afterSuffix).replace(/</g, '<').replace(/>/g, '>').replace(/\n/g, '↵');

            html += `
                <div style="margin-bottom:10px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid ${typeColors[m.type] || '#888'};">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <input type="checkbox" class="ttw-clean-match-cb" data-index="${idx}" checked style="width:16px;height:16px;accent-color:#e74c3c;flex-shrink:0;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${locationStr}">${locationStr}</div>
                            <div style="font-size:10px;margin-top:2px;">
                                <span style="color:${typeColors[m.type]};font-weight:bold;">${typeLabels[m.type]}</span>
                                <span style="color:#888;margin-left:6px;"><${m.tag}> · ${m.matchedText.length}字</span>
                            </div>
                        </div>
                    </div>
                    <div style="font-family:monospace;font-size:11px;line-height:1.6;background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;word-break:break-all;overflow-x:auto;">
                        <span style="color:#888;">${escapedBefore}</span><span style="background:rgba(231,76,60,0.4);color:#ff6b6b;text-decoration:line-through;border:1px dashed #e74c3c;padding:1px 2px;border-radius:2px;">${escapedDeleted}</span><span style="color:#888;">${escapedAfter}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // 绑定checkbox事件更新计数
        container.querySelectorAll('.ttw-clean-match-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                updateExecBtnCount(container.closest('.ttw-modal-container'), matches);
            });
        });
    }

    /**
     * updateExecBtnCount
     * 
     * @param {*} modal
     * @param {*} allMatches
     * @returns {*}
     */
    function updateExecBtnCount(modal, allMatches) {
        const execBtn = modal.querySelector('#ttw-execute-clean-tags');
        if (!execBtn) return;
        const checkedCount = modal.querySelectorAll('.ttw-clean-match-cb:checked').length;
        execBtn.textContent = `🗑️ 删除选中项 (${checkedCount})`;
    }

    /**
     * groupMatchesBySource
     * 
     * @param {*} matches
     * @returns {*}
     */
    function groupMatchesBySource(matches) {
        const groups = {};
        for (const m of matches) {
            const key = m.source === 'worldbook'
                ? `wb::${m.category}::${m.entryName}`
                : `mem${m.memoryIndex}::${m.category}::${m.entryName}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        }
        return groups;
    }

    /**
     * getTextRef
     * 
     * @param {*} match
     * @returns {*}
     */
    function getTextRef(match) {
        if (match.source === 'worldbook') {
            const entry = AppState.worldbook.generated[match.category]?.[match.entryName];
            if (!entry) return null;
            return {
                get: () => entry['内容'] || '',
                set: (val) => { entry['内容'] = val; }
            };
        } else {
            const memory = AppState.memory.queue[match.memoryIndex];
            if (!memory?.result) return null;
            const entry = memory.result[match.category]?.[match.entryName];
            if (!entry) return null;
            return {
                get: () => entry['内容'] || '',
                set: (val) => { entry['内容'] = val; }
            };
        }
    }


    // ========== 别名识别与合并 ==========
    function findPotentialDuplicateCharacters() {
        return mergeService.findPotentialDuplicates('角色');
    }

    /**
     * findPotentialDuplicates
     * 
     * @param {*} categoryName
     * @returns {*}
     */
    function findPotentialDuplicates(categoryName) {
        return mergeService.findPotentialDuplicates(categoryName);
    }

    /**
     * checkShortNameMatch
     * 
     * @param {*} nameA
     * @param {*} nameB
     * @returns {*}
     */
    function checkShortNameMatch(nameA, nameB) {
        return mergeService.checkShortNameMatch(nameA, nameB);
    }

    /**
     * verifyDuplicatesWithAI
     * 
     * @param {*} suspectedGroups
     * @param {*} useParallel
     * @param {*} threshold
     * @param {*} categoryName
     * @returns {Promise<any>}
     */
    async function handleVerifyDuplicates(suspectedGroups, useParallel = true, threshold = 5, categoryName = '角色') {
        return mergeService.verifyDuplicatesWithAI(suspectedGroups, useParallel, threshold, categoryName);
    }



    /**
     * mergeConfirmedDuplicates
     * 
     * @param {*} aiResult
     * @param {*} categoryName
     * @returns {Promise<any>}
     */
    async function handleMergeDuplicates(aiResult, categoryName = '角色') {
        return mergeService.mergeConfirmedDuplicates(aiResult, categoryName);
    }


// ========== 新增：手动合并条目功能 ==========
const mergeService = createMergeService({
    AppState,
    Logger,
    getAllVolumesWorldbook,
    getLanguagePrefix,
    updateStreamContent,
    Semaphore,
    callAPI,
    parseAIResponse,
});

function getManualMergeViewWorldbook() {
	return mergeService.getManualMergeViewWorldbook();
}

function resolveDisplayedEntrySource(category, displayedName) {
	return mergeService.resolveDisplayedEntrySource(category, displayedName);
}

function resolveManualMergeEntryRef(entryRef) {
	return mergeService.resolveManualMergeEntryRef(entryRef);
}

function showManualMergeUI(onMergeComplete) {
	const existingModal = document.getElementById('ttw-manual-merge-modal');
	if (existingModal) existingModal.remove();

	const worldbook = getManualMergeViewWorldbook();
	const categories = Object.keys(worldbook).filter(cat => {
		const entries = worldbook[cat];
		return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
	});

	if (categories.length === 0) {
		ErrorHandler.showUserError('当前世界书中没有条目，无法进行手动合并');
		return;
	}

	let entriesHtml = '';
	let totalEntries = 0;
	for (const cat of categories) {
		const entries = worldbook[cat];
		const entryNames = naturalSortEntryNames(Object.keys(entries));
		totalEntries += entryNames.length;

		entriesHtml += `<div class="ttw-mm-category" style="margin-bottom:10px;">
		<div class="ttw-collapse-toggle" style="background:linear-gradient(135deg,#e67e22,#d35400);padding:8px 12px;border-radius:6px 6px 0 0;cursor:pointer;font-weight:bold;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
			<span>📁 ${cat} (${entryNames.length})</span>
			<span style="font-size:11px;color:rgba(255,255,255,0.7);">点击展开/收起</span>
		</div>
		<div style="background:#2d2d2d;border:1px solid #555;border-top:none;border-radius:0 0 6px 6px;display:none;max-height:300px;overflow-y:auto;">`;

		for (const name of entryNames) {
			const sourceInfo = resolveDisplayedEntrySource(cat, name);
			const entry = sourceInfo?.entry || entries[name];
			const sourceType = sourceInfo?.sourceType || 'generated';
			const volumeIndex = Number.isInteger(sourceInfo?.volumeIndex) ? sourceInfo.volumeIndex : AppState.worldbook.currentVolumeIndex;
			const actualName = sourceInfo?.actualName || name;
			const keywords = Array.isArray(entry?.['关键词']) ? entry['关键词'].slice(0, 4).join(', ') : '';
			const tokenCount = getEntryTotalTokens(entry);
			entriesHtml += `
			<label class="ttw-mm-entry-label" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #3a3a3a;cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='rgba(155,89,182,0.15)'" onmouseleave="this.style.background='transparent'">
				<input type="checkbox" class="ttw-mm-entry-cb" data-category="${cat}" data-entry="${name}" data-actual-entry="${actualName}" data-source-type="${sourceType}" data-source-volume="${volumeIndex}" style="width:16px;height:16px;accent-color:#9b59b6;flex-shrink:0;">
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;color:#e0e0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ${name}</div>
					<div style="font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${keywords ? '🔑 ' + keywords : ''} <span style="color:#f1c40f;">${tokenCount}tk</span></div>
				</div>
			</label>`;
		}
		entriesHtml += `</div></div>`;
	}

	const bodyHtml = `
		<div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
			💡 勾选2个或更多条目，将它们合并为一个。适用于AI别名识别未能发现的重复条目。<br>
			<span style="color:#f39c12;">支持跨分类合并，合并后条目将归入您指定的目标分类。</span>
		</div>

		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
			<span style="font-size:13px;color:#ccc;">共 ${totalEntries} 个条目</span>
			<div style="display:flex;gap:8px;align-items:center;">
				<input type="text" id="ttw-mm-filter" placeholder="筛选条目名..." style="padding:4px 8px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;font-size:12px;width:150px;">
				<button class="ttw-btn ttw-btn-small" id="ttw-mm-expand-all">全部展开</button>
			</div>
		</div>

		<div id="ttw-mm-entries-container" style="max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.15);border-radius:6px;padding:8px;">
			${entriesHtml}
		</div>

		<div id="ttw-mm-selected-bar" style="display:none;margin-top:12px;padding:10px;background:rgba(155,89,182,0.2);border:1px solid #9b59b6;border-radius:6px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-size:13px;color:#9b59b6;font-weight:bold;">已选: <span id="ttw-mm-selected-count">0</span> 个条目</span>
				<button class="ttw-btn ttw-btn-small" id="ttw-mm-clear-selection" style="font-size:11px;">清除选择</button>
			</div>
			<div id="ttw-mm-selected-list" style="font-size:12px;color:#ccc;max-height:80px;overflow-y:auto;"></div>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-mm-cancel">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-mm-next" disabled>下一步 → 配置合并</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-manual-merge-modal',
		title: '✋ 手动合并条目',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '800px'
	});

	modal.querySelector('#ttw-mm-cancel').addEventListener('click', () => ModalFactory.close(modal));

	EventDelegate.on(modal, '.ttw-collapse-toggle', 'click', (e, toggleEl) => {
		const contentEl = toggleEl.nextElementSibling;
		if (!contentEl) return;
		contentEl.style.display = contentEl.style.display === 'none' ? 'block' : 'none';
	});

	modal.querySelector('#ttw-mm-expand-all').addEventListener('click', () => {
		const btn = modal.querySelector('#ttw-mm-expand-all');
		const allCatBodies = modal.querySelectorAll('.ttw-mm-category > div:nth-child(2)');
		const anyHidden = [...allCatBodies].some(d => d.style.display === 'none');
		allCatBodies.forEach(d => d.style.display = anyHidden ? 'block' : 'none');
		btn.textContent = anyHidden ? '全部收起' : '全部展开';
	});

	const filterEntries = PerfUtils.debounce((keyword) => {
		modal.querySelectorAll('.ttw-mm-entry-label').forEach(label => {
			const entryName = label.querySelector('.ttw-mm-entry-cb').dataset.entry.toLowerCase();
			label.style.display = !keyword || entryName.includes(keyword) ? 'flex' : 'none';
		});
		if (keyword) {
			modal.querySelectorAll('.ttw-mm-category').forEach(catDiv => {
				const body = catDiv.querySelector('div:nth-child(2)');
				const hasVisible = [...body.querySelectorAll('.ttw-mm-entry-label')].some(l => l.style.display !== 'none');
				if (hasVisible) body.style.display = 'block';
			});
		}
	}, 150);
	modal.querySelector('#ttw-mm-filter').addEventListener('input', (e) => {
		filterEntries(e.target.value.toLowerCase());
	});

	/**
	 * updateSelection
	 * 
	 * @returns {*}
	 */
	function updateSelection() {
		const checked = [...modal.querySelectorAll('.ttw-mm-entry-cb:checked')];
		const count = checked.length;
		const bar = modal.querySelector('#ttw-mm-selected-bar');
		const nextBtn = modal.querySelector('#ttw-mm-next');

		if (count > 0) {
			bar.style.display = 'block';
			modal.querySelector('#ttw-mm-selected-count').textContent = count;

			let listHtml = checked.map(cb => {
				const cat = cb.dataset.category;
				const name = cb.dataset.entry;
				return `<span style="display:inline-block;padding:2px 8px;background:rgba(155,89,182,0.3);border-radius:4px;margin:2px;font-size:11px;">[${cat}] ${name}</span>`;
			}).join('');
			modal.querySelector('#ttw-mm-selected-list').innerHTML = listHtml;
		} else {
			bar.style.display = 'none';
		}

		nextBtn.disabled = count < 2;
		nextBtn.textContent = count < 2 ? '下一步 → 配置合并（至少选2个）' : `下一步 → 配置合并 (${count}个)`;
	}

	modal.querySelectorAll('.ttw-mm-entry-cb').forEach(cb => {
		cb.addEventListener('change', updateSelection);
	});

	modal.querySelector('#ttw-mm-clear-selection').addEventListener('click', () => {
		modal.querySelectorAll('.ttw-mm-entry-cb:checked').forEach(cb => cb.checked = false);
		updateSelection();
	});

	modal.querySelector('#ttw-mm-next').addEventListener('click', () => {
		const checked = [...modal.querySelectorAll('.ttw-mm-entry-cb:checked')];
		if (checked.length < 2) return;

		const selectedEntries = checked.map(cb => ({
			category: cb.dataset.category,
			name: cb.dataset.entry,
			actualName: cb.dataset.actualEntry || cb.dataset.entry,
			sourceType: cb.dataset.sourceType || 'generated',
			volumeIndex: cb.dataset.sourceVolume !== undefined && cb.dataset.sourceVolume !== '' ? parseInt(cb.dataset.sourceVolume, 10) : AppState.worldbook.currentVolumeIndex
		}));

		ModalFactory.close(modal);
		showManualMergeConfigModal(selectedEntries, onMergeComplete);
	});
}

    /**
     * showManualMergeConfigModal
     * 
     * @param {*} selectedEntries
     * @param {*} onMergeComplete
     * @returns {*}
     */
    function showManualMergeConfigModal(selectedEntries, onMergeComplete) {
        const existingModal = document.getElementById('ttw-mm-config-modal');
        if (existingModal) existingModal.remove();

        const worldbook = getManualMergeViewWorldbook();

        // 收集所有条目信息用于预览
        const entriesInfo = selectedEntries.map(e => {
            const resolved = resolveManualMergeEntryRef(e);
            const entry = resolved?.entry;
            return {
                ...e,
                actualName: resolved?.actualName || e.actualName || e.name,
                sourceType: resolved?.sourceType || e.sourceType || 'generated',
                volumeIndex: Number.isInteger(resolved?.volumeIndex) ? resolved.volumeIndex : (Number.isInteger(e.volumeIndex) ? e.volumeIndex : AppState.worldbook.currentVolumeIndex),
                keywords: entry?.['关键词'] || [],
                content: entry?.['内容'] || '',
                tokens: getEntryTotalTokens(entry)
            };
        });

        // 所有涉及的分类
        const involvedCategories = [...new Set(selectedEntries.map(e => e.category))];
        // 所有可能的名称选项
        const nameOptions = selectedEntries.map(e => e.name);

        // 合并后的预览
        let mergedKeywords = [];
        let mergedContent = '';
        for (const info of entriesInfo) {
            mergedKeywords.push(...info.keywords);
            mergedKeywords.push(info.name);
            if (info.content) {
                mergedContent += (mergedContent ? '\n\n---\n\n' : '') + info.content;
            }
        }
        mergedKeywords = [...new Set(mergedKeywords)];

	const allCategories = Object.keys(worldbook);
	let catOptionsHtml = allCategories.map(cat => {
		const selected = cat === involvedCategories[0] ? 'selected' : '';
		return `<option value="${cat}" ${selected}>${cat}</option>`;
	}).join('');

	let nameOptionsHtml = nameOptions.map((name, idx) => {
		const cat = selectedEntries[idx].category;
		return `
		<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:4px;cursor:pointer;">
			<input type="radio" name="ttw-mm-main-name" value="${name}" ${idx === 0 ? 'checked' : ''} style="accent-color:#27ae60;">
			<span style="color:#e0e0e0;font-size:13px;">${name}</span>
			<span style="color:#888;font-size:11px;margin-left:auto;">[${cat}]</span>
		</label>`;
	}).join('');

	let detailsHtml = entriesInfo.map((info, idx) => {
		const kwStr = info.keywords.join(', ') || '无';
		const contentPreview = info.content.length > 200 ? info.content.substring(0, 200) + '...' : info.content;
		return `
		<div style="border:1px solid #555;border-radius:6px;margin-bottom:8px;overflow:hidden;">
			<div class="ttw-collapse-toggle" style="background:#3a3a3a;padding:8px 12px;font-size:13px;display:flex;justify-content:space-between;cursor:pointer;">
				<span style="color:#e67e22;">[${info.category}] ${info.name}</span>
				<span style="color:#f1c40f;font-size:11px;">${info.tokens}tk</span>
			</div>
			<div style="display:${idx === 0 ? 'block' : 'none'};padding:10px;background:#1c1c1c;font-size:12px;">
				<div style="margin-bottom:6px;"><span style="color:#9b59b6;">🔑 关键词:</span> <span style="color:#ccc;">${kwStr}</span></div>
				<div style="color:#aaa;line-height:1.5;white-space:pre-wrap;max-height:150px;overflow-y:auto;">${contentPreview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
			</div>
		</div>`;
	}).join('');

	const bodyHtml = `
		<div style="display:flex;gap:16px;flex-wrap:wrap;">
			<div style="flex:1;min-width:300px;">
				<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;font-size:13px;">📌 选择主条目名称</div>
				<div style="margin-bottom:12px;padding:8px;background:rgba(0,0,0,0.15);border-radius:6px;max-height:200px;overflow-y:auto;">
					${nameOptionsHtml}
				</div>
				<div style="margin-bottom:8px;">
					<label style="font-size:12px;color:#ccc;display:block;margin-bottom:4px;">或输入自定义名称：</label>
					<input type="text" id="ttw-mm-custom-name" class="ttw-input" placeholder="留空则使用上面选择的名称" style="font-size:12px;">
				</div>

				<div style="font-weight:bold;color:#e67e22;margin-bottom:8px;margin-top:16px;font-size:13px;">📂 目标分类</div>
				<select id="ttw-mm-target-category" style="width:100%;padding:8px;border:1px solid #555;border-radius:4px;background:#2d2d2d;color:#fff;font-size:13px;">
					${catOptionsHtml}
				</select>

				<div style="margin-top:16px;">
					<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;">
						<input type="checkbox" id="ttw-mm-dedup-keywords" checked style="accent-color:#9b59b6;">
						合并后关键词去重
					</label>
					<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#ccc;margin-top:6px;">
						<input type="checkbox" id="ttw-mm-add-separator" checked style="accent-color:#9b59b6;">
						内容间添加分隔线 (---)
					</label>
				</div>
			</div>

			<div style="flex:1;min-width:300px;">
				<div style="font-weight:bold;color:#3498db;margin-bottom:8px;font-size:13px;">📋 待合并条目详情</div>
				<div style="max-height:400px;overflow-y:auto;">
					${detailsHtml}
				</div>
			</div>
		</div>

		<div style="margin-top:16px;padding:12px;background:rgba(39,174,96,0.15);border:1px solid rgba(39,174,96,0.3);border-radius:6px;">
			<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;font-size:13px;">🔮 合并预览</div>
			<div style="font-size:12px;color:#ccc;">
				<div style="margin-bottom:4px;"><span style="color:#9b59b6;">🔑 合并关键词 (${mergedKeywords.length}):</span> ${mergedKeywords.join(', ')}</div>
				<div style="margin-bottom:4px;"><span style="color:#f1c40f;">📊 合并后Token:</span> ~${estimateTokenCount(mergedKeywords.join(', ') + mergedContent)} tk</div>
				<div style="color:#888;font-size:11px;">💡 合并后建议使用「整理条目」功能让AI优化内容、去除重复</div>
			</div>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-mm-back">← 返回选择</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-mm-confirm">✅ 确认合并</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-mm-config-modal',
		title: `✋ 手动合并 - 配置 (${selectedEntries.length}个条目)`,
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '800px'
	});


	modal.querySelector('#ttw-mm-back').addEventListener('click', () => {
		ModalFactory.close(modal);
		showManualMergeUI(onMergeComplete);
	});

	modal.querySelector('#ttw-mm-confirm').addEventListener('click', async () => {
		const customName = modal.querySelector('#ttw-mm-custom-name').value.trim();
		const radioName = modal.querySelector('input[name="ttw-mm-main-name"]:checked')?.value;
		const mainName = customName || radioName || selectedEntries[0].name;
		const targetCategory = modal.querySelector('#ttw-mm-target-category').value;
		const dedupKeywords = modal.querySelector('#ttw-mm-dedup-keywords').checked;
		const addSeparator = modal.querySelector('#ttw-mm-add-separator').checked;

		const involvedStr = selectedEntries.map(e => `[${e.category}] ${e.name}`).join('\n');
		if (!await confirmAction(`确定将以下 ${selectedEntries.length} 个条目合并为「${mainName}」？\n目标分类: ${targetCategory}\n\n${involvedStr}\n\n⚠️ 原条目将被删除！`, { title: '确认手动合并', danger: true })) return;

		const mergeResult = executeManualMerge(selectedEntries, mainName, targetCategory, dedupKeywords, addSeparator);
		if (!mergeResult.success) {
			ErrorHandler.showUserError(mergeResult.error || '手动合并失败，未匹配到可合并的条目');
			return;
		}

		updateStreamContent(`\n✅ 手动合并完成: ${selectedEntries.length} 个条目 → [${targetCategory}] ${mainName}\n`);
		worldbookView.setManualMergeHighlight(targetCategory, mainName);
		ModalFactory.close(modal);

		if (typeof onMergeComplete === 'function') onMergeComplete();
		ErrorHandler.showUserSuccess(`合并完成！${selectedEntries.length} 个条目已合并为「${mainName}」。\n\n建议使用「整理条目」功能让AI优化合并后的内容。`);
	});
}

    /**
     * executeManualMerge
     * 
     * @param {*} selectedEntries
     * @param {*} mainName
     * @param {*} targetCategory
     * @param {*} dedupKeywords
     * @param {*} addSeparator
     * @returns {*}
     */
    function executeManualMerge(selectedEntries, mainName, targetCategory, dedupKeywords, addSeparator) {
        return mergeService.executeManualMerge(selectedEntries, mainName, targetCategory, dedupKeywords, addSeparator);
}

/**
 * _handleAliasMergeConfirm
 * 
 * @param {*} modal
 * @param {*} aiResultByCategory
 * @returns {Promise<any>}
 */
async function _handleAliasMergeConfirm(modal, aiResultByCategory) {
    const checkedBoxes = modal.querySelectorAll('.ttw-merge-group-cb:checked');
    if (checkedBoxes.length === 0) {
        ErrorHandler.showUserError('没有勾选任何合并组');
        return;
    }

    const checkedSelections = [...checkedBoxes].map((box) => ({
        category: box.getAttribute('data-category'),
        groupIndex: parseInt(box.getAttribute('data-group-index'), 10),
    }));
    const mergeByCategory = mergeService.collectAliasMergeGroups(checkedSelections, aiResultByCategory);

    const totalSelected = checkedBoxes.length;
    const categoryList = Object.keys(mergeByCategory).map(c => `${c}(${mergeByCategory[c].length}组)`).join('、');
    if (!await confirmAction('确定合并选中的 ' + totalSelected + ' 组条目？\n涉及分类: ' + categoryList, { title: '批量合并重复条目', danger: true })) return;

    const totalMerged = await mergeService.executeAliasMergeByCategory(mergeByCategory, aiResultByCategory);

        worldbookView.updateWorldbookPreview();
        modal.remove();
        ErrorHandler.showUserSuccess('合并完成！共合并了 ' + totalMerged + ' 组条目。\n\n建议使用"整理条目"功能清理合并后的重复内容。');
    }

/**
 * showAliasMergeUI
 * 
 * @returns {Promise<any>}
 */
async function showAliasMergeUI() {
const availableCategories = Object.keys(AppState.worldbook.generated).filter(cat => {
const entries = AppState.worldbook.generated[cat];
return entries && typeof entries === 'object' && Object.keys(entries).length >= 2;
});

if (availableCategories.length === 0) {
ErrorHandler.showUserError('当前世界书中没有包含2个以上条目的分类，无法进行别名合并');
return;
}

	const selectedCategories = await new Promise((resolve) => {
		const existingModal = document.getElementById('ttw-alias-cat-modal');
		if (existingModal) existingModal.remove();

		const catListHtml = buildAliasCategorySelectModal(availableCategories, AppState.worldbook.generated, ListRenderer.escapeHtml);
		const bodyHtml = `
			<div style="margin-bottom:12px;padding:10px;background:rgba(52,152,219,0.15);border-radius:6px;font-size:12px;color:#3498db;">
				💡 请勾选需要让AI识别别名并合并的分类。将对每个选中的分类独立扫描重复条目。
			</div>
			<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
				<label style="font-size:12px;cursor:pointer;"><input type="checkbox" id="ttw-alias-cat-select-all"> 全选</label>
			</div>
			<div style="max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
				${catListHtml}
			</div>
		`;
		const footerHtml = `
			<button class="ttw-btn" id="ttw-alias-cat-cancel">取消</button>
			<button class="ttw-btn ttw-btn-primary" id="ttw-alias-cat-confirm">📍 开始扫描</button>
		`;

		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		const catModal = ModalFactory.create({
			id: 'ttw-alias-cat-modal',
			title: '🔗 别名合并 - 选择要扫描的分类',
			body: bodyHtml,
			footer: footerHtml,
			maxWidth: '500px',
			onClose: () => finish(null)
		});

		catModal.querySelector('#ttw-alias-cat-select-all').addEventListener('change', (e) => {
			catModal.querySelectorAll('.ttw-alias-cat-cb').forEach(cb => cb.checked = e.target.checked);
		});

		catModal.querySelector('#ttw-alias-cat-cancel').addEventListener('click', () => {
			ModalFactory.close(catModal);
		});

		catModal.querySelector('#ttw-alias-cat-confirm').addEventListener('click', () => {
			const checked = [...catModal.querySelectorAll('.ttw-alias-cat-cb:checked')].map(cb => cb.dataset.cat);
			finish(checked.length > 0 ? checked : null);
			ModalFactory.close(catModal);
		});
	});

        if (!selectedCategories || selectedCategories.length === 0) return;

        // ====== 第一阶段：扫描所有选中分类的疑似重复 ======
        updateStreamContent('\n🔍 第一阶段：扫描疑似重复条目...\n');

        // 按分类收集所有疑似组，每组附带分类信息
        const allSuspectedByCategory = {};
        let totalGroups = 0;
        let totalPairs = 0;

        for (const cat of selectedCategories) {
            const suspected = findPotentialDuplicates(cat);
            if (suspected.length > 0) {
                allSuspectedByCategory[cat] = suspected;
                totalGroups += suspected.length;
                for (const group of suspected) {
                    totalPairs += (group.length * (group.length - 1)) / 2;
                }
                updateStreamContent(`  [${cat}] 发现 ${suspected.length} 组疑似重复\n`);
            } else {
                updateStreamContent(`  [${cat}] 未发现重复\n`);
            }
        }

        if (totalGroups === 0) {
            ErrorHandler.showUserError('在所有选中的分类中未发现疑似重复条目');
            return;
        }

updateStreamContent(`共发现 ${totalGroups} 组疑似重复，${totalPairs} 对需要判断\n`);

	const existingModal = document.getElementById('ttw-alias-modal');
	if (existingModal) existingModal.remove();

	const groupCategoryMap = [];
	const groupsHtml = buildAliasGroupsListHtml(allSuspectedByCategory, AppState.worldbook.generated, groupCategoryMap, ListRenderer.escapeHtml);

	const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">📊 第一阶段：本地检测结果</div>
			<div style="font-size:13px;color:#ccc;">
				扫描了 <span style="color:#e67e22;font-weight:bold;">${selectedCategories.length}</span> 个分类，
				发现 <span style="color:#9b59b6;font-weight:bold;">${totalGroups}</span> 组疑似重复，
				共 <span style="color:#e67e22;font-weight:bold;">${totalPairs}</span> 对需要AI判断
			</div>
		</div>

		<div style="margin-bottom:16px;">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
				<span style="font-weight:bold;">选择要发送给AI判断的组</span>
				<label style="font-size:12px;"><input type="checkbox" id="ttw-select-all-alias" checked> 全选</label>
			</div>
			<div style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;">
				${groupsHtml}
			</div>
		</div>

		<div style="margin-bottom:16px;padding:10px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:11px;color:#f39c12;">
			💡 <strong>两两判断模式</strong>：AI会对每一对条目分别判断是否相同，然后自动合并确认的结果。<br>
			例如：[A,B,C] 会拆成 (A,B) (A,C) (B,C) 三对分别判断，如果A=B且B=C，则A、B、C会被合并。
		</div>

		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-weight:bold;color:#3498db;margin-bottom:10px;">⚙️ 并发设置</div>
			<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
				<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
					<input type="checkbox" id="ttw-alias-parallel">
					<span>启用并发</span>
				</label>
				<label style="display:flex;align-items:center;gap:6px;font-size:12px;">
					<span>配对数阈值:</span>
					<input type="number" id="ttw-alias-threshold" value="5" min="1" max="50" style="width:60px;padding:4px;border:1px solid #555;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;">
				</label>
			</div>
			<div style="font-size:11px;color:#888;margin-top:8px;">
				≥阈值的配对数单独发送，＜阈值的合并发送（合并到接近阈值数量）
			</div>
		</div>

		<div id="ttw-alias-result" style="display:none;margin-bottom:16px;">

			<div style="padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;margin-bottom:12px;">
				<div style="font-weight:bold;color:#9b59b6;margin-bottom:8px;">🔍 配对判断结果</div>
				<div id="ttw-pair-results" style="max-height:150px;overflow-y:auto;"></div>
			</div>
			<div style="padding:12px;background:rgba(39,174,96,0.15);border-radius:8px;">
				<div style="font-weight:bold;color:#27ae60;margin-bottom:8px;">📦 合并方案</div>
				<div id="ttw-merge-plan"></div>
			</div>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn ttw-btn-secondary" id="ttw-stop-alias" style="display:none;">⏸️ 停止</button>
		<button class="ttw-btn" id="ttw-cancel-alias">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-ai-verify-alias">🤖 AI两两判断</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-alias" style="display:none;">✅ 确认合并</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-alias-modal',
		title: '🔗 别名识别与合并 (两两判断模式)',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '750px'
	});

	let aiResultByCategory = {};

        modal.querySelector('#ttw-select-all-alias').addEventListener('change', (e) => {
            modal.querySelectorAll('.ttw-alias-group-cb').forEach(cb => cb.checked = e.target.checked);
        });

	modal.querySelector('#ttw-cancel-alias').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-ai-verify-alias').addEventListener('click', async () => {
            // 按分类分组选中的组
            const checkedCbs = [...modal.querySelectorAll('.ttw-alias-group-cb:checked')];
            if (checkedCbs.length === 0) {
                ErrorHandler.showUserError('请选择要判断的组');
                return;
            }

            // 按分类归类选中的组
            const selectedByCategory = {};
            for (const cb of checkedCbs) {
                const cat = cb.dataset.category;
                const globalIdx = parseInt(cb.dataset.index);
                const { localIndex } = groupCategoryMap[globalIdx];
                if (!selectedByCategory[cat]) selectedByCategory[cat] = [];
                selectedByCategory[cat].push(allSuspectedByCategory[cat][localIndex]);
            }

            const btn = modal.querySelector('#ttw-ai-verify-alias');
            const stopBtn = modal.querySelector('#ttw-stop-alias');
            btn.disabled = true;
            btn.textContent = '🔄 AI判断中...';
            stopBtn.style.display = 'inline-block';

            try {
                const useParallel = modal.querySelector('#ttw-alias-parallel')?.checked ?? AppState.config.parallel.enabled;
                const threshold = parseInt(modal.querySelector('#ttw-alias-threshold')?.value) || 5;

                updateStreamContent(`\n🤖 第二阶段：两两配对判断...\n并发: ${useParallel ? '开启' : '关闭'}, 阈值: ${threshold}\n`);

                // 对每个分类分别调用AI判断
                aiResultByCategory = {};
                for (const cat of Object.keys(selectedByCategory)) {
                    updateStreamContent(`\n📂 处理分类「${cat}」...\n`);
                    aiResultByCategory[cat] = await handleVerifyDuplicates(selectedByCategory[cat], useParallel, threshold, cat);
                }

        const resultDiv = modal.querySelector('#ttw-alias-result');
        const pairResultsDiv = modal.querySelector('#ttw-pair-results');
        const mergePlanDiv = modal.querySelector('#ttw-merge-plan');
        resultDiv.style.display = 'block';

        // 显示所有分类的配对结果
        pairResultsDiv.innerHTML = buildAliasPairResultsHtml(aiResultByCategory, ListRenderer.escapeHtml);

        // 显示所有分类的合并方案
        const { html: mergePlanHtml, hasAnyMerge } = buildAliasMergePlanHtml(aiResultByCategory, ListRenderer.escapeHtml);
        mergePlanDiv.innerHTML = mergePlanHtml;

        const selectAllMergeCb = mergePlanDiv.querySelector('#ttw-select-all-merge-groups');
        if (selectAllMergeCb) {
            selectAllMergeCb.addEventListener('change', (e) => {
                mergePlanDiv.querySelectorAll('.ttw-merge-group-cb').forEach(cb => cb.checked = e.target.checked);
            });
        }

        if (hasAnyMerge) {
            modal.querySelector('#ttw-confirm-alias').style.display = 'inline-block';
        }
        btn.style.display = 'none';
        stopBtn.style.display = 'none';

        updateStreamContent('✅ AI判断完成\n');

} catch (error) {
ErrorHandler.handle(error, 'aliasMerge');
updateStreamContent(`❌ AI判断失败: ${error.message}\n`);
btn.disabled = false;
btn.textContent = '🤖 AI两两判断';
stopBtn.style.display = 'none';
}
});

        modal.querySelector('#ttw-stop-alias').addEventListener('click', () => {
            handleStopProcessing();
            modal.querySelector('#ttw-ai-verify-alias').disabled = false;
            modal.querySelector('#ttw-ai-verify-alias').textContent = '🤖 AI两两判断';
            modal.querySelector('#ttw-stop-alias').style.display = 'none';
        });

        modal.querySelector('#ttw-confirm-alias').addEventListener('click', async function () {
            await _handleAliasMergeConfirm(modal, aiResultByCategory);
        });

    }

    /**
     * _performSearchInWorldbook
     * 
     * @param {*} keyword
     * @returns {*}
     */
    function _performSearchInWorldbook(keyword) {
    if (!keyword) return { results: [], totalMatches: 0 };
    
    const results = [];
    const worldbook = AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated;
    let totalMatches = 0;
    
    for (const category in worldbook) {
        for (const entryName in worldbook[category]) {
            const entry = worldbook[category][entryName];
            const content = entry['内容'] || entry.content || '';
            const keywords = entry['关键词'] || entry.keywords || [];
            
            const keywordStr = Array.isArray(keywords) ? keywords.join(', ') : String(keywords);
            
            if (content.includes(keyword) || entryName.includes(keyword) || keywordStr.includes(keyword)) {
                const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                const contentMatches = (content.match(regex) || []).length;
                const nameMatches = (entryName.match(regex) || []).length;
                totalMatches += contentMatches + nameMatches;
                
                results.push({
                    category,
                    entryName,
                    contentMatches,
                    nameMatches,
                    totalMatches: contentMatches + nameMatches
                });
            }
        }
    }
    
    return { results, totalMatches };
}

/**
 * _buildSearchResultsHtml
 * 
 * @param {*} results
 * @param {*} keyword
 * @returns {*}
 */
function _buildSearchResultsHtml(results, keyword) {
    if (results.length === 0) {
        return `<div style="text-align:center;color:#888;padding:20px;">未找到包含"${ListRenderer.escapeHtml(keyword)}"的内容</div>`;
    }
    
    let html = `<div style="margin-bottom:12px;font-size:12px;color:#888;">找到 ${results.length} 个条目</div>`;
    
    results.forEach((item, idx) => {
        html += `
<div class="ttw-search-result-item" data-index="${idx}" data-category="${item.category}" data-entry="${item.entryName}" style="padding:8px;background:rgba(52,152,219,0.1);border-radius:4px;margin-bottom:6px;cursor:pointer;border-left:3px solid #3498db;">
<div style="font-size:13px;color:#fff;font-weight:bold;">${ListRenderer.escapeHtml(item.entryName)}</div>
<div style="font-size:11px;color:#888;">[${ListRenderer.escapeHtml(item.category)}] 匹配: ${item.totalMatches}处</div>
</div>
`;
    });
    
    return html;
}

/**
 * _batchRerollSearchResults
 * 
 * @param {*} modal
 * @param {*} memoryIndices
 * @param {*} customPrompt
 * @returns {Promise<any>}
 */
async function _batchRerollSearchResults(modal, memoryIndices, customPrompt) {
    const useParallel = AppState.config.parallel.enabled && memoryIndices.length > 1;
    const parallelHint = useParallel ? `\n\n将使用并行处理（${AppState.config.parallel.concurrency}并发）` : '';
    
    if (!await confirmAction(`确定要重Roll ${memoryIndices.length} 个章节吗？\n\n这将使用当前附加提示词重新生成这些章节的世界书条目。${parallelHint}`, { title: '批量重 Roll 章节' })) {
        return { success: 0, fail: 0, stopped: false };
    }
    
    const btn = modal.querySelector('#ttw-reroll-all-found');
    const stopBtn = document.createElement('button');
    stopBtn.className = 'ttw-btn ttw-btn-secondary';
    stopBtn.textContent = '⏸️ 停止';
    stopBtn.style.marginLeft = '8px';
    btn.parentNode.insertBefore(stopBtn, btn.nextSibling);
    
    btn.disabled = true;
    btn.textContent = '🔄 重Roll中...';
    
    let stopped = false;
    
    stopBtn.addEventListener('click', () => {
        stopped = true;
        handleStopProcessing();
        stopBtn.textContent = '已停止';
        stopBtn.disabled = true;
    });

    const result = await getRerollService().batchRerollMemories({
        memoryIndices,
        customPrompt,
        useParallel,
        onStep: ({ completed, total }) => {
            btn.textContent = `🔄 进度: ${completed}/${total}`;
        },
    });

    btn.disabled = false;
    btn.textContent = `🎲 重Roll所有匹配章节 (${memoryIndices.length}章)`;
    stopBtn.remove();

    return { success: result.success, fail: result.fail, stopped: stopped || result.stopped };
}

// ========== 新增：查找功能 ==========
function showSearchModal() {
	const existingModal = document.getElementById('ttw-search-modal');
	if (existingModal) existingModal.remove();

	const bodyHtml = `
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">输入要查找的字符（如乱码字符 �）</label>
			<input type="text" id="ttw-search-input" class="ttw-input" placeholder="输入要查找的内容..." value="${AppState.ui.searchKeyword}">
		</div>
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;color:#9b59b6;font-weight:bold;">📝 重Roll时附加的提示词（插入到发送给AI的文本最后）</label>
			<textarea id="ttw-search-suffix-prompt" rows="2" class="ttw-textarea-small" placeholder="例如：请特别注意提取XX信息，修复乱码内容...">${AppState.settings.customSuffixPrompt || ''}</textarea>
		</div>
		<div class="ttw-search-results-container" style="display:flex;gap:12px;height:400px;">
			<div id="ttw-search-results" style="flex:1;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;">
				<div style="text-align:center;color:#888;">输入关键词后点击"查找"</div>
			</div>
			<div id="ttw-search-detail" style="flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;display:none;">
				<div style="text-align:center;color:#888;padding:20px;">👈 点击左侧条目查看详情</div>
			</div>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-clear-search">清除高亮</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-do-search">🔍 查找</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-reroll-all-found" style="display:none;">🎲 重Roll所有匹配章节</button>
		<button class="ttw-btn" id="ttw-close-search">关闭</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-search-modal',
		title: '🔍 查找内容',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '900px'
	});

	modal.querySelector('#ttw-close-search').addEventListener('click', () => ModalFactory.close(modal));

        // 保存提示词设置
        modal.querySelector('#ttw-search-suffix-prompt').addEventListener('change', (e) => {
            AppState.settings.customSuffixPrompt = e.target.value;
            saveCurrentSettings();
        });

        modal.querySelector('#ttw-do-search').addEventListener('click', () => {
            const keyword = modal.querySelector('#ttw-search-input').value;
            if (!keyword) {
                ErrorHandler.showUserError('请输入要查找的内容');
                return;
            }
            AppState.ui.searchKeyword = keyword;
            const results = performSearchEnhanced(keyword, modal.querySelector('#ttw-search-results'), modal);

            // 显示/隐藏批量重Roll按钮
            const rerollAllBtn = modal.querySelector('#ttw-reroll-all-found');
            if (results && results.memoryIndices && results.memoryIndices.size > 0) {
                rerollAllBtn.style.display = 'inline-block';
                rerollAllBtn.textContent = `🎲 重Roll所有匹配章节 (${results.memoryIndices.size}章)`;
            } else {
                rerollAllBtn.style.display = 'none';
            }

            // 显示详情面板
            modal.querySelector('#ttw-search-detail').style.display = 'block';
        });

        // 批量重Roll所有匹配章节
        modal.querySelector('#ttw-reroll-all-found').addEventListener('click', async () => {
            const resultsContainer = modal.querySelector('#ttw-search-results');
            const memoryIndicesAttr = resultsContainer.dataset.memoryIndices;
            if (!memoryIndicesAttr) {
                ErrorHandler.showUserError('请先进行查找');
                return;
            }

            const memoryIndices = JSON.parse(memoryIndicesAttr);
            if (memoryIndices.length === 0) {
                ErrorHandler.showUserError('没有找到匹配的章节');
                return;
            }

            const customPrompt = modal.querySelector('#ttw-search-suffix-prompt').value;
            const { success, fail, stopped } = await _batchRerollSearchResults(modal, memoryIndices, customPrompt);
            ErrorHandler.showUserSuccess(`批量重Roll完成！\n成功: ${success}\n失败: ${fail}${stopped ? '\n(已手动停止)' : ''}`);

            // 重新搜索刷新结果
            modal.querySelector('#ttw-do-search').click();
            worldbookView.updateWorldbookPreview();
        });

        modal.querySelector('#ttw-clear-search').addEventListener('click', () => {
            AppState.ui.searchKeyword = '';
            modal.querySelector('#ttw-search-input').value = '';
            modal.querySelector('#ttw-search-results').innerHTML = '<div style="text-align:center;color:#888;">已清除高亮</div>';
            modal.querySelector('#ttw-search-detail').style.display = 'none';
            modal.querySelector('#ttw-reroll-all-found').style.display = 'none';
            worldbookView.updateWorldbookPreview();
        });

        // 回车搜索
        modal.querySelector('#ttw-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#ttw-do-search').click();
            }
        });
    }




    /**
     * performSearchEnhanced
     * 
     * @param {*} keyword
     * @param {*} resultsContainer
     * @param {*} modal
     * @returns {*}
     */
    function performSearchEnhanced(keyword, resultsContainer, modal) {
        const results = [];
        const memoryIndicesSet = new Set();

        // 搜索每个记忆当前使用的result
        for (let i = 0; i < AppState.memory.queue.length; i++) {
            const memory = AppState.memory.queue[i];
            if (!memory.result || memory.failed) continue;

            const currentResult = memory.result;

            for (const category in currentResult) {
                for (const entryName in currentResult[category]) {
                    const entry = currentResult[category][entryName];
                    if (!entry || typeof entry !== 'object') continue;

                    const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                    const content = entry['内容'] || '';

                    const matches = [];

                    if (entryName.includes(keyword)) {
                        matches.push({ field: '条目名', text: entryName });
                    }
                    if (keywordsStr.includes(keyword)) {
                        matches.push({ field: '关键词', text: keywordsStr });
                    }
                    if (content.includes(keyword)) {
                        const idx = content.indexOf(keyword);
                        const start = Math.max(0, idx - 30);
                        const end = Math.min(content.length, idx + keyword.length + 30);
                        const context = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
                        matches.push({ field: '内容', text: context });
                    }

                    if (matches.length > 0) {
                        const alreadyExists = results.some(r =>
                            r.memoryIndex === i && r.category === category && r.entryName === entryName
                        );

                        if (!alreadyExists) {
                            results.push({
                                category,
                                entryName,
                                memoryIndex: i,
                                matches,
                                fromMemoryResult: true
                            });
                        }
                        memoryIndicesSet.add(i);
                    }
                }
            }
        }

        // 搜索合并后的世界书
        for (const category in AppState.worldbook.generated) {
            for (const entryName in AppState.worldbook.generated[category]) {
                const alreadyFoundInMemory = results.some(r => r.category === category && r.entryName === entryName);
                if (alreadyFoundInMemory) continue;

                const entry = AppState.worldbook.generated[category][entryName];
                if (!entry || typeof entry !== 'object') continue;

                const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                const content = entry['内容'] || '';

                const matches = [];

                if (entryName.includes(keyword)) {
                    matches.push({ field: '条目名', text: entryName });
                }
                if (keywordsStr.includes(keyword)) {
                    matches.push({ field: '关键词', text: keywordsStr });
                }
                if (content.includes(keyword)) {
                    const idx = content.indexOf(keyword);
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(content.length, idx + keyword.length + 30);
                    const context = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
                    matches.push({ field: '内容', text: context });
                }

                if (matches.length > 0) {
                    results.push({
                        category,
                        entryName,
                        memoryIndex: -1,
                        matches,
                        fromMemoryResult: false
                    });
                }
            }
        }

        // 保存找到的记忆索引
        resultsContainer.dataset.memoryIndices = JSON.stringify([...memoryIndicesSet]);

        if (results.length === 0) {
            resultsContainer.innerHTML = `<div style="text-align:center;color:#888;padding:20px;">未找到包含"${keyword}"的内容</div>`;
            return { results: [], memoryIndices: memoryIndicesSet };
        }

        // 高亮函数
        const highlightKw = (text) => {
            if (!text) return '';
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp(escaped, 'g'),
                `<span style="background:#f1c40f;color:#000;padding:1px 2px;border-radius:2px;">${keyword}</span>`);
        };

        // 生成HTML
        let html = `<div style="margin-bottom:12px;font-size:13px;color:#27ae60;">找到 ${results.length} 个匹配项，涉及 ${memoryIndicesSet.size} 个章节</div>`;

        for (let idx = 0; idx < results.length; idx++) {
            const result = results[idx];
            const memoryLabel = result.memoryIndex >= 0 ? `记忆${result.memoryIndex + 1}` : '默认/导入';
            const memoryColor = result.memoryIndex >= 0 ? '#3498db' : '#888';
            const sourceTag = result.fromMemoryResult
                ? '<span style="font-size:9px;color:#27ae60;margin-left:4px;">✓当前结果</span>'
                : '<span style="font-size:9px;color:#f39c12;margin-left:4px;">⚠合并数据</span>';

            const matchTexts = result.matches.slice(0, 2).map(m => {
                const fieldText = m.field || '';
                const matchText = (m.text || '').substring(0, 80);
                return '<span style="color:#888;">' + fieldText + ':</span> ' + highlightKw(matchText) + (m.text && m.text.length > 80 ? '...' : '');
            }).join('<br>');

            html += '<div class="ttw-search-result-item" data-result-index="' + idx + '" style="background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;margin-bottom:8px;border-left:3px solid #f1c40f;cursor:pointer;transition:background 0.2s;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
            html += '<span style="font-weight:bold;color:#e67e22;">[' + result.category + '] ' + highlightKw(result.entryName) + '</span>';
            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span style="font-size:11px;color:' + memoryColor + ';background:rgba(52,152,219,0.2);padding:2px 6px;border-radius:3px;">📍 ' + memoryLabel + '</span>';
            html += sourceTag;
            if (result.memoryIndex >= 0) {
                html += '<button class="ttw-btn-tiny ttw-reroll-single" data-memory-idx="' + result.memoryIndex + '" title="重Roll此章节">🎲</button>';
            }
            html += '</div></div>';
            html += '<div style="font-size:12px;color:#ccc;">' + matchTexts + '</div>';
            html += '</div>';
        }

        resultsContainer.innerHTML = html;


        // ====== 关键修复：在innerHTML之后绑定事件 ======

        // 绑定单个重Roll按钮
        resultsContainer.querySelectorAll('.ttw-reroll-single').forEach(btn => {
            btn.onclick = async function (e) {
                e.stopPropagation();
                const memoryIndex = parseInt(this.dataset.memoryIdx);
                const customPrompt = modal.querySelector('#ttw-search-suffix-prompt')?.value || '';

                if (!await confirmAction(`确定要重Roll 第${memoryIndex + 1}章 吗？`, { title: '单章重 Roll' })) return;

                this.disabled = true;
                this.textContent = '🔄';

                try {
                    await handleRerollMemory(memoryIndex, customPrompt);
                    ErrorHandler.showUserSuccess(`第${memoryIndex + 1}章 重Roll完成！`);
                    modal.querySelector('#ttw-do-search')?.click();
                    worldbookView.updateWorldbookPreview();
                } catch (error) {
                    ErrorHandler.showUserError(`重Roll失败: ${error.message}`);
                } finally {
                    this.disabled = false;
                    this.textContent = '🎲';
                }
            };
        });

        // 绑定条目点击 - 显示详情
        const allItems = resultsContainer.querySelectorAll('.ttw-search-result-item');
        Logger.debug('Search', '📌 绑定点击事件，共 ' + allItems.length + ' 个条目');

        allItems.forEach((item, loopIndex) => {
            const resultIndex = parseInt(item.dataset.resultIndex);
            Logger.debug('Search', `📌 绑定第${loopIndex}个item, data-result-index=${resultIndex}`);

            item.onclick = function (e) {
                Logger.debug('Search', '🖱️ 点击触发！loopIndex=' + loopIndex + ' resultIndex=' + resultIndex);
                Logger.debug('Search', '🖱️ this.dataset.resultIndex=' + this.dataset.resultIndex);
                Logger.debug('Search', '🖱️ results数组长度=' + results.length);

                // 如果点击的是按钮，不处理
                if (e.target.closest('.ttw-reroll-single')) {
                    Logger.debug('Search', '🖱️ 点击的是按钮，跳过');
                    return;
                }

                const idx = parseInt(this.dataset.resultIndex);
                Logger.debug('Search', '🖱️ 解析的idx=' + idx);

                const result = results[idx];
Logger.debug('Search', '获取的result=' + JSON.stringify(result).substring(0, 100));

if (!result) {
Logger.error('Search', '找不到result! idx=' + idx + ' results长度=' + results.length);
ErrorHandler.showUserError('调试：找不到result，idx=' + idx + '，results长度=' + results.length);
return;
}

const detailDiv = modal.querySelector('#ttw-search-detail');
if (!detailDiv) {
Logger.error('Search', '找不到detailDiv!');
return;
}

                // 更新选中样式
                resultsContainer.querySelectorAll('.ttw-search-result-item').forEach(i => {
                    i.style.background = 'rgba(0,0,0,0.2)';
                });
                this.style.background = 'rgba(0,0,0,0.4)';

                // 获取条目数据
                let entry = null;
                let dataSource = '';

                if (result.memoryIndex >= 0) {
                    const mem = AppState.memory.queue[result.memoryIndex];
                    if (mem && mem.result && mem.result[result.category]) {
                        entry = mem.result[result.category][result.entryName];
                        dataSource = `来自: 记忆${result.memoryIndex + 1} 的当前处理结果`;
                    }
                }

                if (!entry) {
                    entry = AppState.worldbook.generated[result.category]?.[result.entryName];
                    dataSource = '来自: 合并后的世界书';
                }

                Logger.debug('Search', '获取的entry=' + JSON.stringify(entry).substring(0, 100));

                const memoryLabel = result.memoryIndex >= 0
                    ? `记忆${result.memoryIndex + 1} (第${result.memoryIndex + 1}章)`
                    : '默认/导入条目';

                let contentHtml = '';
                if (entry) {
                    const keywordsStr = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : '';
                    let content = (entry['内容'] || '').replace(/</g, '<').replace(/>/g, '>');
                    content = highlightKw(content).replace(/\n/g, '<br>');

                    contentHtml = `
                        <div style="margin-bottom:8px;font-size:11px;color:#888;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;">${dataSource}</div>
                        <div style="margin-bottom:12px;padding:10px;background:rgba(155,89,182,0.1);border-radius:6px;">
                            <div style="color:#9b59b6;font-size:11px;margin-bottom:4px;">🔑 关键词</div>
                            <div style="font-size:12px;">${highlightKw(keywordsStr)}</div>
                        </div>
                        <div style="padding:10px;background:rgba(39,174,96,0.1);border-radius:6px;max-height:250px;overflow-y:auto;">
                            <div style="color:#27ae60;font-size:11px;margin-bottom:4px;">📝 内容</div>
                            <div style="font-size:12px;line-height:1.6;">${content}</div>
                        </div>
                    `;
                } else {
                    contentHtml = '<div style="color:#888;text-align:center;padding:20px;">无法获取条目详情</div>';
                }

                detailDiv.innerHTML = `
                    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #444;">
                        <h4 style="color:#e67e22;margin:0 0 8px;font-size:14px;">[${result.category}] ${result.entryName}</h4>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:12px;color:#3498db;">📍 来源: ${memoryLabel}</span>
                            ${result.memoryIndex >= 0 ? `<button class="ttw-btn ttw-btn-small ttw-btn-warning" id="ttw-detail-reroll-btn" data-mem-idx="${result.memoryIndex}">🎲 重Roll此章节</button>` : ''}
                        </div>
                    </div>
                    ${contentHtml}
                `;

                console.log('✅ 详情已更新');

                // 绑定详情页重Roll按钮
                const detailRerollBtn = detailDiv.querySelector('#ttw-detail-reroll-btn');
                if (detailRerollBtn) {
                    detailRerollBtn.onclick = async function () {
                        const memIdx = parseInt(this.dataset.memIdx);
                        const customPrompt = modal.querySelector('#ttw-search-suffix-prompt')?.value || '';

                        if (!await confirmAction(`确定要重Roll 第${memIdx + 1}章 吗？`, { title: '单章重 Roll' })) return;

                        this.disabled = true;
                        this.textContent = '🔄 重Roll中...';

                        try {
                            await handleRerollMemory(memIdx, customPrompt);
                            ErrorHandler.showUserSuccess(`第${memIdx + 1}章 重Roll完成！`);
                            modal.querySelector('#ttw-do-search')?.click();
                            worldbookView.updateWorldbookPreview();
                        } catch (error) {
                            ErrorHandler.showUserError(`重Roll失败: ${error.message}`);
                        } finally {
                            this.disabled = false;
                            this.textContent = '🎲 重Roll此章节';
                        }
                    };
                }
            };
        });


        return { results, memoryIndices: memoryIndicesSet };
    }



// ========== 新增：替换功能 ==========
function showReplaceModal() {
	const existingModal = document.getElementById('ttw-replace-modal');
	if (existingModal) existingModal.remove();

	const bodyHtml = `
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">查找内容</label>
			<input type="text" id="ttw-replace-find" class="ttw-input" placeholder="输入要查找的词语...">
		</div>
		<div style="margin-bottom:16px;">
			<label style="display:block;margin-bottom:8px;font-size:13px;">替换为（留空则删除该词语）</label>
			<input type="text" id="ttw-replace-with" class="ttw-input" placeholder="输入替换内容，留空则删除...">
		</div>
		<div style="margin-bottom:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-replace-in-worldbook" checked>
				<span>替换世界书中的内容</span>
			</label>
			<label class="ttw-checkbox-label" style="margin-top:8px;">
				<input type="checkbox" id="ttw-replace-in-results" checked>
				<span>替换各章节处理结果中的内容</span>
			</label>
		</div>
		<div id="ttw-replace-preview" style="display:none;max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-preview-replace">👁️ 预览</button>
		<button class="ttw-btn ttw-btn-warning" id="ttw-do-replace">🔄 执行替换</button>
		<button class="ttw-btn" id="ttw-close-replace">关闭</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-replace-modal',
		title: '🔄 批量替换',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '600px'
	});

	modal.querySelector('#ttw-close-replace').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-preview-replace').addEventListener('click', () => {
            const findText = modal.querySelector('#ttw-replace-find').value;
            const replaceWith = modal.querySelector('#ttw-replace-with').value;
            const inWorldbook = modal.querySelector('#ttw-replace-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-replace-in-results').checked;

            if (!findText) {
                ErrorHandler.showUserError('请输入要查找的内容');
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            const previewDiv = modal.querySelector('#ttw-replace-preview');
            previewDiv.style.display = 'block';

            // 移除高度限制，允许滚动查看全部
            previewDiv.style.maxHeight = '350px';

            if (preview.count === 0) {
                previewDiv.innerHTML = `<div style="color:#888;text-align:center;padding:20px;">未找到"${findText}"</div>`;
            } else {
                /**
                 * highlightText
                 * 
                 * @param {*} text
                 * @returns {*}
                 */
                const highlightText = (text) => {
                    return text.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                        `<span style="background:#f1c40f;color:#000;padding:1px 2px;border-radius:2px;">${findText}</span>`);
                };

                let itemsHtml = preview.allMatches.map((match, idx) => `
                    <div class="ttw-replace-item" data-index="${idx}" style="font-size:11px;margin-bottom:8px;padding:8px;background:rgba(0,0,0,0.2);border-radius:4px;border-left:3px solid #e67e22;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <div style="color:#888;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${match.location}">${match.locationShort}</div>
                            <button class="ttw-btn-tiny ttw-replace-single-btn" data-index="${idx}" style="background:rgba(230,126,34,0.5);flex-shrink:0;margin-left:8px;">替换此项</button>
                        </div>
                        <div style="color:#e74c3c;text-decoration:line-through;word-break:break-all;margin-bottom:4px;">${highlightText(match.before.replace(/</g, '<').replace(/>/g, '>'))}</div>
                        <div style="color:#27ae60;word-break:break-all;">${match.after.replace(/</g, '<').replace(/>/g, '>')}</div>
                    </div>
                `).join('');

                previewDiv.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #444;">
                        <span style="color:#27ae60;font-weight:bold;">找到 ${preview.allMatches.length} 处匹配</span>
                        <span style="color:#888;font-size:11px;">点击"替换此项"可单独替换</span>
                    </div>
                    <div style="max-height:280px;overflow-y:auto;">
                        ${itemsHtml}
                    </div>
                `;

                // 绑定单项替换按钮事件
                previewDiv.querySelectorAll('.ttw-replace-single-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const matchIndex = parseInt(btn.dataset.index);
                        const matchInfo = preview.allMatches[matchIndex];

                        if (!matchInfo) return;

                        const action = replaceWith ? `替换为"${replaceWith}"` : '删除';
                        if (!await confirmAction(`确定要${action}此处的"${findText}"吗？\n\n位置: ${matchInfo.location}`, { title: '替换单项', danger: true })) return;

                        const success = executeSingleReplace(findText, replaceWith, matchInfo);

                        if (success) {
                            // 移除已替换的项
                            const itemDiv = btn.closest('.ttw-replace-item');
                            if (itemDiv) {
                                itemDiv.style.opacity = '0.3';
                                itemDiv.style.pointerEvents = 'none';
                                btn.textContent = '✓ 已替换';
                                btn.disabled = true;
                            }

                            worldbookView.updateWorldbookPreview();
                        } else {
                            ErrorHandler.showUserError('替换失败，可能条目已被修改');
                        }
                    });
                });
            }
        });

        modal.querySelector('#ttw-do-replace').addEventListener('click', async () => {
            const findText = modal.querySelector('#ttw-replace-find').value;
            const replaceWith = modal.querySelector('#ttw-replace-with').value;
            const inWorldbook = modal.querySelector('#ttw-replace-in-worldbook').checked;
            const inResults = modal.querySelector('#ttw-replace-in-results').checked;

            if (!findText) {
                ErrorHandler.showUserError('请输入要查找的内容');
                return;
            }

            const preview = previewReplace(findText, replaceWith, inWorldbook, inResults);
            if (preview.count === 0) {
                ErrorHandler.showUserError(`未找到"${findText}"`);
                return;
            }

            const action = replaceWith ? `替换为"${replaceWith}"` : '删除';
            if (!await confirmAction(`确定要${action} ${preview.count} 处"${findText}"吗？\n\n此操作不可撤销！`, { title: '批量替换', danger: true })) {
                return;
            }

            const result = executeReplace(findText, replaceWith, inWorldbook, inResults);
            worldbookView.updateWorldbookPreview();

            // 刷新预览区域，显示替换结果而非关闭UI
            const previewDiv = modal.querySelector('#ttw-replace-preview');
            previewDiv.style.display = 'block';
            previewDiv.innerHTML = `
                <div style="text-align:center;padding:20px;">
                    <div style="color:#27ae60;font-weight:bold;font-size:14px;margin-bottom:8px;">✅ 替换完成！共替换了 ${result.count} 处</div>
                    <div style="color:#888;font-size:12px;">可继续输入新的查找/替换内容</div>
                </div>
            `;
        });
    }

    /**
     * previewReplace
     * 
     * @param {*} findText
     * @param {*} replaceWith
     * @param {*} inWorldbook
     * @param {*} inResults
     * @returns {*}
     */
    function previewReplace(findText, replaceWith, inWorldbook, inResults) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let count = 0;
        const allMatches = [];

        if (inWorldbook) {
            for (const category in AppState.worldbook.generated) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    const entry = AppState.worldbook.generated[category][entryName];

                    // 检查条目名称
                    if (entryName.includes(findText)) {
                        count++;
                        allMatches.push({
                            source: 'worldbook',
                            category,
                            entryName,
                            field: 'entryName',
                            fieldIndex: -1,
                            location: `世界书/${category}/${entryName}/条目名称`,
                            locationShort: `[${category}] ${entryName} - 条目名称`,
                            before: entryName,
                            after: entryName.replace(regex, replaceWith)
                        });
                    }

                    // 检查关键词
                    if (Array.isArray(entry['关键词'])) {
                        entry['关键词'].forEach((kw, kwIndex) => {
                            if (kw.includes(findText)) {
                                count++;
                                allMatches.push({
                                    source: 'worldbook',
                                    category,
                                    entryName,
                                    field: 'keyword',
                                    fieldIndex: kwIndex,
                                    location: `世界书/${category}/${entryName}/关键词[${kwIndex}]`,
                                    locationShort: `[${category}] ${entryName} - 关键词`,
                                    before: kw,
                                    after: kw.replace(regex, replaceWith)
                                });
                            }
                        });
                    }

                    // 检查内容
                    if (entry['内容'] && entry['内容'].includes(findText)) {
                        const matches = entry['内容'].match(regex);
                        const matchCount = matches ? matches.length : 0;
                        count += matchCount;

                        const idx = entry['内容'].indexOf(findText);
                        const start = Math.max(0, idx - 20);
                        const end = Math.min(entry['内容'].length, idx + findText.length + 20);
                        const context = (start > 0 ? '...' : '') + entry['内容'].substring(start, end) + (end < entry['内容'].length ? '...' : '');

                        allMatches.push({
                            source: 'worldbook',
                            category,
                            entryName,
                            field: 'content',
                            fieldIndex: -1,
                            location: `世界书/${category}/${entryName}/内容 (${matchCount}处)`,
                            locationShort: `[${category}] ${entryName} - 内容(${matchCount}处)`,
                            before: context,
                            after: context.replace(regex, replaceWith)
                        });
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;

                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];

                        // 检查条目名称
                        if (entryName.includes(findText)) {
                            count++;
                            allMatches.push({
                                source: 'memory',
                                memoryIndex: i,
                                category,
                                entryName,
                                field: 'entryName',
                                fieldIndex: -1,
                                location: `记忆${i + 1}/${category}/${entryName}/条目名称`,
                                locationShort: `记忆${i + 1} [${category}] ${entryName} - 条目名称`,
                                before: entryName,
                                after: entryName.replace(regex, replaceWith)
                            });
                        }

                        if (Array.isArray(entry['关键词'])) {
                            entry['关键词'].forEach((kw, kwIndex) => {
                                if (kw.includes(findText)) {
                                    count++;
                                    allMatches.push({
                                        source: 'memory',
                                        memoryIndex: i,
                                        category,
                                        entryName,
                                        field: 'keyword',
                                        fieldIndex: kwIndex,
                                        location: `记忆${i + 1}/${category}/${entryName}/关键词[${kwIndex}]`,
                                        locationShort: `记忆${i + 1} [${category}] ${entryName} - 关键词`,
                                        before: kw,
                                        after: kw.replace(regex, replaceWith)
                                    });
                                }
                            });
                        }

                        if (entry['内容'] && entry['内容'].includes(findText)) {
                            const matches = entry['内容'].match(regex);
                            const matchCount = matches ? matches.length : 0;
                            count += matchCount;

                            const idx = entry['内容'].indexOf(findText);
                            const start = Math.max(0, idx - 20);
                            const end = Math.min(entry['内容'].length, idx + findText.length + 20);
                            const context = (start > 0 ? '...' : '') + entry['内容'].substring(start, end) + (end < entry['内容'].length ? '...' : '');

                            allMatches.push({
                                source: 'memory',
                                memoryIndex: i,
                                category,
                                entryName,
                                field: 'content',
                                fieldIndex: -1,
                                location: `记忆${i + 1}/${category}/${entryName}/内容 (${matchCount}处)`,
                                locationShort: `记忆${i + 1} [${category}] ${entryName} - 内容(${matchCount}处)`,
                                before: context,
                                after: context.replace(regex, replaceWith)
                            });
                        }
                    }
                }
            }
        }

        return { count, allMatches };
    }


    /**
     * executeSingleReplace
     * 
     * @param {*} findText
     * @param {*} replaceWith
     * @param {*} matchInfo
     * @returns {*}
     */
    function executeSingleReplace(findText, replaceWith, matchInfo) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

        if (matchInfo.source === 'worldbook') {
            if (matchInfo.field === 'entryName') {
                const catData = AppState.worldbook.generated[matchInfo.category];
                if (!catData || !catData[matchInfo.entryName]) return false;
                const newName = matchInfo.entryName.replace(regex, replaceWith);
                if (!newName || newName === matchInfo.entryName) return false;
                const finalName = catData[newName] ? newName + '_重命名' : newName;
                catData[finalName] = catData[matchInfo.entryName];
                delete catData[matchInfo.entryName];
                // 同步AppState.config.entryPosition
                const oldKey = `${matchInfo.category}::${matchInfo.entryName}`;
                const newKey = `${matchInfo.category}::${finalName}`;
                if (AppState.config.entryPosition[oldKey]) {
                    AppState.config.entryPosition[newKey] = AppState.config.entryPosition[oldKey];
                    delete AppState.config.entryPosition[oldKey];
                }
                return true;
            }

            const entry = AppState.worldbook.generated[matchInfo.category]?.[matchInfo.entryName];
            if (!entry) return false;

            if (matchInfo.field === 'keyword' && Array.isArray(entry['关键词'])) {
                const newValue = entry['关键词'][matchInfo.fieldIndex].replace(regex, replaceWith);
                if (newValue) {
                    entry['关键词'][matchInfo.fieldIndex] = newValue;
                } else {
                    entry['关键词'].splice(matchInfo.fieldIndex, 1);
                }
                return true;
            } else if (matchInfo.field === 'content') {
                entry['内容'] = entry['内容'].replace(regex, replaceWith);
                return true;
            }
        } else if (matchInfo.source === 'memory') {
            const memory = AppState.memory.queue[matchInfo.memoryIndex];
            if (!memory?.result) return false;

            if (matchInfo.field === 'entryName') {
                const catData = memory.result[matchInfo.category];
                if (!catData || !catData[matchInfo.entryName]) return false;
                const newName = matchInfo.entryName.replace(regex, replaceWith);
                if (!newName || newName === matchInfo.entryName) return false;
                const finalName = catData[newName] ? newName + '_重命名' : newName;
                catData[finalName] = catData[matchInfo.entryName];
                delete catData[matchInfo.entryName];
                return true;
            }

            const entry = memory.result[matchInfo.category]?.[matchInfo.entryName];
            if (!entry) return false;

            if (matchInfo.field === 'keyword' && Array.isArray(entry['关键词'])) {
                const newValue = entry['关键词'][matchInfo.fieldIndex].replace(regex, replaceWith);
                if (newValue) {
                    entry['关键词'][matchInfo.fieldIndex] = newValue;
                } else {
                    entry['关键词'].splice(matchInfo.fieldIndex, 1);
                }
                return true;
            } else if (matchInfo.field === 'content') {
                entry['内容'] = entry['内容'].replace(regex, replaceWith);
                return true;
            }
        }

        return false;
    }



    /**
     * executeReplace
     * 
     * @param {*} findText
     * @param {*} replaceWith
     * @param {*} inWorldbook
     * @param {*} inResults
     * @returns {*}
     */
    function executeReplace(findText, replaceWith, inWorldbook, inResults) {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        let count = 0;

        if (inWorldbook) {
            // 先收集需要重命名的条目名称（避免遍历中修改对象）
            const renameList = [];
            for (const category in AppState.worldbook.generated) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    if (entryName.includes(findText)) {
                        const newName = entryName.replace(regex, replaceWith);
                        if (newName && newName !== entryName) {
                            renameList.push({ category, oldName: entryName, newName });
                            count++;
                        }
                    }
                }
            }
            // 执行重命名
            for (const item of renameList) {
                const catData = AppState.worldbook.generated[item.category];
                const finalName = catData[item.newName] ? item.newName + '_重命名' : item.newName;
                catData[finalName] = catData[item.oldName];
                delete catData[item.oldName];
                // 同步AppState.config.entryPosition
                const oldKey = `${item.category}::${item.oldName}`;
                const newKey = `${item.category}::${finalName}`;
                if (AppState.config.entryPosition[oldKey]) {
                    AppState.config.entryPosition[newKey] = AppState.config.entryPosition[oldKey];
                    delete AppState.config.entryPosition[oldKey];
                }
            }

            for (const category in AppState.worldbook.generated) {
                for (const entryName in AppState.worldbook.generated[category]) {
                    const entry = AppState.worldbook.generated[category][entryName];

                    if (Array.isArray(entry['关键词'])) {
                        entry['关键词'] = entry['关键词'].map(kw => {
                            if (kw.includes(findText)) {
                                count++;
                                return kw.replace(regex, replaceWith);
                            }
                            return kw;
                        }).filter(kw => kw);
                    }

                    if (entry['内容'] && entry['内容'].includes(findText)) {
                        const matches = entry['内容'].match(regex);
                        count += matches ? matches.length : 0;
                        entry['内容'] = entry['内容'].replace(regex, replaceWith);
                    }
                }
            }
        }

        if (inResults) {
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (!memory.result) continue;

                // 先收集需要重命名的
                const renameList = [];
                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        if (entryName.includes(findText)) {
                            const newName = entryName.replace(regex, replaceWith);
                            if (newName && newName !== entryName) {
                                renameList.push({ category, oldName: entryName, newName });
                                count++;
                            }
                        }
                    }
                }
                // 执行重命名
                for (const item of renameList) {
                    const catData = memory.result[item.category];
                    const finalName = catData[item.newName] ? item.newName + '_重命名' : item.newName;
                    catData[finalName] = catData[item.oldName];
                    delete catData[item.oldName];
                }

                for (const category in memory.result) {
                    for (const entryName in memory.result[category]) {
                        const entry = memory.result[category][entryName];

                        if (Array.isArray(entry['关键词'])) {
                            entry['关键词'] = entry['关键词'].map(kw => {
                                if (kw.includes(findText)) {
                                    count++;
                                    return kw.replace(regex, replaceWith);
                                }
                                return kw;
                            }).filter(kw => kw);
                        }

                        if (entry['内容'] && entry['内容'].includes(findText)) {
                            const matches = entry['内容'].match(regex);
                            count += matches ? matches.length : 0;
                            entry['内容'] = entry['内容'].replace(regex, replaceWith);
                        }
                    }
                }
            }
        }

        return { count };
    }


// ========== 新增：条目配置弹窗 ==========
function showEntryConfigModal(category, entryName) {
	const existingModal = document.getElementById('ttw-entry-config-modal');
	if (existingModal) existingModal.remove();

	const config = getEntryConfig(category, entryName);

	const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">配置此条目在导出为SillyTavern格式时的位置、深度和顺序</div>
		</div>

		<div class="ttw-form-group">
			<label>位置 (Position)</label>
			<select id="ttw-entry-position" class="ttw-select">
				<option value="0" ${config.position === 0 ? 'selected' : ''}>在角色定义之前</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>深度 (Depth) - 仅Position=4时有效</label>
			<input type="number" id="ttw-entry-depth" class="ttw-input" value="${config.depth}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>顺序 (Order) - 数字越小越靠前</label>
			<input type="number" id="ttw-entry-order" class="ttw-input" value="${config.order}" min="0" max="9999">
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-entry-config">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-entry-config">💾 保存</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-entry-config-modal',
		title: `⚙️ 条目配置: ${entryName}`,
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '500px'
	});

	modal.querySelector('#ttw-cancel-entry-config').addEventListener('click', () => ModalFactory.close(modal));

	modal.querySelector('#ttw-save-entry-config').addEventListener('click', () => {
		const position = parseInt(modal.querySelector('#ttw-entry-position').value);
		const depth = parseInt(modal.querySelector('#ttw-entry-depth').value) || 4;
		const order = parseInt(modal.querySelector('#ttw-entry-order').value) || 100;

		setEntryConfig(category, entryName, { position, depth, order });
		ModalFactory.close(modal);
		ErrorHandler.showUserSuccess('配置已保存');
	});
}
    // 新增：显示剧情大纲导出配置弹窗
    function showPlotOutlineConfigModal() {
        const existingModal = document.getElementById('ttw-plot-config-modal');
        if (existingModal) existingModal.remove();

        const config = AppState.config.plotOutline;

	const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">设置"剧情大纲"分类在导出为SillyTavern格式时的默认位置/深度/顺序。此配置会随"导出配置"一起保存。</div>
		</div>

		<div class="ttw-form-group">
			<label>默认位置 (Position)</label>
			<select id="ttw-plot-config-position" class="ttw-select">
				<option value="0" ${(config.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>默认深度 (Depth) - 仅Position=4时有效</label>
			<input type="number" id="ttw-plot-config-depth" class="ttw-input" value="${config.depth || 4}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>默认起始顺序 (Order)</label>
			<input type="number" id="ttw-plot-config-order" class="ttw-input" value="${config.order || 100}" min="0" max="9999">
		</div>

		<div style="margin-top:12px;">
			<label class="ttw-checkbox-label" style="padding:10px;background:rgba(39,174,96,0.15);border-radius:6px;">
				<input type="checkbox" id="ttw-plot-config-auto-increment" ${config.autoIncrementOrder ? 'checked' : ''}>
				<div>
					<span style="color:#27ae60;font-weight:bold;">📈 顺序自动递增</span>
					<div class="ttw-setting-hint">勾选后剧情大纲下的条目顺序会从起始值开始递增（100,101,102...）</div>
				</div>
			</label>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-plot-config">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-plot-config">💾 保存</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-plot-config-modal',
		title: '⚙️ 剧情大纲 - 导出时的默认配置',
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '500px'
	});

	modal.querySelector('#ttw-cancel-plot-config').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-plot-config').addEventListener('click', () => {
            AppState.config.plotOutline = {
                position: parseInt(modal.querySelector('#ttw-plot-config-position').value) || 0,
                depth: parseInt(modal.querySelector('#ttw-plot-config-depth').value) || 4,
                order: parseInt(modal.querySelector('#ttw-plot-config-order').value) || 100,
                autoIncrementOrder: modal.querySelector('#ttw-plot-config-auto-increment').checked
            };

            // 同步到 AppState.config.categoryDefault
            setCategoryDefaultConfig('剧情大纲', AppState.config.plotOutline);

            saveCurrentSettings();
		ModalFactory.close(modal);
		ErrorHandler.showUserSuccess('剧情大纲导出配置已保存！');
        });
    }

    // ========== 新增：分类配置弹窗 ==========
    function showCategoryConfigModal(category) {
        const existingModal = document.getElementById('ttw-category-config-modal');
        if (existingModal) existingModal.remove();

        // 获取当前配置，优先从AppState.config.categoryDefault，其次从AppState.persistent.customCategories
        let config = AppState.config.categoryDefault[category];
        if (!config) {
            const catConfig = AppState.persistent.customCategories.find(c => c.name === category);
            if (catConfig) {
                config = {
                    position: catConfig.defaultPosition || 0,
                    depth: catConfig.defaultDepth || 4,
                    order: catConfig.defaultOrder || 100,
                    autoIncrementOrder: catConfig.autoIncrementOrder || false
                };
            } else {
                config = { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
            }
        }

	const bodyHtml = `
		<div style="margin-bottom:16px;padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
			<div style="font-size:12px;color:#ccc;">设置此分类下所有条目的默认位置/深度/顺序。单个条目的配置会覆盖分类默认配置。</div>
		</div>

		<div class="ttw-form-group">
			<label>默认位置 (Position)</label>
			<select id="ttw-cat-position" class="ttw-select">
				<option value="0" ${(config.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
				<option value="1" ${config.position === 1 ? 'selected' : ''}>在角色定义之后</option>
				<option value="2" ${config.position === 2 ? 'selected' : ''}>在作者注释之前</option>
				<option value="3" ${config.position === 3 ? 'selected' : ''}>在作者注释之后</option>
				<option value="4" ${config.position === 4 ? 'selected' : ''}>自定义深度</option>
			</select>
		</div>

		<div class="ttw-form-group">
			<label>默认深度 (Depth)</label>
			<input type="number" id="ttw-cat-depth" class="ttw-input" value="${config.depth || 4}" min="0" max="999">
		</div>

		<div class="ttw-form-group">
			<label>默认起始顺序 (Order)</label>
			<input type="number" id="ttw-cat-order" class="ttw-input" value="${config.order || 100}" min="0" max="9999">
		</div>

		<div style="margin-top:12px;">
			<label class="ttw-checkbox-label" style="padding:10px;background:rgba(39,174,96,0.15);border-radius:6px;">
				<input type="checkbox" id="ttw-cat-auto-increment" ${config.autoIncrementOrder ? 'checked' : ''}>
				<div>
					<span style="color:#27ae60;font-weight:bold;">📈 顺序自动递增</span>
					<div class="ttw-setting-hint">勾选后同分类下的条目顺序会从起始值开始递增（100,101,102...）</div>
				</div>
			</label>
		</div>

		<div style="margin-top:16px;padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;">
			<label class="ttw-checkbox-label">
				<input type="checkbox" id="ttw-apply-to-existing">
				<span>同时应用到该分类下已有的所有条目</span>
			</label>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn" id="ttw-cancel-cat-config">取消</button>
		<button class="ttw-btn ttw-btn-primary" id="ttw-save-cat-config">💾 保存</button>
	`;

	const modal = ModalFactory.create({
		id: 'ttw-category-config-modal',
		title: `⚙️ 分类默认配置: ${category}`,
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '500px'
	});

	modal.querySelector('#ttw-cancel-cat-config').addEventListener('click', () => ModalFactory.close(modal));

	modal.querySelector('#ttw-save-cat-config').addEventListener('click', () => {
		const position = parseInt(modal.querySelector('#ttw-cat-position').value);
		const depth = parseInt(modal.querySelector('#ttw-cat-depth').value) || 4;
		const order = parseInt(modal.querySelector('#ttw-cat-order').value) || 100;
		const autoIncrementOrder = modal.querySelector('#ttw-cat-auto-increment').checked;
		const applyToExisting = modal.querySelector('#ttw-apply-to-existing').checked;

		setCategoryDefaultConfig(category, { position, depth, order, autoIncrementOrder });

		if (applyToExisting && AppState.worldbook.generated[category]) {
			for (const entryName in AppState.worldbook.generated[category]) {
				setEntryConfig(category, entryName, { position, depth, order });
			}
		}

		const catIndex = AppState.persistent.customCategories.findIndex(c => c.name === category);
		if (catIndex !== -1) {
			AppState.persistent.customCategories[catIndex].defaultPosition = position;
			AppState.persistent.customCategories[catIndex].defaultDepth = depth;
			AppState.persistent.customCategories[catIndex].defaultOrder = order;
			AppState.persistent.customCategories[catIndex].autoIncrementOrder = autoIncrementOrder;
			saveCustomCategories();
		}

		ModalFactory.close(modal);
		worldbookView.updateWorldbookPreview();
		ErrorHandler.showUserSuccess('配置已保存');
	});
}



    // ========== 导出功能 - 修改为使用条目配置 ==========
    function convertToSillyTavernFormat(worldbook) {
        const entries = [];
        let entryId = 0;

        // 按分类统计条目索引，用于顺序递增
        const categoryEntryIndex = {};

        for (const [category, categoryData] of Object.entries(worldbook)) {
            if (typeof categoryData !== 'object' || categoryData === null) continue;

            const isGreenLight = getCategoryLightState(category);
            const autoIncrement = getCategoryAutoIncrement(category);
            const baseOrder = getCategoryBaseOrder(category);

            // 初始化分类计数器
            if (!categoryEntryIndex[category]) {
                categoryEntryIndex[category] = 0;
            }

            for (const [itemName, itemData] of naturalSortEntryNames(Object.keys(categoryData)).map(name => [name, categoryData[name]])) {
                if (typeof itemData !== 'object' || itemData === null) continue;
                if (itemData.关键词 && itemData.内容) {
                    let keywords = Array.isArray(itemData.关键词) ? itemData.关键词 : [itemData.关键词];
                    // 修复：不要过度清理关键词，保留原始格式以便匹配
                    keywords = keywords.map(k => String(k).trim()).filter(k => k.length > 0 && k.length <= 50);
                    if (keywords.length === 0) keywords.push(itemName);

                    // 获取条目配置
                    const config = getEntryConfig(category, itemName);

                    // 计算实际顺序：如果启用自动递增，则使用 baseOrder + index
                    let actualOrder;
                    if (autoIncrement) {
                        actualOrder = baseOrder + categoryEntryIndex[category];
                        categoryEntryIndex[category]++;
                    } else {
                        actualOrder = config.order !== undefined ? config.order : baseOrder;
                    }

                    entries.push({
                        uid: entryId++,
                        key: [...new Set(keywords)],
                        keysecondary: [],
                        comment: `${category} - ${itemName}`,  // 显示分类-名称，合并时看这个
                        content: String(itemData.内容).trim(),
                        constant: !isGreenLight,
                        selective: isGreenLight,
                        selectiveLogic: 0,
                        addMemo: true,
                        order: actualOrder,
                        position: config.position !== undefined ? config.position : 0,
                        disable: false,
                        excludeRecursion: !AppState.settings.allowRecursion,
                        preventRecursion: !AppState.settings.allowRecursion,
                        delayUntilRecursion: false,
                        probability: 100,
                        depth: config.depth !== undefined ? config.depth : 4,

                        // ======= 【修复】=======
                        group: `${category}_${itemName}`,  // 每个条目独立group！
                        groupOverride: false,
                        groupWeight: 100,
                        useGroupScoring: null,
                        // =======================

                        scanDepth: null,
                        caseSensitive: false,
                        matchWholeWords: false,
                        automationId: '',
                        role: 0,
                        vectorized: false,
                        sticky: null,
                        cooldown: null,
                        delay: null
                    });

                }
            }
        }

        return {
            entries,
            originalData: { name: '小说转换的世界书', description: '由TXT转世界书功能生成', version: 1, author: 'TxtToWorldbook' }
        };
    }


    // 【新增】统一获取导出基础名：优先用UI输入框的小说名 > AppState.file.current > fallback
    function getExportBaseName(fallback) {
        // 1. 优先使用用户手动输入的小说名称
        if (AppState.file.novelName && AppState.file.novelName.trim()) {
            return AppState.file.novelName.trim();
        }
        // 2. 其次使用原始文件对象
        if (AppState.file.current) {
            return AppState.file.current.name.replace(/\.[^/.]+$/, '');
        }
        // 3. 再看UI输入框（可能还没同步到AppState.file.novelName）
        const inputEl = document.getElementById('ttw-novel-name-input');
        if (inputEl && inputEl.value.trim()) {
            return inputEl.value.trim();
        }
        // 4. 最后用fallback
        return fallback || '未命名';
    }


    /**
     * exportCharacterCard
     * 
     * @returns {*}
     */
    function exportCharacterCard() {
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');

        const baseName = getExportBaseName('角色卡');

        try {
            const worldbookToExport = AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated;
            const stWorldbook = convertToSillyTavernFormat(worldbookToExport);

            // 将ST内部格式条目转换为V2 spec的character_book entries
            const v2Entries = stWorldbook.entries.map((entry, index) => ({
                id: index,
                keys: Array.isArray(entry.key) ? entry.key : [entry.key],
                secondary_keys: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
                comment: entry.comment || '',
                content: entry.content || '',
                constant: !!entry.constant,
                selective: !!entry.selective,
                insertion_order: entry.order !== undefined ? entry.order : 100,
                enabled: !entry.disable,
                position: entry.position === 1 ? 'after_char' : 'before_char',
                case_sensitive: !!entry.caseSensitive,
                name: entry.comment || `条目${index}`,
                priority: 10,
                extensions: {
                    position: entry.position !== undefined ? entry.position : 0,
                    exclude_recursion: !!entry.excludeRecursion,
                    prevent_recursion: !!entry.preventRecursion,
                    delay_until_recursion: !!entry.delayUntilRecursion,
                    depth: entry.depth !== undefined ? entry.depth : 4,
                    selectiveLogic: entry.selectiveLogic !== undefined ? entry.selectiveLogic : 0,
                    group: entry.group || '',
                    group_override: !!entry.groupOverride,
                    group_weight: entry.groupWeight !== undefined ? entry.groupWeight : 100,
                    use_group_scoring: entry.useGroupScoring !== undefined ? entry.useGroupScoring : null,
                    automation_id: entry.automationId || '',
                    role: entry.role !== undefined ? entry.role : 0,
                    vectorized: !!entry.vectorized,
                    display_index: index,
                    probability: entry.probability !== undefined ? entry.probability : 100,
                    sticky: entry.sticky !== undefined ? entry.sticky : null,
                    cooldown: entry.cooldown !== undefined ? entry.cooldown : null,
                    delay: entry.delay !== undefined ? entry.delay : null,
                    addMemo: entry.addMemo !== undefined ? entry.addMemo : true,
                    scan_depth: entry.scanDepth !== undefined ? entry.scanDepth : null,
                    match_whole_words: entry.matchWholeWords !== undefined ? entry.matchWholeWords : false
                }
            }));

            // 构建V2 spec角色卡
            const characterCard = {
                spec: 'chara_card_v2',
                spec_version: '2.0',
                data: {
                    name: baseName,
                    description: '',
                    personality: '',
                    scenario: '',
                    first_mes: '',
                    mes_example: '',
                    creator_notes: '由TXT转世界书功能生成的角色卡，世界书已绑定',
                    system_prompt: '',
                    post_history_instructions: '',
                    alternate_greetings: [],
                    character_book: {
                        name: `${baseName}-世界书`,
                        description: '由TXT转世界书功能生成',
                        scan_depth: 2,
                        token_budget: 2048,
                        recursive_scanning: !!AppState.settings.allowRecursion,
                        extensions: {},
                        entries: v2Entries
                    },
                    tags: ['TxtToWorldbook', '自动生成'],
                    creator: 'TxtToWorldbook',
                    character_version: '1.0',
                    extensions: {
                        talkativeness: '0.5',
                        fav: false,
                        world: '',
                        depth_prompt: {
                            prompt: '',
                            depth: 4,
                            role: 'system'
                        }
                    }
                }
            };

            const fileName = `${baseName}-角色卡-${timeString}`;
            const blob = new Blob([JSON.stringify(characterCard, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.json';
            a.click();
            URL.revokeObjectURL(url);
            ErrorHandler.showUserSuccess('已导出SillyTavern角色卡（世界书已绑定到角色卡）');
        } catch (error) {
            ErrorHandler.showUserError('导出角色卡失败：' + error.message);
        }
    }


    /**
     * exportToSillyTavern
     * 
     * @returns {*}
     */
    function exportToSillyTavern() {
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        try {
            const worldbookToExport = AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated;
            const sillyTavernWorldbook = convertToSillyTavernFormat(worldbookToExport);

            const baseName = getExportBaseName('世界书');

            const fileName = `${baseName}-世界书-${timeString}`;
            const blob = new Blob([JSON.stringify(sillyTavernWorldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.json';
            a.click();
            URL.revokeObjectURL(url);
            ErrorHandler.showUserSuccess('已导出世界书');
        } catch (error) {
            ErrorHandler.showUserError('转换失败：' + error.message);
        }
    }


    /**
     * exportVolumes
     * 
     * @returns {*}
     */
    function exportVolumes() {
        if (AppState.worldbook.volumes.length === 0) { ErrorHandler.showUserError('没有分卷数据'); return; }
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        for (let i = 0; i < AppState.worldbook.volumes.length; i++) {
            const volume = AppState.worldbook.volumes[i];
            const fileName = `${getExportBaseName('世界书')}-世界书-卷${i + 1}-${timeString}.json`;
            const blob = new Blob([JSON.stringify(volume.worldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
        ErrorHandler.showUserSuccess(`已导出 ${AppState.worldbook.volumes.length} 卷`);
    }

    /**
     * exportTaskState
     * 
     * @returns {Promise<any>}
     */
    async function saveTaskState() {
        const state = {
            version: '2.9.0',
            timestamp: Date.now(),
            memoryQueue: AppState.memory.queue,
            generatedWorldbook: AppState.worldbook.generated,
            worldbookVolumes: AppState.worldbook.volumes,
            currentVolumeIndex: AppState.worldbook.currentVolumeIndex,
            fileHash: AppState.file.hash,
            settings: AppState.settings,
            parallelConfig: AppState.config.parallel,
            categoryLightSettings: AppState.config.categoryLight,
            customWorldbookCategories: AppState.persistent.customCategories,
            chapterRegexSettings: AppState.config.chapterRegex,
            defaultWorldbookEntriesUI: AppState.persistent.defaultEntries,
            categoryDefaultConfig: AppState.config.categoryDefault,
            entryPositionConfig: AppState.config.entryPosition,
            originalFileName: AppState.file.current ? AppState.file.current.name : null,
            novelName: AppState.file.novelName || '' // 【新增】保存小说名称
        };
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');

        const baseName = getExportBaseName('任务状态');
        const fileName = `${baseName}-任务状态-${timeString}.json`;

        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        const processedCount = AppState.memory.queue.filter(m => m.processed).length;
        ErrorHandler.showUserSuccess(`任务状态已导出！已处理: ${processedCount}/${AppState.memory.queue.length}`);
    }

    /**
     * importTaskState
     * 
     * @returns {Promise<any>}
     */
    async function loadTaskState() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const content = await file.text();
                const state = JSON.parse(content);
                if (!state.memoryQueue || !Array.isArray(state.memoryQueue)) throw new Error('无效的任务状态文件');
    AppState.memory.queue = state.memoryQueue;
    AppState.worldbook.generated = state.generatedWorldbook || {};
    AppState.worldbook.volumes = state.worldbookVolumes || [];
    AppState.worldbook.currentVolumeIndex = state.currentVolumeIndex || 0;
    AppState.file.hash = state.fileHash || null;
    
    if (state.settings) AppState.settings = { ...defaultSettings, ...state.settings };
    if (state.parallelConfig) AppState.config.parallel = { ...AppState.config.parallel, ...state.parallelConfig };
    if (state.categoryLightSettings) AppState.config.categoryLight = { ...AppState.config.categoryLight, ...state.categoryLightSettings };
    if (state.customWorldbookCategories) AppState.persistent.customCategories = state.customWorldbookCategories;
    if (state.chapterRegexSettings) AppState.config.chapterRegex = state.chapterRegexSettings;
    if (state.defaultWorldbookEntriesUI) AppState.persistent.defaultEntries = state.defaultWorldbookEntriesUI;
    if (state.categoryDefaultConfig) AppState.config.categoryDefault = state.categoryDefaultConfig;
    if (state.entryPositionConfig) AppState.config.entryPosition = state.entryPositionConfig;
    // 恢复小说名称：优先用novelName字段，其次从originalFileName提取
    if (state.novelName) {
        AppState.file.novelName = state.novelName;
    } else if (state.originalFileName) {
        AppState.file.novelName = state.originalFileName.replace(/\.[^/.]+$/, '');
    }
    
    // 恢复文件名显示
    const fileNameEl = document.getElementById('ttw-file-name');
    if (fileNameEl && state.originalFileName) {
        fileNameEl.textContent = state.originalFileName;
    }
    // 恢复小说名输入框
    const novelNameInput = document.getElementById('ttw-novel-name-input');
    if (novelNameInput && AppState.file.novelName) {
        novelNameInput.value = AppState.file.novelName;
    }
    // 显示小说名行
    const novelNameRow = document.getElementById('ttw-novel-name-row');
    if (novelNameRow) novelNameRow.style.display = 'flex';


    if (Object.keys(AppState.worldbook.generated).length === 0) {
        rebuildWorldbookFromMemories();
    }

    const firstUnprocessed = AppState.memory.queue.findIndex(m => !m.processed || m.failed);
    AppState.memory.startIndex = firstUnprocessed !== -1 ? firstUnprocessed : 0;
    AppState.memory.userSelectedIndex = null;
    
    showQueueSection(true);
    updateMemoryQueueUI();
    if (AppState.processing.volumeMode) updateVolumeIndicator();
    updateStartButtonState(false);
    updateSettingsUI();
    renderCategoriesList();
    renderDefaultWorldbookEntriesUI();
    updateChapterRegexUI();

                if (Object.keys(AppState.worldbook.generated).length > 0) {
                    showResultSection(true);
                    worldbookView.updateWorldbookPreview();
                }

                const processedCount = AppState.memory.queue.filter(m => m.processed).length;
                ErrorHandler.showUserSuccess(`导入成功！已处理: ${processedCount}/${AppState.memory.queue.length}`);
                document.getElementById('ttw-start-btn').disabled = false;
            } catch (error) {
                ErrorHandler.showUserError('导入失败: ' + error.message);
            }
        };
        input.click();
    }

    /**
     * rebuildWorldbookFromMemories
     * 
     * @returns {*}
     */
    function rebuildWorldbookFromMemories() {
        AppState.worldbook.generated = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
        for (const memory of AppState.memory.queue) {
            if (memory.processed && memory.result && !memory.failed) {
                mergeWorldbookDataIncremental(AppState.worldbook.generated, memory.result);
            }
        }
        applyDefaultWorldbookEntries();
        updateStreamContent(`\n📚 从已处理记忆重建了世界书\n`);
    }

    // 修改：导出配置 - 包含默认世界书条目UI
    function exportSettings() {
        saveCurrentSettings();

        const exportData = {
            version: '2.9.0',
            type: 'AppState.settings',
            timestamp: Date.now(),
            settings: { ...AppState.settings },
            categoryLightSettings: AppState.config.categoryLight,
            parallelConfig: AppState.config.parallel,
            customWorldbookCategories: AppState.persistent.customCategories,
            chapterRegexSettings: AppState.config.chapterRegex,
            defaultWorldbookEntriesUI: AppState.persistent.defaultEntries,
            categoryDefaultConfig: AppState.config.categoryDefault,
            entryPositionConfig: AppState.config.entryPosition,
            prompts: {
                worldbookPrompt: AppState.settings.customWorldbookPrompt,
                plotPrompt: AppState.settings.customPlotPrompt,
                stylePrompt: AppState.settings.customStylePrompt,
                mergePrompt: AppState.settings.customMergePrompt,
                rerollPrompt: AppState.settings.customRerollPrompt,
                batchRerollPrompt: AppState.settings.customBatchRerollPrompt,
                defaultWorldbookEntries: AppState.settings.defaultWorldbookEntries
            },
            consolidatePromptPresets: AppState.settings.consolidatePromptPresets,
            consolidateCategoryPresetMap: AppState.settings.consolidateCategoryPresetMap,
            promptMessageChain: AppState.settings.promptMessageChain
        };
        const timeString = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/[:/\s]/g, '').replace(/,/g, '-');
        const fileName = `TxtToWorldbook-配置-${timeString}.json`;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        ErrorHandler.showUserSuccess('配置已导出！（包含提示词配置、整理条目预设和默认世界书条目）');
    }

    // 修改：导入配置 - 包含默认世界书条目UI
    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const content = await file.text();
                const data = JSON.parse(content);
                if (data.type !== 'AppState.settings') throw new Error('不是有效的配置文件');

                if (data.settings) {
                    AppState.settings = { ...defaultSettings, ...data.settings };
                }
                if (data.parallelConfig) {
                    AppState.config.parallel = { ...AppState.config.parallel, ...data.parallelConfig };
                }
                if (data.categoryLightSettings) {
                    AppState.config.categoryLight = { ...AppState.config.categoryLight, ...data.categoryLightSettings };
                }
                if (data.customWorldbookCategories) {
                    AppState.persistent.customCategories = data.customWorldbookCategories;
                    await saveCustomCategories();
                }
                if (data.chapterRegexSettings) {
                    AppState.config.chapterRegex = data.chapterRegexSettings;
                }
                if (data.defaultWorldbookEntriesUI) {
                    AppState.persistent.defaultEntries = data.defaultWorldbookEntriesUI;
                }
                if (data.categoryDefaultConfig) {
                    AppState.config.categoryDefault = data.categoryDefaultConfig;
                }
                if (data.entryPositionConfig) {
                    AppState.config.entryPosition = data.entryPositionConfig;
                }
                // 新增：导入剧情大纲导出配置
                if (data.plotOutlineExportConfig) {
                    AppState.config.plotOutline = data.plotOutlineExportConfig;
                }
                // 新增：导入消息链配置
                if (data.promptMessageChain) {
                    AppState.settings.promptMessageChain = data.promptMessageChain;
                }
                // 新增：导入整理条目预设配置
                if (data.consolidatePromptPresets) {
                    AppState.settings.consolidatePromptPresets = data.consolidatePromptPresets;
                }
                if (data.consolidateCategoryPresetMap) {
                    AppState.settings.consolidateCategoryPresetMap = data.consolidateCategoryPresetMap;
                }

                if (data.prompts) {
                    if (data.prompts.worldbookPrompt !== undefined) {
                        AppState.settings.customWorldbookPrompt = data.prompts.worldbookPrompt;
                    }
                    if (data.prompts.plotPrompt !== undefined) {
                        AppState.settings.customPlotPrompt = data.prompts.plotPrompt;
                    }
                    if (data.prompts.stylePrompt !== undefined) {
                        AppState.settings.customStylePrompt = data.prompts.stylePrompt;
                    }
                    if (data.prompts.mergePrompt !== undefined) {
                        AppState.settings.customMergePrompt = data.prompts.mergePrompt;
                    }
                    if (data.prompts.rerollPrompt !== undefined) {
                        AppState.settings.customRerollPrompt = data.prompts.rerollPrompt;
                    }
                    if (data.prompts.batchRerollPrompt !== undefined) {
                        AppState.settings.customBatchRerollPrompt = data.prompts.batchRerollPrompt;
                    }
                    // 旧版兼容：单个整理提示词迁移为预设
                    if (data.prompts.consolidatePrompt && data.prompts.consolidatePrompt.trim()) {
                        if (!AppState.settings.consolidatePromptPresets) AppState.settings.consolidatePromptPresets = [];
                        if (!AppState.settings.consolidatePromptPresets.some(p => p.name === '旧版自定义')) {
                            AppState.settings.consolidatePromptPresets.push({ name: '旧版自定义', prompt: data.prompts.consolidatePrompt });
                        }
                    }
                    if (data.prompts.defaultWorldbookEntries !== undefined) {
                        AppState.settings.defaultWorldbookEntries = data.prompts.defaultWorldbookEntries;
                    }
                }

                updateSettingsUI();
                renderCategoriesList();
                renderDefaultWorldbookEntriesUI();
                updateChapterRegexUI();
                saveCurrentSettings();

                ErrorHandler.showUserSuccess('配置导入成功！');
            } catch (error) {
                ErrorHandler.showUserError('导入失败: ' + error.message);
            }
        };
        input.click();
    }


    // ========== 消息链编辑器UI渲染 ==========
    function renderMessageChainUI() {
        const container = document.getElementById('ttw-message-chain-list');
        if (!container) return;

        const chain = AppState.settings.promptMessageChain || [{ role: 'user', content: '{PROMPT}', enabled: true }];
        const roleColors = { system: '#3498db', user: '#27ae60', assistant: '#f39c12' };
        const roleLabels = { system: '🔷 系统', user: '🟢 用户', assistant: '🟡 AI助手' };

        const html = ListRenderer.renderItems(
            chain,
            (msg, idx) => ListRenderer.renderMessageChainItem(msg, idx, chain.length, { roleColors, roleLabels }),
            { emptyMessage: '暂无消息，点击「➕ 添加消息」开始配置' }
        );

        ListRenderer.updateContainer(container, html);

        if (container.dataset.eventsBound === 'true') return;

        const getChain = () => (AppState.settings.promptMessageChain || [{ role: 'user', content: '{PROMPT}', enabled: true }]);

        EventDelegate.on(container, '.ttw-chain-role', 'change', (e, sel) => {
            const idx = parseInt(sel.dataset.chainIndex);
            const nextChain = getChain();
            if (!nextChain[idx]) return;
            nextChain[idx].role = sel.value;
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
            handleUseTavernApiChange();
        });

        EventDelegate.on(container, '.ttw-chain-enabled', 'change', (e, cb) => {
            const idx = parseInt(cb.dataset.chainIndex);
            const nextChain = getChain();
            if (!nextChain[idx]) return;
            nextChain[idx].enabled = cb.checked;
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
            handleUseTavernApiChange();
        });

        EventDelegate.on(container, '.ttw-chain-content', 'input', (e, ta) => {
            const idx = parseInt(ta.dataset.chainIndex);
            const nextChain = getChain();
            if (!nextChain[idx]) return;
            nextChain[idx].content = ta.value;
            AppState.settings.promptMessageChain = nextChain;
            saveCurrentSettings();
        });

        EventDelegate.on(container, '.ttw-chain-move-up', 'click', (e, btn) => {
            const idx = parseInt(btn.dataset.chainIndex);
            const nextChain = getChain();
            if (idx > 0) {
                [nextChain[idx], nextChain[idx - 1]] = [nextChain[idx - 1], nextChain[idx]];
            }
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
        });

        EventDelegate.on(container, '.ttw-chain-move-down', 'click', (e, btn) => {
            const idx = parseInt(btn.dataset.chainIndex);
            const nextChain = getChain();
            if (idx < nextChain.length - 1) {
                [nextChain[idx], nextChain[idx + 1]] = [nextChain[idx + 1], nextChain[idx]];
            }
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
        });

        EventDelegate.on(container, '.ttw-chain-delete', 'click', (e, btn) => {
            const idx = parseInt(btn.dataset.chainIndex);
            const nextChain = getChain();
            nextChain.splice(idx, 1);
            AppState.settings.promptMessageChain = nextChain;
            renderMessageChainUI();
            saveCurrentSettings();
        });

        container.dataset.eventsBound = 'true';
    }

    /**
     * updateSettingsUI
     * 
     * @returns {*}
     */
    function updateSettingsUI() {
        hydrateSettingsFromState({
            AppState,
            handleUseTavernApiChange,
            handleProviderChange,
            renderMessageChainUI,
        });
    }

    /**
     * updateChapterRegexUI
     * 
     * @returns {*}
     */
    function updateChapterRegexUI() {
        const regexInput = document.getElementById('ttw-chapter-regex');
        if (regexInput) {
            regexInput.value = AppState.config.chapterRegex.pattern;
        }
    }

    // ========== 渲染分类列表 ==========
    function renderCategoriesList() {
        const listContainer = document.getElementById('ttw-categories-list');
        if (!listContainer) return;

        const html = ListRenderer.renderItems(
            AppState.persistent.customCategories,
            (cat, index) => ListRenderer.renderCategoryItem(cat, index, {
                hasDefault: DEFAULT_WORLDBOOK_CATEGORIES.some(c => c.name === cat.name)
            }),
            { emptyMessage: '暂无分类配置' }
        );

        ListRenderer.updateContainer(listContainer, html);

        if (listContainer.dataset.eventsBound === 'true') return;

        EventDelegate.on(listContainer, '.ttw-category-cb', 'change', async (e, cb) => {
            const index = parseInt(cb.dataset.index);
            if (!AppState.persistent.customCategories[index]) return;
            AppState.persistent.customCategories[index].enabled = cb.checked;
            await saveCustomCategories();
        });

        EventDelegate.on(listContainer, '.ttw-edit-cat', 'click', (e, btn) => {
            const index = parseInt(btn.dataset.index);
            showEditCategoryModal(index);
        });

        EventDelegate.on(listContainer, '.ttw-reset-single-cat', 'click', async (e, btn) => {
            const index = parseInt(btn.dataset.index);
            const cat = AppState.persistent.customCategories[index];
            if (!cat) return;
            const confirmed = await confirmAction(`确定重置"${cat.name}"为默认配置吗？`, { title: '重置分类' });
            if (!confirmed) return;
            await resetSingleCategory(index);
            renderCategoriesList();
        });

        EventDelegate.on(listContainer, '.ttw-delete-cat', 'click', async (e, btn) => {
            const index = parseInt(btn.dataset.index);
            const cat = AppState.persistent.customCategories[index];
            if (!cat || cat.isBuiltin) return;
            const confirmed = await confirmAction(`确定删除分类"${cat.name}"吗？`, { title: '删除分类', danger: true });
            if (!confirmed) return;
            AppState.persistent.customCategories.splice(index, 1);
            await saveCustomCategories();
            renderCategoriesList();
        });

        listContainer.dataset.eventsBound = 'true';
    }

    /**
     * showAddCategoryModal
     * 
     * @returns {*}
     */
    function showAddCategoryModal() {
        showEditCategoryModal(null);
    }

    /**
     * showEditCategoryModal
     * 
     * @param {*} editIndex
     * @returns {*}
     */
    function showEditCategoryModal(editIndex) {
        const isEdit = editIndex !== null;
        const cat = isEdit ? AppState.persistent.customCategories[editIndex] : {
            name: '',
            enabled: true,
            isBuiltin: false,
            entryExample: '',
            keywordsExample: [],
            contentGuide: '',
            defaultPosition: 0,
            defaultDepth: 4,
            defaultOrder: 100,
            autoIncrementOrder: false
        };

        const body = `
                    <div class="ttw-form-group">
                        <label>分类名称 *</label>
                        <input type="text" id="ttw-cat-name" value="${cat.name}" placeholder="如：道具、玩法" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>条目名称示例</label>
                        <input type="text" id="ttw-cat-entry-example" value="${cat.entryExample}" placeholder="如：道具名称" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>关键词示例（逗号分隔）</label>
                        <input type="text" id="ttw-cat-keywords" value="${cat.keywordsExample.join(', ')}" placeholder="如：道具名, 别名" class="ttw-input">
                    </div>
                    <div class="ttw-form-group">
                        <label>内容提取指南</label>
                        <textarea id="ttw-cat-content-guide" rows="4" class="ttw-textarea-small" placeholder="描述AI应该提取哪些信息...">${cat.contentGuide}</textarea>
                    </div>

                    <div style="margin-top:16px;padding:12px;background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);border-radius:8px;">
                        <div style="font-weight:bold;color:#9b59b6;margin-bottom:12px;">⚙️ 导出时的默认配置</div>
                        <div class="ttw-form-group">
                            <label>默认位置 (Position)</label>
                            <select id="ttw-cat-default-position" class="ttw-select">
                                <option value="0" ${(cat.defaultPosition || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
                                <option value="1" ${cat.defaultPosition === 1 ? 'selected' : ''}>在角色定义之后</option>
                                <option value="2" ${cat.defaultPosition === 2 ? 'selected' : ''}>在作者注释之前</option>
                                <option value="3" ${cat.defaultPosition === 3 ? 'selected' : ''}>在作者注释之后</option>
                                <option value="4" ${cat.defaultPosition === 4 ? 'selected' : ''}>自定义深度</option>
                            </select>
                        </div>
                        <div class="ttw-form-group">
                            <label>默认深度 (Depth) - 仅Position=4时有效</label>
                            <input type="number" id="ttw-cat-default-depth" class="ttw-input" value="${cat.defaultDepth || 4}" min="0" max="999">
                        </div>
                        <div class="ttw-form-group">
                            <label>默认起始顺序 (Order)</label>
                            <input type="number" id="ttw-cat-default-order" class="ttw-input" value="${cat.defaultOrder || 100}" min="0" max="9999">
                        </div>
                        <div style="margin-top:10px;">
                            <label class="ttw-checkbox-label" style="padding:8px;background:rgba(39,174,96,0.15);border-radius:6px;">
                                <input type="checkbox" id="ttw-cat-auto-increment" ${cat.autoIncrementOrder ? 'checked' : ''}>
                                <div>
                                    <span style="color:#27ae60;font-weight:bold;">📈 顺序自动递增</span>
                                    <div class="ttw-setting-hint">勾选后同分类下的条目顺序会从起始值开始递增（100,101,102...）</div>
                                </div>
                            </label>
                        </div>
                    </div>
        `;
        
        const footer = `
                    <button class="ttw-btn" id="ttw-cancel-cat">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-save-cat">💾 保存</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-category-modal',
            title: isEdit ? '✏️ 编辑分类' : '➕ 添加分类',
            body: body,
            footer: footer,
            width: '550px',
            maxHeight: '70vh'
        });

        modal.querySelector('#ttw-cancel-cat').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-cat').addEventListener('click', async () => {
            const name = document.getElementById('ttw-cat-name').value.trim();
            if (!name) { ErrorHandler.showUserError('请输入分类名称'); return; }

            const duplicateIndex = AppState.persistent.customCategories.findIndex((c, i) => c.name === name && i !== editIndex);
            if (duplicateIndex !== -1) { ErrorHandler.showUserError('该分类名称已存在'); return; }

            const entryExample = document.getElementById('ttw-cat-entry-example').value.trim();
            const keywordsStr = document.getElementById('ttw-cat-keywords').value.trim();
            const contentGuide = document.getElementById('ttw-cat-content-guide').value.trim();
            const defaultPosition = parseInt(document.getElementById('ttw-cat-default-position').value) || 0;
            const defaultDepth = parseInt(document.getElementById('ttw-cat-default-depth').value) || 4;
            const defaultOrder = parseInt(document.getElementById('ttw-cat-default-order').value) || 100;
            const autoIncrementOrder = document.getElementById('ttw-cat-auto-increment').checked;

            const keywordsExample = keywordsStr ? keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k) : [];

            const newCat = {
                name,
                enabled: isEdit ? cat.enabled : true,
                isBuiltin: isEdit ? cat.isBuiltin : false,
                entryExample: entryExample || name + '名称',
                keywordsExample: keywordsExample.length > 0 ? keywordsExample : [name + '名'],
                contentGuide: contentGuide || `基于原文的${name}描述`,
                defaultPosition,
                defaultDepth,
                defaultOrder,
                autoIncrementOrder
            };

            if (isEdit) {
                AppState.persistent.customCategories[editIndex] = newCat;
            } else {
                AppState.persistent.customCategories.push(newCat);
            }

            // 同步更新 AppState.config.categoryDefault
            setCategoryDefaultConfig(name, {
                position: defaultPosition,
                depth: defaultDepth,
                order: defaultOrder,
                autoIncrementOrder
            });

            await saveCustomCategories();
            renderCategoriesList();
            modal.remove();
        });

    }

    // ========== 新增：默认世界书条目UI ==========
    function renderDefaultWorldbookEntriesUI() {
        const container = document.getElementById('ttw-default-entries-list');
        if (!container) return;

        if (AppState.persistent.defaultEntries.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无默认条目，点击"添加"按钮创建</div>';
            return;
        }

        const itemsHtml = AppState.persistent.defaultEntries.map((entry, index) => `
            <div class="ttw-default-entry-item">
                <div class="ttw-default-entry-header">
                    <span class="ttw-default-entry-title">[${ListRenderer.escapeHtml(entry.category || '未分类')}] ${ListRenderer.escapeHtml(entry.name || '未命名')}</span>
                    <div class="ttw-default-entry-actions">
                        <button class="ttw-btn-tiny ttw-edit-default-entry" data-index="${index}" title="编辑">✏️</button>
                        <button class="ttw-btn-tiny ttw-delete-default-entry" data-index="${index}" title="删除">🗑️</button>
                    </div>
                </div>
                <div class="ttw-default-entry-info">
                    <span style="color:#9b59b6;">关键词:</span> ${ListRenderer.escapeHtml((entry.keywords || []).join(', ') || '无')}
                </div>
            </div>
        `).join('');

        PerfUtils.smartUpdate(container, itemsHtml);

        if (!container.dataset.eventsBound) {
            EventDelegate.on(container, '.ttw-edit-default-entry', 'click', (e, btn) => {
                const index = parseInt(btn.dataset.index);
                showEditDefaultEntryModal(index);
            });

            EventDelegate.on(container, '.ttw-delete-default-entry', 'click', async (e, btn) => {
                const index = parseInt(btn.dataset.index);
                const confirmed = await ModalFactory.confirm({ title: '删除默认条目', message: '确定删除此默认条目吗？', danger: true });
                if (confirmed) {
                    AppState.persistent.defaultEntries.splice(index, 1);
                    saveDefaultWorldbookEntriesUI();
                    renderDefaultWorldbookEntriesUI();
                }
            });
            container.dataset.eventsBound = 'true';
        }
    }

    /**
     * showAddDefaultEntryModal
     * 
     * @returns {*}
     */
    function showAddDefaultEntryModal() {
        showEditDefaultEntryModal(null);
    }

    /**
     * showEditDefaultEntryModal
     * 
     * @param {*} editIndex
     * @returns {*}
     */
    function showEditDefaultEntryModal(editIndex) {
        const isEdit = editIndex !== null;
        const entry = isEdit ? AppState.persistent.defaultEntries[editIndex] : {
            category: '',
            name: '',
            keywords: [],
            content: '',
            position: 0,
            depth: 4,
            order: 100
        };

        const body = `
                <div class="ttw-form-group">
                    <label>分类 *</label>
                    <input type="text" id="ttw-default-entry-category" value="${entry.category}" placeholder="如：角色、地点、系统" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>条目名称 *</label>
                    <input type="text" id="ttw-default-entry-name" value="${entry.name}" placeholder="条目名称" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>关键词（逗号分隔）</label>
                    <input type="text" id="ttw-default-entry-keywords" value="${(entry.keywords || []).join(', ')}" placeholder="关键词1, 关键词2" class="ttw-input">
                </div>
                <div class="ttw-form-group">
                    <label>内容</label>
                    <textarea id="ttw-default-entry-content" rows="6" class="ttw-textarea-small" placeholder="条目内容...">${entry.content || ''}</textarea>
                </div>
                <div class="ttw-form-group">
                    <label>位置</label>
                    <select id="ttw-default-entry-position" class="ttw-select">
                        <option value="0" ${(entry.position || 0) === 0 ? 'selected' : ''}>在角色定义之前</option>
                        <option value="1" ${entry.position === 1 ? 'selected' : ''}>在角色定义之后</option>
                        <option value="2" ${entry.position === 2 ? 'selected' : ''}>在作者注释之前</option>
                        <option value="3" ${entry.position === 3 ? 'selected' : ''}>在作者注释之后</option>
                        <option value="4" ${entry.position === 4 ? 'selected' : ''}>自定义深度</option>
                    </select>
                </div>
                <div class="ttw-form-group">
                    <label>深度（仅位置为"自定义深度"时有效）</label>
                    <input type="number" id="ttw-default-entry-depth" class="ttw-input" value="${entry.depth || 4}" min="0" max="999">
                </div>
                <div class="ttw-form-group">
                    <label>顺序（数字越小越靠前）</label>
                    <input type="number" id="ttw-default-entry-order" class="ttw-input" value="${entry.order || 100}" min="0" max="9999">
                </div>
        `;

        const footer = `
                <button class="ttw-btn" id="ttw-cancel-default-entry">取消</button>
                <button class="ttw-btn ttw-btn-primary" id="ttw-save-default-entry">💾 保存</button>
        `;

        const modal = ModalFactory.create({
            id: 'ttw-default-entry-modal',
            title: isEdit ? '✏️ 编辑默认条目' : '➕ 添加默认条目',
            body: body,
            footer: footer,
            width: '550px'
        });

        modal.querySelector('#ttw-cancel-default-entry').addEventListener('click', () => ModalFactory.close(modal));

        modal.querySelector('#ttw-save-default-entry').addEventListener('click', () => {
            const category = document.getElementById('ttw-default-entry-category').value.trim();
            const name = document.getElementById('ttw-default-entry-name').value.trim();
            const keywordsStr = document.getElementById('ttw-default-entry-keywords').value.trim();
            const content = document.getElementById('ttw-default-entry-content').value;
            const position = parseInt(document.getElementById('ttw-default-entry-position').value) || 0;
            const depth = parseInt(document.getElementById('ttw-default-entry-depth').value) || 4;
            const order = parseInt(document.getElementById('ttw-default-entry-order').value) || 100;

            if (!category) { ErrorHandler.showUserError('请输入分类'); return; }
            if (!name) { ErrorHandler.showUserError('请输入条目名称'); return; }

            const keywords = keywordsStr ? keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k) : [];

            const newEntry = { category, name, keywords, content, position, depth, order };

            if (isEdit) {
                AppState.persistent.defaultEntries[editIndex] = newEntry;
            } else {
                AppState.persistent.defaultEntries.push(newEntry);
            }

            saveDefaultWorldbookEntriesUI();
            renderDefaultWorldbookEntriesUI();
            ModalFactory.close(modal);
        });
    }

    /**
     * saveDefaultWorldbookEntriesUI
     * 
     * @returns {*}
     */
    function saveDefaultWorldbookEntriesUI() {
        AppState.settings.defaultWorldbookEntriesUI = AppState.persistent.defaultEntries;
        saveCurrentSettings();
    }

    // ========== 章回检测功能 ==========
    function detectChaptersWithRegex(content, regexPattern) {
        try {
            const regex = new RegExp(regexPattern, 'g');
            const matches = [...content.matchAll(regex)];
            return matches;
        } catch (e) {
            Logger.error('Regex', '正则表达式错误:', e);
            return [];
        }
    }

    /**
     * testChapterRegex
     * 
     * @returns {*}
     */
    function testChapterRegex() {
        if (!AppState.file.current && AppState.memory.queue.length === 0) {
            ErrorHandler.showUserError('请先上传文件');
            return;
        }

        const regexInput = document.getElementById('ttw-chapter-regex');
        const pattern = regexInput?.value || AppState.config.chapterRegex.pattern;

        const content = AppState.memory.queue.length > 0 ? AppState.memory.queue.map(m => m.content).join('') : '';
        if (!content) {
            ErrorHandler.showUserError('请先上传并加载文件');
            return;
        }

        const matches = detectChaptersWithRegex(content, pattern);

        if (matches.length === 0) {
            const modal = ModalFactory.create({
                id: 'ttw-regex-test-modal',
                title: '❌ 未检测到章节',
                body: `<div style="white-space: pre-wrap; padding: 10px;">当前正则: <code>${pattern}</code>\n\n建议:\n1. 尝试使用快速选择按钮\n2. 检查正则表达式是否正确</div>`,
                footer: `<button class="ttw-btn ttw-btn-primary" id="ttw-close-regex-test">关闭</button>`
            });
            modal.querySelector('#ttw-close-regex-test').addEventListener('click', () => ModalFactory.close(modal));
        } else {
            const previewChapters = matches.slice(0, 10).map(m => m[0]).join('\n');
            const modal = ModalFactory.create({
                id: 'ttw-regex-test-modal',
                title: `✅ 检测到 ${matches.length} 个章节`,
                body: `<div style="white-space: pre-wrap; padding: 10px; max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.3); color: #ccc; border-radius: 4px; border: 1px solid #555;">前10个章节预览:\n\n${previewChapters}${matches.length > 10 ? '\n...' : ''}</div>`,
                footer: `<button class="ttw-btn ttw-btn-primary" id="ttw-close-regex-test">关闭</button>`
            });
            modal.querySelector('#ttw-close-regex-test').addEventListener('click', () => ModalFactory.close(modal));
        }
    }

/**
 * rechunkMemories
 * 
 * @returns {*}
 */
async function rechunkMemories() {
    if (AppState.memory.queue.length === 0) {
        ErrorHandler.showUserError('没有可重新分块的内容');
        return;
    }

    const processedCount = AppState.memory.queue.filter(m => m.processed && !m.failed).length;

    if (processedCount > 0) {
        const confirmMsg = `⚠️ 警告：当前有 ${processedCount} 个已处理的章节。\n\n重新分块将会：\n1. 清除所有已处理状态\n2. 需要重新从头开始转换\n3. 但不会清除已生成的世界书数据\n\n确定要重新分块吗？`;
        if (!await confirmAction(confirmMsg, { title: '重新分块', danger: true })) return;
    }

    const allContent = AppState.memory.queue.map(m => m.content).join('');

    splitContentIntoMemory(allContent);

    AppState.memory.startIndex = 0;
    AppState.memory.userSelectedIndex = null;
    

    updateMemoryQueueUI();
    updateStartButtonState(false);

    ErrorHandler.showUserSuccess(`重新分块完成！\n当前共 ${AppState.memory.queue.length} 个章节`);
}

// ========== 帮助弹窗 ==========
function showHelpModal() {
    const existingHelp = document.getElementById('ttw-help-modal');
    if (existingHelp) existingHelp.remove();

    const bodyHtml = `
<div style="margin-bottom:16px;">
<h4 style="color:#e67e22;margin:0 0 10px;">📌 基本功能</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>将TXT小说转换为SillyTavern世界书格式</li>
<li>自动检测文件编码（UTF-8/GBK/GB2312/GB18030/Big5）</li>
<li>基于正则的<strong>章回自动检测</strong>和智能分块（支持自定义正则、快速预设、重新分块）</li>
<li>支持<strong>并行/串行</strong>处理，并行支持独立模式和分批模式，可配置并发数</li>
<li><strong>增量输出</strong>：只输出变更条目，减少重复</li>
<li><strong>分卷模式</strong>：上下文超限时自动分卷</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#3498db;margin:0 0 10px;">🔧 API模式</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>酒馆API</strong>：使用SillyTavern当前连接的AI（注意：消息角色会被酒馆后处理覆盖，且可能注入预设JB内容）</li>
<li><strong>自定义API</strong>：直连API，消息链角色设置完全生效，不受酒馆干预</li>
<li>支持 <strong>Gemini / Anthropic / OpenAI兼容</strong> 多种直连和代理模式</li>
<li>支持<strong>拉取模型列表</strong>、<strong>快速测试连接</strong>、<strong>自动限流重试</strong></li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">🏷️ 自定义提取分类</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>内置分类：<strong>角色、地点、组织</strong>；预设分类：<strong>道具、玩法、章节剧情、角色内心</strong></li>
<li>支持添加/编辑/删除自定义分类，每个分类可配置名称、条目示例、关键词示例、内容提取指南</li>
<li>每个分类可配置<strong>默认导出位置/深度/顺序/自动递增</strong></li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#27ae60;margin:0 0 10px;">📝 提示词系统</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>世界书词条提示词</strong>（核心，含 <code>{DYNAMIC_JSON_TEMPLATE}</code> 占位符）</li>
<li>可选：<strong>剧情大纲</strong>、<strong>文风配置</strong>、<strong>后缀提示词</strong></li>
<li><strong>💬消息链配置</strong>：将提示词按对话补全预设格式发送，每条消息可指定角色（🔷系统/🟢用户/🟡AI助手）</li>
<li>消息链中使用 <code>{PROMPT}</code> 占位符代表实际组装好的提示词内容</li>
<li>酒馆API优先使用 <code>generateRaw</code> 消息数组格式（ST 1.13.2+），自动兼容旧版</li>
<li>所有提示词支持恢复默认和预览，支持<strong>导出/导入配置</strong></li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e67e22;margin:0 0 10px;">📚 默认世界书条目</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>可视化添加/编辑/删除默认条目，每个条目可配置分类、名称、关键词、内容、位置/深度/顺序</li>
<li>转换时<strong>自动添加</strong>到世界书，也可<strong>立即应用</strong>到当前世界书</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#1abc9c;margin:0 0 10px;">📋 章节管理</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>点击章节查看原文、编辑、复制、重Roll、合并到上一章/下一章</li>
<li><strong>⬆️⬇️ 合并章节</strong>：合并相邻章节，自动更新世界书</li>
<li><strong>🗑️ 多选删除</strong>：批量选择并删除章节（已处理章节的警告提示）</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e74c3c;margin:0 0 10px;">🔍 查找与替换</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>查找高亮</strong>：在世界书预览中高亮显示关键词</li>
<li><strong>批量替换</strong>：一键替换所有匹配项</li>
<li>支持<strong>正则表达式</strong>和<strong>大小写敏感</strong>选项</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">🔗 别名合并</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>自动检测疑似同名条目，AI判断后合并</li>
<li>支持<strong>手动合并</strong>：跨分类勾选条目合并，自定义主名称和目标分类</li>
<li><strong>两两判断</strong>：AI对每一对分别判断，自动串联结果（A=B且B=C → A,B,C合并）</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#f1c40f;margin:0 0 10px;">🔢 Token计数</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>每个条目/分类/全局显示Token数，支持<strong>阈值高亮</strong>快速发现截断条目</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#95a5a6;margin:0 0 10px;">📜 修改历史</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>自动记录变更，左右分栏查看，支持<strong>⏪回退到任意版本</strong>，数据存IndexedDB不丢失</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e74c3c;margin:0 0 10px;">📥 导入合并世界书</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>支持SillyTavern格式和内部JSON格式，自动检测重复</li>
<li>重复处理：<strong>AI智能合并</strong> / 覆盖 / 保留 / 重命名 / 内容叠加</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e67e22;margin:0 0 10px;">💾 导入导出</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>导出JSON / SillyTavern格式</strong>，支持分卷导出</li>
<li><strong>导出/导入任务</strong>：保存完整进度，支持换设备继续</li>
<li><strong>导出/导入配置</strong>：保存提示词、分类、默认条目等所有设置</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">🧠 AI优化与整理</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>🧠 AI优化世界书</strong>：让AI自动优化、整理世界书条目内容，提升整体质量</li>
<li><strong>📊 条目演变聚合</strong>：追踪条目在不同章节的变化历程，自动聚合历史信息</li>
<li><strong>🛠️ 整理条目</strong>：AI自动优化条目内容、去除重复信息、标准化格式</li>
<li><strong>🐳 清除标签</strong>：一键清理AI输出的 thinking 、思考等标签内容</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#3498db;margin:0 0 10px;">📊 模型状态显示</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>实时显示API连接状态：成功/失败/连接中</li>
<li>显示可用模型列表，支持快速选择切换</li>
<li>限流信息显示：当前限流设置、TPM余量等</li>
</ul>
</div>

<div style="padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">💡 使用技巧</div>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;font-size:12px;">
<li>长篇小说建议开启<strong>并行模式</strong>（独立模式最快）</li>
<li>遇到乱码？<strong>🔍查找</strong>定位 → <strong>🎲批量重Roll</strong>修复</li>
<li>某条目不满意？点<strong>🎯</strong>单独重Roll，可添加提示词指导</li>
<li>AI输出thinking标签？<strong>🏷️清除标签</strong>一键清理</li>
<li>消息链角色不生效？切换<strong>自定义API模式</strong>（酒馆API会覆盖角色设置）</li>
<li>同一事物多个名字？<strong>🔗别名合并</strong>自动识别</li>
<li>担心进度丢失？随时<strong>📤导出任务</strong>保存</li>
<li>导出时控制位置？点分类或条目旁的<strong>⚙️</strong>按钮配置</li>
<li>主UI只能通过右上角<strong>✕按钮</strong>关闭，防止误触退出</li>
<li>分卷模式下关注<strong>分卷指示器</strong>，了解当前卷和完成进度</li>
</ul>
</div>
`;

    const footerHtml = `<button class="ttw-btn ttw-btn-primary" id="ttw-close-help">我知道了</button>`;

    const helpModal = ModalFactory.create({
        id: 'ttw-help-modal',
        title: '❓ TXT转世界书帮助',
        body: bodyHtml,
        footer: footerHtml,
        maxWidth: '700px',
        maxHeight: '75vh'
    });

    helpModal.querySelector('#ttw-close-help').addEventListener('click', () => ModalFactory.close(helpModal));
}



// ========== 选择起始记忆 ==========
function showStartFromSelector() {
    if (AppState.memory.queue.length === 0) { ErrorHandler.showUserError('请先上传文件'); return; }

    const existingModal = document.getElementById('ttw-start-selector-modal');
    if (existingModal) existingModal.remove();

    let optionsHtml = '';
    AppState.memory.queue.forEach((memory, index) => {
        const status = memory.processed ? (memory.failed ? '❗' : '✅') : '⏳';
        const currentSelected = AppState.memory.userSelectedIndex !== null ? AppState.memory.userSelectedIndex : AppState.memory.startIndex;
        optionsHtml += `<option value="${index}" ${index === currentSelected ? 'selected' : ''}>${status} 第${index + 1}章 - ${ListRenderer.escapeHtml(memory.title)} (${memory.content.length.toLocaleString()}字)</option>`;
    });

    const bodyHtml = `
<div style="margin-bottom:16px;">
<label style="display:block;margin-bottom:8px;font-size:13px;">从哪一章开始：</label>
<select id="ttw-start-from-select" class="ttw-select">${optionsHtml}</select>
</div>
<div style="padding:12px;background:rgba(230,126,34,0.1);border-radius:6px;font-size:12px;color:#f39c12;">⚠️ 从中间开始时，之前的世界书数据不会自动加载。</div>
`;

    const footerHtml = `
<button class="ttw-btn" id="ttw-cancel-start-select">取消</button>
<button class="ttw-btn ttw-btn-primary" id="ttw-confirm-start-select">确定</button>
`;

    const selectorModal = ModalFactory.create({
        id: 'ttw-start-selector-modal',
        title: '📍 选择起始位置',
        body: bodyHtml,
        footer: footerHtml,
        maxWidth: '500px'
    });

    selectorModal.querySelector('#ttw-cancel-start-select').addEventListener('click', () => ModalFactory.close(selectorModal));
    selectorModal.querySelector('#ttw-confirm-start-select').addEventListener('click', () => {
        const selectedIndex = parseInt(document.getElementById('ttw-start-from-select').value);
        AppState.memory.userSelectedIndex = selectedIndex;
        AppState.memory.startIndex = selectedIndex;
        
        const startBtn = document.getElementById('ttw-start-btn');
        if (startBtn) startBtn.textContent = `▶️ 从第${selectedIndex + 1}章开始`;
        ModalFactory.close(selectorModal);
    });
}

// ========== 查看/编辑记忆内容 ==========
function showMemoryContentModal(index) {
    const memory = AppState.memory.queue[index];
    if (!memory) return;

    const existingModal = document.getElementById('ttw-memory-content-modal');
    if (existingModal) existingModal.remove();

    const statusText = memory.processing ? '🔄 处理中' : (memory.processed ? (memory.failed ? '❗ 失败' : '✅ 完成') : '⏳ 等待');
    const statusColor = memory.processing ? '#3498db' : (memory.processed ? (memory.failed ? '#e74c3c' : '#27ae60') : '#f39c12');

    let resultHtml = '';
    if (memory.processed && memory.result && !memory.failed) {
        resultHtml = `
<div style="margin-top:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">📊 处理结果</h4>
<pre style="max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;font-size:11px;white-space:pre-wrap;word-break:break-all;">${JSON.stringify(memory.result, null, 2)}</pre>
</div>
`;
    }

    const bodyHtml = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;">
<div>
<span style="color:${statusColor};font-weight:bold;">${statusText}</span>
<span style="margin-left:16px;color:#888;">字数: <span id="ttw-char-count">${memory.content.length.toLocaleString()}</span></span>
</div>
<div style="display:flex;gap:8px;">
<button id="ttw-copy-memory-content" class="ttw-btn ttw-btn-small">📋 复制</button>
<button id="ttw-roll-history-btn" class="ttw-btn ttw-btn-small" style="background:rgba(155,89,182,0.3);">🎲 Roll历史</button>
<button id="ttw-delete-memory-btn" class="ttw-btn ttw-btn-warning ttw-btn-small">🗑️ 删除</button>
</div>
</div>
${memory.failedError ? `<div style="margin-bottom:16px;padding:10px;background:rgba(231,76,60,0.2);border-radius:6px;color:#e74c3c;font-size:12px;">❌ ${memory.failedError}</div>` : ''}
<div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
<h4 style="color:#3498db;margin:0;">📝 原文内容 <span style="font-size:12px;font-weight:normal;color:#888;">(可编辑)</span></h4>
<div style="display:flex;gap:8px;">
<button id="ttw-append-to-prev" class="ttw-btn ttw-btn-small" ${index === 0 ? 'disabled style="opacity:0.5;"' : ''} title="追加到上一章末尾，并删除当前章">⬆️ 合并到上一章</button>
<button id="ttw-append-to-next" class="ttw-btn ttw-btn-small" ${index === AppState.memory.queue.length - 1 ? 'disabled style="opacity:0.5;"' : ''} title="追加到下一章开头，并删除当前章">⬇️ 合并到下一章</button>
</div>
</div>
<textarea id="ttw-memory-content-editor" class="ttw-textarea">${memory.content.replace(/</g, '<').replace(/>/g, '>')}</textarea>
</div>
${resultHtml}
`;

    const footerHtml = `
<button class="ttw-btn" id="ttw-cancel-memory-edit">取消</button>
<button class="ttw-btn ttw-btn-primary" id="ttw-save-memory-edit">💾 保存修改</button>
`;

    const contentModal = ModalFactory.create({
        id: 'ttw-memory-content-modal',
        title: `📄 ${memory.title} (第${index + 1}章)`,
        body: bodyHtml,
        footer: footerHtml,
        maxWidth: '900px',
        maxHeight: '75vh'
    });

	const editor = contentModal.querySelector('#ttw-memory-content-editor');
	const charCount = contentModal.querySelector('#ttw-char-count');
	const updateCharCount = PerfUtils.debounce(() => {
		charCount.textContent = editor.value.length.toLocaleString();
	}, 100);
	editor.addEventListener('input', updateCharCount);

    contentModal.querySelector('#ttw-cancel-memory-edit').addEventListener('click', () => ModalFactory.close(contentModal));

    contentModal.querySelector('#ttw-save-memory-edit').addEventListener('click', () => {
        const newContent = editor.value;
        if (newContent !== memory.content) {
            memory.content = newContent;
            memory.processed = false;
            memory.failed = false;
            memory.result = null;
            updateMemoryQueueUI();
            updateStartButtonState(false);
        }
        ModalFactory.close(contentModal);
    });

    contentModal.querySelector('#ttw-copy-memory-content').addEventListener('click', () => {
        navigator.clipboard.writeText(editor.value).then(() => {
            const btn = contentModal.querySelector('#ttw-copy-memory-content');
            btn.textContent = '✅ 已复制';
            setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
        });
    });

    contentModal.querySelector('#ttw-roll-history-btn').addEventListener('click', () => {
        ModalFactory.close(contentModal);
        showRollHistorySelector(index);
    });

    contentModal.querySelector('#ttw-delete-memory-btn').addEventListener('click', () => {
            contentModal.remove();
            deleteMemoryAt(index);
        });

        contentModal.querySelector('#ttw-append-to-prev').addEventListener('click', async () => {
            if (index === 0) return;
            const prevMemory = AppState.memory.queue[index - 1];
            if (await confirmAction(`将当前内容合并到 "${prevMemory.title}" 的末尾？\n\n⚠️ 合并后当前章将被删除！`, { title: '合并到上一章', danger: true })) {
                prevMemory.content += '\n\n' + editor.value;
                prevMemory.processed = false;
                prevMemory.failed = false;
                prevMemory.result = null;
                AppState.memory.queue.splice(index, 1);
                AppState.memory.queue.forEach((m, i) => { if (!m.title.includes('-')) m.title = `记忆${i + 1}`; });
                if (AppState.memory.startIndex > index) AppState.memory.startIndex = Math.max(0, AppState.memory.startIndex - 1);
                else if (AppState.memory.startIndex >= AppState.memory.queue.length) AppState.memory.startIndex = Math.max(0, AppState.memory.queue.length - 1);
                if (AppState.memory.userSelectedIndex !== null) {
                    if (AppState.memory.userSelectedIndex > index) AppState.memory.userSelectedIndex = Math.max(0, AppState.memory.userSelectedIndex - 1);
                    else if (AppState.memory.userSelectedIndex >= AppState.memory.queue.length) AppState.memory.userSelectedIndex = null;
                }
                updateMemoryQueueUI();
                updateStartButtonState(false);
                contentModal.remove();
                ErrorHandler.showUserSuccess(`已合并到 "${prevMemory.title}"，当前章已删除`);
            }
        });

        contentModal.querySelector('#ttw-append-to-next').addEventListener('click', async () => {
            if (index === AppState.memory.queue.length - 1) return;
            const nextMemory = AppState.memory.queue[index + 1];
            if (await confirmAction(`将当前内容合并到 "${nextMemory.title}" 的开头？\n\n⚠️ 合并后当前章将被删除！`, { title: '合并到下一章', danger: true })) {
                nextMemory.content = editor.value + '\n\n' + nextMemory.content;
                nextMemory.processed = false;
                nextMemory.failed = false;
                nextMemory.result = null;
                AppState.memory.queue.splice(index, 1);
                AppState.memory.queue.forEach((m, i) => { if (!m.title.includes('-')) m.title = `记忆${i + 1}`; });
                if (AppState.memory.startIndex > index) AppState.memory.startIndex = Math.max(0, AppState.memory.startIndex - 1);
                else if (AppState.memory.startIndex >= AppState.memory.queue.length) AppState.memory.startIndex = Math.max(0, AppState.memory.queue.length - 1);
                if (AppState.memory.userSelectedIndex !== null) {
                    if (AppState.memory.userSelectedIndex > index) AppState.memory.userSelectedIndex = Math.max(0, AppState.memory.userSelectedIndex - 1);
                    else if (AppState.memory.userSelectedIndex >= AppState.memory.queue.length) AppState.memory.userSelectedIndex = null;
                }
                updateMemoryQueueUI();
                updateStartButtonState(false);
                contentModal.remove();
                ErrorHandler.showUserSuccess(`已合并到 "${nextMemory.title}"，当前章已删除`);
            }
        });
    }

// ========== 查看已处理结果 ==========
function showProcessedResults() {
    const processedMemories = AppState.memory.queue.filter(m => m.processed && !m.failed && m.result);
    if (processedMemories.length === 0) { ErrorHandler.showUserError('暂无已处理的结果'); return; }

    const existingModal = document.getElementById('ttw-processed-results-modal');
    if (existingModal) existingModal.remove();

    let listHtml = '';
    processedMemories.forEach((memory) => {
        const realIndex = AppState.memory.queue.indexOf(memory);
        const entryCount = memory.result ? Object.keys(memory.result).reduce((sum, cat) => sum + (typeof memory.result[cat] === 'object' ? Object.keys(memory.result[cat]).length : 0), 0) : 0;
        listHtml += `
<div class="ttw-processed-item" data-index="${realIndex}" style="padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:4px;cursor:pointer;border-left:2px solid #27ae60;">
<div style="font-size:11px;font-weight:bold;color:#27ae60;">✅ 第${realIndex + 1}章</div>
<div style="font-size:9px;color:#888;">${entryCount}条 | ${(memory.content.length / 1000).toFixed(1)}k字</div>
</div>
`;
    });

    const bodyHtml = `
<div class="ttw-processed-results-container" style="display:flex;gap:10px;height:450px;">
<div class="ttw-processed-results-left" style="width:100px;min-width:100px;max-width:100px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:8px;">${listHtml}</div>
<div id="ttw-result-detail" style="flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:15px;">
<div style="text-align:center;color:#888;padding:40px;font-size:12px;">👈 点击左侧章节查看结果</div>
</div>
</div>
`;

    const footerHtml = `<button class="ttw-btn" id="ttw-close-processed-results">关闭</button>`;

    const resultsModal = ModalFactory.create({
        id: 'ttw-processed-results-modal',
        title: `📊 已处理结果 (${processedMemories.length}/${AppState.memory.queue.length})`,
        body: bodyHtml,
        footer: footerHtml,
        maxWidth: '900px'
    });

    resultsModal.querySelector('#ttw-close-processed-results').addEventListener('click', () => ModalFactory.close(resultsModal));

    resultsModal.querySelectorAll('.ttw-processed-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            const memory = AppState.memory.queue[index];
            const detailDiv = resultsModal.querySelector('#ttw-result-detail');
            resultsModal.querySelectorAll('.ttw-processed-item').forEach(i => i.style.background = 'rgba(0,0,0,0.2)');
            item.style.background = 'rgba(0,0,0,0.4)';
            if (memory && memory.result) {
                detailDiv.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
<h4 style="color:#27ae60;margin:0;font-size:14px;">第${index + 1}章 - ${memory.title}</h4>
<button class="ttw-btn ttw-btn-small" id="ttw-copy-result">📋 复制</button>
</div>
<pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;">${JSON.stringify(memory.result, null, 2)}</pre>
`;
                detailDiv.querySelector('#ttw-copy-result').addEventListener('click', () => {
                    navigator.clipboard.writeText(JSON.stringify(memory.result, null, 2)).then(() => {
                        const btn = detailDiv.querySelector('#ttw-copy-result');
                        btn.textContent = '✅ 已复制';
                        setTimeout(() => { btn.textContent = '📋 复制'; }, 1500);
                    });
                });
            }
        });
    });
}

    // ========== UI ==========
    let modalContainer = null;

    /**
     * handleUseTavernApiChange
     * 
     * @returns {*}
     */
    function handleUseTavernApiChange() {
        const useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        const customApiSection = document.getElementById('ttw-custom-api-section');
        if (customApiSection) {
            customApiSection.style.display = useTavernApi ? 'none' : 'block';
        }
        AppState.settings.useTavernApi = useTavernApi;
        // 显示/隐藏消息链酒馆API警告
        const chainWarning = document.getElementById('ttw-chain-tavern-warning');
        if (chainWarning) {
            const chain = AppState.settings.promptMessageChain || [];
            const hasNonUserRole = chain.some(m => m.enabled !== false && m.role !== 'user');
            chainWarning.style.display = (useTavernApi && hasNonUserRole) ? 'block' : 'none';
        }
    }

/**
 * handleProviderChange
 * 
 * @returns {*}
 */
function handleProviderChange() {
  const provider = document.getElementById('ttw-api-provider')?.value || 'openai-compatible';
  const endpointContainer = document.getElementById('ttw-endpoint-container');
  const modelActionsContainer = document.getElementById('ttw-model-actions');
  const modelSelectContainer = document.getElementById('ttw-model-select-container');
  const modelInputContainer = document.getElementById('ttw-model-input-container');

  if (provider === 'openai-compatible' || provider === 'gemini' || provider === 'anthropic') {
    if (endpointContainer) endpointContainer.style.display = 'block';
  } else {
    if (endpointContainer) endpointContainer.style.display = 'none';
  }

        if (provider === 'openai-compatible') {
            if (modelActionsContainer) modelActionsContainer.style.display = 'flex';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } else {
            if (modelActionsContainer) modelActionsContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
            if (modelInputContainer) modelInputContainer.style.display = 'block';
        }

        updateModelStatus('', '');
    }

    /**
     * updateModelStatus
     * 
     * @param {*} text
     * @param {*} type
     * @returns {*}
     */
    function updateModelStatus(text, type) {
        const statusEl = document.getElementById('ttw-model-status');
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = 'ttw-model-status';
        if (type) {
            statusEl.classList.add(type);
        }
    }

    /**
     * handleFetchModels
     * 
     * @returns {Promise<any>}
     */
    async function handleFetchModels() {
        const fetchBtn = document.getElementById('ttw-fetch-models');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        saveCurrentSettings();

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '⏳ 拉取中...';
        }
        updateModelStatus('正在拉取模型列表...', 'loading');

        try {
            const models = await handleFetchModelList();

            if (models.length === 0) {
                updateModelStatus('❌ 未拉取到模型', 'error');
                if (modelInputContainer) modelInputContainer.style.display = 'block';
                if (modelSelectContainer) modelSelectContainer.style.display = 'none';
                return;
            }

            if (modelSelect) {
                modelSelect.innerHTML = '<option value="">-- 请选择模型 --</option>';
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
            }

            if (modelInputContainer) modelInputContainer.style.display = 'none';
            if (modelSelectContainer) modelSelectContainer.style.display = 'block';

            const currentModel = document.getElementById('ttw-api-model')?.value;
            if (models.includes(currentModel)) {
                if (modelSelect) modelSelect.value = currentModel;
            } else if (models.length > 0) {
                if (modelSelect) modelSelect.value = models[0];
                const modelInput = document.getElementById('ttw-api-model');
                if (modelInput) modelInput.value = models[0];
                saveCurrentSettings();
            }

            updateModelStatus(`✅ 找到 ${models.length} 个模型`, 'success');

        } catch (error) {
            Logger.error('API', '拉取模型列表失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
            if (modelInputContainer) modelInputContainer.style.display = 'block';
            if (modelSelectContainer) modelSelectContainer.style.display = 'none';
        } finally {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = '🔄 拉取模型';
            }
        }
    }

    /**
     * handleQuickTest
     * 
     * @returns {Promise<any>}
     */
    async function handleQuickTest() {
        const testBtn = document.getElementById('ttw-quick-test');

        saveCurrentSettings();

        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ 测试中...';
        }
        updateModelStatus('正在测试连接...', 'loading');

        try {
            const result = await handleQuickTestModel();
            updateModelStatus(`✅ 测试成功 (${result.elapsed}ms)`, 'success');
            if (result.response) {
                Logger.info('API', '快速测试响应: ' + result.response?.substring(0, 100));
            }
        } catch (error) {
            Logger.error('API', '快速测试失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = '⚡ 快速测试';
            }
        }
}

// ============================================================
// 第八区：初始化与导出
// ============================================================
// - 初始化函数
// - 设置加载
// - 导出接口
// - 模态框创建
// - HTML模板构建函数

// ========== createModal 辅助函数：HTML模板构建 ==========
// 模态框HTML构建已迁移至 ui/settingsPanel.js

/**
 * createModal
 * 
 * @returns {*}
 */
async function _createModal() {
	if (modalContainer) modalContainer.remove();

	modalContainer = document.createElement('div');
	modalContainer.id = 'txt-to-worldbook-modal';
	modalContainer.className = 'ttw-modal-container';
	modalContainer.innerHTML = buildModalHtml();

	document.body.appendChild(modalContainer);
		_initializeModalState();
		_restoreModalData();
	restoreExistingState().catch(e => Logger.error('State', '恢复状态失败:', e));
	}

function _initializeModalState() {
	addModalStyles();
	_bindModalEvents();
	loadSavedSettings();
	loadCategoryLightSettings();
}

function _restoreModalData() {
	loadCustomCategories().then(() => {
		renderCategoriesList();
		renderDefaultWorldbookEntriesUI();
	});
	_checkAndRestoreState();
}

/**
 * restoreExistingState
 * 
 * @returns {Promise<any>}
 */
async function _restoreExistingState() {
	if (AppState.memory.queue.length > 0) {
		document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = AppState.file.current ? AppState.file.current.name : '已加载的文件';
            const totalChars = AppState.memory.queue.reduce((sum, m) => sum + m.content.length, 0);
            document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${AppState.memory.queue.length}章)`;
            // 【新增】恢复小说名输入框
            if (AppState.file.novelName) {
                const novelNameRow = document.getElementById('ttw-novel-name-row');
                if (novelNameRow) novelNameRow.style.display = 'flex';
                const novelNameInput = document.getElementById('ttw-novel-name-input');
                if (novelNameInput) novelNameInput.value = AppState.file.novelName;
            }

            // 【修复】确保每个已处理的memory都有result
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                const memory = AppState.memory.queue[i];
                if (memory.processed && !memory.failed && !memory.result) {
                    try {
                        const rollResults = await MemoryHistoryDB.getRollResults(i);
                        if (rollResults.length > 0) {
                            const latestRoll = rollResults[rollResults.length - 1];
                            memory.result = latestRoll.result;
                            Logger.info('Restore', `✅ 恢复第${i + 1}章的result`);
                        }
                    } catch (e) {
                        Logger.error('Restore', `恢复第${i + 1}章result失败:`, e);
                    }
                }
            }

            showQueueSection(true);
            updateMemoryQueueUI();

            document.getElementById('ttw-start-btn').disabled = false;
            updateStartButtonState(false);

            if (AppState.processing.volumeMode) updateVolumeIndicator();

            // 【修复】如果世界书为空但有已处理的记忆，重建世界书
            if (Object.keys(AppState.worldbook.generated).length === 0) {
                const hasProcessedWithResult = AppState.memory.queue.some(m => m.processed && !m.failed && m.result);
                if (hasProcessedWithResult) {
                    rebuildWorldbookFromMemories();
                }
            }

            if (Object.keys(AppState.worldbook.generated).length > 0) {
                showResultSection(true);
                worldbookView.updateWorldbookPreview();
            }
        }
    }

async function restoreExistingState() {
	return _restoreExistingState();
}


    /**
     * addModalStyles
     * 
     * @returns {*}
     */
    function addModalStyles() {
        if (document.getElementById('ttw-styles')) return;
        const styles = document.createElement('style');
        styles.id = 'ttw-styles';
        styles.textContent = `
            .ttw-modal-container{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;}
            .ttw-modal{background:var(--SmartThemeBlurTintColor,#1e1e2e);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;width:100%;max-width:750px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:hidden;}
            .ttw-modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);background:rgba(0,0,0,0.2);}
            .ttw-modal-title{font-weight:bold;font-size:15px;color:#e67e22;}
            .ttw-header-actions{display:flex;align-items:center;gap:12px;}
            .ttw-help-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(231,76,60,0.2);color:#e74c3c;font-size:14px;cursor:pointer;transition:all 0.2s;border:1px solid rgba(231,76,60,0.4);}
            .ttw-help-btn:hover{background:rgba(231,76,60,0.4);transform:scale(1.1);}
            .ttw-modal-close{background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;width:36px;height:36px;border-radius:6px;cursor:pointer;transition:all 0.2s;}
            .ttw-modal-close:hover{background:rgba(255,100,100,0.3);color:#ff6b6b;}
            .ttw-modal-body{flex:1;overflow-y:auto;padding:16px;}
            .ttw-modal-footer{padding:16px 20px;border-top:1px solid var(--SmartThemeBorderColor,#444);background:rgba(0,0,0,0.2);display:flex;justify-content:flex-end;gap:10px;}
            .ttw-section{background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:12px;overflow:hidden;}
            .ttw-section-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(0,0,0,0.3);cursor:pointer;font-weight:bold;font-size:14px;}
            .ttw-section-content{padding:16px;}
            .ttw-collapse-icon{font-size:10px;transition:transform 0.2s;}
            .ttw-section.collapsed .ttw-collapse-icon{transform:rotate(-90deg);}
            .ttw-section.collapsed .ttw-section-content{display:none;}
            .ttw-input,.ttw-select,.ttw-textarea,.ttw-textarea-small,.ttw-input-small{background:rgba(0,0,0,0.3);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;color:#fff;font-size:13px;box-sizing:border-box;}
            .ttw-input{width:100%;padding:10px 12px;}
            .ttw-input-small{width:60px;padding:6px 8px;text-align:center;}
            .ttw-select{width:100%;padding:8px 10px;}
            .ttw-textarea{width:100%;min-height:250px;padding:12px;line-height:1.6;resize:vertical;font-family:inherit;}
            .ttw-textarea-small{width:100%;min-height:80px;padding:10px;font-family:monospace;font-size:12px;line-height:1.5;resize:vertical;}
            .ttw-input:focus,.ttw-select:focus,.ttw-textarea:focus,.ttw-textarea-small:focus{outline:none;border-color:#e67e22;}
            .ttw-label{display:block;margin-bottom:6px;font-size:12px;opacity:0.9;}
            .ttw-setting-hint{font-size:11px;color:#888;margin-top:4px;}
            .ttw-setting-card{margin-bottom:16px;padding:12px;border-radius:8px;}
            .ttw-setting-card-green{background:rgba(39,174,96,0.1);border:1px solid rgba(39,174,96,0.3);}
            .ttw-setting-card-blue{background:rgba(52,152,219,0.15);border:1px solid rgba(52,152,219,0.3);}
            .ttw-checkbox-label{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;}
            .ttw-checkbox-label input[type="checkbox"]{width:18px;height:18px;accent-color:#e67e22;flex-shrink:0;}
            .ttw-checkbox-with-hint{padding:8px 12px;background:rgba(0,0,0,0.15);border-radius:6px;}
            .ttw-checkbox-purple{background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);}
            .ttw-volume-indicator{display:none;margin-top:12px;padding:8px 12px;background:rgba(155,89,182,0.2);border-radius:6px;font-size:12px;color:#bb86fc;}
            .ttw-prompt-config{margin-top:16px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;}
            .ttw-prompt-config-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(230,126,34,0.15);border-bottom:1px solid var(--SmartThemeBorderColor,#444);font-weight:500;flex-wrap:wrap;gap:8px;}
            .ttw-prompt-section{border-bottom:1px solid var(--SmartThemeBorderColor,#333);}
            .ttw-prompt-section:last-child{border-bottom:none;}
            .ttw-prompt-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;font-size:13px;transition:background 0.2s;}
            .ttw-prompt-header:hover{filter:brightness(1.1);}
            .ttw-prompt-header-blue{background:rgba(52,152,219,0.1);}
            .ttw-prompt-header-purple{background:rgba(155,89,182,0.1);}
            .ttw-prompt-header-green{background:rgba(46,204,113,0.1);}
            .ttw-prompt-content{display:none;padding:12px 14px;background:rgba(0,0,0,0.15);}
            .ttw-badge{font-size:10px;padding:2px 6px;border-radius:10px;font-weight:500;}
            .ttw-badge-blue{background:rgba(52,152,219,0.3);color:#5dade2;}
            .ttw-badge-gray{background:rgba(149,165,166,0.3);color:#bdc3c7;}
            .ttw-upload-area{border:2px dashed var(--SmartThemeBorderColor,#555);border-radius:8px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;}
            .ttw-upload-area:hover{border-color:#e67e22;background:rgba(230,126,34,0.1);}
            .ttw-file-info{display:none;align-items:center;gap:12px;padding:12px;background:rgba(0,0,0,0.3);border-radius:6px;margin-top:12px;}
            .ttw-memory-queue{max-height:200px;overflow-y:auto;}
            .ttw-memory-item{padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:6px;font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background 0.2s;}
            .ttw-memory-item:hover{background:rgba(0,0,0,0.4);}
            .ttw-memory-item.multi-select-mode{cursor:default;}
            .ttw-memory-item.selected-for-delete{background:rgba(231,76,60,0.3);border:1px solid rgba(231,76,60,0.5);}
            .ttw-progress-bar{width:100%;height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;margin-bottom:12px;}
            .ttw-progress-fill{height:100%;background:linear-gradient(90deg,#e67e22,#f39c12);border-radius:4px;transition:width 0.3s;width:0%;}
            .ttw-progress-text{font-size:13px;text-align:center;margin-bottom:12px;}
            .ttw-progress-controls{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
            .ttw-stream-container{display:none;margin-top:12px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;overflow:hidden;}
            .ttw-stream-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.3);font-size:12px;}
            .ttw-stream-content{max-height:200px;overflow-y:auto;padding:12px;background:rgba(0,0,0,0.2);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:0;font-family:monospace;}
            .ttw-result-preview{max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:6px;padding:12px;margin-bottom:12px;font-size:12px;}
            .ttw-result-actions{display:flex;flex-wrap:wrap;gap:10px;}
            .ttw-btn{padding:10px 16px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;font-size:13px;cursor:pointer;transition:all 0.2s;}
            .ttw-btn:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn:disabled{opacity:0.5;cursor:not-allowed;}
            .ttw-btn-primary{background:linear-gradient(135deg,#e67e22,#d35400);border-color:#e67e22;}
            .ttw-btn-primary:hover{background:linear-gradient(135deg,#f39c12,#e67e22);}
            .ttw-btn-secondary{background:rgba(108,117,125,0.5);}
            .ttw-btn-warning{background:rgba(255,107,53,0.5);border-color:#ff6b35;}
            .ttw-btn-small{padding:6px 12px;font-size:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;transition:all 0.2s;}
            .ttw-btn-small:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn-tiny{padding:3px 6px;font-size:11px;border:none;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;border-radius:3px;}
            .ttw-btn-tiny:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn-tiny:disabled{opacity:0.3;cursor:not-allowed;}
            .ttw-categories-list{max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;}
            .ttw-category-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:4px;}
            .ttw-category-item input[type="checkbox"]{width:16px;height:16px;accent-color:#9b59b6;}
            .ttw-category-name{flex:1;font-size:12px;}
            .ttw-category-actions{display:flex;gap:4px;}
            .ttw-default-entries-list{max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;}
            .ttw-default-entry-item{padding:8px 10px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:6px;border-left:3px solid #27ae60;}
            .ttw-default-entry-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
            .ttw-default-entry-title{font-size:12px;font-weight:bold;color:#27ae60;}
            .ttw-default-entry-actions{display:flex;gap:4px;}
            .ttw-default-entry-info{font-size:11px;color:#888;}
            .ttw-form-group{margin-bottom:12px;}
            .ttw-form-group>label{display:block;margin-bottom:6px;font-size:12px;color:#ccc;}
            .ttw-merge-option{display:flex;align-items:center;gap:8px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;cursor:pointer;}
            .ttw-merge-option input{width:18px;height:18px;}
            .ttw-roll-history-container{display:flex;gap:10px;height:400px;}
            .ttw-roll-history-left{width:100px;min-width:100px;max-width:100px;display:flex;flex-direction:column;gap:8px;overflow:hidden;}
            .ttw-roll-history-right{flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;}
            .ttw-roll-reroll-btn{width:100%;padding:8px 4px !important;font-size:11px !important;}
            .ttw-roll-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
            .ttw-roll-item{padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;cursor:pointer;border-left:2px solid #9b59b6;transition:all 0.2s;}
            .ttw-roll-item:hover,.ttw-roll-item.active{background:rgba(0,0,0,0.4);}
            .ttw-roll-item.selected{border-left-color:#27ae60;background:rgba(39,174,96,0.15);}
            .ttw-entry-merged-highlight{box-shadow:0 0 0 2px rgba(241,196,15,0.7);animation:ttwMergePulse 1.2s ease-in-out infinite;}
            @keyframes ttwMergePulse{
                0%{box-shadow:0 0 0 2px rgba(241,196,15,0.7);}
                50%{box-shadow:0 0 0 4px rgba(241,196,15,0.3);}
                100%{box-shadow:0 0 0 2px rgba(241,196,15,0.7);}
            }
            .ttw-roll-item-header{display:flex;justify-content:space-between;align-items:center;gap:4px;}
            .ttw-roll-item-title{font-size:11px;font-weight:bold;color:#e67e22;white-space:nowrap;}
            .ttw-roll-item-time{font-size:9px;color:#888;white-space:nowrap;}
            .ttw-roll-item-info{font-size:9px;color:#aaa;margin-top:2px;}
            .ttw-roll-detail-header{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #444;}
            .ttw-roll-detail-header h4{color:#e67e22;margin:0 0 6px 0;font-size:14px;}
            .ttw-roll-detail-time{font-size:11px;color:#888;margin-bottom:8px;}
            .ttw-roll-detail-content{white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;max-height:280px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;}
            .ttw-light-toggle{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;transition:all 0.2s;border:none;margin-left:8px;}
            .ttw-light-toggle.blue{background:rgba(52,152,219,0.3);color:#3498db;}
            .ttw-light-toggle.blue:hover{background:rgba(52,152,219,0.5);}
            .ttw-light-toggle.green{background:rgba(39,174,96,0.3);color:#27ae60;}
            .ttw-light-toggle.green:hover{background:rgba(39,174,96,0.5);}
            .ttw-config-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.2s;border:none;margin-left:4px;background:rgba(155,89,182,0.3);color:#9b59b6;}
            .ttw-config-btn:hover{background:rgba(155,89,182,0.5);}
            .ttw-history-container{display:flex;gap:10px;height:400px;}
            .ttw-history-left{width:100px;min-width:100px;max-width:100px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
            .ttw-history-right{flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;}
            .ttw-history-item{padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;cursor:pointer;border-left:2px solid #9b59b6;transition:all 0.2s;}
            .ttw-history-item:hover,.ttw-history-item.active{background:rgba(0,0,0,0.4);}
            .ttw-history-item-title{font-size:10px;font-weight:bold;color:#e67e22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .ttw-history-item-time{font-size:9px;color:#888;}
            .ttw-history-item-info{font-size:9px;color:#aaa;}
            .ttw-model-actions{display:flex;gap:10px;align-items:center;margin-top:12px;padding:10px;background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.3);border-radius:6px;flex-wrap:nowrap;}
            .ttw-model-actions>button{flex:0 0 auto;white-space:nowrap;}
            .ttw-model-status{font-size:12px;flex:1 1 auto;min-width:0;width:100%;white-space:pre-wrap;word-wrap:break-word;word-break:break-all;line-height:1.5;}
            .ttw-model-status.success{color:#27ae60;}
            .ttw-model-status.error{color:#e74c3c;}
            .ttw-model-status.loading{color:#f39c12;}
            .ttw-setting-item{margin-bottom:12px;}
            .ttw-setting-item>label{display:block;margin-bottom:6px;font-size:12px;opacity:0.9;}
            .ttw-setting-item input,.ttw-setting-item select{width:100%;padding:10px 12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:13px;box-sizing:border-box;}
            .ttw-setting-item select option{background:#2a2a2a;}
            .ttw-placeholder-hint code{user-select:all;}
            .ttw-consolidate-category-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(0,0,0,0.15);border-radius:6px;margin-bottom:6px;cursor:pointer;}
            .ttw-consolidate-category-item input{width:18px;height:18px;accent-color:#3498db;}
            @media (max-width: 768px) {
                .ttw-roll-history-container,.ttw-history-container{flex-direction:column;height:auto;}
                .ttw-roll-history-left,.ttw-history-left{width:100%;max-width:100%;flex-direction:row;flex-wrap:wrap;height:auto;max-height:120px;}
                .ttw-roll-reroll-btn{width:auto;flex-shrink:0;}
                .ttw-roll-list{flex-direction:row;flex-wrap:wrap;gap:4px;}
                .ttw-roll-item,.ttw-history-item{flex:0 0 auto;padding:4px 8px;}
                .ttw-roll-history-right,.ttw-history-right{min-height:250px;}
                .ttw-processed-results-container{flex-direction:column !important;height:auto !important;}
                .ttw-processed-results-left{width:100% !important;max-width:100% !important;max-height:150px !important;flex-direction:row !important;flex-wrap:wrap !important;}
            }
        `;
        document.head.appendChild(styles);
    }

/**
 * 绑定模态框事件 - 主入口
 * 将事件绑定拆分为多个子函数以提高可读性
 */
function _bindModalEvents() {
	bindModalBasicEventsUI({
		modalContainer,
		closeModal,
		showHelpModal,
		handleEscKey,
	});

	bindSettingEventsUI({
		EventDelegate,
		modalContainer,
		AppState,
		saveCurrentSettings,
		handleUseTavernApiChange,
		handleProviderChange,
		handleFetchModels,
		handleQuickTest,
		rechunkMemories,
		showAddCategoryModal,
		confirmAction,
		resetToDefaultCategories,
		renderCategoriesList,
		showAddDefaultEntryModal,
		saveDefaultWorldbookEntriesUI,
		applyDefaultWorldbookEntries,
		showResultSection,
		updateWorldbookPreview,
		ErrorHandler,
		testChapterRegex,
	});

	bindCollapsePanelEventsUI();

	bindPromptEventsUI({
		saveCurrentSettings,
	});

	bindMessageChainEventsUI({
		AppState,
		renderMessageChainUI,
		saveCurrentSettings,
		confirmAction,
	});

	bindFileEventsUI({
		AppState,
		handleFileSelect,
		handleClearFile,
	});

	bindActionEventsUI({
		AppState,
		handleStartConversion,
		handleStopProcessing,
		handleRepairFailedMemories,
		showStartFromSelector,
		showProcessedResults,
		toggleMultiSelectMode,
		deleteSelectedMemories,
		updateMemoryQueueUI,
		showSearchModal,
		showReplaceModal,
		showWorldbookView: worldbookView.showWorldbookView,
		showHistoryView,
		showConsolidateCategorySelector,
		showCleanTagsModal,
		showAliasMergeUI,
	});

	bindStreamEventsUI({
		updateStreamContent,
	});

	bindExportEventsUI({
		AppState,
		showPromptPreview,
		showPlotOutlineConfigModal,
		importAndMergeWorldbook,
		loadTaskState,
		saveTaskState,
		exportSettings,
		importSettings,
		exportCharacterCard,
		exportVolumes,
		exportToSillyTavern,
		showMemoryContentModal,
	});
}

    /**
     * toggleMultiSelectMode
     * 
     * @returns {*}
     */
    function toggleMultiSelectMode() {
        AppState.ui.isMultiSelectMode = !AppState.ui.isMultiSelectMode;
        AppState.ui.selectedIndices.clear();

        const multiSelectBar = document.getElementById('ttw-multi-select-bar');
        if (multiSelectBar) {
            multiSelectBar.style.display = AppState.ui.isMultiSelectMode ? 'block' : 'none';
        }

        updateMemoryQueueUI();
    }

    /**
     * handleEscKey
     * 
     * @param {*} e
     * @returns {*}
     */
    function handleEscKey(e) {
        if (e.key === 'Escape') {
            // 误触保护：ESC只关闭子模态框（世界书预览、历史记录等），不关闭主UI
            const subModals = document.querySelectorAll('.ttw-modal-container:not(#txt-to-worldbook-modal)');
            if (subModals.length > 0) {
                e.stopPropagation(); e.preventDefault();
                subModals[subModals.length - 1].remove(); // 关闭最顶层的子模态框
            }
            // 主模态框不响应ESC，只能通过右上角关闭按钮退出
        }
    }

    /**
 * 保存当前设置到LocalStorage
 */
function saveCurrentSettings() {
        AppState.settings.chunkSize = parseInt(document.getElementById('ttw-chunk-size')?.value) || 15000;
        AppState.settings.apiTimeout = (parseInt(document.getElementById('ttw-api-timeout')?.value) || 120) * 1000;
        AppState.processing.incrementalMode = document.getElementById('ttw-incremental-mode')?.checked ?? true;
        AppState.processing.volumeMode = document.getElementById('ttw-volume-mode')?.checked ?? false;
        AppState.settings.useVolumeMode = AppState.processing.volumeMode;
        AppState.settings.enablePlotOutline = document.getElementById('ttw-enable-plot')?.checked ?? false;
        AppState.settings.enableLiteraryStyle = document.getElementById('ttw-enable-style')?.checked ?? false;
        AppState.settings.customWorldbookPrompt = document.getElementById('ttw-worldbook-prompt')?.value || '';
        AppState.settings.customPlotPrompt = document.getElementById('ttw-plot-prompt')?.value || '';
        AppState.settings.customStylePrompt = document.getElementById('ttw-style-prompt')?.value || '';
        AppState.settings.useTavernApi = document.getElementById('ttw-use-tavern-api')?.checked ?? true;
        AppState.settings.parallelEnabled = AppState.config.parallel.enabled;
        AppState.settings.parallelConcurrency = AppState.config.parallel.concurrency;
        AppState.settings.parallelMode = AppState.config.parallel.mode;
        AppState.settings.categoryLightSettings = { ...AppState.config.categoryLight };
        AppState.settings.forceChapterMarker = document.getElementById('ttw-force-chapter-marker')?.checked ?? true;
        AppState.settings.chapterRegexPattern = document.getElementById('ttw-chapter-regex')?.value || AppState.config.chapterRegex.pattern;
        AppState.settings.defaultWorldbookEntriesUI = AppState.persistent.defaultEntries;
        AppState.settings.categoryDefaultConfig = AppState.config.categoryDefault;
        AppState.settings.entryPositionConfig = AppState.config.entryPosition;

        AppState.settings.customSuffixPrompt = document.getElementById('ttw-suffix-prompt')?.value || '';

        // 消息链配置已通过renderMessageChainUI内的事件实时保存到AppState.settings.promptMessageChain

        AppState.settings.customApiProvider = document.getElementById('ttw-api-provider')?.value || 'openai-compatible';
        AppState.settings.customApiKey = document.getElementById('ttw-api-key')?.value || '';
        AppState.settings.customApiEndpoint = document.getElementById('ttw-api-endpoint')?.value || '';

        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelInput = document.getElementById('ttw-api-model');
        if (modelSelectContainer && modelSelectContainer.style.display !== 'none' && modelSelect?.value) {
            AppState.settings.customApiModel = modelSelect.value;
            if (modelInput) modelInput.value = modelSelect.value;
        } else {
            AppState.settings.customApiModel = modelInput?.value || 'gemini-2.5-flash';
        }

        try { localStorage.setItem('txtToWorldbookSettings', JSON.stringify(AppState.settings)); } catch (e) { }
        AppState.settings.allowRecursion = document.getElementById('ttw-allow-recursion')?.checked ?? false;

        AppState.settings.filterResponseTags = document.getElementById('ttw-filter-tags')?.value || 'thinking,/think';

        AppState.settings.debugMode = document.getElementById('ttw-debug-mode')?.checked ?? false;

        AppState.settings.plotOutlineExportConfig = AppState.config.plotOutline;

    }


    /**
     * loadSavedSettings
     * 
     * @returns {*}
     */
    function loadSavedSettings() {
        try {
            const saved = localStorage.getItem('txtToWorldbookSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                AppState.settings = { ...defaultSettings, ...parsed };
                AppState.processing.volumeMode = AppState.settings.useVolumeMode || false;
                AppState.config.parallel.enabled = AppState.settings.parallelEnabled !== undefined ? AppState.settings.parallelEnabled : true;
                AppState.config.parallel.concurrency = AppState.settings.parallelConcurrency || 3;
                AppState.config.parallel.mode = AppState.settings.parallelMode || 'independent';
                if (AppState.settings.chapterRegexPattern) {
                    AppState.config.chapterRegex.pattern = AppState.settings.chapterRegexPattern;
                }
                if (AppState.settings.defaultWorldbookEntriesUI) {
                    AppState.persistent.defaultEntries = AppState.settings.defaultWorldbookEntriesUI;
                }
                if (AppState.settings.categoryDefaultConfig) {
                    AppState.config.categoryDefault = AppState.settings.categoryDefaultConfig;
                }
                if (AppState.settings.entryPositionConfig) {
                    AppState.config.entryPosition = AppState.settings.entryPositionConfig;
                }
                if (AppState.settings.plotOutlineExportConfig) {
                    AppState.config.plotOutline = AppState.settings.plotOutlineExportConfig;
                }

            }
        } catch (e) { }

updateSettingsUI();
updateChapterRegexUI();
handleProviderChange();
}

    /**
     * showPromptPreview
     * 
     * @returns {*}
     */
    function showPromptPreview() {
        try {
            const prompt = _buildSystemPrompt() || '';
            const chapterForce = AppState.settings.forceChapterMarker ? getChapterForcePrompt(1) : '(已关闭)';
            const apiMode = AppState.settings.useTavernApi ? '酒馆API' : `自定义API (${AppState.settings.customApiProvider || '未设置'})`;
            const enabledCats = getEnabledCategories().map(c => c.name).join(', ');
            const chain = Array.isArray(AppState.settings.promptMessageChain) ? AppState.settings.promptMessageChain : [{ role: 'user', content: '{PROMPT}', enabled: true }];
            const enabledChain = chain.filter(m => m && m.enabled !== false);
            const chainInfo = enabledChain.map((m, i) => {
                const roleLabel = m.role === 'system' ? '🔷系统' : m.role === 'assistant' ? '🟡AI助手' : '🟢用户';
                const contentStr = typeof m.content === 'string' ? m.content : (m.content ? String(m.content) : '');
                const preview = contentStr.length > 60 ? contentStr.substring(0, 60) + '...' : contentStr;
                return `  ${i + 1}. [${roleLabel}] ${preview}`;
            }).join('\n');

            const isParallelEnabled = AppState.config && AppState.config.parallel && AppState.config.parallel.enabled;
            const parallelMode = (AppState.config && AppState.config.parallel && AppState.config.parallel.mode) || '关闭';

            const previewContent = `当前提示词预览:\n\nAPI模式: ${apiMode}\n并行模式: ${isParallelEnabled ? parallelMode : '关闭'}\n强制章节标记: ${AppState.settings.forceChapterMarker ? '开启' : '关闭'}\n启用分类: ${enabledCats}\n\n【消息链 (${enabledChain.length}条消息)】\n${chainInfo}\n\n【章节强制标记示例】\n${chapterForce}\n\n【系统提示词】\n${prompt}`;

            const bodyHtml = `<textarea readonly style="width: 100%; height: 400px; resize: vertical; box-sizing: border-box; background: rgba(0,0,0,0.3); color: #ccc; border: 1px solid #555; padding: 10px; font-family: monospace; border-radius: 4px; white-space: pre-wrap;">${previewContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>`;
            const footerHtml = `<button class="ttw-btn ttw-btn-primary" id="ttw-close-prompt-preview">关闭</button>`;

            const modal = ModalFactory.create({
                id: 'ttw-prompt-preview-modal',
                title: '🔍 提示词预览',
                body: bodyHtml,
                footer: footerHtml,
                maxWidth: '800px'
            });

            modal.querySelector('#ttw-close-prompt-preview').addEventListener('click', () => {
                ModalFactory.close(modal);
            });
        } catch (error) {
            console.error('Preview error:', error);
            if (typeof ErrorHandler !== 'undefined' && ErrorHandler.showUserError) {
                ErrorHandler.showUserError('预览失败: ' + error.message);
            } else {
                alertAction({ title: '预览失败', message: '预览失败: ' + error.message });
            }
        }
    }
/**
 * checkAndRestoreState
 * 
 * @returns {Promise<any>}
 */
async function _checkAndRestoreState() {
    try {
        const savedState = await MemoryHistoryDB.loadState();
        if (savedState && savedState.memoryQueue && savedState.memoryQueue.length > 0) {
            const processedCount = savedState.memoryQueue.filter(m => m.processed).length;
            if (await confirmAction(`检测到未完成任务\n已处理: ${processedCount}/${savedState.memoryQueue.length}\n\n是否恢复？`, { title: '恢复未完成任务' })) {
                AppState.memory.queue = savedState.memoryQueue;
                AppState.worldbook.generated = savedState.generatedWorldbook || {};
                AppState.worldbook.volumes = savedState.worldbookVolumes || [];
                AppState.worldbook.currentVolumeIndex = savedState.currentVolumeIndex || 0;
                AppState.file.hash = savedState.fileHash;
                
                // 【新增】从DB恢复小说名称
                if (savedState.novelName) AppState.file.novelName = savedState.novelName;
                
                if (Object.keys(AppState.worldbook.generated).length === 0) {
                    rebuildWorldbookFromMemories();
                }

                AppState.memory.startIndex = AppState.memory.queue.findIndex(m => !m.processed || m.failed);
                if (AppState.memory.startIndex === -1) AppState.memory.startIndex = AppState.memory.queue.length;
                AppState.memory.userSelectedIndex = null;
                
                showQueueSection(true);
                updateMemoryQueueUI();
                if (AppState.processing.volumeMode) updateVolumeIndicator();
                if (AppState.memory.startIndex >= AppState.memory.queue.length || Object.keys(AppState.worldbook.generated).length > 0) {
                    showResultSection(true);
                    worldbookView.updateWorldbookPreview();
                }
                updateStartButtonState(false);
                updateSettingsUI();
                document.getElementById('ttw-start-btn').disabled = false;

                    document.getElementById('ttw-upload-area').style.display = 'none';
                    document.getElementById('ttw-file-info').style.display = 'flex';
                    document.getElementById('ttw-file-name').textContent = '已恢复的任务';
                    const totalChars = AppState.memory.queue.reduce((sum, m) => sum + m.content.length, 0);
                    document.getElementById('ttw-file-size').textContent = `(${(totalChars / 1024).toFixed(1)} KB, ${AppState.memory.queue.length}章)`;
                    // 【新增】恢复小说名输入框
                    const novelNameRow = document.getElementById('ttw-novel-name-row');
                    if (novelNameRow) novelNameRow.style.display = 'flex';
                    const novelNameInput = document.getElementById('ttw-novel-name-input');
                    if (novelNameInput && AppState.file.novelName) novelNameInput.value = AppState.file.novelName;
                } else {
                    await MemoryHistoryDB.clearState();
                }
            }
        } catch (e) {
            Logger.error('Restore', '恢复状态失败:', e);
        }
    }

/**
 * handleFileSelect
 * 
 * @param {*} file
 * @returns {Promise<any>}
 */
async function handleFileSelect(file) {
    if (!file.name.endsWith('.txt')) { ErrorHandler.showUserError('请选择TXT文件'); return; }
    try {
        const { encoding, content } = await detectBestEncoding(file);
        AppState.file.current = file;
        
        const newHash = await calculateFileHash(content);
        const savedHash = await MemoryHistoryDB.getSavedFileHash();
        if (savedHash && savedHash !== newHash) {
            const historyList = await MemoryHistoryDB.getAllHistory();
            if (historyList.length > 0 && await confirmAction(`检测到新文件，是否清空旧历史？\n当前有 ${historyList.length} 条记录。`, { title: '清空旧历史', danger: true })) {
                await MemoryHistoryDB.clearAllHistory();
                await MemoryHistoryDB.clearAllRolls();
                await MemoryHistoryDB.clearState();
            }
        }
        AppState.file.hash = newHash;
        
        await MemoryHistoryDB.saveFileHash(newHash);
        document.getElementById('ttw-upload-area').style.display = 'none';
        document.getElementById('ttw-file-info').style.display = 'flex';
        document.getElementById('ttw-file-name').textContent = file.name;
        document.getElementById('ttw-file-size').textContent = `(${(content.length / 1024).toFixed(1)} KB, ${encoding})`;
        // 【新增】自动提取文件名作为小说名
        AppState.file.novelName = file.name.replace(/\.[^/.]+$/, '');
        
        const novelNameInput = document.getElementById('ttw-novel-name-input');
        if (novelNameInput) novelNameInput.value = AppState.file.novelName;
        const novelNameRow = document.getElementById('ttw-novel-name-row');
        if (novelNameRow) novelNameRow.style.display = 'flex';
        splitContentIntoMemory(content);
        showQueueSection(true);
        updateMemoryQueueUI();
        document.getElementById('ttw-start-btn').disabled = false;
        AppState.memory.startIndex = 0;
        AppState.memory.userSelectedIndex = null;
        

        AppState.worldbook.generated = { 地图环境: {}, 剧情节点: {}, 角色: {}, 知识书: {} };
        applyDefaultWorldbookEntries();
            if (Object.keys(AppState.worldbook.generated).length > 0) {
                showResultSection(true);
                worldbookView.updateWorldbookPreview();
            }

            updateStartButtonState(false);
        } catch (error) {
            ErrorHandler.showUserError('文件处理失败: ' + error.message);
        }
    }

    /**
     * splitContentIntoMemory
     * 
     * @param {*} content
     * @returns {*}
     */
    function splitContentIntoMemory(content) {
        const chunkSize = AppState.settings.chunkSize;
        const minChunkSize = Math.max(chunkSize * 0.3, 5000);
        AppState.memory.queue = [];

        const chapterRegex = new RegExp(AppState.config.chapterRegex.pattern, 'g');
        const matches = [...content.matchAll(chapterRegex)];

        if (matches.length > 0) {
            const chapters = [];

            for (let i = 0; i < matches.length; i++) {
                const startIndex = matches[i].index;
                const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
                let chapterContent = content.slice(startIndex, endIndex);

                if (i === 0 && startIndex > 0) {
                    const preContent = content.slice(0, startIndex);
                    chapterContent = preContent + chapterContent;
                }

                chapters.push({ title: matches[i][0], content: chapterContent });
            }

            const mergedChapters = [];
            let pendingChapter = null;

            for (const chapter of chapters) {
                if (pendingChapter) {
                    if (pendingChapter.content.length + chapter.content.length <= chunkSize) {
                        pendingChapter.content += chapter.content;
                        pendingChapter.title += '+' + chapter.title;
                    } else {
                        if (pendingChapter.content.length >= minChunkSize) {
                            mergedChapters.push(pendingChapter);
                            pendingChapter = chapter;
                        } else {
                            pendingChapter.content += chapter.content;
                            pendingChapter.title += '+' + chapter.title;
                        }
                    }
                } else {
                    pendingChapter = { ...chapter };
                }
            }
            if (pendingChapter) {
                mergedChapters.push(pendingChapter);
            }

            let currentChunk = '';
            let chunkIndex = 1;

            for (let i = 0; i < mergedChapters.length; i++) {
                const chapter = mergedChapters[i];

                if (chapter.content.length > chunkSize) {
                    if (currentChunk.length > 0) {
                        AppState.memory.queue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                        currentChunk = '';
                        chunkIndex++;
                    }

                    let remaining = chapter.content;
                    while (remaining.length > 0) {
                        let endPos = Math.min(chunkSize, remaining.length);
                        if (endPos < remaining.length) {
                            const pb = remaining.lastIndexOf('\n\n', endPos);
                            if (pb > endPos * 0.5) endPos = pb + 2;
                            else {
                                const sb = remaining.lastIndexOf('。', endPos);
                                if (sb > endPos * 0.5) endPos = sb + 1;
                            }
                        }
                        AppState.memory.queue.push({ title: `记忆${chunkIndex}`, content: remaining.slice(0, endPos), processed: false, failed: false, processing: false });
                        remaining = remaining.slice(endPos);
                        chunkIndex++;
                    }
                    continue;
                }

                if (currentChunk.length + chapter.content.length > chunkSize && currentChunk.length > 0) {
                    AppState.memory.queue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                    currentChunk = '';
                    chunkIndex++;
                }
                currentChunk += chapter.content;
            }

            if (currentChunk.length > 0) {
                if (currentChunk.length < minChunkSize && AppState.memory.queue.length > 0) {
                    const lastMemory = AppState.memory.queue[AppState.memory.queue.length - 1];
                    if (lastMemory.content.length + currentChunk.length <= chunkSize * 1.2) {
                        lastMemory.content += currentChunk;
                    } else {
                        AppState.memory.queue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                    }
                } else {
                    AppState.memory.queue.push({ title: `记忆${chunkIndex}`, content: currentChunk, processed: false, failed: false, processing: false });
                }
            }
        } else {
            let i = 0, chunkIndex = 1;
            while (i < content.length) {
                let endIndex = Math.min(i + chunkSize, content.length);
                if (endIndex < content.length) {
                    const pb = content.lastIndexOf('\n\n', endIndex);
                    if (pb > i + chunkSize * 0.5) endIndex = pb + 2;
                    else {
                        const sb = content.lastIndexOf('。', endIndex);
                        if (sb > i + chunkSize * 0.5) endIndex = sb + 1;
                    }
                }
                AppState.memory.queue.push({ title: `记忆${chunkIndex}`, content: content.slice(i, endIndex), processed: false, failed: false, processing: false });
                i = endIndex;
                chunkIndex++;
            }
        }

        for (let i = AppState.memory.queue.length - 1; i > 0; i--) {
            if (AppState.memory.queue[i].content.length < minChunkSize) {
                const prevMemory = AppState.memory.queue[i - 1];
                if (prevMemory.content.length + AppState.memory.queue[i].content.length <= chunkSize * 1.2) {
                    prevMemory.content += AppState.memory.queue[i].content;
                    AppState.memory.queue.splice(i, 1);
                }
            }
        }

        AppState.memory.queue.forEach((memory, index) => { memory.title = `记忆${index + 1}`; });
    }

/**
 * clearFile
 * 
 * @returns {Promise<any>}
 */
async function handleClearFile() {
    AppState.file.current = null;
    AppState.file.novelName = '';
    AppState.memory.queue = [];
    AppState.worldbook.generated = {};
    AppState.worldbook.volumes = [];
    AppState.worldbook.currentVolumeIndex = 0;
    AppState.memory.startIndex = 0;
    AppState.memory.userSelectedIndex = null;
    AppState.file.hash = null;
    AppState.ui.isMultiSelectMode = false;
    AppState.ui.selectedIndices.clear();
    

    try {
        await MemoryHistoryDB.clearAllHistory();
            await MemoryHistoryDB.clearAllRolls();
            await MemoryHistoryDB.clearState();
            await MemoryHistoryDB.clearFileHash();
            Logger.info('History', '已清空所有历史记录');
        } catch (e) {
            Logger.error('History', '清空历史失败:', e);
        }

        document.getElementById('ttw-upload-area').style.display = 'block';
        document.getElementById('ttw-file-info').style.display = 'none';
        document.getElementById('ttw-file-input').value = '';
        // 【新增】清空小说名输入框
        const novelNameRow = document.getElementById('ttw-novel-name-row');
        if (novelNameRow) novelNameRow.style.display = 'none';
        const novelNameInput = document.getElementById('ttw-novel-name-input');
        if (novelNameInput) novelNameInput.value = '';
        document.getElementById('ttw-start-btn').disabled = true;
        document.getElementById('ttw-start-btn').textContent = '🚀 开始转换';
        showQueueSection(false);
        showProgressSection(false);
        showResultSection(false);
    }

/**
 * startConversion
 * 
 * @returns {Promise<any>}
 */
async function handleStartConversion() {
saveCurrentSettings();
if (AppState.memory.queue.length === 0) { ErrorHandler.showUserError('请先上传文件'); return; }

if (!AppState.settings.useTavernApi) {
const provider = AppState.settings.customApiProvider;
if ((provider === 'gemini' || provider === 'anthropic') && !AppState.settings.customApiKey) {
ErrorHandler.showUserError('请先设置 API Key');
return;
}
}

await handleStartProcessing();
}

    /**
     * showQueueSection
     * 
     * @param {*} show
     * @returns {*}
     */
    function showQueueSection(show) { document.getElementById('ttw-queue-section').style.display = show ? 'block' : 'none'; }
    /**
     * showProgressSection
     * 
     * @param {*} show
     * @returns {*}
     */
    function showProgressSection(show) { document.getElementById('ttw-progress-section').style.display = show ? 'block' : 'none'; }
    /**
     * showResultSection
     * 
     * @param {*} show
     * @returns {*}
     */
    function showResultSection(show) {
        document.getElementById('ttw-result-section').style.display = show ? 'block' : 'none';
        const volumeExportBtn = document.getElementById('ttw-export-volumes');
        if (volumeExportBtn) volumeExportBtn.style.display = (show && AppState.processing.volumeMode && AppState.worldbook.volumes.length > 0) ? 'inline-block' : 'none';
    }

    /**
     * updateProgress
     * 
     * @param {*} percent
     * @param {*} text
     * @returns {*}
     */
    function updateProgress(percent, text) {
        document.getElementById('ttw-progress-fill').style.width = `${percent}%`;
        document.getElementById('ttw-progress-text').textContent = text;
        const failedCount = AppState.memory.queue.filter(m => m.failed).length;
        const repairBtn = document.getElementById('ttw-repair-btn');
        if (failedCount > 0) { repairBtn.style.display = 'inline-block'; repairBtn.textContent = `🔧 修复失败 (${failedCount})`; }
        else { repairBtn.style.display = 'none'; }
    }

/**
 * 更新内存队列UI显示
 * @description 使用智能更新策略，只在内容变化时更新DOM
 */
function updateMemoryQueueUI() {
	const container = document.getElementById('ttw-memory-queue');
	if (!container) return;

	const multiSelectBar = document.getElementById('ttw-multi-select-bar');
	if (multiSelectBar) {
		multiSelectBar.style.display = AppState.ui.isMultiSelectMode ? 'block' : 'none';
	}

	const selectedCountEl = document.getElementById('ttw-selected-count');
	if (selectedCountEl) {
		selectedCountEl.textContent = `已选: ${AppState.ui.selectedIndices.size}`;
	}

	const itemsHtml = ListRenderer.renderItems(
		AppState.memory.queue,
		(memory, index) => ListRenderer.renderMemoryItem(memory, index, {
			multiSelect: AppState.ui.isMultiSelectMode,
			selected: AppState.ui.selectedIndices.has(index),
			useChapterLabel: true,
			useApproxK: true
		}),
		{ emptyMessage: '暂无章节数据' }
	);

	ListRenderer.updateContainer(container, itemsHtml);
}

const worldbookView = createWorldbookView({
    ListRenderer,
    naturalSortEntryNames,
    escapeHtmlForDisplay,
    escapeAttrForDisplay,
    EventDelegate,
    ModalFactory,
    getCategoryLightState,
    setCategoryLightState,
    getEntryConfig,
    getCategoryAutoIncrement,
    getCategoryBaseOrder,
    getEntryTotalTokens,
    getTokenThreshold: () => AppState.ui.tokenThreshold,
    setTokenThreshold: (value) => { AppState.ui.tokenThreshold = value; },
    getManualMergeHighlight: () => AppState.ui.manualMergeHighlight,
    setManualMergeHighlightState: (value) => { AppState.ui.manualMergeHighlight = value; },
    getSearchKeyword: () => AppState.ui.searchKeyword,
    showCategoryConfigModal,
    showEntryConfigModal,
    showRerollEntryModal,
    getWorldbookToShow: () => (AppState.processing.volumeMode ? getAllVolumesWorldbook() : AppState.worldbook.generated),
    getVolumeCount: () => AppState.worldbook.volumes.length,
    isVolumeMode: () => AppState.processing.volumeMode,
    showManualMergeUI,
    showBatchRerollModal,
});

async function showHistoryView() {
	const existingModal = document.getElementById('ttw-history-modal');
	if (existingModal) existingModal.remove();
	let historyList = [];
	try { await MemoryHistoryDB.cleanDuplicateHistory(); historyList = await MemoryHistoryDB.getAllHistory(); } catch (e) { }

	let listHtml = historyList.length === 0 ? '<div style="text-align:center;color:#888;padding:10px;font-size:11px;">暂无历史</div>' : '';
	if (historyList.length > 0) {
		const sortedList = [...historyList].sort((a, b) => b.timestamp - a.timestamp);
		sortedList.forEach((history) => {
			const time = new Date(history.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
			const changeCount = history.changedEntries?.length || 0;
			const shortTitle = (history.memoryTitle || `第${history.memoryIndex + 1}章`).substring(0, 8);
			listHtml += `
			<div class="ttw-history-item" data-history-id="${history.id}">
				<div class="ttw-history-item-title" title="${history.memoryTitle}">${shortTitle}</div>
				<div class="ttw-history-item-time">${time}</div>
				<div class="ttw-history-item-info">${changeCount}项</div>
			</div>
			`;
		});
	}

	const bodyHtml = `
		<div class="ttw-history-container">
			<div class="ttw-history-left">${listHtml}</div>
			<div id="ttw-history-detail" class="ttw-history-right">
				<div style="text-align:center;color:#888;padding:20px;font-size:12px;">👈 点击左侧查看详情</div>
			</div>
		</div>
	`;
	const footerHtml = `
		<button class="ttw-btn ttw-btn-warning" id="ttw-clear-history">🗑️ 清空历史</button>
		<button class="ttw-btn" id="ttw-close-history">关闭</button>
	`;

	const historyModal = ModalFactory.create({
		id: 'ttw-history-modal',
		title: `📜 修改历史 (${historyList.length}条)`,
		body: bodyHtml,
		footer: footerHtml,
		maxWidth: '900px'
	});

	historyModal.querySelector('#ttw-close-history').addEventListener('click', () => ModalFactory.close(historyModal));
	historyModal.querySelector('#ttw-clear-history').addEventListener('click', async () => {
		if (await confirmAction('确定清空所有历史记录？', { title: '清空历史记录', danger: true })) { await MemoryHistoryDB.clearAllHistory(); ModalFactory.close(historyModal); showHistoryView(); }
	});

	historyModal.querySelectorAll('.ttw-history-item').forEach(item => {
		item.addEventListener('click', async () => {
			const historyId = parseInt(item.dataset.historyId);
			const history = await MemoryHistoryDB.getHistoryById(historyId);
			const detailContainer = historyModal.querySelector('#ttw-history-detail');
			historyModal.querySelectorAll('.ttw-history-item').forEach(i => i.classList.remove('active'));
			item.classList.add('active');
			if (!history) { detailContainer.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:40px;">找不到记录</div>'; return; }
			const time = new Date(history.timestamp).toLocaleString('zh-CN');
			let html = `
			<div style="margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #444;">
				<h4 style="color:#e67e22;margin:0 0 10px;font-size:14px;">📝 ${history.memoryTitle}</h4>
				<div style="font-size:11px;color:#888;">时间: ${time}</div>
				<div style="margin-top:10px;"><button class="ttw-btn ttw-btn-small ttw-btn-warning" data-history-id="${historyId}" class="ttw-history-rollback-btn">⏪ 回退到此版本前</button></div>
			</div>
			<div style="font-size:13px;font-weight:bold;color:#9b59b6;margin-bottom:10px;">变更 (${history.changedEntries?.length || 0}项)</div>
			`;
			if (history.changedEntries && history.changedEntries.length > 0) {
				history.changedEntries.forEach(change => {
					const typeIcon = change.type === 'add' ? '➕' : change.type === 'modify' ? '✏️' : '❌';
					const typeColor = change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';
					html += `<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;margin-bottom:6px;border-left:3px solid ${typeColor};font-size:12px;">
						<span style="color:${typeColor};">${typeIcon}</span>
						<span style="color:#e67e22;margin-left:6px;">[${change.category}] ${change.entryName}</span>
					</div>`;
				});
			} else { html += '<div style="color:#888;text-align:center;padding:20px;font-size:12px;">无变更记录</div>'; }
			detailContainer.innerHTML = html;
		});
	});
}

    /**
     * rollbackToHistory
     * 
     * @param {*} historyId
     * @returns {Promise<any>}
     */
    async function rollbackToHistory(historyId) {
        if (!await confirmAction('确定回退到此版本？页面将刷新。', { title: '回退历史版本', danger: true })) return;
        try {
            const history = await MemoryHistoryDB.rollbackToHistory(historyId);
            for (let i = 0; i < AppState.memory.queue.length; i++) {
                if (i < history.memoryIndex) AppState.memory.queue[i].processed = true;
                else { AppState.memory.queue[i].processed = false; AppState.memory.queue[i].failed = false; }
            }
            await MemoryHistoryDB.saveState(history.memoryIndex);
            ErrorHandler.showUserSuccess('回退成功！页面将刷新。');
            location.reload();
        } catch (error) { ErrorHandler.showUserError('回退失败: ' + error.message); }
    }

    /**
     * closeModal
     * 
     * @returns {*}
     */
    function closeModal() {
        setProcessingStatus('stopped');
        if (AppState.globalSemaphore) AppState.globalSemaphore.abort();
        AppState.processing.activeTasks.clear();
        AppState.memory.queue.forEach(m => { if (m.processing) m.processing = false; });

        if (modalContainer) { modalContainer.remove(); modalContainer = null; }
        document.removeEventListener('keydown', handleEscKey, true);
    }

    /**
     * open
     * 
     * @returns {*}
     */
    function open() { _createModal(); }

    // ========== 过渡期兼容别名（热修） ==========
    const startAIProcessing = handleStartProcessing;
    const fetchModelList = handleFetchModelList;
    const quickTestModel = handleQuickTestModel;
    const startNewVolume = handleStartNewVolume;
    const repairSingleMemory = handleRepairSingleMemory;
    const repairMemoryWithSplit = handleRepairMemoryWithSplit;
    const verifyDuplicatesWithAI = handleVerifyDuplicates;
    const mergeConfirmedDuplicates = handleMergeDuplicates;

    // ========== 公开 API ==========
    window.TxtToWorldbook = createPublicApi({
        open,
        closeModal,
        rollbackToHistory,
        AppState,
        getAllVolumesWorldbook,
        saveTaskState,
        loadTaskState,
        exportSettings,
        importSettings,
        handleRerollMemory,
        handleRerollSingleEntry,
        findEntrySourceMemories,
        showRerollEntryModal,
        showBatchRerollModal,
        showRollHistorySelector,
        importAndMergeWorldbook,
        setCategoryLightState,
        rebuildWorldbookFromMemories,
        applyDefaultWorldbookEntries,
        callCustomAPI,
        callSillyTavernAPI,
        showConsolidateCategorySelector,
        showAliasMergeUI,
        showManualMergeUI,
        getEnabledCategories,
        rechunkMemories,
        showSearchModal,
        showReplaceModal,
        getEntryConfig,
        setEntryConfig,
        setCategoryDefaultConfig,
        MemoryHistoryDB,
    });

	Logger.info('Module', '📚 TxtToWorldbook 已加载');
	Logger.info('Module', '架构重构: AppState统一状态 | Logger日志系统 | EventDelegate事件委托 | ModalFactory模态框工厂');
	Logger.info('Module', '性能优化: TokenCache缓存 | PerfUtils防抖节流 | DOM批量更新');
	Logger.info('Module', '代码质量: ErrorHandler统一错误处理 | JSDoc完整文档 | 函数命名规范化');
})();



let __txtToWorldbookInitPromise = null;

export async function initTxtToWorldbookBridge() {
    if (!__txtToWorldbookInitPromise) {
        __txtToWorldbookInitPromise = Promise.resolve({
            loadedFrom: 'txtToWorldbook/main.js',
            api: getTxtToWorldbookApi(),
        });
    }
    return __txtToWorldbookInitPromise;
}

export function getTxtToWorldbookApi() {
    if (typeof window === 'undefined') return null;
    return window.TxtToWorldbook || null;
}

export default {
    initTxtToWorldbookBridge,
    getTxtToWorldbookApi,
};








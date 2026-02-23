/**
 * 并行处理器模块
 * @module core/ParallelProcessor
 * @description 使用信号量控制并发数，支持多种处理模式和自动重试机制
 * @author Novel-Auto-Generator Team
 * @version 3.0.0
 */

/**
 * 信号量类
 * @class Semaphore
 * @description 控制并发访问的数量，实现并发限制的核心机制
 * 
 * 工作原理：
 * 1. 维护一个当前活跃任务计数器 (current)
 * 2. 当 current < max 时，允许新任务立即执行
 * 3. 当 current >= max 时，新任务进入等待队列
 * 4. 任务完成时释放槽位，唤醒等待队列中的下一个任务
 * 
 * @example
 * const semaphore = new Semaphore(3); // 最多允许 3 个并发
 * await semaphore.acquire(); // 获取槽位
 * // ... 执行任务 ...
 * semaphore.release(); // 释放槽位
 */
class Semaphore {
    /**
     * 创建信号量实例
     * @param {number} max - 最大并发数
     */
    constructor(max) {
        /** @private @type {number} 最大并发数 */
        this.max = max;
        /** @private @type {number} 当前活跃任务数 */
        this.current = 0;
        /** @private @type {Array} 等待队列 */
        this.queue = [];
        /** @private @type {boolean} 是否已中止 */
        this.aborted = false;
    }

    /**
     * 获取执行槽位
     * @description 如果当前有可用槽位则立即返回，否则等待直到有槽位释放
     * @returns {Promise<void>} 当获取到槽位时解析
     * @throws {Error} 当信号量被中止时抛出 'SEMAPHORE_ABORTED' 错误
     */
    async acquire() {
        if (this.aborted) {
            throw new Error('SEMAPHORE_ABORTED');
        }

        if (this.current < this.max) {
            this.current++;
            return Promise.resolve();
        }

        // 没有可用槽位，进入等待队列
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
        });
    }

    /**
     * 释放执行槽位
     * @description 减少当前活跃任务数，并唤醒等待队列中的下一个任务
     */
    release() {
        // 修复竞态条件：先检查队列，如果有等待者直接唤醒，不减少 current
        // 因为被唤醒的任务会占据这个槽位
        if (this.queue.length > 0 && !this.aborted) {
            const next = this.queue.shift();
            next.resolve();
        } else {
            // 没有等待者时才减少计数
            this.current--;
        }
    }

    /**
     * 中止所有等待的任务
     * @description 立即拒绝所有等待队列中的任务，用于快速停止并行处理
     */
    abort() {
        this.aborted = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            item.reject(new Error('SEMAPHORE_ABORTED'));
        }
    }

    /**
     * 重置信号量状态
     * @description 清除所有状态，包括中止标志和等待队列
     */
    reset() {
        this.aborted = false;
        this.current = 0;
        this.queue = [];
    }
}

/**
 * 并行处理器配置类
 * @class ParallelConfig
 * @description 配置并行处理器的行为参数
 * 
 * @example
 * const config = new ParallelConfig({
 *     enabled: true,
 *     concurrency: 3,
 *     mode: 'batch',
 *     retryCount: 3,
 *     retryDelay: 1000
 * });
 */
export class ParallelConfig {
    /**
     * 创建配置实例
     * @param {Object} options - 配置选项
     * @param {boolean} options.enabled - 是否启用并行处理，设为 false 则降级为串行
     * @param {number} options.concurrency - 并发数，限制在 1-10 之间
     * @param {'independent'|'batch'} options.mode - 处理模式
     *   - 'independent': 完全并行，所有任务同时启动
     *   - 'batch': 分批处理，每批处理 concurrency 个任务
     * @param {number} options.retryCount - 失败重试次数
     * @param {number} options.retryDelay - 重试延迟（毫秒）
     */
    constructor({
        enabled = true,
        concurrency = 3,
        mode = 'independent',
        retryCount = 3,
        retryDelay = 1000
    } = {}) {
        /** @type {boolean} 是否启用并行处理 */
        this.enabled = enabled;
        /** @type {number} 并发数 (1-10) */
        this.concurrency = Math.max(1, Math.min(10, concurrency));
        /** @type {'independent'|'batch'} 处理模式 */
        this.mode = mode;
        /** @type {number} 失败重试次数 */
        this.retryCount = retryCount;
        /** @type {number} 重试延迟（毫秒） */
        this.retryDelay = retryDelay;
    }
}

/**
 * 任务状态枚举
 * @enum {string}
 * @description 定义任务在处理过程中的各种状态
 * 
 * @property {string} PENDING - 等待中，任务已创建但尚未开始处理
 * @property {string} PROCESSING - 处理中，任务正在执行
 * @property {string} COMPLETED - 已完成，任务成功执行完毕
 * @property {string} FAILED - 已失败，任务执行失败且重试耗尽
 * @property {string} RETRYING - 重试中，任务失败后正在等待重试
 */
export const TaskStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying'
};

/**
 * 并行处理器主类
 * @class ParallelProcessor
 * @description 核心并行处理引擎，支持多种处理模式、自动重试和进度追踪
 * 
 * 主要特性：
 * 1. 信号量控制的并发限制
 * 2. 三种处理模式：串行、独立并行、分批并行
 * 3. 自动重试机制，可配置重试次数和延迟
 * 4. 任务状态追踪和进度回调
 * 5. 优雅的中止机制
 * 
 * @example
 * const processor = new ParallelProcessor({
 *     enabled: true,
 *     concurrency: 3,
 *     mode: 'batch',
 *     retryCount: 3
 * });
 * 
 * const { results, errors } = await processor.process(
 *     chunks,
 *     async (chunk, index) => { /* 处理逻辑 *\/ },
 *     (progress) => { console.log(`进度：${progress.index}`); }
 * );
 */
export class ParallelProcessor {
    /**
     * 创建并行处理器实例
     * @param {Object} config - 配置选项
     * @param {boolean} config.enabled - 是否启用并行
     * @param {number} config.concurrency - 并发数
     * @param {'independent'|'batch'} config.mode - 处理模式
     * @param {number} config.retryCount - 重试次数
     * @param {number} config.retryDelay - 重试延迟
     */
    constructor(config = {}) {
        /** @type {ParallelConfig} 配置对象 */
        this.config = new ParallelConfig(config);
        /** @type {Semaphore} 信号量实例 */
        this.semaphore = new Semaphore(this.config.concurrency);
        /** @type {Map<number, Object>} 任务状态映射 */
        this.tasks = new Map();
        /** @type {Array} 结果数组 */
        this.results = [];
        /** @type {Array} 错误数组 */
        this.errors = [];
        /** @type {boolean} 是否已中止 */
        this.isAborted = false;

        /** @type {Function|null} 进度回调 */
        this.onProgress = null;
        /** @type {Function|null} 任务完成回调 */
        this.onTaskComplete = null;
        /** @type {Function|null} 任务错误回调 */
        this.onTaskError = null;
    }

    /**
     * 处理任务队列
     * @description 根据配置选择合适的处理模式（串行/独立并行/分批并行）
     * 
     * 处理流程：
     * 1. 检查是否启用并行，未启用或单任务则使用串行模式
     * 2. 根据 mode 选择独立并行或分批并行
     * 3. 为每个任务执行带重试的处理
     * 4. 通过回调函数报告进度
     * 
     * @async
     * @param {Array} chunks - 任务数据数组，每个元素将作为一个独立任务处理
     * @param {Function} processorFn - 处理函数，签名：async (chunk, index, attempt) => result
     * @param {Function} [onProgress] - 进度回调函数，接收进度对象参数
     * @returns {Promise<Object>} 处理结果，包含 results 数组和 errors 数组
     * 
     * @example
     * const results = await processor.process(
     *     ['任务 1', '任务 2', '任务 3'],
     *     async (task, index) => {
     *         return await processTask(task);
     *     },
     *     ({ index, status }) => {
     *         console.log(`任务${index}状态：${status}`);
     *     }
     * );
     */
    async process(chunks, processorFn, onProgress = null) {
        this.isAborted = false;
        this.results = new Array(chunks.length);
        this.errors = new Array(chunks.length);
        this.onProgress = onProgress;

        // 降级为串行处理：未启用并行或只有一个任务
        if (!this.config.enabled || chunks.length <= 1) {
            return this.processInSeries(chunks, processorFn);
        }

        // 分批模式：每批处理 concurrency 个任务
        if (this.config.mode === 'batch') {
            return this.processInBatches(chunks, processorFn);
        }

        // 独立模式：所有任务同时启动（受信号量限制）
        return this.processIndependent(chunks, processorFn);
    }

    /**
     * 串行处理模式
     * @description 按顺序逐个处理任务，每个任务完成后才处理下一个
     * 
     * 适用场景：
     * - 任务数量少
     * - 任务之间有依赖关系
     * - API 有严格的速率限制
     * - 调试和测试
     * 
     * @private
     * @async
     * @param {Array} chunks - 任务数据数组
     * @param {Function} processorFn - 处理函数
     * @returns {Promise<Object>} 处理结果
     */
    async processInSeries(chunks, processorFn) {
        for (let i = 0; i < chunks.length; i++) {
            if (this.isAborted) break;

            this.updateTaskStatus(i, TaskStatus.PROCESSING);

            try {
                const result = await this.executeWithRetry(chunks[i], i, processorFn);
                this.results[i] = result;
                this.updateTaskStatus(i, TaskStatus.COMPLETED, result);
                this.onProgress?.({ index: i, status: TaskStatus.COMPLETED, result });
            } catch (error) {
                this.errors[i] = error;
                this.updateTaskStatus(i, TaskStatus.FAILED, error);
                this.onProgress?.({ index: i, status: TaskStatus.FAILED, error });
            }
        }

        return { results: this.results, errors: this.errors };
    }

    /**
     * 独立模式并行处理
     * @description 所有任务同时启动，通过信号量控制实际并发数
     * 
     * 特点：
     * - 任务启动顺序不固定
     * - 完成顺序不固定
     * - 适合任务之间无依赖的场景
     * 
     * @private
     * @async
     * @param {Array} chunks - 任务数据数组
     * @param {Function} processorFn - 处理函数
     * @returns {Promise<Object>} 处理结果
     */
    async processIndependent(chunks, processorFn) {
        // 为每个任务创建带信号量控制的 Promise
        const promises = chunks.map((chunk, index) =>
            this.executeWithSemaphore(chunk, index, processorFn)
        );

        // 等待所有任务完成（包括失败的任务）
        await Promise.allSettled(promises);
        return { results: this.results, errors: this.errors };
    }

    /**
     * 分批模式并行处理
     * @description 每批处理 concurrency 个任务，等待一批完成后再处理下一批
     * 
     * 特点：
     * - 每批内的任务并行执行
     * - 批与批之间串行执行
     * - 适合需要控制并发总量但又希望有一定并行度的场景
     * 
     * @private
     * @async
     * @param {Array} chunks - 任务数据数组
     * @param {Function} processorFn - 处理函数
     * @returns {Promise<Object>} 处理结果
     */
    async processInBatches(chunks, processorFn) {
        const batchSize = this.config.concurrency;

        // 按批次处理
        for (let batchStart = 0; batchStart < chunks.length; batchStart += batchSize) {
            if (this.isAborted) break;

            const batchEnd = Math.min(batchStart + batchSize, chunks.length);
            const batchPromises = [];

            // 创建当前批次的所有任务
            for (let i = batchStart; i < batchEnd; i++) {
                batchPromises.push(this.executeWithSemaphore(chunks[i], i, processorFn));
            }

            // 等待当前批次全部完成
            await Promise.allSettled(batchPromises);
        }

        return { results: this.results, errors: this.errors };
    }

    /**
     * 使用信号量执行单个任务
     * @description 获取信号量槽位，执行任务，释放槽位的完整流程
     * 
     * 执行流程：
     * 1. 等待获取信号量槽位
     * 2. 检查是否被中止
     * 3. 更新任务状态为处理中
     * 4. 执行带重试的任务处理
     * 5. 记录结果并更新状态
     * 6. 释放信号量槽位
     * 
     * @private
     * @async
     * @param {*} chunk - 任务数据
     * @param {number} index - 任务索引
     * @param {Function} processorFn - 处理函数
     * @returns {Promise<*>} 任务结果
     */
    async executeWithSemaphore(chunk, index, processorFn) {
        try {
            // 等待获取信号量槽位
            await this.semaphore.acquire();

            // 检查是否被中止
            if (this.isAborted) {
                throw new Error('PROCESSOR_ABORTED');
            }

            // 更新任务状态
            this.updateTaskStatus(index, TaskStatus.PROCESSING);

            // 执行任务（带重试）
            const result = await this.executeWithRetry(chunk, index, processorFn);

            // 记录成功结果
            this.results[index] = result;
            this.updateTaskStatus(index, TaskStatus.COMPLETED, result);
            this.onProgress?.({ index, status: TaskStatus.COMPLETED, result });

            return result;
        } catch (error) {
            // 记录错误结果
            this.errors[index] = error;
            this.updateTaskStatus(index, TaskStatus.FAILED, error);
            this.onProgress?.({ index, status: TaskStatus.FAILED, error });
            throw error;
        } finally {
            // 释放信号量槽位（无论成功或失败）
            this.semaphore.release();
        }
    }

    /**
     * 带重试机制执行任务
     * @description 执行任务并在失败时自动重试，直到达到最大重试次数
     * 
     * 重试策略：
     * - 使用指数退避延迟（每次重试延迟递增）
     * - 只在未达到最大重试次数时重试
     * - 每次重试前检查是否被中止
     * 
     * @private
     * @async
     * @param {*} chunk - 任务数据
     * @param {number} index - 任务索引
     * @param {Function} processorFn - 处理函数
     * @returns {Promise<*>} 任务结果
     * @throws {Error} 当所有重试都失败后抛出最后一次错误
     */
    async executeWithRetry(chunk, index, processorFn) {
        let lastError;

        for (let attempt = 0; attempt < this.config.retryCount; attempt++) {
            // 检查是否被中止
            if (this.isAborted) {
                throw new Error('PROCESSOR_ABORTED');
            }

            try {
                // 执行处理函数，传入当前重试次数
                return await processorFn(chunk, index, attempt);
            } catch (error) {
                lastError = error;

                // 如果还有重试机会，准备下一次重试
                if (attempt < this.config.retryCount - 1 && !this.isAborted) {
                    // 更新状态为重试中
                    this.updateTaskStatus(index, TaskStatus.RETRYING, { attempt: attempt + 1 });
                    this.onProgress?.({
                        index,
                        status: TaskStatus.RETRYING,
                        attempt: attempt + 1,
                        error
                    });

                    // 指数退避延迟
                    await this.sleep(this.config.retryDelay * (attempt + 1));
                }
            }
        }

        // 所有重试都失败了，抛出最后一次错误
        throw lastError;
    }

    /**
     * 更新任务状态
     * @description 记录任务的当前状态并触发回调
     * 
     * @private
     * @param {number} index - 任务索引
     * @param {string} status - 任务状态（来自 TaskStatus 枚举）
     * @param {*} [data] - 附加数据（如结果或错误信息）
     */
    updateTaskStatus(index, status, data = null) {
        this.tasks.set(index, { status, data, updatedAt: Date.now() });
        this.onTaskComplete?.({ index, status, data });
    }

    /**
     * 获取单个任务状态
     * @description 查询指定任务的当前状态
     * 
     * @param {number} index - 任务索引
     * @returns {Object|undefined} 任务状态对象，包含 status、data、updatedAt
     */
    getTaskStatus(index) {
        return this.tasks.get(index);
    }

    /**
     * 获取所有任务状态
     * @description 返回所有任务的状态快照
     * 
     * @returns {Map<number, Object>} 任务状态映射
     */
    getAllTaskStatus() {
        return new Map(this.tasks);
    }

    /**
     * 中止所有处理
     * @description 立即停止所有正在处理和等待的任务
     * 
     * 效果：
     * - 设置中止标志
     * - 清空信号量等待队列
     * - 正在执行的任务会在下次检查时抛出异常
     */
    abort() {
        this.isAborted = true;
        this.semaphore.abort();
    }

    /**
     * 重置处理器
     * @description 清除所有状态，恢复到初始状态
     * 
     * 清除的内容：
     * - 中止标志
     * - 信号量状态
     * - 任务状态记录
     * - 结果和错误数组
     */
    reset() {
        this.isAborted = false;
        this.semaphore.reset();
        this.tasks.clear();
        this.results = [];
        this.errors = [];
    }

    /**
     * 延迟函数
     * @description 工具函数，用于实现重试延迟
     * 
     * @protected
     * @param {number} ms - 延迟毫秒数
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 设置回调函数
     * @description 批量设置各种事件回调
     * 
     * @param {Object} callbacks - 回调函数对象
     * @param {Function} [callbacks.onProgress] - 进度回调
     * @param {Function} [callbacks.onTaskComplete] - 任务完成回调
     * @param {Function} [callbacks.onTaskError] - 任务错误回调
     */
    setCallbacks({ onProgress, onTaskComplete, onTaskError }) {
        this.onProgress = onProgress;
        this.onTaskComplete = onTaskComplete;
        this.onTaskError = onTaskError;
    }
}

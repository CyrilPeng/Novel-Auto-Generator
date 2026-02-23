/**
 * 自动保存提示组件
 * 显示下次自动保存的章节提示
 */
export class AutoSaveIndicator {
    constructor(options = {}) {
        this.autoSaveInterval = options.autoSaveInterval || 50;
        this.containerId = options.containerId || 'ww-autosave-indicator';
        this.element = null;
    }

    /**
     * 创建提示元素
     */
    create(container) {
        this.element = document.createElement('div');
        this.element.id = this.containerId;
        this.element.style.cssText = `
            padding: 8px 12px;
            background: rgba(52, 152, 219, 0.15);
            border-radius: 6px;
            font-size: 12px;
            color: #3498db;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        container.appendChild(this.element);
        this.update(0, this.autoSaveInterval);
    }

    /**
     * 更新提示
     * @param {number} currentChapter - 当前章节
     * @param {number} interval - 自动保存间隔
     */
    update(currentChapter, interval = null) {
        if (!this.element) return;

        if (interval !== null) {
            this.autoSaveInterval = interval;
        }

        const nextSave = this.autoSaveInterval - (currentChapter % this.autoSaveInterval);
        const isNearing = nextSave <= 5;

        this.element.innerHTML = `
            <span style="font-size: 16px;">${isNearing ? '⏰' : '💾'}</span>
            <span>
                ${nextSave === this.autoSaveInterval 
                    ? '下次自动保存：立即' 
                    : `下次自动保存：${nextSave}章后`}
            </span>
        `;

        if (isNearing) {
            this.element.style.background = 'rgba(243, 156, 18, 0.15)';
            this.element.style.color = '#f39c12';
        } else {
            this.element.style.background = 'rgba(52, 152, 219, 0.15)';
            this.element.style.color = '#3498db';
        }
    }

    /**
     * 显示保存中状态
     */
    showSaving() {
        if (!this.element) return;

        this.element.innerHTML = `
            <span class="ww-animate-spin" style="display:inline-block;animation:spin 1s linear infinite;">💾</span>
            <span>正在保存...</span>
        `;
        this.element.style.background = 'rgba(39, 174, 96, 0.15)';
        this.element.style.color = '#27ae60';
    }

    /**
     * 显示保存成功
     */
    showSaved() {
        if (!this.element) return;

        this.element.innerHTML = `
            <span>✅</span>
            <span>已自动保存</span>
        `;
        this.element.style.background = 'rgba(39, 174, 96, 0.15)';
        this.element.style.color = '#27ae60';

        setTimeout(() => {
            this.update(0);
        }, 2000);
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

/**
 * 统计信息显示组件
 * 显示详细的处理统计信息
 */
export class StatsDisplay {
    constructor(options = {}) {
        this.containerId = options.containerId || 'ww-stats-display';
        this.element = null;
        this.stats = {
            startTime: null,
            chaptersProcessed: 0,
            totalChapters: 0,
            entriesGenerated: 0,
            errors: 0,
            avgTimePerChapter: 0
        };
    }

    /**
     * 创建显示元素
     */
    create(container) {
        this.element = document.createElement('div');
        this.element.id = this.containerId;
        this.element.style.cssText = `
            padding: 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            margin-bottom: 16px;
        `;
        container.appendChild(this.element);
        this.render();
    }

    /**
     * 更新统计
     * @param {Object} stats - 统计数据
     */
    update(stats = {}) {
        Object.assign(this.stats, stats);
        this.render();
    }

    /**
     * 渲染统计信息
     */
    render() {
        if (!this.element) return;

        const {
            startTime,
            chaptersProcessed,
            totalChapters,
            entriesGenerated,
            errors,
            avgTimePerChapter
        } = this.stats;

        // 计算已用时间
        const elapsed = startTime ? Date.now() - startTime : 0;
        const elapsedStr = this.formatDuration(elapsed);

        // 计算进度百分比
        const progress = totalChapters > 0 
            ? Math.round((chaptersProcessed / totalChapters) * 100) 
            : 0;

        // 预估剩余时间
        const remaining = chaptersProcessed > 0 
            ? Math.round((totalChapters - chaptersProcessed) * avgTimePerChapter)
            : 0;
        const remainingStr = remaining > 0 ? this.formatDuration(remaining) : '--:--:--';

        // 处理速度（章/分钟）
        const speed = elapsed > 0 
            ? ((chaptersProcessed / elapsed) * 60000).toFixed(2)
            : '0.00';

        this.element.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                <!-- 进度统计 -->
                <div style="padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
                    <div style="font-size:20px;font-weight:bold;color:#3498db;">${chaptersProcessed}/${totalChapters}</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">章节进度</div>
                    <div style="margin-top:8px;">
                        <div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;">
                            <div style="width:${progress}%;height:100%;background:#3498db;border-radius:2px;transition:width 0.3s;"></div>
                        </div>
                        <div style="font-size:10px;color:#888;margin-top:4px;text-align:right;">${progress}%</div>
                    </div>
                </div>

                <!-- 时间统计 -->
                <div style="padding:12px;background:rgba(155,89,182,0.15);border-radius:8px;">
                    <div style="font-size:20px;font-weight:bold;color:#9b59b6;">${elapsedStr}</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">已用时间</div>
                    <div style="font-size:11px;color:#888;margin-top:8px;">
                        剩余：${remainingStr}
                    </div>
                </div>

                <!-- 生成统计 -->
                <div style="padding:12px;background:rgba(39,174,96,0.15);border-radius:8px;">
                    <div style="font-size:20px;font-weight:bold;color:#27ae60;">${entriesGenerated}</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">生成条目</div>
                    <div style="font-size:11px;color:#888;margin-top:8px;">
                        速度：${speed} 章/分
                    </div>
                </div>

                <!-- 错误统计 -->
                <div style="padding:12px;background:rgba(231,76,60,0.15);border-radius:8px;">
                    <div style="font-size:20px;font-weight:bold;color:#e74c3c;">${errors}</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">错误次数</div>
                    <div style="font-size:11px;color:#888;margin-top:8px;">
                        成功率：${chaptersProcessed > 0 ? Math.round(((chaptersProcessed - errors) / chaptersProcessed) * 100) : 100}%
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 格式化时长
     */
    formatDuration(ms) {
        if (!ms || ms < 0) return '--:--:--';
        const s = Math.floor(ms / 1000) % 60;
        const m = Math.floor(ms / 60000) % 60;
        const h = Math.floor(ms / 3600000);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    /**
     * 重置统计
     */
    reset() {
        this.stats = {
            startTime: Date.now(),
            chaptersProcessed: 0,
            totalChapters: 0,
            entriesGenerated: 0,
            errors: 0,
            avgTimePerChapter: 0
        };
        this.render();
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

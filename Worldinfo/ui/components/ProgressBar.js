/**
 * 进度条组件
 * 显示任务进度
 */

/**
 * 进度条配置
 */
export class ProgressBarConfig {
    constructor({
        min = 0,
        max = 100,
        value = 0,
        showText = true,
        textFormat = '{value} / {max} ({percentage}%)',
        height = '8px',
        animated = true
    } = {}) {
        this.min = min;
        this.max = max;
        this.value = value;
        this.showText = showText;
        this.textFormat = textFormat;
        this.height = height;
        this.animated = animated;
    }
}

/**
 * 进度条组件
 */
export class ProgressBar {
    constructor(config = {}) {
        this.config = new ProgressBarConfig(config);
        this.element = null;
    }

    /**
     * 创建进度条元素
     * @returns {HTMLElement} 进度条容器
     */
    create() {
        const { height, showText } = this.config;
        
        const container = document.createElement('div');
        container.className = 'ww-progress-container';
        
        const progressBar = document.createElement('div');
        progressBar.className = 'ww-progress-bar';
        progressBar.style.height = height;
        
        const progressFill = document.createElement('div');
        progressFill.className = 'ww-progress-fill';
        progressFill.style.width = this.getPercentage() + '%';
        
        if (this.config.animated) {
            progressFill.style.transition = 'width 0.3s ease';
        }
        
        progressBar.appendChild(progressFill);
        container.appendChild(progressBar);
        
        if (showText) {
            const progressText = document.createElement('div');
            progressText.className = 'ww-progress-text';
            progressText.textContent = this.formatText();
            container.appendChild(progressText);
        }
        
        this.element = container;
        this.fillElement = progressFill;
        this.textElement = progressText;
        
        return container;
    }

    /**
     * 获取百分比
     * @returns {number} 百分比值
     */
    getPercentage() {
        const { min, max, value } = this.config;
        if (max <= min) return 0;
        return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    }

    /**
     * 格式化文本
     * @returns {string} 格式化后的文本
     */
    formatText() {
        const { min, max, value, textFormat } = this.config;
        const percentage = this.getPercentage().toFixed(1);
        
        return textFormat
            .replace('{value}', value)
            .replace('{min}', min)
            .replace('{max}', max)
            .replace('{percentage}', percentage);
    }

    /**
     * 更新进度值
     * @param {number} value - 新进度值
     * @returns {ProgressBar} this
     */
    update(value) {
        this.config.value = value;
        
        if (this.fillElement) {
            this.fillElement.style.width = this.getPercentage() + '%';
        }
        
        if (this.textElement && this.config.showText) {
            this.textElement.textContent = this.formatText();
        }
        
        return this;
    }

    /**
     * 更新最大值
     * @param {number} max - 新最大值
     * @returns {ProgressBar} this
     */
    updateMax(max) {
        this.config.max = max;
        this.update(this.config.value);
        return this;
    }

    /**
     * 设置文本格式
     * @param {string} format - 文本格式
     * @returns {ProgressBar} this
     */
    setTextFormat(format) {
        this.config.textFormat = format;
        if (this.textElement) {
            this.textElement.textContent = this.formatText();
        }
        return this;
    }

    /**
     * 完成进度
     * @returns {ProgressBar} this
     */
    complete() {
        this.update(this.config.max);
        return this;
    }

    /**
     * 重置进度
     * @returns {ProgressBar} this
     */
    reset() {
        this.update(this.config.min);
        return this;
    }

    /**
     * 获取元素
     * @returns {HTMLElement} 进度条容器
     */
    getElement() {
        return this.element;
    }

    /**
     * 静态方法：创建简单进度条
     * @param {number} value - 当前值
     * @param {number} max - 最大值
     * @returns {ProgressBar} 进度条实例
     */
    static simple(value, max) {
        return new ProgressBar({ value, max, textFormat: '{percentage}%' });
    }
}

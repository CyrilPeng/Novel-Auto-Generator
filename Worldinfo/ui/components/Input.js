/**
 * 输入框组件
 * 支持文本输入、数字输入、文本域等多种类型
 */
export class Input {
    constructor(options = {}) {
        this.type = options.type || 'text'; // text, number, password, email, url, search, tel
        this.name = options.name || '';
        this.value = options.value || '';
        this.placeholder = options.placeholder || '';
        this.label = options.label || '';
        this.labelPosition = options.labelPosition || 'top'; // top, left, right
        this.size = options.size || 'medium'; // small, medium, large
        this.disabled = options.disabled || false;
        this.readonly = options.readonly || false;
        this.required = options.required || false;
        this.autofocus = options.autofocus || false;
        this.autocomplete = options.autocomplete || 'off';
        this.maxLength = options.maxLength || null;
        this.min = options.min !== undefined ? options.min : null;
        this.max = options.max !== undefined ? options.max : null;
        this.step = options.step !== undefined ? options.step : null;
        this.prefix = options.prefix || ''; // 前缀图标或文本
        this.suffix = options.suffix || ''; // 后缀图标或文本
        this.clearable = options.clearable || false; // 是否显示清除按钮
        this.className = options.className || '';
        this.error = options.error || ''; // 错误信息
        this.help = options.help || ''; // 帮助文本
        
        this.onChange = options.onChange || (() => {});
        this.onInput = options.onInput || (() => {});
        this.onFocus = options.onFocus || (() => {});
        this.onBlur = options.onBlur || (() => {});
        this.onKeyDown = options.onKeyDown || (() => {});
        this.onKeyUp = options.onKeyUp || (() => {});
        this.onEnter = options.onEnter || (() => {});
        this.onClear = options.onClear || (() => {});
        
        this.element = null;
        this.inputElement = null;
    }

    /**
     * 渲染输入框
     */
    render() {
        const hasPrefix = this.prefix || this.type === 'search';
        const hasSuffix = this.suffix || this.clearable || this.type === 'password';
        const hasAddon = hasPrefix || hasSuffix;
        
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-input-wrapper',
            `wb-input-${this.size}`,
            this.disabled ? 'wb-input-disabled' : '',
            this.error ? 'wb-input-error' : '',
            hasAddon ? 'wb-input-has-addon' : '',
            this.className
        ].filter(Boolean).join(' ');

        // 标签
        if (this.label) {
            const label = document.createElement('label');
            label.className = 'wb-input-label';
            label.textContent = this.label;
            if (this.required) {
                const required = document.createElement('span');
                required.className = 'wb-input-required';
                required.textContent = ' *';
                label.appendChild(required);
            }
            wrapper.appendChild(label);
        }

        // 输入框容器
        const inputContainer = document.createElement('div');
        inputContainer.className = 'wb-input-container';

        // 前缀
        if (hasPrefix) {
            const prefix = document.createElement('span');
            prefix.className = 'wb-input-prefix';
            prefix.innerHTML = this.prefix || '🔍';
            inputContainer.appendChild(prefix);
        }

        // 输入框
        const input = document.createElement('input');
        input.type = this.type === 'search' ? 'text' : this.type;
        input.className = 'wb-input';
        input.value = this.value;
        input.placeholder = this.placeholder;
        input.name = this.name;
        input.disabled = this.disabled;
        input.readOnly = this.readonly;
        input.required = this.required;
        input.autofocus = this.autofocus;
        input.autocomplete = this.autocomplete;
        
        if (this.maxLength) input.maxLength = this.maxLength;
        if (this.min !== null) input.min = this.min;
        if (this.max !== null) input.max = this.max;
        if (this.step !== null) input.step = this.step;

        // 事件绑定
        input.addEventListener('input', (e) => {
            this.value = e.target.value;
            this.onInput(e.target.value, e);
            this.onChange(e.target.value, e);
        });

        input.addEventListener('focus', (e) => {
            inputContainer.classList.add('wb-input-focused');
            this.onFocus(e);
        });

        input.addEventListener('blur', (e) => {
            inputContainer.classList.remove('wb-input-focused');
            this.onBlur(e);
        });

        input.addEventListener('keydown', (e) => {
            this.onKeyDown(e);
            if (e.key === 'Enter') {
                this.onEnter(this.value, e);
            }
        });

        input.addEventListener('keyup', (e) => {
            this.onKeyUp(e);
        });

        inputContainer.appendChild(input);
        this.inputElement = input;

        // 后缀
        if (hasSuffix) {
            const suffix = document.createElement('span');
            suffix.className = 'wb-input-suffix';
            
            if (this.clearable && this.value) {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'wb-input-clear';
                clearBtn.innerHTML = '✕';
                clearBtn.type = 'button';
                clearBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.setValue('');
                    this.onClear(e);
                    this.inputElement.focus();
                });
                suffix.appendChild(clearBtn);
            } else {
                suffix.innerHTML = this.suffix;
            }
            
            inputContainer.appendChild(suffix);
        }

        wrapper.appendChild(inputContainer);

        // 错误信息
        if (this.error) {
            const error = document.createElement('div');
            error.className = 'wb-input-error-message';
            error.textContent = this.error;
            wrapper.appendChild(error);
        }

        // 帮助文本
        if (this.help) {
            const help = document.createElement('div');
            help.className = 'wb-input-help';
            help.textContent = this.help;
            wrapper.appendChild(help);
        }

        this.element = wrapper;
        return wrapper;
    }

    /**
     * 获取值
     */
    getValue() {
        return this.value;
    }

    /**
     * 设置值
     */
    setValue(value) {
        this.value = value;
        if (this.inputElement) {
            this.inputElement.value = value;
        }
        return this;
    }

    /**
     * 聚焦
     */
    focus() {
        if (this.inputElement) {
            this.inputElement.focus();
        }
        return this;
    }

    /**
     * 失焦
     */
    blur() {
        if (this.inputElement) {
            this.inputElement.blur();
        }
        return this;
    }

    /**
     * 设置禁用状态
     */
    setDisabled(disabled) {
        this.disabled = disabled;
        if (this.inputElement) {
            this.inputElement.disabled = disabled;
        }
        if (this.element) {
            this.element.classList.toggle('wb-input-disabled', disabled);
        }
        return this;
    }

    /**
     * 设置错误状态
     */
    setError(error) {
        this.error = error;
        if (this.element) {
            this.element.classList.toggle('wb-input-error', !!error);
            
            // 更新或创建错误消息元素
            let errorEl = this.element.querySelector('.wb-input-error-message');
            if (error) {
                if (!errorEl) {
                    errorEl = document.createElement('div');
                    errorEl.className = 'wb-input-error-message';
                    this.element.appendChild(errorEl);
                }
                errorEl.textContent = error;
            } else if (errorEl) {
                errorEl.remove();
            }
        }
        return this;
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this.inputElement = null;
    }
}

/**
 * 文本域组件
 */
export class TextArea extends Input {
    constructor(options = {}) {
        super({ ...options, type: 'textarea' });
        this.rows = options.rows || 3;
        this.autoResize = options.autoResize || false;
        this.maxRows = options.maxRows || 10;
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-input-wrapper',
            'wb-textarea-wrapper',
            `wb-input-${this.size}`,
            this.disabled ? 'wb-input-disabled' : '',
            this.error ? 'wb-input-error' : '',
            this.className
        ].filter(Boolean).join(' ');

        if (this.label) {
            const label = document.createElement('label');
            label.className = 'wb-input-label';
            label.textContent = this.label;
            if (this.required) {
                const required = document.createElement('span');
                required.className = 'wb-input-required';
                required.textContent = ' *';
                label.appendChild(required);
            }
            wrapper.appendChild(label);
        }

        const textarea = document.createElement('textarea');
        textarea.className = 'wb-input wb-textarea';
        textarea.value = this.value;
        textarea.placeholder = this.placeholder;
        textarea.name = this.name;
        textarea.rows = this.rows;
        textarea.disabled = this.disabled;
        textarea.readOnly = this.readonly;
        textarea.required = this.required;
        textarea.autofocus = this.autofocus;
        
        if (this.maxLength) textarea.maxLength = this.maxLength;

        // 事件绑定
        textarea.addEventListener('input', (e) => {
            this.value = e.target.value;
            this.onInput(e.target.value, e);
            this.onChange(e.target.value, e);
            
            if (this.autoResize) {
                this.resizeTextarea(textarea);
            }
        });

        textarea.addEventListener('focus', (e) => {
            wrapper.classList.add('wb-input-focused');
            this.onFocus(e);
        });

        textarea.addEventListener('blur', (e) => {
            wrapper.classList.remove('wb-input-focused');
            this.onBlur(e);
        });

        textarea.addEventListener('keydown', (e) => {
            this.onKeyDown(e);
            if (e.key === 'Enter' && !e.shiftKey) {
                this.onEnter(this.value, e);
            }
        });

        wrapper.appendChild(textarea);
        this.inputElement = textarea;

        // 字符计数
        if (this.maxLength) {
            const counter = document.createElement('div');
            counter.className = 'wb-textarea-counter';
            counter.textContent = `${this.value.length}/${this.maxLength}`;
            wrapper.appendChild(counter);

            textarea.addEventListener('input', () => {
                counter.textContent = `${textarea.value.length}/${this.maxLength}`;
                counter.classList.toggle('wb-textarea-counter-warning', 
                    textarea.value.length > this.maxLength * 0.9);
            });
        }

        if (this.error) {
            const error = document.createElement('div');
            error.className = 'wb-input-error-message';
            error.textContent = this.error;
            wrapper.appendChild(error);
        }

        if (this.help) {
            const help = document.createElement('div');
            help.className = 'wb-input-help';
            help.textContent = this.help;
            wrapper.appendChild(help);
        }

        this.element = wrapper;
        
        // 初始自适应
        if (this.autoResize) {
            setTimeout(() => this.resizeTextarea(textarea), 0);
        }
        
        return wrapper;
    }

    /**
     * 调整文本域高度
     */
    resizeTextarea(textarea) {
        textarea.style.height = 'auto';
        const newHeight = Math.min(
            Math.max(textarea.scrollHeight, textarea.rows * 20),
            this.maxRows * 20
        );
        textarea.style.height = `${newHeight}px`;
    }

    /**
     * 获取值
     */
    getValue() {
        return this.value;
    }

    /**
     * 设置值
     */
    setValue(value) {
        this.value = value;
        if (this.inputElement) {
            this.inputElement.value = value;
            if (this.autoResize) {
                this.resizeTextarea(this.inputElement);
            }
        }
        return this;
    }

    /**
     * 聚焦
     */
    focus() {
        if (this.inputElement) {
            this.inputElement.focus();
        }
        return this;
    }

    /**
     * 失焦
     */
    blur() {
        if (this.inputElement) {
            this.inputElement.blur();
        }
        return this;
    }

    /**
     * 设置禁用状态
     */
    setDisabled(disabled) {
        this.disabled = disabled;
        if (this.inputElement) {
            this.inputElement.disabled = disabled;
        }
        if (this.element) {
            this.element.classList.toggle('wb-input-disabled', disabled);
        }
        return this;
    }

    /**
     * 设置错误状态
     */
    setError(error) {
        this.error = error;
        if (this.element) {
            this.element.classList.toggle('wb-input-error', !!error);
            
            let errorEl = this.element.querySelector('.wb-input-error-message');
            if (error) {
                if (!errorEl) {
                    errorEl = document.createElement('div');
                    errorEl.className = 'wb-input-error-message';
                    this.element.appendChild(errorEl);
                }
                errorEl.textContent = error;
            } else if (errorEl) {
                errorEl.remove();
            }
        }
        return this;
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this.inputElement = null;
    }
}

/**
 * 数字输入框组件
 */
export class NumberInput extends Input {
    constructor(options = {}) {
        super({ ...options, type: 'number' });
        this.showStepper = options.showStepper !== false;
        this.precision = options.precision || 0;
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-input-wrapper',
            'wb-number-input-wrapper',
            `wb-input-${this.size}`,
            this.disabled ? 'wb-input-disabled' : '',
            this.error ? 'wb-input-error' : '',
            this.className
        ].filter(Boolean).join(' ');

        if (this.label) {
            const label = document.createElement('label');
            label.className = 'wb-input-label';
            label.textContent = this.label;
            wrapper.appendChild(label);
        }

        const container = document.createElement('div');
        container.className = 'wb-input-container';

        // 减号按钮
        if (this.showStepper) {
            const minusBtn = document.createElement('button');
            minusBtn.type = 'button';
            minusBtn.className = 'wb-number-stepper wb-number-stepper-minus';
            minusBtn.innerHTML = '−';
            minusBtn.disabled = this.disabled;
            minusBtn.addEventListener('click', () => {
                const currentValue = parseFloat(this.inputElement.value) || 0;
                const step = this.step || 1;
                this.setValue(this.formatNumber(currentValue - step));
            });
            container.appendChild(minusBtn);
        }

        // 输入框
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'wb-input';
        input.value = this.value;
        input.placeholder = this.placeholder;
        input.name = this.name;
        input.disabled = this.disabled;
        input.readOnly = this.readonly;
        input.required = this.required;
        input.autofocus = this.autofocus;
        
        if (this.min !== null) input.min = this.min;
        if (this.max !== null) input.max = this.max;
        if (this.step !== null) input.step = this.step;

        input.addEventListener('input', (e) => {
            this.value = e.target.value;
            this.onInput(e.target.value, e);
            this.onChange(e.target.value, e);
        });

        input.addEventListener('focus', (e) => {
            container.classList.add('wb-input-focused');
            this.onFocus(e);
        });

        input.addEventListener('blur', (e) => {
            container.classList.remove('wb-input-focused');
            this.onBlur(e);
        });

        container.appendChild(input);
        this.inputElement = input;

        // 加号按钮
        if (this.showStepper) {
            const plusBtn = document.createElement('button');
            plusBtn.type = 'button';
            plusBtn.className = 'wb-number-stepper wb-number-stepper-plus';
            plusBtn.innerHTML = '+';
            plusBtn.disabled = this.disabled;
            plusBtn.addEventListener('click', () => {
                const currentValue = parseFloat(this.inputElement.value) || 0;
                const step = this.step || 1;
                this.setValue(this.formatNumber(currentValue + step));
            });
            container.appendChild(plusBtn);
        }

        wrapper.appendChild(container);

        if (this.error) {
            const error = document.createElement('div');
            error.className = 'wb-input-error-message';
            error.textContent = this.error;
            wrapper.appendChild(error);
        }

        if (this.help) {
            const help = document.createElement('div');
            help.className = 'wb-input-help';
            help.textContent = this.help;
            wrapper.appendChild(help);
        }

        this.element = wrapper;
        return wrapper;
    }

    /**
     * 格式化数字
     */
    formatNumber(value) {
        if (this.precision > 0) {
            return parseFloat(value.toFixed(this.precision));
        }
        return Math.round(value);
    }

    /**
     * 获取值
     */
    getValue() {
        return this.value;
    }

    /**
     * 设置值
     */
    setValue(value) {
        this.value = value;
        if (this.inputElement) {
            this.inputElement.value = value;
        }
        return this;
    }

    /**
     * 聚焦
     */
    focus() {
        if (this.inputElement) {
            this.inputElement.focus();
        }
        return this;
    }

    /**
     * 失焦
     */
    blur() {
        if (this.inputElement) {
            this.inputElement.blur();
        }
        return this;
    }

    /**
     * 设置禁用状态
     */
    setDisabled(disabled) {
        this.disabled = disabled;
        if (this.inputElement) {
            this.inputElement.disabled = disabled;
        }
        if (this.element) {
            this.element.classList.toggle('wb-input-disabled', disabled);
        }
        return this;
    }

    /**
     * 销毁
     */
    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this.inputElement = null;
    }
}

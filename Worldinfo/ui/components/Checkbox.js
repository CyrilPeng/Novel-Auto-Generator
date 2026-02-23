/**
 * 复选框组件
 * 支持单复选框和复选框组
 */
export class Checkbox {
    constructor(options = {}) {
        this.value = options.value || '';
        this.label = options.label || '';
        this.checked = options.checked || false;
        this.indeterminate = options.indeterminate || false;
        this.disabled = options.disabled || false;
        this.size = options.size || 'medium'; // small, medium, large
        this.className = options.className || '';
        
        this.onChange = options.onChange || (() => {});
        
        this.element = null;
        this.inputElement = null;
    }

    render() {
        const wrapper = document.createElement('label');
        wrapper.className = [
            'wb-checkbox',
            `wb-checkbox-${this.size}`,
            this.disabled ? 'wb-checkbox-disabled' : '',
            this.checked ? 'wb-checkbox-checked' : '',
            this.indeterminate ? 'wb-checkbox-indeterminate' : '',
            this.className
        ].filter(Boolean).join(' ');

        // 隐藏的原生复选框
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'wb-checkbox-input';
        input.value = this.value;
        input.checked = this.checked;
        input.disabled = this.disabled;
        input.indeterminate = this.indeterminate;

        input.addEventListener('change', (e) => {
            this.checked = e.target.checked;
            this.indeterminate = false;
            this.updateState();
            this.onChange(this.checked, this.value, e);
        });

        wrapper.appendChild(input);
        this.inputElement = input;

        // 自定义复选框样式
        const box = document.createElement('span');
        box.className = 'wb-checkbox-box';
        wrapper.appendChild(box);

        // 标签文本
        if (this.label) {
            const label = document.createElement('span');
            label.className = 'wb-checkbox-label';
            label.textContent = this.label;
            wrapper.appendChild(label);
        }

        this.element = wrapper;
        return wrapper;
    }

    /**
     * 更新状态
     */
    updateState() {
        if (this.element) {
            this.element.classList.toggle('wb-checkbox-checked', this.checked);
            this.element.classList.toggle('wb-checkbox-indeterminate', this.indeterminate);
            
            if (this.inputElement) {
                this.inputElement.checked = this.checked;
                this.inputElement.indeterminate = this.indeterminate;
            }
        }
    }

    /**
     * 设置选中状态
     */
    setChecked(checked) {
        this.checked = checked;
        this.indeterminate = false;
        this.updateState();
        return this;
    }

    /**
     * 设置不确定状态
     */
    setIndeterminate(indeterminate) {
        this.indeterminate = indeterminate;
        this.updateState();
        return this;
    }

    /**
     * 获取选中状态
     */
    isChecked() {
        return this.checked;
    }

    /**
     * 切换状态
     */
    toggle() {
        this.setChecked(!this.checked);
        this.onChange(this.checked, this.value);
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
 * 复选框组组件
 */
export class CheckboxGroup {
    constructor(options = {}) {
        this.options = options.options || []; // {value, label, disabled}
        this.value = options.value || []; // 选中的值数组
        this.disabled = options.disabled || false;
        this.size = options.size || 'medium';
        this.direction = options.direction || 'vertical'; // vertical, horizontal
        this.className = options.className || '';
        
        this.onChange = options.onChange || (() => {});
        
        this.element = null;
        this.checkboxes = [];
    }

    render() {
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-checkbox-group',
            `wb-checkbox-group-${this.direction}`,
            this.disabled ? 'wb-checkbox-group-disabled' : '',
            this.className
        ].filter(Boolean).join(' ');

        this.options.forEach(opt => {
            const checkbox = new Checkbox({
                value: opt.value,
                label: opt.label,
                checked: this.value.includes(opt.value),
                disabled: this.disabled || opt.disabled,
                size: this.size,
                onChange: (checked) => {
                    if (checked) {
                        if (!this.value.includes(opt.value)) {
                            this.value.push(opt.value);
                        }
                    } else {
                        const idx = this.value.indexOf(opt.value);
                        if (idx > -1) {
                            this.value.splice(idx, 1);
                        }
                    }
                    this.onChange([...this.value], opt.value, checked);
                }
            });

            const checkboxEl = checkbox.render();
            wrapper.appendChild(checkboxEl);
            this.checkboxes.push(checkbox);
        });

        this.element = wrapper;
        return wrapper;
    }

    /**
     * 获取值
     */
    getValue() {
        return [...this.value];
    }

    /**
     * 设置值
     */
    setValue(value) {
        this.value = value || [];
        this.checkboxes.forEach((checkbox, index) => {
            const opt = this.options[index];
            if (opt) {
                checkbox.setChecked(this.value.includes(opt.value));
            }
        });
        return this;
    }

    /**
     * 全选
     */
    selectAll() {
        this.value = this.options
            .filter(opt => !opt.disabled)
            .map(opt => opt.value);
        this.setValue(this.value);
        this.onChange([...this.value], null, true);
        return this;
    }

    /**
     * 清空
     */
    clear() {
        this.value = [];
        this.setValue([]);
        this.onChange([], null, false);
        return this;
    }

    /**
     * 销毁
     */
    destroy() {
        this.checkboxes.forEach(checkbox => checkbox.destroy());
        this.checkboxes = [];
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

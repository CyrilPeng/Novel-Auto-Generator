/**
 * 选择框组件
 * 支持下拉单选、多选、搜索等功能
 */
export class Select {
    constructor(options = {}) {
        this.options = options.options || []; // 选项数组 [{value, label, disabled, children}]
        this.value = options.value !== undefined ? options.value : (options.multiple ? [] : '');
        this.multiple = options.multiple || false;
        this.searchable = options.searchable || false;
        this.clearable = options.clearable || false;
        this.disabled = options.disabled || false;
        this.placeholder = options.placeholder || '请选择';
        this.searchPlaceholder = options.searchPlaceholder || '搜索...';
        this.emptyText = options.emptyText || '暂无数据';
        this.label = options.label || '';
        this.size = options.size || 'medium'; // small, medium, large
        this.className = options.className || '';
        this.error = options.error || '';
        this.help = options.help || '';
        this.maxHeight = options.maxHeight || '250px';
        this.maxTagCount = options.maxTagCount || 3; // 多选时最多显示标签数
        
        this.onChange = options.onChange || (() => {});
        this.onSearch = options.onSearch || (() => {});
        this.onClear = options.onClear || (() => {});
        this.onOpen = options.onOpen || (() => {});
        this.onClose = options.onClose || (() => {});
        
        this.element = null;
        this.triggerElement = null;
        this.dropdownElement = null;
        this.searchInput = null;
        this.isOpen = false;
        this.filteredOptions = [...this.options];
        this.searchValue = '';
    }

    /**
     * 渲染选择框
     */
    render() {
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-select-wrapper',
            `wb-select-${this.size}`,
            this.disabled ? 'wb-select-disabled' : '',
            this.error ? 'wb-select-error' : '',
            this.multiple ? 'wb-select-multiple' : '',
            this.searchable ? 'wb-select-searchable' : '',
            this.className
        ].filter(Boolean).join(' ');

        if (this.label) {
            const label = document.createElement('label');
            label.className = 'wb-select-label';
            label.textContent = this.label;
            wrapper.appendChild(label);
        }

        // 触发器
        const trigger = document.createElement('div');
        trigger.className = 'wb-select-trigger';
        trigger.tabIndex = this.disabled ? -1 : 0;

        // 显示内容
        const display = document.createElement('div');
        display.className = 'wb-select-display';
        this.renderDisplay(display);
        trigger.appendChild(display);

        // 清除按钮
        if (this.clearable && !this.disabled) {
            const clear = document.createElement('span');
            clear.className = 'wb-select-clear';
            clear.innerHTML = '✕';
            clear.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clear();
            });
            trigger.appendChild(clear);
        }

        // 箭头
        const arrow = document.createElement('span');
        arrow.className = 'wb-select-arrow';
        arrow.innerHTML = '▼';
        trigger.appendChild(arrow);

        // 事件绑定
        trigger.addEventListener('click', () => {
            if (!this.disabled) {
                this.toggle();
            }
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'ArrowDown' && !this.isOpen) {
                e.preventDefault();
                this.open();
            } else if (e.key === 'Escape' && this.isOpen) {
                e.preventDefault();
                this.close();
            }
        });

        wrapper.appendChild(trigger);
        this.triggerElement = trigger;

        if (this.error) {
            const error = document.createElement('div');
            error.className = 'wb-select-error-message';
            error.textContent = this.error;
            wrapper.appendChild(error);
        }

        if (this.help) {
            const help = document.createElement('div');
            help.className = 'wb-select-help';
            help.textContent = this.help;
            wrapper.appendChild(help);
        }

        this.element = wrapper;

        // 点击外部关闭
        this.handleOutsideClick = (e) => {
            if (this.isOpen && !this.element.contains(e.target)) {
                this.close();
            }
        };
        document.addEventListener('click', this.handleOutsideClick);

        return wrapper;
    }

    /**
     * 渲染显示内容
     */
    renderDisplay(container) {
        container.innerHTML = '';

        if (this.multiple) {
            const selectedOptions = this.getSelectedOptions();
            
            if (selectedOptions.length === 0) {
                const placeholder = document.createElement('span');
                placeholder.className = 'wb-select-placeholder';
                placeholder.textContent = this.placeholder;
                container.appendChild(placeholder);
            } else {
                const tags = document.createElement('div');
                tags.className = 'wb-select-tags';

                const displayOptions = selectedOptions.slice(0, this.maxTagCount);
                const remaining = selectedOptions.length - this.maxTagCount;

                displayOptions.forEach(option => {
                    const tag = document.createElement('span');
                    tag.className = 'wb-select-tag';
                    tag.innerHTML = `${option.label} <span class="wb-select-tag-close" data-value="${option.value}">✕</span>`;
                    
                    const closeBtn = tag.querySelector('.wb-select-tag-close');
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deselectOption(option.value);
                    });

                    tags.appendChild(tag);
                });

                if (remaining > 0) {
                    const more = document.createElement('span');
                    more.className = 'wb-select-tag wb-select-tag-more';
                    more.textContent = `+${remaining}`;
                    tags.appendChild(more);
                }

                container.appendChild(tags);
            }
        } else {
            const selectedOption = this.getSelectedOption();
            
            if (selectedOption) {
                container.textContent = selectedOption.label;
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'wb-select-placeholder';
                placeholder.textContent = this.placeholder;
                container.appendChild(placeholder);
            }
        }
    }

    /**
     * 渲染下拉列表
     */
    renderDropdown() {
        const dropdown = document.createElement('div');
        dropdown.className = 'wb-select-dropdown';
        dropdown.style.maxHeight = this.maxHeight;

        // 搜索框
        if (this.searchable) {
            const search = document.createElement('div');
            search.className = 'wb-select-search';
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'wb-select-search-input';
            searchInput.placeholder = this.searchPlaceholder;
            searchInput.value = this.searchValue;
            
            searchInput.addEventListener('input', (e) => {
                this.searchValue = e.target.value;
                this.filterOptions();
                this.renderOptionsList(optionsList);
                this.onSearch(this.searchValue);
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.focusNextOption();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.focusPrevOption();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.selectFocusedOption();
                }
            });
            
            search.appendChild(searchInput);
            dropdown.appendChild(search);
            this.searchInput = searchInput;
        }

        // 选项列表
        const optionsList = document.createElement('div');
        optionsList.className = 'wb-select-options';
        this.renderOptionsList(optionsList);
        dropdown.appendChild(optionsList);

        // 空状态
        if (this.filteredOptions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'wb-select-empty';
            empty.textContent = this.emptyText;
            dropdown.appendChild(empty);
        }

        this.dropdownElement = dropdown;
        return dropdown;
    }

    /**
     * 渲染选项列表
     */
    renderOptionsList(container) {
        container.innerHTML = '';

        this.filteredOptions.forEach((option, index) => {
            if (option.children) {
                // 分组
                const group = document.createElement('div');
                group.className = 'wb-select-group';
                
                const groupLabel = document.createElement('div');
                groupLabel.className = 'wb-select-group-label';
                groupLabel.textContent = option.label;
                group.appendChild(groupLabel);

                option.children.forEach(child => {
                    const optionEl = this.createOptionElement(child, index);
                    group.appendChild(optionEl);
                });

                container.appendChild(group);
            } else {
                const optionEl = this.createOptionElement(option, index);
                container.appendChild(optionEl);
            }
        });
    }

    /**
     * 创建选项元素
     */
    createOptionElement(option, index) {
        const optionEl = document.createElement('div');
        optionEl.className = 'wb-select-option';
        optionEl.dataset.value = option.value;
        optionEl.dataset.index = index;
        
        if (option.disabled) {
            optionEl.classList.add('wb-select-option-disabled');
        }

        const isSelected = this.isOptionSelected(option.value);
        if (isSelected) {
            optionEl.classList.add('wb-select-option-selected');
        }

        // 复选框（多选时）
        if (this.multiple) {
            const checkbox = document.createElement('span');
            checkbox.className = 'wb-select-option-checkbox';
            checkbox.innerHTML = isSelected ? '☑' : '☐';
            optionEl.appendChild(checkbox);
        }

        // 标签
        const label = document.createElement('span');
        label.className = 'wb-select-option-label';
        label.textContent = option.label;
        optionEl.appendChild(label);

        // 点击事件
        if (!option.disabled) {
            optionEl.addEventListener('click', () => {
                this.selectOption(option.value);
            });

            optionEl.addEventListener('mouseenter', () => {
                this.focusedIndex = index;
                this.updateFocusedOption();
            });
        }

        return optionEl;
    }

    /**
     * 检查选项是否被选中
     */
    isOptionSelected(value) {
        if (this.multiple) {
            return Array.isArray(this.value) && this.value.includes(value);
        }
        return this.value === value;
    }

    /**
     * 选择选项
     */
    selectOption(value) {
        if (this.multiple) {
            const currentValue = Array.isArray(this.value) ? [...this.value] : [];
            const index = currentValue.indexOf(value);
            
            if (index > -1) {
                currentValue.splice(index, 1);
            } else {
                currentValue.push(value);
            }
            
            this.value = currentValue;
        } else {
            this.value = value;
            this.close();
        }

        this.updateDisplay();
        this.updateDropdown();
        this.onChange(this.value);
    }

    /**
     * 取消选择选项
     */
    deselectOption(value) {
        if (!this.multiple) return;
        
        const currentValue = Array.isArray(this.value) ? [...this.value] : [];
        const index = currentValue.indexOf(value);
        
        if (index > -1) {
            currentValue.splice(index, 1);
            this.value = currentValue;
            this.updateDisplay();
            this.updateDropdown();
            this.onChange(this.value);
        }
    }

    /**
     * 获取选中的选项
     */
    getSelectedOption() {
        return this.options.find(opt => opt.value === this.value);
    }

    /**
     * 获取所有选中的选项（多选）
     */
    getSelectedOptions() {
        if (!Array.isArray(this.value)) return [];
        return this.options.filter(opt => this.value.includes(opt.value));
    }

    /**
     * 过滤选项
     */
    filterOptions() {
        if (!this.searchValue) {
            this.filteredOptions = [...this.options];
        } else {
            const searchLower = this.searchValue.toLowerCase();
            this.filteredOptions = this.options.filter(opt => {
                if (opt.children) {
                    const filteredChildren = opt.children.filter(child =>
                        child.label.toLowerCase().includes(searchLower)
                    );
                    return filteredChildren.length > 0;
                }
                return opt.label.toLowerCase().includes(searchLower);
            }).map(opt => {
                if (opt.children) {
                    return {
                        ...opt,
                        children: opt.children.filter(child =>
                            child.label.toLowerCase().includes(searchLower)
                        )
                    };
                }
                return opt;
            });
        }
    }

    /**
     * 更新显示
     */
    updateDisplay() {
        if (this.triggerElement) {
            const display = this.triggerElement.querySelector('.wb-select-display');
            if (display) {
                this.renderDisplay(display);
            }
        }
    }

    /**
     * 更新下拉列表
     */
    updateDropdown() {
        if (this.dropdownElement) {
            const optionsList = this.dropdownElement.querySelector('.wb-select-options');
            if (optionsList) {
                this.renderOptionsList(optionsList);
            }
        }
    }

    /**
     * 打开下拉列表
     */
    open() {
        if (this.disabled || this.isOpen) return;
        
        this.isOpen = true;
        
        if (!this.dropdownElement) {
            this.renderDropdown();
        }
        
        document.body.appendChild(this.dropdownElement);
        this.positionDropdown();
        
        this.triggerElement.classList.add('wb-select-open');
        
        if (this.searchable && this.searchInput) {
            setTimeout(() => this.searchInput.focus(), 50);
        }
        
        this.onOpen();
        
        // 滚动时重新定位
        this._scrollHandler = () => this.positionDropdown();
        window.addEventListener('scroll', this._scrollHandler, true);
        
        // 窗口大小改变时重新定位
        this._resizeHandler = () => this.positionDropdown();
        window.addEventListener('resize', this._resizeHandler);
    }

    /**
     * 关闭下拉列表
     */
    close() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        
        if (this.dropdownElement) {
            this.dropdownElement.remove();
        }
        
        if (this.triggerElement) {
            this.triggerElement.classList.remove('wb-select-open');
        }
        
        this.searchValue = '';
        this.filterOptions();
        
        this.onClose();
        
        // 移除事件监听
        if (this._scrollHandler) {
            window.removeEventListener('scroll', this._scrollHandler, true);
            this._scrollHandler = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
    }

    /**
     * 切换下拉列表
     */
    toggle() {
        return this.isOpen ? this.close() : this.open();
    }

    /**
     * 定位下拉列表
     */
    positionDropdown() {
        if (!this.dropdownElement || !this.triggerElement) return;
        
        const triggerRect = this.triggerElement.getBoundingClientRect();
        const dropdownHeight = this.dropdownElement.offsetHeight;
        const windowHeight = window.innerHeight;
        const spaceBelow = windowHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;
        
        // 判断下方空间是否足够
        const showBelow = spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove;
        
        this.dropdownElement.style.width = `${triggerRect.width}px`;
        this.dropdownElement.style.left = `${triggerRect.left}px`;
        
        if (showBelow) {
            this.dropdownElement.style.top = `${triggerRect.bottom}px`;
            this.dropdownElement.classList.remove('wb-select-dropdown-above');
        } else {
            this.dropdownElement.style.top = `${triggerRect.top - dropdownHeight}px`;
            this.dropdownElement.classList.add('wb-select-dropdown-above');
        }
    }

    /**
     * 清除选择
     */
    clear() {
        if (this.multiple) {
            this.value = [];
        } else {
            this.value = '';
        }
        this.updateDisplay();
        this.onClear();
        this.onChange(this.value);
    }

    /**
     * 设置值
     */
    setValue(value) {
        this.value = value;
        this.updateDisplay();
        return this;
    }

    /**
     * 获取值
     */
    getValue() {
        return this.value;
    }

    /**
     * 设置选项
     */
    setOptions(options) {
        this.options = options;
        this.filteredOptions = [...options];
        this.updateDropdown();
        return this;
    }

    /**
     * 销毁
     */
    destroy() {
        this.close();
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this.triggerElement = null;
        this.dropdownElement = null;
        this.searchInput = null;
    }
}

/**
 * 表格组件
 * 支持排序、分页、选择、操作列等功能
 */
export class Table {
    constructor(options = {}) {
        this.columns = options.columns || []; // {key, title, width, sortable, formatter, align}
        this.data = options.data || [];
        this.rowKey = options.rowKey || 'id';
        this.selectable = options.selectable || false; // 是否可选
        this.selectedRowKeys = options.selectedRowKeys || [];
        this.pagination = options.pagination !== false; // 是否分页
        this.pageSize = options.pageSize || 10;
        this.currentPage = options.currentPage || 1;
        this.emptyText = options.emptyText || '暂无数据';
        this.loading = options.loading || false;
        this.stripe = options.stripe !== false; // 斑马纹
        this.border = options.border || false;
        this.size = options.size || 'medium'; // small, medium, large
        this.className = options.className || '';
        this.rowClassName = options.rowClassName || (() => '');
        
        this.onSelectChange = options.onSelectChange || (() => {});
        this.onRowClick = options.onRowClick || (() => {});
        this.onRowDblClick = options.onRowDblClick || (() => {});
        this.onSort = options.onSort || (() => {});
        this.onPageChange = options.onPageChange || (() => {});
        
        this.element = null;
        this.sortKey = null;
        this.sortOrder = null; // 'asc' | 'desc'
    }

    /**
     * 渲染表格
     */
    render() {
        const wrapper = document.createElement('div');
        wrapper.className = [
            'wb-table-wrapper',
            this.loading ? 'wb-table-loading' : '',
            this.className
        ].filter(Boolean).join(' ');

        // 加载遮罩
        if (this.loading) {
            const loadingMask = document.createElement('div');
            loadingMask.className = 'wb-table-loading-mask';
            loadingMask.innerHTML = `
                <div class="wb-table-loading-spinner"></div>
                <div class="wb-table-loading-text">加载中...</div>
            `;
            wrapper.appendChild(loadingMask);
        }

        // 表格容器
        const tableContainer = document.createElement('div');
        tableContainer.className = 'wb-table-container';

        // 表格
        const table = document.createElement('table');
        table.className = [
            'wb-table',
            this.stripe ? 'wb-table-stripe' : '',
            this.border ? 'wb-table-border' : '',
            `wb-table-${this.size}`
        ].filter(Boolean).join(' ');

        // 表头
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // 选择列
        if (this.selectable) {
            const selectTh = document.createElement('th');
            selectTh.className = 'wb-table-selection';
            
            const allSelected = this.data.length > 0 && this.data.every(row => 
                this.selectedRowKeys.includes(row[this.rowKey])
            );
            const someSelected = this.data.some(row => 
                this.selectedRowKeys.includes(row[this.rowKey])
            ) && !allSelected;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = allSelected;
            checkbox.indeterminate = someSelected;
            checkbox.addEventListener('change', () => {
                if (allSelected) {
                    this.deselectAll();
                } else {
                    this.selectAll();
                }
            });
            
            selectTh.appendChild(checkbox);
            headerRow.appendChild(selectTh);
        }

        // 数据列
        this.columns.forEach(col => {
            const th = document.createElement('th');
            th.className = [
                'wb-table-cell',
                col.align ? `wb-table-cell-${col.align}` : '',
                col.sortable ? 'wb-table-cell-sortable' : ''
            ].filter(Boolean).join(' ');
            
            if (col.width) {
                th.style.width = col.width;
            }

            const cellContent = document.createElement('div');
            cellContent.className = 'wb-table-cell-content';
            cellContent.textContent = col.title;

            // 排序
            if (col.sortable) {
                const sortIcon = document.createElement('span');
                sortIcon.className = 'wb-table-sort-icon';
                
                if (this.sortKey === col.key) {
                    sortIcon.textContent = this.sortOrder === 'asc' ? '↑' : '↓';
                    th.classList.add(`wb-table-cell-sort-${this.sortOrder}`);
                } else {
                    sortIcon.textContent = '⇅';
                }

                cellContent.appendChild(sortIcon);

                th.addEventListener('click', () => {
                    this.handleSort(col.key);
                });
            }

            th.appendChild(cellContent);
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 表体
        const tbody = document.createElement('tbody');
        const displayData = this.getDisplayData();

        if (displayData.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = this.columns.length + (this.selectable ? 1 : 0);
            emptyCell.className = 'wb-table-empty';
            emptyCell.innerHTML = `
                <div class="wb-empty">
                    <div class="wb-empty-text">${this.emptyText}</div>
                </div>
            `;
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
        } else {
            displayData.forEach((row, index) => {
                const tr = document.createElement('tr');
                tr.className = [
                    'wb-table-row',
                    this.stripe && index % 2 === 1 ? 'wb-table-row-stripe' : '',
                    this.selectedRowKeys.includes(row[this.rowKey]) ? 'wb-table-row-selected' : '',
                    this.rowClassName(row, index)
                ].filter(Boolean).join(' ');

                tr.addEventListener('click', (e) => {
                    this.onRowClick(row, index, e);
                });

                tr.addEventListener('dblclick', (e) => {
                    this.onRowDblClick(row, index, e);
                });

                // 选择列
                if (this.selectable) {
                    const selectTd = document.createElement('td');
                    selectTd.className = 'wb-table-selection';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = this.selectedRowKeys.includes(row[this.rowKey]);
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                            this.selectRow(row[this.rowKey]);
                        } else {
                            this.deselectRow(row[this.rowKey]);
                        }
                    });
                    
                    selectTd.appendChild(checkbox);
                    tr.appendChild(selectTd);
                }

                // 数据列
                this.columns.forEach(col => {
                    const td = document.createElement('td');
                    td.className = [
                        'wb-table-cell',
                        col.align ? `wb-table-cell-${col.align}` : ''
                    ].filter(Boolean).join(' ');
                    
                    const cellContent = document.createElement('div');
                    cellContent.className = 'wb-table-cell-content';
                    
                    // 获取单元格值
                    let cellValue = row[col.key];
                    
                    // 格式化
                    if (col.formatter) {
                        cellValue = col.formatter(cellValue, row, col);
                    }
                    
                    if (cellValue !== undefined && cellValue !== null) {
                        if (typeof cellValue === 'string' || typeof cellValue === 'number') {
                            cellContent.textContent = cellValue;
                        } else if (cellValue instanceof HTMLElement) {
                            cellContent.appendChild(cellValue);
                        } else {
                            cellContent.innerHTML = String(cellValue);
                        }
                    }
                    
                    td.appendChild(cellContent);
                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });
        }

        table.appendChild(tbody);
        tableContainer.appendChild(table);
        wrapper.appendChild(tableContainer);

        // 分页
        if (this.pagination && this.getTotalPages() > 1) {
            const pagination = this.renderPagination();
            wrapper.appendChild(pagination);
        }

        this.element = wrapper;
        return wrapper;
    }

    /**
     * 获取显示数据（经过排序和分页）
     */
    getDisplayData() {
        let data = [...this.data];
        
        // 排序
        if (this.sortKey && this.sortOrder) {
            const sortColumn = this.columns.find(col => col.key === this.sortKey);
            data.sort((a, b) => {
                let aVal = a[this.sortKey];
                let bVal = b[this.sortKey];
                
                if (sortColumn && sortColumn.sorter) {
                    return sortColumn.sorter(aVal, bVal, a, b, this.sortOrder);
                }
                
                if (aVal === null || aVal === undefined) aVal = '';
                if (bVal === null || bVal === undefined) bVal = '';
                
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                
                if (aVal < bVal) return this.sortOrder === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        // 分页
        if (this.pagination) {
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            data = data.slice(start, end);
        }
        
        return data;
    }

    /**
     * 获取总页数
     */
    getTotalPages() {
        return Math.ceil(this.data.length / this.pageSize);
    }

    /**
     * 渲染分页
     */
    renderPagination() {
        const totalPages = this.getTotalPages();
        
        const pagination = document.createElement('div');
        pagination.className = 'wb-table-pagination';
        
        // 信息
        const info = document.createElement('span');
        info.className = 'wb-table-pagination-info';
        const start = (this.currentPage - 1) * this.pageSize + 1;
        const end = Math.min(this.currentPage * this.pageSize, this.data.length);
        info.textContent = `显示 ${start}-${end} 条，共 ${this.data.length} 条`;
        pagination.appendChild(info);
        
        // 页码
        const pages = document.createElement('div');
        pages.className = 'wb-table-pagination-pages';
        
        // 上一页
        const prevBtn = document.createElement('button');
        prevBtn.className = 'wb-table-pagination-btn';
        prevBtn.innerHTML = '◀';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        pages.appendChild(prevBtn);
        
        // 页码按钮
        const pageRange = this.getPageRange(totalPages);
        
        if (pageRange.start > 1) {
            pages.appendChild(this.createPageBtn(1));
            if (pageRange.start > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'wb-table-pagination-ellipsis';
                ellipsis.textContent = '...';
                pages.appendChild(ellipsis);
            }
        }
        
        for (let i = pageRange.start; i <= pageRange.end; i++) {
            pages.appendChild(this.createPageBtn(i));
        }
        
        if (pageRange.end < totalPages) {
            if (pageRange.end < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'wb-table-pagination-ellipsis';
                ellipsis.textContent = '...';
                pages.appendChild(ellipsis);
            }
            pages.appendChild(this.createPageBtn(totalPages));
        }
        
        // 下一页
        const nextBtn = document.createElement('button');
        nextBtn.className = 'wb-table-pagination-btn';
        nextBtn.innerHTML = '▶';
        nextBtn.disabled = this.currentPage === totalPages;
        nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        pages.appendChild(nextBtn);
        
        pagination.appendChild(pages);
        
        return pagination;
    }

    /**
     * 创建页码按钮
     */
    createPageBtn(page) {
        const btn = document.createElement('button');
        btn.className = [
            'wb-table-pagination-btn',
            'wb-table-pagination-page',
            page === this.currentPage ? 'wb-table-pagination-active' : ''
        ].filter(Boolean).join(' ');
        btn.textContent = page;
        btn.addEventListener('click', () => this.goToPage(page));
        return btn;
    }

    /**
     * 获取页码范围
     */
    getPageRange(totalPages) {
        const maxVisible = 7;
        let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        return { start, end };
    }

    /**
     * 跳转到指定页
     */
    goToPage(page) {
        const totalPages = this.getTotalPages();
        if (page < 1 || page > totalPages) return;
        
        this.currentPage = page;
        this.onPageChange(page);
        this.refresh();
    }

    /**
     * 处理排序
     */
    handleSort(key) {
        if (this.sortKey === key) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : (this.sortOrder === 'desc' ? null : 'asc');
            if (!this.sortOrder) {
                this.sortKey = null;
            }
        } else {
            this.sortKey = key;
            this.sortOrder = 'asc';
        }
        
        this.onSort(this.sortKey, this.sortOrder);
        this.refresh();
    }

    /**
     * 选择行
     */
    selectRow(rowKey) {
        if (!this.selectedRowKeys.includes(rowKey)) {
            this.selectedRowKeys.push(rowKey);
            this.onSelectChange([...this.selectedRowKeys]);
            this.refresh();
        }
    }

    /**
     * 取消选择行
     */
    deselectRow(rowKey) {
        const idx = this.selectedRowKeys.indexOf(rowKey);
        if (idx > -1) {
            this.selectedRowKeys.splice(idx, 1);
            this.onSelectChange([...this.selectedRowKeys]);
            this.refresh();
        }
    }

    /**
     * 全选
     */
    selectAll() {
        this.selectedRowKeys = this.data.map(row => row[this.rowKey]);
        this.onSelectChange([...this.selectedRowKeys]);
        this.refresh();
    }

    /**
     * 取消全选
     */
    deselectAll() {
        this.selectedRowKeys = [];
        this.onSelectChange([]);
        this.refresh();
    }

    /**
     * 刷新表格
     */
    refresh() {
        if (this.element) {
            this.element.innerHTML = '';
            this.render();
            this.element.parentNode.replaceChild(this.element, this.element);
        }
    }

    /**
     * 设置数据
     */
    setData(data) {
        this.data = data;
        this.currentPage = 1;
        this.refresh();
        return this;
    }

    /**
     * 设置加载状态
     */
    setLoading(loading) {
        this.loading = loading;
        this.refresh();
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
    }
}

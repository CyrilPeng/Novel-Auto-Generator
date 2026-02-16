// epubToTxt.js - EPUB转TXT模块（支持批量导入+手机拖拽排序）

(function() {
    'use strict';

    let epubFiles = [];

    // ============================================
    // 动态加载 JSZip 库
    // ============================================
    async function loadJSZip() {
        if (window.JSZip) return window.JSZip;
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve(window.JSZip);
            script.onerror = () => reject(new Error('JSZip库加载失败'));
            document.head.appendChild(script);
        });
    }

    // ============================================
    // HTML转纯文本
    // ============================================
    function htmlToText(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        if (!doc.body) return '';
        
        doc.querySelectorAll('script, style').forEach(el => el.remove());
        
        doc.querySelectorAll('br').forEach(el => {
            el.replaceWith('\n');
        });
        
        const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                          'li', 'tr', 'blockquote', 'section', 'article'];
        
        blockTags.forEach(tag => {
            doc.querySelectorAll(tag).forEach(el => {
                el.innerHTML = el.innerHTML + '\n';
            });
        });
        
        let text = doc.body.textContent || '';
        
        text = text
            .replace(/[ \t]+/g, ' ')
            .replace(/ \n/g, '\n')
            .replace(/\n /g, '\n')
            .replace(/\n{2,}/g, '\n')
            .replace(/^\s+/, '')
            .replace(/\s+$/, '');
        
        return text;
    }

    // ============================================
    // 解析单个EPUB文件
    // ============================================
    async function parseEpub(arrayBuffer) {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const parser = new DOMParser();
        
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) {
            throw new Error('无效的EPUB文件');
        }
        
        const containerXml = await containerFile.async('string');
        const containerDoc = parser.parseFromString(containerXml, 'text/xml');
        const rootfile = containerDoc.querySelector('rootfile');
        if (!rootfile) {
            throw new Error('无效的EPUB文件');
        }
        const opfPath = rootfile.getAttribute('full-path');
        
        const opfFile = zip.file(opfPath);
        if (!opfFile) {
            throw new Error('无效的EPUB文件');
        }
        
        const opfContent = await opfFile.async('string');
        const opfDoc = parser.parseFromString(opfContent, 'application/xml');
        
        const titleEl = opfDoc.querySelector('metadata title, dc\\:title');
        const bookTitle = titleEl ? titleEl.textContent.trim() : '';
        
        const manifest = {};
        opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = {
                href: item.getAttribute('href'),
                mediaType: item.getAttribute('media-type')
            };
        });
        
        const basePath = opfPath.includes('/') 
            ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) 
            : '';
        
        const chapters = [];
        const spineItems = opfDoc.querySelectorAll('spine itemref');
        
        for (const ref of spineItems) {
            const idref = ref.getAttribute('idref');
            const item = manifest[idref];
            if (!item) continue;
            
            if (!item.mediaType || !item.mediaType.includes('html')) continue;
            
            const filePath = basePath + item.href;
            const file = zip.file(filePath);
            if (!file) continue;
            
            try {
                const html = await file.async('string');
                const text = htmlToText(html);
                
                if (text && text.trim().length > 0) {
                    chapters.push(text.trim());
                }
            } catch (e) {
                console.warn('[EpubToTxt] 跳过文件:', filePath);
            }
        }
        
        return {
            title: bookTitle,
            content: chapters.join('\n')
        };
    }

    // ============================================
    // 创建弹窗UI
    // ============================================
    function createModal() {
        $('#epub-to-txt-modal').remove();
        
        const modalHtml = `
        <div id="epub-to-txt-modal" style="
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.75);
            z-index: 99999;
            overflow-y: auto;
        ">
            <div style="
                display: flex;
                justify-content: center;
                align-items: flex-start;
                min-height: 100%;
                padding: 20px;
                box-sizing: border-box;
            ">
                <div style="
                    background: var(--SmartThemeBlurTintColor, #1a1a2e);
                    border: 1px solid var(--SmartThemeBorderColor, #444);
                    border-radius: 12px;
                    padding: 20px;
                    width: 100%;
                    max-width: 500px;
                    color: var(--SmartThemeBodyColor, #fff);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    margin: 20px 0;
                ">
                    <h3 style="margin: 0 0 15px 0; text-align: center; font-size: 18px;">
                        📖 EPUB批量转TXT
                    </h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <input type="file" id="epub-file-input" accept=".epub" multiple style="display: none;">
                        <button id="epub-select-btn" class="menu_button" style="
                            background: linear-gradient(135deg, #9b59b6, #8e44ad) !important;
                            padding: 12px 20px !important;
                            font-size: 15px !important;
                            border-radius: 8px !important;
                            width: 100%;
                        ">
                            📁 选择EPUB文件（可多选）
                        </button>
                        
                        <div id="epub-file-list" style="
                            min-height: 80px;
                            max-height: 350px;
                            overflow-y: auto;
                            border: 1px dashed #666;
                            border-radius: 8px;
                            padding: 8px;
                        ">
                            <div id="epub-empty-tip" style="
                                text-align: center;
                                color: #888;
                                padding: 25px 10px;
                                font-size: 14px;
                            ">
                                请选择EPUB文件<br>
                                <small>用↑↓按钮调整顺序</small>
                            </div>
                        </div>
                        
                        <!-- 排序按钮组 -->
                        <div id="epub-sort-btns" style="display: flex; gap: 8px;">
                            <button id="epub-sort-name-asc" class="menu_button" style="
                                background: #3498db !important;
                                padding: 8px 12px !important;
                                flex: 1;
                                font-size: 13px !important;
                            ">
                                🔤 名称排序 ↑
                            </button>
                            <button id="epub-sort-name-desc" class="menu_button" style="
                                background: #2980b9 !important;
                                padding: 8px 12px !important;
                                flex: 1;
                                font-size: 13px !important;
                            ">
                                🔤 名称排序 ↓
                            </button>
                        </div>
                        
                        <div id="epub-progress" style="
                            display: none;
                            text-align: center;
                            padding: 10px;
                            background: rgba(155, 89, 182, 0.2);
                            border-radius: 8px;
                        ">
                            <span id="epub-progress-text">⏳ 正在处理...</span>
                        </div>
                        
                        <!-- 操作按钮组 -->
                        <div style="display: flex; gap: 10px;">
                            <button id="epub-clear-btn" class="menu_button" style="
                                background: #c0392b !important;
                                padding: 10px 15px !important;
                                flex: 1;
                                font-size: 14px !important;
                            ">
                                🗑️ 清空
                            </button>
                            <button id="epub-convert-btn" class="menu_button" style="
                                background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
                                padding: 10px 15px !important;
                                flex: 2;
                                font-size: 14px !important;
                            ">
                                ✨ 生成TXT
                            </button>
                        </div>
                        
                        <!-- 关闭按钮单独一行 -->
                        <button id="epub-close-btn" class="menu_button" style="
                            background: #555 !important;
                            padding: 10px 15px !important;
                            font-size: 14px !important;
                            width: 100%;
                        ">
                            ✖ 关闭
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            .epub-file-item {
                display: flex;
                align-items: center;
                padding: 8px;
                margin: 4px 0;
                background: rgba(255,255,255,0.1);
                border-radius: 6px;
                gap: 6px;
            }
            .epub-file-item .file-index {
                min-width: 22px;
                height: 22px;
                background: #9b59b6;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                flex-shrink: 0;
            }
            .epub-file-item .file-name {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 13px;
                min-width: 0;
            }
            .epub-file-item .move-btns {
                display: flex;
                flex-direction: column;
                gap: 2px;
                flex-shrink: 0;
            }
            .epub-file-item .move-btn {
                background: #555;
                border: none;
                color: #fff;
                width: 26px;
                height: 20px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .epub-file-item .move-btn:active {
                background: #9b59b6;
            }
            .epub-file-item .remove-btn {
                background: transparent;
                border: none;
                color: #e74c3c;
                cursor: pointer;
                padding: 5px 8px;
                font-size: 16px;
                flex-shrink: 0;
            }
        </style>`;
        
        $('body').append(modalHtml);
        bindModalEvents();
    }

    // ============================================
    // 绑定弹窗事件
    // ============================================
    function bindModalEvents() {
        $('#epub-select-btn').on('click', () => {
            $('#epub-file-input').trigger('click');
        });
        
        $('#epub-file-input').on('change', handleFileSelect);
        $('#epub-clear-btn').on('click', clearFiles);
        $('#epub-convert-btn').on('click', convertAll);
        $('#epub-close-btn').on('click', closeModal);
        
        // 排序按钮事件
        $('#epub-sort-name-asc').on('click', () => sortByName('asc'));
        $('#epub-sort-name-desc').on('click', () => sortByName('desc'));
        
        $('#epub-to-txt-modal').on('click', (e) => {
            if (e.target.id === 'epub-to-txt-modal') {
                closeModal();
            }
        });
    }

    // ============================================
    // 按名称排序
    // ============================================
    function sortByName(order = 'asc') {
        if (epubFiles.length < 2) {
            toastr.info('至少需要2个文件才能排序');
            return;
        }
        
        epubFiles.sort((a, b) => {
            // 优先使用书名，没有则使用文件名
            const nameA = (a.title || a.fileName).toLowerCase();
            const nameB = (b.title || b.fileName).toLowerCase();
            
            // 自然排序（处理数字）
            return naturalCompare(nameA, nameB) * (order === 'asc' ? 1 : -1);
        });
        
        renderFileList();
        toastr.success(order === 'asc' ? '已按名称升序排列' : '已按名称降序排列');
    }

    // ============================================
    // 自然排序比较函数（正确处理数字）
    // ============================================
    function naturalCompare(a, b) {
        const ax = [], bx = [];
        
        a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 || Infinity, $2 || '']) });
        b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 || Infinity, $2 || '']) });
        
        while (ax.length && bx.length) {
            const an = ax.shift();
            const bn = bx.shift();
            const nn = (parseInt(an[0]) - parseInt(bn[0])) || an[1].localeCompare(bn[1]);
            if (nn) return nn;
        }
        
        return ax.length - bx.length;
    }

    // ============================================
    // 文件选择处理
    // ============================================
    async function handleFileSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        
        $('#epub-progress').show();
        $('#epub-progress-text').text(`⏳ 正在解析 0/${files.length}...`);
        
        let successCount = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            $('#epub-progress-text').text(`⏳ 正在解析 ${i + 1}/${files.length}...`);
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await parseEpub(arrayBuffer);
                
                epubFiles.push({
                    id: Date.now() + Math.random(),
                    fileName: file.name,
                    title: result.title || file.name.replace(/\.epub$/i, ''),
                    content: result.content
                });
                successCount++;
            } catch (e) {
                console.error('[EpubToTxt] 解析失败:', file.name, e);
                toastr.error(`解析失败: ${file.name}`);
            }
        }
        
        $('#epub-progress').hide();
        $('#epub-file-input').val('');
        renderFileList();
        
        if (successCount > 0) {
            toastr.success(`已添加 ${successCount} 个文件`);
        }
    }

    // ============================================
    // 渲染文件列表
    // ============================================
    function renderFileList() {
        const listEl = $('#epub-file-list');
        
        if (epubFiles.length === 0) {
            listEl.html(`
                <div id="epub-empty-tip" style="
                    text-align: center;
                    color: #888;
                    padding: 25px 10px;
                    font-size: 14px;
                ">
                    请选择EPUB文件<br>
                    <small>用↑↓按钮调整顺序</small>
                </div>
            `);
            return;
        }
        
        let html = '';
        epubFiles.forEach((file, index) => {
            html += `
                <div class="epub-file-item" data-id="${file.id}">
                    <span class="file-index">${index + 1}</span>
                    <span class="file-name" title="${file.fileName}">${file.title || file.fileName}</span>
                    <div class="move-btns">
                        <button class="move-btn move-up" data-id="${file.id}" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
                        <button class="move-btn move-down" data-id="${file.id}" ${index === epubFiles.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
                    </div>
                    <button class="remove-btn" data-id="${file.id}">✕</button>
                </div>
            `;
        });
        
        listEl.html(html);
        
        // 绑定删除按钮
        listEl.find('.remove-btn').on('click', function(e) {
            e.stopPropagation();
            const id = parseFloat($(this).data('id'));
            epubFiles = epubFiles.filter(f => f.id !== id);
            renderFileList();
        });
        
        // 绑定上移按钮
        listEl.find('.move-up').on('click', function(e) {
            e.stopPropagation();
            const id = parseFloat($(this).data('id'));
            moveFile(id, -1);
        });
        
        // 绑定下移按钮
        listEl.find('.move-down').on('click', function(e) {
            e.stopPropagation();
            const id = parseFloat($(this).data('id'));
            moveFile(id, 1);
        });
    }

    // ============================================
    // 移动文件位置
    // ============================================
    function moveFile(id, direction) {
        const index = epubFiles.findIndex(f => f.id === id);
        if (index === -1) return;
        
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= epubFiles.length) return;
        
        // 交换位置
        const temp = epubFiles[index];
        epubFiles[index] = epubFiles[newIndex];
        epubFiles[newIndex] = temp;
        
        renderFileList();
    }

    // ============================================
    // 清空文件
    // ============================================
    function clearFiles() {
        epubFiles = [];
        renderFileList();
        toastr.info('已清空文件列表');
    }

    // ============================================
    // 合并转换
    // ============================================
    function convertAll() {
        if (epubFiles.length === 0) {
            toastr.warning('请先选择EPUB文件');
            return;
        }
        
        // 每个文件内容开头加上文件名标题
        const allContent = epubFiles.map((f, index) => {
            const title = f.title || f.fileName.replace(/\.epub$/i, '');
            const separator = '═'.repeat(40);
            const header = `${separator}\n【${index + 1}】${title}\n${separator}\n`;
            return header + f.content.trim().replace(/\n{2,}/g, '\n');
        }).join('\n');
        
        // 文件名：第一个文件名 + 合并数量
        const firstName = epubFiles[0].fileName.replace(/\.epub$/i, '');
        let fileName;
        if (epubFiles.length === 1) {
            fileName = `${firstName}.txt`;
        } else {
            fileName = `${firstName}_合并${epubFiles.length}本.txt`;
        }
        
        const blob = new Blob([allContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toastr.success(`已生成: ${fileName}`);
    }

    // ============================================
    // 打开/关闭弹窗
    // ============================================
    function openModal() {
        if ($('#epub-to-txt-modal').length === 0) {
            createModal();
        }
        $('#epub-progress').hide();
        $('#epub-to-txt-modal').css('display', 'block');
        $('body').css('overflow', 'hidden');
        renderFileList();
    }

    function closeModal() {
        $('#epub-to-txt-modal').hide();
        $('body').css('overflow', '');
    }

    // ============================================
    // 暴露到全局
    // ============================================
    window.EpubToTxt = {
        open: openModal,
        close: closeModal,
        parseEpub: parseEpub,
        sortByName: sortByName
    };

    console.log('[EpubToTxt] 📖 EPUB批量转TXT模块已加载');

})();

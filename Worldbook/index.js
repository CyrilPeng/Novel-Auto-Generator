/**
 * 世界书模块入口文件
 * 整合所有子模块，提供统一的API
 */
import { WorldbookProcessor, Config, State } from './core/index.js';
import { db } from './db/index.js';
import { TavernExporter, JSONExporter, TXTExporter } from './exporters/index.js';

// 模块实例
let processor = null;
let isInitialized = false;

/**
 * 初始化模块
 * 创建处理器实例
 */
function init() {
    if (isInitialized) return;
    
    processor = new WorldbookProcessor();
    isInitialized = true;
    
    console.log('[世界书模块] 初始化完成');
}

/**
 * 获取处理器实例
 * @returns {WorldbookProcessor} 处理器实例
 */
function getProcessor() {
    if (!isInitialized) init();
    return processor;
}

/**
 * 打开世界书模块界面
 */
function open() {
    if (!isInitialized) init();
    
    // 触发打开事件
    if (processor) {
        processor.emit('ui.open');
    }
    
    console.log('[世界书模块] 界面已打开');
}

/**
 * 关闭世界书模块界面
 */
function close() {
    if (processor) {
        processor.emit('ui.close');
    }
    
    console.log('[世界书模块] 界面已关闭');
}

/**
 * 创建UI面板并插入到SillyTavern
 */
function createPanel() {
    if (!isInitialized) init();
    
    // 检查是否已经创建
    if (document.getElementById('worldbook-module-panel')) {
        return;
    }
    
    // 创建面板HTML
    const panelHtml = `
        <div id="worldbook-module-panel" class="worldbook-panel">
            <div class="worldbook-panel-header">
                <span class="worldbook-panel-title">📚 TXT转世界书</span>
                <button id="wb-panel-close" class="worldbook-close-btn">✕</button>
            </div>
            <div class="worldbook-panel-body">
                <div class="worldbook-section">
                    <h4>文件导入</h4>
                    <input type="file" id="wb-file-input" accept=".txt" style="display:none">
                    <button id="wb-select-file" class="menu_button">选择TXT文件</button>
                    <div id="wb-file-info"></div>
                </div>
                
                <div class="worldbook-section">
                    <h4>处理控制</h4>
                    <div class="worldbook-progress">
                        <div class="worldbook-progress-bar">
                            <div id="wb-progress-fill" class="worldbook-progress-fill"></div>
                        </div>
                        <div id="wb-progress-text">0 / 0 (0%)</div>
                    </div>
                    <div class="worldbook-controls">
                        <button id="wb-start" class="menu_button">开始</button>
                        <button id="wb-pause" class="menu_button" disabled>暂停</button>
                        <button id="wb-stop" class="menu_button" disabled>停止</button>
                    </div>
                </div>
                
                <div class="worldbook-section">
                    <h4>导出</h4>
                    <button id="wb-export-tavern" class="menu_button">导出为酒馆格式</button>
                    <button id="wb-export-json" class="menu_button">导出为JSON</button>
                    <button id="wb-export-txt" class="menu_button">导出为TXT</button>
                </div>
            </div>
        </div>
    `;
    
    // 插入到扩展面板
    const extensionsPanel = document.getElementById('extensions_settings');
    if (extensionsPanel) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = panelHtml;
        extensionsPanel.appendChild(wrapper.firstElementChild);
        
        // 绑定事件
        bindPanelEvents();
    }
}

/**
 * 绑定面板事件
 */
function bindPanelEvents() {
    const fileInput = document.getElementById('wb-file-input');
    const selectBtn = document.getElementById('wb-select-file');
    const startBtn = document.getElementById('wb-start');
    const pauseBtn = document.getElementById('wb-pause');
    const stopBtn = document.getElementById('wb-stop');
    const closeBtn = document.getElementById('wb-panel-close');
    
    if (selectBtn) {
        selectBtn.addEventListener('click', () => fileInput?.click());
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (startBtn) {
        startBtn.addEventListener('click', startProcessing);
    }
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', togglePause);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', stopProcessing);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', close);
    }
    
    // 导出按钮
    document.getElementById('wb-export-tavern')?.addEventListener('click', () => exportWorldbook('tavern'));
    document.getElementById('wb-export-json')?.addEventListener('click', () => exportWorldbook('json'));
    document.getElementById('wb-export-txt')?.addEventListener('click', () => exportWorldbook('txt'));
}

/**
 * 处理文件选择
 * @param {Event} event - 文件选择事件
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const processor = getProcessor();
    processor.state.currentFile = file;
    
    // 读取文件
    const text = await file.text();
    processor.state.currentFileHash = await calculateSimpleHash(text);
    
    // 分割内容
    const chunks = splitContent(text);
    processor.state.memoryQueue = chunks;
    
    // 更新UI
    updateFileInfo(file.name, chunks.length);
    updateProgress(0, chunks.length);
    
    console.log(`[世界书模块] 已加载文件: ${file.name}, 共${chunks.length}块`);
}

/**
 * 开始处理
 */
async function startProcessing() {
    const processor = getProcessor();
    
    if (processor.state.memoryQueue.length === 0) {
        alert('请先选择文件');
        return;
    }
    
    // 更新按钮状态
    document.getElementById('wb-start').disabled = true;
    document.getElementById('wb-pause').disabled = false;
    document.getElementById('wb-stop').disabled = false;
    
    // 监听进度
    processor.on('progress', (progress) => {
        updateProgress(progress.current, progress.total);
    });
    
    processor.on('complete', () => {
        document.getElementById('wb-start').disabled = false;
        document.getElementById('wb-pause').disabled = true;
        document.getElementById('wb-stop').disabled = true;
        alert('处理完成！');
    });
    
    // 开始处理
    await processor.process(processor.state.memoryQueue);
}

/**
 * 暂停/恢复处理
 */
function togglePause() {
    const processor = getProcessor();
    const btn = document.getElementById('wb-pause');
    
    if (processor.state.isPaused) {
        processor.resume();
        btn.textContent = '暂停';
    } else {
        processor.pause();
        btn.textContent = '恢复';
    }
}

/**
 * 停止处理
 */
function stopProcessing() {
    const processor = getProcessor();
    processor.stop();
    
    document.getElementById('wb-start').disabled = false;
    document.getElementById('wb-pause').disabled = true;
    document.getElementById('wb-stop').disabled = true;
}

/**
 * 导出世界书
 * @param {string} format - 导出格式
 */
function exportWorldbook(format) {
    const processor = getProcessor();
    
    if (!processor.state.generatedWorldbook || 
        Object.keys(processor.state.generatedWorldbook).length === 0) {
        alert('没有可导出的数据');
        return;
    }
    
    processor.export(format, { filename: `worldbook_${Date.now()}` });
}

/**
 * 更新文件信息
 * @param {string} filename - 文件名
 * @param {number} chunkCount - 块数
 */
function updateFileInfo(filename, chunkCount) {
    const infoEl = document.getElementById('wb-file-info');
    if (infoEl) {
        infoEl.innerHTML = `<p>文件名: ${filename}</p><p>分块数: ${chunkCount}</p>`;
    }
}

/**
 * 更新进度显示
 * @param {number} current - 当前进度
 * @param {number} total - 总数
 */
function updateProgress(current, total) {
    const fillEl = document.getElementById('wb-progress-fill');
    const textEl = document.getElementById('wb-progress-text');
    
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    
    if (fillEl) {
        fillEl.style.width = `${percentage}%`;
    }
    if (textEl) {
        textEl.textContent = `${current} / ${total} (${percentage}%)`;
    }
}

/**
 * 简单哈希计算
 * @param {string} content - 内容
 * @returns {string} 哈希值
 */
function calculateSimpleHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

/**
 * 分割内容
 * @param {string} content - 内容
 * @returns {Array} 内容块数组
 */
function splitContent(content) {
    const chunkSize = 15000;
    const chunks = [];
    
    // 按章节分割
    const chapterRegex = /第[零一二三四五六七八九十百千万0-9]+[章回卷节部篇][^\n]*\n/g;
    const chapters = content.split(chapterRegex);
    const titles = content.match(chapterRegex) || [];
    
    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i].trim();
        if (chapter.length > 100) {
            chunks.push({
                title: titles[i] || `第${i + 1}部分`,
                content: chapter
            });
        }
    }
    
    // 如果没有章节，按字数分割
    if (chunks.length === 0) {
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push({
                title: `第${Math.floor(i / chunkSize) + 1}块`,
                content: content.slice(i, i + chunkSize)
            });
        }
    }
    
    return chunks;
}

// 公开API
export {
    init,
    open,
    close,
    createPanel,
    getProcessor,
    WorldbookProcessor,
    Config,
    State,
    TavernExporter,
    JSONExporter,
    TXTExporter
};

// 全局暴露
window.WorldbookModule = {
    init,
    open,
    close,
    createPanel,
    getProcessor,
    version: '2.0.0'
};

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createPanel();
    });
} else {
    createPanel();
}

console.log('[世界书模块] 已加载');

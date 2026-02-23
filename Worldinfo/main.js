/**
 * Worldinfo 模块主入口
 * 用于在 SillyTavern 中注册和启动 Worldinfo 应用
 */

import { createWorldinfoApp, WorldinfoApp } from './app.js';

// 全局状态
let appInstance = null;
let isLoaded = false;

/**
 * 初始化 Worldinfo 模块
 */
export async function initWorldinfo() {
    if (isLoaded) {
        console.log('[Worldinfo] 模块已加载，跳过初始化');
        return appInstance;
    }

    console.log('[Worldinfo] 开始初始化...');

    try {
        // 加载样式
        loadStyles();

        // 创建容器
        createContainer();

        // 创建应用实例
        appInstance = createWorldinfoApp({
            containerId: 'worldinfo-app-container',
            debugMode: false,
            autoSave: true,
            autoSaveInterval: 5
        });

        await appInstance.init();

        // 注册到全局
        window.WorldinfoApp = appInstance;
        window.WorldinfoModule = {
            init: initWorldinfo,
            open: openWorldinfo,
            close: closeWorldinfo,
            getApp: getWorldinfoApp,
            destroy: destroyWorldinfo,
            version: '3.0.0'
        };

        isLoaded = true;
        console.log('[Worldinfo] 初始化完成');

        return appInstance;

    } catch (error) {
        console.error('[Worldinfo] 初始化失败:', error);
        throw error;
    }
}

/**
 * 创建容器
 */
function createContainer() {
    let container = document.getElementById('worldinfo-app-container');
    if (container) return;

    container = document.createElement('div');
    container.id = 'worldinfo-app-container';
    // 初始隐藏，由面板控制显示
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '99998';
    container.style.pointerEvents = 'none';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    // 初始不显示背景遮罩，由面板的 show 方法控制
    container.style.background = 'transparent';
    container.style.transition = 'background 0.2s ease';
    
    // 阻止容器点击事件冒泡到 SillyTavern 背景
    container.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    container.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    container.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    });
    
    document.body.appendChild(container);
}

/**
 * 加载样式
 */
function loadStyles() {
    // 获取扩展基础路径
    const basePath = getBasePath();
    
    const styles = [
        basePath + 'Worldinfo/styles/index.css'
    ];

    for (const style of styles) {
        if (!document.querySelector(`link[href="${style}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = style;
            document.head.appendChild(link);
        }
    }
}

/**
 * 获取扩展基础路径
 */
function getBasePath() {
    try {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('Novel-Auto-Generator')) {
                const path = script.src.substring(0, script.src.lastIndexOf('/') + 1);
                // 如果是完整 URL，转换为相对路径
                if (path.startsWith('http')) {
                    const url = new URL(path);
                    return url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1);
                }
                return path;
            }
        }
    } catch (e) {}
    return '/scripts/extensions/third-party/Novel-Auto-Generator/';
}

/**
 * 打开 Worldinfo 主界面
 */
export async function openWorldinfo() {
    console.log('[Worldinfo] openWorldinfo called');
    if (!appInstance) {
        console.log('[Worldinfo] appInstance not set, initializing...');
        appInstance = await initWorldinfo();
    }

    console.log('[Worldinfo] appInstance.txtToWorldbookPanel:', appInstance?.txtToWorldbookPanel);
    
    // 直接显示面板
    appInstance?.txtToWorldbookPanel?.show();
    console.log('[Worldinfo] show() called');
}

/**
 * 关闭 Worldinfo 主界面
 */
export function closeWorldinfo() {
    appInstance?.txtToWorldbookPanel?.hide();
}

/**
 * 获取应用实例
 */
export function getWorldinfoApp() {
    return appInstance;
}

/**
 * 销毁模块
 */
export function destroyWorldinfo() {
    appInstance?.destroy();
    appInstance = null;
    isLoaded = false;
    console.log('[Worldinfo] 模块已销毁');
}

// 自动初始化
if (typeof window !== 'undefined') {
    console.log('[Worldinfo] 模块已加载，等待初始化...');
}

console.log('[Worldinfo] 入口模块已加载');

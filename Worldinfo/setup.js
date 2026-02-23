/**
 * Worldinfo 模块 - SillyTavern 自定义 JS 配置
 * 
 * 使用方法：
 * 1. 打开 SillyTavern
 * 2. 进入 设置 → 扩展 → 自定义 JS
 * 3. 复制粘贴以下代码
 * 4. 保存并刷新页面 (Ctrl+F5)
 */

(async function loadWorldinfoModule() {
    try {
        const mainModule = await import('./extensions/Novel-Auto-Generator/Worldinfo/main.js');
        
        window.initWorldinfo = mainModule.initWorldinfo;
        window.openWorldinfo = mainModule.openWorldinfo;
        window.closeWorldinfo = mainModule.closeWorldinfo;
        window.getWorldinfoApp = mainModule.getWorldinfoApp;
        
        window.WorldinfoModule = {
            init: mainModule.initWorldinfo,
            open: mainModule.openWorldinfo,
            close: mainModule.closeWorldinfo,
            getApp: mainModule.getWorldinfoApp,
            version: '3.0.0'
        };
        
        $(document).on('click', '#nag-btn-txt-to-worldbook', async function() {
            try {
                if (typeof window.WorldinfoModule !== 'undefined') {
                    await window.WorldinfoModule.init();
                    window.WorldinfoModule.open();
                } else {
                    toastr.error('Worldinfo 模块未加载');
                }
            } catch (error) {
                toastr.error('打开失败：' + error.message);
            }
        });
        
        console.log('[Worldinfo] 模块加载成功');
    } catch (error) {
        console.error('[Worldinfo] 加载失败:', error);
    }
})();

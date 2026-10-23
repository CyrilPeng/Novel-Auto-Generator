export function createWorldbookHelpers({ AppState, getCategoryLightService, getEntryConfigService, saveSettings }) {
    function updateStreamContent(content, clear = false) {
        if (clear) {
            AppState.processing.streamContent = '';
        } else {
            AppState.processing.streamContent = (AppState.processing.streamContent + content).slice(-200000);
        }
        const streamEl = document.getElementById('ttw-stream-content');
        if (streamEl) {
            streamEl.textContent = AppState.processing.streamContent;
            streamEl.scrollTop = streamEl.scrollHeight;
        }
    }

    // 调试模式日志 - 带时间戳输出到实时输出面板
    function debugLog(msg) {
        if (!AppState.settings.debugMode) return;
        const now = new Date();
        const ts =
            now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
            '.' +
            String(now.getMilliseconds()).padStart(3, '0');
        updateStreamContent(`[${ts}] 🔍 ${msg}\n`);
    }

    // ========== 分类灯状态管理 ==========
    function getCategoryLightState(category) {
        if (Object.hasOwn(AppState.config.categoryLight, category)) {
            return AppState.config.categoryLight[category];
        }
        return false;
    }

    function setCategoryLightState(category, isGreen) {
        AppState.config.categoryLight[category] = isGreen;
        saveCategoryLightSettings();
    }

    function saveCategoryLightSettings() {
        if (!getCategoryLightService()) return;
        getCategoryLightService().saveCategoryLightSettings();
    }

    function loadCategoryLightSettings() {
        if (!getCategoryLightService()) return;
        getCategoryLightService().loadCategoryLightSettings();
    }

    // ========== 条目位置/深度/顺序配置管理 ==========
    function getEntryConfig(category, entryName) {
        if (getEntryConfigService()) return getEntryConfigService().getEntryConfig(category, entryName);
        const key = `${category}::${entryName}`;
        if (AppState.config.entryPosition[key]) {
            return AppState.config.entryPosition[key];
        }
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return {
                position: AppState.config.plotOutline.position || 0,
                depth: AppState.config.plotOutline.depth || 4,
                order: AppState.config.plotOutline.order || 100,
                autoIncrementOrder: AppState.config.plotOutline.autoIncrementOrder || false,
            };
        }
        // 优先从分类配置获取
        if (AppState.config.categoryDefault[category]) {
            return { ...AppState.config.categoryDefault[category] };
        }
        // 从自定义分类获取默认配置
        const catConfig = AppState.persistent.customCategories.find((c) => c.name === category);
        if (catConfig) {
            return {
                position: catConfig.defaultPosition || 0,
                depth: catConfig.defaultDepth || 4,
                order: catConfig.defaultOrder || 100,
                autoIncrementOrder: catConfig.autoIncrementOrder || false,
            };
        }
        return { position: 0, depth: 4, order: 100, autoIncrementOrder: false };
    }

    // 新增：获取分类是否自动递增顺序
    // 获取分类是否自动递增顺序
    function getCategoryAutoIncrement(category) {
        if (getEntryConfigService()) return getEntryConfigService().getCategoryAutoIncrement(category);
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.autoIncrementOrder || false;
        }
        if (AppState.config.categoryDefault[category]?.autoIncrementOrder !== undefined) {
            return AppState.config.categoryDefault[category].autoIncrementOrder;
        }
        const catConfig = AppState.persistent.customCategories.find((c) => c.name === category);
        return catConfig?.autoIncrementOrder || false;
    }

    // 获取分类的起始顺序
    function getCategoryBaseOrder(category) {
        if (getEntryConfigService()) return getEntryConfigService().getCategoryBaseOrder(category);
        // 特殊处理：剧情大纲
        if (category === '剧情大纲') {
            return AppState.config.plotOutline.order || 100;
        }
        if (AppState.config.categoryDefault[category]?.order !== undefined) {
            return AppState.config.categoryDefault[category].order;
        }
        const catConfig = AppState.persistent.customCategories.find((c) => c.name === category);
        return catConfig?.defaultOrder || 100;
    }

    function setEntryConfig(category, entryName, config) {
        if (getEntryConfigService()) {
            getEntryConfigService().setEntryConfig(category, entryName, config);
            return;
        }
        const key = `${category}::${entryName}`;
        AppState.config.entryPosition[key] = { ...config };
        AppState.settings.entryPositionConfig = AppState.config.entryPosition;
        saveSettings();
    }

    function setCategoryDefaultConfig(category, config) {
        if (getEntryConfigService()) {
            getEntryConfigService().setCategoryDefaultConfig(category, config);
            return;
        }
        AppState.config.categoryDefault[category] = {
            position: config.position !== undefined ? config.position : 0,
            depth: config.depth !== undefined ? config.depth : 4,
            order: config.order !== undefined ? config.order : 100,
            autoIncrementOrder: config.autoIncrementOrder || false,
        };
        AppState.settings.categoryDefaultConfig = AppState.config.categoryDefault;
        saveSettings();
    }

    return {
        updateStreamContent,
        debugLog,
        getCategoryLightState,
        setCategoryLightState,
        saveCategoryLightSettings,
        loadCategoryLightSettings,
        getEntryConfig,
        getCategoryAutoIncrement,
        getCategoryBaseOrder,
        setEntryConfig,
        setCategoryDefaultConfig,
    };
}

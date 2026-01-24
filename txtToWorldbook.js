/**
 * TXT转世界书独立模块
 * 用于将TXT小说文本转换为SillyTavern世界书格式
 * 
 * 功能特性：
 * - 支持多种AI API（DeepSeek、Gemini、本地模型等）
 * - 增量输出模式
 * - 记忆分裂机制（处理Token超限）
 * - 多层JSON解析容错
 * - 历史追踪与回滚
 * - 条目演变分析
 * - AI优化世界书
 */

(function() {
    'use strict';

    // ========== 全局状态 ==========
    let generatedWorldbook = {};
    let memoryQueue = [];
    let failedMemoryQueue = [];
    let currentFile = null;
    let currentFileHash = null;
    let isProcessingStopped = false;
    let isRepairingMemories = false;
    let currentProcessingIndex = 0;
    let incrementalOutputMode = true;

    // ========== 自定义分类系统 ==========
    // 默认的世界书分类模板配置
    const DEFAULT_WORLDBOOK_CATEGORIES = [
        {
            name: "角色",
            enabled: true,
            isBuiltin: true,
            entryExample: "角色真实姓名",
            keywordsExample: ["真实姓名", "称呼1", "称呼2", "绰号"],
            contentGuide: "基于原文的角色描述，包含但不限于**名称**:（必须要）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）"
        },
        {
            name: "地点",
            enabled: true,
            isBuiltin: true,
            entryExample: "地点真实名称",
            keywordsExample: ["地点名", "别称", "俗称"],
            contentGuide: "基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）"
        },
        {
            name: "组织",
            enabled: true,
            isBuiltin: true,
            entryExample: "组织真实名称",
            keywordsExample: ["组织名", "简称", "代号"],
            contentGuide: "基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）"
        },
        {
            name: "道具",
            enabled: false,
            isBuiltin: false,
            entryExample: "道具名称",
            keywordsExample: ["道具名", "别名"],
            contentGuide: "基于原文的道具描述，包含但不限于**名称**:、**类型**:、**功能**:、**来源**:、**持有者**:等"
        },
        {
            name: "玩法",
            enabled: false,
            isBuiltin: false,
            entryExample: "玩法名称",
            keywordsExample: ["玩法名", "规则名"],
            contentGuide: "基于原文的玩法/规则描述，包含但不限于**名称**:、**规则说明**:、**参与条件**:、**奖惩机制**:等"
        },
        {
            name: "章节剧情",
            enabled: false,
            isBuiltin: false,
            entryExample: "第X章",
            keywordsExample: ["章节名", "章节号"],
            contentGuide: "该章节的剧情概要，包含但不限于**章节标题**:、**主要事件**:、**出场角色**:、**关键转折**:、**伏笔线索**:等"
        },
        {
            name: "角色内心",
            enabled: false,
            isBuiltin: false,
            entryExample: "角色名-内心世界",
            keywordsExample: ["角色名", "内心", "心理"],
            contentGuide: "角色的内心想法和心理活动，包含但不限于**内心独白**:、**情感变化**:、**动机分析**:、**心理矛盾**:等"
        }
    ];

    // 当前使用的世界书分类配置
    let customWorldbookCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));

    // 剧情大纲和文风配置开关
    let enablePlotOutline = true;
    let enableLiteraryStyle = false;

    // 保存自定义分类配置到localStorage
    function saveCustomCategories() {
        try {
            localStorage.setItem('ttw_custom_categories', JSON.stringify(customWorldbookCategories));
            console.log('自定义分类配置已保存');
        } catch (error) {
            console.error('保存自定义分类配置失败:', error);
        }
    }

    // 从localStorage加载自定义分类配置
    function loadCustomCategories() {
        try {
            const saved = localStorage.getItem('ttw_custom_categories');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    customWorldbookCategories = parsed;
                }
            }
        } catch (error) {
            console.error('加载自定义分类配置失败:', error);
        }
    }

    // 重置为默认分类配置
    function resetToDefaultCategories() {
        customWorldbookCategories = JSON.parse(JSON.stringify(DEFAULT_WORLDBOOK_CATEGORIES));
        saveCustomCategories();
        console.log('已重置为默认分类配置');
    }

    // 获取启用的分类列表
    function getEnabledCategories() {
        return customWorldbookCategories.filter(cat => cat.enabled);
    }

    // 获取启用分类的描述
    function getEnabledCategoriesDescription() {
        const enabledCategories = getEnabledCategories();
        return enabledCategories.map(cat => cat.name).join('、');
    }

    // 生成主提示词的JSON模板部分
    function generateMainPromptJsonTemplate() {
        const enabledCategories = getEnabledCategories();

        let template = '{\n';
        const parts = [];

        for (const cat of enabledCategories) {
            parts.push(`"${cat.name}": {
"${cat.entryExample}": {
"关键词": ${JSON.stringify(cat.keywordsExample)},
"内容": "${cat.contentGuide}"
}
}`);
        }

        // 添加剧情大纲（如果启用）
        if (enablePlotOutline) {
            parts.push(`"剧情大纲": {
"主线剧情": {
"关键词": ["主线", "核心剧情", "故事线"],
"内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响"
},
"支线剧情": {
"关键词": ["支线", "副线", "分支剧情"],
"内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
}
}`);
        }

        // 添加文风配置（如果启用）
        if (enableLiteraryStyle) {
            parts.push(`"文风配置": {
"作品文风": {
"关键词": ["文风", "写作风格", "叙事特点"],
"内容": "基于原文分析的文风配置，包含叙事系统、表达系统、美学系统等"
}
}`);
        }

        template += parts.join(',\n');
        template += '\n}';

        return template;
    }

    // 生成简化版JSON模板
    function generateSimpleJsonTemplate() {
        const enabledCategories = getEnabledCategories();
        const parts = [];

        for (const cat of enabledCategories) {
            parts.push(`"${cat.name}": { "${cat.entryExample}": { "关键词": ["..."], "内容": "..." } }`);
        }

        if (enablePlotOutline) {
            parts.push(`"剧情大纲": { "主线剧情": { "关键词": ["主线"], "内容": "..." } }`);
        }

        if (enableLiteraryStyle) {
            parts.push(`"文风配置": { "作品文风": { "关键词": ["文风"], "内容": "..." } }`);
        }

        return '{\n' + parts.join(',\n') + '\n}';
    }

    // 渲染分类列表
    function renderCategoriesList() {
        const listContainer = document.getElementById('ttw-categories-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        customWorldbookCategories.forEach((cat, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 5px;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = cat.enabled;
            checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
            checkbox.addEventListener('change', function() {
                customWorldbookCategories[index].enabled = this.checked;
                saveCustomCategories();
            });

            const label = document.createElement('span');
            label.style.cssText = 'flex: 1; color: #f0f0f0; font-size: 13px;';
            label.textContent = cat.name;
            if (cat.isBuiltin) {
                label.innerHTML += ' <span style="color: #888; font-size: 11px;">(内置)</span>';
            }

            const editBtn = document.createElement('button');
            editBtn.textContent = '✏️';
            editBtn.title = '编辑';
            editBtn.className = 'ttw-btn ttw-btn-small';
            editBtn.style.cssText = 'background: #3498db; padding: 3px 8px; font-size: 11px;';
            editBtn.addEventListener('click', () => showEditCategoryModal(index));

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = '删除';
            deleteBtn.className = 'ttw-btn ttw-btn-small';
            deleteBtn.style.cssText = 'background: #dc3545; padding: 3px 8px; font-size: 11px;';
            deleteBtn.disabled = cat.isBuiltin;
            if (cat.isBuiltin) {
                deleteBtn.style.opacity = '0.5';
                deleteBtn.style.cursor = 'not-allowed';
            }
            deleteBtn.addEventListener('click', () => {
                if (!cat.isBuiltin && confirm(`确定要删除分类"${cat.name}"吗？`)) {
                    customWorldbookCategories.splice(index, 1);
                    saveCustomCategories();
                    renderCategoriesList();
                }
            });

            item.appendChild(checkbox);
            item.appendChild(label);
            item.appendChild(editBtn);
            item.appendChild(deleteBtn);
            listContainer.appendChild(item);
        });
    }

    // 显示添加分类弹窗
    function showAddCategoryModal() {
        showCategoryModal(null, '添加新分类');
    }

    // 显示编辑分类弹窗
    function showEditCategoryModal(index) {
        showCategoryModal(index, '编辑分类');
    }

    // 通用的分类编辑弹窗
    function showCategoryModal(editIndex, title) {
        const isEdit = editIndex !== null;
        const cat = isEdit ? customWorldbookCategories[editIndex] : {
            name: '',
            enabled: true,
            isBuiltin: false,
            entryExample: '',
            keywordsExample: [],
            contentGuide: ''
        };

        // 移除已存在的弹窗
        const existingModal = document.getElementById('ttw-category-edit-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'ttw-category-edit-modal';
        modal.className = 'ttw-modal-container';
        modal.style.zIndex = '100000';

        modal.innerHTML = `
            <div class="ttw-modal" style="max-width: 500px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">${title}</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; color: #e67e22; margin-bottom: 5px; font-size: 13px;">分类名称 *</label>
                        <input type="text" id="ttw-cat-name" value="${cat.name}" placeholder="如：道具、玩法、章节剧情"
                            style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(0,0,0,0.3); color: white; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; color: #e67e22; margin-bottom: 5px; font-size: 13px;">条目名称示例</label>
                        <input type="text" id="ttw-cat-entry" value="${cat.entryExample}" placeholder="如：道具名称、第X章"
                            style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(0,0,0,0.3); color: white; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; color: #e67e22; margin-bottom: 5px; font-size: 13px;">关键词示例（逗号分隔）</label>
                        <input type="text" id="ttw-cat-keywords" value="${cat.keywordsExample.join(', ')}" placeholder="如：道具名, 别名, 俗称"
                            style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(0,0,0,0.3); color: white; box-sizing: border-box;">
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; color: #e67e22; margin-bottom: 5px; font-size: 13px;">内容提取指南</label>
                        <textarea id="ttw-cat-guide" placeholder="描述AI应该提取哪些信息，如：包含**名称**:、**类型**:、**功能**:等"
                            style="width: 100%; height: 100px; padding: 8px; border: 1px solid #555; border-radius: 4px; background: rgba(0,0,0,0.3); color: white; resize: vertical; box-sizing: border-box;">${cat.contentGuide}</textarea>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cat-cancel">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-cat-save">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 关闭弹窗函数
        const closeCategoryModal = (e) => {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            modal.remove();
            document.removeEventListener('keydown', categoryEscHandler, true);
        };

        // ESC 关闭 - 使用捕获阶段
        const categoryEscHandler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                closeCategoryModal();
            }
        };
        document.addEventListener('keydown', categoryEscHandler, true);

        // 关闭按钮
        modal.querySelector('.ttw-modal-close').addEventListener('click', (e) => {
            closeCategoryModal(e);
        }, false);

        // 取消按钮
        modal.querySelector('#ttw-cat-cancel').addEventListener('click', (e) => {
            closeCategoryModal(e);
        }, false);

        // 阻止弹窗内部点击冒泡
        const modalInner = modal.querySelector('.ttw-modal');
        modalInner.addEventListener('click', (e) => {
            e.stopPropagation();
        }, false);

        modalInner.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        }, false);

        modalInner.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCategoryModal(e);
            }
        }, false);

        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) {
                e.stopPropagation();
            }
        }, false);

        modal.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        modal.querySelector('#ttw-cat-save').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const name = document.getElementById('ttw-cat-name').value.trim();
            const entryExample = document.getElementById('ttw-cat-entry').value.trim();
            const keywordsStr = document.getElementById('ttw-cat-keywords').value.trim();
            const contentGuide = document.getElementById('ttw-cat-guide').value.trim();

            if (!name) {
                alert('请输入分类名称');
                return;
            }

            // 检查名称是否重复
            const duplicateIndex = customWorldbookCategories.findIndex((c, i) => c.name === name && i !== editIndex);
            if (duplicateIndex !== -1) {
                alert('该分类名称已存在');
                return;
            }

            const keywordsExample = keywordsStr ? keywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k) : [];

            const newCat = {
                name,
                enabled: isEdit ? cat.enabled : true,
                isBuiltin: isEdit ? cat.isBuiltin : false,
                entryExample: entryExample || name + '名称',
                keywordsExample: keywordsExample.length > 0 ? keywordsExample : [name + '名'],
                contentGuide: contentGuide || `基于原文的${name}描述`
            };

            if (isEdit) {
                customWorldbookCategories[editIndex] = newCat;
            } else {
                customWorldbookCategories.push(newCat);
            }

            saveCustomCategories();
            renderCategoriesList();
            closeCategoryModal();
        }, false);
    }

    // ========== 默认设置 ==========
    // 默认提示词模板 - 世界书词条（核心，必需）
    const defaultWorldbookPrompt = `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取其中的关键信息，生成高质量的世界书条目。

## 重要要求
1. **必须基于提供的具体小说内容**，不要生成通用模板
2. **只提取文中明确出现的角色、地点、组织等信息**
3. **关键词必须是文中实际出现的名称**，用逗号分隔
4. **内容必须基于原文描述**，不要添加原文没有的信息
5. **内容使用markdown格式**，可以层层嵌套或使用序号标题

## 📤 输出格式
请生成标准JSON格式，确保能被JavaScript正确解析：

\`\`\`json
{
"角色": {
"角色真实姓名": {
"关键词": ["真实姓名", "称呼1", "称呼2", "绰号"],
"内容": "基于原文的角色描述，包含但不限于**名称**:（必须要）、**性别**:、**MBTI(必须要，如变化请说明背景)**:、**貌龄**:、**年龄**:、**身份**:、**背景**:、**性格**:、**外貌**:、**技能**:、**重要事件**:、**话语示例**:、**弱点**:、**背景故事**:等（实际嵌套或者排列方式按合理的逻辑）"
}
},
"地点": {
"地点真实名称": {
"关键词": ["地点名", "别称", "俗称"],
"内容": "基于原文的地点描述，包含但不限于**名称**:（必须要）、**位置**:、**特征**:、**重要事件**:等（实际嵌套或者排列方式按合理的逻辑）"
}
},
"组织": {
"组织真实名称": {
"关键词": ["组织名", "简称", "代号"],
"内容": "基于原文的组织描述，包含但不限于**名称**:（必须要）、**性质**:、**成员**:、**目标**:等（实际嵌套或者排列方式按合理的逻辑）"
}
}
}
\`\`\`

## 重要提醒
- 直接输出JSON，不要包含代码块标记
- 所有信息必须来源于原文，不要编造
- 关键词必须是文中实际出现的词语
- 内容描述要完整但简洁`;

    // 默认提示词模板 - 剧情大纲（可选）
    const defaultPlotPrompt = `"剧情大纲": {
"主线剧情": {
"关键词": ["主线", "核心剧情", "故事线"],
"内容": "## 故事主线\\n**核心冲突**: 故事的中心矛盾\\n**主要目标**: 主角追求的目标\\n**阻碍因素**: 实现目标的障碍\\n\\n## 剧情阶段\\n**第一幕 - 起始**: 故事开端，世界观建立\\n**第二幕 - 发展**: 冲突升级，角色成长\\n**第三幕 - 高潮**: 决战时刻，矛盾爆发\\n**第四幕 - 结局**: [如已完结] 故事收尾\\n\\n## 关键转折点\\n1. **转折点1**: 描述和影响\\n2. **转折点2**: 描述和影响\\n3. **转折点3**: 描述和影响\\n\\n## 伏笔与暗线\\n**已揭示的伏笔**: 已经揭晓的铺垫\\n**未解之谜**: 尚未解答的疑问\\n**暗线推测**: 可能的隐藏剧情线"
},
"支线剧情": {
"关键词": ["支线", "副线", "分支剧情"],
"内容": "## 主要支线\\n**支线1标题**: 简要描述\\n**支线2标题**: 简要描述\\n**支线3标题**: 简要描述\\n\\n## 支线与主线的关联\\n**交织点**: 支线如何影响主线\\n**独立价值**: 支线的独特意义"
}
}`;

    // 默认提示词模板 - 文风配置（可选）
    const defaultStylePrompt = `"文风配置": {
"作品文风": {
"关键词": ["文风", "写作风格", "叙事特点"],
"内容": "## 叙事视角\\n**视角类型**: 第一人称/第三人称/全知视角\\n**叙述者特点**: 叙述者的语气和态度\\n\\n## 语言风格\\n**用词特点**: 华丽/简洁/口语化/书面化\\n**句式特点**: 长句/短句/对话多/描写多\\n**修辞手法**: 常用的修辞手法\\n\\n## 情感基调\\n**整体氛围**: 轻松/沉重/悬疑/浪漫\\n**情感表达**: 直接/含蓄/细腻/粗犷"
}
}`;

    const defaultSettings = {
        apiProvider: 'gemini',
        apiKey: '',
        apiEndpoint: '',
        apiModel: 'gemini-2.5-flash',
        chunkSize: 15000,
        enablePlotOutline: false,
        enableLiteraryStyle: false,
        language: 'zh',
        // 自定义提示词（留空使用默认）
        customWorldbookPrompt: '',
        customPlotPrompt: '',
        customStylePrompt: ''
    };

    let settings = { ...defaultSettings };

    // ========== IndexedDB 持久化 ==========
    const MemoryHistoryDB = {
        dbName: 'TxtToWorldbookDB',
        storeName: 'history',
        metaStoreName: 'meta',
        stateStoreName: 'state',
        db: null,

        async openDB() {
            if (this.db) return this.db;
            
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 3);
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('memoryIndex', 'memoryIndex', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.metaStoreName)) {
                        db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains(this.stateStoreName)) {
                        db.createObjectStore(this.stateStoreName, { keyPath: 'key' });
                    }
                };
                
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        },

        async saveHistory(memoryIndex, memoryTitle, previousWorldbook, newWorldbook, changedEntries) {
            const db = await this.openDB();
            
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            if (!allowedDuplicates.includes(memoryTitle)) {
                try {
                    const allHistory = await this.getAllHistory();
                    const duplicates = allHistory.filter(h => h.memoryTitle === memoryTitle);
                    
                    if (duplicates.length > 0) {
                        console.log(`🗑️ 删除 ${duplicates.length} 条重复记录: "${memoryTitle}"`);
                        const deleteTransaction = db.transaction([this.storeName], 'readwrite');
                        const deleteStore = deleteTransaction.objectStore(this.storeName);
                        
                        for (const dup of duplicates) {
                            deleteStore.delete(dup.id);
                        }
                        
                        await new Promise((resolve, reject) => {
                            deleteTransaction.oncomplete = () => resolve();
                            deleteTransaction.onerror = () => reject(deleteTransaction.error);
                        });
                    }
                } catch (error) {
                    console.error('删除重复历史记录失败:', error);
                }
            }
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                const record = {
                    timestamp: Date.now(),
                    memoryIndex: memoryIndex,
                    memoryTitle: memoryTitle,
                    previousWorldbook: JSON.parse(JSON.stringify(previousWorldbook || {})),
                    newWorldbook: JSON.parse(JSON.stringify(newWorldbook || {})),
                    changedEntries: changedEntries || [],
                    fileHash: currentFileHash || null
                };
                
                const request = store.add(record);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async getAllHistory() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();
                
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        async getHistoryById(id) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(id);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        async clearAllHistory() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();
                
                request.onsuccess = () => {
                    console.log('📚 记忆历史已清除');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        },

        async saveFileHash(hash) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'currentFileHash', value: hash });
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async getSavedFileHash() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readonly');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.get('currentFileHash');
                
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async saveState(processedIndex) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                const store = transaction.objectStore(this.stateStoreName);
                
                const state = {
                    key: 'currentState',
                    processedIndex: processedIndex,
                    memoryQueue: JSON.parse(JSON.stringify(memoryQueue)),
                    generatedWorldbook: JSON.parse(JSON.stringify(generatedWorldbook)),
                    fileHash: currentFileHash,
                    timestamp: Date.now()
                };
                
                const request = store.put(state);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async loadState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readonly');
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.get('currentState');
                
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        },

        async clearState() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.stateStoreName], 'readwrite');
                const store = transaction.objectStore(this.stateStoreName);
                const request = store.delete('currentState');
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async saveCustomOptimizationPrompt(prompt) {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readwrite');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.put({ key: 'customOptimizationPrompt', value: prompt });
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        },

        async getCustomOptimizationPrompt() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([this.metaStoreName], 'readonly');
                const store = transaction.objectStore(this.metaStoreName);
                const request = store.get('customOptimizationPrompt');
                
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
        },

        async rollbackToHistory(historyId) {
            const history = await this.getHistoryById(historyId);
            if (!history) {
                throw new Error('找不到指定的历史记录');
            }
            
            generatedWorldbook = JSON.parse(JSON.stringify(history.previousWorldbook));
            
            const db = await this.openDB();
            const allHistory = await this.getAllHistory();
            const toDelete = allHistory.filter(h => h.id >= historyId);
            
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            for (const h of toDelete) {
                store.delete(h.id);
            }
            
            return history;
        },

        async cleanDuplicateHistory() {
            const db = await this.openDB();
            const allHistory = await this.getAllHistory();
            const allowedDuplicates = ['记忆-优化', '记忆-演变总结'];
            
            const groupedByTitle = {};
            for (const record of allHistory) {
                const title = record.memoryTitle;
                if (!groupedByTitle[title]) {
                    groupedByTitle[title] = [];
                }
                groupedByTitle[title].push(record);
            }
            
            const toDelete = [];
            for (const title in groupedByTitle) {
                if (allowedDuplicates.includes(title)) continue;
                
                const records = groupedByTitle[title];
                if (records.length > 1) {
                    records.sort((a, b) => b.timestamp - a.timestamp);
                    toDelete.push(...records.slice(1));
                }
            }
            
            if (toDelete.length > 0) {
                console.log(`🗑️ 清理 ${toDelete.length} 条重复历史记录`);
                const transaction = db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                for (const record of toDelete) {
                    store.delete(record.id);
                }
                
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });
                
                return toDelete.length;
            }
            
            return 0;
        }
    };

    // ========== 工具函数 ==========
    async function calculateFileHash(content) {
        // 方案 A: 尝试使用标准的 Web Crypto API (仅在 HTTPS 或 localhost/127.0.0.1 有效)
        if (window.crypto && window.crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(content);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                console.warn('Crypto API 存在但调用失败，将回退到简单哈希:', e);
            }
        }

        // 方案 B: 简易哈希回退 (适用于局域网 HTTP 环境)
        // 使用简单的字符累加位移算法生成唯一ID
        console.log('当前环境不支持 crypto.subtle (可能是局域网HTTP)，使用简易哈希算法');
        
        let hash = 0;
        if (content.length === 0) return 'hash-empty';
        
        // 限制采样长度以提高大文件处理速度（取前中后各一部分参与计算）
        // 如果文件小于 100k 全量计算，大于则采样
        const len = content.length;
        if (len < 100000) {
            for (let i = 0; i < len; i++) {
                const char = content.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
        } else {
            // 采样计算：前1000字 + 中间1000字 + 后1000字 + 长度
            const sample = content.slice(0, 1000) + 
                           content.slice(Math.floor(len/2), Math.floor(len/2) + 1000) + 
                           content.slice(-1000);
            for (let i = 0; i < sample.length; i++) {
                const char = sample.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
        }

        // 返回 hex 格式的伪哈希，加上长度确保唯一性
        return 'simple-' + Math.abs(hash).toString(16) + '-' + len;
    }


    function getLanguagePrefix() {
        return settings.language === 'zh' ? '请用中文回复。\n\n' : '';
    }

    // ========== 文件编码检测 ==========
    async function detectBestEncoding(file) {
        const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'Big5'];
        
        for (const encoding of encodings) {
            try {
                const content = await readFileWithEncoding(file, encoding);
                if (!content.includes('�') && !content.includes('\uFFFD')) {
                    return { encoding, content };
                }
            } catch (e) {
                continue;
            }
        }
        
        const content = await readFileWithEncoding(file, 'UTF-8');
        return { encoding: 'UTF-8', content };
    }

    function readFileWithEncoding(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, encoding);
        });
    }

    // ========== API 调用 ==========
    async function callAPI(prompt, retryCount = 0) {
        const maxRetries = 3;
        let requestUrl, requestOptions;

        switch (settings.apiProvider) {
            case 'deepseek':
                if (!settings.apiKey) throw new Error('DeepSeek API Key 未设置');
                requestUrl = 'https://api.deepseek.com/chat/completions';
                requestOptions = {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${settings.apiKey}` 
                    },
                    body: JSON.stringify({ 
                        model: 'deepseek-chat', 
                        messages: [{ role: 'user', content: prompt }], 
                        temperature: 0.3, 
                        max_tokens: 8192
                    }),
                };
                break;
                
            case 'gemini':
                if (!settings.apiKey) throw new Error('Gemini API Key 未设置');
                const geminiModel = settings.apiModel || 'gemini-2.5-flash';
                requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${settings.apiKey}`;
                requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 65536, temperature: 0.3 },
                        safetySettings: [
                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' }
                        ]
                    }),
                };
                break;
                
            case 'gemini-proxy':
                if (!settings.apiEndpoint) throw new Error('Gemini Proxy Endpoint 未设置');
                if (!settings.apiKey) throw new Error('Gemini Proxy API Key 未设置');
                
                let proxyBaseUrl = settings.apiEndpoint;
                if (!proxyBaseUrl.startsWith('http')) proxyBaseUrl = 'https://' + proxyBaseUrl;
                if (proxyBaseUrl.endsWith('/')) proxyBaseUrl = proxyBaseUrl.slice(0, -1);
                
                const geminiProxyModel = settings.apiModel || 'gemini-2.5-flash';
                const useOpenAIFormat = proxyBaseUrl.endsWith('/v1');
                
                if (useOpenAIFormat) {
                    requestUrl = proxyBaseUrl + '/chat/completions';
                    requestOptions = {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${settings.apiKey}`
                        },
                        body: JSON.stringify({
                            model: geminiProxyModel,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                            max_tokens: 65536
                        }),
                    };
                } else {
                    const finalProxyUrl = `${proxyBaseUrl}/${geminiProxyModel}:generateContent`;
                    requestUrl = finalProxyUrl.includes('?') 
                        ? `${finalProxyUrl}&key=${settings.apiKey}`
                        : `${finalProxyUrl}?key=${settings.apiKey}`;
                    requestOptions = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { maxOutputTokens: 65536, temperature: 0.3 }
                        }),
                    };
                }
                break;
                
            case 'openai-compatible':
                let openaiEndpoint = settings.apiEndpoint || 'http://127.0.0.1:5000/v1/chat/completions';
                const model = settings.apiModel || 'local-model';

                // 确保endpoint包含/chat/completions路径
                if (!openaiEndpoint.includes('/chat/completions')) {
                    if (openaiEndpoint.endsWith('/v1')) {
                        openaiEndpoint += '/chat/completions';
                    } else {
                        openaiEndpoint = openaiEndpoint.replace(/\/$/, '') + '/chat/completions';
                    }
                }

                if (!openaiEndpoint.startsWith('http')) {
                    openaiEndpoint = 'http://' + openaiEndpoint;
                }

                requestUrl = openaiEndpoint;
                const headers = { 'Content-Type': 'application/json' };
                if (settings.apiKey) {
                    headers['Authorization'] = `Bearer ${settings.apiKey}`;
                }

                requestOptions = {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,
                        max_tokens: 64000
                    }),
                };
                break;
                
            default:
                throw new Error(`不支持的API提供商: ${settings.apiProvider}`);
        }

        try {
            const response = await fetch(requestUrl, requestOptions);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log('API错误响应:', errorText);
                
                if (response.status === 429 || errorText.includes('resource_exhausted') || errorText.includes('rate limit')) {
                    if (retryCount < maxRetries) {
                        const delay = Math.pow(2, retryCount) * 1000;
                        console.log(`遇到限流，${delay}ms后重试 (${retryCount + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return callAPI(prompt, retryCount + 1);
                    } else {
                        throw new Error(`API限流：已达到最大重试次数`);
                    }
                }
                
                throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${errorText}`);
            }
            
            const data = await response.json();
            
            // 解析不同格式的响应
            if (settings.apiProvider === 'gemini') {
                return data.candidates[0].content.parts[0].text;
            } else if (settings.apiProvider === 'gemini-proxy') {
                if (data.candidates) {
                    return data.candidates[0].content.parts[0].text;
                } else if (data.choices) {
                    return data.choices[0].message.content;
                }
            } else {
                return data.choices[0].message.content;
            }
            
            throw new Error('未知的API响应格式');
            
        } catch (networkError) {
            if (networkError.message.includes('fetch')) {
                throw new Error('网络连接失败，请检查网络设置');
            }
            throw networkError;
        }
    }

    // ========== 拉取模型列表 ==========
    async function fetchModelList() {
        const endpoint = settings.apiEndpoint || '';
        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }

        // 构建 /models 端点
        let modelsUrl = endpoint;
        if (modelsUrl.endsWith('/chat/completions')) {
            modelsUrl = modelsUrl.replace('/chat/completions', '/models');
        } else if (modelsUrl.endsWith('/v1')) {
            modelsUrl = modelsUrl + '/models';
        } else if (!modelsUrl.endsWith('/models')) {
            modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
        }

        if (!modelsUrl.startsWith('http')) {
            modelsUrl = 'http://' + modelsUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (settings.apiKey) {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }

        console.log('📤 拉取模型列表:', modelsUrl);

        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`拉取模型列表失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('📥 模型列表响应:', data);

        // 解析模型列表
        let models = [];
        if (data.data && Array.isArray(data.data)) {
            // OpenAI 格式
            models = data.data.map(m => m.id || m.name || m);
        } else if (Array.isArray(data)) {
            models = data.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
        } else if (data.models && Array.isArray(data.models)) {
            models = data.models.map(m => typeof m === 'string' ? m : (m.id || m.name || m));
        }

        return models;
    }

    // ========== 快速测试 ==========
    async function quickTestModel() {
        const endpoint = settings.apiEndpoint || '';
        const model = settings.apiModel || '';

        if (!endpoint) {
            throw new Error('请先设置 API Endpoint');
        }
        if (!model) {
            throw new Error('请先设置模型名称');
        }

        // 构建请求 URL
        let requestUrl = endpoint;
        if (!requestUrl.includes('/chat/completions')) {
            if (requestUrl.endsWith('/v1')) {
                requestUrl += '/chat/completions';
            } else {
                requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
            }
        }

        if (!requestUrl.startsWith('http')) {
            requestUrl = 'http://' + requestUrl;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (settings.apiKey) {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }

        console.log('📤 快速测试:', requestUrl, '模型:', model);

        const startTime = Date.now();

        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 50
            })
        });

        const elapsed = Date.now() - startTime;

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`测试失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('📥 测试响应:', data);

        let responseText = '';
        if (data.choices && data.choices[0]) {
            responseText = data.choices[0].message?.content || data.choices[0].text || '';
        }

        // 验证是否真的收到了回复
        if (!responseText || responseText.trim() === '') {
            throw new Error('API返回了空响应，请检查模型配置');
        }

        return {
            success: true,
            elapsed: elapsed,
            response: responseText.substring(0, 100)
        };
    }

    // ========== 世界书数据处理 ==========
    function normalizeWorldbookEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        
        if (entry.content !== undefined && entry['内容'] !== undefined) {
            const contentLen = String(entry.content || '').length;
            const neirongLen = String(entry['内容'] || '').length;
            if (contentLen > neirongLen) {
                entry['内容'] = entry.content;
            }
            delete entry.content;
        } else if (entry.content !== undefined) {
            entry['内容'] = entry.content;
            delete entry.content;
        }
        
        return entry;
    }

    function normalizeWorldbookData(data) {
        if (!data || typeof data !== 'object') return data;
        
        for (const category in data) {
            if (typeof data[category] === 'object' && data[category] !== null && !Array.isArray(data[category])) {
                if (data[category]['关键词'] || data[category]['内容'] || data[category].content) {
                    normalizeWorldbookEntry(data[category]);
                } else {
                    for (const entryName in data[category]) {
                        if (typeof data[category][entryName] === 'object') {
                            normalizeWorldbookEntry(data[category][entryName]);
                        }
                    }
                }
            }
        }
        return data;
    }

    function mergeWorldbookData(target, source) {
        normalizeWorldbookData(source);

        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                mergeWorldbookData(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }

    function mergeWorldbookDataIncremental(target, source) {
        normalizeWorldbookData(source);
        
        const stats = { updated: [], added: [] };
        
        for (const category in source) {
            if (typeof source[category] !== 'object' || source[category] === null) continue;
            
            if (!target[category]) {
                target[category] = {};
            }
            
            for (const entryName in source[category]) {
                const sourceEntry = source[category][entryName];
                
                if (typeof sourceEntry !== 'object' || sourceEntry === null) continue;
                
                if (target[category][entryName]) {
                    const targetEntry = target[category][entryName];
                    
                    if (Array.isArray(sourceEntry['关键词']) && Array.isArray(targetEntry['关键词'])) {
                        const mergedKeywords = [...new Set([...targetEntry['关键词'], ...sourceEntry['关键词']])];
                        targetEntry['关键词'] = mergedKeywords;
                    } else if (Array.isArray(sourceEntry['关键词'])) {
                        targetEntry['关键词'] = sourceEntry['关键词'];
                    }
                    
                    if (sourceEntry['内容']) {
                        targetEntry['内容'] = sourceEntry['内容'];
                    }
                    
                    stats.updated.push(`[${category}] ${entryName}`);
                } else {
                    target[category][entryName] = sourceEntry;
                    stats.added.push(`[${category}] ${entryName}`);
                }
            }
        }
        
        if (stats.updated.length > 0) {
            console.log(`📝 增量更新 ${stats.updated.length} 个条目`);
        }
        if (stats.added.length > 0) {
            console.log(`➕ 增量新增 ${stats.added.length} 个条目`);
        }
    }

    function findChangedEntries(oldWorldbook, newWorldbook) {
        const changes = [];
        
        for (const category in newWorldbook) {
            const oldCategory = oldWorldbook[category] || {};
            const newCategory = newWorldbook[category];
            
            for (const entryName in newCategory) {
                const oldEntry = oldCategory[entryName];
                const newEntry = newCategory[entryName];
                
                if (!oldEntry) {
                    changes.push({
                        type: 'add',
                        category: category,
                        entryName: entryName,
                        oldValue: null,
                        newValue: newEntry
                    });
                } else if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
                    changes.push({
                        type: 'modify',
                        category: category,
                        entryName: entryName,
                        oldValue: oldEntry,
                        newValue: newEntry
                    });
                }
            }
        }
        
        for (const category in oldWorldbook) {
            const oldCategory = oldWorldbook[category];
            const newCategory = newWorldbook[category] || {};
            
            for (const entryName in oldCategory) {
                if (!newCategory[entryName]) {
                    changes.push({
                        type: 'delete',
                        category: category,
                        entryName: entryName,
                        oldValue: oldCategory[entryName],
                        newValue: null
                    });
                }
            }
        }
        
        return changes;
    }

    async function mergeWorldbookDataWithHistory(target, source, memoryIndex, memoryTitle) {
        const previousWorldbook = JSON.parse(JSON.stringify(target));
        
        if (incrementalOutputMode) {
            mergeWorldbookDataIncremental(target, source);
        } else {
            mergeWorldbookData(target, source);
        }
        
        const changedEntries = findChangedEntries(previousWorldbook, target);
        
        if (changedEntries.length > 0) {
            await MemoryHistoryDB.saveHistory(
                memoryIndex,
                memoryTitle,
                previousWorldbook,
                target,
                changedEntries
            );
            console.log(`📚 已保存历史记录: ${memoryTitle}, ${changedEntries.length}个变更`);
        }
        
        return changedEntries;
    }

    // ========== 正则回退解析 ==========
    function extractWorldbookDataByRegex(jsonString) {
        console.log('🔧 开始正则提取世界书数据...');
        const result = {};
        
        const categories = ['角色', '地点', '组织', '剧情大纲', '知识书', '文风配置'];
        
        for (const category of categories) {
            const categoryPattern = new RegExp(`"${category}"\\s*:\\s*\\{`, 'g');
            const categoryMatch = categoryPattern.exec(jsonString);
            
            if (!categoryMatch) continue;
            
            const startPos = categoryMatch.index + categoryMatch[0].length;
            
            let braceCount = 1;
            let endPos = startPos;
            while (braceCount > 0 && endPos < jsonString.length) {
                if (jsonString[endPos] === '{') braceCount++;
                if (jsonString[endPos] === '}') braceCount--;
                endPos++;
            }
            
            if (braceCount !== 0) {
                console.log(`⚠️ 分类 "${category}" 括号不匹配，跳过`);
                continue;
            }
            
            const categoryContent = jsonString.substring(startPos, endPos - 1);
            result[category] = {};
            
            const entryPattern = /"([^"]+)"\s*:\s*\{/g;
            let entryMatch;
            
            while ((entryMatch = entryPattern.exec(categoryContent)) !== null) {
                const entryName = entryMatch[1];
                const entryStartPos = entryMatch.index + entryMatch[0].length;
                
                let entryBraceCount = 1;
                let entryEndPos = entryStartPos;
                while (entryBraceCount > 0 && entryEndPos < categoryContent.length) {
                    if (categoryContent[entryEndPos] === '{') entryBraceCount++;
                    if (categoryContent[entryEndPos] === '}') entryBraceCount--;
                    entryEndPos++;
                }
                
                if (entryBraceCount !== 0) continue;
                
                const entryContent = categoryContent.substring(entryStartPos, entryEndPos - 1);
                
                let keywords = [];
                const keywordsMatch = entryContent.match(/"关键词"\s*:\s*\[([\s\S]*?)\]/);
                if (keywordsMatch) {
                    const keywordStrings = keywordsMatch[1].match(/"([^"]+)"/g);
                    if (keywordStrings) {
                        keywords = keywordStrings.map(s => s.replace(/"/g, ''));
                    }
                }
                
                let content = '';
                const contentMatch = entryContent.match(/"内容"\s*:\s*"/);
                if (contentMatch) {
                    const contentStartPos = contentMatch.index + contentMatch[0].length;
                    let contentEndPos = contentStartPos;
                    let escaped = false;
                    while (contentEndPos < entryContent.length) {
                        const char = entryContent[contentEndPos];
                        if (escaped) {
                            escaped = false;
                        } else if (char === '\\') {
                            escaped = true;
                        } else if (char === '"') {
                            break;
                        }
                        contentEndPos++;
                    }
                    content = entryContent.substring(contentStartPos, contentEndPos);
                    try {
                        content = JSON.parse(`"${content}"`);
                    } catch (e) {
                        content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    }
                }
                
                if (content || keywords.length > 0) {
                    result[category][entryName] = {
                        '关键词': keywords,
                        '内容': content
                    };
                    console.log(`  ✓ 提取条目: ${category} -> ${entryName}`);
                }
            }
            
            if (Object.keys(result[category]).length === 0) {
                delete result[category];
            }
        }
        
        const extractedCategories = Object.keys(result);
        const totalEntries = extractedCategories.reduce((sum, cat) => sum + Object.keys(result[cat]).length, 0);
        console.log(`🔧 正则提取完成: ${extractedCategories.length}个分类, ${totalEntries}个条目`);
        
        return result;
    }

    // ========== 记忆分裂机制 ==========
    function splitMemoryIntoTwo(memoryIndex) {
        const memory = memoryQueue[memoryIndex];
        if (!memory) {
            console.error('❌ 无法找到要分裂的记忆');
            return null;
        }
        
        const content = memory.content;
        const halfLength = Math.floor(content.length / 2);
        
        let splitPoint = halfLength;
        
        const paragraphBreak = content.indexOf('\n\n', halfLength);
        if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
            splitPoint = paragraphBreak + 2;
        } else {
            const sentenceBreak = content.indexOf('。', halfLength);
            if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                splitPoint = sentenceBreak + 1;
            }
        }
        
        const content1 = content.substring(0, splitPoint);
        const content2 = content.substring(splitPoint);
        
        const originalTitle = memory.title;
        let baseName = originalTitle;
        let suffix1, suffix2;
        
        const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
        if (splitMatch) {
            baseName = splitMatch[1];
            const currentNum = parseInt(splitMatch[2]);
            suffix1 = `-${currentNum}-1`;
            suffix2 = `-${currentNum}-2`;
        } else {
            suffix1 = '-1';
            suffix2 = '-2';
        }
        
        const memory1 = {
            title: baseName + suffix1,
            content: content1,
            processed: false,
            failed: true,
            failedError: null
        };
        
        const memory2 = {
            title: baseName + suffix2,
            content: content2,
            processed: false,
            failed: true,
            failedError: null
        };
        
        memoryQueue.splice(memoryIndex, 1, memory1, memory2);
        
        console.log(`🔀 记忆分裂完成: "${originalTitle}" -> "${memory1.title}" + "${memory2.title}"`);
        
        return { part1: memory1, part2: memory2 };
    }

    function splitAllRemainingMemories(startIndex) {
        console.log(`🔀 开始分裂从索引 ${startIndex} 开始的所有后续记忆...`);
        let splitCount = 0;
        
        for (let i = memoryQueue.length - 1; i >= startIndex; i--) {
            const memory = memoryQueue[i];
            if (!memory || memory.processed) continue;
            
            const content = memory.content;
            const halfLength = Math.floor(content.length / 2);
            
            let splitPoint = halfLength;
            const paragraphBreak = content.indexOf('\n\n', halfLength);
            if (paragraphBreak !== -1 && paragraphBreak < halfLength + 5000) {
                splitPoint = paragraphBreak + 2;
            } else {
                const sentenceBreak = content.indexOf('。', halfLength);
                if (sentenceBreak !== -1 && sentenceBreak < halfLength + 1000) {
                    splitPoint = sentenceBreak + 1;
                }
            }
            
            const content1 = content.substring(0, splitPoint);
            const content2 = content.substring(splitPoint);
            
            const originalTitle = memory.title;
            let baseName = originalTitle;
            let suffix1, suffix2;
            
            const splitMatch = originalTitle.match(/^(.+)-(\d+)$/);
            if (splitMatch) {
                baseName = splitMatch[1];
                const currentNum = parseInt(splitMatch[2]);
                suffix1 = `-${currentNum}-1`;
                suffix2 = `-${currentNum}-2`;
            } else {
                suffix1 = '-1';
                suffix2 = '-2';
            }
            
            const memory1 = {
                title: baseName + suffix1,
                content: content1,
                processed: false,
                failed: false,
                failedError: null
            };
            
            const memory2 = {
                title: baseName + suffix2,
                content: content2,
                processed: false,
                failed: false,
                failedError: null
            };
            
            memoryQueue.splice(i, 1, memory1, memory2);
            splitCount++;
        }
        
        console.log(`✅ 分裂完成: 分裂了${splitCount}个记忆`);
        return splitCount;
    }

    // ========== 记忆处理核心 ==========
    async function processMemoryChunk(index, retryCount = 0) {
        // 在处理开始时检查暂停状态
        if (isProcessingStopped) {
            console.log(`处理被暂停，跳过记忆块 ${index + 1}`);
            return;
        }

        const memory = memoryQueue[index];
        const progress = ((index + 1) / memoryQueue.length) * 100;
        const maxRetries = 5;

        updateProgress(progress, `正在处理: ${memory.title} (${index + 1}/${memoryQueue.length})${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);

        // 获取系统提示词（已包含世界书词条、剧情大纲、文风配置）
        let basePrompt = getSystemPrompt();

        // 构建完整提示词
        let prompt = getLanguagePrefix() + basePrompt;

        // 添加额外提醒
        let additionalReminders = '';
        if (settings.enablePlotOutline) {
            additionalReminders += '\n- 剧情大纲是必需项，必须生成';
        }
        if (settings.enableLiteraryStyle) {
            additionalReminders += '\n- 文风配置字段为可选项，如果能够分析出明确的文风特征则生成，否则可以省略';
        }
        if (additionalReminders) {
            prompt += additionalReminders;
        }

        prompt += '\n\n';

        if (index > 0) {
            prompt += `这是你上一次阅读的结尾部分：
---
${memoryQueue[index - 1].content.slice(-500)}
---

`;
            prompt += `这是当前你对该作品的记忆：
${JSON.stringify(generatedWorldbook, null, 2)}

`;
        }

        prompt += `这是你现在阅读的部分：
---
${memory.content}
---

`;

        if (index === 0) {
            prompt += `现在开始分析小说内容，请专注于提取文中实际出现的信息：

`;
        } else {
            if (incrementalOutputMode) {
                prompt += `请基于新内容**增量更新**世界书，采用**点对点覆盖**模式：

**增量输出规则**：
1. **只输出本次需要变更的条目**，不要输出完整的世界书
2. **新增条目**：直接输出新条目的完整内容
3. **修改条目**：输出该条目的完整新内容（会覆盖原有内容）
4. **未变更的条目不要输出**，系统会自动保留
5. **关键词合并**：新关键词会自动与原有关键词合并，无需重复原有关键词

**示例**：如果只有"张三"角色有新信息，只需输出：
{"角色": {"张三": {"关键词": ["新称呼"], "内容": "更新后的完整描述..."}}}

`;
            } else {
                prompt += `请基于新内容**累积补充**世界书，注意以下要点：

**重要规则**：
1. **已有角色**：如果角色已存在，请在原有内容基础上**追加新信息**，不要删除或覆盖已有描述
2. **新角色**：如果是新出现的角色，添加为新条目
3. **剧情大纲**：持续追踪主线发展，**追加新的剧情进展**而不是重写
4. **关键词**：为已有条目补充新的关键词（如新称呼、新关系等）
5. **保持完整性**：确保之前章节提取的重要信息不会丢失

`;
            }
        }

        prompt += `请直接输出JSON格式的结果，不要添加任何代码块标记或解释文字。`;

        console.log(`=== 第${index + 1}步 Prompt ===`);
        console.log(prompt);
        console.log('=====================');

        try {
            console.log(`开始调用API处理第${index + 1}个记忆块...`);
            updateProgress(progress, `正在调用API: ${memory.title} (${index + 1}/${memoryQueue.length})`);

            const response = await callAPI(prompt);

            // API调用完成后再次检查暂停状态
            if (isProcessingStopped) {
                console.log(`API调用完成后检测到暂停，跳过后续处理`);
                return;
            }

            console.log(`API调用完成，返回内容长度: ${response.length}`);
            console.log(response);
            
            // 检查返回内容是否包含token超限错误
            const containsTokenError = /max|exceed|token.*limit|input.*token|INVALID_ARGUMENT/i.test(response);
            
            if (containsTokenError) {
                console.log(`⚠️ 返回内容包含token超限错误，分裂所有后续记忆...`);
                updateProgress(progress, `🔀 上下文超限，分裂所有后续记忆...`);
                
                splitAllRemainingMemories(index);
                updateMemoryQueueUI();
                await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
                
                throw new Error(`返回内容包含token超限错误，已分裂所有后续记忆`);
            }
            
            // 清理和解析返回的JSON
            let memoryUpdate;
            try {
                memoryUpdate = JSON.parse(response);
                console.log('✅ JSON直接解析成功');
            } catch (jsonError) {
                console.log('直接JSON解析失败，开始清理...');
                let cleanResponse = response.trim();
                
                cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
                
                if (!cleanResponse.startsWith('{')) {
                    const firstBrace = cleanResponse.indexOf('{');
                    const lastBrace = cleanResponse.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                        cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
                    }
                }
                
                try {
                    memoryUpdate = JSON.parse(cleanResponse);
                    console.log('✅ JSON清理后解析成功');
                } catch (secondError) {
                    console.error('❌ JSON解析仍然失败');
                    
                    // 检查内容完整性
                    const openBraces = (cleanResponse.match(/{/g) || []).length;
                    const closeBraces = (cleanResponse.match(/}/g) || []).length;
                    const missingBraces = openBraces - closeBraces;

                    if (missingBraces > 0) {
                        console.log(`⚠️ 检测到内容不完整：缺少${missingBraces}个闭合括号`);
                        
                        try {
                            memoryUpdate = JSON.parse(cleanResponse + '}'.repeat(missingBraces));
                            console.log(`✅ 自动添加${missingBraces}个闭合括号后解析成功`);
                        } catch (autoFixError) {
                            console.log('❌ 自动添加闭合括号后仍然失败，尝试正则提取...');
                            
                            const regexExtractedData = extractWorldbookDataByRegex(cleanResponse);
                            
                            if (regexExtractedData && Object.keys(regexExtractedData).length > 0) {
                                console.log('✅ 正则提取成功！');
                                memoryUpdate = regexExtractedData;
                            } else {
                                // 尝试API纠正
                                console.log('🔧 尝试调用API纠正JSON格式...');
                                updateProgress(progress, `JSON格式错误，正在调用AI纠正: ${memory.title}`);
                                
                                try {
                                    const fixPrompt = getLanguagePrefix() + `你是专业的JSON修复专家。请将下面的JSON文本修复为有效的JSON格式。

## 核心要求
1. **只修复格式**：保持原有数据语义不变
2. **输出必须是单个JSON对象**
3. **禁止任何额外输出**

## 需要修复的JSON文本
${cleanResponse}
`;

                                    const fixedResponse = await callAPI(fixPrompt);
                                    let cleanedFixedResponse = fixedResponse.trim();
                                    cleanedFixedResponse = cleanedFixedResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

                                    const fb = cleanedFixedResponse.indexOf('{');
                                    const lb = cleanedFixedResponse.lastIndexOf('}');
                                    if (fb !== -1 && lb !== -1 && lb > fb) {
                                        cleanedFixedResponse = cleanedFixedResponse.substring(fb, lb + 1);
                                    }

                                    memoryUpdate = JSON.parse(cleanedFixedResponse);
                                    console.log('✅ JSON格式纠正成功！');

                                } catch (fixError) {
                                    console.error('❌ JSON格式纠正也失败');
                                    
                                    memoryUpdate = {
                                        '知识书': {
                                            [`第${index + 1}个记忆块_解析失败`]: {
                                                '关键词': ['解析失败'],
                                                '内容': `**解析失败原因**: ${secondError.message}\n\n**原始响应预览**:\n${cleanResponse.substring(0, 2000)}...`
                                            }
                                        }
                                    };
                                }
                            }
                        }
                    } else {
                        const regexExtractedData = extractWorldbookDataByRegex(cleanResponse);
                        
                        if (regexExtractedData && Object.keys(regexExtractedData).length > 0) {
                            console.log('✅ 正则提取成功！');
                            memoryUpdate = regexExtractedData;
                        } else {
                            throw new Error(`JSON解析失败: ${secondError.message}`);
                        }
                    }
                }
            }
            
            // 合并到主世界书
            const changedEntries = await mergeWorldbookDataWithHistory(generatedWorldbook, memoryUpdate, index, memory.title);
            
            if (incrementalOutputMode && changedEntries.length > 0) {
                console.log(`📝 第${index + 1}个记忆块变更 ${changedEntries.length} 个条目`);
            }
            
            memory.processed = true;
            updateMemoryQueueUI();
            console.log(`记忆块 ${index + 1} 处理完成`);
            
        } catch (error) {
            console.error(`处理记忆块 ${index + 1} 时出错 (第${retryCount + 1}次尝试):`, error);
            
            const errorMsg = error.message || '';
            const isTokenLimitError = errorMsg.includes('max_prompt_tokens') || 
                                       errorMsg.includes('exceeded') ||
                                       errorMsg.includes('input tokens') ||
                                       (errorMsg.includes('20015') && errorMsg.includes('limit'));
            
            if (isTokenLimitError) {
                console.log(`⚠️ 检测到token超限错误，直接分裂记忆: ${memory.title}`);
                updateProgress((index / memoryQueue.length) * 100, `🔀 字数超限，正在分裂记忆: ${memory.title}`);
                
                const splitResult = splitMemoryIntoTwo(index);
                if (splitResult) {
                    console.log(`✅ 记忆分裂成功`);
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const part1Index = memoryQueue.indexOf(splitResult.part1);
                    await processMemoryChunk(part1Index, 0);
                    
                    const part2Index = memoryQueue.indexOf(splitResult.part2);
                    await processMemoryChunk(part2Index, 0);
                    
                    return;
                } else {
                    console.error(`❌ 记忆分裂失败: ${memory.title}`);
                    memory.processed = true;
                    memory.failed = true;
                    memory.failedError = error.message;
                    if (!failedMemoryQueue.find(m => m.index === index)) {
                        failedMemoryQueue.push({ index, memory, error: error.message });
                    }
                    updateMemoryQueueUI();
                    return;
                }
            }
            
            // 非token超限错误，使用重试机制
            if (retryCount < maxRetries) {
                console.log(`准备重试，当前重试次数: ${retryCount + 1}/${maxRetries}`);
                const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                updateProgress((index / memoryQueue.length) * 100, `处理失败，${retryDelay/1000}秒后重试: ${memory.title}`);
                
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                return await processMemoryChunk(index, retryCount + 1);
            } else {
                console.error(`记忆块 ${index + 1} 重试${maxRetries}次后仍然失败`);
                updateProgress((index / memoryQueue.length) * 100, `处理失败 (已重试${maxRetries}次): ${memory.title}`);
                
                memory.processed = true;
                memory.failed = true;
                memory.failedError = error.message;
                
                if (!failedMemoryQueue.find(m => m.index === index)) {
                    failedMemoryQueue.push({ index, memory, error: error.message });
                }
                
                updateMemoryQueueUI();
            }
        }

        if (memory.processed) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async function startAIProcessing() {
        showProgressSection(true);
        isProcessingStopped = false;

        generatedWorldbook = {
            地图环境: {},
            剧情节点: {},
            角色: {},
            知识书: {}
        };

        try {
            for (let i = 0; i < memoryQueue.length; i++) {
                if (isProcessingStopped) {
                    console.log('处理被用户停止');
                    updateProgress((i / memoryQueue.length) * 100, `⏸️ 已暂停处理 (${i}/${memoryQueue.length})`);
                    await MemoryHistoryDB.saveState(i);
                    alert(`处理已暂停！\n当前进度: ${i}/${memoryQueue.length}\n\n进度已保存，刷新页面后可继续。`);
                    break;
                }
                
                if (isRepairingMemories) {
                    console.log(`检测到修复模式，暂停当前处理于索引 ${i}`);
                    currentProcessingIndex = i;
                    updateProgress((i / memoryQueue.length) * 100, `⏸️ 修复记忆中，已暂停处理 (${i}/${memoryQueue.length})`);
                    
                    while (isRepairingMemories) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    console.log(`修复完成，从索引 ${i} 继续处理`);
                }
                
                await processMemoryChunk(i);
                
                await MemoryHistoryDB.saveState(i + 1);
            }
            
            const failedCount = memoryQueue.filter(m => m.failed === true).length;
            
            if (failedCount > 0) {
                updateProgress(100, `⚠️ 处理完成，但有 ${failedCount} 个记忆块失败，请点击修复`);
            } else {
                updateProgress(100, '✅ 所有记忆块处理完成！');
            }
            
            showResultSection(true);
            updateWorldbookPreview();
            
            console.log('AI记忆大师处理完成');
            
            if (!isProcessingStopped) {
                await MemoryHistoryDB.saveState(memoryQueue.length);
                console.log('✅ 转换完成，状态已保存');
            }
            
        } catch (error) {
            console.error('AI处理过程中发生错误:', error);
            updateProgress(0, `❌ 处理过程出错: ${error.message}`);
            alert(`处理失败: ${error.message}\n\n进度已保存，可以稍后继续。`);
        }
    }

    // ========== 修复失败记忆 ==========
    async function repairSingleMemory(index) {
        const memory = memoryQueue[index];
        const enableLiteraryStyle = settings.enableLiteraryStyle;
        const enablePlotOutline = settings.enablePlotOutline;

        let prompt = getLanguagePrefix() + `你是专业的小说世界书生成专家。请仔细阅读提供的小说内容，提取关键信息，生成世界书条目。

## 输出格式
请生成标准JSON格式：
{
"角色": { "角色名": { "关键词": ["..."], "内容": "..." } },
"地点": { "地点名": { "关键词": ["..."], "内容": "..." } },
"组织": { "组织名": { "关键词": ["..."], "内容": "..." } }${enablePlotOutline ? `,
"剧情大纲": { "主线剧情": { "关键词": ["主线"], "内容": "..." } }` : ''}${enableLiteraryStyle ? `,
"文风配置": { "作品文风": { "关键词": ["文风"], "内容": "..." } }` : ''}
}

直接输出更新后的JSON，保持一致性，不要包含代码块标记。
`;

        if (Object.keys(generatedWorldbook).length > 0) {
            prompt += `当前记忆：\n${JSON.stringify(generatedWorldbook, null, 2)}\n\n`;
        }

        prompt += `阅读内容：\n---\n${memory.content}\n---\n\n请基于内容更新世界书，直接输出JSON。`;

        console.log(`=== 修复记忆 第${index + 1}步 Prompt ===`);
        console.log(prompt);

        const response = await callAPI(prompt);
        let memoryUpdate;

        try {
            memoryUpdate = JSON.parse(response);
        } catch (jsonError) {
            let cleanResponse = response.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '');
            const firstBrace = cleanResponse.indexOf('{');
            const lastBrace = cleanResponse.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
            }
            
            try {
                memoryUpdate = JSON.parse(cleanResponse);
            } catch (secondError) {
                const openBraces = (cleanResponse.match(/{/g) || []).length;
                const closeBraces = (cleanResponse.match(/}/g) || []).length;
                if (openBraces > closeBraces) {
                    try {
                        memoryUpdate = JSON.parse(cleanResponse + '}'.repeat(openBraces - closeBraces));
                    } catch (e) {
                        const regexData = extractWorldbookDataByRegex(cleanResponse);
                        if (regexData && Object.keys(regexData).length > 0) {
                            memoryUpdate = regexData;
                        } else {
                            throw new Error(`JSON解析失败: ${secondError.message}`);
                        }
                    }
                } else {
                    const regexData = extractWorldbookDataByRegex(cleanResponse);
                    if (regexData && Object.keys(regexData).length > 0) {
                        memoryUpdate = regexData;
                    } else {
                        throw new Error(`JSON解析失败: ${secondError.message}`);
                    }
                }
            }
        }

        const memoryTitle = `记忆-修复-${memory.title}`;
        await mergeWorldbookDataWithHistory(generatedWorldbook, memoryUpdate, index, memoryTitle);
        console.log(`记忆块 ${index + 1} 修复完成`);
    }

    async function repairMemoryWithSplit(memoryIndex, stats) {
        const memory = memoryQueue[memoryIndex];
        if (!memory) return;
        
        updateProgress((memoryIndex / memoryQueue.length) * 100, `正在修复: ${memory.title}`);
        
        try {
            await repairSingleMemory(memoryIndex);
            memory.failed = false;
            memory.failedError = null;
            memory.processed = true;
            stats.successCount++;
            console.log(`✅ 修复成功: ${memory.title}`);
            updateMemoryQueueUI();
            await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            const errorMsg = error.message || '';
            const isTokenLimitError = errorMsg.includes('max_prompt_tokens') || 
                                       errorMsg.includes('exceeded') ||
                                       errorMsg.includes('input tokens') ||
                                       (errorMsg.includes('20015') && errorMsg.includes('limit'));
            
            if (isTokenLimitError) {
                console.log(`⚠️ 检测到token超限错误，开始分裂记忆: ${memory.title}`);
                updateProgress((memoryIndex / memoryQueue.length) * 100, `🔀 正在分裂记忆: ${memory.title}`);
                
                const splitResult = splitMemoryIntoTwo(memoryIndex);
                if (splitResult) {
                    console.log(`✅ 记忆分裂成功`);
                    updateMemoryQueueUI();
                    await MemoryHistoryDB.saveState(memoryQueue.filter(m => m.processed).length);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const part1Index = memoryQueue.indexOf(splitResult.part1);
                    await repairMemoryWithSplit(part1Index, stats);
                    
                    const part2Index = memoryQueue.indexOf(splitResult.part2);
                    await repairMemoryWithSplit(part2Index, stats);
                } else {
                    stats.stillFailedCount++;
                    memory.failedError = error.message;
                    console.error(`❌ 记忆分裂失败: ${memory.title}`);
                }
            } else {
                stats.stillFailedCount++;
                memory.failedError = error.message;
                console.error(`❌ 修复失败: ${memory.title}`, error);
                updateMemoryQueueUI();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async function startRepairFailedMemories() {
        const failedMemories = memoryQueue.filter(m => m.failed === true);
        if (failedMemories.length === 0) {
            alert('没有需要修复的记忆');
            return;
        }

        isRepairingMemories = true;
        console.log(`🔧 开始一键修复 ${failedMemories.length} 个失败的记忆...`);

        showProgressSection(true);
        updateProgress(0, `正在修复失败的记忆 (0/${failedMemories.length})`);

        const stats = {
            successCount: 0,
            stillFailedCount: 0
        };

        for (let i = 0; i < failedMemories.length; i++) {
            const memory = failedMemories[i];
            const memoryIndex = memoryQueue.indexOf(memory);
            
            if (memoryIndex === -1) continue;
            
            updateProgress(((i + 1) / failedMemories.length) * 100, `正在修复: ${memory.title}`);
            
            await repairMemoryWithSplit(memoryIndex, stats);
        }

        failedMemoryQueue = failedMemoryQueue.filter(item => {
            const memory = memoryQueue[item.index];
            return memory && memory.failed === true;
        });

        updateProgress(100, `修复完成: 成功 ${stats.successCount} 个, 仍失败 ${stats.stillFailedCount} 个`);

        await MemoryHistoryDB.saveState(memoryQueue.length);

        isRepairingMemories = false;
        console.log(`🔧 修复模式结束`);

        if (stats.stillFailedCount > 0) {
            alert(`修复完成！\n成功: ${stats.successCount} 个\n仍失败: ${stats.stillFailedCount} 个\n\n失败的记忆仍显示❗，可继续点击修复。`);
        } else {
            alert(`全部修复成功！共修复 ${stats.successCount} 个记忆块。`);
        }
        
        updateMemoryQueueUI();
    }

    // ========== 导出功能 ==========
    function convertGeneratedWorldbookToStandard(generatedWb) {
        const standardWorldbook = [];
        let entryId = 0;

        const triggerCategories = new Set(['地点', '剧情大纲']);

        Object.keys(generatedWb).forEach(category => {
            const categoryData = generatedWb[category];

            const isTriggerCategory = triggerCategories.has(category);
            const constant = !isTriggerCategory;
            const selective = isTriggerCategory;
            
            if (typeof categoryData === 'object' && categoryData !== null) {
                Object.keys(categoryData).forEach(itemName => {
                    const itemData = categoryData[itemName];
                    
                    if (typeof itemData === 'object' && itemData.关键词 && itemData.内容) {
                        standardWorldbook.push({
                            id: entryId++,
                            keys: Array.isArray(itemData.关键词) ? itemData.关键词 : [itemName],
                            secondary_keys: [],
                            comment: `[${category}] ${itemName}`,
                            content: itemData.内容,
                            priority: 100,
                            enabled: true,
                            position: 'before_char',
                            constant,
                            selective,
                            secondary_keys_logic: 'any',
                            use_regex: false,
                            prevent_recursion: false,
                            group: category,
                            scope: 'chat',
                            probability: 100,
                            wb_depth: 4,
                            match_whole_words: false,
                            case_sensitive: false,
                            children: []
                        });
                    } else if (typeof itemData === 'string') {
                        standardWorldbook.push({
                            id: entryId++,
                            keys: [itemName],
                            secondary_keys: [],
                            comment: `[${category}] ${itemName}`,
                            content: itemData,
                            priority: 100,
                            enabled: true,
                            position: 'before_char',
                            constant,
                            selective,
                            secondary_keys_logic: 'any',
                            use_regex: false,
                            prevent_recursion: false,
                            group: category,
                            scope: 'chat',
                            probability: 100,
                            wb_depth: 4,
                            match_whole_words: false,
                            case_sensitive: false,
                            children: []
                        });
                    }
                });
            }
        });

        return standardWorldbook;
    }

    function convertToSillyTavernFormat(worldbook) {
        const entries = [];
        let entryId = 0;

        const triggerCategories = new Set(['地点', '剧情大纲']);

        for (const [category, categoryData] of Object.entries(worldbook)) {
            if (typeof categoryData !== 'object' || categoryData === null) continue;
            
            const isTriggerCategory = triggerCategories.has(category);
            const constant = !isTriggerCategory;
            const selective = isTriggerCategory;

            for (const [itemName, itemData] of Object.entries(categoryData)) {
                if (typeof itemData !== 'object' || itemData === null) continue;
                
                if (itemData.关键词 && itemData.内容) {
                    const keywords = Array.isArray(itemData.关键词) ? itemData.关键词 : [itemData.关键词];
                    
                    const cleanKeywords = keywords.map(keyword => {
                        const keywordStr = String(keyword).trim();
                        return keywordStr.replace(/[-_\s]+/g, '');
                    }).filter(keyword => 
                        keyword.length > 0 && 
                        keyword.length <= 20 && 
                        !['的', '了', '在', '是', '有', '和', '与', '或', '但'].includes(keyword)
                    );
                    
                    if (cleanKeywords.length === 0) {
                        cleanKeywords.push(itemName);
                    }
                    
                    const uniqueKeywords = [...new Set(cleanKeywords)];
                    
                    let content = String(itemData.内容).trim();
                    
                    entries.push({
                        uid: entryId++,
                        key: uniqueKeywords,
                        keysecondary: [],
                        comment: `${category} - ${itemName}`,
                        content: content,
                        constant,
                        selective,
                        selectiveLogic: 0,
                        addMemo: true,
                        order: entryId * 100,
                        position: 0,
                        disable: false,
                        excludeRecursion: false,
                        preventRecursion: false,
                        delayUntilRecursion: false,
                        probability: 100,
                        depth: 4,
                        group: category,
                        groupOverride: false,
                        groupWeight: 100,
                        scanDepth: null,
                        caseSensitive: false,
                        matchWholeWords: true,
                        useGroupScoring: null,
                        automationId: '',
                        role: 0,
                        vectorized: false,
                        sticky: null,
                        cooldown: null,
                        delay: null
                    });
                }
            }
        }

        if (entries.length === 0) {
            entries.push({
                uid: 0,
                key: ['默认条目'],
                keysecondary: [],
                comment: '世界书转换时生成的默认条目',
                content: '这是一个从小说自动生成的世界书条目。',
                constant: false,
                selective: true,
                selectiveLogic: 0,
                addMemo: true,
                order: 100,
                position: 0,
                disable: false,
                excludeRecursion: false,
                preventRecursion: false,
                delayUntilRecursion: false,
                probability: 100,
                depth: 4,
                group: '默认',
                groupOverride: false,
                groupWeight: 100,
                scanDepth: null,
                caseSensitive: false,
                matchWholeWords: true,
                useGroupScoring: null,
                automationId: '',
                role: 0,
                vectorized: false,
                sticky: null,
                cooldown: null,
                delay: null
            });
        }

        return {
            entries: entries,
            originalData: {
                name: '小说转换的世界书',
                description: '由TXT转世界书功能生成',
                version: 1,
                author: 'TxtToWorldbook',
                tags: ['小说', 'AI生成', '世界书'],
                source: 'TxtToWorldbook'
            }
        };
    }

    function exportWorldbook() {
        const timeString = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(/[:/\s]/g, '').replace(/,/g, '-');

        let fileName = '转换数据';
        if (currentFile && currentFile.name) {
            const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
            fileName = `${baseName}-世界书生成数据-${timeString}`;
        } else {
            fileName = `转换数据-${timeString}`;
        }

        const blob = new Blob([JSON.stringify(generatedWorldbook, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportToSillyTavern() {
        const timeString = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(/[:/\s]/g, '').replace(/,/g, '-');

        try {
            const sillyTavernWorldbook = convertToSillyTavernFormat(generatedWorldbook);
            
            let fileName = '酒馆书';
            if (currentFile && currentFile.name) {
                const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
                fileName = `${baseName}-世界书参考-${timeString}`;
            } else {
                fileName = `酒馆书-${timeString}`;
            }
            
            const blob = new Blob([JSON.stringify(sillyTavernWorldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.json';
            a.click();
            URL.revokeObjectURL(url);
            
            alert('世界书已转换为SillyTavern格式并下载，请在SillyTavern中手动导入该文件。');
        } catch (error) {
            console.error('转换为SillyTavern格式失败:', error);
            alert('转换失败：' + error.message);
        }
    }

    // ========== 帮助弹窗 ==========
    function showHelpModal() {
        const existingHelp = document.getElementById('ttw-help-modal');
        if (existingHelp) existingHelp.remove();

        const helpModal = document.createElement('div');
        helpModal.id = 'ttw-help-modal';
        helpModal.className = 'ttw-modal-container';
        helpModal.innerHTML = `
            <div class="ttw-modal" style="max-width: 600px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">❓ TXT转世界书使用帮助</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <div class="ttw-help-section">
                        <h4 style="color: #e67e22; margin: 0 0 10px 0;">📌 基本功能</h4>
                        <p style="margin: 0 0 8px 0; line-height: 1.6; color: #ccc;">
                            将TXT格式的小说文本转换为SillyTavern世界书格式，自动提取角色、地点、组织等信息。
                        </p>
                    </div>
                    
                    <div class="ttw-help-section" style="margin-top: 16px;">
                        <h4 style="color: #3498db; margin: 0 0 10px 0;">⚙️ API设置说明</h4>
                        <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: #ccc;">
                            <li><b>Gemini</b>：Google官方API，需要API Key</li>
                            <li><b>Gemini代理</b>：第三方代理服务，需要Endpoint和Key</li>
                            <li><b>DeepSeek</b>：DeepSeek官方API</li>
                            <li><b>OpenAI兼容</b>：支持本地模型（如LM Studio、Ollama）或其他兼容接口</li>
                        </ul>
                    </div>
                    
                    <div class="ttw-help-section" style="margin-top: 16px;">
                        <h4 style="color: #27ae60; margin: 0 0 10px 0;">🔧 OpenAI兼容模式</h4>
                        <p style="margin: 0 0 8px 0; line-height: 1.6; color: #ccc;">
                            使用本地模型或第三方API时：
                        </p>
                        <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: #ccc;">
                            <li><b>API Endpoint</b>：填写完整的API地址，如 <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px;">http://127.0.0.1:5000/v1</code></li>
                            <li><b>拉取模型</b>：自动获取可用的模型列表</li>
                            <li><b>快速测试</b>：发送"Hi"测试模型是否正常工作</li>
                        </ul>
                    </div>
                    
                    <div class="ttw-help-section" style="margin-top: 16px;">
                        <h4 style="color: #9b59b6; margin: 0 0 10px 0;">📝 增量输出模式</h4>
                        <p style="margin: 0 0 8px 0; line-height: 1.6; color: #ccc;">
                            开启后，AI每次只输出变更的条目，而非完整世界书。这可以：
                        </p>
                        <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: #ccc;">
                            <li>大幅减少Token消耗</li>
                            <li>加快处理速度</li>
                            <li>避免上下文长度限制</li>
                        </ul>
                    </div>
                    
                    <div class="ttw-help-section" style="margin-top: 16px;">
                        <h4 style="color: #e74c3c; margin: 0 0 10px 0;">🔀 自动分裂机制</h4>
                        <p style="margin: 0 0 8px 0; line-height: 1.6; color: #ccc;">
                            当检测到Token超限时，系统会自动将记忆块分裂成更小的部分重新处理，无需手动干预。
                        </p>
                    </div>
                    
                    <div class="ttw-help-section" style="margin-top: 16px;">
                        <h4 style="color: #f39c12; margin: 0 0 10px 0;">📜 历史追踪</h4>
                        <p style="margin: 0 0 8px 0; line-height: 1.6; color: #ccc;">
                            每次处理都会记录变更历史，支持：
                        </p>
                        <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: #ccc;">
                            <li>查看每个记忆块的变更详情</li>
                            <li>回退到任意历史版本</li>
                            <li>刷新页面后自动恢复进度</li>
                        </ul>
                    </div>
                    
                    <div class="ttw-help-section" style="margin-top: 16px;">
                        <h4 style="color: #1abc9c; margin: 0 0 10px 0;">💡 使用技巧</h4>
                        <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: #ccc;">
                            <li>建议每块字数设置为 10w-20w（DeepSeek上限10w，Gemini可以设置20w）</li>
                            <li>处理中途可以暂停，刷新后继续</li>
                            <li>失败的记忆块可以一键修复</li>
                            <li>生成完成后可以用AI优化世界书</li>
                        </ul>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn ttw-btn-primary" id="ttw-close-help">我知道了</button>
                </div>
            </div>
        `;

        document.body.appendChild(helpModal);

        // 关闭弹窗函数
        const closeHelpModal = (e) => {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            helpModal.remove();
            document.removeEventListener('keydown', helpEscHandler, true);
        };

        // ESC 关闭 - 使用捕获阶段，优先处理
        const helpEscHandler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                closeHelpModal();
            }
        };
        document.addEventListener('keydown', helpEscHandler, true);

        // 关闭按钮点击
        helpModal.querySelector('.ttw-modal-close').addEventListener('click', (e) => {
            closeHelpModal(e);
        }, false);

        // "我知道了" 按钮点击
        helpModal.querySelector('#ttw-close-help').addEventListener('click', (e) => {
            closeHelpModal(e);
        }, false);

        // 阻止弹窗内部点击冒泡
        const helpModalInner = helpModal.querySelector('.ttw-modal');
        helpModalInner.addEventListener('click', (e) => {
            e.stopPropagation();
        }, false);

        helpModalInner.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        }, false);

        helpModalInner.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // 点击容器背景关闭
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                closeHelpModal(e);
            }
        }, false);

        helpModal.addEventListener('mousedown', (e) => {
            if (e.target === helpModal) {
                e.stopPropagation();
            }
        }, false);

        helpModal.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }

    // ========== UI 相关 ==========
    let modalContainer = null;

    function createModal() {
        if (modalContainer) {
            modalContainer.remove();
        }

        modalContainer = document.createElement('div');
        modalContainer.id = 'txt-to-worldbook-modal';
        modalContainer.className = 'ttw-modal-container';
        modalContainer.innerHTML = `
            <div class="ttw-modal">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📚 TXT转世界书</span>
                    <div class="ttw-header-actions">
                        <span class="ttw-help-btn" title="帮助">❓</span>
                        <button class="ttw-modal-close" type="button">✕</button>
                    </div>
                </div>
                <div class="ttw-modal-body">
                    <!-- 设置区域 -->
                    <div class="ttw-section ttw-settings-section">
                        <div class="ttw-section-header" data-section="settings">
                            <span>⚙️ API设置</span>
                            <span class="ttw-collapse-icon">▼</span>
                        </div>
                        <div class="ttw-section-content" id="ttw-settings-content">
                            <div class="ttw-setting-item">
                                <label>API提供商</label>
                                <select id="ttw-api-provider">
                                    <option value="gemini">Gemini</option>
                                    <option value="gemini-proxy">Gemini代理</option>
                                    <option value="deepseek">DeepSeek</option>
                                    <option value="openai-compatible">OpenAI兼容</option>
                                </select>
                            </div>
                            <div class="ttw-setting-item">
                                <label>API Key <span style="opacity: 0.6; font-size: 11px;">(本地模型可留空)</span></label>
                                <input type="password" id="ttw-api-key" placeholder="输入API Key">
                            </div>
                            <div class="ttw-setting-item" id="ttw-endpoint-container" style="display: none;">
                                <label>API Endpoint</label>
                                <input type="text" id="ttw-api-endpoint" placeholder="https://... 或 http://127.0.0.1:5000/v1">
                            </div>
                            <div class="ttw-setting-item" id="ttw-model-input-container">
                                <label>模型</label>
                                <input type="text" id="ttw-api-model" value="gemini-2.5-flash" placeholder="模型名称">
                            </div>
                            <!-- OpenAI兼容模式的模型选择下拉框（拉取后替换输入框） -->
                            <div class="ttw-setting-item" id="ttw-model-select-container" style="display: none;">
                                <label>模型</label>
                                <select id="ttw-model-select">
                                    <option value="">-- 请先拉取模型列表 --</option>
                                </select>
                            </div>
                            <!-- OpenAI兼容模式的模型操作按钮 -->
                            <div class="ttw-model-actions" id="ttw-model-actions" style="display: none;">
                                <button id="ttw-fetch-models" class="ttw-btn ttw-btn-small">🔄 拉取模型</button>
                                <button id="ttw-quick-test" class="ttw-btn ttw-btn-small">⚡ 快速测试</button>
                                <span id="ttw-model-status" class="ttw-model-status"></span>
                            </div>
                            <div class="ttw-setting-item">
                                <label>每块字数</label>
                                <input type="number" id="ttw-chunk-size" value="100000" min="1000" max="500000">
                            </div>
                            <div class="ttw-checkbox-group">
                                <label class="ttw-checkbox-label">
                                    <input type="checkbox" id="ttw-incremental-mode" checked>
                                    <span>📝 增量输出模式</span>
                                </label>
                            </div>
                            <!-- 自定义提取分类 -->
                            <div class="ttw-custom-categories" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                    <span style="color: #e67e22; font-weight: bold;">🏷️ 自定义提取分类</span>
                                    <div>
                                        <button class="ttw-btn ttw-btn-small" id="ttw-add-category-btn" style="background: #e67e22; margin-right: 5px;">➕ 添加</button>
                                        <button class="ttw-btn ttw-btn-small" id="ttw-reset-categories-btn" style="background: #6c757d;">🔄 重置</button>
                                    </div>
                                </div>
                                <p style="margin: 0 0 10px 0; font-size: 12px; color: #888;">勾选要提取的分类，可自定义添加道具、玩法、章节剧情等</p>
                                <div id="ttw-categories-list" style="max-height: 200px; overflow-y: auto;"></div>
                            </div>
                            <!-- 提示词配置区域 -->
                            <div class="ttw-prompt-config">
                                <div class="ttw-prompt-config-header">
                                    <span>📝 提示词配置</span>
                                    <button id="ttw-preview-prompt" class="ttw-btn ttw-btn-small">👁️ 预览最终提示词</button>
                                </div>

                                <!-- 世界书词条（核心，必需） -->
                                <div class="ttw-prompt-section ttw-prompt-worldbook">
                                    <div class="ttw-prompt-header" data-target="ttw-worldbook-content">
                                        <div class="ttw-prompt-header-left">
                                            <span class="ttw-prompt-icon">📚</span>
                                            <span class="ttw-prompt-title">世界书词条</span>
                                            <span class="ttw-prompt-badge ttw-badge-required">必需</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div class="ttw-prompt-content" id="ttw-worldbook-content" style="display: none;">
                                        <div class="ttw-prompt-hint">
                                            核心提示词，用于提取角色、地点、组织等信息。留空使用默认提示词。
                                        </div>
                                        <textarea id="ttw-worldbook-prompt" rows="8" placeholder="留空使用默认提示词..."></textarea>
                                        <div class="ttw-prompt-actions">
                                            <button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="worldbook">🔄 恢复默认</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 剧情大纲（可选） -->
                                <div class="ttw-prompt-section ttw-prompt-plot">
                                    <div class="ttw-prompt-header" data-target="ttw-plot-content">
                                        <div class="ttw-prompt-header-left">
                                            <label class="ttw-prompt-enable-label">
                                                <input type="checkbox" id="ttw-enable-plot">
                                                <span class="ttw-prompt-icon">📖</span>
                                                <span class="ttw-prompt-title">剧情大纲</span>
                                            </label>
                                            <span class="ttw-prompt-badge ttw-badge-optional">可选</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div class="ttw-prompt-content" id="ttw-plot-content" style="display: none;">
                                        <div class="ttw-prompt-hint">
                                            启用后将提取主线剧情、支线剧情等信息。留空使用默认提示词。
                                        </div>
                                        <textarea id="ttw-plot-prompt" rows="6" placeholder="留空使用默认提示词..."></textarea>
                                        <div class="ttw-prompt-actions">
                                            <button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="plot">🔄 恢复默认</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 文风配置（可选） -->
                                <div class="ttw-prompt-section ttw-prompt-style">
                                    <div class="ttw-prompt-header" data-target="ttw-style-content">
                                        <div class="ttw-prompt-header-left">
                                            <label class="ttw-prompt-enable-label">
                                                <input type="checkbox" id="ttw-enable-style">
                                                <span class="ttw-prompt-icon">🎨</span>
                                                <span class="ttw-prompt-title">文风配置</span>
                                            </label>
                                            <span class="ttw-prompt-badge ttw-badge-optional">可选</span>
                                        </div>
                                        <span class="ttw-collapse-icon">▶</span>
                                    </div>
                                    <div class="ttw-prompt-content" id="ttw-style-content" style="display: none;">
                                        <div class="ttw-prompt-hint">
                                            启用后将分析作品文风特点。留空使用默认提示词。
                                        </div>
                                        <textarea id="ttw-style-prompt" rows="6" placeholder="留空使用默认提示词..."></textarea>
                                        <div class="ttw-prompt-actions">
                                            <button class="ttw-btn ttw-btn-small ttw-reset-prompt" data-type="style">🔄 恢复默认</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 文件上传区域 -->
                    <div class="ttw-section ttw-upload-section">
                        <div class="ttw-section-header">
                            <span>📄 文件上传</span>
                        </div>
                        <div class="ttw-section-content">
                            <div class="ttw-upload-area" id="ttw-upload-area">
                                <div class="ttw-upload-icon">📁</div>
                                <div class="ttw-upload-text">点击或拖拽TXT文件到此处</div>
                                <input type="file" id="ttw-file-input" accept=".txt" style="display: none;">
                            </div>
                            <div class="ttw-file-info" id="ttw-file-info" style="display: none;">
                                <span id="ttw-file-name"></span>
                                <span id="ttw-file-size"></span>
                                <button id="ttw-clear-file" class="ttw-btn-small">清除</button>
                            </div>
                        </div>
                    </div>

                    <!-- 记忆队列区域 -->
                    <div class="ttw-section ttw-queue-section" id="ttw-queue-section" style="display: none;">
                        <div class="ttw-section-header">
                            <span>📋 记忆队列</span>
                        </div>
                        <div class="ttw-section-content">
                            <div class="ttw-memory-queue" id="ttw-memory-queue"></div>
                        </div>
                    </div>

                    <!-- 进度区域 -->
                    <div class="ttw-section ttw-progress-section" id="ttw-progress-section" style="display: none;">
                        <div class="ttw-section-header">
                            <span>⏳ 处理进度</span>
                        </div>
                        <div class="ttw-section-content">
                            <div class="ttw-progress-bar">
                                <div class="ttw-progress-fill" id="ttw-progress-fill"></div>
                            </div>
                            <div class="ttw-progress-text" id="ttw-progress-text">准备中...</div>
                            <div class="ttw-progress-controls" id="ttw-progress-controls">
                                <button id="ttw-stop-btn" class="ttw-btn ttw-btn-secondary">⏸️ 暂停</button>
                                <button id="ttw-repair-btn" class="ttw-btn ttw-btn-warning" style="display: none;">🔧 修复失败</button>
                            </div>
                        </div>
                    </div>

                    <!-- 结果区域 -->
                    <div class="ttw-section ttw-result-section" id="ttw-result-section" style="display: none;">
                        <div class="ttw-section-header">
                            <span>📊 生成结果</span>
                        </div>
                        <div class="ttw-section-content">
                            <div class="ttw-result-preview" id="ttw-result-preview"></div>
                            <div class="ttw-result-actions">
                                <button id="ttw-view-worldbook" class="ttw-btn">📖 查看世界书</button>
                                <button id="ttw-view-history" class="ttw-btn">📜 修改历史</button>
                                <button id="ttw-export-json" class="ttw-btn">📥 导出JSON</button>
                                <button id="ttw-export-st" class="ttw-btn ttw-btn-primary">📥 导出SillyTavern格式</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button id="ttw-start-btn" class="ttw-btn ttw-btn-primary" disabled>🚀 开始转换</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalContainer);
        addModalStyles();
        bindModalEvents();
        loadSavedSettings();
        checkAndRestoreState();
    }

    function addModalStyles() {
        if (document.getElementById('ttw-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'ttw-styles';
        styles.textContent = `
            .ttw-modal-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                padding: 20px;
                box-sizing: border-box;
            }

            .ttw-modal {
                background: var(--SmartThemeBlurTintColor, #1e1e2e);
                border: 1px solid var(--SmartThemeBorderColor, #555);
                border-radius: 12px;
                width: 100%;
                max-width: 700px;
                max-height: calc(100vh - 40px);
                display: flex;
                flex-direction: column;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                overflow: hidden;
            }

            .ttw-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
                background: rgba(0, 0, 0, 0.2);
            }

            .ttw-modal-title {
                font-weight: bold;
                font-size: 16px;
                color: #e67e22;
            }

            .ttw-header-actions {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .ttw-help-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(231, 76, 60, 0.2);
                color: #e74c3c;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid rgba(231, 76, 60, 0.4);
            }

            .ttw-help-btn:hover {
                background: rgba(231, 76, 60, 0.4);
                transform: scale(1.1);
            }

            .ttw-modal-close {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: #fff;
                font-size: 18px;
                width: 36px;
                height: 36px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ttw-modal-close:hover {
                background: rgba(255, 100, 100, 0.3);
                color: #ff6b6b;
            }

            .ttw-modal-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }

            .ttw-modal-footer {
                padding: 16px 20px;
                border-top: 1px solid var(--SmartThemeBorderColor, #444);
                background: rgba(0, 0, 0, 0.2);
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }

            .ttw-section {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                margin-bottom: 12px;
                overflow: hidden;
            }

            .ttw-section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: rgba(0, 0, 0, 0.3);
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
            }

            .ttw-section-content {
                padding: 16px;
            }

            .ttw-collapse-icon {
                font-size: 10px;
                transition: transform 0.2s;
            }

            .ttw-section.collapsed .ttw-collapse-icon {
                transform: rotate(-90deg);
            }

            .ttw-section.collapsed .ttw-section-content {
                display: none;
            }

            .ttw-setting-item {
                margin-bottom: 12px;
            }

            .ttw-setting-item > label {
                display: block;
                margin-bottom: 6px;
                font-size: 12px;
                opacity: 0.9;
            }

            .ttw-setting-item input,
            .ttw-setting-item select {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid var(--SmartThemeBorderColor, #555);
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.3);
                color: #fff;
                font-size: 13px;
                box-sizing: border-box;
            }

            .ttw-setting-item select option {
                background: #2a2a2a;
            }

            .ttw-model-actions {
                display: flex;
                gap: 10px;
                align-items: center;
                margin-bottom: 12px;
                padding: 10px;
                background: rgba(52, 152, 219, 0.1);
                border: 1px solid rgba(52, 152, 219, 0.3);
                border-radius: 6px;
            }

            .ttw-model-status {
                font-size: 12px;
                margin-left: auto;
            }

            .ttw-model-status.success {
                color: #27ae60;
            }

            .ttw-model-status.error {
                color: #e74c3c;
            }

            .ttw-model-status.loading {
                color: #f39c12;
            }

            .ttw-checkbox-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 12px;
            }

            .ttw-checkbox-label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                font-size: 13px;
            }

            .ttw-checkbox-label input {
                width: 18px;
                height: 18px;
                accent-color: #e67e22;
            }

            /* 提示词配置区域 */
            .ttw-prompt-config {
                margin-top: 16px;
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 8px;
                overflow: hidden;
            }

            .ttw-prompt-config-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 14px;
                background: rgba(230, 126, 34, 0.15);
                border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
                font-weight: 500;
            }

            .ttw-prompt-section {
                border-bottom: 1px solid var(--SmartThemeBorderColor, #333);
            }

            .ttw-prompt-section:last-child {
                border-bottom: none;
            }

            .ttw-prompt-worldbook .ttw-prompt-header {
                background: rgba(52, 152, 219, 0.1);
            }

            .ttw-prompt-plot .ttw-prompt-header {
                background: rgba(155, 89, 182, 0.1);
            }

            .ttw-prompt-style .ttw-prompt-header {
                background: rgba(46, 204, 113, 0.1);
            }

            .ttw-prompt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.2s;
            }

            .ttw-prompt-header:hover {
                filter: brightness(1.1);
            }

            .ttw-prompt-header-left {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .ttw-prompt-enable-label {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
            }

            .ttw-prompt-enable-label input {
                width: 16px;
                height: 16px;
                accent-color: #e67e22;
                cursor: pointer;
            }

            .ttw-prompt-icon {
                font-size: 14px;
            }

            .ttw-prompt-title {
                font-weight: 500;
            }

            .ttw-prompt-badge {
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                font-weight: 500;
            }

            .ttw-badge-required {
                background: rgba(52, 152, 219, 0.3);
                color: #5dade2;
            }

            .ttw-badge-optional {
                background: rgba(149, 165, 166, 0.3);
                color: #bdc3c7;
            }

            .ttw-prompt-content {
                padding: 12px 14px;
                background: rgba(0, 0, 0, 0.15);
            }

            .ttw-prompt-hint {
                font-size: 11px;
                color: #888;
                margin-bottom: 10px;
                line-height: 1.4;
            }

            .ttw-prompt-config textarea {
                width: 100%;
                min-height: 120px;
                padding: 10px;
                border: 1px solid var(--SmartThemeBorderColor, #444);
                border-radius: 4px;
                background: var(--SmartThemeBlurTintColor, #1e1e2e);
                color: inherit;
                font-family: monospace;
                font-size: 12px;
                line-height: 1.5;
                resize: vertical;
                box-sizing: border-box;
            }

            .ttw-prompt-config textarea:focus {
                outline: none;
                border-color: #e67e22;
            }

            .ttw-prompt-actions {
                display: flex;
                gap: 8px;
                margin-top: 8px;
            }

            .ttw-upload-area {
                border: 2px dashed var(--SmartThemeBorderColor, #555);
                border-radius: 8px;
                padding: 40px 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ttw-upload-area:hover {
                border-color: #e67e22;
                background: rgba(230, 126, 34, 0.1);
            }

            .ttw-upload-area.dragover {
                border-color: #e67e22;
                background: rgba(230, 126, 34, 0.2);
            }

            .ttw-upload-icon {
                font-size: 48px;
                margin-bottom: 12px;
            }

            .ttw-upload-text {
                font-size: 14px;
                opacity: 0.8;
            }

            .ttw-file-info {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 6px;
                margin-top: 12px;
            }

            .ttw-memory-queue {
                max-height: 200px;
                overflow-y: auto;
            }

            .ttw-memory-item {
                padding: 8px 12px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 4px;
                margin-bottom: 6px;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .ttw-memory-item.processed {
                opacity: 0.6;
            }

            .ttw-memory-item.failed {
                border-left: 3px solid #e74c3c;
            }

            .ttw-progress-bar {
                width: 100%;
                height: 8px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 12px;
            }

            .ttw-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #e67e22, #f39c12);
                border-radius: 4px;
                transition: width 0.3s;
                width: 0%;
            }

            .ttw-progress-text {
                font-size: 13px;
                text-align: center;
                margin-bottom: 12px;
            }

            .ttw-progress-controls {
                display: flex;
                gap: 10px;
                justify-content: center;
            }

            .ttw-result-preview {
                max-height: 300px;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 12px;
                font-size: 12px;
            }

            .ttw-result-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }

            .ttw-btn {
                padding: 10px 16px;
                border: 1px solid var(--SmartThemeBorderColor, #555);
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ttw-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .ttw-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .ttw-btn-primary {
                background: linear-gradient(135deg, #e67e22, #d35400);
                border-color: #e67e22;
            }

            .ttw-btn-primary:hover {
                background: linear-gradient(135deg, #f39c12, #e67e22);
            }

            .ttw-btn-secondary {
                background: rgba(108, 117, 125, 0.5);
            }

            .ttw-btn-warning {
                background: rgba(255, 107, 53, 0.5);
                border-color: #ff6b35;
            }

            .ttw-btn-small {
                padding: 6px 12px;
                font-size: 12px;
                border: 1px solid var(--SmartThemeBorderColor, #555);
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ttw-btn-small:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .ttw-btn-small:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .ttw-category-card {
                margin-bottom: 12px;
                border: 1px solid #e67e22;
                border-radius: 8px;
                overflow: hidden;
            }

            .ttw-category-header {
                background: linear-gradient(135deg, #e67e22, #d35400);
                padding: 10px 14px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
                display: flex;
                justify-content: space-between;
            }

            .ttw-category-content {
                background: #2d2d2d;
                display: none;
            }

            .ttw-entry-card {
                margin: 8px;
                border: 1px solid #555;
                border-radius: 6px;
                overflow: hidden;
            }

            .ttw-entry-header {
                background: #3a3a3a;
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                border-left: 3px solid #3498db;
            }

            .ttw-entry-content {
                display: none;
                background: #1c1c1c;
                padding: 12px;
            }

            .ttw-keywords {
                margin-bottom: 8px;
                padding: 8px;
                background: #252525;
                border-left: 3px solid #9b59b6;
                border-radius: 4px;
            }

            .ttw-content-text {
                padding: 8px;
                background: #252525;
                border-left: 3px solid #27ae60;
                border-radius: 4px;
                line-height: 1.6;
            }
        `;

        document.head.appendChild(styles);
    }

    function bindModalEvents() {
        // 阻止弹窗内部点击冒泡
        const modal = modalContainer.querySelector('.ttw-modal');
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        }, false);

        modal.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        }, false);

        modal.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // 关闭按钮
        modalContainer.querySelector('.ttw-modal-close').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeModal();
        }, false);

        // 帮助按钮
        modalContainer.querySelector('.ttw-help-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showHelpModal();
        }, false);

        // 点击背景关闭
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                e.stopPropagation();
                e.preventDefault();
                closeModal();
            }
        }, false);

        // 阻止容器的mousedown和touchstart冒泡
        modalContainer.addEventListener('mousedown', (e) => {
            if (e.target === modalContainer) {
                e.stopPropagation();
            }
        }, false);

        modalContainer.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // ESC 关闭 - 使用捕获阶段
        document.addEventListener('keydown', handleEscKey, true);

        // API 提供商变化
        document.getElementById('ttw-api-provider').addEventListener('change', handleProviderChange);

        // 设置变化时保存
        ['ttw-api-provider', 'ttw-api-key', 'ttw-api-endpoint', 'ttw-api-model', 'ttw-chunk-size'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', saveCurrentSettings);
            }
        });

        // 复选框变化
        ['ttw-incremental-mode', 'ttw-enable-plot', 'ttw-enable-style'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', saveCurrentSettings);
            }
        });

        // 自定义分类功能
        loadCustomCategories();
        renderCategoriesList();

        const addCategoryBtn = document.getElementById('ttw-add-category-btn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                showAddCategoryModal();
            }, false);
        }

        const resetCategoriesBtn = document.getElementById('ttw-reset-categories-btn');
        if (resetCategoriesBtn) {
            resetCategoriesBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (confirm('确定要重置为默认分类配置吗？这将清除所有自定义分类。')) {
                    resetToDefaultCategories();
                    renderCategoriesList();
                }
            }, false);
        }

        // 提示词区域折叠 - 为每个提示词section绑定折叠事件
        document.querySelectorAll('.ttw-prompt-header[data-target]').forEach(header => {
            header.addEventListener('click', (e) => {
                // 如果点击的是checkbox，不触发折叠
                if (e.target.type === 'checkbox') return;

                const targetId = header.getAttribute('data-target');
                const content = document.getElementById(targetId);
                const icon = header.querySelector('.ttw-collapse-icon');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '▶';
                }
            });
        });

        // 自定义提示词变化时保存
        ['ttw-worldbook-prompt', 'ttw-plot-prompt', 'ttw-style-prompt'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', saveCurrentSettings);
            }
        });

        // 恢复默认提示词按钮
        document.querySelectorAll('.ttw-reset-prompt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = btn.getAttribute('data-type');
                const textareaId = `ttw-${type}-prompt`;
                const textarea = document.getElementById(textareaId);
                if (textarea) {
                    textarea.value = '';
                    saveCurrentSettings();
                }
            });
        });

        // 预览提示词
        document.getElementById('ttw-preview-prompt').addEventListener('click', showPromptPreview);

        // 拉取模型按钮
        document.getElementById('ttw-fetch-models').addEventListener('click', handleFetchModels);

        // 快速测试按钮
        document.getElementById('ttw-quick-test').addEventListener('click', handleQuickTest);

        // 模型选择变化
        document.getElementById('ttw-model-select').addEventListener('change', (e) => {
            if (e.target.value) {
                document.getElementById('ttw-api-model').value = e.target.value;
                saveCurrentSettings();
            }
        });

        // 文件上传
        const uploadArea = document.getElementById('ttw-upload-area');
        const fileInput = document.getElementById('ttw-file-input');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });

        // 清除文件
        document.getElementById('ttw-clear-file').addEventListener('click', clearFile);

        // 开始转换
        document.getElementById('ttw-start-btn').addEventListener('click', startConversion);

        // 停止按钮
        document.getElementById('ttw-stop-btn').addEventListener('click', () => {
            isProcessingStopped = true;
        });

        // 修复按钮
        document.getElementById('ttw-repair-btn').addEventListener('click', startRepairFailedMemories);

        // 结果操作按钮
        document.getElementById('ttw-view-worldbook').addEventListener('click', showWorldbookView);
        document.getElementById('ttw-view-history').addEventListener('click', showHistoryView);
        document.getElementById('ttw-export-json').addEventListener('click', exportWorldbook);
        document.getElementById('ttw-export-st').addEventListener('click', exportToSillyTavern);

        // 设置区域折叠
        document.querySelector('[data-section="settings"]').addEventListener('click', () => {
            document.querySelector('.ttw-settings-section').classList.toggle('collapsed');
        });
    }

    function handleEscKey(e) {
        if (e.key === 'Escape' && modalContainer) {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            closeModal();
        }
    }

    function handleProviderChange() {
        const provider = document.getElementById('ttw-api-provider').value;
        const endpointContainer = document.getElementById('ttw-endpoint-container');
        const modelActionsContainer = document.getElementById('ttw-model-actions');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        // 显示/隐藏 Endpoint 输入框
        if (provider === 'gemini-proxy' || provider === 'openai-compatible') {
            endpointContainer.style.display = 'block';
        } else {
            endpointContainer.style.display = 'none';
        }

        // 显示/隐藏 OpenAI兼容模式的模型操作按钮
        if (provider === 'openai-compatible') {
            modelActionsContainer.style.display = 'flex';
            // 切换到OpenAI兼容模式时，默认显示输入框（用户可以手动输入或拉取模型）
            modelInputContainer.style.display = 'block';
            modelSelectContainer.style.display = 'none';
        } else {
            modelActionsContainer.style.display = 'none';
            modelSelectContainer.style.display = 'none';
            // 非OpenAI兼容模式时，显示输入框
            modelInputContainer.style.display = 'block';
        }

        // 清除状态
        updateModelStatus('', '');
    }

    function updateModelStatus(text, type) {
        const statusEl = document.getElementById('ttw-model-status');
        statusEl.textContent = text;
        statusEl.className = 'ttw-model-status';
        if (type) {
            statusEl.classList.add(type);
        }
    }

    async function handleFetchModels() {
        const fetchBtn = document.getElementById('ttw-fetch-models');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelInputContainer = document.getElementById('ttw-model-input-container');

        // 先保存当前设置
        saveCurrentSettings();

        fetchBtn.disabled = true;
        fetchBtn.textContent = '⏳ 拉取中...';
        updateModelStatus('正在拉取模型列表...', 'loading');

        try {
            const models = await fetchModelList();

            if (models.length === 0) {
                updateModelStatus('❌ 未拉取到模型', 'error');
                // 保留输入框让用户手动输入
                modelInputContainer.style.display = 'block';
                modelSelectContainer.style.display = 'none';
                return;
            }

            // 填充下拉框
            modelSelect.innerHTML = '<option value="">-- 请选择模型 --</option>';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
            });

            // 隐藏输入框，显示下拉框
            modelInputContainer.style.display = 'none';
            modelSelectContainer.style.display = 'block';

            // 如果当前模型在列表中，选中它
            const currentModel = document.getElementById('ttw-api-model').value;
            if (models.includes(currentModel)) {
                modelSelect.value = currentModel;
            } else if (models.length > 0) {
                // 如果当前模型不在列表中，选择第一个模型
                modelSelect.value = models[0];
                document.getElementById('ttw-api-model').value = models[0];
                saveCurrentSettings();
            }

            updateModelStatus(`✅ 找到 ${models.length} 个模型`, 'success');

        } catch (error) {
            console.error('拉取模型列表失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
            // 保留输入框让用户手动输入
            modelInputContainer.style.display = 'block';
            modelSelectContainer.style.display = 'none';
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🔄 拉取模型';
        }
    }

    async function handleQuickTest() {
        const testBtn = document.getElementById('ttw-quick-test');

        // 先保存当前设置
        saveCurrentSettings();

        testBtn.disabled = true;
        testBtn.textContent = '⏳ 测试中...';
        updateModelStatus('正在测试连接...', 'loading');

        try {
            const result = await quickTestModel();
            
            updateModelStatus(`✅ 测试成功 (${result.elapsed}ms)`, 'success');
            
            // 显示响应预览
            if (result.response) {
                console.log('快速测试响应:', result.response);
            }

        } catch (error) {
            console.error('快速测试失败:', error);
            updateModelStatus(`❌ ${error.message}`, 'error');
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = '⚡ 快速测试';
        }
    }

    function saveCurrentSettings() {
        settings.apiProvider = document.getElementById('ttw-api-provider').value;
        settings.apiKey = document.getElementById('ttw-api-key').value;
        settings.apiEndpoint = document.getElementById('ttw-api-endpoint').value;

        // 优先从下拉框获取模型值（如果可见），否则从输入框获取
        const modelSelectContainer = document.getElementById('ttw-model-select-container');
        const modelSelect = document.getElementById('ttw-model-select');
        const modelInput = document.getElementById('ttw-api-model');

        if (modelSelectContainer && modelSelectContainer.style.display !== 'none' && modelSelect.value) {
            settings.apiModel = modelSelect.value;
            // 同步到隐藏的输入框
            modelInput.value = modelSelect.value;
        } else {
            settings.apiModel = modelInput.value;
        }

        settings.chunkSize = parseInt(document.getElementById('ttw-chunk-size').value) || 15000;
        incrementalOutputMode = document.getElementById('ttw-incremental-mode').checked;
        settings.enablePlotOutline = document.getElementById('ttw-enable-plot').checked;
        settings.enableLiteraryStyle = document.getElementById('ttw-enable-style').checked;

        // 保存自定义提示词
        settings.customWorldbookPrompt = document.getElementById('ttw-worldbook-prompt').value;
        settings.customPlotPrompt = document.getElementById('ttw-plot-prompt').value;
        settings.customStylePrompt = document.getElementById('ttw-style-prompt').value;

        // 保存到 localStorage
        try {
            localStorage.setItem('txtToWorldbookSettings', JSON.stringify(settings));
        } catch (e) {
            console.error('保存设置失败:', e);
        }
    }

    function loadSavedSettings() {
        try {
            const saved = localStorage.getItem('txtToWorldbookSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                settings = { ...defaultSettings, ...parsed };
            }
        } catch (e) {
            console.error('加载设置失败:', e);
        }

        // 应用设置到 UI
        document.getElementById('ttw-api-provider').value = settings.apiProvider;
        document.getElementById('ttw-api-key').value = settings.apiKey;
        document.getElementById('ttw-api-endpoint').value = settings.apiEndpoint;
        document.getElementById('ttw-api-model').value = settings.apiModel;
        document.getElementById('ttw-chunk-size').value = settings.chunkSize;
        document.getElementById('ttw-incremental-mode').checked = incrementalOutputMode;
        document.getElementById('ttw-enable-plot').checked = settings.enablePlotOutline;
        document.getElementById('ttw-enable-style').checked = settings.enableLiteraryStyle;

        // 加载自定义提示词
        document.getElementById('ttw-worldbook-prompt').value = settings.customWorldbookPrompt || '';
        document.getElementById('ttw-plot-prompt').value = settings.customPlotPrompt || '';
        document.getElementById('ttw-style-prompt').value = settings.customStylePrompt || '';

        handleProviderChange();
    }

    // 获取系统提示词（组合三个部分）
    function getSystemPrompt() {
        // 获取世界书词条提示词（必需）
        const worldbookPrompt = settings.customWorldbookPrompt?.trim() || defaultWorldbookPrompt;

        // 收集需要添加的额外部分
        const additionalParts = [];

        // 如果启用了剧情大纲
        if (settings.enablePlotOutline) {
            const plotPrompt = settings.customPlotPrompt?.trim() || defaultPlotPrompt;
            additionalParts.push(plotPrompt);
        }

        // 如果启用了文风配置
        if (settings.enableLiteraryStyle) {
            const stylePrompt = settings.customStylePrompt?.trim() || defaultStylePrompt;
            additionalParts.push(stylePrompt);
        }

        // 如果没有额外部分，直接返回世界书提示词
        if (additionalParts.length === 0) {
            return worldbookPrompt;
        }

        // 在JSON结构的最后一个大括号前插入额外部分
        // 查找 "组织" 部分后的闭合大括号
        let fullPrompt = worldbookPrompt;

        // 使用更可靠的方式：在 ``` 代码块结束前插入
        const insertContent = ',\n' + additionalParts.join(',\n');
        fullPrompt = fullPrompt.replace(
            /(\}\s*)\n\`\`\`/,
            `${insertContent}\n$1\n\`\`\``
        );

        return fullPrompt;
    }

    // 预览提示词
    function showPromptPreview() {
        const prompt = getSystemPrompt();

        // 构建状态信息
        const statusItems = [
            `📚 世界书词条: ${settings.customWorldbookPrompt?.trim() ? '自定义' : '默认'}`,
            `📖 剧情大纲: ${settings.enablePlotOutline ? (settings.customPlotPrompt?.trim() ? '✅ 启用 (自定义)' : '✅ 启用 (默认)') : '❌ 禁用'}`,
            `🎨 文风配置: ${settings.enableLiteraryStyle ? (settings.customStylePrompt?.trim() ? '✅ 启用 (自定义)' : '✅ 启用 (默认)') : '❌ 禁用'}`
        ];

        const previewModal = document.createElement('div');
        previewModal.className = 'ttw-modal-container';
        previewModal.id = 'ttw-prompt-preview-modal';
        previewModal.innerHTML = `
            <div class="ttw-modal" style="max-width: 800px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">👁️ 最终提示词预览</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px; background: rgba(0,0,0,0.15); border-radius: 6px; font-size: 12px;">
                        ${statusItems.map(item => `<span style="padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">${item}</span>`).join('')}
                    </div>
                    <pre style="white-space: pre-wrap; word-wrap: break-word; font-size: 12px; line-height: 1.5; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; max-height: 50vh; overflow-y: auto;">${prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn ttw-btn-primary ttw-close-preview">关闭</button>
                </div>
            </div>
        `;

        // 阻止弹窗内部点击冒泡
        const modal = previewModal.querySelector('.ttw-modal');
        modal.addEventListener('click', (e) => e.stopPropagation(), false);
        modal.addEventListener('mousedown', (e) => e.stopPropagation(), false);
        modal.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

        previewModal.querySelector('.ttw-modal-close').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            previewModal.remove();
        });
        previewModal.querySelector('.ttw-close-preview').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            previewModal.remove();
        });
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                e.stopPropagation();
                e.preventDefault();
                previewModal.remove();
            }
        });

        document.body.appendChild(previewModal);
    }

    async function checkAndRestoreState() {
        try {
            const savedState = await MemoryHistoryDB.loadState();
            if (savedState && savedState.memoryQueue && savedState.memoryQueue.length > 0) {
                const shouldRestore = confirm(`检测到未完成的转换任务（${savedState.processedIndex}/${savedState.memoryQueue.length}）\n\n是否恢复？`);
                
                if (shouldRestore) {
                    memoryQueue = savedState.memoryQueue;
                    generatedWorldbook = savedState.generatedWorldbook || {};
                    currentFileHash = savedState.fileHash;
                    
                    showQueueSection(true);
                    updateMemoryQueueUI();
                    
                    if (savedState.processedIndex >= savedState.memoryQueue.length) {
                        showResultSection(true);
                        updateWorldbookPreview();
                    } else {
                        document.getElementById('ttw-start-btn').disabled = false;
                        document.getElementById('ttw-start-btn').textContent = '▶️ 继续转换';
                    }
                } else {
                    await MemoryHistoryDB.clearState();
                }
            }
        } catch (e) {
            console.error('恢复状态失败:', e);
        }
    }

    async function handleFileSelect(file) {
        if (!file.name.endsWith('.txt')) {
            alert('请选择TXT文件');
            return;
        }

        try {
            const { encoding, content } = await detectBestEncoding(file);
            
            currentFile = file;
            
            // 检测文件变化
            const newHash = await calculateFileHash(content);
            const savedHash = await MemoryHistoryDB.getSavedFileHash();
            
            if (savedHash && savedHash !== newHash) {
                const historyList = await MemoryHistoryDB.getAllHistory();
                if (historyList.length > 0) {
                    const shouldClear = confirm(`检测到新文件，是否清空旧的历史记录？\n\n当前有 ${historyList.length} 条记录。`);
                    if (shouldClear) {
                        await MemoryHistoryDB.clearAllHistory();
                        await MemoryHistoryDB.clearState();
                    }
                }
            }
            
            currentFileHash = newHash;
            await MemoryHistoryDB.saveFileHash(newHash);
            
            // 显示文件信息
            document.getElementById('ttw-upload-area').style.display = 'none';
            document.getElementById('ttw-file-info').style.display = 'flex';
            document.getElementById('ttw-file-name').textContent = file.name;
            document.getElementById('ttw-file-size').textContent = `(${(content.length / 1024).toFixed(1)} KB, ${encoding})`;
            
            // 切分记忆
            splitContentIntoMemory(content);
            
            // 显示记忆队列
            showQueueSection(true);
            updateMemoryQueueUI();
            
            // 启用开始按钮
            document.getElementById('ttw-start-btn').disabled = false;
            
        } catch (error) {
            console.error('文件处理失败:', error);
            alert('文件处理失败: ' + error.message);
        }
    }

    function splitContentIntoMemory(content) {
        const chunkSize = settings.chunkSize;
        memoryQueue = [];
        
        // 尝试按章节分割
        const chapterRegex = /第[一二三四五六七八九十百千0-9]+[章节卷集回]/g;
        const chapters = [];
        const matches = [...content.matchAll(chapterRegex)];
        
        if (matches.length > 0) {
            for (let i = 0; i < matches.length; i++) {
                const startIndex = matches[i].index;
                const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
                chapters.push(content.slice(startIndex, endIndex));
            }
            
            // 合并小章节
            let currentChunk = '';
            let chunkIndex = 1;
            
            for (const chapter of chapters) {
                if (currentChunk.length + chapter.length > chunkSize && currentChunk.length > 0) {
                    memoryQueue.push({
                        title: `记忆${chunkIndex}`,
                        content: currentChunk,
                        processed: false,
                        failed: false
                    });
                    currentChunk = '';
                    chunkIndex++;
                }
                currentChunk += chapter;
            }
            
            if (currentChunk.length > 0) {
                memoryQueue.push({
                    title: `记忆${chunkIndex}`,
                    content: currentChunk,
                    processed: false,
                    failed: false
                });
            }
        } else {
            // 按字数分割
            for (let i = 0; i < content.length; i += chunkSize) {
                let endIndex = Math.min(i + chunkSize, content.length);
                
                // 尝试在段落边界分割
                if (endIndex < content.length) {
                    const paragraphBreak = content.lastIndexOf('\n\n', endIndex);
                    if (paragraphBreak > i) {
                        endIndex = paragraphBreak + 2;
                    }
                }
                
                memoryQueue.push({
                    title: `记忆${memoryQueue.length + 1}`,
                    content: content.slice(i, endIndex),
                    processed: false,
                    failed: false
                });
                
                i = endIndex - chunkSize;
            }
        }
        
        console.log(`文本已切分为 ${memoryQueue.length} 个记忆块`);
    }

    function clearFile() {
        currentFile = null;
        memoryQueue = [];
        generatedWorldbook = {};
        
        document.getElementById('ttw-upload-area').style.display = 'block';
        document.getElementById('ttw-file-info').style.display = 'none';
        document.getElementById('ttw-file-input').value = '';
        document.getElementById('ttw-start-btn').disabled = true;
        
        showQueueSection(false);
        showProgressSection(false);
        showResultSection(false);
    }

    async function startConversion() {
        saveCurrentSettings();
        
        if (!settings.apiKey && settings.apiProvider !== 'openai-compatible') {
            alert('请先设置 API Key');
            return;
        }
        
        if (memoryQueue.length === 0) {
            alert('请先上传文件');
            return;
        }
        
        document.getElementById('ttw-start-btn').disabled = true;
        document.getElementById('ttw-start-btn').textContent = '转换中...';
        
        await startAIProcessing();
        
        document.getElementById('ttw-start-btn').textContent = '🚀 开始转换';
    }

    function showQueueSection(show) {
        document.getElementById('ttw-queue-section').style.display = show ? 'block' : 'none';
    }

    function showProgressSection(show) {
        document.getElementById('ttw-progress-section').style.display = show ? 'block' : 'none';
    }

    function showResultSection(show) {
        document.getElementById('ttw-result-section').style.display = show ? 'block' : 'none';
    }

    function updateProgress(percent, text) {
        document.getElementById('ttw-progress-fill').style.width = `${percent}%`;
        document.getElementById('ttw-progress-text').textContent = text;
        
        // 更新修复按钮
        const failedCount = memoryQueue.filter(m => m.failed === true).length;
        const repairBtn = document.getElementById('ttw-repair-btn');
        if (failedCount > 0) {
            repairBtn.style.display = 'inline-block';
            repairBtn.textContent = `🔧 修复失败 (${failedCount})`;
        } else {
            repairBtn.style.display = 'none';
        }
    }

    function updateMemoryQueueUI() {
        const container = document.getElementById('ttw-memory-queue');
        container.innerHTML = '';

        memoryQueue.forEach((memory, index) => {
            const item = document.createElement('div');
            item.className = 'ttw-memory-item';
            if (memory.processed) item.classList.add('processed');
            if (memory.failed) item.classList.add('failed');
            
            let statusIcon = '⏳';
            if (memory.processed) statusIcon = '✅';
            if (memory.failed) statusIcon = '❗';
            
            item.innerHTML = `
                <span>${statusIcon}</span>
                <span>${memory.title}</span>
                <small>(${memory.content.length.toLocaleString()}字)</small>
            `;
            container.appendChild(item);
        });
    }

    function updateWorldbookPreview() {
        const container = document.getElementById('ttw-result-preview');
        container.innerHTML = formatWorldbookAsCards(generatedWorldbook);
    }

    function formatWorldbookAsCards(worldbook) {
        if (!worldbook || Object.keys(worldbook).length === 0) {
            return '<div style="text-align: center; color: #888; padding: 20px;">暂无世界书数据</div>';
        }

        let html = '';
        let totalEntries = 0;

        for (const category in worldbook) {
            const entries = worldbook[category];
            const entryCount = typeof entries === 'object' ? Object.keys(entries).length : 0;
            
            if (entryCount === 0) continue;
            
            totalEntries += entryCount;

            html += `
            <div class="ttw-category-card" data-category="${category}">
                <div class="ttw-category-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <span>📁 ${category}</span>
                    <span style="font-size: 12px;">${entryCount} 条目</span>
                </div>
                <div class="ttw-category-content">`;

            if (typeof entries === 'object') {
                for (const entryName in entries) {
                    const entry = entries[entryName];

                    html += `
                    <div class="ttw-entry-card">
                        <div class="ttw-entry-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                            <span>📄 ${entryName}</span>
                            <span style="font-size: 11px;">▼</span>
                        </div>
                        <div class="ttw-entry-content">`;

                    if (entry && typeof entry === 'object') {
                        if (entry['关键词']) {
                            const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
                            html += `
                            <div class="ttw-keywords">
                                <div style="color: #9b59b6; font-size: 11px; margin-bottom: 4px;">🔑 关键词</div>
                                <div style="font-size: 13px;">${keywords}</div>
                            </div>`;
                        }

                        if (entry['内容']) {
                            const content = String(entry['内容'])
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #3498db;">$1</strong>')
                                .replace(/\n/g, '<br>');
                            html += `
                            <div class="ttw-content-text">
                                <div style="color: #27ae60; font-size: 11px; margin-bottom: 4px;">📝 内容</div>
                                <div style="font-size: 13px;">${content}</div>
                            </div>`;
                        }
                    }

                    html += `
                        </div>
                    </div>`;
                }
            }

            html += `
                </div>
            </div>`;
        }

        return `<div style="margin-bottom: 12px; font-size: 13px;">共 ${Object.keys(worldbook).filter(k => Object.keys(worldbook[k]).length > 0).length} 个分类, ${totalEntries} 个条目</div>` + html;
    }

    function showWorldbookView() {
        const existingModal = document.getElementById('ttw-worldbook-view-modal');
        if (existingModal) existingModal.remove();

        const viewModal = document.createElement('div');
        viewModal.id = 'ttw-worldbook-view-modal';
        viewModal.className = 'ttw-modal-container';
        viewModal.innerHTML = `
            <div class="ttw-modal" style="max-width: 900px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📖 世界书详细视图</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    ${formatWorldbookAsCards(generatedWorldbook)}
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn ttw-btn-primary" id="ttw-optimize-worldbook">🤖 AI优化世界书</button>
                    <button class="ttw-btn" id="ttw-close-worldbook-view">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(viewModal);

        viewModal.querySelector('.ttw-modal-close').addEventListener('click', () => viewModal.remove());
        viewModal.querySelector('#ttw-close-worldbook-view').addEventListener('click', () => viewModal.remove());
        viewModal.querySelector('#ttw-optimize-worldbook').addEventListener('click', () => {
            viewModal.remove();
            showOptimizeModal();
        });
        viewModal.addEventListener('click', (e) => {
            if (e.target === viewModal) viewModal.remove();
        });
    }

    async function showHistoryView() {
        const existingModal = document.getElementById('ttw-history-modal');
        if (existingModal) existingModal.remove();

        let historyList = [];
        try {
            await MemoryHistoryDB.cleanDuplicateHistory();
            historyList = await MemoryHistoryDB.getAllHistory();
        } catch (e) {
            console.error('获取历史记录失败:', e);
        }

        const historyModal = document.createElement('div');
        historyModal.id = 'ttw-history-modal';
        historyModal.className = 'ttw-modal-container';
        historyModal.innerHTML = `
            <div class="ttw-modal" style="max-width: 900px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📜 修改历史 (${historyList.length}条)</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="display: flex; gap: 15px; height: 400px;">
                        <div style="width: 250px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px;">
                            ${generateHistoryListHTML(historyList)}
                        </div>
                        <div id="ttw-history-detail" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 15px;">
                            <div style="text-align: center; color: #888; padding: 40px;">👈 点击左侧历史记录查看详情</div>
                        </div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-view-evolution" style="background: #3498db;">📊 条目演变</button>
                    <button class="ttw-btn" id="ttw-optimize-worldbook" style="background: #9b59b6;">🤖 AI优化世界书</button>
                    <button class="ttw-btn ttw-btn-warning" id="ttw-clear-history">🗑️ 清空历史</button>
                    <button class="ttw-btn" id="ttw-close-history">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(historyModal);

        historyModal.querySelector('.ttw-modal-close').addEventListener('click', () => historyModal.remove());
        historyModal.querySelector('#ttw-close-history').addEventListener('click', () => historyModal.remove());
        historyModal.querySelector('#ttw-clear-history').addEventListener('click', async () => {
            if (confirm('确定要清空所有历史记录吗？')) {
                await MemoryHistoryDB.clearAllHistory();
                historyModal.remove();
                showHistoryView();
            }
        });
        historyModal.querySelector('#ttw-view-evolution').addEventListener('click', async () => {
            historyModal.remove();
            await showEntryEvolutionModal(historyList);
        });
        historyModal.querySelector('#ttw-optimize-worldbook').addEventListener('click', async () => {
            historyModal.remove();
            await showOptimizeWorldbookModal(historyList);
        });
        historyModal.addEventListener('click', (e) => {
            if (e.target === historyModal) historyModal.remove();
        });

        // 绑定历史项点击
        historyModal.querySelectorAll('.ttw-history-item').forEach(item => {
            item.addEventListener('click', async () => {
                const historyId = parseInt(item.dataset.historyId);
                await showHistoryDetail(historyId, historyModal);
                
                historyModal.querySelectorAll('.ttw-history-item').forEach(i => i.style.background = 'rgba(0,0,0,0.2)');
                item.style.background = 'rgba(0,0,0,0.4)';
            });
        });
    }

    function generateHistoryListHTML(historyList) {
        if (historyList.length === 0) {
            return '<div style="text-align: center; color: #888; padding: 20px;">暂无历史记录</div>';
        }

        const sortedList = [...historyList].sort((a, b) => b.timestamp - a.timestamp);
        
        let html = '';
        sortedList.forEach((history) => {
            const time = new Date(history.timestamp).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const changeCount = history.changedEntries?.length || 0;
            
            html += `
            <div class="ttw-history-item" data-history-id="${history.id}" style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid #9b59b6;">
                <div style="font-weight: bold; color: #e67e22; font-size: 13px; margin-bottom: 4px;">
                    📝 ${history.memoryTitle || `记忆块 ${history.memoryIndex + 1}`}
                </div>
                <div style="font-size: 11px; color: #888;">${time}</div>
                <div style="font-size: 11px; color: #aaa; margin-top: 4px;">共 ${changeCount} 项变更</div>
            </div>`;
        });

        return html;
    }

    async function showHistoryDetail(historyId, modal) {
        const detailContainer = modal.querySelector('#ttw-history-detail');
        const history = await MemoryHistoryDB.getHistoryById(historyId);
        
        if (!history) {
            detailContainer.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 40px;">找不到该历史记录</div>';
            return;
        }

        const time = new Date(history.timestamp).toLocaleString('zh-CN');
        
        let html = `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444;">
            <h4 style="color: #e67e22; margin: 0 0 10px 0;">📝 ${history.memoryTitle || `记忆块 ${history.memoryIndex + 1}`}</h4>
            <div style="font-size: 12px; color: #888;">时间: ${time}</div>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button class="ttw-btn ttw-btn-warning ttw-btn-small" onclick="window.TxtToWorldbook._rollbackToHistory(${historyId})">⏪ 回退到此版本前</button>
                <button class="ttw-btn ttw-btn-small" onclick="window.TxtToWorldbook._exportHistoryWorldbook(${historyId})" style="background: #27ae60;">📥 导出此版本世界书</button>
            </div>
        </div>
        <div style="font-size: 14px; font-weight: bold; color: #9b59b6; margin-bottom: 10px;">变更内容 (${history.changedEntries?.length || 0}项)</div>
        `;

        if (history.changedEntries && history.changedEntries.length > 0) {
            history.changedEntries.forEach(change => {
                const typeIcon = change.type === 'add' ? '➕ 新增' : change.type === 'modify' ? '✏️ 修改' : '❌ 删除';
                const typeColor = change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';
                
                html += `
                <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 12px; margin-bottom: 10px; border-left: 3px solid ${typeColor};">
                    <div style="margin-bottom: 8px;">
                        <span style="color: ${typeColor}; font-weight: bold;">${typeIcon}</span>
                        <span style="color: #e67e22; margin-left: 8px;">[${change.category}] ${change.entryName}</span>
                    </div>
                    <div style="font-size: 12px; color: #ccc; max-height: 100px; overflow-y: auto;">
                        ${change.newValue ? formatEntryForDisplay(change.newValue) : '<span style="color: #666;">无</span>'}
                    </div>
                </div>`;
            });
        } else {
            html += '<div style="color: #888; text-align: center; padding: 20px;">无变更记录</div>';
        }

        detailContainer.innerHTML = html;
    }

    function formatEntryForDisplay(entry) {
        if (!entry) return '';
        if (typeof entry === 'string') return entry.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        
        let html = '';
        if (entry['关键词']) {
            const keywords = Array.isArray(entry['关键词']) ? entry['关键词'].join(', ') : entry['关键词'];
            html += `<div style="color: #9b59b6; margin-bottom: 4px;"><strong>关键词:</strong> ${keywords}</div>`;
        }
        if (entry['内容']) {
            const content = String(entry['内容']).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            html += `<div><strong>内容:</strong> ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}</div>`;
        }
        return html || JSON.stringify(entry);
    }

    async function rollbackToHistory(historyId) {
        if (!confirm('确定要回退到此版本吗？\n\n回退后将刷新页面以确保状态正确。')) {
            return;
        }

        try {
            const history = await MemoryHistoryDB.rollbackToHistory(historyId);
            console.log(`📚 已回退到历史记录 #${historyId}: ${history.memoryTitle}`);
            
            const rollbackMemoryIndex = history.memoryIndex;
            
            for (let i = 0; i < memoryQueue.length; i++) {
                if (i < rollbackMemoryIndex) {
                    memoryQueue[i].processed = true;
                } else {
                    memoryQueue[i].processed = false;
                    memoryQueue[i].failed = false;
                }
            }
            
            await MemoryHistoryDB.saveState(rollbackMemoryIndex);
            
            alert(`回退成功！页面将刷新。`);
            location.reload();
        } catch (error) {
            console.error('回退失败:', error);
            alert('回退失败: ' + error.message);
        }
    }

    // 全局自定义优化prompt变量
    let customOptimizationPrompt = null;
    const DEFAULT_BATCH_CHANGES = 50;

    // 从历史记录视图打开的AI优化世界书模态框
    async function showOptimizeWorldbookModal(historyList) {
        const existingModal = document.getElementById('ttw-optimize-worldbook-modal');
        if (existingModal) existingModal.remove();

        // 从localStorage加载上次保存的自定义prompt
        try {
            const savedPrompt = localStorage.getItem('ttw_custom_optimization_prompt');
            if (savedPrompt) {
                customOptimizationPrompt = savedPrompt;
                console.log('📝 已加载上次保存的自定义Prompt');
            }
        } catch (e) {
            console.error('加载自定义Prompt失败:', e);
        }

        const entryEvolution = aggregateEntryEvolution(historyList);
        const entryCount = Object.keys(entryEvolution).length;
        let totalChanges = 0;
        for (const key in entryEvolution) {
            totalChanges += entryEvolution[key].changes.length;
        }

        const modal = document.createElement('div');
        modal.id = 'ttw-optimize-worldbook-modal';
        modal.className = 'ttw-modal-container';
        modal.innerHTML = `
            <div class="ttw-modal" style="max-width: 800px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🤖 AI优化世界书</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="color: #e67e22; font-weight: bold; margin-bottom: 10px;">📊 当前数据统计</div>
                        <div style="color: #aaa; font-size: 14px;">
                            <div>• 条目数量: <span style="color: #27ae60;">${entryCount}</span> 个</div>
                            <div>• 历史变更: <span style="color: #3498db;">${totalChanges}</span> 对</div>
                        </div>
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="color: #9b59b6; font-weight: bold; margin-bottom: 10px;">⚙️ 优化设置</div>
                        <label style="color: #aaa; font-size: 14px;">每批处理变更数:</label>
                        <input type="number" id="ttw-batch-changes-input" value="${DEFAULT_BATCH_CHANGES}" min="10" max="200"
                            style="width: 100%; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid #555; border-radius: 4px; color: white; margin-top: 5px; margin-bottom: 15px;">

                        <div style="margin-top: 15px;">
                            <label style="color: #aaa; font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <input type="checkbox" id="ttw-use-custom-prompt" style="width: 16px; height: 16px;">
                                <span>使用自定义Prompt设定</span>
                            </label>
                            <div id="ttw-custom-prompt-container" style="display: none;">
                                <textarea id="ttw-custom-prompt-textarea" placeholder="在此输入自定义的优化Prompt...

提示：可以使用 {{条目}} 作为占位符，系统会自动替换为实际条目内容。"
                                    style="width: 100%; min-height: 150px; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid #555; border-radius: 4px; color: white; font-family: monospace; font-size: 13px; resize: vertical; margin-bottom: 10px;">${customOptimizationPrompt || ''}</textarea>
                                <div style="display: flex; gap: 10px; align-items: center;">
                                    <button class="ttw-btn ttw-btn-small" id="ttw-reset-prompt-btn" style="background: #3498db;">📄 显示默认提示词</button>
                                    <span id="ttw-prompt-status" style="color: #888; font-size: 12px;"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="background: rgba(0,100,0,0.1); border: 1px solid #27ae60; padding: 15px; border-radius: 8px;">
                        <div style="color: #27ae60; font-weight: bold; margin-bottom: 10px;">✨ 优化目标</div>
                        <div style="color: #ccc; font-size: 13px; line-height: 1.6;">
                            • 将条目优化为<strong>常态描述</strong>（适合RPG）<br>
                            • 人物状态设为正常，忽略临时变化<br>
                            • 优化后将<strong>覆盖</strong>现有世界书条目
                        </div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-optimize-wb">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-start-optimize-wb">🚀 开始优化</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定自定义prompt开关
        const useCustomPromptCheckbox = modal.querySelector('#ttw-use-custom-prompt');
        const customPromptContainer = modal.querySelector('#ttw-custom-prompt-container');
        const customPromptTextarea = modal.querySelector('#ttw-custom-prompt-textarea');

        useCustomPromptCheckbox.addEventListener('change', () => {
            customPromptContainer.style.display = useCustomPromptCheckbox.checked ? 'block' : 'none';
        });

        // 监听textarea内容变化，自动保存到localStorage
        let saveTimeout = null;
        customPromptTextarea.addEventListener('input', () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                const promptText = customPromptTextarea.value.trim();
                try {
                    localStorage.setItem('ttw_custom_optimization_prompt', promptText);
                    console.log('💾 已自动保存自定义Prompt');
                } catch (error) {
                    console.error('保存自定义Prompt失败:', error);
                }
            }, 1000);
        });

        // 绑定显示默认提示词按钮
        modal.querySelector('#ttw-reset-prompt-btn').addEventListener('click', () => {
            const defaultPrompt = `你是RPG世界书优化专家。为每个条目生成**常态描述**。

**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化JSON,包含以下字段:
   - name: 角色名称【必填】
   - gender: 性别【必填】
   - age_appearance: 外观年龄
   - origin: 出身背景（position职位、背景描述等）
   - affiliation: 所属组织/阵营
   - appearance: 外观描述（发色、发型、瞳色、肤色、体型、服装、配件、特征等）【必填】
   - personality: 性格特征【必填】,必须包含:
     * core_traits: 核心特质
     * speech_style: 说话风格【必填】- 详细描述语气、用词习惯、表达方式
     * sample_dialogue: 示例对话【必填】- 至少5条典型对话示例
     * background_psychology: 心理背景
     * social_style: 社交风格
   - role_illustration: 角色定位说明
   - support_relations: 与其他角色的关系
   - style_tags: 风格标签
5. **对于非角色条目**（地点、物品、设定等），生成简洁的描述性内容

**输出JSON格式：**
{
  "条目名1": {
    "关键词": ["关键词1", "关键词2"],
    "内容": "对于角色，这里应该是完整的JSON字符串；对于非角色，这里是描述文本"
  }
}

**条目：**
{{条目}}
直接输出JSON。`;

            customPromptTextarea.value = defaultPrompt;
            modal.querySelector('#ttw-prompt-status').textContent = '已加载默认提示词';
            modal.querySelector('#ttw-prompt-status').style.color = '#3498db';
        });

        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-cancel-optimize-wb').addEventListener('click', () => {
            modal.remove();
            showHistoryView();
        });
        modal.querySelector('#ttw-start-optimize-wb').addEventListener('click', async () => {
            const batchSize = parseInt(modal.querySelector('#ttw-batch-changes-input').value) || DEFAULT_BATCH_CHANGES;

            // 保存自定义prompt
            if (useCustomPromptCheckbox.checked) {
                const promptText = customPromptTextarea.value.trim();
                customOptimizationPrompt = promptText || null;
            } else {
                customOptimizationPrompt = null;
            }

            modal.remove();
            await startBatchOptimizationAdvanced(entryEvolution, batchSize);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // 高级批量优化函数（支持自定义prompt和批处理）
    async function startBatchOptimizationAdvanced(entryEvolution, batchSize) {
        const entries = Object.entries(entryEvolution);
        if (entries.length === 0) {
            alert('没有可优化的条目');
            showHistoryView();
            return;
        }

        // 按批次分组
        const batches = [];
        let currentBatch = [], currentBatchChanges = 0;
        for (const [key, data] of entries) {
            const entryChanges = data.changes.length;
            if (currentBatchChanges + entryChanges > batchSize && currentBatch.length > 0) {
                batches.push([...currentBatch]);
                currentBatch = [];
                currentBatchChanges = 0;
            }
            currentBatch.push({ key, data });
            currentBatchChanges += entryChanges;
        }
        if (currentBatch.length > 0) batches.push(currentBatch);

        // 保存优化前的世界书状态
        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

        showProgressSection(true);
        updateProgress(0, `AI优化世界书中... (批次 0/${batches.length})`);

        let completedBatches = 0, optimizedEntries = 0;
        const allChangedEntries = [];

        for (let i = 0; i < batches.length; i++) {
            if (isProcessingStopped) break;
            updateProgress(((i + 1) / batches.length) * 100, `AI优化中... (批次 ${i + 1}/${batches.length})`);

            try {
                const batchPrompt = buildBatchOptimizationPrompt(batches[i]);
                const entryNames = batches[i].map(b => b.data.entryName).join(', ');
                console.log(`📤 [AI优化世界书] 批次 ${i + 1}/${batches.length} 条目: ${entryNames}`);

                const response = await callAPI(batchPrompt);
                console.log(`📥 [AI优化世界书] 批次 ${i + 1}/${batches.length} 响应:`, response);

                const batchChanges = await applyBatchOptimizationResult(response, batches[i], previousWorldbook);
                allChangedEntries.push(...batchChanges);
                optimizedEntries += batches[i].length;
            } catch (error) {
                console.error(`批次 ${i + 1} 优化失败:`, error);
            }
            completedBatches++;
        }

        // 保存修改历史
        if (allChangedEntries.length > 0) {
            try {
                await MemoryHistoryDB.saveHistory(
                    -1,
                    '记忆-优化',
                    previousWorldbook,
                    generatedWorldbook,
                    allChangedEntries
                );
                console.log(`📚 已保存优化历史: ${allChangedEntries.length} 个条目`);
            } catch (error) {
                console.error('保存优化历史失败:', error);
            }
        }

        updateProgress(100, `优化完成！优化了 ${optimizedEntries} 个条目`);
        await MemoryHistoryDB.saveState(memoryQueue.length);
        updateWorldbookPreview();

        alert(`优化完成！优化了 ${optimizedEntries} 个条目`);
    }

    // 构建批量优化prompt
    function buildBatchOptimizationPrompt(batch) {
        // 构建条目内容部分
        let entriesContent = '';
        batch.forEach(({ data }) => {
            entriesContent += `\n--- ${data.entryName} [${data.category}] ---\n`;
            data.changes.forEach((change, i) => {
                if (change.newValue?.['内容']) {
                    entriesContent += `${change.newValue['内容'].substring(0, 300)}...\n`;
                }
            });
        });

        // 如果有自定义prompt，使用自定义prompt
        if (customOptimizationPrompt) {
            // 替换占位符
            let prompt = customOptimizationPrompt.replace(/\{\{条目\}\}/g, entriesContent);
            console.log('📝 使用自定义Prompt');
            return getLanguagePrefix() + prompt;
        }

        // 否则使用默认prompt
        return getLanguagePrefix() + `你是RPG世界书优化专家。为每个条目生成**常态描述**。

**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化JSON,包含以下字段:
   - name: 角色名称【必填】
   - gender: 性别【必填】
   - age_appearance: 外观年龄
   - origin: 出身背景（position职位、背景描述等）
   - affiliation: 所属组织/阵营
   - appearance: 外观描述（发色、发型、瞳色、肤色、体型、服装、配件、特征等）【必填】
   - personality: 性格特征【必填】,必须包含:
     * core_traits: 核心特质
     * speech_style: 说话风格【必填】- 详细描述语气、用词习惯、表达方式
     * sample_dialogue: 示例对话【必填】- 至少5条典型对话示例
     * background_psychology: 心理背景
     * social_style: 社交风格
   - role_illustration: 角色定位说明
   - support_relations: 与其他角色的关系
   - style_tags: 风格标签
5. **对于非角色条目**（地点、物品、设定等），生成简洁的描述性内容

**输出JSON格式：**
{
  "条目名1": {
    "关键词": ["关键词1", "关键词2"],
    "内容": "对于角色，这里应该是完整的JSON字符串；对于非角色，这里是描述文本"
  }
}

**条目：**
${entriesContent}
直接输出JSON。`;
    }

    // 应用批量优化结果
    async function applyBatchOptimizationResult(response, batch, previousWorldbook) {
        let result;

        try {
            // 清理响应
            let cleanResponse = response.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '');
            const firstBrace = cleanResponse.indexOf('{');
            const lastBrace = cleanResponse.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
            }

            result = JSON.parse(cleanResponse);
        } catch (e) {
            console.error('解析优化结果失败:', e);
            return [];
        }

        const changedEntries = [];

        // 更新世界书中的条目
        for (const { key, data } of batch) {
            const entryName = data.entryName;
            const category = data.category;

            // 查找匹配的优化结果
            const optimized = result[entryName];
            if (optimized) {
                // 确保分类存在
                if (!generatedWorldbook[category]) {
                    generatedWorldbook[category] = {};
                }

                // 记录旧值
                const oldValue = previousWorldbook[category]?.[entryName] || null;

                // 更新条目
                const newValue = {
                    '关键词': optimized['关键词'] || data.changes[data.changes.length - 1]?.newValue?.['关键词'] || [],
                    '内容': optimized['内容'] || ''
                };
                generatedWorldbook[category][entryName] = newValue;

                // 记录变更
                changedEntries.push({
                    category: category,
                    entryName: entryName,
                    type: oldValue ? 'modify' : 'add',
                    oldValue: oldValue,
                    newValue: newValue
                });

                console.log(`✅ 已优化条目: [${category}] ${entryName}`);
            }
        }

        return changedEntries;
    }

    async function showOptimizeModal() {
        let historyList = [];
        try {
            historyList = await MemoryHistoryDB.getAllHistory();
        } catch (e) {
            console.error('获取历史记录失败:', e);
        }

        const entryEvolution = aggregateEntryEvolution(historyList);
        const entryCount = Object.keys(entryEvolution).length;

        const existingModal = document.getElementById('ttw-optimize-modal');
        if (existingModal) existingModal.remove();

        const optimizeModal = document.createElement('div');
        optimizeModal.id = 'ttw-optimize-modal';
        optimizeModal.className = 'ttw-modal-container';
        optimizeModal.innerHTML = `
            <div class="ttw-modal" style="max-width: 600px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">🤖 AI优化世界书</span>
                    <button class="ttw-modal-close" type="button">✕</button>
                </div>
                <div class="ttw-modal-body">
                    <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="color: #e67e22; font-weight: bold; margin-bottom: 10px;">📊 当前数据</div>
                        <div style="color: #aaa; font-size: 14px;">
                            <div>• 条目数量: <span style="color: #27ae60;">${entryCount}</span> 个</div>
                        </div>
                    </div>
                    <div style="background: rgba(0,100,0,0.1); border: 1px solid #27ae60; padding: 15px; border-radius: 8px;">
                        <div style="color: #27ae60; font-weight: bold; margin-bottom: 10px;">✨ 优化目标</div>
                        <div style="color: #ccc; font-size: 13px; line-height: 1.6;">
                            • 将条目优化为<strong>常态描述</strong>（适合RPG）<br>
                            • 人物状态设为正常，忽略临时变化<br>
                            • 优化后将<strong>覆盖</strong>现有世界书条目
                        </div>
                    </div>
                </div>
                <div class="ttw-modal-footer">
                    <button class="ttw-btn" id="ttw-cancel-optimize">取消</button>
                    <button class="ttw-btn ttw-btn-primary" id="ttw-start-optimize">🚀 开始优化</button>
                </div>
            </div>
        `;

        document.body.appendChild(optimizeModal);

        optimizeModal.querySelector('.ttw-modal-close').addEventListener('click', () => optimizeModal.remove());
        optimizeModal.querySelector('#ttw-cancel-optimize').addEventListener('click', () => optimizeModal.remove());
        optimizeModal.querySelector('#ttw-start-optimize').addEventListener('click', async () => {
            optimizeModal.remove();
            await startBatchOptimization(entryEvolution);
        });
        optimizeModal.addEventListener('click', (e) => {
            if (e.target === optimizeModal) optimizeModal.remove();
        });
    }

    function aggregateEntryEvolution(historyList) {
        const evolution = {};

        const sortedList = [...historyList].sort((a, b) => a.timestamp - b.timestamp);

        sortedList.forEach(history => {
            if (!history.changedEntries) return;

            history.changedEntries.forEach(change => {
                const key = `${change.category}::${change.entryName}`;
                
                if (!evolution[key]) {
                    evolution[key] = {
                        category: change.category,
                        entryName: change.entryName,
                        changes: [],
                        summary: null
                    };
                }

                evolution[key].changes.push({
                    timestamp: history.timestamp,
                    memoryIndex: history.memoryIndex,
                    memoryTitle: history.memoryTitle,
                    type: change.type,
                    oldValue: change.oldValue,
                    newValue: change.newValue
                });
            });
        });

        return evolution;
    }

    async function startBatchOptimization(entryEvolution) {
        const entries = Object.entries(entryEvolution);
        if (entries.length === 0) {
            alert('没有可优化的条目');
            return;
        }

        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

        showProgressSection(true);
        updateProgress(0, 'AI优化世界书中...');

        let optimizedCount = 0;
        const allChangedEntries = [];

        for (let i = 0; i < entries.length; i++) {
            const [key, data] = entries[i];
            updateProgress(((i + 1) / entries.length) * 100, `优化中: ${data.entryName} (${i + 1}/${entries.length})`);

            try {
                const prompt = buildOptimizationPrompt(data);
                console.log(`📤 [AI优化] 条目: ${data.entryName}`);
                
                const response = await callAPI(prompt);
                console.log(`📥 [AI优化] 响应:`, response);

                // 解析响应
                let optimizedContent = response.trim();
                optimizedContent = optimizedContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

                // 更新世界书
                const category = data.category;
                const entryName = data.entryName;
                
                if (!generatedWorldbook[category]) {
                    generatedWorldbook[category] = {};
                }
                
                const oldValue = previousWorldbook[category]?.[entryName] || null;
                const newValue = {
                    '关键词': oldValue?.['关键词'] || [],
                    '内容': optimizedContent
                };
                generatedWorldbook[category][entryName] = newValue;
                
                allChangedEntries.push({
                    category,
                    entryName,
                    type: oldValue ? 'modify' : 'add',
                    oldValue,
                    newValue
                });
                
                optimizedCount++;

            } catch (error) {
                console.error(`优化条目 ${key} 失败:`, error);
            }
        }

        // 保存历史
        if (allChangedEntries.length > 0) {
            try {
                await MemoryHistoryDB.saveHistory(
                    -1,
                    '记忆-优化',
                    previousWorldbook,
                    generatedWorldbook,
                    allChangedEntries
                );
                console.log(`📚 已保存优化历史`);
            } catch (error) {
                console.error('保存优化历史失败:', error);
            }
        }

        updateProgress(100, `优化完成！优化了 ${optimizedCount} 个条目`);
        await MemoryHistoryDB.saveState(memoryQueue.length);
        updateWorldbookPreview();
        
        alert(`优化完成！优化了 ${optimizedCount} 个条目`);
    }

    function buildOptimizationPrompt(entryData) {
        let evolutionText = `条目名称: ${entryData.entryName}\n分类: ${entryData.category}\n\n`;

        entryData.changes.forEach((change, i) => {
            if (change.newValue?.['内容']) {
                evolutionText += `版本${i + 1}: ${change.newValue['内容'].substring(0, 500)}...\n\n`;
            }
        });

        return getLanguagePrefix() + `你是RPG世界书优化专家。请将以下条目的多个版本整合为一个**常态描述**。

**要求：**
1. 人物状态必须是常态（活着、正常），不能是死亡等临时状态
2. 提取核心特征、背景、能力等持久性信息
3. 越详尽越好
4. **对于角色类条目**,必须生成完整的结构化内容,包含以下信息:
   - 角色名称、性别、外观年龄
   - 出身背景、所属组织/阵营
   - 外观描述（发色、发型、瞳色、肤色、体型、服装、配件、特征等）
   - 性格特征（核心特质、说话风格、心理背景、社交风格）
   - 示例对话（至少5条典型对话示例）
   - 角色定位说明、与其他角色的关系、风格标签
5. **对于非角色条目**（地点、物品、设定等），生成简洁的描述性内容
6. 直接输出内容，不要包含任何解释或JSON格式包装

**条目信息：**
${evolutionText}

请直接输出优化后的内容描述：`;
    }

    function closeModal() {
        if (modalContainer) {
            modalContainer.remove();
            modalContainer = null;
        }
        document.removeEventListener('keydown', handleEscKey, true);
    }

    function open() {
        createModal();
    }

    // ========== 条目演变功能 ==========

    // 显示条目演变模态框
    async function showEntryEvolutionModal(historyList) {
        const existingModal = document.getElementById('ttw-entry-evolution-modal');
        if (existingModal) existingModal.remove();

        // 按条目聚合历史
        const entryEvolution = aggregateEntryEvolution(historyList);

        const modal = document.createElement('div');
        modal.id = 'ttw-entry-evolution-modal';
        modal.className = 'ttw-modal-container';

        const entryCount = Object.keys(entryEvolution).length;
        modal.innerHTML = `
            <div class="ttw-modal" style="max-width: 1100px;">
                <div class="ttw-modal-header">
                    <span class="ttw-modal-title">📊 条目演变历史 (${entryCount}个条目)</span>
                    <div class="ttw-header-actions">
                        <button class="ttw-btn ttw-btn-small" id="ttw-summarize-all-btn" style="background: #9b59b6;">🤖 AI总结全部</button>
                        <button class="ttw-btn ttw-btn-small" id="ttw-export-evolution-btn" style="background: #27ae60;">📥 导出演变数据</button>
                        <button class="ttw-btn ttw-btn-small" id="ttw-back-to-history-btn" style="background: #e67e22;">↩️ 返回历史</button>
                        <button class="ttw-modal-close" type="button">✕</button>
                    </div>
                </div>
                <div class="ttw-modal-body" style="display: flex; gap: 15px; height: 500px;">
                    <div id="ttw-entry-list" style="width: 280px; flex-shrink: 0; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px;">
                        ${generateEntryListHTML(entryEvolution)}
                    </div>
                    <div id="ttw-evolution-detail" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 15px;">
                        <div style="text-align: center; color: #888; padding: 40px;">👈 点击左侧条目查看演变历史</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 保存当前演变数据到全局变量
        window._ttwEntryEvolution = entryEvolution;

        // 绑定事件
        modal.querySelector('.ttw-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#ttw-back-to-history-btn').addEventListener('click', () => {
            modal.remove();
            showHistoryView();
        });
        modal.querySelector('#ttw-export-evolution-btn').addEventListener('click', () => exportEvolutionData(entryEvolution));
        modal.querySelector('#ttw-summarize-all-btn').addEventListener('click', () => summarizeAllEntryEvolution(entryEvolution));

        // 绑定条目点击事件
        modal.querySelectorAll('.ttw-entry-evolution-item').forEach(item => {
            item.addEventListener('click', () => {
                const entryKey = item.dataset.entryKey;
                showEntryEvolutionDetail(entryKey, entryEvolution[entryKey]);
                // 高亮选中项
                modal.querySelectorAll('.ttw-entry-evolution-item').forEach(i => i.style.background = 'rgba(0,0,0,0.2)');
                item.style.background = 'rgba(0,0,0,0.4)';
            });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // 生成条目列表HTML
    function generateEntryListHTML(entryEvolution) {
        const entries = Object.entries(entryEvolution);

        if (entries.length === 0) {
            return '<div style="text-align: center; color: #888; padding: 20px;">暂无条目演变数据</div>';
        }

        // 按变更次数排序（多的在前）
        entries.sort((a, b) => b[1].changes.length - a[1].changes.length);

        let html = '';
        entries.forEach(([key, data]) => {
            const changeCount = data.changes.length;
            const hasSummary = data.summary ? '✅' : '';

            html += `
            <div class="ttw-entry-evolution-item" data-entry-key="${key}" style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid #3498db; transition: background 0.2s;">
                <div style="font-weight: bold; color: #e67e22; font-size: 13px; margin-bottom: 4px; display: flex; justify-content: space-between;">
                    <span>${data.entryName}</span>
                    <span style="font-size: 11px; color: #27ae60;">${hasSummary}</span>
                </div>
                <div style="font-size: 11px; color: #888; margin-bottom: 4px;">[${data.category}]</div>
                <div style="font-size: 11px; color: #aaa;">
                    <span style="color: #3498db;">${changeCount}次变更</span>
                </div>
            </div>`;
        });

        return html;
    }

    // 显示条目演变详情
    function showEntryEvolutionDetail(entryKey, entryData) {
        const detailContainer = document.getElementById('ttw-evolution-detail');
        if (!detailContainer || !entryData) return;

        let html = `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #444;">
            <h4 style="color: #e67e22; margin: 0 0 5px 0;">${entryData.entryName}</h4>
            <div style="font-size: 12px; color: #888; margin-bottom: 10px;">[${entryData.category}] - 共 ${entryData.changes.length} 次变更</div>
            <button class="ttw-btn ttw-btn-small" id="ttw-summarize-single-btn" style="background: #9b59b6;" data-entry-key="${entryKey}">
                🤖 AI总结此条目演变
            </button>
        </div>
        `;

        // 显示已有的总结
        if (entryData.summary) {
            html += `
            <div style="background: rgba(39, 174, 96, 0.1); border: 1px solid #27ae60; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
                <div style="color: #27ae60; font-weight: bold; margin-bottom: 8px;">✅ AI总结</div>
                <div style="color: #f0f0f0; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${entryData.summary.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            `;
        }

        html += `<div style="font-size: 14px; font-weight: bold; color: #3498db; margin-bottom: 10px;">📜 变更时间线</div>`;

        // 按时间正序显示变更
        entryData.changes.forEach((change, index) => {
            const time = new Date(change.timestamp).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const typeIcon = change.type === 'add' ? '➕ 新增' : change.type === 'modify' ? '✏️ 修改' : '❌ 删除';
            const typeColor = change.type === 'add' ? '#27ae60' : change.type === 'modify' ? '#3498db' : '#e74c3c';

            html += `
            <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 12px; margin-bottom: 10px; border-left: 3px solid ${typeColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="color: ${typeColor}; font-weight: bold;">#${index + 1} ${typeIcon}</span>
                    <span style="color: #888; font-size: 11px;">${time} - ${change.memoryTitle || `记忆块 ${change.memoryIndex + 1}`}</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; ${change.type === 'add' ? 'opacity: 0.5;' : ''}">
                        <div style="color: #e74c3c; font-size: 11px; margin-bottom: 4px;">变更前</div>
                        <div style="font-size: 12px; color: #ccc; max-height: 100px; overflow-y: auto;">
                            ${change.oldValue ? formatEntryForDisplay(change.oldValue) : '<span style="color: #666;">无</span>'}
                        </div>
                    </div>
                    <div style="flex: 1; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; ${change.type === 'delete' ? 'opacity: 0.5;' : ''}">
                        <div style="color: #27ae60; font-size: 11px; margin-bottom: 4px;">变更后</div>
                        <div style="font-size: 12px; color: #ccc; max-height: 100px; overflow-y: auto;">
                            ${change.newValue ? formatEntryForDisplay(change.newValue) : '<span style="color: #666;">无</span>'}
                        </div>
                    </div>
                </div>
            </div>`;
        });

        detailContainer.innerHTML = html;

        // 绑定单个条目AI总结按钮
        const summarizeBtn = document.getElementById('ttw-summarize-single-btn');
        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', () => {
                summarizeSingleEntryEvolution(entryKey);
            });
        }
    }

    // 构建演变描述文本
    function buildEvolutionText(entryData) {
        let text = `条目名称: ${entryData.entryName}\n分类: ${entryData.category}\n\n变更历史:\n`;

        entryData.changes.forEach((change, index) => {
            const time = new Date(change.timestamp).toLocaleString('zh-CN');
            text += `\n--- 第${index + 1}次变更 (${time}, ${change.memoryTitle || `记忆块${change.memoryIndex + 1}`}) ---\n`;
            text += `类型: ${change.type === 'add' ? '新增' : change.type === 'modify' ? '修改' : '删除'}\n`;

            if (change.oldValue) {
                text += `变更前内容: ${change.oldValue['内容'] || JSON.stringify(change.oldValue)}\n`;
            }
            if (change.newValue) {
                text += `变更后内容: ${change.newValue['内容'] || JSON.stringify(change.newValue)}\n`;
            }
        });

        return text;
    }

    // 调用AI进行演变总结
    async function callAIForEvolutionSummary(entryName, evolutionText) {
        try {
            const prompt = getLanguagePrefix() + `请根据以下世界书条目的变更历史，总结这个条目（角色/事物/概念）的常态信息。

**重要要求：**
1. 这是为SillyTavern RPG角色卡准备的世界书条目
2. 人物状态应设置为**常态**（活着、正常状态），不能是死亡、受伤等临时状态
3. 提取该条目的核心特征、背景、能力、关系等持久性信息
4. 忽略故事中的临时变化，保留角色/事物的本质特征
5. 输出应该是精炼的、适合作为RPG世界书条目的描述

${evolutionText}

请直接输出总结内容，不要包含任何解释或前缀。`;

            console.log(`📤 [AI演变总结] 条目: ${entryName}\n完整Prompt:\n`, prompt);
            const response = await callAPI(prompt);
            console.log(`📥 [AI演变总结] 条目: ${entryName} 响应:\n`, response);
            return response;
        } catch (error) {
            console.error('AI总结失败:', error);
            return null;
        }
    }

    // AI总结单个条目演变
    async function summarizeSingleEntryEvolution(entryKey) {
        const entryEvolution = window._ttwEntryEvolution;
        if (!entryEvolution) {
            alert('演变数据未加载');
            return;
        }

        const entryData = entryEvolution[entryKey];
        if (!entryData) {
            alert('找不到该条目的演变数据');
            return;
        }

        // 保存总结前的世界书状态
        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

        // 构建演变描述
        const evolutionText = buildEvolutionText(entryData);

        // 调用AI总结
        updateProgress(50, `正在AI总结条目: ${entryData.entryName}`);
        const summary = await callAIForEvolutionSummary(entryData.entryName, evolutionText);

        if (summary) {
            entryData.summary = summary;

            // 更新世界书中的条目
            const category = entryData.category;
            const entryName = entryData.entryName;
            if (!generatedWorldbook[category]) {
                generatedWorldbook[category] = {};
            }

            const oldValue = generatedWorldbook[category][entryName] || null;
            const newValue = {
                '关键词': oldValue?.['关键词'] || [],
                '内容': summary
            };
            generatedWorldbook[category][entryName] = newValue;

            // 保存到修改历史
            const changedEntries = [{
                category: category,
                entryName: entryName,
                type: oldValue ? 'modify' : 'add',
                oldValue: oldValue,
                newValue: newValue
            }];

            try {
                await MemoryHistoryDB.saveHistory(
                    -1,
                    '记忆-演变总结',
                    previousWorldbook,
                    generatedWorldbook,
                    changedEntries
                );
                console.log(`📚 已保存演变总结历史: ${entryName}`);
            } catch (error) {
                console.error('保存演变总结历史失败:', error);
            }

            // 刷新显示
            showEntryEvolutionDetail(entryKey, entryData);
            await MemoryHistoryDB.saveState(memoryQueue.length);
            updateProgress(100, `条目 ${entryName} AI总结完成`);
        }
    }

    // AI总结全部条目演变
    async function summarizeAllEntryEvolution(entryEvolution) {
        window._ttwEntryEvolution = entryEvolution;
        const entries = Object.entries(entryEvolution);

        if (entries.length === 0) {
            alert('没有可总结的条目');
            return;
        }

        const confirmMsg = `将对 ${entries.length} 个条目进行AI总结。\n这可能需要一些时间和API调用。\n\n是否继续？`;
        if (!confirm(confirmMsg)) return;

        // 保存总结前的世界书状态
        const previousWorldbook = JSON.parse(JSON.stringify(generatedWorldbook));

        showProgressSection(true);
        updateProgress(0, `AI总结中... (0/${entries.length})`);

        let completed = 0;
        for (const [key, data] of entries) {
            if (isProcessingStopped) break;

            try {
                const evolutionText = buildEvolutionText(data);
                const summary = await callAIForEvolutionSummary(data.entryName, evolutionText);
                if (summary) {
                    data.summary = summary;
                }
            } catch (e) {
                console.error(`总结条目 ${key} 失败:`, e);
            }

            completed++;
            updateProgress((completed / entries.length) * 100, `AI总结中... (${completed}/${entries.length})`);
        }

        // 保存总结后的世界书状态到修改历史
        if (completed > 0) {
            const allChangedEntries = [];
            for (const [key, data] of entries) {
                if (data.summary) {
                    const category = data.category;
                    const entryName = data.entryName;
                    if (!generatedWorldbook[category]) {
                        generatedWorldbook[category] = {};
                    }

                    const oldValue = generatedWorldbook[category][entryName] || null;
                    const newValue = {
                        '关键词': oldValue?.['关键词'] || [],
                        '内容': data.summary
                    };
                    generatedWorldbook[category][entryName] = newValue;

                    allChangedEntries.push({
                        category: category,
                        entryName: entryName,
                        type: oldValue ? 'modify' : 'add',
                        oldValue: oldValue,
                        newValue: newValue
                    });
                }
            }

            if (allChangedEntries.length > 0) {
                try {
                    await MemoryHistoryDB.saveHistory(
                        -1,
                        '记忆-演变总结',
                        previousWorldbook,
                        generatedWorldbook,
                        allChangedEntries
                    );
                    console.log(`📚 已保存演变总结历史: ${allChangedEntries.length} 个条目`);
                } catch (error) {
                    console.error('保存演变总结历史失败:', error);
                }
                await MemoryHistoryDB.saveState(memoryQueue.length);
            }
        }

        updateProgress(100, `已完成 ${completed} 个条目的AI总结`);
        alert(`已完成 ${completed} 个条目的AI总结！`);

        // 刷新条目列表
        const entryListContainer = document.getElementById('ttw-entry-list');
        if (entryListContainer) {
            entryListContainer.innerHTML = generateEntryListHTML(entryEvolution);
            // 重新绑定点击事件
            entryListContainer.querySelectorAll('.ttw-entry-evolution-item').forEach(item => {
                item.addEventListener('click', () => {
                    const entryKey = item.dataset.entryKey;
                    showEntryEvolutionDetail(entryKey, entryEvolution[entryKey]);
                    entryListContainer.querySelectorAll('.ttw-entry-evolution-item').forEach(i => i.style.background = 'rgba(0,0,0,0.2)');
                    item.style.background = 'rgba(0,0,0,0.4)';
                });
            });
        }
    }

    // 导出演变数据为SillyTavern世界书格式
    function exportEvolutionData(entryEvolution) {
        const entries = Object.entries(entryEvolution);

        if (entries.length === 0) {
            alert('没有可导出的演变数据');
            return;
        }

        const triggerCategories = new Set(['地点', '剧情大纲']);
        const sillyTavernEntries = [];
        let entryId = 0;

        for (const [key, data] of entries) {
            const category = data.category;
            const entryName = data.entryName;
            const isTriggerCategory = triggerCategories.has(category);
            const constant = !isTriggerCategory;
            const selective = isTriggerCategory;

            // 获取最新的内容和关键词（优先使用AI总结，否则使用最后一次变更的内容）
            let content = data.summary || '';
            let keywords = [];

            if (!content && data.changes.length > 0) {
                const lastChange = data.changes[data.changes.length - 1];
                content = lastChange.newValue?.['内容'] || lastChange.oldValue?.['内容'] || '';
                keywords = lastChange.newValue?.['关键词'] || lastChange.oldValue?.['关键词'] || [];
            }

            if (!content) continue;

            // 处理关键词
            if (!Array.isArray(keywords) || keywords.length === 0) {
                keywords = [entryName];
            }
            const cleanKeywords = keywords.map(k => String(k).trim().replace(/[-_\s]+/g, ''))
                .filter(k => k.length > 0 && k.length <= 20);
            if (cleanKeywords.length === 0) cleanKeywords.push(entryName);
            const uniqueKeywords = [...new Set(cleanKeywords)];

            sillyTavernEntries.push({
                uid: entryId++,
                key: uniqueKeywords,
                keysecondary: [],
                comment: `${category} - ${entryName}`,
                content: content,
                constant,
                selective,
                selectiveLogic: 0,
                addMemo: true,
                order: entryId * 100,
                position: 0,
                disable: false,
                excludeRecursion: false,
                preventRecursion: false,
                delayUntilRecursion: false,
                probability: 100,
                depth: 4,
                group: category,
                groupOverride: false,
                groupWeight: 100,
                scanDepth: null,
                caseSensitive: false,
                matchWholeWords: true,
                useGroupScoring: null,
                automationId: '',
                role: 0,
                vectorized: false,
                sticky: null,
                cooldown: null,
                delay: null
            });
        }

        const exportData = { entries: sillyTavernEntries };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worldbook_evolution_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log(`已导出 ${sillyTavernEntries.length} 个条目为SillyTavern世界书格式`);
        alert(`已导出 ${sillyTavernEntries.length} 个条目！`);
    }

    // 导出指定历史版本的世界书
    async function exportHistoryWorldbook(historyId) {
        try {
            const history = await MemoryHistoryDB.getHistoryById(historyId);
            if (!history) {
                alert('找不到该历史记录');
                return;
            }

            const worldbook = history.newWorldbook;
            if (!worldbook || Object.keys(worldbook).length === 0) {
                alert('该历史记录没有世界书数据');
                return;
            }

            // 生成世界书名称
            const timestamp = new Date(history.timestamp);
            const readableTimeString = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}`;
            const worldbookName = `${history.memoryTitle || `记忆${history.memoryIndex + 1}`}-${readableTimeString}`;

            // 转换为SillyTavern世界书格式
            const sillyTavernWorldbook = convertToSillyTavernFormat(worldbook);

            const blob = new Blob([JSON.stringify(sillyTavernWorldbook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = worldbookName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            a.download = `${safeName}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`已导出历史记录 #${historyId} 的世界书 (SillyTavern世界书格式)`);
        } catch (error) {
            console.error('导出历史世界书失败:', error);
            alert('导出失败: ' + error.message);
        }
    }

    // ========== 公开 API ==========
    window.TxtToWorldbook = {
        open: open,
        close: closeModal,
        _rollbackToHistory: rollbackToHistory,
        _exportHistoryWorldbook: exportHistoryWorldbook,
        getWorldbook: () => generatedWorldbook,
        getMemoryQueue: () => memoryQueue
    };

    console.log('📚 TxtToWorldbook 模块已加载');
})();

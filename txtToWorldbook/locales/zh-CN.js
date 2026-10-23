/**
 * 中文（简体）语言包 - 默认语言
 */
export default {
    // ========== 通用 ==========
    common: {
        confirm: '确认',
        cancel: '取消',
        ok: '确定',
        save: '保存',
        close: '关闭',
        reset: '重置',
        edit: '编辑',
        delete: '删除',
        copy: '复制',
        refresh: '刷新',
        preview: '预览',
        export: '导出',
        import: '导入',
        start: '开始',
        stop: '停止',
        pause: '暂停',
        resume: '恢复',
        retry: '重试',
        apply: '应用',
        clear: '清除',
        search: '查找',
        replace: '替换',
        yes: '是',
        no: '否',
        unknown: '未知',
        all: '全部',
        none: '无',
        loading: '加载中...',
        processing: '处理中...',
        success: '成功',
        failed: '失败',
        enabled: '已启用',
        disabled: '已禁用',
    },

    // ========== 错误 ==========
    errors: {
        userAborted: '用户中止操作',
        unknown: '未知错误',
        operationCancelled: '操作已取消',
        network: '网络连接失败，请检查网络设置',
        networkError: '网络错误',
        requestTimeout: '请求超时',
        tokenLimit: 'AI 响应超过 Token 限制',

        // HTTP 状态码
        http: {
            400: '请求格式错误',
            401: '未授权，请检查 API Key',
            403: '访问被拒绝',
            404: '请求的资源不存在',
            408: '请求超时',
            429: '请求过于频繁，请降低速度',
            500: '服务器内部错误',
            502: '网关错误',
            503: '服务不可用，请稍后重试',
            504: '网关超时',
            529: '服务过载，请稍后重试',
        },

        apiError: 'API 错误 ({status})',
    },

    // ========== 模态框 ==========
    modal: {
        error: '❌ 错误',
        confirmTitle: '确认',
        promptTitle: '输入',
        close: '关闭',
    },

    // ========== 状态 ==========
    status: {
        idle: '空闲',
        running: '运行中',
        paused: '已暂停',
        stopped: '已停止',
        repairing: '修复中',
        rerolling: '重Roll中',
    },

    // ========== 帮助文档 ==========
    help: {
        title: '❓ TXT 转世界书帮助',
        sections: {
            basic: {
                title: '📌 基本功能',
                items: [
                    '将 TXT 小说转换为 SillyTavern 世界书格式',
                    '自动检测文件编码（UTF-8 / GBK / GB2312 / GB18030 / Big5）',
                    '基于正则的<strong>章回自动检测</strong>和智能分块（支持自定义正则、快速预设、重新分块）',
                    '支持<strong>并行/串行</strong>处理，并行支持独立模式和分批模式，可配置并发数',
                    '分批并行模式下<strong>批次间自动同步世界书摘要</strong>，减少跨批次重复条目',
                    '<strong>增量输出</strong>：只输出变更条目，减少重复',
                    '<strong>分卷模式</strong>：上下文超限时自动分卷',
                    '<strong>自动断点续传</strong>：处理期间每 60 秒自动保存，浏览器崩溃/刷新后可恢复',
                    '<strong>ETA 预估</strong>：根据最近章节处理速度实时预估剩余时间',
                ],
            },
            api: {
                title: '🔧 API 模式',
                items: [
                    '<strong>酒馆 API</strong>：使用 SillyTavern 当前连接的 AI（注意：消息角色会被酒馆后处理覆盖，且可能注入预设 JB 内容）',
                    '<strong>自定义 API</strong>：直连 API，消息链角色设置完全生效，不受酒馆干预',
                    '支持 <strong>Gemini / Anthropic / OpenAI 兼容</strong> 多种直连和代理模式',
                    '支持<strong>拉取模型列表</strong>、<strong>快速测试连接</strong>',
                    '<strong>智能重试</strong>：自动重试 429 限流、500/502/503 服务器错误、网络中断等瞬态故障（含酒馆 API）',
                ],
            },
            categories: {
                title: '🏷️ 自定义提取分类',
                items: [
                    '内置分类：<strong>角色、地点、组织</strong>；预设分类：<strong>道具、玩法、章节剧情、角色内心</strong>',
                    '支持添加/编辑/删除自定义分类，每个分类可配置名称、条目示例、关键词示例、内容提取指南',
                    '每个分类可配置<strong>默认导出位置/深度/顺序/自动递增</strong>',
                ],
            },
            prompt: {
                title: '📝 提示词系统',
                items: [
                    '<strong>世界书词条提示词</strong>（核心，含 <code>{DYNAMIC_JSON_TEMPLATE}</code> 占位符）',
                    '可选：<strong>剧情大纲</strong>、<strong>文风配置</strong>、<strong>后缀提示词</strong>',
                    '<strong>💬 消息链配置</strong>：将提示词按对话补全预设格式发送，每条消息可指定角色（🔷 系统 / 🟢 用户 / 🟡 AI 助手）',
                    '消息链中使用 <code>{PROMPT}</code> 占位符代表实际组装好的提示词内容',
                    '酒馆 API 优先使用 <code>generateRaw</code> 消息数组格式（ST 1.13.2+），自动兼容旧版',
                    '<strong>👁️ Prompt 模板编辑</strong>：预览按钮支持分标签页查看/编辑世界书、剧情、文风的完整 prompt 模板，含占位符说明',
                    '所有提示词支持恢复默认和预览，支持<strong>导出/导入配置</strong>',
                ],
            },
            defaultEntries: {
                title: '📚 默认世界书条目',
                items: [
                    '可视化添加/编辑/删除默认条目，每个条目可配置分类、名称、关键词、内容、位置/深度/顺序',
                    '转换时<strong>自动添加</strong>到世界书，也可<strong>立即应用</strong>到当前世界书',
                ],
            },
            chapters: {
                title: '📋 章节管理',
                items: [
                    '点击章节查看原文、编辑、复制、重 Roll、合并到上一章/下一章',
                    '<strong>⬆️⬇️ 合并章节</strong>：合并相邻章节，自动更新世界书',
                    '<strong>🗑️ 多选删除</strong>：批量选择并删除章节（已处理章节的警告提示）',
                ],
            },
            search: {
                title: '🔍 查找与替换',
                items: [
                    '<strong>查找高亮</strong>：在世界书预览中高亮显示关键词',
                    '<strong>批量替换</strong>：一键替换所有匹配项（执行前自动保存世界书快照）',
                    '支持<strong>正则表达式</strong>和<strong>大小写敏感</strong>选项',
                ],
            },
            alias: {
                title: '🔗 别名合并',
                items: [
                    '自动检测疑似同名条目，AI 判断后合并',
                    '支持<strong>手动合并</strong>：跨分类勾选条目合并，自定义主名称和目标分类',
                    '<strong>两两判断</strong>：AI 对每一对分别判断，自动串联结果（A=B 且 B=C → A,B,C 合并）',
                    '所有合并操作执行前<strong>自动保存世界书快照</strong>，可在历史记录中回退',
                ],
            },
            tokens: {
                title: '🔢 Token 计数',
                items: ['每个条目/分类/全局显示 Token 数，支持<strong>阈值高亮</strong>快速发现截断条目'],
            },
            history: {
                title: '📜 修改历史',
                items: [
                    '自动记录变更，左右分栏查看，支持<strong>⏪ 回退到任意版本</strong>，数据存 IndexedDB 不丢失',
                    '批量替换、条目整理、别名合并等操作前<strong>自动保存快照</strong>，可随时回退',
                ],
            },
            importMerge: {
                title: '📥 导入合并世界书',
                items: [
                    '支持 SillyTavern 格式和内部 JSON 格式，自动检测重复',
                    '重复处理：<strong>AI 智能合并</strong> / 覆盖 / 保留 / 重命名 / 内容叠加',
                ],
            },
            exportImport: {
                title: '💾 导入导出',
                items: [
                    '<strong>导出 JSON / SillyTavern 格式</strong>，支持分卷导出',
                    '<strong>📤 导出变更</strong>：仅导出上次导出以来新增/修改的条目，方便增量更新',
                    '<strong>导出/导入任务</strong>：保存完整进度，支持换设备继续',
                    '<strong>导出/导入配置</strong>：保存提示词、分类、默认条目等所有设置',
                ],
            },
            aiTools: {
                title: '🧠 AI 优化与整理',
                items: [
                    '<strong>🧠 AI 优化世界书</strong>：让 AI 自动优化、整理世界书条目内容，提升整体质量',
                    '<strong>📊 条目演变聚合</strong>：追踪条目在不同章节的变化历程，自动聚合历史信息',
                    '<strong>🛠️ 整理条目</strong>：AI 自动优化条目内容、去除重复信息、标准化格式（执行前自动保存快照）',
                    '<strong>🐳 清除标签</strong>：一键清理 AI 输出的 thinking、思考等标签内容',
                    '<strong>🔍 自动去重检测</strong>：处理完成后自动扫描疑似重复条目并提示，建议使用别名合并处理',
                ],
            },
            modelStatus: {
                title: '📊 模型状态显示',
                items: [
                    '实时显示 API 连接状态：成功/失败/连接中',
                    '显示可用模型列表，支持快速选择切换',
                    '限流信息显示：当前限流设置、TPM 余量等',
                ],
            },
        },
        tips: {
            title: '💡 使用技巧',
            items: [
                '长篇小说建议开启<strong>并行模式</strong>（独立模式最快，分批模式更连贯）',
                '遇到乱码？<strong>🔍 查找</strong>定位 → <strong>🎲 批量重 Roll</strong>修复',
                '某条目不满意？点<strong>🎯</strong>单独重 Roll，可添加提示词指导',
                'AI 输出 thinking 标签？<strong>🏷️ 清除标签</strong>一键清理',
                '消息链角色不生效？切换<strong>自定义 API 模式</strong>（酒馆 API 会覆盖角色设置）',
                '同一事物多个名字？<strong>🔗 别名合并</strong>自动识别（处理完成后也会自动提示）',
                '进度自动保存，无需手动操作；也可随时<strong>📤 导出任务</strong>跨设备恢复',
                '批量替换/整理/合并操作前<strong>自动保存快照</strong>，可在历史记录中回退',
                '只需更新部分条目？<strong>📤 导出变更</strong>仅导出上次导出后的新增/修改',
                '想调整完整 prompt？点<strong>👁️ 预览</strong>按钮可直接编辑各类 prompt 模板',
                '导出时控制位置？点分类或条目旁的<strong>⚙️</strong>按钮配置',
                '主 UI 只能通过右上角<strong>✕ 按钮</strong>关闭，防止误触退出',
                '分卷模式下关注<strong>分卷指示器</strong>，了解当前卷和完成进度',
            ],
        },
        gotIt: '我知道了',
    },

    // ========== 渲染器标签 ==========
    renderer: {
        // 世界书条目
        entry: {
            keywords: '🔑 关键词',
            content: '📝 内容',
            configTitle: '配置位置/深度/顺序',
            rerollTitle: '单独重 Roll 此条目',
            newMergedBadge: '✨ 新合并',
            builtinTag: '(内置)',
            depthPrefix: 'D',
            orderPrefix: 'O',
        },
        // 分类
        category: {
            entriesLabel: '条目',
        },
        // 汇总
        summary: {
            total: '共 {categoryCount} 个分类, {totalEntries} 个条目 | 总计 ~{totalTokens} tk',
            belowThreshold: ' | ⚠️ {count} 个条目低于 {threshold} tk',
        },
        // 处理状态图标
        status: {
            processing: '⏳',
            failed: '❌',
            processed: '✅',
            waiting: '⏳',
        },
    },

    // ========== 设置面板 ==========
    settings: {
        title: '📚 TXT 转世界书',
        sections: {
            api: '🔌 API 配置',
            prompt: '📝 提示词配置',
            categories: '🏷️ 提取分类',
            defaultEntries: '📚 默认世界书条目',
            upload: '📤 文件上传',
            queue: '📋 章节队列',
            progress: '⏳ 处理进度',
            result: '✨ 生成结果',
        },
    },

    // ========== 进度 ==========
    progress: {
        eta: '约 {min} 分 {sec} 秒',
        etaMinutes: '约 {min} 分钟',
        etaSeconds: '约 {sec} 秒',
        parallel: '🚀 并行处理中 ({done}/{total})',
        parallelCompleted: '📦 并行处理完成，成功: {success}/{total}',
        parallelStart: '🚀 并行处理 {count} 个记忆块 (并发: {concurrency})',
    },

    // ========== 处理日志 ==========
    processing: {
        chapterStart: '🔄 [第 {chapter} 章] 开始处理: {title}',
        chapterCompleted: '✅ [第 {chapter} 章] 处理完成',
        chapterError: '❌ [第 {chapter} 章] 错误: {message}',
        chapterRetry: '🔄 [第 {chapter} 章] {delay} 秒后重试...',
        debugApiCall: '[第 {chapter} 章] 调用 API...',
        debugParsing: '[第 {chapter} 章] 解析 AI 响应...',
        debugTokenLimit: '[第 {chapter} 章] 检查 Token 限制...',
        debugPostProcess: '[第 {chapter} 章] 后处理章节索引...',
    },

    // ========== 自动续写面板 ==========
    novel: {
        title: '📚 小说自动生成器',
        start: '▶️ 开始',
        pause: '⏸️ 暂停',
        resume: '⏯️ 恢复',
        stop: '⏹️ 停止',
        reset: '🔄 重置',
        statusStopped: '⏹️ 已停止',
        statusRunning: '▶️ 运行中',
        statusPaused: '⏸️ 已暂停',
        generateSettings: '📝 生成设置',
        exportSettings: '📤 导出设置',
        tagSettings: '🏷️ 标签提取',
        advancedSettings: '⚙️ 高级设置',
        txtToWorldbook: '📚 TXT转世界书',
        targetChapters: '目标章节',
        prompt: '提示词',
        startFloor: '起始楼层',
        endFloor: '结束楼层',
        includeUser: '👤 用户消息',
        includeAI: '🤖 AI 回复',
        useRaw: '📄 原始 (chat.mes)',
        exportAll: '📑 导出全部',
        exportTxt: '📄 TXT',
        exportJson: '📦 JSON',
        floors: '共 {count} 条',
        autoSave: '自动保存间隔',
        maxRetries: '最大重试',
        minLength: '最小章节长度',
        pauseNotice: '当前章节结束后暂停',
        resumeNotice: '已恢复',
        stopNotice: '已停止自动续写；酒馆正在生成的回复可能仍会完成',
        resetNotice: '已重置',
        resetBlocked: '请先停止',
        noContent: '没有内容',
        exported: '已导出 {count} 条',
        exportedJson: '已导出 JSON',
        exportTime: '导出时间',
        exportChapters: '总章节',
        exportChars: '总字数',
        exportUser: '用户',
        exportAi: 'AI',
        tagMode: '提取模式',
        tagAll: '全部内容',
        tagOnly: '只提取指定标签',
        tagNames: '标签名称',
        tagHint: '(空格/逗号分隔)',
        separator: '分隔符',
        separatorBlank: '空行',
        separatorNewline: '换行',
        separatorNone: '无',
        excludeTags: '移除标签',
        excludeHint: '(可选，空格/逗号分隔)',
        preview: '📋 预览',
        clickRefresh: '点击刷新',
        sendPhase: '发送阶段',
        sendDesc: '消息发送后，等待剧情推进等插件处理完成',
        enableToast: '💬 启用弹窗检测',
        waitTimeout: '等待超时 (ms)',
        extraWait: '额外等待 (ms)',
        replyPhase: '回复阶段',
        replyDesc: 'AI回复完成后，等待总结等插件处理完成',
        waitAfterReply: '回复后等待 (ms)',
        stabilityInterval: '稳定检查间隔 (ms)',
        stabilityCount: '稳定次数',
        controlPhase: '生成控制',
        controlDesc: '控制自动生成的行为参数',
        debugHint: '控制台调试',
        help: {
            generateTitle: '📝 生成设置说明',
            generateContent: `
<h4>📌 目标章节</h4>
<p>设置要自动生成的章节总数。</p>
<h4>📌 提示词</h4>
<p>每次自动发送给 AI 的消息内容。</p>
            `,
            exportTitle: '📤 导出设置说明',
            exportContent: `
<h4>📌 楼层范围</h4>
<p>楼层从 <b>0</b> 开始计数。</p>
<h4>📌 原始 (chat.mes)</h4>
<ul>
    <li><b>✅ 勾选</b>：读取原始内容</li>
    <li><b>❌ 不勾选</b>：读取显示内容（经过正则处理）</li>
</ul>
            `,
            extractTitle: '🏷️ 标签提取说明',
            extractContent: `
<h4>📌 什么是标签提取？</h4>
<p>从 AI 回复的原始内容中，只提取指定 XML 标签内的文字。</p>
<h4>📌 使用场景</h4>
<p>当你使用正则美化输出时，原始回复可能包含：</p>
<pre>&lt;思考&gt;AI的思考过程...&lt;/思考&gt;
&lt;content&gt;这是正文内容...&lt;/content&gt;</pre>
<p>使用标签提取可以只导出 &lt;content&gt; 内的正文。</p>
<h4>📌 如何使用</h4>
<ol>
    <li>✅ 勾选「原始 (chat.mes)」</li>
    <li>若要白名单提取，模式选择「标签」并填写要提取的标签名</li>
    <li>若只想移除杂项，可保持「全部内容」并填写要移除的标签名</li>
    <li>白名单提取与黑名单移除可以同时使用</li>
</ol>
<h4>📌 多标签</h4>
<p>用空格、逗号分隔：<code>content detail 正文</code></p>
<h4>📌 黑名单移除</h4>
<p>移除标签会删除对应标签及其内部内容，建议同样勾选「原始 (chat.mes)」，并可与白名单提取同时使用。</p>
<pre>&lt;thinking&gt;思考...&lt;/thinking&gt;
&lt;content&gt;正文&lt;/content&gt;</pre>
<p>若移除 <code>thinking</code>，预览和导出将只保留其他内容。</p>
<h4>📌 调试</h4>
<p>控制台输入 <code>nagDebug()</code></p>
            `,
            advancedTitle: '⚙️ 高级设置说明',
            advancedContent: `
<h4>📤 发送阶段</h4>
<p>消息发送后，可能有其他插件（如剧情推进插件）需要处理消息。</p>
<ul>
    <li><b>弹窗检测</b>：检测到弹窗时等待其消失，确保其他插件处理完成</li>
    <li><b>等待超时</b>：最长等待弹窗消失的时间</li>
    <li><b>额外等待</b>：弹窗消失后再等待的时间</li>
</ul>

<h4>📥 回复阶段</h4>
<p>AI回复完成后，可能有总结插件需要处理内容。</p>
<ul>
    <li><b>回复后等待</b>：AI回复稳定后等待的时间，让总结插件有时间启动</li>
    <li><b>稳定检查间隔</b>：检查内容是否稳定的间隔</li>
    <li><b>稳定次数</b>：内容需要连续多少次不变才算稳定</li>
    <li><b>弹窗检测</b>：检测总结插件的弹窗，等待其完成</li>
</ul>

<h4>🔧 生成控制</h4>
<ul>
    <li><b>自动保存间隔</b>：每生成多少章自动导出一次</li>
    <li><b>最大重试</b>：单章生成失败的最大重试次数</li>
    <li><b>最小长度</b>：AI回复少于此字数视为失败</li>
</ul>
            `,
        },
    },

    worldbook: {
        title: '📚 TXT转世界书',
        settings: '⚙️ 设置',
        upload: '📤 文件上传',
        queue: '📋 章节队列',
        progress: '⏳ 处理进度',
        result: '📊 生成结果',
        start: '🚀 开始转换',
        pause: '⏸️ 暂停',
        repair: '🔧 修复失败',
        stream: '👁️ 实时输出',
        copyStream: '📋 复制全部',
        clearStream: '清空',
        search: '🔍 查找',
        replace: '🔄 替换',
        viewWorldbook: '📖 查看世界书',
        history: '📜 修改历史',
        consolidate: '🧹 整理条目',
        cleanTags: '🏷️ 清除标签',
        manualMerge: '✋ 手动合并',
        aliasMerge: '🔗 自动别名合并',
        exportCard: '🃏 导出角色卡',
        exportVolumes: '📦 分卷导出',
        exportWorldbook: '📥 导出世界书',
        exportChanged: '📤 导出变更',
        mergeWorldbook: '📥 合并世界书',
        importTask: '📥 导入任务',
        exportTask: '📤 导出任务',
        legacyBackup: '迁移前备份',
        clearFile: '清除',
        viewProcessed: '📊 已处理',
        selectStart: '📍 选择起始',
        multiDelete: '🗑️ 多选删除',
        confirmDelete: '确认删除',
        cancel: '取消',
        add: '➕ 添加',
        reset: '🔄 重置',
        apply: '🔄 立即应用',
        preview: '👁️ 预览',
        fetchModels: '🔄 拉取模型',
        quickTest: '⚡ 快速测试',
        rechunk: '🔄 重新分块',
        detect: '🔍 检测',
        addMessage: '➕ 添加消息',
        resetChain: '🔄 恢复默认',
        exportSettings: '📤 导出',
        importSettings: '📥 导入',
        apiProvider: 'API提供商',
        apiKey: 'API Key',
        endpoint: 'API Endpoint',
        model: '模型',
        parallelTitle: '🚀 并行处理',
        enable: '启用',
        concurrency: '并发数',
        independentMode: '🚀 独立模式 - 最快，每章独立提取后合并',
        batchMode: '📦 分批模式 - 批次间自动同步世界书摘要，更连贯',
        chapterRegexTitle: '📖 章回正则设置',
        chapterRegexHint: '自定义章节检测正则表达式',
        presetChinese: '中文通用',
        presetEnglish: '英文Chapter',
        presetNumeric: '数字章节',
        chunkSize: '每块字数',
        apiTimeout: 'API超时(秒)',
        incremental: '📝 增量输出模式',
        volume: '📦 分卷模式',
        forceMarker: '📌 强制记忆为章节',
        recursion: '🔄 允许条目递归',
        filterTags: '🧹 响应过滤标签',
        debugMode: '🔍 调试模式',
        useTavernApi: '🍺 使用酒馆API',
        streamHeader: '📤 实时输出',
        defaultEntries: '默认世界书条目',
        addDefaultEntry: '➕ 添加',
        applyDefaultEntry: '🔄 立即应用',
        worldbookPrompt: '世界书词条',
        plotOutline: '剧情大纲',
        styleConfig: '文风配置',
        messageChain: '消息链配置',
        extraSystemPrompt: '附加系统提示词',
        suffixPrompt: '后缀提示词',
        categories: '自定义提取分类',
        addCategory: '➕ 添加',
        resetCategories: '🔄 重置',
    },

    queueView: {
        selectedCount: '已选: {count}',
        chapterOption: '{status} 第{index}章 - {title} ({chars}字)',
        empty: '暂无章节数据',
        uploadFirst: '请先上传文件',
        statusProcessing: '🔄 处理中',
        statusFailed: '❗ 失败',
        statusDone: '✅ 完成',
        statusWaiting: '⏳ 等待',
        startFromLabel: '从哪一章开始：',
        startWarning: '⚠️ 从中间开始时，之前的世界书数据不会自动加载。',
        cancel: '取消',
        confirm: '确定',
        selectStartTitle: '📍 选择起始位置',
        startFromChapter: '▶️ 从第{index}章开始',
        processedTitle: '📊 处理结果',
        charCount: '字数:',
        copy: '📋 复制',
        rollHistory: '🎲 Roll历史',
        delete: '🗑️ 删除',
        originalContent: '📝 原文内容',
        editable: '(可编辑)',
        mergePrev: '⬆️ 合并到上一章',
        mergeNext: '⬇️ 合并到下一章',
        save: '💾 保存修改',
        memoryTitle: '📄 {title} (第{index}章)',
        copied: '✅ 已复制',
        mergePrevConfirm: '将当前内容合并到 "{title}" 的末尾？\n\n⚠️ 合并后当前章将被删除！',
        mergePrevTitle: '合并到上一章',
        mergeNextConfirm: '将当前内容合并到 "{title}" 的开头？\n\n⚠️ 合并后当前章将被删除！',
        mergeNextTitle: '合并到下一章',
        merged: '已合并到 "{title}"，当前章已删除',
        noProcessed: '暂无已处理的结果',
        processedChapter: '✅ 第{index}章',
        processedStats: '{entries}条 | {chars}k字',
        clickToView: '👈 点击左侧章节查看结果',
        close: '关闭',
        processedTitleCount: '📊 已处理结果 ({done}/{total})',
        chapterHeading: '第{index}章 - {title}',
        copyResult: '📋 复制',
        copiedResult: '✅ 已复制',
    },
    historyView: {
        empty: '暂无历史',
        chapter: '第{index}章',
        changeCount: '{count}项',
        click: '👈 点击左侧查看详情',
        clear: '🗑️ 清空历史',
        close: '关闭',
        title: '📜 修改历史 ({count}条)',
        confirmClear: '确定清空所有历史记录？',
        clearTitle: '清空历史记录',
        notFound: '找不到记录',
        time: '时间: {time}',
        rollback: '⏪ 回退到此版本前',
        changes: '变更 ({count}项)',
        diff: '▶ 查看 Diff ({summary})',
        keywordChange: '🔑 关键词变更: {old} → {new}',
        noChanges: '无变更记录',
        confirmRollback: '确定回退到此版本？页面将刷新。',
        rollbackTitle: '回退历史版本',
        rollbackSuccess: '回退成功！页面将刷新。',
        rollbackError: '回退失败: {message}',
    },

    worldbookView: {
        empty: '暂无世界书数据',
        greenLight: '绿灯(触发式) - 点击切换为蓝灯',
        blueLight: '蓝灯(常驻) - 点击切换为绿灯',
        tokenThreshold: '🔍 Token阈值:',
        apply: '应用',
        belowThreshold: '低于此值的条目将红色高亮（0=关闭）',
        hint: '💡 点击⚙️配置，点击🎯单独重Roll条目，点击灯图标切换蓝/绿灯',
        manualMerge: '✋ 手动合并',
        batchReroll: '🎲 批量重Roll',
        title: '📖 世界书详细视图',
        volumeSuffix: ' ({count}卷合并)',
        volumeHeader: '📦 分卷模式 | 共 {count} 卷',
    },

    searchView: {
        title: '🔍 查找内容',
        inputLabel: '输入要查找的字符（如乱码字符 U+FFFD）',
        inputPlaceholder: '输入要查找的内容...',
        suffixLabel: '📝 重Roll时附加的提示词（插入到发送给AI的文本最后）',
        suffixPlaceholder: '例如：请特别注意提取XX信息，修复乱码内容...',
        enterKeyword: '输入关键词后点击"查找"',
        clickEntry: '👈 点击左侧条目查看详情',
        clearHighlight: '清除高亮',
        search: '🔍 查找',
        rerollAll: '🎲 重Roll所有匹配章节',
        close: '关闭',
        enterSearch: '请输入要查找的内容',
        notFound: '未找到包含"{keyword}"的内容',
        foundSummary: '找到 {results} 个匹配项，涉及 {memories} 个章节',
        defaultImported: '默认/导入',
        currentResult: '✓ 当前结果',
        mergedData: '⚠ 合并数据',
        fieldName: '条目名',
        fieldKeywords: '关键词',
        fieldContent: '内容',
        memoryLabel: '记忆{index}',
        memoryWithChapter: '记忆{index} (第{index}章)',
        sourceMemory: '来自: 记忆{index} 的当前处理结果',
        sourceMerged: '来自: 合并后的世界书',
        defaultImportedEntries: '默认/导入条目',
        keywords: '📝 关键词',
        content: '📄 内容',
        detailUnavailable: '无法获取条目详情',
        sourceLabel: '📍 来源: {source}',
        rerollThisChapter: '🎲 重Roll此章节',
        rerollChapterTitle: '单章重 Roll',
        rerollChapterConfirm: '确定要重Roll 第{index}章吗？',
        rerollChapterSuccess: '第{index}章 重Roll完成',
        rerollFailed: '重Roll失败: {message}',
        rerolling: '🔄 重Roll中...',
        progress: '🔄 进度: {done}/{total}',
        rerollAllFound: '🎲 重Roll所有匹配章节 ({count}章)',
        batchRerollConfirm:
            '确定要重Roll {count} 个章节吗？\n\n这将使用当前附加提示词重新生成这些章节的世界书条目。{parallel}',
        parallelHint: '\n\n将使用并行处理（{count}并发）',
        batchRerollTitle: '批量重 Roll 章节',
        stopped: '已停止',
        searchFirst: '请先进行查找',
        noMatchingChapters: '没有找到匹配的章节',
        batchComplete: '批量重Roll完成！\n成功: {success}\n失败: {fail}{stopped}',
        stoppedSuffix: '\n(已手动停止)',
        cleared: '已清除高亮',
        debugNoResult: '调试：找不到result，idx={idx}，results长度={length}',
    },
    replaceView: {
        title: '🔄 批量替换',
        findLabel: '查找内容',
        findPlaceholder: '输入要查找的词语...',
        replaceLabel: '替换为（留空则删除该词语）',
        replacePlaceholder: '输入替换内容，留空则删除...',
        worldbook: '替换世界书中的内容',
        memories: '替换各章节处理结果中的内容',
        preview: '👁️ 预览',
        execute: '🔄 执行替换',
        close: '关闭',
        enterFind: '请输入要查找的内容',
        notFound: '未找到"{text}"',
        replaceItem: '替换此项',
        foundCount: '找到 {count} 处匹配',
        clickToReplace: '点击"替换此项"可单独替换',
        replaceWithAction: '替换为"{text}"',
        deleteAction: '删除',
        confirmSingle: '确定要{action}此处的"{text}"吗？\n\n位置: {location}',
        singleTitle: '替换单项',
        replaced: '✓ 已替换',
        failed: '替换失败，可能条目已被修改',
        confirmBatch: '确定要{action} {count} 处"{text}"吗？\n\n此操作不可撤销！',
        batchTitle: '批量替换',
        snapshot: '快照-批量替换前',
        done: '✅ 替换完成！共替换了 {count} 处',
        continueInput: '可继续输入新的查找/替换内容',
    },

    rerollView: {
        noSource: '⚠️ 未找到该条目的来源章节（可能是默认条目或导入条目）',
        sourcesHint: '该条目来自以下章节（可多选）：',
        chapter: '第{index}章 - {title}',
        chars: '{chars}k字',
        noHistory: '暂无Roll历史',
        use: '✅ 使用',
        currentEntry: '📝 当前条目内容（可编辑）',
        saveEdit: '💾 保存编辑',
        keywordsLabel: '🔑 关键词（逗号分隔）',
        contentLabel: '📄 内容',
        rollHistory: '📜 Roll历史 ({count}条)',
        clear: '🗑️ 清空',
        sourcesTitle: '📍 选择来源章节重Roll',
        selectAllToggle: '全选/取消',
        extraPrompt: '📝 额外提示词（可选）',
        extraPromptPlaceholder: '例如：请更详细地描述该角色的性格特点、请补充该角色的外貌描写...',
        concurrency: '⚡ 并发数:',
        concurrencyHint: '（多选时同时处理的数量）',
        cancel: '取消',
        stop: '⏸️ 停止',
        startReroll: '🎯 开始重Roll',
        batchPrompt: '📝 统一提示词',
        batchPromptPlaceholder: '对所有选中条目使用相同的提示词...',
        batchTitle: '🎲 批量重Roll条目',
        currentResult: '📝 当前处理结果（第{index}章）',
        currentResultHint: '可直接编辑下方JSON，编辑后点击"保存并应用"',
        saveApply: '💾 保存并应用',
        copy: '📋 复制',
        pasteJson: '📋 粘贴JSON导入',
        pasteJsonHint: '支持标准JSON、带```json代码块的、甚至不完整的JSON',
        pastePlaceholder: '在此粘贴JSON...',
        parseFill: '📋 解析并填入上方',
        useThis: '✅ 使用此结果',
        saveEdited: '💾 保存编辑',
        parseReplace: '📋 解析并替换到上方',
        selectAll: '全选',
        deselectAll: '取消全选',
        reroll: '🎲 重Roll',
        customPrompt: '📝 重Roll自定义提示词',
        customPromptPlaceholder: '可在此添加额外要求，如：重点提取XX角色的信息、更详细地描述XX事件...',
        stopReroll: '⏸️ 停止',
        clearRolls: '🗑️ 清空',
        close: '关闭',
        rollHistoryTitle: '🎲 {title} (第{index}章) - Roll历史',
        noRerollEntries: '没有可重Roll的条目（没有找到来源章节）',
        sourcesCount: '{count}章',
        selectEntry: '请至少选择一个条目',
    },
};

export function createHelpModal(deps = {}) {
    const { ModalFactory } = deps;

    function showHelpModal() {
        const existingHelp = document.getElementById('ttw-help-modal');
        if (existingHelp) existingHelp.remove();

        const bodyHtml = `
<div style="margin-bottom:16px;">
<h4 style="color:#e67e22;margin:0 0 10px;">📌 基本功能</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>将TXT小说转换为SillyTavern世界书格式</li>
<li>自动检测文件编码（UTF-8/GBK/GB2312/GB18030/Big5）</li>
<li>基于正则的<strong>章回自动检测</strong>和智能分块（支持自定义正则、快速预设、重新分块）</li>
<li>支持<strong>并行/串行</strong>处理，并行支持独立模式和分批模式，可配置并发数</li>
<li>分批并行模式下<strong>批次间自动同步世界书摘要</strong>，减少跨批次重复条目</li>
<li><strong>增量输出</strong>：只输出变更条目，减少重复</li>
<li><strong>分卷模式</strong>：上下文超限时自动分卷</li>
<li><strong>自动断点续传</strong>：处理期间每60秒自动保存，浏览器崩溃/刷新后可恢复</li>
<li><strong>ETA预估</strong>：根据最近章节处理速度实时预估剩余时间</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#3498db;margin:0 0 10px;">🔧 API模式</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>酒馆API</strong>：使用SillyTavern当前连接的AI（注意：消息角色会被酒馆后处理覆盖，且可能注入预设JB内容）</li>
<li><strong>自定义API</strong>：直连API，消息链角色设置完全生效，不受酒馆干预</li>
<li>支持 <strong>Gemini / Anthropic / OpenAI兼容</strong> 多种直连和代理模式</li>
<li>支持<strong>拉取模型列表</strong>、<strong>快速测试连接</strong></li>
<li><strong>智能重试</strong>：自动重试429限流、500/502/503服务器错误、网络中断等瞬态故障（含酒馆API）</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">🏷️ 自定义提取分类</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>内置分类：<strong>角色、地点、组织</strong>；预设分类：<strong>道具、玩法、章节剧情、角色内心</strong></li>
<li>支持添加/编辑/删除自定义分类，每个分类可配置名称、条目示例、关键词示例、内容提取指南</li>
<li>每个分类可配置<strong>默认导出位置/深度/顺序/自动递增</strong></li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#27ae60;margin:0 0 10px;">📝 提示词系统</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>世界书词条提示词</strong>（核心，含 <code>{DYNAMIC_JSON_TEMPLATE}</code> 占位符）</li>
<li>可选：<strong>剧情大纲</strong>、<strong>文风配置</strong>、<strong>后缀提示词</strong></li>
<li><strong>💬消息链配置</strong>：将提示词按对话补全预设格式发送，每条消息可指定角色（🔷系统/🟢用户/🟡AI助手）</li>
<li>消息链中使用 <code>{PROMPT}</code> 占位符代表实际组装好的提示词内容</li>
<li>酒馆API优先使用 <code>generateRaw</code> 消息数组格式（ST 1.13.2+），自动兼容旧版</li>
<li><strong>👁️ Prompt模板编辑</strong>：预览按钮支持分标签页查看/编辑世界书、剧情、文风的完整prompt模板，含占位符说明</li>
<li>所有提示词支持恢复默认和预览，支持<strong>导出/导入配置</strong></li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e67e22;margin:0 0 10px;">📚 默认世界书条目</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>可视化添加/编辑/删除默认条目，每个条目可配置分类、名称、关键词、内容、位置/深度/顺序</li>
<li>转换时<strong>自动添加</strong>到世界书，也可<strong>立即应用</strong>到当前世界书</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#1abc9c;margin:0 0 10px;">📋 章节管理</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>点击章节查看原文、编辑、复制、重Roll、合并到上一章/下一章</li>
<li><strong>⬆️⬇️ 合并章节</strong>：合并相邻章节，自动更新世界书</li>
<li><strong>🗑️ 多选删除</strong>：批量选择并删除章节（已处理章节的警告提示）</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e74c3c;margin:0 0 10px;">🔍 查找与替换</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>查找高亮</strong>：在世界书预览中高亮显示关键词</li>
<li><strong>批量替换</strong>：一键替换所有匹配项（执行前自动保存世界书快照）</li>
<li>支持<strong>正则表达式</strong>和<strong>大小写敏感</strong>选项</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">🔗 别名合并</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>自动检测疑似同名条目，AI判断后合并</li>
<li>支持<strong>手动合并</strong>：跨分类勾选条目合并，自定义主名称和目标分类</li>
<li><strong>两两判断</strong>：AI对每一对分别判断，自动串联结果（A=B且B=C → A,B,C合并）</li>
<li>所有合并操作执行前<strong>自动保存世界书快照</strong>，可在历史记录中回退</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#f1c40f;margin:0 0 10px;">🔢 Token计数</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>每个条目/分类/全局显示Token数，支持<strong>阈值高亮</strong>快速发现截断条目</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#95a5a6;margin:0 0 10px;">📜 修改历史</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>自动记录变更，左右分栏查看，支持<strong>⏪回退到任意版本</strong>，数据存IndexedDB不丢失</li>
<li>批量替换、条目整理、别名合并等操作前<strong>自动保存快照</strong>，可随时回退</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e74c3c;margin:0 0 10px;">📥 导入合并世界书</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>支持SillyTavern格式和内部JSON格式，自动检测重复</li>
<li>重复处理：<strong>AI智能合并</strong> / 覆盖 / 保留 / 重命名 / 内容叠加</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#e67e22;margin:0 0 10px;">💾 导入导出</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>导出JSON / SillyTavern格式</strong>，支持分卷导出</li>
<li><strong>📤 导出变更</strong>：仅导出上次导出以来新增/修改的条目，方便增量更新</li>
<li><strong>导出/导入任务</strong>：保存完整进度，支持换设备继续</li>
<li><strong>导出/导入配置</strong>：保存提示词、分类、默认条目等所有设置</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#9b59b6;margin:0 0 10px;">🧠 AI优化与整理</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li><strong>🧠 AI优化世界书</strong>：让AI自动优化、整理世界书条目内容，提升整体质量</li>
<li><strong>📊 条目演变聚合</strong>：追踪条目在不同章节的变化历程，自动聚合历史信息</li>
<li><strong>🛠️ 整理条目</strong>：AI自动优化条目内容、去除重复信息、标准化格式（执行前自动保存快照）</li>
<li><strong>🐳 清除标签</strong>：一键清理AI输出的 thinking 、思考等标签内容</li>
<li><strong>🔍 自动去重检测</strong>：处理完成后自动扫描疑似重复条目并提示，建议使用别名合并处理</li>
</ul>
</div>

<div style="margin-bottom:16px;">
<h4 style="color:#3498db;margin:0 0 10px;">📊 模型状态显示</h4>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
<li>实时显示API连接状态：成功/失败/连接中</li>
<li>显示可用模型列表，支持快速选择切换</li>
<li>限流信息显示：当前限流设置、TPM余量等</li>
</ul>
</div>

<div style="padding:12px;background:rgba(52,152,219,0.15);border-radius:8px;">
<div style="font-weight:bold;color:#3498db;margin-bottom:8px;">💡 使用技巧</div>
<ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;font-size:12px;">
<li>长篇小说建议开启<strong>并行模式</strong>（独立模式最快，分批模式更连贯）</li>
<li>遇到乱码？<strong>🔍查找</strong>定位 → <strong>🎲批量重Roll</strong>修复</li>
<li>某条目不满意？点<strong>🎯</strong>单独重Roll，可添加提示词指导</li>
<li>AI输出thinking标签？<strong>🏷️清除标签</strong>一键清理</li>
<li>消息链角色不生效？切换<strong>自定义API模式</strong>（酒馆API会覆盖角色设置）</li>
<li>同一事物多个名字？<strong>🔗别名合并</strong>自动识别（处理完成后也会自动提示）</li>
<li>进度自动保存，无需手动操作；也可随时<strong>📤导出任务</strong>跨设备恢复</li>
<li>批量替换/整理/合并操作前<strong>自动保存快照</strong>，可在历史记录中回退</li>
<li>只需更新部分条目？<strong>📤导出变更</strong>仅导出上次导出后的新增/修改</li>
<li>想调整完整prompt？点<strong>👁️预览</strong>按钮可直接编辑各类prompt模板</li>
<li>导出时控制位置？点分类或条目旁的<strong>⚙️</strong>按钮配置</li>
<li>主UI只能通过右上角<strong>✕按钮</strong>关闭，防止误触退出</li>
<li>分卷模式下关注<strong>分卷指示器</strong>，了解当前卷和完成进度</li>
</ul>
</div>
`;

        const footerHtml = `<button class="ttw-btn ttw-btn-primary" id="ttw-close-help">我知道了</button>`;

        const helpModal = ModalFactory.create({
            id: 'ttw-help-modal',
            title: '❓ TXT转世界书帮助',
            body: bodyHtml,
            footer: footerHtml,
            maxWidth: '700px',
            maxHeight: '75vh',
        });

        helpModal.querySelector('#ttw-close-help').addEventListener('click', () => ModalFactory.close(helpModal));
    }

    return {
        showHelpModal,
    };
}

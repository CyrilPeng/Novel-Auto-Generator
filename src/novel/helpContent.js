const helpContent = {
    generate: {
        title: '📝 生成设置说明',
        content: `
<h4>📌 目标章节</h4>
<p>设置要自动生成的章节总数。</p>
<h4>📌 提示词</h4>
<p>每次自动发送给 AI 的消息内容。</p>
            `,
    },
    export: {
        title: '📤 导出设置说明',
        content: `
<h4>📌 楼层范围</h4>
<p>楼层从 <b>0</b> 开始计数。</p>
<h4>📌 原始 (chat.mes)</h4>
<ul>
    <li><b>✅ 勾选</b>：读取原始内容</li>
    <li><b>❌ 不勾选</b>：读取显示内容（经过正则处理）</li>
</ul>
            `,
    },
    extract: {
        title: '🏷️ 标签提取说明',
        content: `
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
    },
    advanced: {
        title: '⚙️ 高级设置说明',
        content: `
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
};

export function getHelpContent(topic) {
    return helpContent[topic] || { title: '帮助', content: '<p>暂无帮助内容</p>' };
}

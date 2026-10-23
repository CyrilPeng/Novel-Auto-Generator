/**
 * English (US) locale
 */
export default {
    // ========== Common ==========
    common: {
        confirm: 'Confirm',
        cancel: 'Cancel',
        ok: 'OK',
        save: 'Save',
        close: 'Close',
        reset: 'Reset',
        edit: 'Edit',
        delete: 'Delete',
        copy: 'Copy',
        refresh: 'Refresh',
        preview: 'Preview',
        export: 'Export',
        import: 'Import',
        start: 'Start',
        stop: 'Stop',
        pause: 'Pause',
        resume: 'Resume',
        retry: 'Retry',
        apply: 'Apply',
        clear: 'Clear',
        search: 'Search',
        replace: 'Replace',
        yes: 'Yes',
        no: 'No',
        unknown: 'Unknown',
        all: 'All',
        none: 'None',
        loading: 'Loading...',
        processing: 'Processing...',
        success: 'Success',
        failed: 'Failed',
        enabled: 'Enabled',
        disabled: 'Disabled',
    },

    // ========== Errors ==========
    errors: {
        userAborted: 'Operation aborted by user',
        unknown: 'Unknown error',
        operationCancelled: 'Operation cancelled',
        network: 'Network connection failed. Please check your network settings.',
        networkError: 'Network error',
        requestTimeout: 'Request timed out',
        tokenLimit: 'AI response exceeded token limit',

        http: {
            400: 'Bad request',
            401: 'Unauthorized. Please check API key.',
            403: 'Access denied',
            404: 'Resource not found',
            408: 'Request timeout',
            429: 'Rate limited. Please slow down.',
            500: 'Server internal error',
            502: 'Gateway error',
            503: 'Service unavailable. Please try again later.',
            504: 'Gateway timeout',
            529: 'Service overloaded. Please try again later.',
        },

        apiError: 'API error ({status})',
    },

    // ========== Modal ==========
    modal: {
        error: '❌ Error',
        confirmTitle: 'Confirm',
        promptTitle: 'Input',
        close: 'Close',
    },

    // ========== Status ==========
    status: {
        idle: 'Idle',
        running: 'Running',
        paused: 'Paused',
        stopped: 'Stopped',
        repairing: 'Repairing',
        rerolling: 'Rerolling',
    },

    // ========== Help Documentation ==========
    help: {
        title: '❓ TXT to Worldbook Help',
        sections: {
            basic: {
                title: '📌 Basic Features',
                items: [
                    'Convert TXT novels into SillyTavern Worldbook format',
                    'Auto-detect file encoding (UTF-8 / GBK / GB2312 / GB18030 / Big5)',
                    'Regex-based <strong>auto chapter detection</strong> and smart chunking (custom regex, presets, re-chunking)',
                    'Supports <strong>parallel/serial</strong> processing, parallel supports independent and batched modes with configurable concurrency',
                    'In batched parallel mode, <strong>syncs Worldbook summary between batches</strong> to reduce cross-batch duplicates',
                    '<strong>Incremental output</strong>: Only outputs changed entries, reducing redundancy',
                    '<strong>Volume mode</strong>: Auto-splits when context exceeds limits',
                    '<strong>Auto checkpoint resume</strong>: Saves every 60s, recovers after browser crash/refresh',
                    '<strong>ETA estimate</strong>: Real-time remaining time estimate based on recent chapter speed',
                ],
            },
            api: {
                title: '🔧 API Modes',
                items: [
                    "<strong>Tavern API</strong>: Use SillyTavern's currently connected AI (Note: message roles may be overridden by tavern post-processing, and preset JB content may be injected)",
                    '<strong>Custom API</strong>: Direct connection, message chain role settings work fully, unaffected by tavern',
                    'Supports <strong>Gemini / Anthropic / OpenAI compatible</strong> direct connection and proxy modes',
                    'Supports <strong>pulling model lists</strong> and <strong>quick connection tests</strong>',
                    '<strong>Smart retry</strong>: Auto-retry 429 rate limits, 500/502/503 server errors, network interruptions and other transient failures (including Tavern API)',
                ],
            },
            categories: {
                title: '🏷️ Custom Extraction Categories',
                items: [
                    'Built-in: <strong>Character, Location, Organization</strong>; Presets: <strong>Item, Gameplay, Chapter Plot, Character Inner Thoughts</strong>',
                    'Supports add/edit/delete custom categories, each can configure name, entry example, keyword example, content extraction guide',
                    'Each category can configure <strong>default export position/depth/order/auto-increment</strong>',
                ],
            },
            prompt: {
                title: '📝 Prompt System',
                items: [
                    '<strong>Worldbook entry prompt</strong> (core, with <code>{DYNAMIC_JSON_TEMPLATE}</code> placeholder)',
                    'Optional: <strong>Plot outline</strong>, <strong>Literary style</strong>, <strong>Suffix prompt</strong>',
                    '<strong>💬 Message chain</strong>: Send prompt in conversation completion preset format, each message can specify role (🔷 system / 🟢 user / 🟡 assistant)',
                    'Use <code>{PROMPT}</code> placeholder in message chain for actual assembled prompt content',
                    'Tavern API prefers <code>generateRaw</code> message array format (ST 1.13.2+), auto-compatible with older versions',
                    '<strong>👁️ Prompt template editing</strong>: Preview button supports tabbed view/edit of full prompt templates for worldbook, plot, style with placeholder guidance',
                    'All prompts support reset to default and preview, support <strong>export/import configuration</strong>',
                ],
            },
            defaultEntries: {
                title: '📚 Default Worldbook Entries',
                items: [
                    'Visually add/edit/delete default entries, each can configure category, name, keywords, content, position/depth/order',
                    '<strong>Auto-add</strong> to Worldbook during conversion, or <strong>apply immediately</strong> to current Worldbook',
                ],
            },
            chapters: {
                title: '📋 Chapter Management',
                items: [
                    'Click chapter to view original, edit, copy, re-roll, merge with previous/next chapter',
                    '<strong>⬆️⬇️ Merge chapters</strong>: Merge adjacent chapters, auto-update Worldbook',
                    '<strong>🗑️ Multi-select delete</strong>: Batch select and delete chapters (warning for processed chapters)',
                ],
            },
            search: {
                title: '🔍 Search and Replace',
                items: [
                    '<strong>Search highlight</strong>: Highlight keywords in Worldbook preview',
                    '<strong>Batch replace</strong>: Replace all matches with one click (auto-save Worldbook snapshot before execution)',
                    'Supports <strong>regular expression</strong> and <strong>case sensitive</strong> options',
                ],
            },
            alias: {
                title: '🔗 Alias Merging',
                items: [
                    'Auto-detect suspected same-name entries, merge after AI judgment',
                    'Supports <strong>manual merge</strong>: Check entries across categories and merge with custom primary name and target category',
                    '<strong>Pairwise judgment</strong>: AI judges each pair individually, auto-chains results (A=B and B=C → A,B,C merged)',
                    'All merge operations <strong>auto-save Worldbook snapshot</strong> before execution, can rollback in history',
                ],
            },
            tokens: {
                title: '🔢 Token Count',
                items: [
                    'Display Token count for each entry/category/globally, supports <strong>threshold highlight</strong> for quick discovery of truncated entries',
                ],
            },
            history: {
                title: '📜 Modification History',
                items: [
                    'Auto-record changes, side-by-side view, supports <strong>⏪ rollback to any version</strong>, data stored in IndexedDB without loss',
                    '<strong>Auto-save snapshot</strong> before batch replace, entry consolidation, alias merge operations, can rollback anytime',
                ],
            },
            importMerge: {
                title: '📥 Import Merge Worldbook',
                items: [
                    'Supports SillyTavern format and internal JSON format, auto-detect duplicates',
                    'Duplicate handling: <strong>AI smart merge</strong> / Overwrite / Keep / Rename / Content overlay',
                ],
            },
            exportImport: {
                title: '💾 Import/Export',
                items: [
                    '<strong>Export JSON / SillyTavern format</strong>, supports volume export',
                    '<strong>📤 Export changes</strong>: Only export entries added/modified since last export, convenient for incremental updates',
                    '<strong>Export/import tasks</strong>: Save full progress, supports resuming on different device',
                    '<strong>Export/import configuration</strong>: Save prompts, categories, default entries and all settings',
                ],
            },
            aiTools: {
                title: '🧠 AI Optimization and Cleanup',
                items: [
                    '<strong>🧠 AI optimize Worldbook</strong>: Let AI auto-optimize and consolidate Worldbook entry content, improving overall quality',
                    '<strong>📊 Entry evolution aggregation</strong>: Track entry changes across chapters, auto-aggregate historical info',
                    '<strong>🛠️ Consolidate entries</strong>: AI auto-optimizes entry content, removes duplicates, standardizes format (auto-save snapshot before execution)',
                    '<strong>🐳 Clean tags</strong>: One-click cleanup of AI thinking tags and other thought markers',
                    '<strong>🔍 Auto-dedup detection</strong>: Auto-scan for suspected duplicate entries after processing, suggests using alias merge',
                ],
            },
            modelStatus: {
                title: '📊 Model Status Display',
                items: [
                    'Real-time display of API connection status: success/failure/connecting',
                    'Shows available model list, supports quick selection switch',
                    'Rate limit info: current limits, TPM remaining, etc.',
                ],
            },
        },
        tips: {
            title: '💡 Tips',
            items: [
                'For long novels, recommend enabling <strong>parallel mode</strong> (independent is fastest, batched is more coherent)',
                'Garbled text? <strong>🔍 Search</strong> to locate → <strong>🎲 Batch re-roll</strong> to fix',
                'Unhappy with an entry? Click <strong>🎯</strong> to re-roll individually with custom prompt',
                'AI outputting thinking tags? <strong>🏷️ Clean tags</strong> one-click cleanup',
                'Message chain roles not working? Switch to <strong>custom API mode</strong> (Tavern API overrides role settings)',
                'Same thing with multiple names? <strong>🔗 Alias merge</strong> auto-recognizes (also auto-prompts after processing)',
                'Progress auto-saved, no manual action needed; also <strong>📤 export task</strong> anytime for cross-device restore',
                '<strong>Auto-save snapshot</strong> before batch replace/consolidate/merge operations, can rollback in history',
                'Need to update only some entries? <strong>📤 Export changes</strong> only exports new/modified since last export',
                'Want to adjust full prompt? Click <strong>👁️ Preview</strong> button to directly edit prompt templates',
                'Control export position? Click <strong>⚙️</strong> button next to category or entry to configure',
                'Main UI can only be closed via top-right <strong>✕ button</strong> to prevent accidental exit',
                'In volume mode, watch <strong>volume indicator</strong> for current volume and completion progress',
            ],
        },
        gotIt: 'Got it',
    },

    // ========== Renderer Labels ==========
    renderer: {
        entry: {
            keywords: '🔑 Keywords',
            content: '📝 Content',
            configTitle: 'Configure Position/Depth/Order',
            rerollTitle: 'Individually Reroll this entry',
            newMergedBadge: '✨ Newly Merged',
            builtinTag: '(built-in)',
            depthPrefix: 'D',
            orderPrefix: 'O',
        },
        category: {
            entriesLabel: 'entries',
        },
        summary: {
            total: '{categoryCount} categories, {totalEntries} entries | Total ~{totalTokens} tk',
            belowThreshold: ' | ⚠️ {count} entries below {threshold} tk',
        },
        status: {
            processing: '⏳',
            failed: '❌',
            processed: '✅',
            waiting: '⏳',
        },
    },

    // ========== Settings Panel ==========
    settings: {
        title: '📚 TXT to Worldbook',
        sections: {
            api: '🔌 API Configuration',
            prompt: '📝 Prompt Configuration',
            categories: '🏷️ Extraction Categories',
            defaultEntries: '📚 Default Worldbook Entries',
            upload: '📤 File Upload',
            queue: '📋 Chapter Queue',
            progress: '⏳ Processing Progress',
            result: '✨ Generated Result',
        },
    },

    // ========== Progress ==========
    progress: {
        eta: '~{min}m {sec}s',
        etaMinutes: '~{min} min',
        etaSeconds: '~{sec}s',
        parallel: '🚀 Parallel processing ({done}/{total})',
        parallelCompleted: '📦 Parallel processing complete, success: {success}/{total}',
        parallelStart: '🚀 Parallel processing {count} memory chunks (concurrency: {concurrency})',
    },

    // ========== Processing Log ==========
    processing: {
        chapterStart: '🔄 [Ch. {chapter}] Starting: {title}',
        chapterCompleted: '✅ [Ch. {chapter}] Completed',
        chapterError: '❌ [Ch. {chapter}] Error: {message}',
        chapterRetry: '🔄 [Ch. {chapter}] Retrying in {delay}s...',
        debugApiCall: '[Ch. {chapter}] Calling API...',
        debugParsing: '[Ch. {chapter}] Parsing AI response...',
        debugTokenLimit: '[Ch. {chapter}] Checking token limit...',
        debugPostProcess: '[Ch. {chapter}] Post-processing chapter index...',
    },

    // ========== Auto-continuation panel ==========
    novel: {
        title: '📚 Novel Auto Generator',
        start: '▶️ Start',
        pause: '⏸️ Pause',
        resume: '⏯️ Resume',
        stop: '⏹️ Stop',
        reset: '🔄 Reset',
        statusStopped: '⏹️ Stopped',
        statusRunning: '▶️ Running',
        statusPaused: '⏸️ Paused',
        generateSettings: '📝 Generation',
        exportSettings: '📤 Export',
        tagSettings: '🏷️ Tag Extraction',
        advancedSettings: '⚙️ Advanced',
        txtToWorldbook: '📚 TXT to Worldbook',
        targetChapters: 'Target chapters',
        prompt: 'Prompt',
        startFloor: 'Start floor',
        endFloor: 'End floor',
        includeUser: '👤 User messages',
        includeAI: '🤖 AI replies',
        useRaw: '📄 Raw (chat.mes)',
        exportAll: '📑 Export all',
        exportTxt: '📄 TXT',
        exportJson: '📦 JSON',
        floors: '{count} messages',
        autoSave: 'Auto-save interval',
        maxRetries: 'Max retries',
        minLength: 'Minimum chapter length',
        pauseNotice: 'Will pause after the current chapter',
        resumeNotice: 'Resumed',
        stopNotice: 'Auto-continuation stopped; a generation already sent may still finish',
        resetNotice: 'Progress reset',
        resetBlocked: 'Stop the task first',
        noContent: 'No content',
        exported: 'Exported {count} items',
        exportedJson: 'JSON exported',
        exportTime: 'Exported at',
        exportChapters: 'Chapters',
        exportChars: 'Characters',
        exportUser: 'User',
        exportAi: 'AI',
        tagMode: 'Extraction mode',
        tagAll: 'All content',
        tagOnly: 'Only selected tags',
        tagNames: 'Tag names',
        tagHint: '(space or comma separated)',
        separator: 'Separator',
        separatorBlank: 'Blank line',
        separatorNewline: 'New line',
        separatorNone: 'None',
        excludeTags: 'Remove tags',
        excludeHint: '(optional, space or comma separated)',
        preview: '📋 Preview',
        clickRefresh: 'Click refresh',
        sendPhase: 'Send phase',
        sendDesc: 'Wait for plot or other extensions to finish after sending',
        enableToast: '💬 Enable popup detection',
        waitTimeout: 'Wait timeout (ms)',
        extraWait: 'Extra wait (ms)',
        replyPhase: 'Reply phase',
        replyDesc: 'Wait for summary and other extensions after the reply',
        waitAfterReply: 'Wait after reply (ms)',
        stabilityInterval: 'Stability check interval (ms)',
        stabilityCount: 'Stability checks',
        controlPhase: 'Generation control',
        controlDesc: 'Parameters that control automatic generation',
        debugHint: 'Console debug',
        help: {
            generateTitle: '📝 Generation settings',
            generateContent: `
<h4>📌 Target chapters</h4>
<p>Total number of chapters to generate.</p>
<h4>📌 Prompt</h4>
<p>The message sent to the AI for each chapter.</p>
            `,
            exportTitle: '📤 Export settings',
            exportContent: `
<h4>📌 Floor range</h4>
<p>Floors start at <b>0</b>.</p>
<h4>📌 Raw (chat.mes)</h4>
<ul>
    <li><b>✅ Checked</b>: read the raw message</li>
    <li><b>❌ Unchecked</b>: read the displayed text after regex processing</li>
</ul>
            `,
            extractTitle: '🏷️ Tag extraction',
            extractContent: `
<h4>📌 What is tag extraction?</h4>
<p>Keep only the text inside selected XML tags from the raw AI reply.</p>
<h4>📌 When to use it</h4>
<p>When regex formatting leaves the raw reply with tags such as:</p>
<pre>&lt;thinking&gt;reasoning...&lt;/thinking&gt;
&lt;content&gt;story text...&lt;/content&gt;</pre>
<p>Tag extraction can export only the text inside &lt;content&gt;.</p>
<h4>📌 How to use it</h4>
<ol>
    <li>✅ Enable raw (chat.mes)</li>
    <li>For a whitelist, select tag mode and enter the tags to keep</li>
    <li>To remove noise, keep all-content mode and enter the tags to remove</li>
    <li>Whitelist extraction and blacklist removal can be combined</li>
</ol>
<h4>📌 Multiple tags</h4>
<p>Separate tags with spaces or commas: <code>content detail body</code></p>
<h4>📌 Blacklist removal</h4>
<p>Removing a tag deletes the tag and its content. Raw mode is recommended; it can be combined with whitelist extraction.</p>
<pre>&lt;thinking&gt;reasoning...&lt;/thinking&gt;
&lt;content&gt;story text&lt;/content&gt;</pre>
<p>After removing <code>thinking</code>, previews and exports keep the remaining text.</p>
<h4>📌 Debug</h4>
<p>Run <code>nagDebug()</code> in the browser console.</p>
            `,
            advancedTitle: '⚙️ Advanced settings',
            advancedContent: `
<h4>📤 Send phase</h4>
<p>Other extensions, such as plot advancement, may process the message after it is sent.</p>
<ul>
    <li><b>Popup detection</b>: wait for popups to disappear before continuing</li>
    <li><b>Wait timeout</b>: maximum time to wait for popups</li>
    <li><b>Extra wait</b>: additional delay after popups disappear</li>
</ul>

<h4>📥 Reply phase</h4>
<p>Summary or other extensions may process the reply after generation completes.</p>
<ul>
    <li><b>Wait after reply</b>: delay after the reply becomes stable</li>
    <li><b>Stability interval</b>: how often to check for changes</li>
    <li><b>Stability checks</b>: consecutive unchanged checks required</li>
    <li><b>Popup detection</b>: wait for summary popups to finish</li>
</ul>

<h4>🔧 Generation control</h4>
<ul>
    <li><b>Auto-save interval</b>: export a backup every N chapters</li>
    <li><b>Max retries</b>: retries for a failed chapter</li>
    <li><b>Minimum length</b>: shorter replies are treated as failures</li>
</ul>
            `,
        },
    },
};

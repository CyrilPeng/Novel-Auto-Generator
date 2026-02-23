/**
 * 帮助弹窗组件
 * 显示详细的使用帮助文档
 */
import { Modal } from '../components/Modal.js';

export class HelpModal {
    constructor(options = {}) {
        this.onClose = options.onClose || (() => {});
        this.modal = null;
    }

    /**
     * 打开帮助弹窗
     */
    open() {
        // 如果已存在弹窗，先关闭
        if (this.modal) {
            this.close();
        }

        // 创建弹窗和内容
        this.createModal();
        const content = this.createContent();

        // 打开弹窗
        this.modal.open(content);
    }

    /**
     * 关闭帮助弹窗
     */
    close() {
        if (this.modal) {
            this.modal.destroy();
            this.modal = null;
        }
        this.onClose();
    }

    /**
     * 销毁帮助弹窗，清理所有资源
     */
    destroy() {
        this.close();
        this.onClose = null;
    }

    /**
     * 创建帮助内容 HTML
     */
    createContent() {
        return `
            <div class="ww-help-content" style="max-height:70vh;overflow-y:auto;font-size:13px;line-height:1.6;">
                <div style="padding:12px;background:linear-gradient(135deg, rgba(230,126,34,0.15), rgba(211,84,0,0.15));border-radius:8px;margin-bottom:16px;border-left:4px solid #e67e22;">
                    <div style="font-weight:bold;color:#e67e22;margin-bottom:8px;font-size:14px;">🚀 快速开始（5 分钟上手）</div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                        <div style="text-align:center;"><div style="font-size:24px;">1️⃣</div><div style="font-size:11px;color:#ccc;">点击按钮</div></div>
                        <div style="text-align:center;"><div style="font-size:24px;">2️⃣</div><div style="font-size:11px;color:#ccc;">上传文件</div></div>
                        <div style="text-align:center;"><div style="font-size:24px;">3️⃣</div><div style="font-size:11px;color:#ccc;">开始转换</div></div>
                        <div style="text-align:center;"><div style="font-size:24px;">4️⃣</div><div style="font-size:11px;color:#ccc;">导出使用</div></div>
                    </div>
                </div>
                
                <div style="margin-bottom:16px;">
                    <h4 style="color:#e67e22;margin:0 0 10px;font-size:14px;">📌 基本功能</h4>
                    <div style="background:rgba(230,126,34,0.05);padding:12px;border-radius:6px;">
                        <ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
                            <li><strong>文件转换</strong>：TXT/EPUB 转世界书</li>
                            <li><strong>编码检测</strong>：自动检测 UTF-8/GBK 等</li>
                            <li><strong>智能分块</strong>：章回自动检测</li>
                            <li><strong>并行处理</strong>：支持并发处理</li>
                            <li><strong>断点续传</strong>：进度自动保存</li>
                        </ul>
                    </div>
                </div>

                <div style="margin-bottom:16px;">
                    <h4 style="color:#3498db;margin:0 0 10px;font-size:14px;">🔧 API 模式</h4>
                    <div style="background:rgba(52,152,219,0.05);padding:12px;border-radius:6px;">
                        <div style="margin-bottom:8px;"><strong style="color:#3498db;">🏆 酒馆 API</strong><div style="font-size:12px;color:#ccc;margin-top:4px;">使用 SillyTavern 当前 AI，无需配置</div></div>
                        <div style="margin-bottom:8px;"><strong style="color:#9b59b6;">💎 Gemini API</strong><div style="font-size:12px;color:#ccc;margin-top:4px;">直连 Google，速度快成本低</div></div>
                        <div style="margin-bottom:8px;"><strong style="color:#2ecc71;">🐬 DeepSeek API</strong><div style="font-size:12px;color:#ccc;margin-top:4px;">中文优化，价格实惠</div></div>
                        <div><strong style="color:#f39c12;">🔌 OpenAI 兼容</strong><div style="font-size:12px;color:#ccc;margin-top:4px;">支持本地部署，数据隐私</div></div>
                    </div>
                </div>

                <div style="margin-bottom:16px;">
                    <h4 style="color:#2ecc71;margin:0 0 10px;font-size:14px;">🧹 世界书工具</h4>
                    <div style="background:rgba(46,204,113,0.05);padding:12px;border-radius:6px;">
                        <ul style="margin:0;padding-left:20px;line-height:1.8;color:#ccc;">
                            <li><strong>🔍 查找替换</strong>：批量处理内容</li>
                            <li><strong>🏷️ 清除标签</strong>：清理 thinking 等标签</li>
                            <li><strong>🧹 整理条目</strong>：AI 优化条目内容</li>
                            <li><strong>🔗 别名合并</strong>：识别同义词合并</li>
                        </ul>
                    </div>
                </div>

                <div style="padding:12px;background:rgba(231,76,60,0.1);border-radius:8px;border-left:4px solid #e74c3c;">
                    <div style="font-weight:bold;color:#e74c3c;margin-bottom:8px;font-size:14px;">❓ 常见问题</div>
                    <div style="font-size:12px;color:#ccc;line-height:1.8;">
                        <div style="margin-bottom:6px;"><strong>Q: 处理速度慢？</strong><br>A: 开启并行模式，选择更快的模型</div>
                        <div style="margin-bottom:6px;"><strong>Q: Token 超限？</strong><br>A: 减小每块字数，开启分卷模式</div>
                        <div><strong>Q: 进度丢失？</strong><br>A: 进度自动保存，可导出任务备份</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 创建弹窗
     */
    createModal() {
        // 绑定 this 上下文
        const handleButtonClick = (action, event, modalInstance) => {
            if (action === 'close') {
                this.close();
            }
        };

        this.modal = new Modal({
            title: '❓ TXT 转世界书 帮助',
            width: '800px',
            maxWidth: '95%',
            closable: true,
            maskClosable: true,
            buttons: [
                { text: '我知道了', type: 'primary', action: 'close' }
            ],
            onButtonClick: handleButtonClick
        });
    }
}

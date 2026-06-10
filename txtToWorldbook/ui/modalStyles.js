export function ensureModalStyles() {
    if (document.getElementById('ttw-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'ttw-styles';
    styles.textContent = `
            .ttw-modal-container{position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;overflow:hidden;}
            .ttw-modal{background:var(--SmartThemeBlurTintColor,#1e1e2e);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:12px;width:100%;max-width:750px;max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);min-height:0;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:hidden;}
            .ttw-modal-header{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--SmartThemeBorderColor,#444);background:rgba(0,0,0,0.2);}
            .ttw-modal-title{font-weight:bold;font-size:15px;color:#e67e22;}
            .ttw-header-actions{display:flex;align-items:center;gap:12px;}
            .ttw-help-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(231,76,60,0.2);color:#e74c3c;font-size:14px;cursor:pointer;transition:all 0.2s;border:1px solid rgba(231,76,60,0.4);}
            .ttw-help-btn:hover{background:rgba(231,76,60,0.4);transform:scale(1.1);}
            .ttw-modal-close{background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;width:36px;height:36px;border-radius:6px;cursor:pointer;transition:all 0.2s;}
            .ttw-modal-close:hover{background:rgba(255,100,100,0.3);color:#ff6b6b;}
            .ttw-modal-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
            .ttw-modal-footer{flex:0 0 auto;padding:16px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom));border-top:1px solid var(--SmartThemeBorderColor,#444);background:rgba(0,0,0,0.88);display:flex;justify-content:flex-end;gap:10px;position:relative;z-index:2;}
            .ttw-section{background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:12px;overflow:hidden;}
            .ttw-section-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(0,0,0,0.3);cursor:pointer;font-weight:bold;font-size:14px;}
            .ttw-section-content{padding:16px;}
            .ttw-collapse-icon{font-size:10px;transition:transform 0.2s;}
            .ttw-section.collapsed .ttw-collapse-icon{transform:rotate(-90deg);}
            .ttw-section.collapsed .ttw-section-content{display:none;}
            .ttw-input,.ttw-select,.ttw-textarea,.ttw-textarea-small,.ttw-input-small{background:rgba(0,0,0,0.3);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;color:#fff;font-size:13px;box-sizing:border-box;}
            .ttw-input{width:100%;padding:10px 12px;}
            .ttw-input-small{width:60px;padding:6px 8px;text-align:center;}
            .ttw-select{width:100%;padding:8px 10px;}
            .ttw-textarea{width:100%;min-height:250px;padding:12px;line-height:1.6;resize:vertical;font-family:inherit;}
            .ttw-textarea-small{width:100%;min-height:80px;padding:10px;font-family:monospace;font-size:12px;line-height:1.5;resize:vertical;}
            .ttw-input:focus,.ttw-select:focus,.ttw-textarea:focus,.ttw-textarea-small:focus{outline:none;border-color:#e67e22;}
            .ttw-label{display:block;margin-bottom:6px;font-size:12px;opacity:0.9;}
            .ttw-setting-hint{font-size:11px;color:#888;margin-top:4px;}
            .ttw-setting-card{margin-bottom:16px;padding:12px;border-radius:8px;}
            .ttw-setting-card-green{background:rgba(39,174,96,0.1);border:1px solid rgba(39,174,96,0.3);}
            .ttw-setting-card-blue{background:rgba(52,152,219,0.15);border:1px solid rgba(52,152,219,0.3);}
            .ttw-checkbox-label{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;}
            .ttw-checkbox-label input[type="checkbox"]{width:18px;height:18px;accent-color:#e67e22;flex-shrink:0;}
            .ttw-checkbox-with-hint{padding:8px 12px;background:rgba(0,0,0,0.15);border-radius:6px;}
            .ttw-checkbox-purple{background:rgba(155,89,182,0.15);border:1px solid rgba(155,89,182,0.3);}
            .ttw-volume-indicator{display:none;margin-top:12px;padding:8px 12px;background:rgba(155,89,182,0.2);border-radius:6px;font-size:12px;color:#bb86fc;}
            .ttw-prompt-config{margin-top:16px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:8px;overflow:hidden;}
            .ttw-prompt-config-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(230,126,34,0.15);border-bottom:1px solid var(--SmartThemeBorderColor,#444);font-weight:500;flex-wrap:wrap;gap:8px;}
            .ttw-prompt-section{border-bottom:1px solid var(--SmartThemeBorderColor,#333);}
            .ttw-prompt-section:last-child{border-bottom:none;}
            .ttw-prompt-header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;font-size:13px;transition:background 0.2s;}
            .ttw-prompt-header:hover{filter:brightness(1.1);}
            .ttw-prompt-header-blue{background:rgba(52,152,219,0.1);}
            .ttw-prompt-header-purple{background:rgba(155,89,182,0.1);}
            .ttw-prompt-header-green{background:rgba(46,204,113,0.1);}
            .ttw-prompt-content{display:none;padding:12px 14px;background:rgba(0,0,0,0.15);}
            .ttw-badge{font-size:10px;padding:2px 6px;border-radius:10px;font-weight:500;}
            .ttw-badge-blue{background:rgba(52,152,219,0.3);color:#5dade2;}
            .ttw-badge-gray{background:rgba(149,165,166,0.3);color:#bdc3c7;}
            .ttw-upload-area{border:2px dashed var(--SmartThemeBorderColor,#555);border-radius:8px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;}
            .ttw-upload-area:hover{border-color:#e67e22;background:rgba(230,126,34,0.1);}
            .ttw-file-info{display:none;align-items:center;gap:12px;padding:12px;background:rgba(0,0,0,0.3);border-radius:6px;margin-top:12px;}
            .ttw-memory-queue{max-height:200px;overflow-y:auto;}
            .ttw-memory-item{padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:4px;margin-bottom:6px;font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background 0.2s;}
            .ttw-memory-item:hover{background:rgba(0,0,0,0.4);}
            .ttw-memory-item.multi-select-mode{cursor:default;}
            .ttw-memory-item.selected-for-delete{background:rgba(231,76,60,0.3);border:1px solid rgba(231,76,60,0.5);}
            .ttw-progress-bar{width:100%;height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;margin-bottom:12px;}
            .ttw-progress-fill{height:100%;background:linear-gradient(90deg,#e67e22,#f39c12);border-radius:4px;transition:width 0.3s;width:0%;}
            .ttw-progress-text{font-size:13px;text-align:center;margin-bottom:12px;}
            .ttw-progress-controls{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
            .ttw-stream-container{display:none;margin-top:12px;border:1px solid var(--SmartThemeBorderColor,#444);border-radius:6px;overflow:hidden;}
            .ttw-stream-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.3);font-size:12px;}
            .ttw-stream-content{max-height:200px;overflow-y:auto;padding:12px;background:rgba(0,0,0,0.2);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:0;font-family:monospace;}
            .ttw-result-preview{max-height:300px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:6px;padding:12px;margin-bottom:12px;font-size:12px;}
            .ttw-result-actions{display:flex;flex-wrap:wrap;gap:10px;}
            .ttw-btn{padding:10px 16px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;font-size:13px;cursor:pointer;transition:all 0.2s;}
            .ttw-btn:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn:disabled{opacity:0.5;cursor:not-allowed;}
            .ttw-btn-primary{background:linear-gradient(135deg,#e67e22,#d35400);border-color:#e67e22;}
            .ttw-btn-primary:hover{background:linear-gradient(135deg,#f39c12,#e67e22);}
            #ttw-start-btn{min-height:44px;min-width:160px;font-weight:600;}
            .ttw-btn-secondary{background:rgba(108,117,125,0.5);}
            .ttw-btn-warning{background:rgba(255,107,53,0.5);border-color:#ff6b35;}
            .ttw-btn-small{padding:6px 12px;font-size:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;transition:all 0.2s;}
            .ttw-btn-small:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn-tiny{padding:3px 6px;font-size:11px;border:none;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;border-radius:3px;}
            .ttw-btn-tiny:hover{background:rgba(255,255,255,0.2);}
            .ttw-btn-tiny:disabled{opacity:0.3;cursor:not-allowed;}
            .ttw-categories-list{max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;}
            .ttw-category-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:4px;}
            .ttw-category-item input[type="checkbox"]{width:16px;height:16px;accent-color:#9b59b6;}
            .ttw-category-name{flex:1;font-size:12px;}
            .ttw-category-actions{display:flex;gap:4px;}
            .ttw-default-entries-list{max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;}
            .ttw-default-entry-item{padding:8px 10px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:6px;border-left:3px solid #27ae60;}
            .ttw-default-entry-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
            .ttw-default-entry-title{font-size:12px;font-weight:bold;color:#27ae60;}
            .ttw-default-entry-actions{display:flex;gap:4px;}
            .ttw-default-entry-info{font-size:11px;color:#888;}
            .ttw-form-group{margin-bottom:12px;}
            .ttw-form-group>label{display:block;margin-bottom:6px;font-size:12px;color:#ccc;}
            .ttw-merge-option{display:flex;align-items:center;gap:8px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;cursor:pointer;}
            .ttw-merge-option input{width:18px;height:18px;}
            .ttw-roll-history-container{display:flex;gap:10px;height:400px;}
            .ttw-roll-history-left{width:100px;min-width:100px;max-width:100px;display:flex;flex-direction:column;gap:8px;overflow:hidden;}
            .ttw-roll-history-right{flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;}
            .ttw-roll-reroll-btn{width:100%;padding:8px 4px !important;font-size:11px !important;}
            .ttw-roll-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
            .ttw-roll-item{padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;cursor:pointer;border-left:2px solid #9b59b6;transition:all 0.2s;}
            .ttw-roll-item:hover,.ttw-roll-item.active{background:rgba(0,0,0,0.4);}
            .ttw-roll-item.selected{border-left-color:#27ae60;background:rgba(39,174,96,0.15);}
            .ttw-entry-merged-highlight{box-shadow:0 0 0 2px rgba(241,196,15,0.7);animation:ttwMergePulse 1.2s ease-in-out infinite;}
            @keyframes ttwMergePulse{
                0%{box-shadow:0 0 0 2px rgba(241,196,15,0.7);}
                50%{box-shadow:0 0 0 4px rgba(241,196,15,0.3);}
                100%{box-shadow:0 0 0 2px rgba(241,196,15,0.7);}
            }
            .ttw-roll-item-header{display:flex;justify-content:space-between;align-items:center;gap:4px;}
            .ttw-roll-item-title{font-size:11px;font-weight:bold;color:#e67e22;white-space:nowrap;}
            .ttw-roll-item-time{font-size:9px;color:#888;white-space:nowrap;}
            .ttw-roll-item-info{font-size:9px;color:#aaa;margin-top:2px;}
            .ttw-roll-detail-header{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #444;}
            .ttw-roll-detail-header h4{color:#e67e22;margin:0 0 6px 0;font-size:14px;}
            .ttw-roll-detail-time{font-size:11px;color:#888;margin-bottom:8px;}
            .ttw-roll-detail-content{white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;max-height:280px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;}
            .ttw-light-toggle{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;transition:all 0.2s;border:none;margin-left:8px;}
            .ttw-light-toggle.blue{background:rgba(52,152,219,0.3);color:#3498db;}
            .ttw-light-toggle.blue:hover{background:rgba(52,152,219,0.5);}
            .ttw-light-toggle.green{background:rgba(39,174,96,0.3);color:#27ae60;}
            .ttw-light-toggle.green:hover{background:rgba(39,174,96,0.5);}
            .ttw-config-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;transition:all 0.2s;border:none;margin-left:4px;background:rgba(155,89,182,0.3);color:#9b59b6;}
            .ttw-config-btn:hover{background:rgba(155,89,182,0.5);}
            .ttw-history-container{display:flex;gap:10px;height:400px;}
            .ttw-history-left{width:100px;min-width:100px;max-width:100px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
            .ttw-history-right{flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;}
            .ttw-history-item{padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;cursor:pointer;border-left:2px solid #9b59b6;transition:all 0.2s;}
            .ttw-history-item:hover,.ttw-history-item.active{background:rgba(0,0,0,0.4);}
            .ttw-history-item-title{font-size:10px;font-weight:bold;color:#e67e22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .ttw-history-item-time{font-size:9px;color:#888;}
            .ttw-history-item-info{font-size:9px;color:#aaa;}
            .ttw-model-actions{display:flex;gap:10px;align-items:center;margin-top:12px;padding:10px;background:rgba(52,152,219,0.1);border:1px solid rgba(52,152,219,0.3);border-radius:6px;flex-wrap:nowrap;}
            .ttw-model-actions>button{flex:0 0 auto;white-space:nowrap;}
            .ttw-model-status{font-size:12px;flex:1 1 auto;min-width:0;width:100%;white-space:pre-wrap;word-wrap:break-word;word-break:break-all;line-height:1.5;}
            .ttw-model-status.success{color:#27ae60;}
            .ttw-model-status.error{color:#e74c3c;}
            .ttw-model-status.loading{color:#f39c12;}
            .ttw-setting-item{margin-bottom:12px;}
            .ttw-setting-item>label{display:block;margin-bottom:6px;font-size:12px;opacity:0.9;}
            .ttw-setting-item input,.ttw-setting-item select{width:100%;padding:10px 12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;background:rgba(0,0,0,0.3);color:#fff;font-size:13px;box-sizing:border-box;}
            .ttw-setting-item select option{background:#2a2a2a;}
            .ttw-placeholder-hint code{user-select:all;}
            .ttw-consolidate-category-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(0,0,0,0.15);border-radius:6px;margin-bottom:6px;cursor:pointer;}
            .ttw-consolidate-category-item input{width:18px;height:18px;accent-color:#3498db;}
            @media (max-width: 768px) {
                .ttw-modal-container{align-items:stretch;padding:8px;}
                .ttw-modal{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);border-radius:10px;}
                .ttw-modal-header{padding:10px 12px;}
                .ttw-modal-body{padding:12px;}
                #txt-to-worldbook-modal .ttw-modal-footer{padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));}
                #ttw-start-btn{width:100%;min-height:46px;}
                .ttw-roll-history-container,.ttw-history-container{flex-direction:column;height:auto;}
                .ttw-roll-history-left,.ttw-history-left{width:100%;max-width:100%;flex-direction:row;flex-wrap:wrap;height:auto;max-height:120px;}
                .ttw-roll-reroll-btn{width:auto;flex-shrink:0;}
                .ttw-roll-list{flex-direction:row;flex-wrap:wrap;gap:4px;}
                .ttw-roll-item,.ttw-history-item{flex:0 0 auto;padding:4px 8px;}
                .ttw-roll-history-right,.ttw-history-right{min-height:250px;}
                .ttw-processed-results-container{flex-direction:column !important;height:auto !important;}
                .ttw-processed-results-left{width:100% !important;max-width:100% !important;max-height:150px !important;flex-direction:row !important;flex-wrap:wrap !important;}
            }
            @media (max-height: 640px) {
                .ttw-modal-container{align-items:stretch;padding:8px;}
                .ttw-modal{max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);}
                .ttw-modal-header{padding-top:10px;padding-bottom:10px;}
                .ttw-modal-body{padding-top:12px;padding-bottom:12px;}
                #txt-to-worldbook-modal .ttw-modal-footer{padding-top:10px;padding-bottom:max(10px,env(safe-area-inset-bottom));}
            }
        `;
    document.head.appendChild(styles);
}

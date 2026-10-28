const STYLE_ID = 'dsh-project-task-mode-styles'
const CSS = `
.ptm-board{
--ptm-bg:var(--dsw-alias-bg-base,#fff);
--ptm-surface:var(--dsw-alias-bg-layer-1,#fff);
--ptm-surface-2:var(--dsw-alias-bg-layer-2,#fff);
--ptm-input:var(--dsw-specific-input-major,#fff);
--ptm-text:var(--dsw-alias-label-primary,#0f1115);
--ptm-text-2:var(--dsw-alias-label-secondary,#61666b);
--ptm-text-3:var(--dsw-alias-label-tertiary,#81858c);
--ptm-border:var(--dsw-alias-border-l2,rgba(0,0,0,.1));
--ptm-border-strong:var(--dsw-alias-border-l3,rgba(0,0,0,.12));
--ptm-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
--ptm-accent:var(--dsw-alias-state-business-primary,#4176e6);
--ptm-link:var(--dsw-alias-link,#4176e6);
--ptm-primary-bg:var(--dsw-alias-button-primary-fill,#0f1115);
--ptm-primary-fg:var(--dsw-alias-label-primary-foreground,#fff);
--ptm-primary-hover:var(--dsw-alias-button-primary-hover,#43454a);
--ptm-danger:var(--dsw-alias-state-error-primary,#ec1313);
--ptm-warn:var(--dsw-alias-state-warn-primary,#f59e0b);
--ptm-success:var(--dsw-alias-state-success-primary,#22c55e);
--ptm-danger-text:color-mix(in srgb,var(--ptm-danger) 72%,var(--ptm-text));
--ptm-warn-text:color-mix(in srgb,var(--ptm-warn) 62%,var(--ptm-text));
--ptm-success-text:color-mix(in srgb,var(--ptm-success) 62%,var(--ptm-text));
--ptm-radius-xs:var(--dsw-radius-xs,4px);
--ptm-radius-sm:var(--dsw-radius-sm,8px);
--ptm-radius-md:var(--dsw-radius-md,12px);
--ptm-radius-lg:var(--dsw-radius-lg,16px);
--ptm-radius-xl:var(--dsw-radius-xl,20px);
--ptm-font:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif);
--ptm-font-mono:var(--ds-font-family-code,"SF Mono","JetBrains Mono","Fira Code",Consolas,Menlo,monospace);
--ptm-shadow-card:0 1px 2px rgba(15,17,21,.04);
--ptm-shadow-hover:0 6px 18px rgba(15,17,21,.08),0 1px 2px rgba(15,17,21,.05);
--ptm-shadow-pop:0 24px 60px rgba(15,17,21,.18),0 2px 8px rgba(15,17,21,.06);
height:100%;display:flex;flex-direction:column;background:var(--ptm-bg);color:var(--ptm-text);font-family:var(--ptm-font);font-size:14px;line-height:1.45;overflow:hidden;-webkit-font-smoothing:antialiased}
body[data-ds-dark-theme] .ptm-board{--ptm-shadow-card:0 1px 2px rgba(0,0,0,.24);--ptm-shadow-hover:0 8px 22px rgba(0,0,0,.45),0 1px 2px rgba(0,0,0,.3);--ptm-shadow-pop:0 24px 64px rgba(0,0,0,.6),0 2px 8px rgba(0,0,0,.3)}
.ptm-board *{box-sizing:border-box}
:where(.ptm-board) :where(button,input,select,textarea){font:inherit;color:inherit}
.ptm-board button{cursor:pointer}
.ptm-board :focus-visible{outline:2px solid var(--ptm-accent);outline-offset:2px}
.ptm-board input:focus-visible,.ptm-board select:focus-visible,.ptm-board textarea:focus-visible{outline:none}

.ptm-pagehead{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:26px 32px 0;flex-wrap:wrap}
.ptm-pagehead-main{min-width:0}
.ptm-titleline{display:flex;align-items:center;gap:9px}
.ptm-titleline h1{font-size:20px;line-height:28px;font-weight:500;margin:0;letter-spacing:-.01em}
.ptm-pageicon{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--ptm-accent) 11%,transparent);color:var(--ptm-accent);flex:none}
.ptm-contextline{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;min-width:0}
.ptm-projectpick{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 6px;border-radius:7px;color:var(--ptm-text-2);cursor:pointer;min-width:0}
.ptm-projectpick:hover{background:var(--ptm-hover)}
.ptm-projectpick select{appearance:none;border:0;background:transparent;color:var(--ptm-text);font-size:14px;font-weight:500;padding:0 2px;outline:none;cursor:pointer;max-width:300px;text-overflow:ellipsis}
.ptm-projectpick svg:last-child{color:var(--ptm-text-3);flex:none}
.ptm-path{font-size:12.5px;color:var(--ptm-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ptm-page-actions{display:flex;align-items:center;gap:10px;padding-top:2px;margin-left:auto}
.ptm-sync{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ptm-text-3);margin-right:2px;white-space:nowrap}
.ptm-sync-dot{width:6px;height:6px;border-radius:999px;background:var(--ptm-success);box-shadow:0 0 0 3px color-mix(in srgb,var(--ptm-success) 14%,transparent)}
.ptm-sync.is-syncing .ptm-sync-dot{background:var(--ptm-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ptm-accent) 14%,transparent);animation:ptm-pulse 1.1s ease-in-out infinite}

.ptm-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--ptm-border);background:var(--ptm-surface);color:var(--ptm-text);font-size:13px;font-weight:500;transition:background .15s,border-color .15s,color .15s;white-space:nowrap}
.ptm-button:hover:not(:disabled){background:var(--ptm-hover);border-color:var(--ptm-border-strong)}
.ptm-button:disabled{opacity:.45;cursor:not-allowed}
.ptm-primary{background:var(--ptm-primary-bg);border-color:transparent;color:var(--ptm-primary-fg)}
.ptm-primary:hover:not(:disabled){background:var(--ptm-primary-hover);border-color:transparent}
.ptm-primary:disabled{opacity:.5}
.ptm-icon-button{display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ptm-text-2);flex:none;transition:background .15s,color .15s}
.ptm-icon-button:hover:not(:disabled){background:var(--ptm-hover);color:var(--ptm-text)}
.ptm-textbutton{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--ptm-text-2);font-size:12.5px;padding:4px 6px;border-radius:6px;font-weight:500}
.ptm-textbutton:hover:not(:disabled){background:var(--ptm-hover);color:var(--ptm-text)}
.ptm-textbutton:disabled{opacity:.5;cursor:not-allowed}

.ptm-overview{display:flex;align-items:center;gap:16px;padding:16px 32px 0;flex-wrap:wrap}
.ptm-overview-stats{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ptm-stat{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:7px;background:color-mix(in srgb,var(--ptm-text) 3%,transparent);font-size:12px;color:var(--ptm-text-2);white-space:nowrap}
.ptm-stat-label{color:var(--ptm-text-2)}
.ptm-stat-value{font-size:13px;font-weight:600;color:var(--ptm-text);font-variant-numeric:tabular-nums}
.ptm-overview-total{margin-left:auto;font-size:12px;color:var(--ptm-text-3);white-space:nowrap}

.ptm-dot{width:7px;height:7px;border-radius:999px;background:var(--ptm-text-3);flex:none;display:inline-block}
.ptm-dot-backlog,.ptm-dot-cancelled{background:var(--ptm-text-3);opacity:.65}
.ptm-dot-todo{background:var(--dsw-alias-state-idle-primary,var(--ptm-text-3))}
.ptm-dot-in_progress{background:var(--ptm-accent)}
.ptm-dot-in_review,.ptm-dot-paused{background:var(--ptm-warn)}
.ptm-dot-done{background:var(--ptm-success)}
.ptm-dot-blocked{background:var(--ptm-danger)}

.ptm-toolbar{display:flex;align-items:center;gap:8px;padding:14px 32px 12px;flex-wrap:wrap}
.ptm-search{display:flex;align-items:center;gap:7px;height:32px;padding:0 9px 0 10px;border:1px solid var(--ptm-border);border-radius:8px;background:var(--ptm-input);width:min(420px,42vw);min-width:230px;color:var(--ptm-text-3);transition:border-color .15s,box-shadow .15s}
.ptm-search:focus-within{border-color:var(--ptm-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ptm-accent) 12%,transparent)}
.ptm-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--ptm-text);font-size:13px;height:100%;padding:0;outline:none}
.ptm-search input::placeholder{color:var(--ptm-text-3)}
.ptm-search-clear{display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--ptm-text-3);flex:none}
.ptm-search-clear:hover{background:var(--ptm-hover);color:var(--ptm-text)}
.ptm-toolbar-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.ptm-select{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 7px 0 9px;border:1px solid var(--ptm-border);border-radius:8px;background:var(--ptm-surface);color:var(--ptm-text-2);cursor:pointer;transition:background .15s,border-color .15s}
.ptm-select:hover{background:var(--ptm-hover);border-color:var(--ptm-border-strong)}
.ptm-select select{appearance:none;border:0;background:transparent;color:var(--ptm-text);font-size:13px;padding:0 2px;outline:none;cursor:pointer}
.ptm-select svg:last-child{color:var(--ptm-text-3)}

.ptm-error{display:flex;align-items:center;gap:8px;margin:0 32px 12px;padding:8px 8px 8px 12px;border-radius:8px;border:1px solid color-mix(in srgb,var(--ptm-danger) 26%,transparent);background:color-mix(in srgb,var(--ptm-danger) 8%,transparent);color:var(--ptm-danger-text);font-size:12.5px}
.ptm-error>span{flex:1;min-width:0}
.ptm-error .ptm-icon-button{color:var(--ptm-danger-text);width:24px;height:24px}

.ptm-attention{margin:0 32px 12px;padding:8px 10px 8px 12px;border:1px solid color-mix(in srgb,var(--ptm-warn) 24%,transparent);background:color-mix(in srgb,var(--ptm-warn) 7%,transparent);border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ptm-attention-head{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ptm-warn-text);flex:none}
.ptm-attention-count{display:inline-grid;place-items:center;min-width:18px;height:16px;padding:0 5px;border-radius:999px;background:color-mix(in srgb,var(--ptm-warn) 18%,transparent);font-size:10px;font-weight:600}
.ptm-attention-items{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ptm-attention-item{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 7px 0 8px;border-radius:6px;border:1px solid var(--ptm-border);background:var(--ptm-surface);font-size:12px;color:var(--ptm-text);max-width:360px;min-width:0;transition:background .15s,border-color .15s}
.ptm-attention-item:hover{background:var(--ptm-hover);border-color:var(--ptm-border-strong)}
.ptm-attention-title{flex:1 1 150px;min-width:90px;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptm-attention-reason{flex:0 0 auto;max-width:110px;overflow:hidden;text-overflow:ellipsis;color:var(--ptm-text-3);white-space:nowrap;font-size:11px}
.ptm-attention-more{font-size:11px;color:var(--ptm-text-3);white-space:nowrap}

.ptm-boardarea{display:flex;flex:1;min-height:0;position:relative}
.ptm-boardscroll{flex:1;min-width:0;overflow:auto;overscroll-behavior:contain;padding-bottom:8px;scrollbar-gutter:stable}
.ptm-columns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(252px,1fr);gap:12px;align-items:stretch;padding:0 30px 24px;min-height:100%}
.ptm-column{display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:var(--ptm-radius-lg);background:color-mix(in srgb,var(--ptm-text) 2.8%,transparent);border:1px solid transparent;min-height:190px;transition:background .2s}
.ptm-column:hover{background:color-mix(in srgb,var(--ptm-text) 3.8%,transparent)}
.ptm-column-head{display:flex;align-items:center;gap:7px;padding:3px 4px 5px;min-height:28px}
.ptm-column-head h2{font-size:13px;line-height:20px;font-weight:600;margin:0;letter-spacing:.01em}
.ptm-column-count{font-size:11px;font-weight:500;color:var(--ptm-text-3);background:color-mix(in srgb,var(--ptm-text) 6%,transparent);border-radius:999px;min-width:20px;height:18px;padding:0 6px;display:inline-grid;place-items:center;font-variant-numeric:tabular-nums}
.ptm-column-spacer{flex:1}
.ptm-column-add{width:24px;height:24px;border-radius:6px;opacity:.55}
.ptm-column:hover .ptm-column-add,.ptm-column-add:focus-visible{opacity:1}
.ptm-cards{display:flex;flex-direction:column;gap:8px}
.ptm-column-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:92px;padding:14px 10px;border:1px dashed color-mix(in srgb,var(--ptm-text) 14%,transparent);border-radius:9px;color:var(--ptm-text-3);font-size:11.5px;text-align:center}

.ptm-card{appearance:none;display:flex;flex-direction:column;gap:7px;width:100%;text-align:left;padding:11px 12px;border-radius:10px;border:1px solid var(--ptm-border);background:var(--ptm-surface);color:var(--ptm-text);box-shadow:var(--ptm-shadow-card);transition:border-color .15s,box-shadow .15s,transform .15s;font:inherit}
.ptm-card:hover{border-color:var(--ptm-border-strong);box-shadow:var(--ptm-shadow-hover);transform:translateY(-1px)}
.ptm-card:active{transform:translateY(0)}
.ptm-card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:16px}
.ptm-card-id{font-family:var(--ptm-font-mono);font-size:11px;color:var(--ptm-text-3);letter-spacing:.02em}
.ptm-priority{font-size:11px;line-height:1;padding:3px 5px;border-radius:4px;background:color-mix(in srgb,var(--ptm-text) 6%,transparent);color:var(--ptm-text-2);white-space:nowrap}
.ptm-priority-high{background:color-mix(in srgb,var(--ptm-danger) 10%,transparent);color:var(--ptm-danger-text)}
.ptm-priority-low{color:var(--ptm-text-3)}
.ptm-card-title{font-size:13.5px;line-height:1.5;font-weight:500;color:var(--ptm-text);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ptm-card-badges{display:flex;gap:5px;flex-wrap:wrap}
.ptm-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:1;padding:3px 5px;border-radius:4px;background:color-mix(in srgb,var(--ptm-text) 6%,transparent);color:var(--ptm-text-2);white-space:nowrap}
.ptm-badge-danger{background:color-mix(in srgb,var(--ptm-danger) 11%,transparent);color:var(--ptm-danger-text)}
.ptm-badge-warn{background:color-mix(in srgb,var(--ptm-warn) 13%,transparent);color:var(--ptm-warn-text)}
.ptm-badge-accent{background:color-mix(in srgb,var(--ptm-accent) 12%,transparent);color:var(--ptm-accent)}
.ptm-progress{display:flex;align-items:center;gap:7px}
.ptm-progress-track{flex:1;height:4px;border-radius:999px;background:color-mix(in srgb,var(--ptm-text) 8%,transparent);overflow:hidden}
.ptm-progress-fill{display:block;height:100%;border-radius:999px;background:var(--ptm-accent);transition:width .3s ease}
.ptm-progress-text{font-size:11px;color:var(--ptm-text-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.ptm-card-meta{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;font-size:11px;color:var(--ptm-text-3)}
.ptm-card-time{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex:none}
.ptm-card-session{display:inline-flex;align-items:center;gap:4px;min-width:0;overflow:hidden;color:var(--ptm-text-2)}
.ptm-card-session svg{flex:none}
.ptm-card-session-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.ptm-emptystate{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:56px 24px;max-width:480px;margin:0 auto;height:100%}
.ptm-emptystate-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--ptm-text) 5%,transparent);color:var(--ptm-text-2);margin-bottom:14px}
.ptm-emptystate h2{font-size:16px;font-weight:600;margin:0 0 6px}
.ptm-emptystate p{font-size:13px;line-height:1.6;color:var(--ptm-text-2);margin:0}
.ptm-emptystate-actions{margin-top:16px}

.ptm-skeleton{background:var(--dsw-alias-bg-skeleton,color-mix(in srgb,var(--ptm-text) 7%,transparent));border-radius:6px;position:relative;overflow:hidden}
.ptm-skeleton::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ptm-text) 6%,transparent),transparent);animation:ptm-shimmer 1.4s infinite}
.ptm-skeleton-heading{width:72px;height:14px}
.ptm-skeleton-card{min-height:104px;gap:9px;pointer-events:none;background:var(--ptm-surface)}
.ptm-skeleton-line{height:10px;width:100%}
.ptm-skeleton-title{width:70%;height:20px}
.ptm-skeleton-line.is-short{width:34%}
.ptm-skeleton-line.is-tiny{width:22%}
.ptm-skeleton-line.is-medium{width:64%}
.ptm-detail-skeleton .ptm-detail-head{position:relative;gap:10px}
.ptm-detail-close{position:absolute;right:18px;top:16px}
.ptm-detail-skeleton .ptm-detail-scroll{gap:12px}

.ptm-detail{width:440px;flex:none;height:100%;display:flex;flex-direction:column;background:var(--ptm-surface);border-left:1px solid var(--ptm-border);min-height:0;box-shadow:-20px 0 44px -36px rgba(0,0,0,.5);animation:ptm-slidein .18s ease}
.ptm-detail-head{padding:16px 18px 12px;display:flex;flex-direction:column;gap:8px;flex:none}
.ptm-detail-headrow{display:flex;align-items:center;gap:6px;min-height:24px;flex-wrap:wrap}
.ptm-detail-head h2{font-size:18px;line-height:1.4;font-weight:600;margin:0;overflow-wrap:anywhere}
.ptm-detail-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--ptm-text-3)}
.ptm-meta-sep{color:var(--ptm-text-3);opacity:.6}
.ptm-detail-spacer{flex:1}
.ptm-detail-id{font-family:var(--ptm-font-mono);font-size:11px;color:var(--ptm-text-3)}
.ptm-detail-rev{font-size:11px;color:var(--ptm-text-3)}
.ptm-statuspill{display:inline-flex;align-items:center;gap:5px;height:23px;padding:0 7px;border-radius:5px;background:color-mix(in srgb,var(--ptm-text) 6%,transparent);font-size:11px;font-weight:500;color:var(--ptm-text-2);white-space:nowrap}
.ptm-status-in_progress{background:color-mix(in srgb,var(--ptm-accent) 13%,transparent);color:var(--ptm-accent)}
.ptm-status-in_review{background:color-mix(in srgb,var(--ptm-warn) 15%,transparent);color:var(--ptm-warn-text)}
.ptm-status-done{background:color-mix(in srgb,var(--ptm-success) 14%,transparent);color:var(--ptm-success-text)}
.ptm-status-blocked{background:color-mix(in srgb,var(--ptm-danger) 12%,transparent);color:var(--ptm-danger-text)}
.ptm-status-paused{background:color-mix(in srgb,var(--ptm-warn) 13%,transparent);color:var(--ptm-warn-text)}
.ptm-status-backlog,.ptm-status-todo,.ptm-status-cancelled{background:color-mix(in srgb,var(--ptm-text) 6%,transparent);color:var(--ptm-text-2)}
.ptm-live{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--ptm-accent);background:color-mix(in srgb,var(--ptm-accent) 10%,transparent);padding:2px 6px;border-radius:999px;white-space:nowrap}
.ptm-live-dot{width:5px;height:5px;border-radius:999px;background:var(--ptm-accent);animation:ptm-pulse 1.4s ease-in-out infinite}

.ptm-detail-actions{display:flex;align-items:center;gap:7px;padding:0 18px;flex-wrap:wrap;flex:none}
.ptm-detail-actions .ptm-button{height:30px;font-size:12.5px;padding:0 10px}
.ptm-detail-edit{margin-left:auto}
.ptm-action-hint{margin:7px 18px 0;font-size:11px;line-height:1.5;color:var(--ptm-text-3);flex:none}
.ptm-detail-scroll{flex:1;min-height:0;overflow:auto;padding:14px 18px calc(24px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px;overscroll-behavior:contain}
.ptm-section{display:flex;flex-direction:column;gap:8px}
.ptm-section-head{display:flex;align-items:center;gap:6px}
.ptm-section-head h3{font-size:12px;font-weight:600;color:var(--ptm-text-2);margin:0;letter-spacing:.02em}
.ptm-count-badge{display:inline-grid;place-items:center;min-width:18px;height:16px;padding:0 5px;border-radius:999px;background:color-mix(in srgb,var(--ptm-text) 6%,transparent);font-size:10.5px;font-weight:500;color:var(--ptm-text-3);font-variant-numeric:tabular-nums}
.ptm-prose{margin:0;font-size:13px;line-height:1.7;color:var(--ptm-text);white-space:pre-wrap;overflow-wrap:anywhere}
.ptm-muted{color:var(--ptm-text-3);font-size:12.5px;margin:0;line-height:1.55}

.ptm-criteria{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ptm-criteria li{display:flex;gap:8px;font-size:12.5px;line-height:1.55;color:var(--ptm-text)}
.ptm-criteria-mark{flex:none;width:17px;height:17px;border-radius:5px;border:1px solid var(--ptm-border);display:grid;place-items:center;font-size:10px;color:var(--ptm-text-3);margin-top:1px;background:var(--ptm-surface)}
.ptm-criteria-mark.is-done{background:color-mix(in srgb,var(--ptm-success) 16%,transparent);border-color:transparent;color:var(--ptm-success-text)}
.ptm-childprogress{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ptm-text-3)}
.ptm-children{display:flex;flex-direction:column;gap:3px}
.ptm-child{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 8px;border:0;border-radius:7px;background:transparent;color:var(--ptm-text);font-size:12.5px}
.ptm-child:hover{background:var(--ptm-hover)}
.ptm-child-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptm-child-status{font-size:10.5px;color:var(--ptm-text-3);white-space:nowrap}
.ptm-child-done .ptm-child-title{color:var(--ptm-text-2);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--ptm-text) 20%,transparent)}
.ptm-child-done .ptm-child-status{color:var(--ptm-success-text)}

.ptm-timeline{display:flex;flex-direction:column;position:relative;padding-left:14px}
.ptm-timeline::before{content:"";position:absolute;left:3px;top:6px;bottom:6px;width:1px;background:var(--ptm-border)}
.ptm-checkpoint{position:relative;padding:0 0 16px}
.ptm-checkpoint:last-child{padding-bottom:0}
.ptm-checkpoint::before{content:"";position:absolute;left:-14px;top:5px;width:7px;height:7px;border-radius:999px;background:var(--ptm-accent);box-shadow:0 0 0 3px var(--ptm-surface)}
.ptm-checkpoint.ptm-cp-start::before,.ptm-checkpoint.ptm-cp-progress::before{background:var(--ptm-accent)}
.ptm-checkpoint.ptm-cp-handoff::before{background:var(--ptm-warn)}
.ptm-checkpoint.ptm-cp-finish::before{background:var(--ptm-success)}
.ptm-checkpoint.ptm-cp-interrupted::before{background:var(--ptm-danger)}
.ptm-checkpoint-head{display:flex;align-items:center;gap:7px;margin-bottom:4px}
.ptm-kind{font-size:10.5px;font-weight:600;padding:2px 5px;border-radius:4px;background:color-mix(in srgb,var(--ptm-text) 6%,transparent);color:var(--ptm-text-2)}
.ptm-kind-start,.ptm-kind-progress{background:color-mix(in srgb,var(--ptm-accent) 11%,transparent);color:var(--ptm-accent)}
.ptm-kind-handoff{background:color-mix(in srgb,var(--ptm-warn) 13%,transparent);color:var(--ptm-warn-text)}
.ptm-kind-finish{background:color-mix(in srgb,var(--ptm-success) 13%,transparent);color:var(--ptm-success-text)}
.ptm-kind-interrupted{background:color-mix(in srgb,var(--ptm-danger) 11%,transparent);color:var(--ptm-danger-text)}
.ptm-checkpoint-head time{font-size:10.5px;color:var(--ptm-text-3)}
.ptm-checkpoint-summary{margin:0;font-size:12.5px;line-height:1.6;color:var(--ptm-text);white-space:pre-wrap;overflow-wrap:anywhere}
.ptm-checkpoint-state{margin:4px 0 0;font-size:11.5px;line-height:1.55;color:var(--ptm-text-3);padding-left:8px;border-left:2px solid var(--ptm-border);overflow-wrap:anywhere}
.ptm-evidence{margin-top:6px;font-size:11.5px}
.ptm-evidence summary{display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:var(--ptm-text-2);list-style:none;padding:3px 0;font-size:11.5px}
.ptm-evidence summary::-webkit-details-marker{display:none}
.ptm-evidence summary::before{content:"▸";font-size:9px;color:var(--ptm-text-3);transition:transform .15s}
.ptm-evidence[open] summary::before{transform:rotate(90deg)}
.ptm-evidence-group{margin-top:6px}
.ptm-evidence-group strong{display:block;font-size:11px;color:var(--ptm-text-2);font-weight:600;margin-bottom:2px}
.ptm-evidence-group ul{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:2px;color:var(--ptm-text-2)}
.ptm-evidence-group li{overflow-wrap:anywhere;line-height:1.5}
.ptm-evidence code{font-family:var(--ptm-font-mono);font-size:10.5px;background:color-mix(in srgb,var(--ptm-text) 6%,transparent);padding:1px 4px;border-radius:3px}
.ptm-link{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--ptm-link);font-size:11px;padding:4px 0 0;text-align:left;overflow-wrap:anywhere}
.ptm-link:hover{text-decoration:underline}
.ptm-link svg{flex:none}

.ptm-sessions{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.ptm-sessionrow{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:7px 8px;border:0;border-radius:7px;background:transparent;color:var(--ptm-text)}
.ptm-sessionrow:hover{background:var(--ptm-hover)}
.ptm-sessionrow-icon{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb,var(--ptm-text) 5%,transparent);color:var(--ptm-text-2);flex:none}
.ptm-sessionrow-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.ptm-sessionrow-title{font-size:12.5px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptm-sessionrow-meta{font-size:11px;color:var(--ptm-text-3)}
.ptm-sessionrow>svg{color:var(--ptm-text-3);flex:none}

.ptm-activities{border-top:1px solid var(--ptm-border);padding-top:12px}
.ptm-activities summary{display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;font-weight:600;color:var(--ptm-text-2);list-style:none;padding:4px 0}
.ptm-activities summary::-webkit-details-marker{display:none}
.ptm-activities summary::before{content:"▸";font-size:9px;color:var(--ptm-text-3);transition:transform .15s}
.ptm-activities[open] summary::before{transform:rotate(90deg)}
.ptm-activity-list{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.ptm-activity-list li{display:flex;align-items:flex-start;gap:8px;font-size:11.5px}
.ptm-activity-dot{width:5px;height:5px;border-radius:999px;background:var(--ptm-text-3);margin-top:5px;flex:none}
.ptm-activity-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.ptm-activity-action{color:var(--ptm-text)}
.ptm-activity-transition{color:var(--ptm-text-3);font-size:10.5px}
.ptm-activity-detail{margin:2px 0 0;color:var(--ptm-text-3);font-size:11px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ptm-activity-list time{font-size:10.5px;color:var(--ptm-text-3);white-space:nowrap;margin-top:1px}

.ptm-blockcallout{border:1px solid color-mix(in srgb,var(--ptm-danger) 26%,transparent);background:color-mix(in srgb,var(--ptm-danger) 7%,transparent);border-radius:9px;padding:10px 11px;display:flex;flex-direction:column;gap:5px}
.ptm-blockcallout-head{display:flex;align-items:center;gap:6px;color:var(--ptm-danger-text);font-size:12px}
.ptm-blockcallout p{margin:0;font-size:12px;line-height:1.55;color:var(--ptm-text);overflow-wrap:anywhere}
.ptm-blockcallout-sub span{font-size:10.5px;color:var(--ptm-text-3);display:block;margin-top:3px}
.ptm-blockcallout-sub p{color:var(--ptm-text-2);font-size:11.5px}

.ptm-editform{display:flex;flex-direction:column;gap:11px}
.ptm-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.ptm-field-label{font-size:11px;font-weight:500;color:var(--ptm-text-2);display:flex;align-items:center;gap:6px}
.ptm-field-optional{font-weight:400;color:var(--ptm-text-3);font-size:10.5px}
.ptm-field input,.ptm-field textarea,.ptm-field select{width:100%;border:1px solid var(--ptm-border);border-radius:7px;background:var(--ptm-input);color:var(--ptm-text);font:inherit;font-size:12.5px;padding:7px 9px;outline:none;transition:border-color .15s,box-shadow .15s}
.ptm-field textarea{resize:vertical;line-height:1.55}
.ptm-field input:focus,.ptm-field textarea:focus,.ptm-field select:focus{border-color:var(--ptm-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ptm-accent) 12%,transparent)}
.ptm-field-row{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.ptm-form-error{margin:0;font-size:11.5px;color:var(--ptm-danger-text);background:color-mix(in srgb,var(--ptm-danger) 8%,transparent);border:1px solid color-mix(in srgb,var(--ptm-danger) 22%,transparent);border-radius:6px;padding:7px 9px}
.ptm-savebar{display:flex;align-items:center;gap:7px;padding:10px 18px;border-top:1px solid var(--ptm-border);background:color-mix(in srgb,var(--ptm-surface) 88%,var(--ptm-bg));font-size:11.5px;color:var(--ptm-text-2);flex:none}
.ptm-savebar .ptm-button{height:28px;font-size:12px;padding:0 10px}
.ptm-savebar-spacer{flex:1}

.ptm-modal-layer{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-2,rgba(0,0,0,.14));backdrop-filter:blur(2px);animation:ptm-fade .15s ease}
.ptm-modal{width:min(560px,100%);max-height:calc(100vh - 48px);overflow:auto;background:var(--ptm-surface);border:1px solid var(--ptm-border);border-radius:var(--ptm-radius-xl);box-shadow:var(--ptm-shadow-pop);animation:ptm-pop .18s ease}
.ptm-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px}
.ptm-modal-title{display:flex;gap:10px;align-items:center;min-width:0}
.ptm-modal-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--ptm-accent) 11%,transparent);color:var(--ptm-accent);flex:none}
.ptm-modal-title h2{font-size:16px;line-height:1.3;font-weight:600;margin:0}
.ptm-modal-title p{font-size:11.5px;color:var(--ptm-text-3);margin:2px 0 0;overflow-wrap:anywhere}
.ptm-modal-form{display:flex;flex-direction:column;gap:11px;padding:0 18px 18px}
.ptm-modal-form .ptm-field input,.ptm-modal-form .ptm-field textarea{font-size:13px;padding:8px 9px}
.ptm-segmented{display:inline-flex;background:color-mix(in srgb,var(--ptm-text) 5%,transparent);border-radius:7px;padding:2px;gap:2px;width:fit-content}
.ptm-segmented button{border:0;background:transparent;color:var(--ptm-text-2);font-size:11.5px;font-weight:500;padding:4px 10px;border-radius:5px;height:24px}
.ptm-segmented button.is-active{background:var(--ptm-surface);color:var(--ptm-text);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ptm-modal-foot{display:flex;align-items:center;gap:10px;padding-top:4px}
.ptm-modal-hint{flex:1;font-size:11px;color:var(--ptm-text-3);line-height:1.5;min-width:0}
.ptm-modal-actions{display:flex;gap:7px;flex:none}
.ptm-toast{position:fixed;right:24px;bottom:24px;z-index:200;padding:9px 14px;border-radius:9px;background:var(--dsw-alias-toast-bg,#0f1115);color:var(--dsw-alias-toast-label,#fff);font-size:12.5px;box-shadow:var(--ptm-shadow-pop);animation:ptm-toastin .2s ease}
.ptm-scrim{display:none}
.ptm-spin{animation:ptm-spin .8s linear infinite}

@keyframes ptm-spin{to{transform:rotate(360deg)}}
@keyframes ptm-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes ptm-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
@keyframes ptm-slidein{from{transform:translateX(12px);opacity:0}to{transform:none;opacity:1}}
@keyframes ptm-fade{from{opacity:0}to{opacity:1}}
@keyframes ptm-pop{from{transform:translateY(8px) scale(.99);opacity:0}to{transform:none;opacity:1}}
@keyframes ptm-toastin{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}

@media (max-width:1180px){
.ptm-path{display:none}
.ptm-detail{position:absolute;right:0;top:0;bottom:0;width:min(460px,94vw);z-index:40;border-left:1px solid var(--ptm-border);box-shadow:-24px 0 64px rgba(0,0,0,.18)}
.ptm-scrim{display:block;position:absolute;inset:0;z-index:30;background:var(--dsw-alias-bg-mask-2,rgba(0,0,0,.14))}
}
@media (max-width:820px){
.ptm-pagehead{padding:18px 18px 0}
.ptm-overview{padding:12px 18px 0}
.ptm-toolbar{padding:12px 18px 10px}
.ptm-columns{padding:0 18px 20px;grid-auto-columns:minmax(236px,78vw)}
.ptm-detail{position:fixed;inset:0;width:100%;height:100%;max-height:none;border-left:0;border-radius:0;box-shadow:none;z-index:140}
.ptm-scrim{display:none}
.ptm-pagehead{gap:10px}
.ptm-page-actions{width:100%;justify-content:flex-end}
.ptm-error{margin:0 18px 10px}
.ptm-attention{margin:0 18px 10px}
.ptm-search{width:100%}
.ptm-toolbar-actions{margin-left:0;width:100%;justify-content:flex-end}
.ptm-overview-total{display:none}
.ptm-modal-layer{padding:12px}
.ptm-modal-foot{flex-wrap:wrap}
.ptm-modal-hint{flex-basis:100%}
}
@media (prefers-reduced-motion:reduce){
.ptm-board *{animation-duration:.001ms!important;transition-duration:.001ms!important}
}
`

export function adoptProjectTaskStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}

import addStyles, { stylesExist } from '../utilities/addStyles'
import { ACCENT, ACCENT_TEXT, accentAlpha } from '../utilities/colors'

export function ensureNotificationStyles() {
  if (stylesExist('notificationCards')) return
  addStyles('notificationCards', `
    /* 保留虚拟列表行的布局尺寸，避免 ResizeObserver 将所有行缓存为 0。
       fixed 脱离滚动文档，不让不可见的长列表撑出卡片下方的空白。 */
    [data-xf-notification-hidden="true"]{position:fixed!important;top:0!important;left:0!important;width:var(--xf-nc-native-width,100%)!important;visibility:hidden!important;pointer-events:none!important}
    [data-xf-notification-hidden="true"] *{visibility:hidden!important;pointer-events:none!important}
    #xf-notification-cards{container-type:inline-size;color:var(--xf-nc-fg);background:var(--xf-nc-bg);font-size:14px;line-height:1.5}
    #xf-notification-cards *{box-sizing:border-box}
    #xf-notification-cards [hidden]{display:none!important}
    #xf-notification-cards button,#xf-notification-cards input{font:inherit}
    #xf-notification-cards button{cursor:pointer;color:inherit}
    #xf-notification-cards button:focus-visible,#xf-notification-cards a:focus-visible{outline:2px solid ${ACCENT};outline-offset:3px}
    #xf-notification-cards svg{width:16px;height:16px;flex-shrink:0;vertical-align:middle}
    #xf-notification-cards a{color:${ACCENT};text-decoration:none}
    #xf-notification-cards a:hover{text-decoration:underline}
    .xf-nc-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--xf-nc-border)}
    .xf-nc-modes{display:flex;gap:4px;padding:3px;border-radius:9999px;background:var(--xf-nc-hover)}
    .xf-nc-modes button{display:flex;gap:6px;align-items:center;min-height:32px;padding:5px 12px;border:0;border-radius:9999px;background:transparent;font-size:13px!important}
    .xf-nc-modes button[aria-pressed="true"]{background:var(--xf-nc-bg);font-weight:700}
    /* §3.6：组内间距小于组间距离；窄屏整组换行，不压缩标签。 */
    .xf-nc-filters{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-left:auto}
    .xf-nc-filter{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--xf-nc-secondary);cursor:pointer;min-height:32px;white-space:nowrap}
    .xf-nc-filter:has(input:checked){color:var(--xf-nc-fg)}
    .xf-nc-filter input:focus-visible{outline:2px solid ${ACCENT};outline-offset:3px}
    .xf-nc-filter input{accent-color:${ACCENT};margin:0;width:14px;height:14px}
    .xf-nc-content{padding:18px 16px 12px}
    .xf-nc-loading{margin-top:16px}
    .xf-nc-loading>div{min-height:140px;border-radius:16px;background:var(--xf-nc-hover)}
    /* §2.1 / §3.6：提醒独立分区，摘要优先；沿用现有间距、字号和圆角。 */
    .xf-nc-posts{border:1px solid var(--xf-nc-border);border-radius:16px;padding:16px;margin-bottom:24px}
    .xf-nc-posts h2{position:relative;display:block;padding-inline-start:24px;margin:0;font-size:14px;font-weight:700}
    .xf-nc-posts h2>svg{position:absolute;inset-inline-start:0;top:50%;transform:translateY(-50%);color:${ACCENT}}
    .xf-nc-post{position:relative;display:flex;flex-direction:column;gap:16px;isolation:isolate}
    .xf-nc-post-heading{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 16px}
    /* §3.4.1 / §3.6：头像保持单行，最多七个头像加数量；摘要同行居中，动作独占下一行。 */
    .xf-nc-post-content{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px 12px}
    .xf-nc-post:hover{background:var(--xf-nc-hover)}
    .xf-nc-post-open,.xf-nc-card-open{position:absolute;inset:0;z-index:1;width:100%;height:100%;padding:0;border:0;border-radius:inherit;background:transparent}
    .xf-nc-profile{position:relative;z-index:2;display:inline-flex;flex-shrink:0;border-radius:50%}
    .xf-nc-profile:hover{filter:brightness(.9)}
    .xf-nc-post-action{grid-column:1/-1;justify-self:end;color:var(--xf-nc-fg);font-size:12px}
    .xf-nc-post-avatars{display:flex;flex-wrap:nowrap;align-items:center;gap:4px}
    .xf-nc-post-avatars .xf-nc-avatar{width:28px;height:28px}
    .xf-nc-post-more{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:28px;height:28px;padding:0 4px;border-radius:9999px;background:var(--xf-nc-hover);color:var(--xf-nc-secondary);font-size:11px;font-weight:600;white-space:nowrap}
    .xf-nc-post-avatars:empty{display:none}
    .xf-nc-post-content:has(.xf-nc-post-avatars:empty){grid-template-columns:minmax(0,1fr)}
    .xf-nc-post-body{display:contents}
    .xf-nc-post-body p{min-width:0;margin:0;overflow-wrap:anywhere;font-size:14px}
    .xf-nc-post-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;color:var(--xf-nc-secondary);font-size:11px}
    @container (max-width:380px){.xf-nc-posts{padding:12px}.xf-nc-post-content{grid-template-columns:minmax(0,1fr);gap:8px}}
    .xf-nc-heading{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}
    .xf-nc-heading h2{margin:0;font-size:17px;font-weight:700}
    .xf-nc-heading p{margin:4px 0 0;color:var(--xf-nc-secondary);font-size:12px}
    /* §2.8：批量操作为次要按钮，字重与卡片主操作区分。 */
    .xf-nc-mark-all{min-height:32px;padding:5px 12px;border:1px solid var(--xf-nc-border);border-radius:9999px;background:transparent;font-size:12px!important;white-space:nowrap}
    .xf-nc-mark-all:not(:disabled):hover{background:var(--xf-nc-hover)}
    #xf-notification-cards .xf-nc-mark-all:disabled{cursor:default;color:var(--xf-nc-secondary)}
    .xf-nc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .xf-nc-card{position:relative;isolation:isolate;min-width:0;display:flex;flex-direction:column;align-items:stretch;text-align:left;min-height:174px;padding:16px;border:1px solid var(--xf-nc-border);border-radius:16px;background:var(--xf-nc-bg);transition:background .15s,border-color .15s}
    .xf-nc-card:hover{background:var(--xf-nc-hover)}
    /* §2.4：降低点赞等通知的权重；§5.7：回复另有图标、文字和较高字重，不单靠颜色。 */
    .xf-nc-card[data-kind="reply"]{border-inline-start:3px solid ${ACCENT}}
    .xf-nc-card-kind{display:flex;align-items:center;gap:6px;margin-bottom:12px;color:var(--xf-nc-secondary);font-size:12px}
    .xf-nc-card[data-kind="reply"] .xf-nc-card-kind{color:var(--xf-nc-fg);font-weight:700}
    .xf-nc-card[data-kind="reply"] .xf-nc-card-kind svg{color:${ACCENT}}
    .xf-nc-card:not([data-kind="reply"]) .xf-nc-excerpt{color:var(--xf-nc-secondary);font-size:12px}
    .xf-nc-card:not([data-kind="reply"]) .xf-nc-user b{font-weight:500}
    .xf-nc-card[data-expanded="true"]{border-color:${ACCENT};box-shadow:0 0 0 1px ${ACCENT}}
    .xf-nc-identity{display:flex;gap:10px;align-items:center;min-width:0}
    .xf-nc-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--xf-nc-hover);display:grid;place-items:center;color:var(--xf-nc-secondary)}
    .xf-nc-user{min-width:0;display:flex;flex-direction:column}
    .xf-nc-user b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
    .xf-nc-user small{color:var(--xf-nc-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .xf-nc-badge{position:absolute;top:-7px;right:10px;min-width:23px;text-align:center;background:${ACCENT};color:${ACCENT_TEXT};border:3px solid var(--xf-nc-bg);border-radius:9999px;padding:0 5px;font-size:11px;font-weight:700;line-height:18px}
    .xf-nc-excerpt{margin-top:15px;font-size:14px;line-height:1.55;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
    .xf-nc-types{display:flex;flex-wrap:wrap;gap:6px 10px;color:var(--xf-nc-secondary);font-size:11px;margin-top:12px}
    .xf-nc-types span{display:flex;align-items:center;gap:4px}
    .xf-nc-types svg{width:13px!important;height:13px!important}
    .xf-nc-bottom{display:flex;gap:6px;align-items:center;justify-content:space-between;padding-top:16px;margin-top:auto;color:var(--xf-nc-secondary);font-size:11px}
    .xf-nc-card-action{display:inline-flex;align-items:center;gap:4px}
    .xf-nc-card[data-kind="reply"] .xf-nc-card-action{color:var(--xf-nc-fg);font-weight:700}
    .xf-nc-card[data-expanded="true"] .xf-nc-card-action svg{transform:rotate(180deg)}
    .xf-nc-detail{grid-column:1/-1;border:1px solid var(--xf-nc-border);border-radius:16px;padding:16px;min-width:0}
    .xf-nc-detail-heading{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid var(--xf-nc-border)}
    .xf-nc-detail-heading h3{font-size:15px;margin:0;overflow-wrap:anywhere}
    .xf-nc-close{margin-left:auto;border:0;border-radius:50%;padding:8px;background:var(--xf-nc-hover);display:grid;place-items:center;flex-shrink:0}
    .xf-nc-event{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;padding-top:18px}
    .xf-nc-event>svg{color:var(--xf-nc-secondary);margin-top:3px}
    .xf-nc-event[data-kind="reply"]>svg{color:${ACCENT}}
    .xf-nc-event:not([data-kind="reply"]){color:var(--xf-nc-secondary)}
    .xf-nc-event:not([data-kind="reply"]) p{font-size:12px}
    .xf-nc-event-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:12px}
    .xf-nc-time{color:var(--xf-nc-secondary);font-size:11px;white-space:nowrap}
    .xf-nc-event p{margin:7px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}
    .xf-nc-event .xf-nc-note{font-size:12px;color:var(--xf-nc-secondary)}
    .xf-nc-link{display:inline-block;margin-top:8px;font-size:12px}
    .xf-nc-event-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:10px}
    .xf-nc-event-actions .xf-nc-link{margin-top:0}
    .xf-nc-reply{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 12px;border:1px solid var(--xf-nc-border);border-radius:9999px;font-size:12px;font-weight:700}
    #xf-notification-cards .xf-nc-reply:hover{background:${accentAlpha(.1)};text-decoration:none}
    .xf-nc-other{margin-top:20px;padding-top:16px;border-top:1px solid var(--xf-nc-border)}
    .xf-nc-other summary{cursor:pointer;color:var(--xf-nc-secondary);font-size:13px}
    .xf-nc-footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;justify-content:space-between;padding:18px 0 4px;color:var(--xf-nc-secondary);font-size:12px}
    .xf-nc-text-button{padding:6px 0;border:0;background:none;color:${ACCENT}!important;font-size:12px!important}
    .xf-nc-empty{padding:24px 0;text-align:center;color:var(--xf-nc-secondary);font-size:13px}
    .xf-nc-grouped-note{margin-top:8px;color:var(--xf-nc-secondary);font-size:12px}
    .xf-nc-grouped-note summary{cursor:pointer;width:fit-content}
    .xf-nc-grouped-note summary:focus-visible{outline:2px solid ${ACCENT};outline-offset:3px}
    .xf-nc-grouped-note p{margin:8px 0 0;line-height:1.5}
    .xf-nc-status{margin:8px 0 0;font-size:12px;color:var(--xf-nc-secondary)}
    @container (min-width:660px){.xf-nc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @container (max-width:380px){.xf-nc-grid{grid-template-columns:minmax(0,1fr)}.xf-nc-card{padding:12px}.xf-nc-identity{gap:7px}.xf-nc-avatar{width:28px;height:28px}.xf-nc-user b{font-size:12px}.xf-nc-user small{font-size:11px}.xf-nc-bottom{flex-wrap:wrap}.xf-nc-modes button{padding:5px 9px}}
    @media (prefers-reduced-motion:reduce){.xf-nc-card{transition:none}}
  `)
}

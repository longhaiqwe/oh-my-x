export const PROCESSED_ATTR = 'data-xf-spam-processed'
export const STATE_ATTR = 'data-xf-spam-state'
/** 隐藏的来源：rule 规则（直接隐藏），ai AI 打分（折叠，前面有折叠条） */
export const HIDDEN_BY_ATTR = 'data-xf-spam-hidden-by'
export const SCORE_ATTR = 'data-xf-spam-score'
export const DEBUG_BAR_ID = 'x-focus-spam-debug-bar'
export const DEBUG_BAR_VERSION = '2'
export const DEBUG_CONFIG_ATTR = 'data-xf-config-key'
export const DEBUG_POSITIONED_ATTR = 'data-xf-spam-debug-positioned'
/** 调试条画的是哪一版 AI 判断结果；和 aiScorer.version() 不一致时要重画 */
export const AI_VERSION_ATTR = 'data-xf-ai-version'
export const SCROLL_STABILITY_STYLE_ID = 'x-focus-spam-scroll-stability'

export const XF_SELF_SELECTOR = [
  '[data-xf-spam-hidden-replacement]',
  '[data-xf-spam-debug]',
  '[data-xf-list-dropdown]',
  '[data-xf-kw-btn]',
  '[data-xf-list-btn]',
  '[data-xf-kw-panel]',
  '[data-xf-ai-tag]',
  '[data-xf-ai-pill]',
].join(',')

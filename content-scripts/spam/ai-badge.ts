import type { AiErrorDescription } from '../../shared/ai-error'
import { isDarkTheme } from './keyword-picker/theme'
// 回复区 AI 打分在 X 页面上的界面：分数标签、折叠条、标题栏按钮。
// 只负责画；什么时候显示、点了做什么由 scanner.ts 决定。
import { t, type MessageKey } from '../../shared/i18n'
import type { ReplyLabel } from '../../shared/reply-score-db'
import type { AiDisplay } from './ai-scorer'

export const AI_TAG_ATTR = 'data-xf-ai-tag'
export const AI_PILL_ATTR = 'data-xf-ai-pill'
export const AI_FOLD_CLASS = 'xf-ai-fold'
const STYLE_ID = 'xf-spam-ai-styles'

export type AiTone = 'high' | 'mid' | 'low'

/** 0–30 灰，31–69 黄，70–100 红 */
export function aiTone(score: number): AiTone {
  return score >= 70 ? 'high' : score >= 31 ? 'mid' : 'low'
}

export function aiSignalNames(signals: readonly string[]): string {
  return signals.map((s) => t(`aiSignal.${s}` as MessageKey)).join(t('spamPage.aiSignalSeparator'))
}

/** 悬停说明：理由 + 命中的信号 */
export function aiTitle(display: Extract<AiDisplay, { status: 'done' }>): string {
  const lines = [t('spamPage.aiTitle', { score: display.score })]
  if (display.reason) lines.push(display.reason)
  if (display.signals.length) lines.push(t('spamPage.aiSignals', { signals: aiSignalNames(display.signals) }))
  return lines.join('\n')
}

export function ensureAiStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    [${AI_TAG_ATTR}] {
      display: inline-flex;
      align-items: center;
      align-self: center;
      gap: 4px;
      flex-shrink: 0;
      font-size: 12px;
      line-height: 20px;
      font-weight: 600;
      white-space: nowrap;
    }
    .xf-ai-score {
      padding: 0 8px;
      border-radius: 9999px;
      cursor: help;
    }
    .xf-ai-tone-low { color: rgb(113, 118, 123); background: rgba(113, 118, 123, 0.12); }
    .xf-ai-tone-mid { color: rgb(196, 120, 0); background: rgba(255, 173, 31, 0.16); }
    .xf-ai-tone-high { color: rgb(224, 36, 94); background: rgba(244, 33, 46, 0.12); }
    .xf-ai-link {
      background: transparent;
      border: none;
      padding: 0 4px;
      color: rgb(113, 118, 123);
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
    .${AI_FOLD_CLASS} {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px;
      margin: 4px 0;
      border-radius: 12px;
      background: rgba(113, 118, 123, 0.08);
      border: 1px solid rgba(113, 118, 123, 0.2);
      color: inherit;
      font-size: 13px;
      line-height: 1.4;
      box-sizing: border-box;
    }
    .xf-ai-fold-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .xf-ai-fold-detail {
      font-size: 12px;
      color: rgb(113, 118, 123);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .xf-ai-fold-btn {
      background: transparent;
      border: 1px solid rgba(113, 118, 123, 0.35);
      color: inherit;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .xf-ai-fold-btn:hover { background: rgba(113, 118, 123, 0.12); }
    .xf-ai-fold-right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .xf-ai-labels {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    /* 高 20 像素：和 X 操作栏一样高，带标签的回复不会变高 */
    .xf-ai-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: 9999px;
      background: transparent;
      color: rgb(113, 118, 123);
      cursor: pointer;
    }
    .xf-ai-label:hover { background: rgba(113, 118, 123, 0.12); }
    .xf-ai-label[data-label="bot"][data-active="1"] { color: rgb(224, 36, 94); background: rgba(244, 33, 46, 0.12); }
    .xf-ai-label[data-label="human"][data-active="1"] { color: rgb(0, 150, 100); background: rgba(0, 186, 124, 0.14); }
    [data-xf-ai-error] {
      box-sizing: border-box; width: min(480px, calc(100vw - 32px));
      max-height: calc(100vh - 48px); overflow: auto; padding: 24px;
      border: 1px solid rgba(113, 118, 123, 0.35); border-radius: 16px;
      font: 14px/1.6 system-ui, sans-serif;
    }
    [data-xf-ai-error]::backdrop { background: rgba(0, 0, 0, 0.5); }
    [data-xf-ai-error] h2 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
    [data-xf-ai-error] p { margin: 0 0 16px; padding: 0; color: inherit; }
    [data-xf-ai-error] summary { cursor: pointer; }
    [data-xf-ai-error] pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; padding: 12px; background: rgba(113, 118, 123, 0.12); border-radius: 8px; }
    [data-xf-ai-error] .xf-ai-error-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
    [data-xf-ai-error] button { font: inherit; font-weight: 600; color: inherit; background: transparent; border: 1px solid rgba(113, 118, 123, 0.4); border-radius: 9999px; padding: 8px 16px; cursor: pointer; }
    [data-xf-ai-error] button:hover { background: rgba(113, 118, 123, 0.12); }
    [${AI_PILL_ATTR}] {
      position: absolute;
      top: 50%;
      right: 60px;
      transform: translateY(-50%);
      z-index: 2;
      max-width: 60%;
      padding: 4px 12px;
      border-radius: 9999px;
      border: 1px solid rgba(113, 118, 123, 0.3);
      background: transparent;
      color: rgb(113, 118, 123);
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    [${AI_PILL_ATTR}][data-busy="1"]::before {
      content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 6px;
      border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
      vertical-align: -1px; animation: xf-ai-progress-spin 0.8s linear infinite;
    }
    @keyframes xf-ai-progress-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { [${AI_PILL_ATTR}][data-busy="1"]::before { animation: none; } }
    [${AI_PILL_ATTR}][data-clickable="1"] { cursor: pointer; }
    [${AI_PILL_ATTR}][data-clickable="1"]:hover { background: rgba(113, 118, 123, 0.12); }
    [${AI_PILL_ATTR}][data-tone="warn"] { color: rgb(224, 36, 94); border-color: rgba(244, 33, 46, 0.35); }
  `
  document.head.appendChild(style)
}

function stop(e: Event) {
  e.stopPropagation()
  e.preventDefault()
}

/** 推文底部的操作栏（回复、转发、喜欢那一行） */
function actionGroup(article: HTMLElement): HTMLElement | null {
  return (
    Array.from(article.querySelectorAll<HTMLElement>('[role="group"]')).find(
      (group) => group.querySelector('[data-testid="reply"]') && group.querySelector('[data-testid="like"], [data-testid="unlike"]'),
    ) ?? null
  )
}

const ROBOT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/></svg>'
const PERSON_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6M15 11l2 2 4-4"/></svg>'

/** 标注按钮的回调放在元素上，元素重用时换成最新的（里面带着最新扫描到的回复内容） */
type LabelHandler = (label: ReplyLabel | null) => void

/**
 * 「机器人 / 真人」两个标注按钮：已标的那个高亮，再点一次撤销。
 * account 为 true：这条没单独标注，因为账号标过机器人而亮着「机器人」，撤销的是这个账号。
 */
function buildLabelButtons(owner: HTMLElement, current: ReplyLabel | undefined, account = false): HTMLElement {
  const box = document.createElement('span')
  box.className = 'xf-ai-labels'
  for (const label of ['bot', 'human'] as const) {
    const active = current === label
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'xf-ai-label'
    btn.setAttribute('data-label', label)
    btn.setAttribute('data-active', active ? '1' : '0')
    btn.setAttribute('aria-pressed', active ? 'true' : 'false')
    const title = active
      ? t(label === 'human' ? 'spamPage.aiMarkedHuman' : account ? 'spamPage.aiMarkedBotAccount' : 'spamPage.aiMarkedBot')
      : t(label === 'bot' ? 'spamPage.aiMarkBot' : 'spamPage.aiMarkHuman')
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.innerHTML = label === 'bot' ? ROBOT_ICON : PERSON_ICON
    btn.addEventListener('click', (e) => {
      stop(e)
      ;((owner as any).__xfLabel as LabelHandler | undefined)?.(active ? null : label)
    })
    box.appendChild(btn)
  }
  return box
}

export interface ScoreTagOptions {
  /** 用户的标注 */
  label?: ReplyLabel
  /** label 来自账号（账号标过机器人，这条没单独标注） */
  account?: boolean
  /** 点了标注按钮：传入新的标注，再点已标的那个传 null（撤销）。不传就没有标注按钮 */
  onLabel?: LabelHandler
  /** 这条本来该折叠、用户点了展开：标签后面加「收起」 */
  onCollapse?: () => void
}

/**
 * 分数标签：放在操作栏末尾。done 显示分数，pending 显示「判断中」；
 * 有 onLabel 时后面跟「机器人 / 真人」两个标注按钮（没有分数时只有这两个按钮）。
 * display 为 undefined 时移除。
 */
export function ensureScoreTag(article: HTMLElement, display: AiDisplay | undefined, options: ScoreTagOptions = {}) {
  const existing = article.querySelector<HTMLElement>(`[${AI_TAG_ATTR}]`)
  const showScore = display?.status === 'done' || display?.status === 'pending'
  if (!display || (!showScore && !options.onLabel)) {
    existing?.remove()
    return
  }
  const scoreKey = display.status === 'done'
    ? `done:${display.score}:${display.signals.join(',')}:${display.reason}`
    : showScore ? 'pending' : 'none'
  const key = `${scoreKey}|${options.onLabel ? `l:${options.label ?? ''}${options.account ? ':account' : ''}` : ''}|${options.onCollapse ? 'c' : ''}`
  if (existing?.getAttribute('data-key') === key) {
    ;(existing as any).__xfCollapse = options.onCollapse
    ;(existing as any).__xfLabel = options.onLabel
    return
  }
  const group = actionGroup(article)
  if (!group) return
  ensureAiStyles()
  existing?.remove()

  const tag = document.createElement('span')
  tag.setAttribute(AI_TAG_ATTR, '1')
  tag.setAttribute('data-key', key)
  tag.addEventListener('click', stop)
  ;(tag as any).__xfCollapse = options.onCollapse
  ;(tag as any).__xfLabel = options.onLabel

  if (showScore) {
    const score = document.createElement('span')
    if (display.status === 'done') {
      score.className = `xf-ai-score xf-ai-tone-${aiTone(display.score)}`
      score.textContent = t('spamPage.aiScore', { score: display.score })
      score.title = aiTitle(display)
    } else {
      score.className = 'xf-ai-score xf-ai-tone-low'
      score.textContent = t('spamPage.aiPending')
    }
    tag.appendChild(score)
  }

  if (options.onLabel) tag.appendChild(buildLabelButtons(tag, options.label, options.account))

  if (options.onCollapse) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'xf-ai-link'
    btn.textContent = t('spamPage.aiCollapse')
    btn.addEventListener('click', (e) => {
      stop(e)
      ;(tag as any).__xfCollapse?.()
    })
    tag.appendChild(btn)
  }
  group.appendChild(tag)
}

export interface FoldBarOptions {
  /** 模型结果；只因为标了「机器人」而折叠、还没有分数时不传 */
  display?: Extract<AiDisplay, { status: 'done' }>
  handle: string
  label?: ReplyLabel
  /** 因为账号标过机器人而折叠（这条没单独标注） */
  account?: boolean
  onExpand: () => void
  onLabel?: LabelHandler
}

/** 折叠条的状态，变了就要重画 */
export function foldBarKey(display: FoldBarOptions['display'], label: ReplyLabel | undefined, account = false): string {
  return `${display ? `${display.score}:${display.signals.join(',')}` : '-'}|${label ?? ''}${account ? ':account' : ''}`
}

/** 折叠条：显示分数、命中的信号和作者；右边是标注按钮和「展开」 */
export function buildFoldBar(options: FoldBarOptions): HTMLElement {
  const { display, handle, label } = options
  ensureAiStyles()
  const wrap = document.createElement('div')
  wrap.className = AI_FOLD_CLASS
  ;(wrap as any).__xfLabel = options.onLabel

  const left = document.createElement('div')
  left.className = 'xf-ai-fold-left'
  if (display) {
    const score = document.createElement('span')
    score.className = `xf-ai-score xf-ai-tone-${aiTone(display.score)}`
    score.textContent = t('spamPage.aiScore', { score: display.score })
    score.title = aiTitle(display)
    left.appendChild(score)
  }

  const detail = document.createElement('span')
  detail.className = 'xf-ai-fold-detail'
  const parts = [label === 'bot' ? t(options.account ? 'spamPage.aiFoldedByAccount' : 'spamPage.aiFoldedByLabel') : t('spamPage.aiFolded')]
  if (display?.signals.length) parts.push(aiSignalNames(display.signals))
  if (handle) parts.push(`@${handle}`)
  detail.textContent = parts.join(' · ')
  if (display) detail.title = aiTitle(display)
  left.appendChild(detail)
  wrap.appendChild(left)

  const right = document.createElement('div')
  right.className = 'xf-ai-fold-right'
  if (options.onLabel) right.appendChild(buildLabelButtons(wrap, label, options.account))
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'xf-ai-fold-btn'
  btn.textContent = t('spamPage.aiExpand')
  btn.addEventListener('click', (e) => {
    stop(e)
    options.onExpand()
  })
  right.appendChild(btn)
  wrap.appendChild(right)
  return wrap
}

export interface AiPillState {
  text: string
  title?: string
  error?: AiErrorDescription
  busy?: boolean
  tone?: 'normal' | 'warn'
  /** 有点击动作时为 true */
  clickable: boolean
}

/** 帖子页顶部「← 帖子」标题栏那一行；找不到时返回 null */
export function findHeaderRow(root: ParentNode = document): HTMLElement | null {
  const back = root.querySelector<HTMLElement>('[data-testid="primaryColumn"] [data-testid="app-bar-back"]')
  return back?.parentElement?.parentElement ?? null
}

/**
 * 按钮离标题栏右边多远：标题栏是「返回 | 标题 | 右侧空位」三格，按钮放在右侧空位的左边，
 * 免得 X 往空位里放东西时被盖住（1280 宽实测空位 56 像素宽，离右边 16 像素）
 */
function pillRight(row: HTMLElement, pill: HTMLElement): number {
  const cells = Array.from(row.children).filter((c) => c !== pill)
  if (cells.length < 3) return 16
  const gap = row.getBoundingClientRect().right - cells[cells.length - 1].getBoundingClientRect().left
  return Math.max(8, Math.round(gap + 4))
}

/** 标题栏按钮：state 为 null 时移除。onClick 每次更新都会换成最新的 */
export function ensureAiPill(row: HTMLElement | null, state: AiPillState | null, onClick: () => void) {
  const existing = document.querySelector<HTMLButtonElement>(`[${AI_PILL_ATTR}]`)
  const dialog = document.querySelector<HTMLDialogElement>('[data-xf-ai-error]')
  if (!row || !state?.error || dialog?.dataset.errorKey !== JSON.stringify(state.error)) dialog?.remove()
  if (!row || !state) {
    existing?.remove()
    return
  }
  ensureAiStyles()
  let pill = existing
  if (!pill || pill.parentElement !== row) {
    pill?.remove()
    pill = document.createElement('button')
    pill.type = 'button'
    pill.setAttribute(AI_PILL_ATTR, '1')
    pill.addEventListener('click', (e) => {
      stop(e)
      if (pill!.getAttribute('data-clickable') === '1') (pill as any).__xfClick?.()
    })
    if (getComputedStyle(row).position === 'static') row.style.position = 'relative'
    row.appendChild(pill)
  }
  ;(pill as any).__xfClick = state.error
    ? () => showAiError(state.error!, onClick, pill!)
    : onClick
  pill.style.right = `${pillRight(row, pill)}px`
  if (pill.textContent !== state.text) pill.textContent = state.text
  pill.title = state.title ?? state.text
  pill.setAttribute('data-clickable', state.clickable ? '1' : '0')
  pill.setAttribute('data-tone', state.tone ?? 'normal')
  pill.setAttribute('data-busy', state.busy ? '1' : '0')
  pill.setAttribute('aria-live', 'polite')
}

/** 清掉页面上所有 AI 标签和标题栏按钮（折叠条随隐藏状态由 applyAllow 清掉） */
export function removeAiBadges(root: ParentNode = document) {
  root.querySelectorAll(`[${AI_TAG_ATTR}]`).forEach((el) => el.remove())
  document.querySelector(`[${AI_PILL_ATTR}]`)?.remove()
  document.querySelector('[data-xf-ai-error]')?.remove()
}

/** Native dialog provides keyboard focus containment and Escape handling. */
function showAiError(error: AiErrorDescription, onAction: () => void, invoker: HTMLElement) {
  document.querySelector('[data-xf-ai-error]')?.remove()
  const dialog = document.createElement('dialog')
  dialog.className = 'xf-ai-error'
  dialog.setAttribute('data-xf-ai-error', '1')
  dialog.dataset.errorKey = JSON.stringify(error)
  dialog.setAttribute('aria-labelledby', 'xf-ai-error-title')
  dialog.setAttribute('aria-describedby', 'xf-ai-error-guidance')
  const dark = isDarkTheme()
  dialog.style.background = dark ? 'rgb(21, 32, 43)' : 'white'
  dialog.style.color = dark ? 'rgb(231, 233, 234)' : 'rgb(15, 20, 25)'
  const title = document.createElement('h2')
  title.id = 'xf-ai-error-title'
  title.textContent = error.summary
  const guidance = document.createElement('p')
  guidance.id = 'xf-ai-error-guidance'
  guidance.textContent = error.guidance
  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = t('aiError.details')
  const raw = document.createElement('pre')
  raw.textContent = error.detail
  details.append(summary, raw)
  const actions = document.createElement('div')
  actions.className = 'xf-ai-error-actions'
  const close = () => { dialog.remove(); if (invoker.isConnected) invoker.focus() }
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.textContent = t('aiError.close')
  closeButton.onclick = close
  const action = document.createElement('button')
  action.type = 'button'
  action.setAttribute('data-ai-action', error.action)
  action.textContent = t(`aiError.${error.action}`)
  action.onclick = () => { close(); onAction() }
  actions.append(closeButton, action)
  dialog.append(title, guidance, details, actions)
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close() })
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close() })
  document.body.appendChild(dialog)
  dialog.showModal()
}

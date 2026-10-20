// 回复区 AI 打分在 X 页面上的界面：分数标签、折叠条、标题栏按钮。
// 只负责画；什么时候显示、点了做什么由 scanner.ts 决定。
import { t, type MessageKey } from '../../shared/i18n'
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

/**
 * 分数标签：放在操作栏末尾。只有 done（显示分数）和 pending（判断中）才显示，其他状态移除。
 * onCollapse：这条本来该折叠、用户点了展开，标签后面加「收起」。
 */
export function ensureScoreTag(article: HTMLElement, display: AiDisplay | undefined, onCollapse?: () => void) {
  const existing = article.querySelector<HTMLElement>(`[${AI_TAG_ATTR}]`)
  if (!display || (display.status !== 'done' && display.status !== 'pending')) {
    existing?.remove()
    return
  }
  const key = display.status === 'done'
    ? `done:${display.score}:${display.signals.join(',')}:${onCollapse ? 'c' : ''}:${display.reason}`
    : 'pending'
  if (existing?.getAttribute('data-key') === key) {
    if (onCollapse) (existing as any).__xfCollapse = onCollapse
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

  if (onCollapse) {
    ;(tag as any).__xfCollapse = onCollapse
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

/** 折叠条：显示分数、命中的信号和作者，点「展开」显示原回复 */
export function buildFoldBar(display: Extract<AiDisplay, { status: 'done' }>, handle: string, onExpand: () => void): HTMLElement {
  ensureAiStyles()
  const wrap = document.createElement('div')
  wrap.className = AI_FOLD_CLASS

  const left = document.createElement('div')
  left.className = 'xf-ai-fold-left'
  const score = document.createElement('span')
  score.className = `xf-ai-score xf-ai-tone-${aiTone(display.score)}`
  score.textContent = t('spamPage.aiScore', { score: display.score })
  score.title = aiTitle(display)
  left.appendChild(score)

  const detail = document.createElement('span')
  detail.className = 'xf-ai-fold-detail'
  const parts = [t('spamPage.aiFolded')]
  if (display.signals.length) parts.push(aiSignalNames(display.signals))
  if (handle) parts.push(`@${handle}`)
  detail.textContent = parts.join(' · ')
  detail.title = aiTitle(display)
  left.appendChild(detail)
  wrap.appendChild(left)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'xf-ai-fold-btn'
  btn.textContent = t('spamPage.aiExpand')
  btn.addEventListener('click', (e) => {
    stop(e)
    onExpand()
  })
  wrap.appendChild(btn)
  return wrap
}

export interface AiPillState {
  text: string
  title?: string
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
  ;(pill as any).__xfClick = onClick
  pill.style.right = `${pillRight(row, pill)}px`
  if (pill.textContent !== state.text) pill.textContent = state.text
  pill.title = state.title ?? state.text
  pill.setAttribute('data-clickable', state.clickable ? '1' : '0')
  pill.setAttribute('data-tone', state.tone ?? 'normal')
}

/** 清掉页面上所有 AI 标签和标题栏按钮（折叠条随隐藏状态由 applyAllow 清掉） */
export function removeAiBadges(root: ParentNode = document) {
  root.querySelectorAll(`[${AI_TAG_ATTR}]`).forEach((el) => el.remove())
  document.querySelector(`[${AI_PILL_ATTR}]`)?.remove()
}

import type { SpamEvaluation } from '../../shared/spam-types'
import { formatRuleHit } from '../../shared/spam-types'
import { t } from '../../shared/i18n'
import { aiSignalNames } from './ai-badge'
import { errorText } from '../../shared/errors'
import type { AiDisplay } from './ai-scorer'
import {
  DEBUG_BAR_ID,
  DEBUG_BAR_VERSION,
  DEBUG_CONFIG_ATTR,
  DEBUG_POSITIONED_ATTR,
  SCROLL_STABILITY_STYLE_ID,
  XF_SELF_SELECTOR,
} from './dom-attrs'
import type { SpamConfig } from './types'

function aiKey(ai?: AiDisplay): string {
  if (!ai) return ''
  if (ai.status === 'done') return `done:${ai.score}:${ai.signals.join(',')}`
  if (ai.status === 'paused') return `paused:${ai.reason}:${errorText(ai.error)}`
  return ai.status
}

export function getDebugScoreKey(evaluation: SpamEvaluation, threshold: number, ai?: AiDisplay) {
  const wouldHide = evaluation.score >= threshold
  const key = `${evaluation.score}|${wouldHide}|${evaluation.hits.map((h) => h.id).join(',')}`
  return ai ? `${key}|${aiKey(ai)}` : key
}

/** 调试条上 AI 判断那一行的文字和颜色 */
export function describeAiDisplay(ai: AiDisplay): { text: string; color: string } {
  const muted = 'rgb(83,100,113)'
  switch (ai.status) {
    case 'done': {
      const color = ai.score >= 70 ? 'rgb(185,28,28)' : ai.score >= 31 ? 'rgb(161,98,7)' : muted
      const parts = [t('spamPage.aiScore', { score: ai.score })]
      if (ai.signals.length) parts.push(aiSignalNames(ai.signals))
      if (ai.reason) parts.push(ai.reason)
      return { text: parts.join(' · '), color }
    }
    case 'pending':
      return { text: t('spamPage.aiPending'), color: muted }
    case 'manual':
      return { text: t('spamPage.aiManual'), color: muted }
    case 'failed':
      return { text: t('spamPage.aiFailed'), color: 'rgb(185,28,28)' }
    case 'paused':
      return ai.reason === 'limit'
        ? { text: t('spamPage.aiLimit'), color: muted }
        : { text: t('spamPage.aiPaused', { error: errorText(ai.error, 'error.aiFailed') }), color: 'rgb(185,28,28)' }
  }
}

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function sortedValues(values: Set<string>) {
  return Array.from(values).sort().join('\u001f')
}

export function getDebugConfigKey(config: SpamConfig) {
  return hashString([
    config.threshold,
    config.keywords.join('\u001f'),
    sortedValues(config.enabledRules),
    sortedValues(config.whitelist),
    sortedValues(config.blacklist),
    config.ai ? `${config.ai.autoScope}:${config.ai.threshold}` : 'ai-off',
  ].join('\u001e'))
}

export function buildDebugBar(evaluation: SpamEvaluation, threshold: number, ai?: AiDisplay): HTMLElement {
  const wouldHide = evaluation.score >= threshold
  const scoreKey = getDebugScoreKey(evaluation, threshold, ai)

  const bgColor = wouldHide ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.10)'
  const borderColor = wouldHide ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.30)'
  const textColor = wouldHide ? 'rgb(185,28,28)' : 'rgb(22,101,52)'

  const bar = document.createElement('div')
  bar.id = DEBUG_BAR_ID
  bar.setAttribute('data-xf-spam-debug', '1')
  bar.setAttribute('data-xf-score-key', scoreKey)
  bar.setAttribute('data-xf-debug-version', DEBUG_BAR_VERSION)
  bar.style.cssText = [
    'position:absolute',
    'left:4px',
    'right:4px',
    'bottom:4px',
    'z-index:3',
    'box-sizing:border-box',
    'margin:0',
    'padding:4px 8px',
    'font-size:11px',
    'line-height:1.25',
    'border-radius:6px',
    `background:${bgColor}`,
    `color:${textColor}`,
    `border:1px solid ${borderColor}`,
    'display:flex',
    'flex-direction:column',
    'gap:1px',
    'pointer-events:none',
    'box-shadow:0 1px 6px rgba(0,0,0,0.12)',
    'backdrop-filter:saturate(180%) blur(6px)',
    'contain:layout style paint',
    // 有 AI 判断那一行时多留一行高度
    `max-height:${ai ? 58 : 42}px`,
    'overflow:hidden',
    'overflow-anchor:none',
  ].join(';')

  const firstRow = document.createElement('div')
  firstRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:700;flex-wrap:wrap;'
  const prediction = document.createElement('span')
  prediction.textContent = wouldHide ? `🚫 ${t('spamPage.wouldHide')}` : `✅ ${t('spamPage.pass')}`
  firstRow.appendChild(prediction)
  const sep = document.createElement('span')
  sep.style.cssText = 'font-weight:400;opacity:0.5;'
  sep.textContent = '·'
  firstRow.appendChild(sep)
  const head = document.createElement('span')
  head.style.fontWeight = '600'
  head.textContent = `oh-my-x · Spam Score ${evaluation.score} · ${evaluation.category}`
  firstRow.appendChild(head)
  bar.appendChild(firstRow)

  if (evaluation.hits.length) {
    const list = document.createElement('div')
    list.textContent = evaluation.hits.map((h) => `✓ ${formatRuleHit(h)}`).join(' · ')
    bar.appendChild(list)
  }

  if (ai) {
    const { text, color } = describeAiDisplay(ai)
    const row = document.createElement('div')
    row.setAttribute('data-xf-ai-row', '1')
    row.style.cssText = `color:${color};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
    row.textContent = text
    bar.appendChild(row)
  }

  return bar
}

function ensureDebugContainingBlock(article: HTMLElement) {
  if (getComputedStyle(article).position !== 'static') return
  article.style.position = 'relative'
  article.setAttribute(DEBUG_POSITIONED_ATTR, '1')
}

function restoreDebugContainingBlock(article: HTMLElement) {
  if (!article.hasAttribute(DEBUG_POSITIONED_ATTR)) return
  article.style.position = ''
  article.removeAttribute(DEBUG_POSITIONED_ATTR)
}

export function removeDebugBar(article: HTMLElement) {
  article.querySelector<HTMLElement>(`#${DEBUG_BAR_ID}`)?.remove()
  restoreDebugContainingBlock(article)
}

export function isInsideDialog(article: HTMLElement) {
  return Boolean(article.closest('[role="dialog"]'))
}

export function cleanupDebugBars() {
  document
    .querySelectorAll<HTMLElement>(`article[data-testid="tweet"] #${DEBUG_BAR_ID}`)
    .forEach((bar) => {
      const article = bar.closest<HTMLElement>('article[data-testid="tweet"]')
      bar.remove()
      if (article) restoreDebugContainingBlock(article)
    })
}

export function installScrollStabilityStyles() {
  if (document.getElementById(SCROLL_STABILITY_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SCROLL_STABILITY_STYLE_ID
  style.textContent = `
/*
 * Fix: scroll reversal in tweet detail / timelines.
 *
 * In normal (non-debug) mode the spam filter hides articles with
 * article.style.display = 'none'. When a hidden article sits ABOVE the current
 * viewport (i.e. spam the user already scrolled past), the browser's default
 * scroll anchoring (overflow-anchor: auto) "compensates" by moving scrollTop
 * backwards so the visible content stays put. That backward correction directly
 * opposes the user's scroll direction: scrolling down makes the page jump up,
 * scrolling up makes it jump down — the "opposite-direction auto-scroll" bug.
 *
 * Disabling scroll anchoring on the page scroll container (the viewport, i.e.
 * <html>) turns that reversal into a small same-direction nudge instead, which
 * no longer fights the user. This is only installed while the spam filter is
 * active and is removed again in stopSpamObserver() / cleanupAllSpamArtifacts(),
 * so X's native scroll anchoring is fully restored when filtering is turned off.
 */
html {
  overflow-anchor: none !important;
}

/* Keep ALL of the extension's own injected nodes from ever being selected as a
   scroll anchor — they get added/removed/moved on every scan and would otherwise
   cause the browser to jump/reverse-scroll when Twitter recycles the timeline. */
${XF_SELF_SELECTOR} {
  overflow-anchor: none !important;
}
`
  document.documentElement.appendChild(style)
}

export function removeScrollStabilityStyles() {
  document.getElementById(SCROLL_STABILITY_STYLE_ID)?.remove()
}

export function ensureBar(article: HTMLElement, evaluation: SpamEvaluation, config: SpamConfig, ai?: AiDisplay) {
  if (!config.debug) return
  if (isInsideDialog(article)) {
    removeDebugBar(article)
    return
  }

  const scoreKey = getDebugScoreKey(evaluation, config.threshold, ai)
  const configKey = getDebugConfigKey(config)
  const existing = article.querySelector<HTMLElement>(`#${DEBUG_BAR_ID}`)
  if (existing) {
    const isCurrent =
      existing.getAttribute('data-xf-score-key') === scoreKey &&
      existing.getAttribute('data-xf-debug-version') === DEBUG_BAR_VERSION &&
      existing.getAttribute(DEBUG_CONFIG_ATTR) === configKey
    if (isCurrent) return
    existing.remove()
  }

  ensureDebugContainingBlock(article)
  const bar = buildDebugBar(evaluation, config.threshold, ai)
  bar.setAttribute(DEBUG_CONFIG_ATTR, configKey)
  article.appendChild(bar)
}

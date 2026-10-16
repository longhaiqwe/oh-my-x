import type { SpamEvaluation } from '../../shared/spam-types'
import {
  DEBUG_BAR_ID,
  DEBUG_BAR_VERSION,
  DEBUG_CONFIG_ATTR,
  DEBUG_POSITIONED_ATTR,
  SCROLL_STABILITY_STYLE_ID,
  XF_SELF_SELECTOR,
} from './dom-attrs'
import type { SpamConfig } from './types'

export function getDebugScoreKey(evaluation: SpamEvaluation, threshold: number) {
  const wouldHide = evaluation.score >= threshold
  return `${evaluation.score}|${wouldHide}|${evaluation.hits.map((h) => h.id).join(',')}`
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
  ].join('\u001e'))
}

export function buildDebugBar(evaluation: SpamEvaluation, threshold: number): HTMLElement {
  const wouldHide = evaluation.score >= threshold
  const scoreKey = getDebugScoreKey(evaluation, threshold)

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
    'max-height:42px',
    'overflow:hidden',
    'overflow-anchor:none',
  ].join(';')

  const firstRow = document.createElement('div')
  firstRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:700;flex-wrap:wrap;'
  const prediction = document.createElement('span')
  prediction.textContent = wouldHide ? '🚫 会被隐藏' : '✅ 通过'
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
    list.textContent = evaluation.hits.map((h) => `✓ ${h.label}`).join(' · ')
    bar.appendChild(list)
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

export function ensureBar(article: HTMLElement, evaluation: SpamEvaluation, config: SpamConfig) {
  if (!config.debug) return
  if (isInsideDialog(article)) {
    removeDebugBar(article)
    return
  }

  const scoreKey = getDebugScoreKey(evaluation, config.threshold)
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
  const bar = buildDebugBar(evaluation, config.threshold)
  bar.setAttribute(DEBUG_CONFIG_ATTR, configKey)
  article.appendChild(bar)
}

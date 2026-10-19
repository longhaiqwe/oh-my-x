import type { SpamEvaluation } from '../../shared/spam-types'
import { formatRuleHit } from '../../shared/spam-types'
import { t } from '../../shared/i18n'

export function buildPlaceholder(evaluation: SpamEvaluation): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'x-focus-spam-placeholder'
  wrap.style.cssText = [
    'padding:8px 12px',
    'border-radius:8px',
    'background:rgba(239,68,68,0.08)',
    'border:1px solid rgba(239,68,68,0.25)',
    'display:flex',
    'flex-direction:column',
    'gap:6px',
    'font-size:13px',
  ].join(';')

  const line = document.createElement('div')
  line.style.cssText = 'color:rgb(185,28,28);font-weight:600;display:flex;align-items:center;gap:6px;'
  const icon = document.createElement('span')
  icon.textContent = '🚫'
  line.appendChild(icon)
  const text = document.createElement('span')
  text.textContent = t('spamPage.hiddenPlaceholder')
  line.appendChild(text)
  const score = document.createElement('span')
  score.style.cssText = 'margin-left:auto;font-size:11px;opacity:0.7;'
  score.textContent = `Score ${evaluation.score} · ${evaluation.category}`
  line.appendChild(score)
  wrap.appendChild(line)

  if (evaluation.hits.length) {
    const hits = document.createElement('div')
    hits.style.cssText = 'font-size:12px;color:rgb(113,118,123);'
    hits.textContent = evaluation.hits.map((h) => `✓ ${formatRuleHit(h)}`).join(' · ')
    wrap.appendChild(hits)
  }

  return wrap
}

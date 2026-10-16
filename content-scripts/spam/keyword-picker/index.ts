import { showListDropdown } from './list-dropdown'
import { showPickerPanel } from './picker-panel'

// ─── 状态 ──────────────────────────────────────────

const KW_BTN_ATTR = 'data-xf-kw-btn'
const LIST_BTN_ATTR = 'data-xf-list-btn'

// ─── 按钮注入 ──────────────────────────────────────

export function injectKeywordButton(article: HTMLElement) {
  if (article.getAttribute(KW_BTN_ATTR)) return

  const anchorBtn =
    article.querySelector<HTMLElement>('button[aria-label*="Grok" i]') ||
    article.querySelector<HTMLElement>('button[data-testid="caret"]') ||
    article.querySelector<HTMLElement>('button[aria-label="更多"]') ||
    article.querySelector<HTMLElement>('button[aria-label="More"]')
  if (!anchorBtn) return

  // ── 关键词选词按钮 ──
  const btn = document.createElement('button')
  btn.setAttribute(KW_BTN_ATTR, '1')
  btn.type = 'button'
  btn.title = '添加到垃圾词库'
  btn.ariaLabel = '添加到垃圾词库'
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h8q.425 0 .713.288T14 4t-.288.713T13 5H5v14h14v-8q0-.425.288-.712T20 10t.713.288T21 11v8q0 .825-.587 1.413T19 21zm4-4q-.425 0-.712-.288T8 16t.288-.712T9 15h6q.425 0 .713.288T16 16t-.288.713T15 17zm0-3q-.425 0-.712-.288T8 13t.288-.712T9 12h6q.425 0 .713.288T16 13t-.288.713T15 14zm0-3q-.425 0-.712-.288T8 10t.288-.712T9 9h6q.425 0 .713.288T16 10t-.288.713T15 11zm9-2q-.425 0-.712-.288T17 8V7h-1q-.425 0-.712-.288T15 6t.288-.712T16 5h1V4q0-.425.288-.712T18 3t.713.288T19 4v1h1q.425 0 .713.288T21 6t-.288.713T20 7h-1v1q0 .425-.288.713T18 9"/></svg>`
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'width:34px',
    'height:34px',
    'border:none',
    'border-radius:9999px',
    'background:transparent',
    'cursor:pointer',
    'color:rgb(113,118,123)',
    'transition:background 0.15s,color 0.15s',
    'outline:none',
    'padding:0',
  ].join(';')

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(29,155,240,0.1)'
    btn.style.color = 'rgb(29,155,240)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent'
    btn.style.color = 'rgb(113,118,123)'
  })

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    showPickerPanel(article)
  })

  anchorBtn.insertAdjacentElement('afterend', btn)

  // ── 白/黑名单快捷按钮 ──
  const listBtn = document.createElement('button')
  listBtn.setAttribute(LIST_BTN_ATTR, '1')
  listBtn.type = 'button'
  listBtn.title = '将用户加入白/黑名单'
  listBtn.ariaLabel = '将用户加入白/黑名单'
  listBtn.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="6" r="3"/><path d="M2 18c0-4 3-6 6-6"/><path d="M15 11v6M12 14h6"/></svg>`
  listBtn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'width:34px',
    'height:34px',
    'border:none',
    'border-radius:9999px',
    'background:transparent',
    'cursor:pointer',
    'color:rgb(113,118,123)',
    'transition:background 0.15s,color 0.15s',
    'outline:none',
    'padding:0',
    'position:relative',
  ].join(';')

  listBtn.addEventListener('mouseenter', () => {
    listBtn.style.background = 'rgba(120,86,255,0.1)'
    listBtn.style.color = 'rgb(120,86,255)'
  })
  listBtn.addEventListener('mouseleave', () => {
    listBtn.style.background = 'transparent'
    listBtn.style.color = 'rgb(113,118,123)'
  })

  listBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    void showListDropdown(article, listBtn)
  })

  btn.insertAdjacentElement('afterend', listBtn)

  article.setAttribute(KW_BTN_ATTR, '1')
}

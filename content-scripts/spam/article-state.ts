import { HIDDEN_BY_ATTR, PROCESSED_ATTR, SCORE_ATTR, STATE_ATTR } from './dom-attrs'

export function removeAllReplacements(article: HTMLElement) {
  let prev = article.previousElementSibling
  while (prev && prev.matches?.('[data-xf-spam-hidden-replacement]')) {
    const toRemove = prev
    prev = prev.previousElementSibling
    toRemove.remove()
  }
}

export function applyReplace(article: HTMLElement, placeholder: HTMLElement) {
  removeAllReplacements(article)
  article.style.display = 'none'
  const sibling = document.createElement('div')
  sibling.setAttribute('data-xf-spam-hidden-replacement', '1')
  sibling.style.cssText = 'margin:8px 12px;'
  sibling.appendChild(placeholder)
  article.parentElement?.insertBefore(sibling, article)
  article.setAttribute(STATE_ATTR, 'hidden')
}

export function applyHide(article: HTMLElement, placeholder: HTMLElement) {
  applyReplace(article, placeholder)
}

/** 隐藏 article，不生成任何占位/替换元素。非调试模式下使用。 */
export function applyHideDirect(article: HTMLElement) {
  removeAllReplacements(article)
  article.style.display = 'none'
  article.setAttribute(STATE_ATTR, 'hidden')
}

export function applyAllow(article: HTMLElement) {
  article.removeAttribute(STATE_ATTR)
  article.removeAttribute(HIDDEN_BY_ATTR)
  article.removeAttribute(SCORE_ATTR)
  article.querySelectorAll('.x-focus-spam-placeholder').forEach((el) => el.remove())
  removeAllReplacements(article)
  article.style.display = ''
  const textEl = article.querySelector<HTMLElement>('[data-testid="tweetText"]')
  if (textEl) textEl.style.display = ''
  const media = article.querySelector<HTMLElement>('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]')
  if (media) media.style.display = ''
}

export function resetArticleSpamState(article: HTMLElement) {
  article.removeAttribute(STATE_ATTR)
  article.removeAttribute(HIDDEN_BY_ATTR)
  article.removeAttribute(SCORE_ATTR)
  article.removeAttribute(PROCESSED_ATTR)
  article.style.display = ''
  const textEl = article.querySelector<HTMLElement>('[data-testid="tweetText"]')
  if (textEl) textEl.style.display = ''
  const media = article.querySelector<HTMLElement>('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="card.wrapper"]')
  if (media) media.style.display = ''
}

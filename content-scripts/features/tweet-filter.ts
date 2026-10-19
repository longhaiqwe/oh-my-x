import { getLocale, t } from '../../shared/i18n'
import { extractTweetInfo } from '../../shared/parse-tweet'
import {
  evaluateTweetFilter,
  normalizeForTweetFilter,
  parseTweetFilterKeywords,
  type TweetFilterAction,
} from '../../shared/tweet-filter-rules'
import {
  KeyTweetFilterAction,
  KeyTweetFilterEnabled,
  KeyTweetFilterKeywords,
  getDefaultTweetFilterKeywords,
} from '../../storage-keys'
import { getStorage } from '../utilities/storage'

export const TF_STATE_ATTR = 'data-xf-tf-state'
export const TF_FP_ATTR = 'data-xf-tf-fp'
export const TF_REPLACEMENT_ATTR = 'data-xf-tf-replacement'
export const TF_MATCHED_ATTR = 'data-xf-tf-matched'

export interface TweetFilterConfig {
  enabled: boolean
  action: TweetFilterAction
  keywords: string[]
  normalizedKeywords: string[]
}

let cachedConfig: TweetFilterConfig | null = null
let cachedAt = 0
const CONFIG_TTL = 5_000
let configVersion = 0

export function invalidateTweetFilterCache() {
  cachedConfig = null
  cachedAt = 0
  configVersion++
}

export async function getTweetFilterConfig(): Promise<TweetFilterConfig> {
  if (cachedConfig && Date.now() - cachedAt < CONFIG_TTL) {
    return cachedConfig
  }

  const values = await getStorage([
    KeyTweetFilterEnabled,
    KeyTweetFilterAction,
    KeyTweetFilterKeywords,
  ])

  const enabled = values[KeyTweetFilterEnabled] !== 'off'
  const action = (values[KeyTweetFilterAction] === 'hide' ? 'hide' : 'collapse') as TweetFilterAction
  const rawKeywords = values[KeyTweetFilterKeywords] !== undefined
    ? String(values[KeyTweetFilterKeywords])
    : getDefaultTweetFilterKeywords(getLocale()).join('\n')

  const keywords = parseTweetFilterKeywords(rawKeywords)
  const normalizedKeywords = keywords.map((kw) => normalizeForTweetFilter(kw))

  cachedConfig = {
    enabled,
    action,
    keywords,
    normalizedKeywords,
  }
  cachedAt = Date.now()
  return cachedConfig
}

export function ensureTweetFilterStyles() {
  if (document.getElementById('xf-tweet-filter-styles')) return
  const styleEl = document.createElement('style')
  styleEl.id = 'xf-tweet-filter-styles'
  styleEl.textContent = `
    .xf-tf-placeholder {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 16px;
      margin: 4px 0;
      border-radius: 12px;
      background: rgba(239, 68, 68, 0.06);
      border: 1px solid rgba(239, 68, 68, 0.18);
      color: inherit;
      font-size: 13px;
      line-height: 1.4;
      box-sizing: border-box;
      transition: background 0.15s ease;
    }
    .xf-tf-placeholder:hover {
      background: rgba(239, 68, 68, 0.09);
    }
    .xf-tf-placeholder-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .xf-tf-placeholder-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .xf-tf-placeholder-title {
      font-weight: 600;
      color: rgb(239, 68, 68);
      white-space: nowrap;
    }
    .xf-tf-placeholder-tag {
      font-size: 12px;
      opacity: 0.85;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .xf-tf-placeholder-btn {
      background: transparent;
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: inherit;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
      outline: none;
      flex-shrink: 0;
    }
    .xf-tf-placeholder-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.5);
    }
    .xf-tf-expanded-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 12px;
      margin-bottom: 4px;
      border-radius: 6px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px dashed rgba(245, 158, 11, 0.3);
      font-size: 11px;
      color: rgb(217, 119, 6);
    }
    .xf-tf-expanded-btn {
      background: transparent;
      border: none;
      color: inherit;
      text-decoration: underline;
      cursor: pointer;
      font-size: 11px;
      padding: 1px 4px;
    }
  `
  document.head.appendChild(styleEl)
}

function removeAllTweetFilterReplacements(article: HTMLElement) {
  let prev = article.previousElementSibling
  while (prev && prev.matches?.(`[${TF_REPLACEMENT_ATTR}]`)) {
    const toRemove = prev
    prev = prev.previousElementSibling
    toRemove.remove()
  }
}

export function buildTweetFilterPlaceholder(
  keyword: string,
  onExpand: () => void,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'xf-tf-placeholder'

  const left = document.createElement('div')
  left.className = 'xf-tf-placeholder-left'

  const icon = document.createElement('span')
  icon.className = 'xf-tf-placeholder-icon'
  icon.textContent = '🚫'
  left.appendChild(icon)

  const title = document.createElement('span')
  title.className = 'xf-tf-placeholder-title'
  title.textContent = t('tweetFilterPage.filtered')
  left.appendChild(title)

  const tag = document.createElement('span')
  tag.className = 'xf-tf-placeholder-tag'
  tag.textContent = `· ${t('tweetFilterPage.matched', { keyword })}`
  left.appendChild(tag)

  wrap.appendChild(left)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'xf-tf-placeholder-btn'
  btn.textContent = t('tweetFilterPage.show')
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onExpand()
  })
  wrap.appendChild(btn)

  return wrap
}

export function buildExpandedBar(
  keyword: string,
  onCollapse: () => void,
): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'xf-tf-expanded-bar'

  const msg = document.createElement('span')
  msg.textContent = `⚠️ ${t('tweetFilterPage.shownTemporarily', { keyword })}`
  bar.appendChild(msg)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'xf-tf-expanded-btn'
  btn.textContent = t('tweetFilterPage.collapseAgain')
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onCollapse()
  })
  bar.appendChild(btn)

  return bar
}

export function applyTweetCollapse(article: HTMLElement, keyword: string) {
  removeAllTweetFilterReplacements(article)
  article.style.display = 'none'
  article.setAttribute(TF_STATE_ATTR, 'collapsed')
  article.setAttribute(TF_MATCHED_ATTR, keyword)

  const replacement = document.createElement('div')
  replacement.setAttribute(TF_REPLACEMENT_ATTR, '1')

  const placeholder = buildTweetFilterPlaceholder(keyword, () => {
    // 展开查看推文
    article.style.display = ''
    article.setAttribute(TF_STATE_ATTR, 'expanded')
    replacement.innerHTML = ''
    const expBar = buildExpandedBar(keyword, () => {
      // 再次折叠
      applyTweetCollapse(article, keyword)
    })
    replacement.appendChild(expBar)
  })

  replacement.appendChild(placeholder)
  article.parentElement?.insertBefore(replacement, article)
}

export function applyTweetHide(article: HTMLElement, keyword: string) {
  removeAllTweetFilterReplacements(article)
  article.style.display = 'none'
  article.setAttribute(TF_STATE_ATTR, 'hidden')
  article.setAttribute(TF_MATCHED_ATTR, keyword)
}

export function applyTweetAllow(article: HTMLElement) {
  removeAllTweetFilterReplacements(article)
  article.style.display = ''
  article.removeAttribute(TF_STATE_ATTR)
  article.removeAttribute(TF_MATCHED_ATTR)
}

export function cleanupTweetFilter() {
  document.querySelectorAll<HTMLElement>(`[${TF_REPLACEMENT_ATTR}]`).forEach((el) => el.remove())
  document.querySelectorAll<HTMLElement>(`article[${TF_STATE_ATTR}]`).forEach((article) => {
    applyTweetAllow(article)
  })
}

export async function runTweetFilter(force = false) {
  const config = await getTweetFilterConfig()

  if (!config.enabled || config.keywords.length === 0) {
    cleanupTweetFilter()
    return
  }

  ensureTweetFilterStyles()

  const articles = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
  if (!articles.length) return

  for (const article of Array.from(articles)) {
    // 若已被评论过滤机制隐藏，优先尊重评论过滤
    if (article.getAttribute('data-xf-spam-state') === 'hidden') continue
    if (article.closest(`[${TF_REPLACEMENT_ATTR}]`)) continue

    // 指纹短路缓存（除非 force）
    if (!force) {
      const rawText = article.textContent || ''
      const preFp = `${rawText.length}:${rawText.slice(0, 16)}:${rawText.slice(-16)}:v${configVersion}`
      const currentState = article.getAttribute(TF_STATE_ATTR)
      if (article.getAttribute(TF_FP_ATTR) === preFp && currentState) {
        continue
      }
      article.setAttribute(TF_FP_ATTR, preFp)
    }

    const info = extractTweetInfo(document, article)
    if (!info || !info.text) continue

    const evalResult = evaluateTweetFilter({
      text: info.text,
      keywords: config.keywords,
      normalizedKeywords: config.normalizedKeywords,
    })

    if (evalResult.matched && evalResult.matchedKeyword) {
      // 保持当前已展开状态，避免用户展开后滚动重新被折叠
      if (article.getAttribute(TF_STATE_ATTR) === 'expanded') continue

      if (config.action === 'hide') {
        applyTweetHide(article, evalResult.matchedKeyword)
      } else {
        applyTweetCollapse(article, evalResult.matchedKeyword)
      }
    } else {
      // 未命中：若之前被推文过滤器标记，则恢复原状
      if (article.getAttribute(TF_STATE_ATTR)) {
        applyTweetAllow(article)
      }
    }
  }
}

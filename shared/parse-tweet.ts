// 从 X.com 推文 article 元素中解析出文本/昵称/handle
// 抽到这里是为了可单测：jsdom 加载 HTML 字符串后调用即可

import { isInsideQuotedTweet } from './detect-language'

export * from './detect-language'

export interface TweetInfo {
  element: HTMLElement
  text: string
  authorHandle: string
  authorName: string
}

const NAVIGATION_HANDLES = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'bookmarks',
  'profile',
  'i',
  'compose',
  'search',
  'settings',
])

/**
 * 收集元素的可见文本
 * X 把 emoji 渲染成 <img alt="🌸">，textContent 会漏掉，
 * 所以遍历时要把 img[alt] 也算进文本
 */
export function collectVisibleText(
  doc: Document,
  el: HTMLElement | null,
): string {
  if (!el) return ''
  // TreeWalker.nextNode() 直接返回根的第一个子节点，不会返回根本身。
  // 所以不需要"先 nextNode 一次跳过根"——那样会多跳过第一个子节点。
  // 原实现这里有 bug，导致 emoji 序列和文本的首字符被吞掉。
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_ALL, null)
  let result = ''
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement
      if (e.tagName === 'IMG') {
        result += e.getAttribute('alt') || ''
      }
    }
  }
  return result.replace(/\s+/g, ' ').trim()
}

// 推文永久链接：/handle/status/数字。只认相对地址，排除 /i/web/status 这类没有作者的地址
const STATUS_PATH_RE = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/

function permalinkOf(article: HTMLElement): { handle: string; id: string } | null {
  // 时间戳所在的链接是推文自己的地址；引用推文里也有时间戳，要跳过
  for (const time of Array.from(article.querySelectorAll('time'))) {
    if (isInsideQuotedTweet(time, article)) continue
    const m = time.closest('a[href*="/status/"]')?.getAttribute('href')?.match(STATUS_PATH_RE)
    if (m) return { handle: m[1], id: m[2] }
  }
  // 没有时间戳时（页面还没渲染完），取第一个不在引用推文里的 /status/ 链接
  for (const a of Array.from(article.querySelectorAll('a[href*="/status/"]'))) {
    if (isInsideQuotedTweet(a, article)) continue
    const m = a.getAttribute('href')?.match(STATUS_PATH_RE)
    if (m && !NAVIGATION_HANDLES.has(m[1].toLowerCase())) return { handle: m[1], id: m[2] }
  }
  return null
}

/** 推文 ID；取不到时返回 null */
export function extractTweetId(article: HTMLElement): string | null {
  return permalinkOf(article)?.id ?? null
}

/** 推文的发布时间（毫秒）；取不到时返回 null */
export function extractTweetTime(article: HTMLElement): number | null {
  for (const time of Array.from(article.querySelectorAll('time[datetime]'))) {
    if (isInsideQuotedTweet(time, article)) continue
    const ms = Date.parse(time.getAttribute('datetime') || '')
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

/** 推文作者的名字区域（[data-testid="User-Name"]），排除引用推文里的 */
export function extractAuthorNameElement(article: HTMLElement): HTMLElement | null {
  const all = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="User-Name"]'))
  return all.find((el) => !isInsideQuotedTweet(el, article)) || all[0] || null
}

/** 推文作者是否带认证标志（蓝 V）；取不到作者名区域时返回 null */
export function extractAuthorVerified(article: HTMLElement): boolean | null {
  const nameEl = extractAuthorNameElement(article)
  if (!nameEl) return null
  return Boolean(nameEl.querySelector('[data-testid="icon-verified"]'))
}

/**
 * 从推文 article 元素解析出 authorName/handle/text
 * 解析失败时返回 null（既没文本也没昵称）
 */
export function extractTweetInfo(
  doc: Document,
  article: HTMLElement,
): TweetInfo | null {
  // author handle: 直接在 article 内部查找 /handle 链接，避免全局查询导致拿到错误用户，并排除引用推文卡片内的链接
  const handleLinks = article.querySelectorAll<HTMLAnchorElement>(
    'a[href^="/"][role="link"]',
  )
  let handle = ''
  for (const a of Array.from(handleLinks)) {
    if (isInsideQuotedTweet(a, article)) continue
    const m = a
      .getAttribute('href')
      ?.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
    if (m && m[1] && !NAVIGATION_HANDLES.has(m[1].toLowerCase())) {
      handle = m[1]
      break
    }
  }

  // 获取主推文昵称（排除引用推文中的 User-Name）
  const authorName = collectVisibleText(doc, extractAuthorNameElement(article))

  // 支持普通 Tweet (`tweetText`) 以及 X 文章 Article (`twitter-article-title` / `longformRichTextComponent` / `twitterArticleRichTextView`)
  let text = ''
  const allTweetTexts = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))
  const textEl = allTweetTexts.find((el) => !isInsideQuotedTweet(el, article)) || allTweetTexts[0]
  if (textEl) {
    text = collectVisibleText(doc, textEl)
  } else {
    const titleEl = article.querySelector<HTMLElement>('[data-testid="twitter-article-title"]')
    const articleBodyEl =
      article.querySelector<HTMLElement>('[data-testid="twitterArticleRichTextView"]') ||
      article.querySelector<HTMLElement>('[data-testid="twitterArticleReadView"]')
    const titleText = collectVisibleText(doc, titleEl)
    const bodyText = collectVisibleText(doc, articleBodyEl)
    text = [titleText, bodyText].filter(Boolean).join('\n')
  }

  if (!text && !authorName) return null
  return { element: article, text, authorHandle: handle, authorName }
}

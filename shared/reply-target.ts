// 对话页里每条推文属于哪段对话、回的是哪条推文。
// X 把推文数据放在 React 组件的 props 里，只有页面自己的脚本（MAIN world）能读到：
// 拦截脚本读出来写到推文元素的属性上，扫描器（isolated world）从属性上读。
// 2026-10-22 在真实页面确认：推文数据里有 conversation_id_str、in_reply_to_status_id_str 和
// in_reply_to_screen_name，在推文元素往上第 13 层组件的 props 里；帖子页底部「发现更多」里的推文，
// 对话 ID 和主帖的不同。
import { extractTweetId } from './parse-tweet'

/** 属性写入时对应的推文 ID；X 把元素复用给别的推文时，据此认出属性已经过时 */
export const REPLY_OF_ATTR = 'data-xf-reply-of'
/** 推文所在对话的 ID（对话第一条推文的 ID） */
export const CONVERSATION_ATTR = 'data-xf-conversation'
/** 被回复推文的 ID；不是回复时为空 */
export const REPLY_TO_ATTR = 'data-xf-reply-to'
/** 被回复推文的作者用户名 */
export const REPLY_TO_USER_ATTR = 'data-xf-reply-to-user'
/** 属性写好后在推文元素上触发，冒泡到 window */
export const REPLY_TARGET_EVENT = 'xf-reply-target-updated'

export interface ReplyTarget {
  id: string
  author: string
}

/** 推文在对话里的位置 */
export interface TweetLink {
  conversationId: string
  /** 不是回复时为 null */
  replyTo: ReplyTarget | null
}

// 这些字段里不会有推文自己的数据，跳过能少翻很多对象
const SKIP_KEYS = new Set(['children', '_owner', 'entities', 'extended_entities', 'media', 'user', 'quoted_status', 'retweeted_status'])
const TWEET_ID_RE = /^\d+$/

/** 在 React props 里找 ID 为 tweetId 的推文，取它的对话 ID 和被回复推文；没找到时返回 undefined */
export function findTweetLink(obj: unknown, tweetId: string, depth = 0, seen = new WeakSet<object>()): TweetLink | undefined {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined
  if (typeof Node !== 'undefined' && obj instanceof Node) return undefined
  if (typeof Window !== 'undefined' && obj instanceof Window) return undefined
  if (seen.has(obj)) return undefined
  seen.add(obj)

  const record = obj as Record<string, any>
  // 两种写法：接口原样的 { rest_id, legacy: {...} }，和页面内部的 { id_str, conversation_id_str, ... }
  const tweet = record.rest_id === tweetId && record.legacy && typeof record.legacy === 'object'
    ? record.legacy
    : record.id_str === tweetId ? record : null
  if (tweet && typeof tweet.conversation_id_str === 'string') {
    const id = tweet.in_reply_to_status_id_str
    const replyTo = typeof id === 'string' && TWEET_ID_RE.test(id)
      ? { id, author: typeof tweet.in_reply_to_screen_name === 'string' ? tweet.in_reply_to_screen_name : '' }
      : null
    return { conversationId: TWEET_ID_RE.test(tweet.conversation_id_str) ? tweet.conversation_id_str : '', replyTo }
  }

  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object' || SKIP_KEYS.has(key)) continue
    const found = findTweetLink(value, tweetId, depth + 1, seen)
    if (found) return found
  }
  return undefined
}

/** 从推文元素对应的 React 组件往上找推文数据 */
export function tweetLinkFromFiber(article: Element, tweetId: string): TweetLink | undefined {
  try {
    const key = Object.keys(article).find((k) => k.startsWith('__reactFiber$'))
    let fiber = key ? (article as any)[key] : null
    for (let depth = 0; fiber && depth < 30; depth++) {
      const found = findTweetLink(fiber.memoizedProps, tweetId)
      if (found) return found
      fiber = fiber.return
    }
  } catch {
    // X 改了内部结构时读不到，当作没找到
  }
  return undefined
}

// 每个元素、每条推文只找一次：找不到的不会因为页面每次变化都再翻一遍
const attempted = new WeakMap<Element, string>()

/** 拦截脚本调用：给对话页上的推文写上对话 ID、被回复推文的 ID 和作者用户名 */
export function annotateReplyTargets(root: ParentNode = document) {
  const path = location.pathname
  if (!/\/status\/\d+/.test(path) && !/^\/i\/decks(\/|$)/.test(path)) return
  for (const article of Array.from(root.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))) {
    const id = extractTweetId(article)
    if (!id || article.getAttribute(REPLY_OF_ATTR) === id || attempted.get(article) === id) continue
    attempted.set(article, id)
    const link = tweetLinkFromFiber(article, id)
    if (!link) continue
    article.setAttribute(REPLY_OF_ATTR, id)
    article.setAttribute(CONVERSATION_ATTR, link.conversationId)
    article.setAttribute(REPLY_TO_ATTR, link.replyTo?.id ?? '')
    article.setAttribute(REPLY_TO_USER_ATTR, link.replyTo?.author ?? '')
    article.dispatchEvent(new CustomEvent(REPLY_TARGET_EVENT, { bubbles: true }))
  }
}

/**
 * 扫描器调用：这条推文回的推文。
 * 属性还没写、或写的是别的推文时返回 undefined；不是回复时返回 null。
 */
export function readReplyTarget(article: Element, tweetId: string): ReplyTarget | null | undefined {
  if (article.getAttribute(REPLY_OF_ATTR) !== tweetId) return undefined
  const id = article.getAttribute(REPLY_TO_ATTR) || ''
  return id ? { id, author: article.getAttribute(REPLY_TO_USER_ATTR) || '' } : null
}

/** 扫描器调用：这条推文所在对话的 ID；还不知道时返回空字符串 */
export function readConversationId(article: Element, tweetId: string): string {
  if (article.getAttribute(REPLY_OF_ATTR) !== tweetId) return ''
  return article.getAttribute(CONVERSATION_ATTR) || ''
}

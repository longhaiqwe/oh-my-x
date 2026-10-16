export interface OwnPost {
  id: string
  handle: string
  url: string
  text: string
  title: string
  thumbnailUrl?: string | null
  timestamp: number | null
}

export interface OwnPostsPage {
  posts: OwnPost[]
  cursor: string | null
  hasTimeline: boolean
  source?: 'timeline-search'
  scanned?: number
}

/** Only render X-hosted image URLs supplied by timeline responses. */
export function normalizeOwnPostThumbnail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && !url.username && !url.password && !url.port
      ? url.href : null
  } catch { return null }
}

function getThumbnail(tweet: any, article: any): string | null {
  const cover = normalizeOwnPostThumbnail(article?.cover_media?.media_info?.original_img_url)
  if (cover) return cover
  const media = tweet.legacy?.extended_entities?.media || tweet.legacy?.entities?.media
  if (!Array.isArray(media)) return null
  for (const item of media) {
    const url = normalizeOwnPostThumbnail(item?.media_url_https)
    if (url) return url
  }
  return null
}

export function getOwnHandle(): string | null {
  const link = document.querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]')
  if (!link) return null
  try { return new URL(link.href, location.origin).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1] || null }
  catch { return null }
}

export function extractOwnPostsPage(payload: unknown, handle: string): OwnPostsPage {
  const posts = new Map<string, OwnPost>()
  let cursor: string | null = null
  let hasTimeline = false
  function walk(node: any) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (Array.isArray(node.instructions)) hasTimeline = true
    if (node.cursorType === 'Bottom' && typeof node.value === 'string') cursor = node.value
    const result = node.tweet_results?.result || (node.__typename === 'Tweet' ? node : null)
    if (result) {
      const tweet = result.tweet || result
      const author = getTweetAuthorScreenName(tweet)
      const id = tweet.rest_id
      if (author?.toLowerCase() !== handle.toLowerCase() || !/^[A-Za-z0-9_]{1,15}$/.test(author || '') ||
          typeof id !== 'string' || !/^\d+$/.test(id) || tweet.legacy?.retweeted_status_result) return
      const article = tweet.article?.article_results?.result
      const text = tweet.note_tweet?.note_tweet_results?.result?.text || article?.preview_text || tweet.legacy?.full_text || ''
      const timestamp = Date.parse(tweet.legacy?.created_at)
      posts.set(id, {
        id, handle: author!, url: `https://x.com/${author}/status/${id}`,
        text: typeof text === 'string' ? text : '',
        title: typeof article?.title === 'string' ? article.title : '',
        thumbnailUrl: getThumbnail(tweet, article),
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
      })
      return // 引用内容不属于这条时间线
    }
    Object.values(node).forEach(walk)
  }
  walk(payload)
  return { posts: [...posts.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)), cursor, hasTimeline }
}

export function buildOwnPostsQuery(handle: string, query: string): string {
  const words = query.replace(/["\\]/g, ' ').trim().split(/\s+/).filter(Boolean)
  return [`from:${handle}`, ...words.map(word => `"${word}"`), '-filter:retweets'].join(' ')
}
import { getTweetAuthorScreenName } from './profile-activity-fetcher'

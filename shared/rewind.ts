// Visibility and extraction adapted from yetone/rewind-for-x (MIT). See THIRD_PARTY_NOTICES.md.
export const REWIND_MESSAGE = 'XF_REWIND'
export const REWIND_LIMIT = 3000
export const REWIND_BYTES = 20 * 1024 * 1024
export const REWIND_GAP = 10 * 60 * 1000
export const REWIND_OCR_ORIGINS = [
  'https://pbs.twimg.com/*',
  'https://cdn.jsdelivr.net/*',
]
export const REWIND_FILTERS = [
  'all',
  'image',
  'video',
  'quote',
  'repost',
] as const
export type RewindFilter = (typeof REWIND_FILTERS)[number]
export interface RewindMedia {
  src: string
  kind: 'image' | 'video' | 'link'
  text?: string
  language?: string
}
export interface RewindPost {
  id: string
  handle: string
  name: string
  avatar: string
  text: string
  quote: { name: string; text: string } | null
  media: RewindMedia[]
  context: string
  repost: boolean
  postedAt: string
  firstSeenAt: number
}
export interface RewindState {
  account: string
  generation: number
  posts: RewindPost[]
}
export interface RewindQuery {
  query?: string
  filter?: RewindFilter
  offset?: number
  limit?: number
  ocr?: boolean
}
export interface RewindResult {
  posts: RewindPost[]
  total: number
  count: number
  generation: number
}
export type RewindOcrState = {
  phase: 'off' | 'download' | 'working' | 'ready' | 'error'
  progress?: number
  left?: number
}

export function rewindVisible(height: number, shown: number, viewport: number) {
  return (
    height > 0 &&
    viewport > 0 &&
    shown >= Math.min(height * 0.5, viewport * 0.4)
  )
}
export function normalizeRewind(text: string) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .replace(
      /(?<=[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef])\s+|\s+(?=[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef])/g,
      '',
    )
    .trim()
}
export function safeRewindImage(value: unknown): string {
  try {
    const url = new URL(String(value))
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'pbs.twimg.com' ||
      url.username ||
      url.password ||
      url.port
    )
      return ''
    if (
      !/^\/(media|profile_images|profile_banners|card_img|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(
        url.pathname,
      )
    )
      return ''
    return url.href.slice(0, 2048)
  } catch {
    return ''
  }
}
const short = (value: unknown, length: number) =>
  typeof value === 'string' ? value.slice(0, length) : ''
export function sanitizeRewindPost(
  value: unknown,
  now = Date.now(),
): RewindPost | null {
  if (!value || typeof value !== 'object') return null
  const p = value as RewindPost
  if (
    typeof p.id !== 'string' ||
    typeof p.handle !== 'string' ||
    !/^\d{1,30}$/.test(p.id) ||
    !/^[\w]{1,15}$/.test(p.handle)
  )
    return null
  return {
    id: p.id,
    handle: p.handle,
    name: short(p.name, 100),
    avatar: safeRewindImage(p.avatar),
    text: short(p.text, 16000),
    quote:
      p.quote && typeof p.quote === 'object'
        ? { name: short(p.quote.name, 100), text: short(p.quote.text, 4000) }
        : null,
    media: (Array.isArray(p.media) ? p.media : []).slice(0, 4).flatMap((m) => {
      const src = safeRewindImage(m?.src)
      return src
        ? [
            {
              src,
              kind:
                m.kind === 'video'
                  ? ('video' as const)
                  : m.kind === 'link'
                    ? ('link' as const)
                    : ('image' as const),
            },
          ]
        : []
    }),
    context: short(p.context, 200),
    repost: p.repost === true,
    postedAt: short(p.postedAt, 40),
    firstSeenAt: Number.isFinite(p.firstSeenAt)
      ? Math.min(now, Math.max(now - 60_000, p.firstSeenAt))
      : now,
  }
}
export function mergeRewind(
  previous: RewindPost,
  next: RewindPost,
): RewindPost {
  return {
    ...previous,
    name: previous.name || next.name,
    avatar: previous.avatar || next.avatar,
    text: next.text.length > previous.text.length ? next.text : previous.text,
    quote: previous.quote || next.quote,
    context: previous.context || next.context,
    repost: previous.repost || next.repost,
    postedAt: previous.postedAt || next.postedAt,
    media:
      next.media.length > previous.media.length
        ? next.media.map(
            (m) => previous.media.find((p) => p.src === m.src) || m,
          )
        : previous.media,
  }
}
export function trimRewind(posts: RewindPost[]): RewindPost[] {
  let bytes = 0
  return posts
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt)
    .slice(0, REWIND_LIMIT)
    .filter((post) => {
      bytes += JSON.stringify(post).length * 2
      return bytes <= REWIND_BYTES
    })
}
export function queryRewind(
  state: RewindState,
  query: RewindQuery,
): RewindResult {
  const needle = normalizeRewind(String(query.query || '').slice(0, 500))
  const matches = state.posts.filter((p) => {
    if (query.filter === 'image' || query.filter === 'video') {
      if (!p.media.some((m) => m.kind === query.filter)) return false
    }
    if (query.filter === 'quote' && !p.quote) return false
    if (query.filter === 'repost' && !p.repost) return false
    return (
      !needle ||
      normalizeRewind(
        [
          p.name,
          p.handle,
          p.text,
          p.context,
          p.quote?.name,
          p.quote?.text,
          ...(query.ocr ? p.media.map((m) => m.text || '') : []),
        ].join('\n'),
      ).includes(needle)
    )
  })
  const offset = Math.max(
    0,
    Math.min(REWIND_LIMIT, Math.floor(Number(query.offset) || 0)),
  )
  const limit = Math.max(
    1,
    Math.min(100, Math.floor(Number(query.limit) || 40)),
  )
  return {
    posts: matches.slice(offset, offset + limit),
    total: matches.length,
    count: state.posts.length,
    generation: state.generation,
  }
}

function originalText(element: Element | null): string {
  if (!element) return ''
  const clone = element.cloneNode(true) as Element
  clone
    .querySelectorAll('[class*="immersive-translate-target"],.xf-rewind-panel')
    .forEach((n) => n.remove())
  clone
    .querySelectorAll('img')
    .forEach((n) => n.replaceWith(n.getAttribute('alt') || ''))
  clone.querySelectorAll('br').forEach((n) => n.replaceWith('\n'))
  return clone.textContent?.trim() || ''
}
export function extractRewindPost(
  article: HTMLElement,
  now = Date.now(),
): RewindPost | null {
  if (
    article.querySelector(
      '[data-testid="placementTracking"], [data-testid="promotedIndicator"]',
    ) ||
    article.closest('[data-testid="placementTracking"]') ||
    ['hidden', 'collapsed'].includes(
      article.getAttribute('data-xf-tf-state') || '',
    ) ||
    article.getAttribute('data-xf-spam-state') === 'hidden'
  )
    return null
  const inQuote = (e: Element) => {
    const q = e.closest('div[role="link"]')
    return !!q && article.contains(q)
  }
  const own = (selector: string) =>
    [...article.querySelectorAll(selector)].find((e) => !inQuote(e)) || null
  const time = own('a[href*="/status/"] time')
  const match = time
    ?.closest('a')
    ?.getAttribute('href')
    ?.match(/^\/([\w]{1,15})\/status\/(\d+)/)
  if (!match) return null
  const name = own('[data-testid="User-Name"]')
  const quote = [...article.querySelectorAll('[data-testid="tweetText"]')].find(
    inQuote,
  )
  const quoteName = [
    ...article.querySelectorAll('[data-testid="User-Name"]'),
  ].find(inQuote)
  const context = own('[data-testid="socialContext"]')
  const media: RewindMedia[] = []
  for (const element of article.querySelectorAll<
    HTMLImageElement | HTMLVideoElement
  >(
    '[data-testid="tweetPhoto"] img,[data-testid="videoPlayer"] video[poster],[data-testid="card.wrapper"] img',
  )) {
    if (inQuote(element)) continue
    const src =
      element instanceof HTMLVideoElement
        ? element.poster
        : element.currentSrc || element.src
    if (media.some((m) => m.src === src)) continue
    media.push({
      src,
      kind: element.closest('[data-testid="videoPlayer"]')
        ? 'video'
        : element.closest('[data-testid="card.wrapper"]')
          ? 'link'
          : 'image',
    })
  }
  return sanitizeRewindPost(
    {
      id: match[2],
      handle: match[1],
      name: originalText(name?.firstElementChild || name),
      avatar:
        own('[data-testid="Tweet-User-Avatar"] img')?.getAttribute('src') || '',
      text: originalText(own('[data-testid="tweetText"]')),
      quote: quote
        ? {
            name: originalText(
              quoteName?.firstElementChild || quoteName || null,
            ),
            text: originalText(quote),
          }
        : null,
      context: originalText(context),
      repost:
        !!context &&
        (!!context.querySelector('[data-testid="retweet"]') ||
          /\b(reposted|retweeted)\b|转帖|转推|轉推|轉發/.test(
            originalText(context),
          )),
      media,
      postedAt: time?.getAttribute('datetime') || '',
      firstSeenAt: now,
    },
    now,
  )
}

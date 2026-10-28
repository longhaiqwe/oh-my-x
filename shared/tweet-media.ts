import { dig, isTargetTweet, tweetAuthor, tweetRestId, unwrapTweet } from './graphql-tweet'

export interface TweetMediaItem {
  id: string
  type: 'photo' | 'video' | 'animated_gif'
  url: string
  origUrl: string
  bestMp4Url?: string
  width?: number
  height?: number
  bitrate?: number
}

export interface ExtractedTweetMedia {
  tweetId: string
  authorHandle: string
  photos: TweetMediaItem[]
  videos: TweetMediaItem[]
  gifs: TweetMediaItem[]
}

/**
 * 将推文图片链接转换为最高清晰度的原图链接 (name=orig)
 */
export function toOriginalImageUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  try {
    const url = new URL(rawUrl)
    if (url.hostname.includes('twimg.com')) {
      url.searchParams.set('name', 'orig')
      return url.toString()
    }
    return rawUrl
  } catch {
    if (rawUrl.includes('twimg.com')) {
      if (rawUrl.includes('name=')) {
        return rawUrl.replace(/name=[a-zA-Z0-9_]+/, 'name=orig')
      }
      const sep = rawUrl.includes('?') ? '&' : '?'
      return `${rawUrl}${sep}name=orig`
    }
    return rawUrl
  }
}

/** 响应里有 data.tweetResult.result 时取它，否则把整个响应当推文节点 */
function findTweetNode(root: any): any {
  return unwrapTweet(dig(root, 'data', 'tweetResult', 'result') || root)
}

/** 优先 extended_entities.media，其次 entities.media */
function tweetMediaList(legacy: any): any[] {
  const extended = dig(legacy, 'extended_entities', 'media')
  if (Array.isArray(extended)) return extended
  const entities = dig(legacy, 'entities', 'media')
  return Array.isArray(entities) ? entities : []
}

function isMp4Variant(v: any): boolean {
  return Boolean(v) && (v.content_type === 'video/mp4' || String(v.url || '').includes('.mp4'))
}

/** MP4 格式里码率最高的视频流 */
function bestMp4Variant(media: any): any {
  const variants = dig(media, 'video_info', 'variants')
  if (!Array.isArray(variants)) return undefined
  return variants
    .filter(isMp4Variant)
    .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0]
}

function toPhotoItem(media: any, id: string, url: string): TweetMediaItem {
  return {
    id,
    type: 'photo',
    url,
    origUrl: toOriginalImageUrl(url),
    width: dig(media, 'original_info', 'width'),
    height: dig(media, 'original_info', 'height'),
  }
}

function toVideoItem(media: any, id: string, url: string, type: 'video' | 'animated_gif'): TweetMediaItem {
  const bestMp4 = bestMp4Variant(media)
  return {
    id,
    type,
    url,
    origUrl: toOriginalImageUrl(url),
    bestMp4Url: bestMp4?.url ? String(bestMp4.url) : undefined,
    bitrate: bestMp4?.bitrate ? Number(bestMp4.bitrate) : undefined,
  }
}

/** 按类型分成照片、视频、GIF；其他类型跳过 */
function groupMedia(mediaList: any[]): Pick<ExtractedTweetMedia, 'photos' | 'videos' | 'gifs'> {
  const photos: TweetMediaItem[] = []
  const videos: TweetMediaItem[] = []
  const gifs: TweetMediaItem[] = []
  for (const m of mediaList) {
    const id = String(m.id_str || m.id || '')
    const url = String(m.media_url_https || m.media_url || '')
    if (m.type === 'photo') photos.push(toPhotoItem(m, id, url))
    else if (m.type === 'video') videos.push(toVideoItem(m, id, url, 'video'))
    else if (m.type === 'animated_gif') gifs.push(toVideoItem(m, id, url, 'animated_gif'))
  }
  return { photos, videos, gifs }
}

/**
 * 从 X GraphQL 响应对象中解析媒体资源 (照片、视频最高码率直链、GIF 直链)
 */
export function extractTweetMediaFromGraphql(
  payload: unknown,
  targetTweetId?: string,
): ExtractedTweetMedia | null {
  if (!payload || typeof payload !== 'object') return null
  const tweet = findTweetNode(payload)
  if (!tweet || typeof tweet !== 'object') return null

  const legacy = tweet.legacy || {}
  if (!isTargetTweet(tweet, legacy, targetTweetId)) return null

  return {
    tweetId: tweetRestId(tweet, legacy) || targetTweetId || '',
    authorHandle: String(tweetAuthor(tweet).authorHandle).trim(),
    ...groupMedia(tweetMediaList(legacy)),
  }
}

export interface DomTweetInfo {
  tweetId: string | null
  authorHandle: string | null
  hasVideo: boolean
  hasGif: boolean
  photos: Array<{ url: string; origUrl: string }>
}

const STATUS_PATH = /\/([^/]+)\/status\/(\d+)/
const VIDEO_SELECTOR = 'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'
const GIF_SELECTOR = 'button[aria-label*="GIF"], div[aria-label*="GIF"], [aria-label*="Play this GIF"]'

interface StatusRef {
  handle: string
  id: string
}

function matchStatus(path: string): StatusRef | null {
  const match = path.match(STATUS_PATH)
  return match ? { handle: match[1], id: match[2] } : null
}

/** 推文内第一个带数字 ID 的 status 链接 */
function statusFromLinks(tweetElement: HTMLElement): StatusRef | null {
  const links = Array.from(tweetElement.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'))
  for (const link of links) {
    const status = matchStatus(link.getAttribute('href') || '')
    if (status) return status
  }
  return null
}

/** 推文详情页兜底：当前页面地址 */
function statusFromPageUrl(href: string): StatusRef | null {
  if (!href) return null
  try {
    return matchStatus(new URL(href).pathname)
  } catch {
    return null
  }
}

function handleFromUserName(tweetElement: HTMLElement): string | null {
  const text = tweetElement.querySelector('[data-testid="User-Name"]')?.textContent || ''
  return text.match(/@([a-zA-Z0-9_]+)/)?.[1] ?? null
}

/** 所有配图，同一地址只取一次，排除头像和 emoji */
function domPhotos(tweetElement: HTMLElement): DomTweetInfo['photos'] {
  const images = Array.from(tweetElement.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com/media/"]'))
  const photos: DomTweetInfo['photos'] = []
  const seenUrls = new Set<string>()
  for (const img of images) {
    const src = img.currentSrc || img.src || ''
    if (!src || seenUrls.has(src)) continue
    if (src.includes('profile_images') || src.includes('emoji')) continue
    seenUrls.add(src)
    photos.push({ url: src, origUrl: toOriginalImageUrl(src) })
  }
  return photos
}

/**
 * 从页面中的推文 DOM 节点提取媒体状态、推文 ID 及作者 Handle。
 * ID 和 handle 依次取推文内 status 链接、当前页面地址；handle 最后取 User-Name 里的 @
 */
export function extractTweetInfoFromDom(
  tweetElement: HTMLElement,
  currentHref = typeof window !== 'undefined' ? window.location.href : '',
): DomTweetInfo {
  const status = statusFromLinks(tweetElement) ?? statusFromPageUrl(currentHref)
  return {
    tweetId: status?.id ?? null,
    authorHandle: status?.handle ?? handleFromUserName(tweetElement),
    hasVideo: Boolean(tweetElement.querySelector(VIDEO_SELECTOR)),
    hasGif: Boolean(tweetElement.querySelector(GIF_SELECTOR)),
    photos: domPhotos(tweetElement),
  }
}

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

/**
 * 从 X GraphQL 响应对象中解析媒体资源 (照片、视频最高码率直链、GIF 直链)
 */
export function extractTweetMediaFromGraphql(
  payload: unknown,
  targetTweetId?: string,
): ExtractedTweetMedia | null {
  if (!payload || typeof payload !== 'object') return null

  const unwrapTweet = (node: any): any => {
    if (!node || typeof node !== 'object') return null
    if (node.__typename === 'TweetWithVisibilityResults' && node.tweet) {
      return node.tweet
    }
    return node
  }

  const findTweetNode = (root: any): any => {
    if (!root || typeof root !== 'object') return null
    if (root.data?.tweetResult?.result) {
      return unwrapTweet(root.data.tweetResult.result)
    }
    return unwrapTweet(root)
  }

  const tweet = findTweetNode(payload)
  if (!tweet || typeof tweet !== 'object') return null

  const legacy = tweet.legacy || {}
  const restId = String(tweet.rest_id || legacy.id_str || '')
  if (targetTweetId && restId && restId !== targetTweetId) return null

  const userResult = tweet.core?.user_results?.result
  const userLegacy = userResult?.legacy || {}
  const userCore = userResult?.core || {}
  const authorHandle = String(userCore.screen_name || userLegacy.screen_name || '').trim()

  const mediaList: any[] = Array.isArray(legacy.extended_entities?.media)
    ? legacy.extended_entities.media
    : Array.isArray(legacy.entities?.media)
      ? legacy.entities.media
      : []

  const photos: TweetMediaItem[] = []
  const videos: TweetMediaItem[] = []
  const gifs: TweetMediaItem[] = []

  for (const m of mediaList) {
    const id = String(m.id_str || m.id || '')
    const type = m.type as 'photo' | 'video' | 'animated_gif'
    const rawUrl = String(m.media_url_https || m.media_url || '')
    const origUrl = toOriginalImageUrl(rawUrl)

    if (type === 'photo') {
      photos.push({
        id,
        type: 'photo',
        url: rawUrl,
        origUrl,
        width: m.original_info?.width,
        height: m.original_info?.height,
      })
      continue
    }

    if (type === 'video' || type === 'animated_gif') {
      const variants: any[] = Array.isArray(m.video_info?.variants) ? m.video_info.variants : []
      // 筛选 MP4 格式并且码率最高的视频流
      const mp4Variants = variants
        .filter((v) => v && (v.content_type === 'video/mp4' || String(v.url || '').includes('.mp4')))
        .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))

      const bestMp4 = mp4Variants[0]
      const bestMp4Url = bestMp4?.url ? String(bestMp4.url) : undefined
      const item: TweetMediaItem = {
        id,
        type,
        url: rawUrl,
        origUrl,
        bestMp4Url,
        bitrate: bestMp4?.bitrate ? Number(bestMp4.bitrate) : undefined,
      }

      if (type === 'animated_gif') {
        gifs.push(item)
      } else {
        videos.push(item)
      }
    }
  }

  return {
    tweetId: restId || targetTweetId || '',
    authorHandle,
    photos,
    videos,
    gifs,
  }
}

export interface DomTweetInfo {
  tweetId: string | null
  authorHandle: string | null
  hasVideo: boolean
  hasGif: boolean
  photos: Array<{ url: string; origUrl: string }>
}

/**
 * 从页面中的推文 DOM 节点提取媒体状态、推文 ID 及作者 Handle
 */
export function extractTweetInfoFromDom(
  tweetElement: HTMLElement,
  currentHref = typeof window !== 'undefined' ? window.location.href : '',
): DomTweetInfo {
  let tweetId: string | null = null
  let authorHandle: string | null = null

  // 1. 尝试从推文内 status 链接提取
  const statusLinks = Array.from(tweetElement.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'))
  for (const link of statusLinks) {
    const href = link.getAttribute('href') || ''
    const match = href.match(/\/([^/]+)\/status\/(\d+)/)
    if (match) {
      if (!authorHandle) authorHandle = match[1]
      if (!tweetId) tweetId = match[2]
      break
    }
  }

  // 2. 推文详情页兜底：如果推文内无内部 status 链接，且当前页面处于推文详情页，则取页面 URL
  if (!tweetId && currentHref) {
    try {
      const pageUrl = new URL(currentHref)
      const pageMatch = pageUrl.pathname.match(/\/([^/]+)\/status\/(\d+)/)
      if (pageMatch) {
        authorHandle = authorHandle || pageMatch[1]
        tweetId = pageMatch[2]
      }
    } catch {
      // ignore
    }
  }

  // 3. 提取作者 Handle（若尚未拿到）
  if (!authorHandle) {
    const userHandleEl = tweetElement.querySelector('[data-testid="User-Name"]')
    if (userHandleEl) {
      const text = userHandleEl.textContent || ''
      const handleMatch = text.match(/@([a-zA-Z0-9_]+)/)
      if (handleMatch) authorHandle = handleMatch[1]
    }
  }

  // 4. 判定是否存在视频
  const hasVideoTag = Boolean(tweetElement.querySelector('video'))
  const hasVideoPlayer = Boolean(
    tweetElement.querySelector('[data-testid="videoPlayer"]') ||
    tweetElement.querySelector('[data-testid="videoComponent"]')
  )
  const hasGifBtn = Boolean(
    tweetElement.querySelector('button[aria-label*="GIF"], div[aria-label*="GIF"], [aria-label*="Play this GIF"]')
  )

  const hasVideo = hasVideoTag || hasVideoPlayer
  const hasGif = hasGifBtn

  // 5. 提取所有配图
  const imgElements = Array.from(
    tweetElement.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com/media/"]')
  )

  const photos: Array<{ url: string; origUrl: string }> = []
  const seenUrls = new Set<string>()

  for (const img of imgElements) {
    const src = img.currentSrc || img.src || ''
    if (!src || seenUrls.has(src)) continue
    // 排除头像或 emoji
    if (src.includes('profile_images') || src.includes('emoji')) continue

    seenUrls.add(src)
    photos.push({
      url: src,
      origUrl: toOriginalImageUrl(src),
    })
  }

  return {
    tweetId,
    authorHandle,
    hasVideo,
    hasGif,
    photos,
  }
}

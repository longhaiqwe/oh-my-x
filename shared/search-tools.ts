// 搜索：新搜索默认打开「最新」、搜索结果页筛选条共用的地址和搜索词处理。
// 页面拦截器也引用这里（navigateSearchPage），所以不能引入 shared/i18n。
// 筛选按 X 的搜索语法写进搜索词，2026-10-23 在 X 网页实测：within_time:24h / 7d / 30d、min_faves:N、
// -filter:replies、filter:images / videos / media 都生效；「最新」标签是 f=live，只看关注的人是 pf=on。
// 不做语言筛选：X 把长文帖（正文只有链接）的语言记为 zxx，lang:zh 会排除中文长文；
// (lang:zh OR lang:zxx) 只认最后一个 lang:，-lang:en 返回 0 条，用搜索语法拼不出「中文帖 + 中文长文」。

export const SEARCH_TIME_OPTIONS = ['24h', '7d', '30d'] as const
export const SEARCH_LIKES_OPTIONS = [10, 100, 1000] as const
export const SEARCH_MEDIA_OPTIONS = ['images', 'videos', 'media'] as const

export interface SearchFilters {
  /** within_time 的值，如 7d */
  time: string | null
  /** min_faves 的值 */
  minLikes: number | null
  /** -filter:replies */
  originalOnly: boolean
  /** filter: 后面的 images / videos / media */
  media: string | null
}

export const EMPTY_SEARCH_FILTERS: Readonly<SearchFilters> = Object.freeze({
  time: null,
  minLikes: null,
  originalOnly: false,
  media: null,
})

export interface SearchLocation {
  /** 搜索词；话题标签页是「#标签」 */
  query: string
  /** 结果标签：null 是「热门」，live 是「最新」，还有 user / media / list */
  tab: string | null
  /** pf=on：只看关注的人 */
  following: boolean
  /** 话题标签页（/hashtag/标签） */
  hashtag: boolean
}

const TIME_TOKEN = /^within_time:(\d+[smhd])$/i
const LIKES_TOKEN = /^min_faves:(\d+)$/i
const ORIGINAL_TOKEN = /^-filter:replies$/i
const MEDIA_TOKEN = /^filter:(images|videos|media)$/i
// 引号里的短语算一个词，里面的空格和语法原样保留
const QUERY_TOKEN = /"[^"]*"?|\S+/g

/** 把搜索词拆成「筛选条管的语法」和其余部分；其余部分按原顺序拼回，词之间留一个空格 */
export function splitSearchQuery(query: string): { terms: string; filters: SearchFilters } {
  const filters: SearchFilters = { ...EMPTY_SEARCH_FILTERS }
  const rest: string[] = []
  for (const token of query.match(QUERY_TOKEN) ?? []) {
    let match: RegExpExecArray | null
    if ((match = TIME_TOKEN.exec(token))) filters.time = match[1].toLowerCase()
    else if ((match = LIKES_TOKEN.exec(token))) filters.minLikes = Number(match[1])
    else if (ORIGINAL_TOKEN.test(token)) filters.originalOnly = true
    else if ((match = MEDIA_TOKEN.exec(token))) filters.media = match[1].toLowerCase()
    else rest.push(token)
  }
  return { terms: rest.join(' '), filters }
}

/** 其余部分 + 筛选语法，按固定顺序拼成搜索词 */
export function buildSearchQuery(terms: string, filters: SearchFilters): string {
  const parts = [terms.trim()]
  if (filters.time) parts.push(`within_time:${filters.time}`)
  if (filters.minLikes) parts.push(`min_faves:${filters.minLikes}`)
  if (filters.originalOnly) parts.push('-filter:replies')
  if (filters.media) parts.push(`filter:${filters.media}`)
  return parts.filter(Boolean).join(' ')
}

export function hasSearchFilters(filters: SearchFilters): boolean {
  return Boolean(filters.time || filters.minLikes || filters.originalOnly || filters.media)
}

function toUrl(href: string): URL | null {
  try {
    return new URL(href, 'https://x.com')
  } catch {
    return null
  }
}

/** 搜索结果页和话题标签页返回搜索信息，其他页面返回 null */
export function parseSearchLocation(href: string): SearchLocation | null {
  const url = toUrl(href)
  if (!url) return null
  let query: string
  let hashtag = false
  if (url.pathname === '/search') {
    query = url.searchParams.get('q')?.trim() ?? ''
  } else {
    const match = /^\/hashtag\/([^/]+)\/?$/.exec(url.pathname)
    if (!match) return null
    try {
      query = `#${decodeURIComponent(match[1])}`
    } catch {
      return null
    }
    hashtag = true
  }
  if (!query) return null
  return {
    query,
    tab: url.searchParams.get('f') || null,
    following: url.searchParams.get('pf') === 'on',
    hashtag,
  }
}

// 空格写成 %20：X 自己的搜索地址也是这样，不用 URLSearchParams 默认的 +
function formatParams(params: URLSearchParams): string {
  return [...params].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
}

/** 停在「热门」的搜索地址加上 f=live；已经选了标签、或不是搜索页时返回 null */
export function latestSearchHref(href: string): string | null {
  const page = parseSearchLocation(href)
  const url = toUrl(href)
  if (!page || page.tab || !url) return null
  url.searchParams.set('f', 'live')
  return `${url.pathname}?${formatParams(url.searchParams)}`
}

/**
 * 筛选条改了条件后的地址：搜索词换成 query，保留当前标签和其他参数。
 * 话题标签页换成搜索页，搜索词里带上「#标签」。
 */
export function filteredSearchHref(href: string, query: string, following: boolean): string | null {
  const page = parseSearchLocation(href)
  const url = toUrl(href)
  if (!page || !url || !query.trim()) return null
  const params = page.hashtag ? new URLSearchParams() : new URLSearchParams(url.searchParams)
  params.set('q', query.trim())
  if (page.hashtag && page.tab) params.set('f', page.tab)
  if (following) params.set('pf', 'on')
  else params.delete('pf')
  return `/search?${formatParams(params)}`
}

/**
 * 决定搜索页要不要换成「最新」。每次地址变化调用 next()：停在「热门」时返回「最新」的地址。
 * 用户自己点了「热门」标签、或在「热门」里用筛选条改了条件时调用 keepTop()，这个搜索词之后保持「热门」。
 */
export function createSearchLatestTracker() {
  const keptTop = new Set<string>()
  return {
    keepTop(query: string) {
      keptTop.add(query)
    },
    next(href: string): string | null {
      const page = parseSearchLocation(href)
      if (!page || page.tab || keptTop.has(page.query)) return null
      return latestSearchHref(href)
    },
  }
}

/**
 * 在 X 页面里（MAIN world）换地址并通知 X 的路由，和站内点链接一样不重新加载页面。
 * X 的路由历史记录格式是 { key, state }（2026-10-23 实测）。只接受同源的搜索页地址。
 */
export function navigateSearchPage(href: unknown, replace: boolean): boolean {
  if (typeof href !== 'string' || href.length > 4096) return false
  let url: URL
  try {
    url = new URL(href, window.location.origin)
  } catch {
    return false
  }
  if (url.origin !== window.location.origin || !parseSearchLocation(url.href)) return false
  const state = replace
    ? window.history.state
    : { key: Math.random().toString(36).slice(2, 8), state: undefined }
  if (replace) window.history.replaceState(state, '', url.pathname + url.search)
  else window.history.pushState(state, '', url.pathname + url.search)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
  return true
}

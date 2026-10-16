import { buildOwnPostsQuery, extractOwnPostsPage, getOwnHandle, type OwnPostsPage } from './own-posts'

export interface OwnPostsRequest { handle: string; query: string; cursor?: string }
export interface OwnPostsDependencies {
  fetch: typeof fetch
  resolveQueryId: (operation: string) => Promise<string | null>
  getHeaders: (operation: string) => Record<string, string>
  getFeatures: (operation: string) => Record<string, unknown>
}

export function createOwnPostsFetcher(deps: OwnPostsDependencies) {
  const cooldowns = new Map<string, number>()
  let searchUnavailable = false
  return async function load(request: OwnPostsRequest): Promise<OwnPostsPage> {
    const { handle, query, cursor } = request
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || getOwnHandle()?.toLowerCase() !== handle.toLowerCase()) {
      throw new Error('当前账号已变化，请关闭选择器后重新打开')
    }
    const csrf = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1]
    const twid = document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1] || ''
    const userId = decodeURIComponent(twid).replace(/"/g, '').match(/^u=(\d+)$/)?.[1]
    if (!csrf || !userId) throw new Error('无法读取登录账号，请刷新 X 后重试')
    const timelineSearch = Boolean(query.trim() && (searchUnavailable || cursor?.startsWith('xf-timeline:')))
    const operation = query.trim() && !timelineSearch ? 'SearchTimeline' : 'UserTweets'
    if ((cooldowns.get(operation) || 0) > Date.now()) throw new Error('请求过于频繁，请稍后重试')
    const qid = await deps.resolveQueryId(operation)
    if (!qid) {
      if (operation === 'SearchTimeline') { searchUnavailable = true; return load({ ...request, cursor: undefined }) }
      throw new Error('暂时无法识别 X 的帖子接口，请刷新 X 后重试')
    }
    const variables: Record<string, unknown> = operation === 'SearchTimeline'
      ? { rawQuery: buildOwnPostsQuery(handle, query), count: 20, querySource: 'typed_query', product: 'Latest' }
      : { userId, count: timelineSearch ? 100 : 20, includePromotedContent: false, withVoice: true, withV2Timeline: true }
    const pageCursor = timelineSearch ? cursor?.replace(/^xf-timeline:/, '') : cursor
    if (pageCursor) variables.cursor = pageCursor
    const params = `variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(deps.getFeatures(operation)))}`
    const captured = deps.getHeaders(operation)
    // Match the existing timeline reader's session headers; none cross the page bridge.
    const headers: Record<string, string> = {
      authorization: captured.authorization || 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'x-csrf-token': csrf, 'x-twitter-active-user': 'yes', 'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': captured['x-twitter-client-language'] || 'zh-cn',
      'content-type': 'application/json',
      ...captured,
    }
    headers['x-csrf-token'] = csrf
    const response = await deps.fetch(`${location.origin}/i/api/graphql/${qid}/${operation}?${params}`, {
      method: 'GET', credentials: 'include', headers, signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 429) {
      const reset = Number(response.headers.get('x-rate-limit-reset')) * 1000
      const retry = Number(response.headers.get('retry-after')) * 1000
      cooldowns.set(operation, Math.max(Date.now() + (retry || 60_000), reset || 0))
      throw new Error('请求过于频繁，请稍后重试')
    }
    if (!response.ok) {
      if (operation === 'SearchTimeline' && [400, 404].includes(response.status)) {
        searchUnavailable = true
        return load({ ...request, cursor: undefined })
      }
      throw new Error(`读取失败（${response.status}），请稍后重试`)
    }
    const payload = await response.json()
    const page = extractOwnPostsPage(payload, handle)
    if (!page.hasTimeline) throw new Error('X 未返回可读取的帖子列表，请刷新 X 后重试')
    if (getOwnHandle()?.toLowerCase() !== handle.toLowerCase()) throw new Error('当前账号已变化，请重新打开选择器')
    if (timelineSearch) {
      page.source = 'timeline-search'
      page.scanned = page.posts.length
      const words = query.trim().toLocaleLowerCase().split(/\s+/)
      page.posts = page.posts.filter(post => words.every(word => `${post.title}\n${post.text}`.toLocaleLowerCase().includes(word)))
      if (page.cursor) page.cursor = `xf-timeline:${page.cursor}`
    }
    return page
  }
}

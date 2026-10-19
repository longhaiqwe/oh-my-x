import { CodedError } from './coded-error'
import { extractScheduledItems, type ExtractedScheduledItem } from './scheduled-interceptor'

/** X 读取排期列表的 GraphQL 操作名 */
export const SCHEDULED_OPERATION = 'FetchScheduledTweets'

/** X 自己请求排期列表时用的参数；拿不到时用这一组 */
export const DEFAULT_SCHEDULED_SEARCH = `variables=${encodeURIComponent(JSON.stringify({ ascending: true }))}`

const PUBLIC_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

/** X 页面自己发出的排期列表请求：接口编号 + 查询参数（不含 ?） */
export interface CapturedScheduledRequest {
  queryId: string
  search: string
}

export interface ScheduledFetchDependencies {
  fetch: typeof fetch
  resolveQueryId: (operation: string) => Promise<string | null>
  getHeaders: () => Record<string, string>
  getCapturedRequest: () => CapturedScheduledRequest | null
  /** 接口编号失效（400/404）时清掉记下的编号，下次重新找 */
  forgetCapturedRequest: () => void
}

/** 新建/修改/删除定时帖的接口；成功后需要重新读一次排期列表 */
export function isScheduledMutationUrl(url: string): boolean {
  if (!url) return false
  return /\/graphql\/[A-Za-z0-9_-]+\/(?:create|edit|delete)scheduledtweet(?:$|[/?])/i.test(url)
}

/** 从 X 的排期列表请求地址里取出接口编号和参数；不是排期列表请求时返回 null */
export function parseScheduledRequestUrl(url: string, base = 'https://x.com'): CapturedScheduledRequest | null {
  try {
    const parsed = new URL(url, base)
    const match = parsed.pathname.match(/\/graphql\/([A-Za-z0-9_-]+)\/FetchScheduledTweets$/)
    if (!match) return null
    return { queryId: match[1], search: parsed.search.replace(/^\?/, '') || DEFAULT_SCHEDULED_SEARCH }
  } catch {
    return null
  }
}

/**
 * 主动读取当前账号的排期列表（在 MAIN world 里用页面自己的登录状态请求）。
 * 同一时间只发一个请求；被限流后到解除前不再请求。
 */
export function createScheduledFetcher(deps: ScheduledFetchDependencies) {
  let cooldownUntil = 0
  let inFlight: Promise<ExtractedScheduledItem[]> | null = null

  async function run(): Promise<ExtractedScheduledItem[]> {
    if (cooldownUntil > Date.now()) throw new CodedError('error.tooFrequent')
    const csrf = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1]
    if (!csrf) throw new CodedError('error.notSignedInReload')

    const captured = deps.getCapturedRequest()
    const queryId = captured?.queryId || await deps.resolveQueryId(SCHEDULED_OPERATION)
    if (!queryId) throw new CodedError('error.scheduleEndpointMissing')
    const search = captured?.search || DEFAULT_SCHEDULED_SEARCH

    const sessionHeaders = deps.getHeaders()
    const headers: Record<string, string> = {
      authorization: sessionHeaders.authorization || PUBLIC_BEARER,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': sessionHeaders['x-twitter-client-language'] || 'zh-cn',
      'content-type': 'application/json',
      ...sessionHeaders,
    }
    headers['x-csrf-token'] = csrf

    const response = await deps.fetch(`${location.origin}/i/api/graphql/${queryId}/${SCHEDULED_OPERATION}?${search}`, {
      method: 'GET',
      credentials: 'include',
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 429) {
      const reset = Number(response.headers.get('x-rate-limit-reset')) * 1000
      const retry = Number(response.headers.get('retry-after')) * 1000
      cooldownUntil = Math.max(Date.now() + (retry || 60_000), reset || 0)
      throw new CodedError('error.tooFrequent')
    }
    if (!response.ok) {
      if (response.status === 400 || response.status === 404) deps.forgetCapturedRequest()
      throw new CodedError('error.readHttp', { status: response.status })
    }
    const items = extractScheduledItems(await response.json())
    if (!items) throw new CodedError('error.scheduleListMissing')
    return items
  }

  return function load(): Promise<ExtractedScheduledItem[]> {
    if (!inFlight) inFlight = run().finally(() => { inFlight = null })
    return inFlight
  }
}

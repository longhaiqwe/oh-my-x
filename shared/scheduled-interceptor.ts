/**
 * 排期推文拦截器核心纯逻辑（供 MAIN world 拦截器与单测复用）
 */

/**
 * 安全提取 fetch / XHR 入参的目标 URL
 * 支持 string、URL 实例、Request 对象及各类畸形输入，保证绝不抛出异常
 */
export function getRequestUrl(input: unknown): string {
  try {
    if (typeof input === 'string') return input
    if (typeof URL !== 'undefined' && input instanceof URL) return input.href
    if (input && typeof input === 'object' && 'url' in input) {
      return String((input as Request).url)
    }
  } catch {
    // 静默忽略畸形对象访问异常
  }
  return ''
}

/**
 * URL 命中判断（大小写不敏感，避免漏接 X 改动 operation 名大小写）
 * 仅匹配明确与排期推文相关的接口，99.99% 的页面普通请求在此快速排除
 */
export function isScheduledUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    lower.includes('fetchscheduledtweets') ||
    lower.includes('scheduledtweets') ||
    (lower.includes('/graphql/') && lower.includes('scheduled'))
  )
}

// ---------- 排期数据提取 ----------
export type RawScheduledItem = {
  rest_id?: string
  restId?: string
  scheduling_info?: { execute_at?: number; state?: string }
  schedulingInfo?: { execute_at?: number; state?: string }
  execute_at?: number
  tweet_create_request?: { status?: string }
  tweetCreateRequest?: { status?: string }
  status?: string
}

export interface ExtractedScheduledItem {
  restId: string
  timestamp: number
  text: string
}

/**
 * 从 GraphQL 响应中提取排期列表。
 * 先试官方路径 data.viewer.scheduled_tweet_list，再试常见变体，
 * 最后做一次有节点上限的深度兜底查找，避免 X 改字段路径后完全失效。
 */
export function extractScheduledItems(data: unknown): ExtractedScheduledItem[] | null {
  if (!data || typeof data !== 'object') return null

  const root = data as Record<string, any>
  const candidates: unknown[] = [
    root?.data?.viewer?.scheduled_tweet_list,
    root?.data?.viewer_v2?.scheduled_tweet_list,
    root?.data?.scheduled_tweet_list,
  ]
  let list: unknown = candidates.find((c) => Array.isArray(c)) ?? null

  if (!Array.isArray(list)) {
    // 深度兜底：任意层级找 scheduled_tweet_list / scheduledTweetList 数组（限制遍历节点数）
    const found: unknown[] = []
    const seen = new Set<unknown>()
    let budget = 5000
    const walk = (node: unknown) => {
      if (budget <= 0 || !node || typeof node !== 'object' || seen.has(node)) return
      seen.add(node)
      budget--
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      const obj = node as Record<string, unknown>
      for (const [k, v] of Object.entries(obj)) {
        if ((k === 'scheduled_tweet_list' || k === 'scheduledTweetList') && Array.isArray(v)) {
          found.push(...v)
        }
        walk(v)
      }
    }
    walk(data)
    list = found.length > 0 ? found : null
  }

  if (!Array.isArray(list)) return null

  const items = (list as RawScheduledItem[])
    .filter(
      (item) =>
        item?.scheduling_info?.state === 'Scheduled' || item?.schedulingInfo?.state === 'Scheduled',
    )
    .map((item) => ({
      restId: item.rest_id ?? item.restId ?? '',
      timestamp:
        item.scheduling_info?.execute_at ?? item.schedulingInfo?.execute_at ?? item.execute_at ?? 0,
      text: item.tweet_create_request?.status ?? item.tweetCreateRequest?.status ?? item.status ?? '',
    }))
    .filter(
      (item) => typeof item.timestamp === 'number' && !isNaN(item.timestamp) && item.timestamp > 0,
    )

  return items
}

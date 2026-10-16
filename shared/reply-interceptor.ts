/**
 * CreateTweet 请求与响应解析工具。
 * 用于拦截和捕获用户在 X 上发送回复的目标推文/评论 ID。
 */

export function isCreateTweetUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  const lower = url.toLowerCase()
  return (
    lower.includes('createtweet') ||
    lower.includes('createnotetweet') ||
    lower.includes('create_tweet') ||
    lower.includes('create_note_tweet')
  )
}

/**
 * 递归深度搜索对象中是否存在 in_reply_to 相关的推文 ID
 */
function findInReplyToIdInObj(obj: any, depth = 0, seen = new WeakSet()): string | null {
  if (!obj || depth > 8 || typeof obj !== 'object') return null
  if (seen.has(obj)) return null
  seen.add(obj)

  if (typeof obj.in_reply_to_tweet_id === 'string' && obj.in_reply_to_tweet_id.trim()) {
    return obj.in_reply_to_tweet_id.trim()
  }
  if (typeof obj.in_reply_to_status_id_str === 'string' && obj.in_reply_to_status_id_str.trim()) {
    return obj.in_reply_to_status_id_str.trim()
  }
  if (typeof obj.in_reply_to_status_id === 'string' && obj.in_reply_to_status_id.trim()) {
    return obj.in_reply_to_status_id.trim()
  }

  for (const [k, val] of Object.entries(obj)) {
    if (!val || typeof val !== 'object') continue
    if (k === 'core' || k === 'entities' || k === 'media' || k === 'user_mentions') continue
    const found = findInReplyToIdInObj(val, depth + 1, seen)
    if (found) return found
  }
  return null
}

/**
 * 从 CreateTweet 的请求体或响应体中提取被回复的推文/评论 ID (snowflake ID)
 */
export function extractInReplyToTweetId(
  requestBody: unknown,
  responseData?: unknown,
): string | null {
  // 1. 优先尝试从 requestBody (GraphQL variables) 中解析
  if (requestBody) {
    try {
      let body = requestBody
      if (typeof body === 'string') {
        body = JSON.parse(body)
      }
      if (body && typeof body === 'object') {
        const reply = (body as any)?.variables?.reply
        const id = reply?.in_reply_to_tweet_id || reply?.in_reply_to_status_id
        if (typeof id === 'string' && id.trim()) {
          return id.trim()
        }
        const found = findInReplyToIdInObj(body)
        if (found) return found
      }
    } catch {
      // ignore JSON parse error
    }
  }

  // 2. 尝试从 responseData 中解析
  if (responseData && typeof responseData === 'object') {
    try {
      const data = responseData as any
      const createTweet = data?.data?.create_tweet || data?.create_tweet
      const result = createTweet?.tweet_results?.result || createTweet?.result
      const legacy = result?.legacy
      if (
        legacy &&
        typeof legacy.in_reply_to_status_id_str === 'string' &&
        legacy.in_reply_to_status_id_str.trim()
      ) {
        return legacy.in_reply_to_status_id_str.trim()
      }
      const found = findInReplyToIdInObj(responseData)
      if (found) return found
    } catch {
      // ignore
    }
  }

  return null
}

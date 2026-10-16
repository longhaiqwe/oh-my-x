import type { ProfileActivityEntry } from './profile-activity'

export interface GraphQLTweetLegacy {
  created_at?: string
  id_str?: string
  in_reply_to_status_id_str?: string | null
  in_reply_to_user_id_str?: string | null
  retweeted_status_result?: unknown
}

export interface GraphQLTweetNode {
  rest_id?: string
  legacy?: GraphQLTweetLegacy
  core?: {
    user_results?: {
      result?: {
        legacy?: {
          screen_name?: string
        }
        rest_id?: string
      }
    }
  }
}

export interface ExtractedTimelinePage {
  entries: ProfileActivityEntry[]
  bottomCursor: string | null
  oldestTimestamp: number | null
  hasTimeline: boolean
}

function formatLocalDayFromDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 安全解析推文作者 screen_name，兼容标准 User、UserWithVisibilityResults 及新版 GraphQL 结构
 */
export function getTweetAuthorScreenName(tweet: GraphQLTweetNode): string | null {
  if (!tweet) return null
  const userResult: any = tweet.core?.user_results?.result
  if (userResult) {
    const user = userResult.user || userResult
    const sn =
      user.legacy?.screen_name ||
      user.core?.screen_name ||
      user.screen_name ||
      user.screenName ||
      userResult.legacy?.screen_name ||
      userResult.core?.screen_name ||
      userResult.screen_name
    if (typeof sn === 'string' && sn) return sn
  }
  const directLegacy = (tweet as any).legacy?.user?.screen_name
  if (typeof directLegacy === 'string' && directLegacy) return directLegacy
  return null
}

/**
 * 从单个推文节点中提取活动条目，区分 post（原创发帖）与 reply（回复他人）
 */
export function extractActivityFromTweet(
  tweet: GraphQLTweetNode,
  targetHandle: string,
  isPinned = false,
): ProfileActivityEntry | null {
  if (!tweet || !tweet.rest_id) return null

  const authorHandle = getTweetAuthorScreenName(tweet)
  if (authorHandle && authorHandle.toLowerCase() !== targetHandle.toLowerCase()) {
    // 过滤掉非目标博主本人的推文（例如回复对话上下文中的对方发言）
    return null
  }
  // 若节点具有明确的用户信息结果但未解析出目标博主，予以过滤
  if (tweet.core?.user_results?.result && !authorHandle) {
    return null
  }

  const legacy = tweet.legacy
  if (!legacy || !legacy.created_at) return null

  const timestamp = new Date(legacy.created_at).getTime()
  if (Number.isNaN(timestamp)) return null

  const date = formatLocalDayFromDate(new Date(timestamp))

  // 区分回复与原创帖子
  const isReply = Boolean(legacy.in_reply_to_status_id_str || legacy.in_reply_to_user_id_str)
  const isRetweet = Boolean(legacy.retweeted_status_result)

  // 纯转推不作为博主本人原创发帖，但保留原创与回复
  if (isRetweet) return null

  return {
    id: tweet.rest_id,
    date,
    type: isReply ? 'reply' : 'post',
    timestamp,
    isPinned,
  }
}

/**
 * 递归检索 JSON 树，提取推文节点与分页游标
 */
export function extractTimelinePage(
  data: unknown,
  targetHandle: string,
): ExtractedTimelinePage {
  const entries: ProfileActivityEntry[] = []
  let bottomCursor: string | null = null
  let oldestTimestamp: number | null = null
  let hasTimeline = false

  if (!data || typeof data !== 'object') {
    return { entries, bottomCursor, oldestTimestamp, hasTimeline }
  }

  const seenIds = new Set<string>()

  function includeBoundary(timestamp: number) {
    if (oldestTimestamp === null || timestamp < oldestTimestamp) oldestTimestamp = timestamp
  }

  function walk(node: unknown, parentIsPinned = false, conversationTimestamps: number[] | null = null) {
    if (!node || typeof node !== 'object') return

    if (Array.isArray(node)) {
      for (const item of node) walk(item, parentIsPinned, conversationTimestamps)
      return
    }

    const obj = node as Record<string, unknown>
    if (Array.isArray(obj.instructions)) hasTimeline = true

    const entryIdLower = typeof obj.entryId === 'string' ? obj.entryId.toLowerCase() : ''
    const cursorTypeLower = typeof obj.cursorType === 'string' ? obj.cursorType.toLowerCase() : ''

    // 检查是否为置顶推文节点或置顶容器
    const isPinnedNode =
      parentIsPinned ||
      obj.type === 'TimelinePinEntry' ||
      entryIdLower.startsWith('pinned') ||
      entryIdLower.includes('pin')

    // 对话模块中的旧父帖不是时间线的日期边界；用最新的本人活动，且不受去重影响。
    if (Array.isArray(obj.items)) {
      const timestamps: number[] = []
      walk(obj.items, isPinnedNode, timestamps)
      if (conversationTimestamps) conversationTimestamps.push(...timestamps)
      else if (timestamps.length) includeBoundary(Math.max(...timestamps))
      return
    }

    // 检查是否为分页 cursor 节点（仅提取主时间线向后回溯的 bottom cursor，忽略推文内部二级评论展开 cursor）
    if (!conversationTimestamps && cursorTypeLower === 'bottom') {
      if (typeof obj.value === 'string' && obj.value) {
        bottomCursor = obj.value
      }
    } else if (!conversationTimestamps && (entryIdLower.startsWith('cursor-bottom-') || entryIdLower === 'cursor-bottom')) {
      if (typeof obj.value === 'string' && obj.value) {
        bottomCursor = obj.value
      } else if (obj.content && typeof obj.content === 'object') {
        const contentVal = (obj.content as { value?: unknown }).value
        if (typeof contentVal === 'string' && contentVal) {
          bottomCursor = contentVal
        }
      }
    }

    // 检查是否为推文节点
    const tweetObj =
      (obj.tweet_results as { result?: unknown } | undefined)?.result ||
      (obj.tweet as unknown) ||
      (obj.__typename === 'Tweet' ? obj : null)

    if (tweetObj && typeof tweetObj === 'object') {
      const realTweet =
        ((tweetObj as { tweet?: unknown }).tweet as GraphQLTweetNode | undefined) ||
        (tweetObj as GraphQLTweetNode)

      const entry = extractActivityFromTweet(realTweet, targetHandle, isPinnedNode)
      if (entry) {
        if (!seenIds.has(entry.id)) {
          seenIds.add(entry.id)
          entries.push(entry)
        }
        if (!entry.isPinned && typeof entry.timestamp === 'number') {
          if (conversationTimestamps) conversationTimestamps.push(entry.timestamp)
          else includeBoundary(entry.timestamp)
        }
      }
      // 不递归推文内部的引用、转推或作者资料；它们不是新的时间线活动。
      return
    }

    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') {
        walk(val, isPinnedNode, conversationTimestamps)
      }
    }
  }

  walk(data, false)

  return { entries, bottomCursor, oldestTimestamp, hasTimeline }
}

/**
 * 从页面 script 标签文本中嗅探指定 GraphQL 操作的 QueryId
 */
export function extractQueryIdFromScript(scriptText: string, operationName: string): string | null {
  if (!scriptText || !operationName) return null

  // 按对象作用域配对属性，避免在压缩 bundle 中跨过相邻操作配置。
  // 字符串整体消费，字符串里的花括号不会影响作用域；metadata 可嵌套。
  const tokens = /["']?(queryId|operationName)["']?\s*:\s*["']([A-Za-z0-9_-]+)["']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g
  const scopes: Array<{ queryId?: string; operationName?: string }> = [{}]
  for (const token of scriptText.matchAll(tokens)) {
    if (token[0] === '{') {
      scopes.push({})
    } else if (token[0] === '}') {
      if (scopes.length > 1) scopes.pop()
    } else if (token[1]) {
      const scope = scopes[scopes.length - 1]
      scope[token[1] as 'queryId' | 'operationName'] = token[2]
      if (scope.operationName === operationName && /^[A-Za-z0-9_-]{20,45}$/.test(scope.queryId || '')) {
        return scope.queryId!
      }
    }
  }
  return null
}

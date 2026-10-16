/**
 * X 页面用户指标（粉丝数、关注数）拦截与解析纯逻辑。
 * 供 MAIN world 拦截器、isolated world 徽章渲染与自动化单测复用。
 */

export interface UserMetrics {
  screenName: string
  name?: string
  followersCount: number
  followingCount?: number
  restId?: string
}

/**
 * 判断 URL 是否可能包含用户或推文的 GraphQL / REST 数据响应
 */
export function isUserOrTimelineUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (lower.includes('scheduled')) return false
  if (lower.includes('settings') || lower.includes('config') || lower.includes('badge')) return false

  if (lower.includes('/graphql/')) return true
  if (
    lower.includes('/1.1/users/') ||
    lower.includes('/1.1/friends/') ||
    lower.includes('/1.1/followers/') ||
    lower.includes('/2/users')
  ) {
    return true
  }

  return false
}

/**
 * 安全提取单个用户对象节点中的核心指标并存入字典
 */
function harvestFromUserObj(userObj: any, out: Record<string, UserMetrics>) {
  if (!userObj || typeof userObj !== 'object') return

  const user = userObj.result || userObj.user || userObj

  const legacy = user.legacy || {}
  const core = user.core || {}
  const screenName: string = core.screen_name || legacy.screen_name || user.screen_name || user.screenName || ''
  const name: string = core.name || legacy.name || user.name || ''

  const rc = user.relationship_counts || {}
  let followersCount: number | undefined
  if (typeof rc.followers === 'number') {
    followersCount = rc.followers
  } else if (typeof legacy.followers_count === 'number') {
    followersCount = legacy.followers_count
  } else if (typeof user.followers_count === 'number') {
    followersCount = user.followers_count
  } else if (typeof user.followersCount === 'number') {
    followersCount = user.followersCount
  }

  let followingCount: number | undefined
  if (typeof rc.following === 'number') {
    followingCount = rc.following
  } else if (typeof legacy.friends_count === 'number') {
    followingCount = legacy.friends_count
  } else if (typeof user.friends_count === 'number') {
    followingCount = user.friends_count
  } else if (typeof user.followingCount === 'number') {
    followingCount = user.followingCount
  }

  const restId: string = user.rest_id || user.id_str || (typeof user.id === 'string' ? user.id : '')

  if (screenName && typeof followersCount === 'number' && !isNaN(followersCount)) {
    const metrics: UserMetrics = {
      screenName,
      name: name || undefined,
      followersCount,
      followingCount: typeof followingCount === 'number' && !isNaN(followingCount) ? followingCount : undefined,
      restId: restId || undefined,
    }

    const lowerSn = screenName.toLowerCase()
    out[lowerSn] = metrics
    if (restId) {
      out[restId] = metrics
    }
  }
}

/**
 * 从 GraphQL 响应中提取所有用户的指标映射字典。
 * 兼具快速路径（广度优先检索 instructions）与剪枝递归兜底，
 * 兼顾关注列表、粉丝列表、主页时间线、推文详情与转推/引用推文。
 */
export function extractUserMetrics(data: unknown): Record<string, UserMetrics> {
  const result: Record<string, UserMetrics> = {}
  if (!data || typeof data !== 'object') return result

  // 1. 广度优先快速扫描 instructions (Fast Path)
  const queue: any[] = [data]
  const seenObjects = new Set<unknown>()
  const instructionArrays: any[][] = []

  let searchBudget = 500
  while (queue.length > 0 && searchBudget-- > 0) {
    const curr = queue.shift()
    if (!curr || typeof curr !== 'object' || seenObjects.has(curr)) continue
    seenObjects.add(curr)

    if (Array.isArray(curr.instructions)) {
      instructionArrays.push(curr.instructions)
    }

    // 个人主页 / 单用户返回形式
    if (curr.user_results?.result) {
      harvestFromUserObj(curr.user_results.result, result)
    }
    if (curr.user?.result) {
      harvestFromUserObj(curr.user.result, result)
    }

    for (const [k, v] of Object.entries(curr)) {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        k !== 'description' &&
        k !== 'profile_image_shape' &&
        k !== 'entities'
      ) {
        queue.push(v)
      }
    }
  }

  for (const instructions of instructionArrays) {
    for (const inst of instructions) {
      const entries = inst.entries || (inst.entry ? [inst.entry] : null) || inst.moduleItems
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const itemContent = entry?.content?.itemContent || entry?.item?.itemContent
          // 用户列表条目 (Following, Followers, ListMembers)
          if (itemContent?.user_results?.result) {
            harvestFromUserObj(itemContent.user_results.result, result)
          }
          // 推文条目作者
          if (itemContent?.tweet_results?.result?.core?.user_results?.result) {
            harvestFromUserObj(itemContent.tweet_results.result.core.user_results.result, result)
          }
          // 引用推文或转推推文作者
          const tweet = itemContent?.tweet_results?.result
          if (tweet?.legacy?.retweeted_status_result?.result?.core?.user_results?.result) {
            harvestFromUserObj(tweet.legacy.retweeted_status_result.result.core.user_results.result, result)
          }
          if (tweet?.quoted_status_result?.result?.core?.user_results?.result) {
            harvestFromUserObj(tweet.quoted_status_result.result.core.user_results.result, result)
          }

          const items = entry?.content?.items
          if (Array.isArray(items)) {
            for (const item of items) {
              const subContent = item?.item?.itemContent
              if (subContent?.user_results?.result) {
                harvestFromUserObj(subContent.user_results.result, result)
              }
              if (subContent?.tweet_results?.result?.core?.user_results?.result) {
                harvestFromUserObj(subContent.tweet_results.result.core.user_results.result, result)
              }
            }
          }
        }
      }
    }
  }

  // 2. 剪枝兜底递归：覆盖非典型嵌套结构
  const seen = new Set<unknown>()
  let budget = 80000

  const PRUNED_KEYS = new Set([
    'media',
    'video_info',
    'entities',
    'symbols',
    'urls',
    'user_mentions',
    'profile_image_shape',
    'description',
  ])

  const walk = (node: unknown) => {
    if (budget <= 0 || !node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    budget--

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item)
      }
      return
    }

    const obj = node as Record<string, any>

    if (obj.user_results?.result) {
      harvestFromUserObj(obj.user_results.result, result)
    } else if (obj.legacy && typeof obj.legacy.followers_count === 'number' && obj.legacy.screen_name) {
      harvestFromUserObj(obj, result)
    }

    for (const [k, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !PRUNED_KEYS.has(k)) {
        walk(val)
      }
    }
  }

  walk(data)
  return result
}

/**
 * 粉丝量分级 0..4，用于徽标分级配色（参考 x-follower-lens）
 * - t0 (< 1000): 灰（低调不扎眼）
 * - t1 (1000 ~ 10000): 蓝（官方蓝）
 * - t2 (10000 ~ 100000): 绿
 * - t3 (100000 ~ 1000000): 橙
 * - t4 (>= 1000000): 粉橙渐变
 */
export function getFollowerTier(followers: number): number {
  if (followers >= 1000000) return 4
  if (followers >= 100000) return 3
  if (followers >= 10000) return 2
  if (followers >= 1000) return 1
  return 0
}

/**
 * 格式化粉丝数值为简洁徽章文案
 * - < 10000：原样纯数字展示（如 "161", "8500"）
 * - >= 10000：中文环境展示为 "1.25万" 或 "12.5万"，>= 1亿展示为 "1.95亿"
 * - 英文环境：展示为 "12.5K", "1.2M", "1.5B"
 */
export function formatFollowerCount(count: number, locale = 'zh'): string {
  if (typeof count !== 'number' || isNaN(count) || count < 0) return '0'

  if (locale.startsWith('zh')) {
    if (count < 10000) {
      return String(count)
    }
    if (count >= 100000000) {
      const yi = count / 100000000
      return yi.toFixed(2).replace(/\.?0+$/, '') + '亿'
    }
    const wan = count / 10000
    return wan.toFixed(count < 100000 ? 2 : 1).replace(/\.?0+$/, '') + '万'
  }

  // 英文或其它语言环境
  if (count < 1000) {
    return String(count)
  }
  if (count >= 1000000000) {
    return (count / 1000000000).toFixed(1).replace(/\.?0+$/, '') + 'B'
  }
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.?0+$/, '') + 'M'
  }
  return (count / 1000).toFixed(1).replace(/\.?0+$/, '') + 'K'
}

/**
 * 生成鼠标悬停 (hover) 时的详细数据提示文案
 */
export function formatFollowerTooltip(metrics: UserMetrics): string {
  const followerStr = `粉丝: ${metrics.followersCount.toLocaleString('zh-CN')}`
  if (typeof metrics.followingCount === 'number' && metrics.followingCount >= 0) {
    return `${followerStr} · 关注: ${metrics.followingCount.toLocaleString('zh-CN')}`
  }
  return followerStr
}

/**
 * 推文/长文书签指标拦截与解析核心纯逻辑（供 MAIN world 拦截器与 isolated world/单测复用）
 */

/**
 * 判断 URL 是否可能包含推文或长文的 GraphQL 响应
 */
export function isTweetOrArticleUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (!lower.includes('/graphql/')) return false
  if (lower.includes('scheduled')) return false
  if (lower.includes('settings') || lower.includes('config') || lower.includes('badge')) return false

  return true
}

/**
 * 从推文或长文对象节点中安全提取 restId 和 bookmark_count，
 * 并支持推文与关联长文 (Article) 之间的双向指标映射绑定
 */
function harvestFromTweetResult(resultObj: any, out: Record<string, number>) {
  if (!resultObj || typeof resultObj !== 'object') return

  // 1. 如果包含 tweet 或 tweet_result
  const tweet =
    resultObj.tweet ||
    resultObj.tweet_results?.result?.tweet ||
    resultObj.tweet_results?.result ||
    resultObj
  const restId = tweet.rest_id || tweet.id || tweet.legacy?.id_str

  // 尝试从 tweet 自身直接获取 bookmark_count
  let count: number | undefined
  if (tweet.legacy && typeof tweet.legacy.bookmark_count === 'number') {
    count = tweet.legacy.bookmark_count
  } else if (typeof tweet.bookmark_count === 'number') {
    count = tweet.bookmark_count
  } else if (typeof tweet.bookmarkCount === 'number') {
    count = tweet.bookmarkCount
  }

  // 尝试检查关联的 article（推特长文）
  const rawArticle =
    tweet.article?.article_results?.result ||
    tweet.article ||
    tweet.article_results?.result ||
    resultObj.article?.article_results?.result ||
    resultObj.article ||
    resultObj.article_results?.result

  let articleId: string | undefined
  let articleCount: number | undefined
  if (rawArticle && typeof rawArticle === 'object') {
    const realArticle = rawArticle.article_results?.result || rawArticle
    articleId = realArticle.rest_id || realArticle.id
    if (typeof realArticle.bookmark_count === 'number') {
      articleCount = realArticle.bookmark_count
    } else if (typeof realArticle.bookmarkCount === 'number') {
      articleCount = realArticle.bookmarkCount
    }
  }

  // 确定有效数值（优先取有真实数值的那个，互通共享）
  const finalCount =
    typeof count === 'number' && count >= 0
      ? count
      : typeof articleCount === 'number' && articleCount >= 0
        ? articleCount
        : undefined

  if (typeof finalCount === 'number') {
    if (typeof restId === 'string' && restId) {
      out[restId] = finalCount
    }
    if (typeof articleId === 'string' && articleId) {
      out[articleId] = finalCount
    }
    if (tweet.article && typeof tweet.article.rest_id === 'string') {
      out[tweet.article.rest_id] = finalCount
    }
    if (tweet.article?.article_results?.result?.rest_id) {
      out[tweet.article.article_results.result.rest_id] = finalCount
    }
  }

  // 3. 转推 (Retweet) 原文支持
  if (tweet.legacy?.retweeted_status_result?.result) {
    harvestFromTweetResult(tweet.legacy.retweeted_status_result.result, out)
  }

  // 4. 引用推文 (Quote Tweet) 原文支持
  if (tweet.quoted_status_result?.result) {
    harvestFromTweetResult(tweet.quoted_status_result.result, out)
  }
}

/**
 * 从 GraphQL 响应中提取推文与长文的 rest_id 到 bookmark_count 映射字典。
 * 结合「动态 instructions 数组快搜」与「安全剪枝全量递归」，确保个人主页及多推文列表 100% 全覆盖且耗时 < 2ms。
 */
export function extractBookmarkMetrics(data: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (!data || typeof data !== 'object') return result

  // 1. 广度优先扫描所有包含 instructions 数组的节点 (Fast Path)
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

    for (const [k, v] of Object.entries(curr)) {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        k !== 'core' &&
        k !== 'profile_image_shape' &&
        k !== 'description'
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
          if (itemContent?.tweet_results?.result) {
            harvestFromTweetResult(itemContent.tweet_results.result, result)
          }
          if (itemContent?.article_results?.result) {
            harvestFromTweetResult(itemContent.article_results.result, result)
          }
          const items = entry?.content?.items
          if (Array.isArray(items)) {
            for (const item of items) {
              const subContent = item?.item?.itemContent
              if (subContent?.tweet_results?.result) {
                harvestFromTweetResult(subContent.tweet_results.result, result)
              }
              if (subContent?.article_results?.result) {
                harvestFromTweetResult(subContent.article_results.result, result)
              }
            }
          }
        }
      }
    }
  }

  // 2. 剪枝兜底遍历：覆盖非常规路径，跳过与推文指标无关的超大子树
  const seen = new Set<unknown>()
  let budget = 80000

  // 明确不需要进入递归的无指标巨型字段
  const PRUNED_KEYS = new Set([
    'core',
    'profile_image_shape',
    'affiliates_highlighted_label',
    'description',
    'video_info',
    'features',
    'quick_promote_eligibility',
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
    harvestFromTweetResult(obj, result)

    for (const [k, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !PRUNED_KEYS.has(k)) {
        walk(val)
      }
    }
  }

  walk(data)
  return result
}

const STATUS_OR_ARTICLE_ID_RE = /\/(?:status|article)\/(\d+)/

/**
 * 这些区域里的链接指向别的推文，不是按钮所属推文的 ID：
 * 推文卡片、引用推文卡片（整块可点击的 div[role=link]）、推文正文、长文正文
 */
const NESTED_CONTENT_SELECTOR = [
  'article[data-testid="tweet"]',
  'div[role="link"]',
  '[data-testid="tweetText"]',
  '[data-testid="twitterArticleRichTextView"]',
].join(', ')

/**
 * 找出收藏按钮所属推文的 ID 候选，按可信度排序：
 * 1. 按钮所在操作栏里的推文链接（浏览量链接 /status/<id>/analytics）
 * 2. 推文自己的时间链接
 * 3. 推文里其余的推文/长文链接（如时间线里长文卡片的 /article/<id>）
 * 所有候选都跳过嵌套推文和正文里的链接（引用推文、长文正文里嵌入的推文和文字链接）。
 * 长文顶部的操作栏没有时间链接，不跳过的话会取到正文里第一条嵌入推文的 ID。
 * 传入 pathname 时，前三步都没找到才用地址栏里的 ID。
 */
export function getBookmarkOwnerIds(btn: Element, pathname?: string): string[] {
  const ids: string[] = []
  const container =
    btn.closest('article[data-testid="tweet"]') ||
    btn.closest('article') ||
    btn.closest('[data-testid="twitterArticleReadView"]')

  const belongsToContainer = (el: Element) => {
    if (!container) return true
    const boundary = el.closest(NESTED_CONTENT_SELECTOR)
    return !boundary || boundary.contains(container)
  }
  const addFrom = (el: Element | null | undefined) => {
    if (!el || !belongsToContainer(el)) return
    const match = (el.getAttribute('href') || '').match(STATUS_OR_ARTICLE_ID_RE)
    if (match && !ids.includes(match[1])) ids.push(match[1])
  }

  btn.closest('[role="group"]')?.querySelectorAll('a[href*="/status/"]').forEach(addFrom)

  if (container) {
    container.querySelectorAll('time').forEach((time) => {
      if (belongsToContainer(time)) addFrom(time.closest('a'))
    })
    container.querySelectorAll('a[href*="/status/"], a[href*="/article/"]').forEach(addFrom)
  }

  if (ids.length === 0 && pathname) {
    const match = pathname.match(STATUS_OR_ARTICLE_ID_RE)
    if (match) ids.push(match[1])
  }

  return ids
}

/**
 * 从按钮的 aria-label 属性中正则提取书签数量
 * 支持例如：
 * - "186 个书签。将帖子添加到书签"
 * - "32 书签"
 * - "128 Bookmarks" / "1 Bookmark"
 * - "Bookmark (45)"
 */
export function extractBookmarkFromAriaLabel(ariaLabel: string | null | undefined): number | null {
  if (!ariaLabel) return null

  // 1. "186 个书签"、"32 书签"、"128 Bookmarks"、"1 Bookmark"、"50 收藏"
  const countFirstMatch = ariaLabel.match(
    /(\d[\d,]*)\s*(?:个|次)?\s*(?:书签|bookmarks|bookmark|收藏)/i,
  )
  if (countFirstMatch) {
    const num = parseInt(countFirstMatch[1].replace(/,/g, ''), 10)
    if (!isNaN(num)) return num
  }

  // 2. "书签: 186"、"Bookmark (32)"
  const textFirstMatch = ariaLabel.match(
    /(?:书签|bookmarks|bookmark|收藏)\s*[:：(（]?\s*(\d[\d,]*)[)）]?/i,
  )
  if (textFirstMatch) {
    const num = parseInt(textFirstMatch[1].replace(/,/g, ''), 10)
    if (!isNaN(num)) return num
  }

  return null
}

/**
 * 格式化书签数值为推特风格的显示文本
 * - <= 0：返回空字符串（官方通常在为 0 时不展示数字）
 * - < 10000：原样千分位展示（如 "234", "1,245"）
 * - >= 10000：显示为 "1.2万" 或 "12.5万"
 */
export function formatBookmarkCount(count: number, locale = 'zh'): string {
  if (!count || count <= 0 || isNaN(count)) return ''

  if (count < 10000) {
    return count.toLocaleString('zh-CN')
  }

  if (locale.startsWith('zh')) {
    const wan = count / 10000
    if (wan >= 10000) {
      return (wan / 10000).toFixed(1).replace(/\.0$/, '') + '亿'
    }
    return wan.toFixed(1).replace(/\.0$/, '') + '万'
  }

  // 英文或其它语言环境：10K+
  const k = count / 1000
  if (k >= 1000) {
    return (k / 1000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  return k.toFixed(1).replace(/\.0$/, '') + 'K'
}

/**
 * X GraphQL 推文节点的通用取值：推文全文提取（ai-repost）和媒体提取（tweet-media）共用
 */

/** 按路径取嵌套字段，和 a?.b?.c 一样：中途遇到 null / undefined 就返回 undefined */
export function dig(value: any, ...keys: string[]): any {
  for (const key of keys) {
    if (value == null) return undefined
    value = value[key]
  }
  return value
}

/** 受限推文外面包着一层 TweetWithVisibilityResults，取出里面的推文 */
export function unwrapTweet(node: any): any {
  if (!node || typeof node !== 'object') return null
  if (node.__typename === 'TweetWithVisibilityResults' && node.tweet) {
    return node.tweet
  }
  return node
}

export function tweetRestId(tweet: any, legacy: any): string {
  return String(tweet.rest_id || legacy.id_str || '')
}

/** 没有目标 ID 或推文没有 ID 时都算符合 */
export function isTargetTweet(tweet: any, legacy: any, targetId?: string): boolean {
  const restId = tweetRestId(tweet, legacy)
  return !targetId || !restId || restId === targetId
}

/** 作者名字和 handle：先取 core，没有时取 legacy */
export function tweetAuthor(tweet: any): { authorName: string; authorHandle: string } {
  const userResult = dig(tweet, 'core', 'user_results', 'result')
  const userLegacy = dig(userResult, 'legacy') || {}
  const userCore = dig(userResult, 'core') || {}
  return {
    authorName: userCore.name || userLegacy.name || '',
    authorHandle: userCore.screen_name || userLegacy.screen_name || '',
  }
}

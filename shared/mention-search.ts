// 按名字艾特：从光标前的文字里找出「@名字」，以及整理 X 用户查询接口的返回。
// X 发帖框只把 @ 后面的英文字母、数字、下划线当成艾特，打中文名时不会查询。

export const MENTION_SEARCH_MESSAGE = 'XF_SEARCH_MENTION_USERS'
export const MENTION_QUERY_MAX_LENGTH = 30

export interface MentionUser {
  id: string
  name: string
  handle: string
  /** X 图床上的头像地址，其他来源一律丢弃 */
  avatar: string
  following: boolean
  verified: boolean
}

export interface MentionQuery {
  query: string
  /** @ 在文字里的位置 */
  start: number
}

// @ 前面不能是字母数字或这些符号，和 X 认艾特的规则一致；名字里不收空白、@ 和断句用的标点
const MENTION_PATTERN = new RegExp(
  `(?:^|[^A-Za-z0-9_!#$%&*@＠])[@＠]([^\\s@＠，。！？、；：,.!?;:]{1,${MENTION_QUERY_MAX_LENGTH}})$`,
  'u',
)

/** 光标前以「@名字」结尾、且名字里有非英文字符时返回名字；纯英文交给 X 自己的候选框 */
export function findMentionQuery(textBeforeCaret: string): MentionQuery | null {
  const match = MENTION_PATTERN.exec(textBeforeCaret)
  if (!match) return null
  const query = match[1]
  if (/^[\x00-\x7f]*$/.test(query)) return null
  return { query, start: textBeforeCaret.length - query.length - 1 }
}

export function buildMentionSearchUrl(query: string): string {
  const url = new URL('https://x.com/i/api/1.1/search/typeahead.json')
  url.searchParams.set('include_ext_is_blue_verified', '1')
  url.searchParams.set('q', query)
  url.searchParams.set('src', 'compose')
  url.searchParams.set('result_type', 'users')
  return url.toString()
}

function avatarUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' ? url.href : ''
  } catch {
    return ''
  }
}

/** 已关注的账号排在前面，其余保持 X 返回的顺序 */
export function parseMentionUsers(payload: unknown): MentionUser[] {
  const raw = (payload as { users?: unknown } | null)?.users
  if (!Array.isArray(raw)) return []
  const users: MentionUser[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const user = item as Record<string, unknown>
    const handle = typeof user.screen_name === 'string' ? user.screen_name : ''
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || seen.has(handle.toLowerCase())) continue
    seen.add(handle.toLowerCase())
    const social = user.social_context as { following?: unknown } | undefined
    users.push({
      id: String(user.id_str ?? user.id ?? ''),
      name: typeof user.name === 'string' && user.name.trim() ? user.name : handle,
      handle,
      avatar: avatarUrl(user.profile_image_url_https),
      following: social?.following === true,
      verified: user.ext_is_blue_verified === true || user.verified === true,
    })
  }
  return [...users.filter(u => u.following), ...users.filter(u => !u.following)]
}

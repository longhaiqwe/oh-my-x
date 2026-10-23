// 标过「机器人」的账号：这些账号以后的回复直接折叠（可以展开、可以撤销），不改黑名单。
// 存在 storage.local 的 spamAiBotAccounts（小写用户名数组），标注时由后台更新。
// 方案见 docs/plans/ai-reply-scoring.md 4.7。

/** 最多记这么多个账号，超出时去掉最早记下的 */
export const BOT_ACCOUNT_LIMIT = 5000

const HANDLE_RE = /^[a-z0-9_]{1,15}$/

/** 存储里的值整理成小写用户名数组：去掉不合法的、去重，保持原来的顺序 */
export function parseBotAccounts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const handle = value.trim().replace(/^@/, '').toLowerCase()
    if (HANDLE_RE.test(handle)) seen.add(handle)
  }
  return [...seen].slice(-BOT_ACCOUNT_LIMIT)
}

/** 加入或移出一个账号；没有变化时返回原数组 */
export function updateBotAccounts(list: string[], handle: string, add: boolean): string[] {
  const [normalized] = parseBotAccounts([handle])
  if (!normalized || list.includes(normalized) === add) return list
  return add ? parseBotAccounts([...list, normalized]) : list.filter((h) => h !== normalized)
}

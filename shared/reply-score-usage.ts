// 回复区 AI 打分的当天用量：自动判断、手动判断、复用缓存、失败的条数。
// 后台累计后每 5 秒合并写一次 storage.local，避免每次判断都写存储。
import { KeySpamAiUsage } from '../storage-keys'
import { getTodayKey } from './spam-logger'

export interface ReplyScoreUsage {
  date: string
  auto: number
  manual: number
  cached: number
  failed: number
  /** 超过阈值被折叠的条数（同一页面里同一条只算一次） */
  folded: number
}

export type ReplyScoreUsageDelta = Partial<Omit<ReplyScoreUsage, 'date'>>

const FIELDS = ['auto', 'manual', 'cached', 'failed', 'folded'] as const

export function emptyReplyScoreUsage(date: string): ReplyScoreUsage {
  return { date, auto: 0, manual: 0, cached: 0, failed: 0, folded: 0 }
}

/** 读到的值不是今天的就归零；字段缺失或损坏按 0 算 */
export function parseReplyScoreUsage(raw: unknown, today: string): ReplyScoreUsage {
  const usage = emptyReplyScoreUsage(today)
  if (!raw || typeof raw !== 'object' || (raw as ReplyScoreUsage).date !== today) return usage
  for (const field of FIELDS) {
    const n = Number((raw as ReplyScoreUsage)[field])
    usage[field] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return usage
}

interface UsageStorage {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export function createReplyScoreUsage(
  storage: () => UsageStorage = () => browser.storage.local,
  today: () => string = getTodayKey,
  flushDelay = 5_000,
) {
  let pending: ReplyScoreUsageDelta = {}
  let pendingDate = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  async function readStored(date: string): Promise<ReplyScoreUsage> {
    const data = await storage().get(KeySpamAiUsage)
    return parseReplyScoreUsage(data[KeySpamAiUsage], date)
  }

  function merge(base: ReplyScoreUsage, delta: ReplyScoreUsageDelta): ReplyScoreUsage {
    const next = { ...base }
    for (const field of FIELDS) next[field] += delta[field] ?? 0
    return next
  }

  async function flush() {
    timer = null
    const delta = pending
    const date = pendingDate
    pending = {}
    if (!date) return
    try {
      const stored = await readStored(date)
      await storage().set({ [KeySpamAiUsage]: merge(stored, delta) })
    } catch (error) {
      console.debug('[oh-my-x] AI 打分用量写入失败', error)
    }
  }

  return {
    /** 当天用量，包括还没写进存储的部分 */
    async read(): Promise<ReplyScoreUsage> {
      const date = today()
      const stored = await readStored(date)
      return pendingDate === date ? merge(stored, pending) : stored
    },
    add(delta: ReplyScoreUsageDelta) {
      const date = today()
      if (pendingDate && pendingDate !== date) {
        if (timer) clearTimeout(timer)
        void flush()
      }
      pendingDate = date
      for (const field of FIELDS) {
        const n = delta[field]
        if (n) pending[field] = (pending[field] ?? 0) + n
      }
      if (!timer) timer = setTimeout(() => void flush(), flushDelay)
    },
    flush,
  }
}

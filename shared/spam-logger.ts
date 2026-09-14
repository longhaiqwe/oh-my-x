import { KeySpamLog, KeySpamStats } from '../storage-keys'
import type { DailyStats, SpamCategory, SpamLogEntry } from './spam-types'
import { SPAM_CATEGORY_LABEL } from './spam-types'

const MAX_LOG_ENTRIES = 50 // 精简最近拦截日志条数（原200），减轻 storage 体积与 IPC 传输
const STAT_RETENTION_DAYS = 30

// 运行时去重 Map：同一推文 5 分钟内不重复记录
// X 虚拟列表重建 DOM 会导致同一推文被多次扫描，避免日志/统计膨胀
const DEDUP_TTL_MS = 5 * 60 * 1000
const dedupCache = new Map<string, number>()

function dedupKey(entry: Omit<SpamLogEntry, 'id' | 'timestamp'>): string {
  return `${entry.authorHandle ?? ''}|${(entry.text ?? '').slice(0, 30)}|${entry.category}`
}

function isDuplicate(key: string): boolean {
  const now = Date.now()
  // 惰性清理过期条目 (由于 Map 维护插入顺序且时间单调递增，遇到第一个未过期的即可跳出，平均 O(1) 时间)
  for (const [k, ts] of dedupCache) {
    if (now - ts > DEDUP_TTL_MS) {
      dedupCache.delete(k)
    } else {
      break
    }
  }
  const last = dedupCache.get(key)
  if (last && now - last < DEDUP_TTL_MS) return true
  dedupCache.set(key, now)
  return false
}

export function getTodayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyCategoryStats(): Record<SpamCategory, number> {
  return {
    porn_spam: 0,
    bot: 0,
    marketing: 0,
    low_quality: 0,
    normal: 0,
  }
}

export async function readLog(limit?: number): Promise<SpamLogEntry[]> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
    await flushPending()
  }
  const data = await browser.storage.local.get(KeySpamLog)
  const raw = data[KeySpamLog]
  if (!Array.isArray(raw)) return []
  return typeof limit === 'number' ? (raw as SpamLogEntry[]).slice(0, limit) : (raw as SpamLogEntry[])
}


export async function readStats(): Promise<DailyStats[]> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
    await flushPending()
  }
  const data = await browser.storage.local.get(KeySpamStats)
  const raw = data[KeySpamStats]
  if (!Array.isArray(raw)) return []
  return raw as DailyStats[]
}

// 串行化 read-modify-write：并发 recordIntercept 不会丢日志
let queue: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn) as Promise<T>
  queue = next.catch(() => {})
  return next
}

const pendingEntries: Array<Omit<SpamLogEntry, 'id' | 'timestamp'>> = []
const pendingResolvers: Array<() => void> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushPending(): Promise<void> {
  if (pendingEntries.length === 0) return
  const batch = pendingEntries.splice(0, pendingEntries.length)
  const resolvers = pendingResolvers.splice(0, pendingResolvers.length)

  try {
    await serialize(async () => {
      const data = await browser.storage.local.get([KeySpamLog, KeySpamStats])
      const log = Array.isArray(data[KeySpamLog]) ? (data[KeySpamLog] as SpamLogEntry[]) : []
      const stats = Array.isArray(data[KeySpamStats]) ? (data[KeySpamStats] as DailyStats[]) : []
      const today = getTodayKey()

      let todayStat = stats.find((s) => s.date === today)
      if (!todayStat) {
        todayStat = { date: today, total: 0, byCategory: emptyCategoryStats() }
        stats.unshift(todayStat)
      }

      const newEntries: SpamLogEntry[] = []
      const now = Date.now()
      // batch 是按拦截顺序进入队列的，log 数组是以最新项在最前（index 0）排列。
      // 因此将新截获批次以逆序（最新在前）前置合并进 log。
      for (let i = batch.length - 1; i >= 0; i--) {
        const entry = batch[i]
        const id = `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`
        newEntries.push({
          id,
          timestamp: now,
          ...entry,
        })
        todayStat.total += 1
        todayStat.byCategory[entry.category] = (todayStat.byCategory[entry.category] || 0) + 1
      }

      const nextLog = [...newEntries, ...log].slice(0, MAX_LOG_ENTRIES)

      // 清理过期统计
      const cutoff = now - STAT_RETENTION_DAYS * 24 * 60 * 60 * 1000
      const nextStats = stats.filter((s) => {
        const ts = new Date(s.date).getTime()
        return Number.isFinite(ts) && ts >= cutoff - 24 * 60 * 60 * 1000
      })

      await browser.storage.local.set({
        [KeySpamLog]: nextLog,
        [KeySpamStats]: nextStats,
      })
    })
  } catch (err) {
    console.error('[X-Focus] failed to flush spam log:', err)
  } finally {
    resolvers.forEach((r) => r())
  }
}

export function recordIntercept(entry: Omit<SpamLogEntry, 'id' | 'timestamp'>): Promise<void> {
  // 去重：同推文在 5 分钟内只记一次
  if (isDuplicate(dedupKey(entry))) return Promise.resolve()

  return new Promise((resolve) => {
    pendingEntries.push(entry)
    pendingResolvers.push(resolve)
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        void flushPending()
      }, 50)
    }
  })
}

export async function clearLog(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingEntries.length = 0
  pendingResolvers.splice(0).forEach((r) => r())
  await browser.storage.local.remove(KeySpamLog)
}

export async function clearStats(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingEntries.length = 0
  pendingResolvers.splice(0).forEach((r) => r())
  await browser.storage.local.remove(KeySpamStats)
}

export async function getTodayStats(): Promise<{
  total: number
  byCategory: Record<SpamCategory, number>
}> {
  const stats = await readStats()
  const today = getTodayKey()
  const todayStat = stats.find((s) => s.date === today)
  if (!todayStat) {
    return { total: 0, byCategory: emptyCategoryStats() }
  }
  return {
    total: todayStat.total,
    byCategory: { ...emptyCategoryStats(), ...todayStat.byCategory },
  }
}

export function summarizeCategory(
  byCategory: Record<SpamCategory, number>,
): { category: SpamCategory; label: string; count: number }[] {
  return (Object.keys(byCategory) as SpamCategory[])
    .filter((c) => c !== 'normal')
    .map((c) => ({
      category: c,
      label: SPAM_CATEGORY_LABEL[c],
      count: byCategory[c] || 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
}

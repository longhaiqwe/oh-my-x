/**
 * 原创内容奖励计划的每日数据：
 * - 奖励计划接口只返回「过去 90 天累计的已验证首页时间线曝光」一个数，没有历史，
 *   所以每天记一次，相邻两天相减得到当天计入奖励的曝光。
 * - 整体曝光和蓝 V 曝光来自账号分析页的 accountOverviewDailyQuery，按 UTC 日返回。
 */
import {
  KeyCreatorRewardsHistory,
  KeyCreatorRewardsStats,
} from '../storage-keys'
import type { CreatorRewardsStats } from './creator-rewards'

/** 日期（UTC，YYYY-MM-DD）→ 截至当天结束的 90 天累计曝光 */
export type RewardsHistory = Record<string, number>

/** 账号分析里一天的曝光：全部，以及其中蓝 V 用户看到的部分 */
export interface DailyImpressions {
  total: number
  verified: number
}

export interface ImpressionsDailyCache {
  days: Record<string, DailyImpressions>
  updatedAt: number
}

export interface DailyConversionRow {
  date: string
  total: number | null
  verified: number | null
  /** 当天计入奖励的曝光 = 当天累计 − 前一天累计；缺任一天时为 null */
  counted: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000
/** 奖励计划每天 UTC 02:30（北京时间 10:30）更新，与 isCreatorRewardsStale 的分界一致 */
const REWARDS_REFRESH_OFFSET_MS = (2 * 60 + 30) * 60 * 1000
/** 留 120 天：超过 90 天后可用来推算移出统计窗口的那一天 */
const REWARDS_HISTORY_LIMIT = 120
const IMPRESSIONS_CACHE_LIMIT = 30

export const ACCOUNT_OVERVIEW_OPERATION = 'accountOverviewDailyQuery'
/** 2026-10-18 在 x.com/i/account_analytics 抓到的接口编号；X 换编号后由页面拦截器记下新的 */
export const FALLBACK_ACCOUNT_OVERVIEW_QUERY_ID = '2hqAR3h2xhN1cUrUBZypyg'

export function utcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function shiftDateKey(dateKey: string, days: number): string {
  return utcDateKey(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS)
}

/**
 * 某次读到的累计数截至哪一天。
 * 推论：X 在 UTC 02:30 把数字更新到前一天为止，所以 02:30 之后读到的是昨天的累计，之前读到的是前天的。
 */
export function rewardsDataDate(updatedAt: number): string {
  return utcDateKey(updatedAt - REWARDS_REFRESH_OFFSET_MS - DAY_MS)
}

/** 记下一次读数。读数和前一天相同时视为 X 还没更新，不记 */
export function addRewardsSnapshot(
  history: RewardsHistory,
  impressionsCount: number,
  updatedAt: number,
): RewardsHistory {
  if (!(impressionsCount > 0) || !(updatedAt > 0)) return history
  const date = rewardsDataDate(updatedAt)
  if (history[shiftDateKey(date, -1)] === impressionsCount) return history
  if (history[date] === impressionsCount) return history

  const next: RewardsHistory = { ...history, [date]: impressionsCount }
  const dates = Object.keys(next).sort()
  for (const old of dates.slice(0, Math.max(0, dates.length - REWARDS_HISTORY_LIMIT))) {
    delete next[old]
  }
  return next
}

/** 现在应该已有哪一天的累计数；记录里没有就需要再取一次 */
export function isRewardsHistoryMissingToday(history: RewardsHistory, now = Date.now()): boolean {
  return history[rewardsDataDate(now)] === undefined
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export function parseRewardsHistory(raw: unknown): RewardsHistory {
  const obj = parseJsonObject(raw)
  const history: RewardsHistory = {}
  if (!obj) return history
  for (const [date, count] of Object.entries(obj)) {
    if (DATE_KEY.test(date) && typeof count === 'number' && count > 0) history[date] = count
  }
  return history
}

export function parseImpressionsCache(raw: unknown): ImpressionsDailyCache | null {
  const obj = parseJsonObject(raw)
  if (!obj || typeof obj.updatedAt !== 'number') return null
  const daysObj = parseJsonObject(obj.days) ?? {}
  const days: Record<string, DailyImpressions> = {}
  for (const [date, value] of Object.entries(daysObj)) {
    const day = value as Partial<DailyImpressions>
    if (DATE_KEY.test(date) && typeof day?.total === 'number' && typeof day?.verified === 'number') {
      days[date] = { total: day.total, verified: day.verified }
    }
  }
  return { days, updatedAt: obj.updatedAt }
}

/** 合并新取到的天数，只留最近 30 天 */
export function mergeImpressionsDays(
  previous: ImpressionsDailyCache | null,
  fresh: Record<string, DailyImpressions>,
  updatedAt: number,
): ImpressionsDailyCache {
  const days = { ...(previous?.days ?? {}), ...fresh }
  const dates = Object.keys(days).sort()
  for (const old of dates.slice(0, Math.max(0, dates.length - IMPRESSIONS_CACHE_LIMIT))) {
    delete days[old]
  }
  return { days, updatedAt }
}

/** 请求最近 14 天（含今天）的按天数据，参数结构照抄 X 账号分析页 */
export function buildAccountOverviewVariables(now = Date.now()) {
  const todayStart = Date.parse(`${utcDateKey(now)}T00:00:00Z`)
  const to = todayStart + DAY_MS
  const from = to - 14 * DAY_MS
  const prevFrom = from - 14 * DAY_MS
  const iso = (t: number) => new Date(t).toISOString()
  return {
    current_from: from,
    current_from_iso: iso(from),
    current_to: to,
    current_to_iso: iso(to),
    prev_from: prevFrom,
    prev_from_iso: iso(prevFrom),
    prev_to: from,
    prev_to_iso: iso(from),
    backfill_from: to - 2 * DAY_MS,
    backfill_to: to,
    show_realtime_active_followers: false,
    show_verified_followers: true,
  }
}

interface TimeSeriesPoint {
  count?: number | string
  engagement_type?: string
  is_engaging_user_verified?: string | boolean
  timestamp?: number | string
}

/** 从 accountOverviewDailyQuery 响应里按天汇总曝光（engagement_type = Displayed） */
export function parseAccountOverviewDaily(json: unknown): Record<string, DailyImpressions> | null {
  const series = (json as any)?.data?.viewer_v2?.user_results?.result?.current_time_series
  if (!Array.isArray(series)) return null
  const days: Record<string, DailyImpressions> = {}
  for (const point of series as TimeSeriesPoint[]) {
    if (point?.engagement_type !== 'Displayed') continue
    const count = Number(point.count)
    const timestamp = Number(point.timestamp)
    if (!Number.isFinite(count) || !Number.isFinite(timestamp)) continue
    const date = utcDateKey(timestamp)
    const day = (days[date] ??= { total: 0, verified: 0 })
    day.total += count
    if (point.is_engaging_user_verified === true || point.is_engaging_user_verified === 'true') {
      day.verified += count
    }
  }
  return days
}

/** 截至 endDate 的连续 count 天，每天三个数 */
export function buildDailyConversion(
  history: RewardsHistory,
  impressions: Record<string, DailyImpressions>,
  endDate: string,
  count = 7,
): DailyConversionRow[] {
  const rows: DailyConversionRow[] = []
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = shiftDateKey(endDate, -offset)
    const current = history[date]
    const previous = history[shiftDateKey(date, -1)]
    const day = impressions[date]
    rows.push({
      date,
      total: day ? day.total : null,
      verified: day ? day.verified : null,
      counted: current !== undefined && previous !== undefined ? current - previous : null,
    })
  }
  return rows
}

interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

/** 保存最新读数，并记入每日历史。拦截器、页面扫描、后台请求都走这里 */
export async function persistCreatorRewardsStats(
  stats: CreatorRewardsStats,
  storage: StorageArea = browser.storage.local as unknown as StorageArea,
): Promise<RewardsHistory> {
  const stored = await storage.get(KeyCreatorRewardsHistory)
  const previous = parseRewardsHistory(stored[KeyCreatorRewardsHistory])
  const history = addRewardsSnapshot(previous, stats.impressionsCount, stats.updatedAt)
  const items: Record<string, unknown> = { [KeyCreatorRewardsStats]: JSON.stringify(stats) }
  if (history !== previous) items[KeyCreatorRewardsHistory] = JSON.stringify(history)
  await storage.set(items)
  return history
}

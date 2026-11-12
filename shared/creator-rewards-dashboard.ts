import { buildDailyConversion, shiftDateKey, utcDateKey, type DailyConversionRow, type DailyImpressions, type RewardsHistory } from './creator-rewards-daily'

export type RewardsPeriod = 'week' | 'month' | '90' | 'custom'
export type RewardsMetric = 'total' | 'verified' | 'counted'
export interface RewardsRange { start: string; end: string }
export interface RewardsBucket extends RewardsRange { value: number | null; recorded: number; days: number }
const DAY = 86400000
export const rangeDays = (range: RewardsRange) => Math.round((Date.parse(range.end) - Date.parse(range.start)) / DAY) + 1

export function dashboardBounds(now = Date.now()): RewardsRange {
  const end = shiftDateKey(utcDateKey(now), -1)
  return { start: shiftDateKey(end, -89), end }
}

export function monday(date: string): string {
  return shiftDateKey(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7))
}

/** 默认当前自然周、自然月；统计范围另行裁剪到最近 90 个已结束日。 */
export function periodRange(period: Exclude<RewardsPeriod, 'custom'>, offset: number, bounds: RewardsRange): RewardsRange {
  if (period === '90') return { ...bounds }
  const today = shiftDateKey(bounds.end, 1)
  if (period === 'week') {
    const start = shiftDateKey(monday(today), offset * 7)
    return { start, end: shiftDateKey(start, 6) }
  }
  const d = new Date(`${today}T00:00:00Z`)
  const start = utcDateKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))
  const next = utcDateKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 1))
  return { start, end: shiftDateKey(next, -1) }
}

export function clipRange(range: RewardsRange, bounds: RewardsRange): RewardsRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end)) return null
  for (const date of [range.start, range.end]) {
    const time = Date.parse(`${date}T00:00:00Z`)
    if (!Number.isFinite(time) || utcDateKey(time) !== date) return null
  }
  const start = range.start < bounds.start ? bounds.start : range.start
  const end = range.end > bounds.end ? bounds.end : range.end
  return start <= end ? { start, end } : null
}

export function rangeRows(history: RewardsHistory, impressions: Record<string, DailyImpressions>, range: RewardsRange): DailyConversionRow[] {
  return buildDailyConversion(history, impressions, range.end, rangeDays(range))
}

/** 缺失值不按零相加；完整率与汇总一起传给页面及导出图片。 */
export function summarizeMetric(rows: DailyConversionRow[], metric: RewardsMetric) {
  const known = rows.map(row => row[metric]).filter((v): v is number => v !== null && Number.isFinite(v))
  return { value: known.length === rows.length && rows.length > 0 ? known.reduce((a, b) => a + b, 0) : null, recorded: known.length, days: rows.length }
}

/** 部分时段只展示已知日的合计；value 仍保留完整汇总语义，供同期比较使用。 */
export function observedMetric(rows: DailyConversionRow[], metric: RewardsMetric) {
  const summary = summarizeMetric(rows, metric)
  const known = rows.filter(row => row[metric] !== null && Number.isFinite(row[metric]))
  return {
    ...summary,
    observedValue: known.length ? known.reduce((sum, row) => sum + row[metric]!, 0) : null,
  }
}

/** 同一时段共享尺度，数字、短条长度和高值底色共同表达大小。 */
export function dailyEmphasis(rows: DailyConversionRow[], metric: RewardsMetric) {
  const known = rows.filter(row => row[metric] !== null && Number.isFinite(row[metric]))
  const max = Math.max(0, ...known.map(row => row[metric]!))
  const magnitude = Math.max(0, ...known.map(row => Math.abs(row[metric]!)))
  return Object.fromEntries(rows.map(row => {
    const value = row[metric]
    return [row.date, {
      high: value !== null && max > 0 && value >= max * .75,
      peak: max > 0 && value === max,
      percent: value !== null && magnitude > 0 ? Math.abs(value) / magnitude * 100 : 0,
    }]
  })) as Record<string, { high: boolean; peak: boolean; percent: number }>
}

export function chartBuckets(rows: DailyConversionRow[], metric: RewardsMetric, weekly: boolean): RewardsBucket[] {
  const groups = new Map<string, DailyConversionRow[]>()
  for (const row of rows) {
    const key = weekly ? monday(row.date) : row.date
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map(group => ({ start: group[0].date, end: group[group.length - 1].date, ...summarizeMetric(group, metric) }))
}

export interface RewardsCalendarCell { date: string; row: DailyConversionRow | null }

/** 周一开头，补齐首尾空格；当月未结束的日期保留日期，但不显示数值。 */
export function calendarCells(rows: DailyConversionRow[], frame?: RewardsRange): (RewardsCalendarCell | null)[] {
  const range = frame ?? (rows.length ? { start: rows[0].date, end: rows[rows.length - 1].date } : null)
  if (!range || rangeDays(range) < 1 || rangeDays(range) > 31) return []
  const byDate = new Map(rows.map(row => [row.date, row]))
  const padding = (new Date(`${range.start}T00:00:00Z`).getUTCDay() + 6) % 7
  const cells: (RewardsCalendarCell | null)[] = Array(padding).fill(null)
  for (let i = 0; i < rangeDays(range); i++) {
    const date = shiftDateKey(range.start, i)
    cells.push({ date, row: byDate.get(date) ?? null })
  }
  while (cells.length % 7) cells.push(null)
  return cells
}

export function comparisonPercent(current: number | null, previous: number | null): number | null {
  // 零或负基数的百分比容易误读，保留绝对值，不展示百分比。
  return current === null || previous === null || previous <= 0 ? null : (current - previous) / previous * 100
}

/** 页面与 PNG 共用坐标，负值画在零线下方，缺失值不画柱子。 */
export function chartGeometry(buckets: RewardsBucket[], width = 920, height = 230) {
  const values = buckets.flatMap(b => b.value === null ? [] : [b.value])
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values) || (min === 0 ? 1 : 0)
  const y = (v: number) => 12 + (max - v) / (max - min) * (height - 24)
  const zero = y(0)
  const step = width / Math.max(1, buckets.length)
  const bars = buckets.map((b, i) => ({
    x: i * step + step * .2,
    y: b.value === null ? zero : Math.min(zero, y(b.value)),
    width: step * .6,
    height: b.value === null ? 0 : Math.max(2, Math.abs(y(b.value) - zero)),
  }))
  return { bars, zero, max, min }
}

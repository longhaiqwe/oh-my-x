import { describe, expect, it } from 'vitest'
import {
  addRewardsSnapshot,
  buildAccountOverviewVariables,
  buildDailyConversion,
  isRewardsHistoryMissingToday,
  mergeImpressionsDays,
  parseAccountOverviewDaily,
  parseImpressionsCache,
  parseRewardsHistory,
  persistCreatorRewardsStats,
  rewardsDataDate,
  shiftDateKey,
} from '../../shared/creator-rewards-daily'
import { KeyCreatorRewardsHistory, KeyCreatorRewardsStats } from '../../storage-keys'
import type { CreatorRewardsStats } from '../../shared/creator-rewards'

// 北京时间 = UTC + 8；奖励计划在 UTC 02:30（北京 10:30）更新到前一天
const utc = (iso: string) => Date.parse(`${iso}Z`)

describe('rewardsDataDate 读数截至哪一天', () => {
  it('UTC 02:30 之后读到的是前一天的累计', () => {
    expect(rewardsDataDate(utc('2026-10-18T06:35:00'))).toBe('2026-10-17') // 北京 14:35
    expect(rewardsDataDate(utc('2026-10-18T02:30:00'))).toBe('2026-10-17') // 北京 10:30
  })

  it('UTC 02:30 之前读到的还是前天的累计', () => {
    expect(rewardsDataDate(utc('2026-10-18T01:00:00'))).toBe('2026-10-16') // 北京 09:00
    expect(rewardsDataDate(utc('2026-10-17T23:00:00'))).toBe('2026-10-16') // 北京 10-18 07:00
  })

  it('shiftDateKey 跨月计算正确', () => {
    expect(shiftDateKey('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('addRewardsSnapshot 记录每日累计数', () => {
  it('按读数日期记入，同一天再读到新值时覆盖', () => {
    let history = addRewardsSnapshot({}, 224600, utc('2026-10-18T06:35:00'))
    expect(history).toEqual({ '2026-10-17': 224600 })
    history = addRewardsSnapshot(history, 224700, utc('2026-10-18T09:00:00'))
    expect(history).toEqual({ '2026-10-17': 224700 })
  })

  it('读数和前一天相同视为 X 还没更新，不记', () => {
    const history = { '2026-10-17': 224600 }
    expect(addRewardsSnapshot(history, 224600, utc('2026-10-19T03:00:00'))).toBe(history)
  })

  it('忽略无效读数', () => {
    const history = { '2026-10-17': 224600 }
    expect(addRewardsSnapshot(history, 0, utc('2026-10-19T03:00:00'))).toBe(history)
    expect(addRewardsSnapshot(history, 230000, 0)).toBe(history)
  })

  it('只保留最近 120 天', () => {
    let history = {}
    const start = utc('2026-01-01T06:00:00')
    for (let i = 0; i < 130; i++) history = addRewardsSnapshot(history, 1000 + i, start + i * 86400000)
    const dates = Object.keys(history).sort()
    expect(dates).toHaveLength(120)
    expect(dates[0]).toBe('2026-01-10')
  })

  it('isRewardsHistoryMissingToday：过了 10:30 还没有昨天的记录就算缺', () => {
    const history = { '2026-10-17': 224600 }
    expect(isRewardsHistoryMissingToday(history, utc('2026-10-18T06:00:00'))).toBe(false)
    expect(isRewardsHistoryMissingToday(history, utc('2026-10-19T01:00:00'))).toBe(false)
    expect(isRewardsHistoryMissingToday(history, utc('2026-10-19T03:00:00'))).toBe(true)
  })
})

describe('parseAccountOverviewDaily 汇总账号分析的每日曝光', () => {
  const day1 = Date.UTC(2026, 9, 16)
  const day2 = Date.UTC(2026, 9, 17)
  const response = {
    data: {
      viewer_v2: {
        user_results: {
          result: {
            current_time_series: [
              { count: 2549, engagement_type: 'Displayed', is_engaging_user_verified: 'true', timestamp: day1 },
              { count: 11631, engagement_type: 'Displayed', is_engaging_user_verified: 'false', timestamp: day1 },
              { count: 538, engagement_type: 'HomeLinger', is_engaging_user_verified: 'true', timestamp: day1 },
              { count: 4904, engagement_type: 'Displayed', is_engaging_user_verified: 'true', timestamp: day2 },
              { count: '15440', engagement_type: 'Displayed', is_engaging_user_verified: 'false', timestamp: day2 },
              { count: 95, engagement_type: 'Fav', is_engaging_user_verified: 'true', timestamp: day2 },
            ],
          },
        },
      },
    },
  }

  it('只算 Displayed，按天拆出整体和蓝 V', () => {
    expect(parseAccountOverviewDaily(response)).toEqual({
      '2026-10-16': { total: 14180, verified: 2549 },
      '2026-10-17': { total: 20344, verified: 4904 },
    })
  })

  it('结构不对时返回 null', () => {
    expect(parseAccountOverviewDaily({ data: {} })).toBeNull()
    expect(parseAccountOverviewDaily(null)).toBeNull()
  })

  it('请求参数覆盖最近 14 天（含今天）', () => {
    const vars = buildAccountOverviewVariables(utc('2026-10-18T06:35:00'))
    expect(vars.current_to_iso).toBe('2026-10-19T00:00:00.000Z')
    expect(vars.current_from_iso).toBe('2026-10-05T00:00:00.000Z')
    expect(vars.prev_to).toBe(vars.current_from)
  })
})

describe('buildDailyConversion 每天三个数', () => {
  const history = { '2026-10-15': 216000, '2026-10-16': 219700, '2026-10-17': 224600 }
  const impressions = {
    '2026-10-16': { total: 14180, verified: 2549 },
    '2026-10-17': { total: 20344, verified: 4904 },
  }

  it('计入奖励 = 当天累计 − 前一天累计，缺一天为 null', () => {
    const rows = buildDailyConversion(history, impressions, '2026-10-17', 4)
    expect(rows.map((r) => r.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(rows.map((r) => r.counted)).toEqual([null, null, 3700, 4900])
    expect(rows[3]).toEqual({ date: '2026-10-17', total: 20344, verified: 4904, counted: 4900 })
    expect(rows[1].total).toBeNull()
  })
})

describe('存储解析与合并', () => {
  it('parseRewardsHistory 接受 JSON 字符串，过滤非法项', () => {
    expect(parseRewardsHistory('{"2026-10-17":224600,"bad":1,"2026-10-16":-5}')).toEqual({ '2026-10-17': 224600 })
    expect(parseRewardsHistory('not json')).toEqual({})
    expect(parseRewardsHistory(undefined)).toEqual({})
  })

  it('parseImpressionsCache 需要 updatedAt', () => {
    expect(parseImpressionsCache('{"days":{}}')).toBeNull()
    expect(parseImpressionsCache({ days: { '2026-10-17': { total: 1, verified: 0 } }, updatedAt: 5 })).toEqual({
      days: { '2026-10-17': { total: 1, verified: 0 } },
      updatedAt: 5,
    })
  })

  it('mergeImpressionsDays 新数据覆盖旧数据，只留 30 天', () => {
    const days: Record<string, { total: number; verified: number }> = {}
    for (let i = 0; i < 35; i++) days[shiftDateKey('2026-09-01', i)] = { total: i, verified: 0 }
    const merged = mergeImpressionsDays({ days, updatedAt: 1 }, { '2026-10-05': { total: 99, verified: 9 } }, 2)
    expect(Object.keys(merged.days)).toHaveLength(30)
    expect(merged.days['2026-10-05']).toEqual({ total: 99, verified: 9 })
    expect(merged.updatedAt).toBe(2)
  })

  it('persistCreatorRewardsStats 同时写最新读数和每日记录', async () => {
    const store: Record<string, unknown> = {
      [KeyCreatorRewardsHistory]: JSON.stringify({ '2026-10-16': 219700 }),
    }
    const storage = {
      get: async (key: string | string[]) => ({ [key as string]: store[key as string] }),
      set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
    }
    const stats = { impressionsCount: 224600, updatedAt: utc('2026-10-18T06:35:00') } as CreatorRewardsStats
    const history = await persistCreatorRewardsStats(stats, storage)
    expect(history).toEqual({ '2026-10-16': 219700, '2026-10-17': 224600 })
    expect(JSON.parse(store[KeyCreatorRewardsStats] as string).impressionsCount).toBe(224600)
    expect(JSON.parse(store[KeyCreatorRewardsHistory] as string)).toEqual(history)
  })
})

import { describe, expect, it } from 'vitest'
import { calendarCells, dailyEmphasis, observedMetric, chartBuckets, chartGeometry, clipRange, comparisonPercent, dashboardBounds, periodRange, rangeRows, summarizeMetric } from '../../shared/creator-rewards-dashboard'
import { buildAccountOverviewVariables } from '../../shared/creator-rewards-daily'

const bounds = dashboardBounds(Date.parse('2026-11-12T03:00:00Z'))
describe('奖励历史日期范围', () => {
  it('只显示 90 个已结束的 UTC 统计日', () => {
    expect(bounds).toEqual({ start: '2026-08-14', end: '2026-11-11' })
    expect(periodRange('90', 0, bounds)).toEqual(bounds)
  })
  it('默认当前完整周，上一周及周一也正确', () => {
    expect(periodRange('week', 0, bounds)).toEqual({ start: '2026-11-09', end: '2026-11-15' })
    expect(periodRange('week', -1, bounds)).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(periodRange('week', 0, dashboardBounds(Date.parse('2026-11-09T02:00:00Z')))).toEqual({ start: '2026-11-09', end: '2026-11-15' })
    expect(periodRange('week', 0, dashboardBounds(Date.parse('2026-11-01T02:00:00Z')))).toEqual({ start: '2026-10-26', end: '2026-11-01' })
  })
  it('自然月按实际天数，当前月与最早月份裁剪', () => {
    expect(clipRange(periodRange('month', 0, bounds), bounds)).toEqual({ start: '2026-11-01', end: '2026-11-11' })
    expect(clipRange(periodRange('month', -3, bounds), bounds)).toEqual({ start: '2026-08-14', end: '2026-08-31' })
    expect(clipRange(periodRange('month', -4, bounds), bounds)).toBeNull()
    const leap = dashboardBounds(Date.parse('2024-03-05T00:00:00Z'))
    expect(periodRange('month', -1, leap)).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })
  it('拒绝无效或倒置日期', () => {
    for (const range of [{start: '',end: bounds.end}, {start: '2026-11-12',end: bounds.end}, {start: '2026-09-31', end: bounds.end}]) expect(clipRange(range, bounds)).toBeNull()
  })
  it('91 天请求含今天，覆盖全部 90 个已结束日，后台默认仍是 14 天', () => {
    const now = Date.parse('2026-11-12T03:00:00Z')
    expect(buildAccountOverviewVariables(now, 91).current_from_iso).toBe('2026-08-14T00:00:00.000Z')
    expect(buildAccountOverviewVariables(now, 999).current_from_iso).toBe('2026-08-14T00:00:00.000Z')
    expect(buildAccountOverviewVariables(now).current_from_iso).toBe('2026-10-30T00:00:00.000Z')
  })
})
describe('净变化、缺失和图表', () => {
  const rows = rangeRows({ '2026-11-01': 100, '2026-11-02': 90, '2026-11-03': 120 }, { '2026-11-02': {total: 0, verified: 0}, '2026-11-03': {total: 80, verified: 30} }, {start: '2026-11-02', end: '2026-11-04'})
  it('负增长保留，真实零与缺失分开', () => {
    expect(rows.map(r => r.counted)).toEqual([-10, 30, null])
    expect(summarizeMetric(rows, 'total')).toEqual({value:null, recorded:2, days:3})
    expect(summarizeMetric(rows.slice(0, 2), 'counted').value).toBe(20)
    expect(summarizeMetric(rows.slice(0, 1), 'total').value).toBe(0)
  })
  it('按周汇总有缺口时不显示不完整合计，日图保留负值', () => {
    const weekly = chartBuckets(rows, 'counted', true)
    expect(weekly).toEqual([{start:'2026-11-02',end:'2026-11-04',value:null,recorded:2,days:3}])
    const daily = chartBuckets(rows, 'counted', false)
    const g = chartGeometry(daily)
    expect(g.bars[0].y).toBe(g.zero)
    expect(g.bars[0].height).toBeGreaterThan(0)
    expect(g.bars[1].y).toBeLessThan(g.zero)
    expect(g.bars[2].height).toBe(0)
  })
  it('跨周分组独立，首尾不足整周标明日期', () => {
    const r = rangeRows({}, {}, {start:'2026-11-01',end:'2026-11-09'})
    expect(chartBuckets(r, 'total', true).map(b => [b.start,b.end,b.days])).toEqual([['2026-11-01','2026-11-01',1], ['2026-11-02','2026-11-08',7], ['2026-11-09','2026-11-09',1]])
  })
  it('没有连续两天快照时，不把跨日变化错误归给某一天', () => {
    const r = rangeRows({'2026-11-01':100,'2026-11-03':200}, {}, {start:'2026-11-02',end:'2026-11-03'})
    expect(r.every(row => row.counted === null)).toBe(true)
  })
  it('仅对完整值及正基数计算百分比', () => {
    expect(comparisonPercent(80,100)).toBe(-20)
    expect(comparisonPercent(null,100)).toBeNull()
    expect(comparisonPercent(100,0)).toBeNull()
    expect(comparisonPercent(100,-50)).toBeNull()
  })
})


describe('逐日日历', () => {
  it('本周展示七天，但今天与未来日期不参与统计', () => {
    const frame = periodRange('week', 0, bounds)
    const rows = rangeRows({}, {}, clipRange(frame, bounds)!)
    const cells = calendarCells(rows, frame)
    expect(cells).toHaveLength(7)
    expect(rows.map(row => row.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
    expect(cells.slice(3).map(cell => cell?.row)).toEqual([null, null, null, null])
    expect(summarizeMetric(rows, 'counted').days).toBe(3)
  })
  it('周一尚无已结束统计日，仍保留完整本周空日历', () => {
    const bounds = dashboardBounds(Date.parse('2026-11-09T03:00:00Z'))
    const frame = periodRange('week', 0, bounds)
    expect(clipRange(frame, bounds)).toBeNull()
    const cells = calendarCells([], frame)
    expect(cells).toHaveLength(7)
    expect(cells[0]).toEqual({ date: '2026-11-09', row: null })
    expect(cells[6]).toEqual({ date: '2026-11-15', row: null })
    expect(cells.every(cell => cell?.row === null)).toBe(true)
  })
  it('完整自然月按周一对齐，六行月份保留尚未结束的日期', () => {
    const rows = rangeRows({}, {}, {start:'2026-11-01',end:'2026-11-11'})
    const cells = calendarCells(rows, {start:'2026-11-01',end:'2026-11-30'})
    expect(cells).toHaveLength(42)
    expect(cells.slice(0,6)).toEqual(Array(6).fill(null))
    expect(cells[6]?.date).toBe('2026-11-01')
    expect(cells[16]?.row?.date).toBe('2026-11-11')
    expect(cells[17]).toEqual({date:'2026-11-12',row:null})
  })
  it('日历保留真实零、负数和缺失；完整周仅一行', () => {
    const rows = rangeRows({'2026-11-01':100,'2026-11-02':100,'2026-11-03':90}, {}, {start:'2026-11-02',end:'2026-11-08'})
    const cells = calendarCells(rows)
    expect(cells).toHaveLength(7)
    expect(cells.slice(0,3).map(cell => cell?.row?.counted)).toEqual([0,-10,null])
  })
  it('跨月自选日期按实际日期排列，长于 31 天不生成日历', () => {
    expect(calendarCells(rangeRows({}, {}, {start:'2026-10-30',end:'2026-11-02'})).filter(Boolean).map(cell => cell!.date)).toEqual(['2026-10-30','2026-10-31','2026-11-01','2026-11-02'])
    expect(calendarCells(rangeRows({}, {}, {start:'2026-10-01',end:'2026-11-02'}))).toEqual([])
  })
})


describe('重点指标与每日大小', () => {
  const rows = rangeRows({'2026-11-01':100,'2026-11-02':130,'2026-11-03':120}, {'2026-11-02':{total:0,verified:0}}, {start:'2026-11-02',end:'2026-11-04'})
  it('部分合计包含正负已知值，但完整合计及同比仍不可用', () => {
    expect(observedMetric(rows, 'counted')).toEqual({value:null,observedValue:20,recorded:2,days:3})
    expect(observedMetric(rows, 'total').observedValue).toBe(0)
    expect(observedMetric(rows.slice(2), 'counted').observedValue).toBeNull()
  })
  it('最高标记随指标变化，缺失与负值不进入正值高亮', () => {
    const emphasis = dailyEmphasis(rows, 'counted')
    expect(emphasis['2026-11-02']).toEqual({high:true,peak:true,percent:100})
    expect(emphasis['2026-11-03'].high).toBe(false)
    expect(emphasis['2026-11-04'].percent).toBe(0)
    expect(Object.values(dailyEmphasis(rows, 'total')).every(day => !day.peak && !day.high)).toBe(true)
  })
})

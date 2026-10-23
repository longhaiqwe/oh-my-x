import { describe, expect, it } from 'vitest'
import {
  SEARCH_AI_MAX_INPUT,
  SEARCH_AI_MAX_QUERY,
  buildSearchQueryMessages,
  buildSearchQueryPrompt,
  formatLocalDate,
  parseSearchQueryResponse,
  searchDateAnchors,
} from '../../shared/search-ai'

// 2026-10-23 是星期五，本机时间
const NOW = new Date(2026, 9, 23, 19, 30)

describe('日期', () => {
  it('按本机时间算好常用日期', () => {
    expect(searchDateAnchors(NOW)).toEqual({
      today: '2026-10-23',
      weekday: 'Friday',
      yesterday: '2026-10-22',
      weekAgo: '2026-10-16',
      monthAgo: '2026-09-23',
      monthStart: '2026-10-01',
      yearStart: '2026-01-01',
    })
  })

  it('跨月、跨年时日期正确', () => {
    expect(searchDateAnchors(new Date(2026, 0, 3)).weekAgo).toBe('2025-12-27')
    expect(formatLocalDate(new Date(2026, 2, 1))).toBe('2026-03-01')
  })
})

describe('提示词', () => {
  it('写明今天的日期、「上周」怎么换算，示例和用户举的例子一致', () => {
    const prompt = buildSearchQueryPrompt(NOW)
    expect(prompt).toContain('today is 2026-10-23 (Friday)')
    expect(prompt).toContain('"上周", "最近一周" mean since:2026-10-16')
    expect(prompt).toContain('上周关于 Claude、点赞过千的中文帖 → {"query": "Claude lang:zh min_faves:1000 since:2026-10-16"}')
    expect(prompt).toContain('Reply with JSON only')
  })

  it('用户文字去掉首尾空白、限制长度后放在第二条消息', () => {
    const [system, user] = buildSearchQueryMessages(`  ${'字'.repeat(SEARCH_AI_MAX_INPUT + 20)}  `, NOW)
    expect(system.role).toBe('system')
    expect(user).toEqual({ role: 'user', content: '字'.repeat(SEARCH_AI_MAX_INPUT) })
  })
})

describe('parseSearchQueryResponse', () => {
  it('读 JSON 里的 query，压缩空白', () => {
    expect(parseSearchQueryResponse('{"query": "Claude   lang:zh\\nmin_faves:1000"}')).toBe('Claude lang:zh min_faves:1000')
  })

  it('读代码块里的 JSON 和 JSON 前后多出来的文字', () => {
    expect(parseSearchQueryResponse('```json\n{"query": "from:nasa filter:videos"}\n```')).toBe('from:nasa filter:videos')
    expect(parseSearchQueryResponse('好的：{"query": "a OR b"} 希望有用')).toBe('a OR b')
  })

  it('没有 JSON 时用第一行文字，去掉反引号，保留表示精确短语的双引号', () => {
    expect(parseSearchQueryResponse('`"claude code" min_faves:100`\n解释：……')).toBe('"claude code" min_faves:100')
  })

  it('搜索词过长时截断', () => {
    expect(parseSearchQueryResponse(JSON.stringify({ query: 'a'.repeat(SEARCH_AI_MAX_QUERY + 10) }))).toHaveLength(SEARCH_AI_MAX_QUERY)
  })

  it('取不到搜索词时报错代号 error.searchAiEmpty', () => {
    for (const content of ['', '   ', '{"query": ""}', '{"answer": "x"}', '{"query": 42}']) {
      expect(() => parseSearchQueryResponse(content)).toThrow(expect.objectContaining({ code: 'error.searchAiEmpty' }))
    }
  })
})

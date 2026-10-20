import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPLY_SCORE_PROMPT_VERSION } from '../../shared/ai-reply-score'
import {
  REPLY_SCORE_MAX_ENTRIES,
  REPLY_SCORE_TTL_MS,
  createMemoryReplyScoreRepository,
  createReplyScoreRepository,
  type StoredReplyScore,
} from '../../shared/reply-score-db'
import { createReplyScoreUsage, parseReplyScoreUsage } from '../../shared/reply-score-usage'
import { KeySpamAiUsage } from '../../storage-keys'

function entry(id: string, savedAt: number, promptVersion = REPLY_SCORE_PROMPT_VERSION): StoredReplyScore {
  return { id, score: 50, signals: [], reason: '', model: 'm', promptVersion, savedAt }
}

describe('AI 打分缓存', () => {
  it('过期和提示词版本不一致的结果当作没有', async () => {
    let now = REPLY_SCORE_TTL_MS * 2
    const repo = createMemoryReplyScoreRepository(() => now)
    await repo.putMany([entry('1', now), entry('2', now - REPLY_SCORE_TTL_MS + 1000), entry('3', now, REPLY_SCORE_PROMPT_VERSION - 1)])
    expect([...(await repo.getMany(['1', '2', '3', '4'])).keys()]).toEqual(['1', '2'])
    now += 2000
    expect([...(await repo.getMany(['1', '2'])).keys()]).toEqual(['1'])
  })

  it('超过条数上限时删掉最早写入的', async () => {
    const repo = createMemoryReplyScoreRepository(() => 1000)
    const list = Array.from({ length: REPLY_SCORE_MAX_ENTRIES + 3 }, (_, i) => entry(String(i), 1000))
    await repo.putMany(list)
    expect(repo.size()).toBe(REPLY_SCORE_MAX_ENTRIES)
    const found = await repo.getMany(['0', '2', '3', String(REPLY_SCORE_MAX_ENTRIES + 2)])
    expect([...found.keys()]).toEqual(['3', String(REPLY_SCORE_MAX_ENTRIES + 2)])
  })

  it('没有 IndexedDB 时退回内存存储', async () => {
    expect(typeof indexedDB).toBe('undefined')
    const repo = createReplyScoreRepository('test-db', () => 1000)
    await repo.putMany([entry('7', 1000)])
    expect((await repo.getMany(['7'])).get('7')?.score).toBe(50)
  })
})

describe('AI 打分用量', () => {
  afterEach(() => vi.useRealTimers())

  it('不是今天的记录归零，损坏的字段按 0 算', () => {
    expect(parseReplyScoreUsage({ date: '2026-10-19', auto: 5 }, '2026-10-20')).toEqual({ date: '2026-10-20', auto: 0, manual: 0, cached: 0, failed: 0, folded: 0 })
    expect(parseReplyScoreUsage({ date: '2026-10-20', auto: 5.7, manual: -1, cached: 'x' }, '2026-10-20')).toEqual({ date: '2026-10-20', auto: 5, manual: 0, cached: 0, failed: 0, folded: 0 })
  })

  it('累计后 5 秒合并写一次；读取时包括还没写入的部分', async () => {
    vi.useFakeTimers()
    const store: Record<string, unknown> = { [KeySpamAiUsage]: { date: '2026-10-20', auto: 10, manual: 0, cached: 1, failed: 0 } }
    const storage = { get: vi.fn(async (key: string) => ({ [key]: store[key] })), set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items) }) }
    const usage = createReplyScoreUsage(() => storage, () => '2026-10-20')
    usage.add({ auto: 3, failed: 1 })
    usage.add({ cached: 2 })
    expect((await usage.read()).auto).toBe(13)
    expect(storage.set).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(storage.set).toHaveBeenCalledTimes(1)
    expect(store[KeySpamAiUsage]).toEqual({ date: '2026-10-20', auto: 13, manual: 0, cached: 3, failed: 1, folded: 0 })
    expect((await usage.read()).auto).toBe(13)
  })

  it('跨天时先把前一天的累计写进前一天', async () => {
    vi.useFakeTimers()
    let day = '2026-10-20'
    const store: Record<string, unknown> = {}
    const storage = { get: async (key: string) => ({ [key]: store[key] }), set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items) }) }
    const usage = createReplyScoreUsage(() => storage, () => day)
    usage.add({ auto: 4 })
    day = '2026-10-21'
    usage.add({ auto: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(storage.set).toHaveBeenCalledWith({ [KeySpamAiUsage]: { date: '2026-10-20', auto: 4, manual: 0, cached: 0, failed: 0, folded: 0 } })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(store[KeySpamAiUsage]).toEqual({ date: '2026-10-21', auto: 1, manual: 0, cached: 0, failed: 0, folded: 0 })
  })
})

describe('标注存储', () => {
  const label = (id: string, value: 'bot' | 'human', labeledAt: number) => ({
    id, label: value, author: 'bob', text: '回复', parentAuthor: 'alice', parentText: '主帖',
    delaySeconds: 30, followers: 64, verified: true, ai: null, labeledAt,
  })

  it('存、查、改、删，列出时按标注时间排序；标注不过期', async () => {
    let now = 1000
    const repo = createMemoryReplyScoreRepository(() => now)
    await repo.putLabel(label('2', 'bot', 2000))
    await repo.putLabel(label('1', 'human', 1000))
    expect([...(await repo.getLabels(['1', '2', '3']))]).toEqual([['1', 'human'], ['2', 'bot']])
    await repo.putLabel(label('1', 'bot', 3000))
    now += REPLY_SCORE_TTL_MS * 10
    expect((await repo.allLabels()).map((l) => [l.id, l.label])).toEqual([['2', 'bot'], ['1', 'bot']])
    await repo.deleteLabel('2')
    expect((await repo.allLabels()).map((l) => l.id)).toEqual(['1'])
  })

  it('没有 IndexedDB 时标注也退回内存存储', async () => {
    const repo = createReplyScoreRepository('test-db-labels', () => 1000)
    await repo.putLabel(label('9', 'bot', 1000))
    expect((await repo.getLabels(['9'])).get('9')).toBe('bot')
  })
})

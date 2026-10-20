import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_LOOKUP_DELAY_MS, AI_SCORE_DELAY_MS, createAiScorer, type AiScorerDeps } from '../../content-scripts/spam/ai-scorer'
import type { ReplyScore } from '../../shared/ai-reply-score'
import type { AiResponse } from '../../shared/ai-request'

const parent = { id: '100', author: 'me', text: '主帖' }
const item = (id: string) => ({ id, author: `u${id}`, text: `回复 ${id}`, delaySeconds: 60 })
const score = (id: string, value = 80): ReplyScore => ({ id, score: value, signals: ['S1'], reason: '万能回复' })

let deps: AiScorerDeps & { lookup: ReturnType<typeof vi.fn>; score: ReturnType<typeof vi.fn> }
let path = '/me/status/100'

beforeEach(() => {
  vi.useFakeTimers()
  path = '/me/status/100'
  deps = {
    lookup: vi.fn(async () => [] as ReplyScore[]),
    score: vi.fn(async (message: any): Promise<AiResponse> => ({ ok: true, scores: message.replies.map((r: any) => score(r.id)) })),
    today: () => '2026-10-20',
    path: () => path,
  }
})
afterEach(() => vi.useRealTimers())

async function settle(ms = AI_LOOKUP_DELAY_MS + AI_SCORE_DELAY_MS) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('AI 打分队列', () => {
  it('先攒 300ms 查缓存，命中的直接用，不调用模型', async () => {
    deps.lookup.mockResolvedValue([score('1', 12)])
    const scorer = createAiScorer(deps)
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'pending' })
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'pending' })
    await settle(AI_LOOKUP_DELAY_MS)
    expect(deps.lookup).toHaveBeenCalledWith(['1'])
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'done', score: 12, signals: ['S1'], reason: '万能回复' })
    await settle()
    expect(deps.score).not.toHaveBeenCalled()
  })

  it('缓存没有、在自动范围内的回复攒 2 秒成一批送模型，结果回来后通知扫描器', async () => {
    const scorer = createAiScorer(deps)
    const onChange = vi.fn()
    scorer.onChange(onChange)
    scorer.request(item('1'), parent, true)
    scorer.request(item('2'), parent, true)
    await settle(AI_LOOKUP_DELAY_MS)
    expect(deps.score).not.toHaveBeenCalled()
    await settle(AI_SCORE_DELAY_MS)
    expect(deps.score).toHaveBeenCalledTimes(1)
    const message = deps.score.mock.calls[0][0]
    expect(message).toMatchObject({ type: 'XF_SCORE_REPLIES', mode: 'auto', parent, locale: 'zh-CN' })
    expect(message.replies.map((r: any) => r.id)).toEqual(['1', '2'])
    expect(scorer.request(item('2'), parent, true)).toMatchObject({ status: 'done', score: 80 })
    expect(onChange).toHaveBeenCalled()
    expect(scorer.version()).toBeGreaterThan(0)
  })

  it('满 20 条立刻发，不等 2 秒；同时只有一个请求，剩下的等这一批结束', async () => {
    let release!: () => void
    deps.score.mockImplementationOnce((message: any) => new Promise<AiResponse>((resolve) => {
      release = () => resolve({ ok: true, scores: message.replies.map((r: any) => score(r.id)) })
    }))
    const scorer = createAiScorer(deps)
    for (let i = 1; i <= 25; i++) scorer.request(item(String(i)), parent, true)
    await settle(AI_LOOKUP_DELAY_MS)
    expect(deps.score).toHaveBeenCalledTimes(1)
    expect(deps.score.mock.calls[0][0].replies).toHaveLength(20)
    await settle(AI_SCORE_DELAY_MS * 2)
    expect(deps.score).toHaveBeenCalledTimes(1)
    release()
    await settle()
    expect(deps.score).toHaveBeenCalledTimes(2)
    expect(deps.score.mock.calls[1][0].replies.map((r: any) => r.id)).toEqual(['21', '22', '23', '24', '25'])
  })

  it('不在自动范围内的回复只查缓存，状态为 manual', async () => {
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, false)
    await settle()
    expect(deps.lookup).toHaveBeenCalledTimes(1)
    expect(deps.score).not.toHaveBeenCalled()
    expect(scorer.request(item('1'), parent, false)).toEqual({ status: 'manual' })
  })

  it('今日上限到了就暂停，第二天自动恢复', async () => {
    let day = '2026-10-20'
    deps.today = () => day
    deps.score.mockResolvedValueOnce({ ok: true, scores: [], limitReached: true })
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    await settle()
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'paused', reason: 'limit', error: undefined })
    scorer.request(item('2'), parent, true)
    await settle()
    expect(deps.score).toHaveBeenCalledTimes(1)
    day = '2026-10-21'
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'pending' })
    await settle()
    expect(deps.score).toHaveBeenCalledTimes(2)
  })

  it('没填 key 等配置问题暂停为 needsConfig；设置改动后（reset）重新开始', async () => {
    deps.score.mockResolvedValueOnce({ ok: false, error: { code: 'error.aiNoKey' } })
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    await settle()
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'paused', reason: 'needsConfig', error: { code: 'error.aiNoKey' } })
    scorer.reset()
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'pending' })
    await settle()
    expect(scorer.request(item('1'), parent, true)).toMatchObject({ status: 'done' })
  })

  it('请求出错暂停为 error，暂停期间新回复也不送', async () => {
    deps.score.mockRejectedValue(new Error('network down'))
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    await settle()
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'paused', reason: 'error', error: 'network down' })
    scorer.request(item('2'), parent, true)
    await settle()
    expect(scorer.request(item('2'), parent, true)).toMatchObject({ status: 'paused', reason: 'error' })
    expect(deps.score).toHaveBeenCalledTimes(1)
  })

  it('模型漏掉的条目计一次失败，第 2 次还没有结果就显示 failed', async () => {
    deps.score.mockResolvedValue({ ok: true, scores: [] })
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    await settle()
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'pending' })
    await settle()
    expect(deps.score).toHaveBeenCalledTimes(2)
    expect(scorer.request(item('1'), parent, true)).toEqual({ status: 'failed' })
  })

  it('切换页面时清空队列并取消进行中的请求', async () => {
    let signal!: AbortSignal
    deps.score.mockImplementationOnce((_m: any, s: AbortSignal) => {
      signal = s
      return new Promise<AiResponse>(() => {})
    })
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    await settle()
    expect(signal.aborted).toBe(false)
    path = '/other/status/200'
    scorer.request(item('5'), { ...parent, id: '200' }, true)
    expect(signal.aborted).toBe(true)
    await settle()
    expect(deps.score).toHaveBeenCalledTimes(2)
    expect(deps.score.mock.calls[1][0].replies.map((r: any) => r.id)).toEqual(['5'])
  })

  it('同一批只放同一个主帖下的回复（Deck 多个对话栏）', async () => {
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    scorer.request(item('2'), { ...parent, id: '300' }, true)
    scorer.request(item('3'), parent, true)
    await settle()
    expect(deps.score.mock.calls[0][0].replies.map((r: any) => r.id)).toEqual(['1', '3'])
    await settle()
    expect(deps.score.mock.calls[1][0]).toMatchObject({ parent: { id: '300' } })
  })

  it('排队中的回复用最新一次扫描到的数据（粉丝数晚到也能送出去）', async () => {
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    scorer.request({ ...item('1'), followers: 64, verified: true }, parent, true)
    await settle(AI_LOOKUP_DELAY_MS)
    scorer.request({ ...item('1'), followers: 65, verified: true }, parent, true)
    await settle(AI_SCORE_DELAY_MS)
    expect(deps.score.mock.calls[0][0].replies[0]).toMatchObject({ id: '1', followers: 65, verified: true })
  })

  it('stop 后不再发请求', async () => {
    const scorer = createAiScorer(deps)
    scorer.request(item('1'), parent, true)
    scorer.stop()
    await settle()
    expect(deps.lookup).not.toHaveBeenCalled()
    expect(deps.score).not.toHaveBeenCalled()
  })
})

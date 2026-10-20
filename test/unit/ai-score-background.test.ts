import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { event, flushMicrotasks, portPair } from '../helpers/runtime-port'
import { KeyAiRepostApiKey, KeyAiRepostBaseUrl, KeyAiRepostModel, KeySpamAiDailyLimit, KeySpamAiModel, KeySpamAiUsage } from '../../storage-keys'
import { getTodayKey } from '../../shared/spam-logger'

let runtime: any
let permissions: any
let stored: Record<string, unknown>
let fetchMock: ReturnType<typeof vi.fn>

const parent = { id: '100', author: 'alice', text: '主帖正文' }
const replies = [
  { id: '101', author: 'bob', text: '太有启发了！', delaySeconds: 30 },
  { id: '102', author: 'carl', text: '19% 是注册还是付费？', delaySeconds: 3000 },
]
const scoreMessage = (extra: Record<string, unknown> = {}) => ({ type: 'XF_SCORE_REPLIES', parent, replies, mode: 'auto', locale: 'zh-CN', ...extra })
const modelReply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }))
const goodContent = JSON.stringify({ results: [
  { id: '101', score: 85, signals: ['S1'], reason: '万能夸奖' },
  { id: '102', score: 5, signals: [], reason: '追问具体数字' },
] })

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  runtime = { id: 'test-extension', onConnect: event(), onMessage: event(), onInstalled: event(), onStartup: event() }
  permissions = { contains: vi.fn().mockResolvedValue(true) }
  stored = { [KeyAiRepostApiKey]: 'test-key', [KeyAiRepostBaseUrl]: 'https://ai.example/v1', [KeyAiRepostModel]: 'repost-model' }
  vi.stubGlobal('browser', {
    runtime, permissions,
    storage: { local: {
      get: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys]
        return Object.fromEntries(list.filter((k) => k in stored).map((k) => [k, stored[k]]))
      }),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(stored, items) }),
    } },
    cookies: { get: vi.fn().mockResolvedValue(null) },
    alarms: { create: vi.fn(), get: vi.fn().mockResolvedValue({}), onAlarm: event() },
    downloads: { download: vi.fn() },
  })
  fetchMock = vi.fn().mockImplementation(async () => modelReply(goodContent))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('defineBackground', (fn: () => void) => fn)
  const background = await import('../../entrypoints/background')
  ;(background.default as unknown as () => void)()
  await flushMicrotasks()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

async function score(message: unknown = scoreMessage()) {
  const pair = portPair()
  runtime.onConnect.emit(pair.server)
  pair.client.postMessage(message)
  await flushMicrotasks()
  return pair.server.postMessage.mock.calls[0]?.[0]
}

function lookup(ids: unknown, sender: unknown = { id: 'test-extension', url: 'https://x.com/a/status/1' }) {
  return new Promise<any>((resolve) => {
    runtime.onMessage.emit({ type: 'XF_LOOKUP_REPLY_SCORES', ids }, sender, resolve)
    void flushMicrotasks().then(() => resolve(undefined))
  })
}

describe('AI 打分（后台）', () => {
  it('没授权接口域名时不发请求', async () => {
    permissions.contains.mockResolvedValue(false)
    expect(await score()).toMatchObject({ ok: false, error: { code: 'error.aiNotAuthorized' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('没填 key 时提示，不发请求', async () => {
    delete stored[KeyAiRepostApiKey]
    expect(await score()).toMatchObject({ ok: false, error: { code: 'error.aiNoKey' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('发出打分请求：温度 0，系统提示词带信号和输出格式，返回解析后的分数', async () => {
    const res = await score()
    expect(res).toEqual({ ok: true, model: 'repost-model', scores: [
      { id: '101', score: 85, signals: ['S1'], reason: '万能夸奖' },
      { id: '102', score: 5, signals: [], reason: '追问具体数字' },
    ] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ai.example/v1/chat/completions')
    expect(init.credentials).toBe('omit')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('repost-model')
    expect(body.temperature).toBe(0)
    expect(body.response_format).toBeUndefined()
    expect(body.messages[0].content).toContain('S10')
    expect(body.messages[0].content).toContain('## 输出格式')
    expect(JSON.parse(body.messages[1].content).replies.map((r: any) => r.id)).toEqual(['101', '102'])
  })

  it('打过分的回复走缓存，不再调用模型；查缓存消息也能取到', async () => {
    await score()
    expect(await score()).toMatchObject({ ok: true, scores: [{ id: '101' }, { id: '102' }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await lookup(['101', '999', 'bad id'])).toEqual({ ok: true, scores: [{ id: '101', score: 85, signals: ['S1'], reason: '万能夸奖' }], labels: [] })
  })

  it('查缓存只接受本插件发来的消息', async () => {
    await score()
    expect(await lookup(['101'], { id: 'other-extension' })).toBeUndefined()
  })

  it('填了打分模型时用它；已知支持的服务带 JSON 模式', async () => {
    stored[KeySpamAiModel] = 'score-model'
    stored[KeyAiRepostBaseUrl] = 'https://api.deepseek.com/v1'
    await score()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('score-model')
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('自动判断达到每日上限时不发请求；手动不受限制', async () => {
    stored[KeySpamAiDailyLimit] = 5
    stored[KeySpamAiUsage] = { date: getTodayKey(), auto: 5, manual: 0, cached: 0, failed: 0 }
    expect(await score()).toEqual({ ok: true, scores: [], limitReached: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await score(scoreMessage({ mode: 'manual' }))).toMatchObject({ ok: true, scores: [{ id: '101' }, { id: '102' }] })
  })

  it('剩余额度不够一批时只送剩下的条数，并计入当天用量', async () => {
    stored[KeySpamAiDailyLimit] = 6
    stored[KeySpamAiUsage] = { date: getTodayKey(), auto: 5, manual: 0, cached: 0, failed: 0 }
    await score()
    const sent = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content).replies
    expect(sent.map((r: any) => r.id)).toEqual(['101'])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(stored[KeySpamAiUsage]).toMatchObject({ auto: 6, failed: 0 })
  })

  it('模型返回解析不出来时报错，并计入失败', async () => {
    fetchMock.mockImplementation(async () => modelReply('抱歉，我无法判断'))
    expect(await score()).toMatchObject({ ok: false, error: { code: 'error.aiScoreParse' } })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(stored[KeySpamAiUsage]).toMatchObject({ auto: 2, failed: 2 })
  })

  it('粉丝数和蓝 V 校验后送给模型：不合法的值改成 null', async () => {
    await score(scoreMessage({ replies: [
      { id: '101', author: 'bob', text: '回复一', delaySeconds: 30, followers: 64.7, verified: true },
      { id: '102', author: 'carl', text: '回复二', delaySeconds: 30, followers: -3, verified: 'yes' },
    ] }))
    const sent = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content).replies
    expect(sent.map((r: any) => [r.followers, r.verified])).toEqual([[64, true], [null, null]])
  })

  it('请求内容不合法时报错', async () => {
    expect(await score(scoreMessage({ replies: [{ id: 'abc', text: 'x' }, { id: '5', text: '   ' }] }))).toMatchObject({ ok: false, error: { code: 'error.aiUnsupported' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('样例集测试（后台）', () => {
  it('按序号给一段样例对话打分，返回接口用量；不写缓存，不计入当天用量', async () => {
    const { REPLY_SCORE_SAMPLE_THREADS } = await import('../../shared/ai-reply-samples')
    const thread = REPLY_SCORE_SAMPLE_THREADS[1]
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ results: thread.replies.map((r) => ({ id: r.id, score: 80, signals: [], reason: 'x' })) }) } }],
      usage: { prompt_tokens: 1200, completion_tokens: 300 },
    })))
    const res = await score({ type: 'XF_TEST_REPLY_SCORE_SAMPLES', threadIndex: 1, locale: 'en' })
    expect(res).toMatchObject({ ok: true, usage: { promptTokens: 1200, completionTokens: 300 }, model: 'repost-model' })
    expect(res.scores).toHaveLength(thread.replies.length)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].content).toContain('## Output format')
    expect(JSON.parse(body.messages[1].content).replies.map((r: any) => r.id)).toEqual(thread.replies.map((r) => r.id))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(stored[KeySpamAiUsage]).toBeUndefined()
    expect(await lookup(thread.replies.map((r) => r.id))).toEqual({ ok: true, scores: [], labels: [] })
  })

  it('服务没返回用量时为 null；序号不存在时报错', async () => {
    const { REPLY_SCORE_SAMPLE_THREADS } = await import('../../shared/ai-reply-samples')
    fetchMock.mockImplementation(async () => modelReply(JSON.stringify({ results: [] })))
    expect(await score({ type: 'XF_TEST_REPLY_SCORE_SAMPLES', threadIndex: 0 })).toMatchObject({ ok: true, usage: null })
    expect(await score({ type: 'XF_TEST_REPLY_SCORE_SAMPLES', threadIndex: REPLY_SCORE_SAMPLE_THREADS.length })).toMatchObject({ ok: false, error: { code: 'error.aiUnsupported' } })
  })

  it('完整设置页可以发 AI 请求，其他扩展页面不行', async () => {
    const fromOptions = portPair({ id: 'test-extension', url: 'chrome-extension://test-extension/options.html#filter' })
    runtime.onConnect.emit(fromOptions.server)
    fromOptions.client.postMessage(scoreMessage())
    await flushMicrotasks()
    expect(fromOptions.server.postMessage.mock.calls[0][0]).toMatchObject({ ok: true })

    const fromOther = portPair({ id: 'test-extension', url: 'chrome-extension://test-extension/other.html' })
    runtime.onConnect.emit(fromOther.server)
    expect(fromOther.server.disconnect).toHaveBeenCalled()
  })
})

describe('折叠计数和打开设置页（后台）', () => {
  it('页面报一次折叠，当天折叠数加 1；打开设置页定位到过滤模块；别的扩展发来的不处理', async () => {
    const create = vi.fn()
    ;(globalThis as any).browser.tabs = { create }
    ;(globalThis as any).browser.runtime.getURL = (path: string) => `chrome-extension://test-extension${path}`
    const sender = { id: 'test-extension', url: 'https://x.com/a/status/1' }
    runtime.onMessage.emit({ type: 'XF_REPLY_SCORE_FOLDED' }, sender, () => {})
    runtime.onMessage.emit({ type: 'XF_REPLY_SCORE_FOLDED' }, { id: 'other' }, () => {})
    runtime.onMessage.emit({ type: 'XF_OPEN_SETTINGS' }, sender, () => {})
    await vi.advanceTimersByTimeAsync(5_000)
    expect(stored[KeySpamAiUsage]).toMatchObject({ folded: 1 })
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test-extension/options.html#filter' })
  })
})

describe('标注（后台）', () => {
  const sender = { id: 'test-extension', url: 'https://x.com/a/status/1' }
  function send(message: unknown, from: unknown = sender) {
    return new Promise<any>((resolve) => {
      runtime.onMessage.emit(message, from, resolve)
      void flushMicrotasks().then(() => resolve(undefined))
    })
  }
  const labelMessage = (label: 'bot' | 'human' | null, ai: unknown = { score: 85, signals: ['S1'], reason: '万能夸奖' }) => ({
    type: 'XF_REPLY_LABEL_SET', id: '101', label, ai,
    item: { id: '101', author: 'bob', text: '太有启发了！', delaySeconds: 30, followers: 64, verified: true },
    parent: { id: '100', author: 'alice', text: '主帖正文' },
  })

  it('保存标注时带上回复内容和当时的 AI 结果，模型名从打分缓存里取；查缓存时一起返回', async () => {
    await score()
    expect(await send(labelMessage('bot'))).toEqual({ ok: true })
    const { labels } = await send({ type: 'XF_REPLY_LABEL_LIST' })
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatchObject({
      id: '101', label: 'bot', author: 'bob', text: '太有启发了！', parentAuthor: 'alice', parentText: '主帖正文',
      delaySeconds: 30, followers: 64, verified: true,
      ai: { score: 85, signals: ['S1'], reason: '万能夸奖', model: 'repost-model', promptVersion: 2 },
    })
    expect(await lookup(['101'])).toMatchObject({ labels: [{ id: '101', label: 'bot' }] })
  })

  it('撤销标注；没有 AI 结果时 ai 为 null；内容不合法时报错；别的扩展发来的不处理', async () => {
    expect(await send(labelMessage('human', null))).toEqual({ ok: true })
    expect((await send({ type: 'XF_REPLY_LABEL_LIST' })).labels[0]).toMatchObject({ label: 'human', ai: null })
    expect(await send(labelMessage(null))).toEqual({ ok: true })
    expect((await send({ type: 'XF_REPLY_LABEL_LIST' })).labels).toEqual([])
    expect(await send({ ...labelMessage('bot'), id: '999' })).toMatchObject({ ok: false })
    expect(await send(labelMessage('bot'), { id: 'other' })).toBeUndefined()
  })
})

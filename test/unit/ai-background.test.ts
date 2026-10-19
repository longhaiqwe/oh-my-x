import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { event, flushMicrotasks, portPair } from '../helpers/runtime-port'
import { KeyAiRepostApiKey, KeyAiRepostBaseUrl, KeyAiRepostModel, KeyAiRepostStylePrompt, KeyAiRepostStyleSamples } from '../../storage-keys'

let runtime: any
let permissions: any
let fetchMock: ReturnType<typeof vi.fn>
const generate = { type: 'XF_GENERATE_REPOST_OPTIONS', source: { text: '原文内容', authorHandle: 'author' } }

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  runtime = { id: 'test-extension', onConnect: event(), onMessage: event(), onInstalled: event(), onStartup: event() }
  permissions = { contains: vi.fn().mockResolvedValue(true) }
  vi.stubGlobal('browser', {
    runtime, permissions,
    storage: { local: { get: vi.fn().mockResolvedValue({
      [KeyAiRepostApiKey]: 'test-key', [KeyAiRepostBaseUrl]: 'https://ai.example/v1', [KeyAiRepostModel]: 'test-model',
    }) } },
    cookies: { get: vi.fn().mockResolvedValue(null) },
    alarms: { create: vi.fn(), get: vi.fn().mockResolvedValue({}), onAlarm: event() },
    downloads: { download: vi.fn().mockRejectedValue(new Error('下载失败')) },
  })
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"optionA":"总结一","optionB":"总结二"}' } }] })))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('defineBackground', (fn: () => void) => fn)
  const background = await import('../../entrypoints/background')
  ;(background.default as unknown as () => void)()
  await flushMicrotasks()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function start(message: unknown = generate) {
  const pair = portPair()
  runtime.onConnect.emit(pair.server)
  pair.client.postMessage(message)
  return pair
}

describe('AI background requests', () => {
  it('requires host permission before transmitting any source or API key', async () => {
    permissions.contains.mockResolvedValue(false)
    const { server } = start()
    await flushMicrotasks()
    expect(server.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: { code: 'error.aiNotAuthorized' } }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends an authorized request and returns both generated options', async () => {
    const { server } = start()
    await flushMicrotasks()
    expect(server.postMessage).toHaveBeenCalledWith({ ok: true, optionA: '总结一', optionB: '总结二' })
    expect(permissions.contains).toHaveBeenCalledWith({ origins: ['https://ai.example/*'] })
    const init = fetchMock.mock.calls[0][1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('error')
    expect(JSON.parse(init.body).messages[1].content).toContain('原文内容')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('生成时带上用户的转发风格和样本', async () => {
    ;(globalThis as any).browser.storage.local.get.mockResolvedValue({
      [KeyAiRepostApiKey]: 'test-key', [KeyAiRepostBaseUrl]: 'https://ai.example/v1', [KeyAiRepostModel]: 'test-model',
      [KeyAiRepostStylePrompt]: '只用短句', [KeyAiRepostStyleSamples]: '我的一条转发',
    })
    start()
    await flushMicrotasks()
    const system = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content
    expect(system).toContain('只用短句')
    expect(system).toContain('样本 1：\n我的一条转发')
  })

  it('按请求带来的界面语言组装提示词：英文界面写英文', async () => {
    const { server } = start({ ...generate, locale: 'en' })
    await flushMicrotasks()
    const [system, user] = JSON.parse(fetchMock.mock.calls[0][1].body).messages
    expect(system.content).toContain('write 2 English quote-post options')
    expect(user.content).toContain('Original content:\n"""\n原文内容\n"""')
    expect(server.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: true, optionA: '总结一' }))
  })

  it('请求没带语言时按后台读到的插件语言（测试环境是中文）', async () => {
    start()
    await flushMicrotasks()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toContain('中文转发总结选项')
  })

  it.each(['XF_GENERATE_REPOST_OPTIONS', 'XF_TEST_AI_CONNECTION'])('times out and aborts a stalled %s fetch', async type => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const { server } = start({ ...generate, type, config: { apiKey: 'test-key', baseUrl: 'https://ai.example/v1', model: 'model' } })
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(25_000)
    expect(server.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'error.aiTimeout' }) }))
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('also times out while reading the response body', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: () => new Promise(() => {}) })
    const { server } = start()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(25_000)
    expect(server.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'error.aiTimeout' }) }))
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('aborts when the requesting panel disconnects, without delivering late results', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise(r => { resolve = r }))
    const { client, server } = start()
    await flushMicrotasks()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    client.disconnect()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    resolve(new Response('{}'))
    await flushMicrotasks()
    expect(server.postMessage).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start a fetch if cancellation happens during permission lookup', async () => {
    let resolve!: (allowed: boolean) => void
    permissions.contains.mockImplementation(() => new Promise(r => { resolve = r }))
    const { client } = start()
    await flushMicrotasks()
    expect(permissions.contains).toHaveBeenCalled()
    client.disconnect()
    resolve(true)
    await flushMicrotasks()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports provider errors without claiming success', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"额度不足"}}', { status: 429 }))
    const { server } = start()
    await flushMicrotasks()
    expect(server.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'error.aiHttp', params: expect.objectContaining({ status: 429 }) }) }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts source retrieval when the panel closes', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const { client } = start({ type: 'XF_FETCH_TWEET_FULL_TEXT', tweetId: '123' })
    await flushMicrotasks()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    client.disconnect()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('returns a structured download failure', async () => {
    const respond = vi.fn()
    runtime.onMessage.emit({ type: 'XF_DOWNLOAD_MEDIA', url: 'https://video.twimg.com/test.mp4' }, {}, respond)
    await flushMicrotasks()
    expect(respond).toHaveBeenCalledWith({ ok: false, error: '下载失败' })
  })
})

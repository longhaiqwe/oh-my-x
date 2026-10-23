import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AI_KEEPALIVE, AI_KEEPALIVE_MS, aiPermissionOrigin, sendAiRequest } from '../../shared/ai-request'
import { AI_MAX_DURATION_MS } from '../../shared/ai-deadline'
import { flushMicrotasks, portPair } from '../helpers/runtime-port'

let pair: ReturnType<typeof portPair>
beforeEach(() => {
  vi.useFakeTimers()
  pair = portPair()
  vi.stubGlobal('browser', { runtime: { connect: vi.fn(() => pair.client) } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it.each([
  ['https://AI.example/v1/chat/completions', 'https://ai.example/*'],
  ['http://localhost:11434/v1', 'http://localhost/*'],
  ['http://127.0.0.1:8000/v1', 'http://127.0.0.1/*'],
  ['http://127.0.0.1:8317', 'http://127.0.0.1/*'],
  ['http://LOCALHOST:1234/v1', 'http://localhost/*'],
  ['', 'https://api.openai.com/*'],
])('requests a host-level pattern for %s', (url, expected) => {
  expect(aiPermissionOrigin(url)).toBe(expected)
})

it.each([
  'file:///tmp/test',
  'javascript:alert(1)',
  'https://user:pass@ai.example',
  'http://user:pass@localhost:8000',
  'http://ai.example/v1',
  'http://192.168.1.10:11434/v1',
  'http://localhost.ai.example/v1',
])('rejects invalid credential destinations: %s', url => {
  expect(() => aiPermissionOrigin(url)).toThrow()
})

it('reports background disconnect rather than leaving the caller waiting', async () => {
  const result = sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, new AbortController().signal)
  const check = expect(result).rejects.toThrow('连接已断开')
  pair.server.disconnect()
  await check
  expect(vi.getTimerCount()).toBe(0)
})

it('disconnects on the client deadline even if the background never responds', async () => {
  const result = sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, new AbortController().signal)
  const check = expect(result).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(AI_MAX_DURATION_MS + 5_000)
  await check
  expect(pair.client.disconnect).toHaveBeenCalledTimes(1)
})

it('sends a keep-alive message every 10 seconds while waiting, and stops after the reply', async () => {
  const result = sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, new AbortController().signal)
  const sent = () => pair.client.postMessage.mock.calls.filter(([message]: any[]) => message?.type === AI_KEEPALIVE).length
  await vi.advanceTimersByTimeAsync(AI_KEEPALIVE_MS * 3)
  expect(sent()).toBe(3)
  pair.server.postMessage({ ok: true, model: 'test' })
  await result
  await vi.advanceTimersByTimeAsync(AI_KEEPALIVE_MS * 3)
  expect(sent()).toBe(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps cancellation isolated to the requesting panel', async () => {
  const first = pair
  const second = portPair()
  ;(browser.runtime.connect as any).mockReturnValueOnce(first.client).mockReturnValueOnce(second.client)
  const controller = new AbortController()
  const a = sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, controller.signal)
  const b = sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, new AbortController().signal)
  const check = expect(a).rejects.toThrow()
  controller.abort()
  await check
  expect(second.client.disconnect).not.toHaveBeenCalled()
  second.server.postMessage({ ok: true, model: 'test' })
  expect(await b).toEqual({ ok: true, model: 'test' })
  await flushMicrotasks()
  expect(vi.getTimerCount()).toBe(0)
})

it('explains an invalidated extension when connect throws', async () => {
  ;(browser.runtime.connect as any).mockImplementation(() => { throw new Error('Extension context invalidated.') })
  await expect(sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'error.extensionInvalidated' })
})

it('settles the request even if disconnect cleanup throws after invalidation', async () => {
  pair.client.postMessage.mockImplementation(() => { throw new Error('Extension context invalidated.') })
  pair.client.disconnect.mockImplementation(() => { throw new Error('Extension context invalidated.') })
  await expect(sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'error.extensionInvalidated' })
  expect(vi.getTimerCount()).toBe(0)
})

it('delivers score progress without settling or disconnecting until the final message', async () => {
  const progress = vi.fn()
  const finished = vi.fn()
  const request = { type: 'XF_SCORE_REPLIES' as const, parent: { id: '1', author: 'me', text: 'post' }, replies: [], mode: 'auto' as const }
  const result = sendAiRequest(request, new AbortController().signal, progress)
  void result.then(finished)
  const partial = { type: 'XF_AI_PROGRESS', scores: [{ id: '2', score: 10, signals: [], reason: 'specific' }] }
  pair.server.postMessage(partial)
  await flushMicrotasks()
  expect(progress).toHaveBeenCalledWith(partial)
  expect(finished).not.toHaveBeenCalled()
  expect(pair.client.disconnect).not.toHaveBeenCalled()
  pair.server.postMessage({ ok: true, scores: partial.scores })
  await expect(result).resolves.toEqual({ ok: true, scores: partial.scores })
  expect(pair.client.disconnect).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('still times out after progress, and ignores late progress after cancellation', async () => {
  const progress = vi.fn()
  const controller = new AbortController()
  const result = sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config: {} }, controller.signal, progress)
  const rejected = expect(result).rejects.toThrow('超时')
  pair.server.postMessage({ type: 'XF_AI_PROGRESS', scores: [] })
  await vi.advanceTimersByTimeAsync(AI_MAX_DURATION_MS + 5_000)
  await rejected
  pair.client.onMessage.emit({ type: 'XF_AI_PROGRESS', scores: [] })
  expect(progress).toHaveBeenCalledTimes(1)
})

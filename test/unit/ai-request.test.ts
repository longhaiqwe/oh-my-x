import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { aiPermissionOrigin, sendAiRequest } from '../../shared/ai-request'
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
  await vi.advanceTimersByTimeAsync(30_000)
  await check
  expect(pair.client.disconnect).toHaveBeenCalledTimes(1)
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

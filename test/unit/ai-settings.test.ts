import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AiRepostCard from '../../entrypoints/popup/components/sections/AiRepostCard.vue'
import { KeyAiRepostApiKey, KeyAiRepostBaseUrl } from '../../storage-keys'
import { flushMicrotasks, portPair } from '../helpers/runtime-port'

let app: App
let root: HTMLDivElement
let request: ReturnType<typeof vi.fn>
let connect: ReturnType<typeof vi.fn>
let ports: ReturnType<typeof portPair>[]
beforeEach(async () => {
  ports = []
  request = vi.fn().mockResolvedValue(true)
  connect = vi.fn(() => { const pair = portPair(); ports.push(pair); return pair.client })
  vi.stubGlobal('browser', {
    runtime: { id: 'test-extension', connect, sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
    permissions: { request },
    storage: { local: {
      get: async () => ({ [KeyAiRepostApiKey]: 'test-key', [KeyAiRepostBaseUrl]: 'https://ai.example/v1' }),
      set: vi.fn().mockResolvedValue(undefined),
    } },
  })
  root = document.createElement('div'); document.body.append(root)
  app = createApp(AiRepostCard); app.mount(root)
  await flushMicrotasks(); await nextTick()
})
afterEach(() => { app.unmount(); root.remove(); vi.unstubAllGlobals() })
function button(text: string) { return [...root.querySelectorAll('button')].find(el => el.textContent?.includes(text))! }

it('requests only the configured AI host directly during the click', async () => {
  button('测试连接').click()
  // No await before this assertion: permissions.request must retain the user gesture.
  expect(request).toHaveBeenCalledWith({ origins: ['https://ai.example/*'] })
  await flushMicrotasks()
  expect(connect).toHaveBeenCalledTimes(1)
})

it('does not contact the AI service after permission denial', async () => {
  request.mockResolvedValue(false)
  button('测试连接').click()
  await flushMicrotasks(); await nextTick()
  expect(root.textContent).toContain('未授权')
  expect(connect).not.toHaveBeenCalled()
})

it('allows canceling a connection test and ignores its late result', async () => {
  button('测试连接').click()
  await flushMicrotasks(); await nextTick()
  expect(button('取消')).toBeDefined()
  button('取消').click()
  await flushMicrotasks(); await nextTick()
  expect(ports[0].client.disconnect).toHaveBeenCalled()
  ports[0].client.onMessage.emit({ ok: true, model: 'late-model' })
  await flushMicrotasks(); await nextTick()
  expect(root.textContent).not.toContain('late-model')
  expect(button('测试连接').disabled).toBe(false)
})

it('disconnects when settings unmount during an active test', async () => {
  button('测试连接').click()
  await flushMicrotasks()
  app.unmount()
  expect(ports[0]?.client.disconnect).toHaveBeenCalled()
})

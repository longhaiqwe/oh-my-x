import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProfileActivityCard from '../../entrypoints/popup/components/sections/ProfileActivityCard.vue'
import { requestProfileActivityFromPage } from '../../shared/profile-activity-bridge'
import { KeyProfileActivityStats } from '../../storage-keys'
import { flushMicrotasks } from '../helpers/runtime-port'

let app: App
let root: HTMLDivElement
let store: Record<string, unknown>
let sendMessage: ReturnType<typeof vi.fn>
let executeScript: ReturnType<typeof vi.fn>

async function settle() {
  for (let i = 0; i < 3; i++) {
    await flushMicrotasks()
    await nextTick()
  }
}

function scanButton() {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('扫描近 7 天'))!
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
  store = {}
  sendMessage = vi.fn()
  executeScript = vi.fn()
  vi.stubGlobal('browser', {
    runtime: { id: 'test-extension' },
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (kv: Record<string, unknown>) => void Object.assign(store, kv),
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://x.com/Alice' }]),
      sendMessage,
    },
    scripting: { executeScript },
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ProfileActivityCard)
  app.mount(root)
  await settle()
})

afterEach(() => {
  app.unmount()
  root.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('插件更新后页面收不到消息时，改为直接注入抓取请求，不用刷新', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'))
  executeScript.mockResolvedValue([{
    frameId: 0,
    result: {
      ok: true,
      entries: [
        { id: '1', date: '2026-10-16', type: 'post', timestamp: Date.parse('2026-10-16T08:00:00Z') },
        { id: '2', date: '2026-10-15', type: 'reply', timestamp: Date.parse('2026-10-15T08:00:00Z') },
      ],
    },
  }])

  scanButton().click()
  await settle()

  expect(executeScript).toHaveBeenCalledTimes(1)
  const injection = executeScript.mock.calls[0][0]
  expect(injection.target).toEqual({ tabId: 7 })
  expect(injection.func).toBe(requestProfileActivityFromPage)
  expect(injection.args[0]).toMatchObject({ profileHandle: 'alice', days: 7 })
  expect(root.textContent).toContain('已更新近 7 天活动')
  expect(root.textContent).not.toContain('无法连接当前页面')
  expect(JSON.parse(store[KeyProfileActivityStats] as string)).toMatchObject({ profileHandle: 'alice', posts: 1, replies: 1 })
})

it('页面里也没有拦截器时，显示需要刷新的说明', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'))
  executeScript.mockResolvedValue([{ frameId: 0, result: { ok: false, error: '当前页面需要刷新一次才能扫描，请刷新后重试' } }])

  scanButton().click()
  await settle()

  expect(root.textContent).toContain('当前页面需要刷新一次才能扫描，请刷新后重试')
})

it('注入也失败时，才提示无法连接当前页面', async () => {
  sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'))
  executeScript.mockRejectedValue(new Error('Cannot access contents of the page'))

  scanButton().click()
  await settle()

  expect(root.textContent).toContain('无法连接当前页面，请刷新后重试')
})

it('当前页不是 X（如授权过的 AI 服务网址）时不注入', async () => {
  ;(globalThis as any).browser.tabs.query.mockResolvedValue([{ id: 9, url: 'https://ai.example/Alice' }])
  sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'))

  scanButton().click()
  await settle()

  expect(executeScript).not.toHaveBeenCalled()
  expect(root.textContent).toContain('请在博主个人主页使用此功能')
})

it('页面能收到消息时，照常走内容脚本，不注入', async () => {
  sendMessage.mockResolvedValue({
    ok: true,
    stats: { profileHandle: 'alice', posts: 3, replies: 4, days: [] },
  })

  scanButton().click()
  await settle()

  expect(sendMessage).toHaveBeenCalledWith(7, { type: 'XF_SCAN_PROFILE_ACTIVITY', days: 7 })
  expect(executeScript).not.toHaveBeenCalled()
  expect(root.textContent).toContain('已更新近 7 天活动')
})

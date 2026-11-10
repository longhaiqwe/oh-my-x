import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerRewindBackground } from '../../shared/rewind-background'

vi.mock('../../shared/rewind-db', () => ({
  createRewindRepository: () => ({
    read: async () => ({ account: '123', generation: 0, posts: [] }),
  }),
}))

let alarm: (event: { name: string }) => void
let saved: Record<string, unknown>
let pageContext: ReturnType<typeof vi.fn>
let permission: ReturnType<typeof vi.fn>
let finished: ReturnType<typeof vi.fn>

beforeEach(() => {
  saved = { rewindOcr: 'on', rewindOcrState: { phase: 'ready' } }
  pageContext = vi.fn().mockResolvedValue({ account: '123' })
  permission = vi.fn().mockResolvedValue(true)
  finished = vi.fn().mockResolvedValue(false)
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: async () => ({ ...saved }),
        set: async (values: Record<string, unknown>) => Object.assign(saved, values),
      },
      onChanged: { addListener: vi.fn() },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
      onMessage: { addListener: vi.fn() },
    },
    tabs: {
      query: async () => [{ id: 1, active: true, url: 'https://x.com/home' }],
      sendMessage: pageContext,
    },
    cookies: { get: async () => ({ value: 'u=123' }) },
    permissions: { contains: permission },
    offscreen: { hasDocument: finished },
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: (listener: typeof alarm) => { alarm = listener } },
    },
    i18n: { getUILanguage: () => 'en' },
  })
  registerRewindBackground()
})
afterEach(() => vi.unstubAllGlobals())

it('新标签页尚未响应账号确认时不报 OCR 错误，后续周期自动恢复', async () => {
  pageContext.mockRejectedValueOnce(new Error('Receiving end does not exist'))
  alarm({ name: 'xf-rewind-ocr' })
  await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1))
  expect(saved.rewindOcrState).toEqual({ phase: 'ready' })
  alarm({ name: 'xf-rewind-ocr' })
  await vi.waitFor(() => expect(pageContext).toHaveBeenCalledTimes(2))
  expect(saved.rewindOcrState).toEqual({ phase: 'ready' })
})

it('真实 OCR 权限错误仍报告失败并等待重试', async () => {
  permission.mockResolvedValue(false)
  alarm({ name: 'xf-rewind-ocr' })
  await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1))
  expect(saved.rewindOcrState).toEqual({ phase: 'error' })
  alarm({ name: 'xf-rewind-ocr' })
  expect(permission).toHaveBeenCalledTimes(1)
})

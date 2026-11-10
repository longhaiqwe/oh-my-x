import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../../shared/rewind-client', () => ({ rewindRequest: vi.fn(async () => ({})) }))
vi.mock('../../content-scripts/options/rewind-account', () => ({ getRewindAccount: () => null }))
vi.mock('../../content-scripts/options/rewind-panel', () => ({
  closeRewindPanel: vi.fn(), openRewindPanel: vi.fn(),
  resetRewindPanel: vi.fn(), updateRewindTheme: vi.fn(),
}))
import { startRewind, stopRewind } from '../../content-scripts/features/rewind'
import { closeRewindPanel } from '../../content-scripts/options/rewind-panel'
import { rewindRequest } from '../../shared/rewind-client'

afterEach(() => {
  stopRewind()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('重载使 runtime.id 消失后停止定时器、DOM 监听和采集，清理旧接口抛错也不外溢', async () => {
  vi.useFakeTimers()
  const removeListener = vi.fn(() => { throw new Error('Extension context invalidated.') })
  const disconnect = vi.fn()
  const runtime: { id?: string; onMessage: unknown } = {
    id: 'test', onMessage: { addListener: vi.fn(), removeListener },
  }
  vi.stubGlobal('browser', {
    runtime,
    storage: {
      local: { get: async () => ({ rewindEnabled: 'on', rewindNav: 'on' }) },
      onChanged: { addListener: vi.fn(), removeListener },
    },
  })
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect = disconnect
  })
  startRewind()
  await vi.advanceTimersByTimeAsync(50)
  const sent = vi.mocked(rewindRequest).mock.calls.length
  runtime.id = undefined
  await vi.advanceTimersByTimeAsync(1600)
  expect(vi.getTimerCount()).toBe(0)
  expect(disconnect).toHaveBeenCalled()
  expect(closeRewindPanel).toHaveBeenCalled()
  window.dispatchEvent(new Event('scroll'))
  window.dispatchEvent(new Event('resize'))
  await vi.advanceTimersByTimeAsync(3000)
  expect(vi.mocked(rewindRequest).mock.calls.length).toBe(sent)
  expect(removeListener).toHaveBeenCalledTimes(2)
})

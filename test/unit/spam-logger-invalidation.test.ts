import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('stops writing logs after extension invalidation and settles pending callers', async () => {
  vi.resetModules()
  vi.useFakeTimers()
  const get = vi.fn().mockRejectedValue(new Error('Extension context invalidated.'))
  vi.stubGlobal('browser', { storage: { local: { get } } })
  const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { recordIntercept } = await import('../../shared/spam-logger')
  const entry = { authorHandle: 'bob', authorName: 'Bob', text: 'first', score: 80, category: 'bot' as const, hits: [], action: 'filter' as const }
  const first = recordIntercept(entry)
  await vi.advanceTimersByTimeAsync(50)
  await first
  const second = recordIntercept({ ...entry, text: 'second' })
  await vi.advanceTimersByTimeAsync(50)
  await second
  expect(get).toHaveBeenCalledTimes(1)
  expect(logError).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('does not suppress unrelated storage failures or stop subsequent writes', async () => {
  vi.resetModules()
  vi.useFakeTimers()
  const get = vi.fn().mockRejectedValueOnce(new Error('Quota exceeded')).mockResolvedValue({})
  const set = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('browser', { storage: { local: { get, set } } })
  const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { recordIntercept } = await import('../../shared/spam-logger')
  const entry = { authorHandle: 'bob', authorName: 'Bob', text: 'first', score: 80, category: 'bot' as const, hits: [], action: 'filter' as const }
  const first = recordIntercept(entry)
  await vi.advanceTimersByTimeAsync(50)
  await first
  const second = recordIntercept({ ...entry, text: 'second' })
  await vi.advanceTimersByTimeAsync(50)
  await second
  expect(logError).toHaveBeenCalledOnce()
  expect(set).toHaveBeenCalledOnce()
})

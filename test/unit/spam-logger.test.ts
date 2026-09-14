import { describe, it, expect, beforeEach } from 'vitest'
import { recordIntercept, readLog, clearLog, clearStats } from '../../shared/spam-logger'
import { KeySpamLog, KeySpamStats } from '../../storage-keys'

// 内存里的 storage 模拟，串行化行为要靠这个验证
function makeFakeStorage() {
  const store: Record<string, unknown> = {}
  return {
    get: async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys]
      return arr.reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = store[k]
        return acc
      }, {})
    },
    set: async (data: Record<string, unknown>) => {
      // 模拟真实 storage 的微延迟——足以让 read-modify-write race 暴露
      await new Promise((r) => setTimeout(r, 1))
      Object.assign(store, data)
    },
    remove: async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys]
      arr.forEach((k) => delete store[k])
    },
  }
}

describe('recordIntercept serialization', () => {
  beforeEach(async () => {
    ;(globalThis as any).browser = { storage: { local: makeFakeStorage() } }
    await clearLog()
    await clearStats()
  })

  it('preserves all entries under concurrent writes', async () => {
    // 10 个并发写：之前会丢；现在串行化后全部保留
    const writes = Array.from({ length: 10 }, (_, i) =>
      recordIntercept({
        authorHandle: `user${i}`,
        authorName: `User ${i}`,
        text: `text ${i}`,
        score: 60 + i,
        category: 'marketing',
        hits: [],
        action: 'filter',
      }),
    )
    await Promise.all(writes)

    const log = await readLog()
    expect(log).toHaveLength(10)
    const handles = new Set(log.map((e) => e.authorHandle))
    expect(handles.size).toBe(10) // 没有重复也没有丢失
  })

  it('preserves reverse-chronological order and flushes immediately on readLog', async () => {
    // 连续调用两个拦截，不显式 await recordIntercept，直接调 readLog 验证立即 flush
    void recordIntercept({
      authorHandle: 'first_user',
      authorName: 'First User',
      text: 'first text',
      score: 60,
      category: 'marketing',
      hits: [],
      action: 'filter',
    })

    void recordIntercept({
      authorHandle: 'second_user',
      authorName: 'Second User',
      text: 'second text',
      score: 70,
      category: 'marketing',
      hits: [],
      action: 'filter',
    })

    const log = await readLog()
    expect(log).toHaveLength(2)
    // 后截获的 second_user 应该在最前面（index 0）
    expect(log[0].authorHandle).toBe('second_user')
    expect(log[1].authorHandle).toBe('first_user')
  })
})

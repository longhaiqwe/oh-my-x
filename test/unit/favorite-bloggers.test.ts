import { describe, expect, it, vi } from 'vitest'
import { createFavoriteBloggerWriter, parseBloggerHandle, toFavoriteBloggers } from '../../shared/favorite-bloggers'
import { KeyFavoriteBloggers } from '../../storage-keys'

describe('博主收藏数据', () => {
  it.each(['alice', '@alice', ' https://x.com/alice/ ', 'twitter.com/alice', 'https://x.com/alice?s=21', 'https://mobile.twitter.com/alice'])('解析 %s', input => {
    expect(parseBloggerHandle(input)).toBe('alice')
  })
  it.each(['', '@', 'https://x.com/home', 'grok', 'bookmarks', 'https://x.com/alice/status/123', 'https://evil.com/alice', 'https://x.com.evil.com/alice', 'javascript:alert(1)', 'https://x.com/alice/../home', 'a'.repeat(16), '名字', 'a/b', 'alice bob', null])('拒绝非主页输入 %s', input => {
    expect(parseBloggerHandle(input)).toBeNull()
  })
  it('忽略损坏记录，按用户名去重，保留显示名', () => {
    expect(toFavoriteBloggers([null, { handle: 'Alice', name: ' 昵称 ' }, { handle: 'alice' }, { handle: 'home' }, { handle: 'bob' }])).toEqual([
      { handle: 'Alice', name: '昵称' }, { handle: 'bob', name: 'bob' },
    ])
  })
  it('并发增删不会丢失其他标签页的收藏', async () => {
    let data: Record<string, unknown> = {}
    const write = createFavoriteBloggerWriter({
      get: async () => structuredClone(data),
      set: async value => { data = structuredClone(value) },
    })
    const results = await Promise.all([
      write({ action: 'add', blogger: { handle: 'alice', name: 'Alice' } }),
      write({ action: 'add', blogger: { handle: 'bob', name: 'Bob' } }),
      write({ action: 'add', blogger: { handle: 'ALICE', name: 'Duplicate' } }),
      write({ action: 'remove', handle: 'alice' }),
      write({ action: 'add', blogger: { handle: 'carol' } }),
    ])
    expect(results.every(result => result.ok)).toBe(true)
    expect(data[KeyFavoriteBloggers]).toEqual([{ handle: 'carol', name: 'carol' }, { handle: 'bob', name: 'Bob' }])
  })
  it('移动收藏只调整目标位置，并保留其他标签页刚增加的收藏', async () => {
    let data = { [KeyFavoriteBloggers]: ['alice', 'bob', 'carol'].map(handle => ({ handle, name: handle })) }
    const write = createFavoriteBloggerWriter({ get: async () => structuredClone(data), set: async value => { data = value as typeof data } })
    await Promise.all([
      write({ action: 'add', blogger: { handle: 'dave', name: 'Dave' } }),
      write({ action: 'move', handle: 'carol', targetHandle: 'ALICE', placement: 'before' }),
    ])
    expect(data[KeyFavoriteBloggers].map(item => item.handle)).toEqual(['dave', 'carol', 'alice', 'bob'])
    await write({ action: 'move', handle: 'carol', targetHandle: 'bob', placement: 'after' })
    expect(data[KeyFavoriteBloggers].map(item => item.handle)).toEqual(['dave', 'alice', 'bob', 'carol'])
    await write({ action: 'remove', handle: 'bob' })
    const saved = structuredClone(data)
    expect(await write({ action: 'move', handle: 'carol', targetHandle: 'bob', placement: 'before' })).toEqual({ ok: false })
    expect(await write({ action: 'move', handle: 'carol', targetHandle: 'alice', placement: 'invalid' })).toEqual({ ok: false })
    expect(data).toEqual(saved)
  })
  it('存储失败不报告成功，后续请求可以继续', async () => {
    const set = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    const write = createFavoriteBloggerWriter({ get: async () => ({}), set })
    expect(await write({ action: 'add', blogger: { handle: 'alice' } })).toEqual({ ok: false })
    expect((await write({ action: 'add', blogger: { handle: 'bob' } })).ok).toBe(true)
    expect(await write({ action: 'remove', handle: 'https://evil.com' })).toEqual({ ok: false })
    expect(set).toHaveBeenCalledTimes(2)
  })
})

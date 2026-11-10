// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createRewindRepository } from '../../shared/rewind-db'
import { trimRewind, type RewindPost } from '../../shared/rewind'
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => vi.unstubAllGlobals())
const post = (id = '1', time = 1): RewindPost => ({
  id,
  handle: 'author',
  name: '作者',
  avatar: '',
  text: '中文记录',
  quote: null,
  media: [],
  context: '',
  repost: false,
  postedAt: '',
  firstSeenAt: time,
})
const repo = () => createRewindRepository(`rewind-test-${crypto.randomUUID()}`)
describe('回看事务与持久化', () => {
  it('两标签页写入不覆盖；去重保留首次看到时间，补齐晚加载内容', async () => {
    const db = repo()
    await Promise.all([
      db.add('100', 0, [post('1', 10)]),
      db.add('100', 0, [post('2', 20)]),
    ])
    await db.add('100', 0, [
      { ...post('1', 100), text: '中文记录和后加载的正文' },
    ])
    const result = await db.read('100')
    expect(result.posts.map((p) => p.id)).toEqual(['2', '1'])
    expect(result.posts[1].firstSeenAt).toBe(10)
    expect(result.posts[1].text).toContain('后加载')
  })
  it('清空后延迟采集和 OCR 结果不得恢复数据，其他账号不受影响', async () => {
    const db = repo(),
      p = {
        ...post(),
        media: [
          { src: 'https://pbs.twimg.com/media/a', kind: 'image' as const },
        ],
      }
    await db.add('100', 0, [p])
    await db.add('200', 0, [p])
    const generation = await db.clear('100')
    expect(generation).toBe(1)
    expect(await db.add('100', 0, [p])).toBe(false)
    expect(await db.ocr('100', 0, '1', p.media[0].src, '迟到', 'eng')).toBe(
      false,
    )
    expect((await db.read('100')).posts).toEqual([])
    expect((await db.read('200')).posts).toHaveLength(1)
    expect(await db.add('100', 1, [post('2')])).toBe(true)
  })
  it('3001 条只保留最新 3000 条，超过字节上限时继续移除最早记录', () => {
    const items = trimRewind(
      Array.from({ length: 3001 }, (_, i) => post(String(i + 1), i)),
    )
    expect(items).toHaveLength(3000)
    expect(items.at(-1)?.id).toBe('2')
    const large = trimRewind(
      Array.from({ length: 800 }, (_, i) => ({
        ...post(String(i + 1), i),
        text: '中'.repeat(16000),
      })),
    )
    expect(large.length).toBeLessThan(800)
    expect(large[0].id).toBe('800')
    expect(
      large.reduce((n, p) => n + JSON.stringify(p).length * 2, 0),
    ).toBeLessThanOrEqual(20 * 1024 * 1024)
  })
  it('重新打开 repository 后可读取记录及已识别图片文字', async () => {
    const name = `rewind-persist-${crypto.randomUUID()}`,
      db = createRewindRepository(name)
    const p = {
      ...post(),
      media: [{ src: 'https://pbs.twimg.com/media/a', kind: 'image' as const }],
    }
    await db.add('100', 0, [p])
    await db.ocr('100', 0, '1', p.media[0].src, '图片文字', 'chi_sim+eng')
    const saved = await createRewindRepository(name).read('100')
    expect(saved.posts[0].media[0].text).toBe('图片文字')
    await db.clear('100')
    expect((await db.read('100')).posts).toEqual([])
  })
})

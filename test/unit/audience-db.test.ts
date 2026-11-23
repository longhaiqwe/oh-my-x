// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  createAudienceRepository,
  AUDIENCE_LIMITS,
} from '../../shared/audience-db'
import { AUDIENCE_KINDS, type AudiencePacket } from '../../shared/audience'
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})
afterEach(() => vi.unstubAllGlobals())
const now = new Date(2026, 10, 11, 12).getTime()
const packet = (targetId = '10', id = '1'): AudiencePacket => ({
  targetId,
  handle: `target${targetId}`,
  kind: 'followers',
  members: [{ id, handle: `u${id}`, followers: 100, observedAt: now }],
})
const repo = (limits = AUDIENCE_LIMITS) =>
  createAudienceRepository(crypto.randomUUID(), limits)
describe('audience persistence', () => {
  it('queues missing counts from an existing version-one database', async () => {
    const name = crypto.randomUUID()
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('accounts')
        request.result.createObjectStore('meta', { keyPath: 'key' })
        const store = request.result.createObjectStore('members', { keyPath: 'key' })
        store.createIndex('list', 'list')
        for (const list of ['1:1:followers', '1:9:followers', '1:1:verified_followers'])
          store.put({ key: list + ':2', list, member: { id: '2', handle: 'u2', observedAt: now } })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    old.close()
    const upgraded = createAudienceRepository(name)
    expect(await upgraded.missingFollowerCounts('1', now, 50)).toEqual([{ id: '2', handle: 'u2' }])
  })
  it('fills only existing own followers with missing counts and defers unavailable profiles', async () => {
    const db = repo()
    const missing = { ...packet('1'), members: [
      { id: '1', handle: 'zero', observedAt: now },
      { id: '2', handle: 'missing', observedAt: now },
      { id: '3', handle: 'known', followers: 9, observedAt: now },
    ] }
    await db.add('1', 0, missing, now)
    await db.add('9', 0, missing, now)
    expect((await db.missingFollowerCounts('1', now, 50)).map(m => m.id)).toEqual(['1', '2'])
    expect(await db.missingFollowerCounts('9', now, 50)).toEqual([])
    expect(await db.fillFollowerCounts('1', 0, [
      { id: '1', followers: 0 }, { id: '2' }, { id: '3', followers: 90 }, { id: '4', followers: 3 },
    ], now + 1)).toBe(1)
    const saved = await db.read('1:1:followers')
    expect(saved?.members.map(m => m.followers)).toEqual([0, undefined, 9])
    expect(await db.missingFollowerCounts('1', now + 1, 50)).toEqual([])
    expect((await db.missingFollowerCounts('1', now + 86400001, 50)).map(m => m.id)).toEqual(['2'])
    await db.clear('1', '1:1:followers')
    expect(await db.fillFollowerCounts('1', 0, [{ id: '2', followers: 5 }], now + 2)).toBe(0)
    expect(await db.read('1:1:followers')).toBeNull()
  })
  it('merges concurrent tabs, deduplicates and isolates signed-in identities and list kinds', async () => {
    const db = repo()
    await Promise.all([
      db.add('1', 0, packet(), now),
      db.add('1', 0, packet('10', '2'), now),
    ])
    await db.add('1', 0, packet(), now)
    await db.add('2', 0, packet(), now)
    await db.add('1', 0, { ...packet(), kind: 'following' }, now)
    expect((await db.read('1:10:followers'))?.members).toHaveLength(2)
    await db.add('1', 0, { ...packet(), kind: 'verified_followers' }, now)
    expect((await db.read('1:10:verified_followers'))?.count).toBe(1)
    expect(await db.list()).toHaveLength(4)
    await db.clear('1', '1:10:verified_followers')
    expect((await db.read('1:10:followers'))?.count).toBe(2)
    expect((await db.read('1:10:following'))?.count).toBe(1)
  })
  it('clear increments generation, blocks late writes and preserves other identities', async () => {
    const db = repo()
    await db.add('1', 0, packet(), now)
    await db.add('2', 0, packet(), now)
    expect(await db.clear('1', '1:10:followers')).toBe(1)
    expect((await db.add('1', 0, packet(), now)).state).toBe('changed')
    expect(await db.read('1:10:followers')).toBeNull()
    expect((await db.read('2:10:followers'))?.count).toBe(1)
    expect((await db.add('1', 1, packet(), now)).state).toBe('saved')
  })
  it('does not merge records across a day boundary; explicit clear permits new batch', async () => {
    const db = repo()
    await db.add('1', 0, packet(), now)
    const first = await db.read('1:10:followers')
    expect(
      (await db.add('1', 0, packet('10', '2'), now + 86400000)).state,
    ).toBe('stale')
    expect((await db.read('1:10:followers'))?.count).toBe(1)
    const generation = await db.clear('1', '1:10:followers')
    await db.add('1', generation, packet(), now + 86400000)
    expect((await db.read('1:10:followers'))?.batch).not.toBe(first?.batch)
  })
  it.each(AUDIENCE_KINDS)('updates the own %s sample across days and retains saved members', async (kind) => {
    const db = repo()
    const first = { ...packet('1'), kind }
    await db.add('1', 0, first, now)
    const later = { ...packet('1', '2'), kind }
    expect((await db.add('1', 0, later, now + 86400000)).state).toBe('saved')
    expect((await db.read(`1:1:${kind}`))?.count).toBe(2)
  })
  it('enforces per-account targets without evicting stored lists', async () => {
    const db = repo({ ...AUDIENCE_LIMITS, targets: 1 })
    await db.add('1', 0, packet(), now)
    expect((await db.add('1', 0, packet('20'), now)).state).toBe('capacity')
    expect((await db.add('2', 0, packet('20'), now)).state).toBe('saved')
    expect(
      (await db.add('1', 0, { ...packet(), kind: 'following' }, now)).state,
    ).toBe('saved')
    expect(await db.list()).toHaveLength(3)
  })
  it('enforces global and per-list row limits atomically but allows existing member updates', async () => {
    const db = repo({ ...AUDIENCE_LIMITS, rows: 2, followers: 1 })
    await Promise.all([
      db.add('1', 0, packet(), now),
      db.add('2', 0, packet(), now),
    ])
    expect((await db.add('1', 0, packet('10', '2'), now)).state).toBe(
      'capacity',
    )
    expect((await db.add('3', 0, packet(), now)).state).toBe('capacity')
    await db.add(
      '1',
      0,
      {
        ...packet(),
        members: [
          { ...packet().members[0], followers: 200, observedAt: now + 1 },
        ],
      },
      now + 1,
    )
    expect((await db.read('1:10:followers'))?.members[0].followers).toBe(200)
    expect((await db.list()).reduce((n, m) => n + m.count, 0)).toBe(2)
  })
  it('enforces estimated UTF-8 payload bytes and clearing frees capacity', async () => {
    const db = repo({ ...AUDIENCE_LIMITS, bytes: 500 })
    await db.add('1', 0, packet(), now)
    const result = await db.add(
      '2',
      0,
      {
        ...packet(),
        members: [{ ...packet().members[0], name: '中文'.repeat(200) }],
      },
      now,
    )
    expect(result.state).toBe('capacity')
    expect(
      (await db.list()).reduce((n, m) => n + m.bytes, 0),
    ).toBeLessThanOrEqual(500)
    await db.clear('1')
    expect((await db.add('2', 0, packet(), now)).state).toBe('saved')
  })
})

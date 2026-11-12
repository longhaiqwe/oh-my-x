// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  createAudienceRepository,
  AUDIENCE_LIMITS,
} from '../../shared/audience-db'
import { type AudiencePacket } from '../../shared/audience'
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
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
    expect(await db.list()).toHaveLength(3)
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

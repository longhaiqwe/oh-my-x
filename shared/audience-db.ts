import {
  audienceKey,
  AUDIENCE_KINDS,
  audienceStale,
  mergeAudienceMember,
  type AudienceMeta,
  type AudienceKind,
  type AudienceMember,
  type AudiencePacket,
  type AudienceSnapshot,
} from './audience'
export const AUDIENCE_LIMITS = {
  targets: 3,
  followers: 20000,
  verified_followers: 20000,
  following: 10000,
  rows: 100000,
  bytes: 30 * 1024 * 1024,
}
type Row = { key: string; list: string; member: AudienceMember; followerCountRetryAt?: number }
const FOLLOWER_COUNT_QUEUE = 'follower-count-queue'
const DAY = 86_400_000
const memberBytes = (member: AudienceMember) =>
  new TextEncoder().encode(JSON.stringify(member)).byteLength
type AccountState = {
  generation: number
  clearedAt?: number
  verifiedClearedAt?: number
  ownClearedAt?: Partial<Record<AudienceKind, number>>
}
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
/** Atomic metadata/member transactions also serialize concurrent tabs and clears. */
export function createAudienceRepository(
  name = 'xf-audience-v1',
  limits = AUDIENCE_LIMITS,
) {
  let opening: Promise<IDBDatabase> | undefined
  function open() {
    return (opening ||= new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 2)
      r.onupgradeneeded = (event) => {
        const db = r.result
        if (event.oldVersion === 0) {
          db.createObjectStore('meta', { keyPath: 'key' })
          db.createObjectStore('accounts')
          const rows = db.createObjectStore('members', { keyPath: 'key' })
          rows.createIndex('list', 'list')
          rows.createIndex(FOLLOWER_COUNT_QUEUE, ['list', 'followerCountRetryAt'])
        } else {
          const rows = r.transaction!.objectStore('members')
          rows.createIndex(FOLLOWER_COUNT_QUEUE, ['list', 'followerCountRetryAt'])
          const scan = rows.openCursor()
          scan.onsuccess = () => {
            const cursor = scan.result
            if (!cursor) return
            const row = cursor.value as Row
            if (/^(\d+):\1:followers$/.test(row.list) && row.member.followers === undefined)
              cursor.update({ ...row, followerCountRetryAt: 0 })
            cursor.continue()
          }
        }
      }
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close()
          opening = undefined
        }
        resolve(r.result)
      }
      r.onerror = () => {
        opening = undefined
        reject(r.error)
      }
      r.onblocked = () => {
        opening = undefined
        reject(new Error('Database blocked'))
      }
    }))
  }
  async function transaction<T>(
    write: boolean,
    run: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = await open(),
      tx = db.transaction(
        ['meta', 'members', 'accounts'],
        write ? 'readwrite' : 'readonly',
      )
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error || new Error('Aborted'))
      tx.onerror = () => {}
    })
    try {
      const result = await run(tx)
      await done
      return result
    } catch (error) {
      try {
        tx.abort()
      } catch {}
      await done.catch(() => {})
      throw error
    }
  }
  const accountState = async (tx: IDBTransaction, account: string) => {
    const value = (await request(tx.objectStore('accounts').get(account))) as
      | AccountState
      | number
      | undefined
    return typeof value === 'object' ? value : { generation: value ?? 0 }
  }
  const rows = (tx: IDBTransaction, key: string) =>
    request(tx.objectStore('members').index('list').getAll(key)) as Promise<
      Row[]
    >
  return {
    accountState: (account: string) =>
      transaction(false, (tx) => accountState(tx, account)),
    list: () =>
      transaction(
        false,
        (tx) =>
          request(tx.objectStore('meta').getAll()) as Promise<AudienceMeta[]>,
      ),
    read: (key: string) =>
      transaction(false, async (tx) => {
        const meta = (await request(tx.objectStore('meta').get(key))) as
          | AudienceMeta
          | undefined
        return meta
          ? ({
              ...meta,
              members: (await rows(tx, key)).map((r) => r.member),
            } as AudienceSnapshot)
          : null
      }),
    missingFollowerCounts: (account: string, now: number, limit: number) =>
      transaction(false, async (tx) => {
        const key = audienceKey(account, account, 'followers')
        const range = IDBKeyRange.bound([key, 0], [key, now])
        const pending = await request(
          tx.objectStore('members').index(FOLLOWER_COUNT_QUEUE).getAll(range, limit),
        ) as Row[]
        return pending.map(({ member: { id, handle } }) => ({ id, handle }))
      }),
    fillFollowerCounts: (
      account: string,
      expected: number,
      counts: Array<{ id: string; followers?: number }>,
      now: number,
    ) =>
      transaction(true, async (tx) => {
        if ((await accountState(tx, account)).generation !== expected) return 0
        const key = audienceKey(account, account, 'followers')
        const metaStore = tx.objectStore('meta')
        const metas = await request(metaStore.getAll()) as AudienceMeta[]
        const meta = metas.find((record) => record.key === key)
        if (!meta) return 0
        let totalBytes = metas.reduce((n, record) => n + record.bytes, 0)
        let updated = 0
        const memberStore = tx.objectStore('members')
        for (const { id, followers } of counts) {
          const row = await request(memberStore.get(`${key}:${id}`)) as Row | undefined
          if (!row || row.member.followers !== undefined) continue
          row.followerCountRetryAt = now + DAY
          if (typeof followers === 'number' && Number.isSafeInteger(followers) && followers >= 0) {
            const member = { ...row.member, followers, clocks: { ...row.member.clocks, followers: now } }
            const addedBytes = memberBytes(member) - memberBytes(row.member)
            if (totalBytes + addedBytes <= limits.bytes) {
              row.member = member
              delete row.followerCountRetryAt
              meta.bytes += addedBytes
              totalBytes += addedBytes
              updated++
            }
          }
          memberStore.put(row)
        }
        if (updated) {
          meta.updatedAt = Math.max(meta.updatedAt, now)
          metaStore.put(meta)
        }
        return updated
      }),
    add: (
      account: string,
      expected: number,
      packet: AudiencePacket,
      now = Date.now(),
    ) =>
      transaction(true, async (tx) => {
        if ((await accountState(tx, account)).generation !== expected)
          return { state: 'changed' as const }
        const metas = (await request(
            tx.objectStore('meta').getAll(),
          )) as AudienceMeta[],
          key = audienceKey(account, packet.targetId, packet.kind)
        const old = metas.find((m) => m.key === key)
        if (old && audienceStale(old, now))
          return { state: 'stale' as const, key }
        if (
          !old &&
          new Set(
            metas.filter((m) => m.account === account).map((m) => m.targetId),
          ).size >= limits.targets &&
          !metas.some(
            (m) => m.account === account && m.targetId === packet.targetId,
          )
        )
          return { state: 'capacity' as const }
        const meta: AudienceMeta = old || {
          key,
          account,
          targetId: packet.targetId,
          handle: packet.handle,
          kind: packet.kind,
          batch: crypto.randomUUID(),
          startedAt: now,
          updatedAt: now,
          count: 0,
          bytes: 0,
        }
        let totalRows = metas.reduce((n, m) => n + m.count, 0),
          totalBytes = metas.reduce((n, m) => n + m.bytes, 0),
          limited = false
        const memberStore = tx.objectStore('members')
        const previous = new Map<string, Row>()
        const ownFollowers = packet.kind === 'followers' && packet.targetId === account
        for (const item of packet.members) {
          const rowKey = `${key}:${item.id}`
          const beforeRow = previous.get(item.id) ||
              (await request(memberStore.get(rowKey))) as Row | undefined
          const before = beforeRow?.member,
            member = mergeAudienceMember(before, item)
          const size = memberBytes(member), oldSize = before ? memberBytes(before) : 0
          if (
            (!before &&
              (meta.count >= limits[packet.kind] ||
                totalRows >= limits.rows)) ||
            totalBytes + size - oldSize > limits.bytes
          ) {
            limited = true
            continue
          }
          const row: Row = { key: rowKey, list: key, member }
          if (ownFollowers && member.followers === undefined)
            row.followerCountRetryAt = member.handle === before?.handle ? beforeRow?.followerCountRetryAt ?? 0 : 0
          memberStore.put(row)
          previous.set(item.id, row)
          meta.bytes += size - oldSize
          totalBytes += size - oldSize
          if (!before) {
            meta.count++
            totalRows++
          }
        }
        meta.updatedAt = now
        meta.handle = packet.handle
        meta.limited = limited
        if (packet.total !== undefined) meta.total = packet.total
        tx.objectStore('meta').put(meta)
        return {
          state: limited ? ('capacity' as const) : ('saved' as const),
          key,
        }
      }),
    clear: (account: string, key?: string) =>
      transaction(true, async (tx) => {
        const metas = (await request(
          tx.objectStore('meta').getAll(),
        )) as AudienceMeta[]
        for (const m of metas.filter(
          (m) => m.account === account && (!key || m.key === key),
        )) {
          for (const row of await rows(tx, m.key))
            tx.objectStore('members').delete(row.key)
          tx.objectStore('meta').delete(m.key)
        }
        const previous = await accountState(tx, account)
        const next = previous.generation + 1
        const clearedAt = Date.now()
        const ownClearedAt = { ...previous.ownClearedAt }
        for (const kind of AUDIENCE_KINDS)
          if (!key || key === audienceKey(account, account, kind)) ownClearedAt[kind] = clearedAt
        tx.objectStore('accounts').put({ ...previous, generation: next, clearedAt, ownClearedAt }, account)
        return next
      }),
  }
}

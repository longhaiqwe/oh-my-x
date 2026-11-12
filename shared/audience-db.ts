import {
  audienceKey,
  audienceStale,
  mergeAudienceMember,
  type AudienceMeta,
  type AudienceMember,
  type AudiencePacket,
  type AudienceSnapshot,
} from './audience'
export const AUDIENCE_LIMITS = {
  targets: 3,
  followers: 20000,
  following: 10000,
  rows: 100000,
  bytes: 30 * 1024 * 1024,
}
type Row = { key: string; list: string; member: AudienceMember }
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
      const r = indexedDB.open(name, 1)
      r.onupgradeneeded = () => {
        const db = r.result
        db.createObjectStore('meta', { keyPath: 'key' })
        db.createObjectStore('accounts')
        const rows = db.createObjectStore('members', { keyPath: 'key' })
        rows.createIndex('list', 'list')
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
  const generation = async (tx: IDBTransaction, account: string) =>
    ((await request(tx.objectStore('accounts').get(account))) as
      | number
      | undefined) || 0
  const rows = (tx: IDBTransaction, key: string) =>
    request(tx.objectStore('members').index('list').getAll(key)) as Promise<
      Row[]
    >
  return {
    generation: (account: string) =>
      transaction(false, (tx) => generation(tx, account)),
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
    add: (
      account: string,
      expected: number,
      packet: AudiencePacket,
      now = Date.now(),
    ) =>
      transaction(true, async (tx) => {
        if ((await generation(tx, account)) !== expected)
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
        const previous = new Map(
          (await rows(tx, key)).map((r) => [r.member.id, r.member]),
        )
        for (const item of packet.members) {
          const before = previous.get(item.id),
            member = mergeAudienceMember(before, item)
          const size = new TextEncoder().encode(
              JSON.stringify(member),
            ).byteLength,
            oldSize = before
              ? new TextEncoder().encode(JSON.stringify(before)).byteLength
              : 0
          if (
            (!before &&
              (meta.count >= limits[packet.kind] ||
                totalRows >= limits.rows)) ||
            totalBytes + size - oldSize > limits.bytes
          ) {
            limited = true
            continue
          }
          tx.objectStore('members').put({
            key: `${key}:${item.id}`,
            list: key,
            member,
          })
          previous.set(item.id, member)
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
        const next = (await generation(tx, account)) + 1
        tx.objectStore('accounts').put(next, account)
        return next
      }),
  }
}

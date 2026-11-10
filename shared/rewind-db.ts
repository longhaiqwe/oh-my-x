import { AppError } from './errors'
import {
  mergeRewind,
  trimRewind,
  type RewindPost,
  type RewindState,
} from './rewind'

// Extension-origin only. Account metadata and rows share a transaction, including clear generations.
export function createRewindRepository(name = 'oh-my-x-rewind') {
  let opening: Promise<IDBDatabase> | undefined
  function open() {
    return (opening ||= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        const posts = request.result.createObjectStore('posts', {
          keyPath: ['account', 'id'],
        })
        posts.createIndex('account', 'account')
        request.result.createObjectStore('accounts', { keyPath: 'account' })
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          opening = undefined
        }
        resolve(db)
      }
      request.onerror = () => {
        opening = undefined
        reject(request.error)
      }
      request.onblocked = () => {
        opening = undefined
        reject(new AppError('error.dbUpgrading'))
      }
    }))
  }
  async function transaction<T>(
    account: string,
    mode: IDBTransactionMode,
    change: (state: RewindState) => T,
  ): Promise<T> {
    if (!/^\d{1,30}$/.test(account)) throw new AppError('error.accountChanged')
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['accounts', 'posts'], mode),
        accounts = tx.objectStore('accounts'),
        posts = tx.objectStore('posts')
      const meta = accounts.get(account),
        rows = posts.index('account').getAll(account)
      let result: T, failure: unknown
      rows.onsuccess = () => {
        try {
          const before = rows.result as (RewindPost & { account: string })[]
          const state: RewindState = {
            account,
            generation: meta.result?.generation || 0,
            posts: before
              .map(({ account: _, ...p }) => p)
              .sort((a, b) => b.firstSeenAt - a.firstSeenAt),
          }
          const originals = new Map(
            mode === 'readwrite'
              ? state.posts.map((p) => [p.id, JSON.stringify(p)])
              : [],
          )
          result = change(state)
          if (mode === 'readwrite') {
            state.posts = trimRewind(state.posts)
            const ids = new Set(state.posts.map((p) => p.id))
            for (const row of before)
              if (!ids.has(row.id)) posts.delete([account, row.id])
            for (const p of state.posts)
              if (originals.get(p.id) !== JSON.stringify(p))
                posts.put({ ...p, account })
            accounts.put({ account, generation: state.generation })
          }
        } catch (e) {
          failure = e
          tx.abort()
        }
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = tx.onerror = () =>
        reject(failure || tx.error || new AppError('error.dbWriteFailed'))
    })
  }
  return {
    read: (account: string) => transaction(account, 'readonly', (s) => s),
    clear: (account: string) =>
      transaction(account, 'readwrite', (s) => {
        s.posts = []
        return ++s.generation
      }),
    add: (account: string, generation: number, items: RewindPost[]) =>
      transaction(account, 'readwrite', (s) => {
        if (s.generation !== generation) return false
        const map = new Map(s.posts.map((p) => [p.id, p]))
        let changed = false
        for (const item of items) {
          const previous = map.get(item.id),
            next = previous ? mergeRewind(previous, item) : item
          if (JSON.stringify(previous) !== JSON.stringify(next)) {
            changed = true
            map.set(item.id, next)
          }
        }
        s.posts = [...map.values()]
        return changed
      }),
    ocr: (
      account: string,
      generation: number,
      id: string,
      src: string,
      text: string,
      language: string,
    ) =>
      transaction(account, 'readwrite', (s) => {
        if (s.generation !== generation) return false
        const media = s.posts
          .find((p) => p.id === id)
          ?.media.find((m) => m.src === src)
        if (!media) return false
        media.text = text.slice(0, 8000)
        media.language = language
        return true
      }),
  }
}
export type RewindRepository = ReturnType<typeof createRewindRepository>

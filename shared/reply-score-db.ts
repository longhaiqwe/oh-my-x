// 回复区 AI 打分的结果缓存，存在后台的 IndexedDB（插件自己的数据库，X 页面读不到）。
// 不放 storage.local：每写一次 storage.local，所有 X 标签页都会收到变更通知，而打分结果写得频繁。
import { REPLY_SCORE_PROMPT_VERSION, type ReplyScore } from './ai-reply-score'

export const REPLY_SCORE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const REPLY_SCORE_MAX_ENTRIES = 5000
/** 清理过期和超量条目的最短间隔 */
const PRUNE_INTERVAL_MS = 10 * 60 * 1000

export interface StoredReplyScore extends ReplyScore {
  model: string
  promptVersion: number
  savedAt: number
}

export interface ReplyScoreRepository {
  /** 只返回没过期、提示词版本一致的结果 */
  getMany(ids: string[]): Promise<Map<string, StoredReplyScore>>
  putMany(entries: StoredReplyScore[]): Promise<void>
}

export function isUsableScore(entry: StoredReplyScore | undefined, now: number, promptVersion = REPLY_SCORE_PROMPT_VERSION): entry is StoredReplyScore {
  return Boolean(entry) && entry!.promptVersion === promptVersion && now - entry!.savedAt < REPLY_SCORE_TTL_MS
}

export function toReplyScore(entry: StoredReplyScore): ReplyScore {
  return { id: entry.id, score: entry.score, signals: entry.signals, reason: entry.reason }
}

/** 内存版：测试用，也是打不开 IndexedDB 时的退路（只在本次运行有效） */
export function createMemoryReplyScoreRepository(now: () => number = Date.now): ReplyScoreRepository & { size(): number } {
  const entries = new Map<string, StoredReplyScore>()
  return {
    async getMany(ids) {
      const found = new Map<string, StoredReplyScore>()
      for (const id of ids) {
        const entry = entries.get(id)
        if (isUsableScore(entry, now())) found.set(id, entry)
      }
      return found
    },
    async putMany(list) {
      for (const entry of list) {
        entries.delete(entry.id)
        entries.set(entry.id, entry)
      }
      const time = now()
      for (const [id, entry] of entries) if (time - entry.savedAt >= REPLY_SCORE_TTL_MS) entries.delete(id)
      // Map 按写入顺序排列，先删最早写入的
      for (const id of entries.keys()) {
        if (entries.size <= REPLY_SCORE_MAX_ENTRIES) break
        entries.delete(id)
      }
    },
    size: () => entries.size,
  }
}

const STORE = 'scores'

export function createReplyScoreRepository(name = 'oh-my-x-reply-scores', now: () => number = Date.now): ReplyScoreRepository {
  let fallback: ReplyScoreRepository | null = null
  let opening: Promise<IDBDatabase> | undefined
  let lastPrune = 0

  const open = () => opening ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('savedAt', 'savedAt')
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opening = undefined }
      resolve(request.result)
    }
    request.onerror = () => { opening = undefined; reject(request.error) }
    request.onblocked = () => { opening = undefined; reject(new Error('reply score database blocked')) }
  })

  async function database(): Promise<IDBDatabase | null> {
    if (fallback) return null
    if (typeof indexedDB === 'undefined') {
      fallback = createMemoryReplyScoreRepository(now)
      return null
    }
    try {
      return await open()
    } catch (error) {
      console.debug('[oh-my-x] AI 打分缓存打不开 IndexedDB，改用内存', error)
      fallback = createMemoryReplyScoreRepository(now)
      return null
    }
  }

  function prune(db: IDBDatabase) {
    const time = now()
    if (time - lastPrune < PRUNE_INTERVAL_MS) return
    lastPrune = time
    const tx = db.transaction(STORE, 'readwrite')
    const index = tx.objectStore(STORE).index('savedAt')
    const expired = index.openCursor(IDBKeyRange.upperBound(time - REPLY_SCORE_TTL_MS))
    expired.onsuccess = () => {
      const cursor = expired.result
      if (cursor) { cursor.delete(); cursor.continue(); return }
      const count = tx.objectStore(STORE).count()
      count.onsuccess = () => {
        let extra = count.result - REPLY_SCORE_MAX_ENTRIES
        if (extra <= 0) return
        const oldest = index.openCursor()
        oldest.onsuccess = () => {
          const c = oldest.result
          if (!c || extra <= 0) return
          c.delete()
          extra -= 1
          c.continue()
        }
      }
    }
    tx.onerror = () => console.debug('[oh-my-x] AI 打分缓存清理失败', tx.error)
  }

  return {
    async getMany(ids) {
      const db = await database()
      if (!db) return fallback!.getMany(ids)
      return new Promise((resolve, reject) => {
        const found = new Map<string, StoredReplyScore>()
        const tx = db.transaction(STORE, 'readonly')
        const store = tx.objectStore(STORE)
        const time = now()
        for (const id of ids) {
          const request = store.get(id)
          request.onsuccess = () => {
            const entry = request.result as StoredReplyScore | undefined
            if (isUsableScore(entry, time)) found.set(id, entry)
          }
        }
        tx.oncomplete = () => resolve(found)
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
    },
    async putMany(entries) {
      if (!entries.length) return
      const db = await database()
      if (!db) return fallback!.putMany(entries)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        for (const entry of entries) store.put(entry)
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
      prune(db)
    },
  }
}

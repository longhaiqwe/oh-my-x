// 回复区 AI 打分的本机数据，存在后台的 IndexedDB（插件自己的数据库，X 页面读不到）：
// - scores：模型打分的缓存，7 天过期，最多 5000 条
// - labels：用户的「机器人 / 真人」标注，不过期
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

export type ReplyLabel = 'bot' | 'human'

/** 一条标注：标注时的回复内容、上下文和当时的 AI 结果，导出后可以拿来调提示词或并入样例集 */
export interface StoredReplyLabel {
  id: string
  label: ReplyLabel
  author: string
  text: string
  parentAuthor: string
  parentText: string
  delaySeconds: number | null
  followers: number | null
  verified: boolean | null
  /** 标注时的 AI 结果；还没打分时为 null */
  ai: { score: number; signals: string[]; reason: string; model: string | null; promptVersion: number } | null
  labeledAt: number
}

export interface ReplyScoreRepository {
  /** 只返回没过期、提示词版本一致的结果 */
  getMany(ids: string[]): Promise<Map<string, StoredReplyScore>>
  putMany(entries: StoredReplyScore[]): Promise<void>
  getLabels(ids: string[]): Promise<Map<string, ReplyLabel>>
  putLabel(entry: StoredReplyLabel): Promise<void>
  deleteLabel(id: string): Promise<void>
  /** 全部标注，按标注时间从早到晚 */
  allLabels(): Promise<StoredReplyLabel[]>
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
  const labels = new Map<string, StoredReplyLabel>()
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
    async getLabels(ids) {
      const found = new Map<string, ReplyLabel>()
      for (const id of ids) {
        const entry = labels.get(id)
        if (entry) found.set(id, entry.label)
      }
      return found
    },
    async putLabel(entry) {
      labels.set(entry.id, entry)
    },
    async deleteLabel(id) {
      labels.delete(id)
    },
    async allLabels() {
      return [...labels.values()].sort((a, b) => a.labeledAt - b.labeledAt)
    },
    size: () => entries.size,
  }
}

const STORE = 'scores'
const LABELS = 'labels'

export function createReplyScoreRepository(name = 'oh-my-x-reply-scores', now: () => number = Date.now): ReplyScoreRepository {
  let fallback: ReplyScoreRepository | null = null
  let opening: Promise<IDBDatabase> | undefined
  let lastPrune = 0

  // 版本 2 加了 labels 表；升级时只建缺少的表，已有的分数缓存保留
  const open = () => opening ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('savedAt', 'savedAt')
      }
      if (!db.objectStoreNames.contains(LABELS)) {
        db.createObjectStore(LABELS, { keyPath: 'id' }).createIndex('labeledAt', 'labeledAt')
      }
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

  /** 在一个事务里执行，事务完成后返回 collect() 的结果 */
  function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => void, collect: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      work(tx.objectStore(store))
      tx.oncomplete = () => resolve(collect())
      tx.onerror = tx.onabort = () => reject(tx.error)
    })
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
      const found = new Map<string, StoredReplyScore>()
      const time = now()
      return run(db, STORE, 'readonly', (store) => {
        for (const id of ids) {
          const request = store.get(id)
          request.onsuccess = () => {
            const entry = request.result as StoredReplyScore | undefined
            if (isUsableScore(entry, time)) found.set(id, entry)
          }
        }
      }, () => found)
    },
    async putMany(entries) {
      if (!entries.length) return
      const db = await database()
      if (!db) return fallback!.putMany(entries)
      await run(db, STORE, 'readwrite', (store) => { for (const entry of entries) store.put(entry) }, () => undefined)
      prune(db)
    },
    async getLabels(ids) {
      const db = await database()
      if (!db) return fallback!.getLabels(ids)
      const found = new Map<string, ReplyLabel>()
      return run(db, LABELS, 'readonly', (store) => {
        for (const id of ids) {
          const request = store.get(id)
          request.onsuccess = () => {
            const entry = request.result as StoredReplyLabel | undefined
            if (entry) found.set(id, entry.label)
          }
        }
      }, () => found)
    },
    async putLabel(entry) {
      const db = await database()
      if (!db) return fallback!.putLabel(entry)
      await run(db, LABELS, 'readwrite', (store) => { store.put(entry) }, () => undefined)
    },
    async deleteLabel(id) {
      const db = await database()
      if (!db) return fallback!.deleteLabel(id)
      await run(db, LABELS, 'readwrite', (store) => { store.delete(id) }, () => undefined)
    },
    async allLabels() {
      const db = await database()
      if (!db) return fallback!.allLabels()
      let list: StoredReplyLabel[] = []
      return run(db, LABELS, 'readonly', (store) => {
        const request = store.index('labeledAt').getAll()
        request.onsuccess = () => { list = request.result as StoredReplyLabel[] }
      }, () => list)
    },
  }
}

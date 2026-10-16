import { normalizeOwnPostThumbnail, type OwnPost } from './own-posts'

export const LIBRARY_MESSAGE = 'XF_OWN_POST_LIBRARY'
export const LIBRARY_SYNC = 'XF_OWN_POST_LIBRARY_SYNC'
export const LIBRARY_ALARM = 'xf-own-post-library'
const REFRESH_INTERVAL = 30 * 60_000
const LEASE_MS = 60_000
export interface LibraryMeta {
  thumbnailVersion?: number
  historyCursor: string | null
  historyDone: boolean
  refreshing: boolean
  refreshCursor: string | null
  refreshBoundary: string
  lastRefresh: number
  lastWrite: number
  nextRun: number
  retryAt: number
  paused: boolean
  error: string
  lease?: { token: string; expires: number }
}
export interface LibraryState {
  account: string
  posts: Record<string, OwnPost & { searchText: string }>
  meta: LibraryMeta
}
export interface LibraryRepository {
  read(account: string): Promise<LibraryState>
  update<T>(account: string, change: (state: LibraryState) => T): Promise<T>
}
export interface LibraryRequest {
  action: 'search' | 'begin' | 'page' | 'finish' | 'pause'
  account: string
  handle: string
  query?: string
  offset?: number
  limit?: number
  manual?: boolean
  token?: string
  posts?: OwnPost[]
  cursor?: string | null
  error?: string
}
export function emptyLibrary(account: string): LibraryState {
  return { account, posts: {}, meta: { thumbnailVersion:1, historyCursor:null, historyDone:false, refreshing:false, refreshCursor:null,
    refreshBoundary:'0', lastRefresh:0, lastWrite:0, nextRun:0, retryAt:0, paused:false, error:'' } }
}
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase()
const compareId = (a: string, b: string) => a.length - b.length || a.localeCompare(b)
function next(state: LibraryState) {
  return { mode: state.meta.refreshing ? 'refresh' : 'history',
    cursor: state.meta.refreshing ? state.meta.refreshCursor : state.meta.historyCursor,
    done: !state.meta.refreshing && state.meta.historyDone }
}
export function createLibraryService(repo: LibraryRepository, now = Date.now) {
  return async (request: LibraryRequest): Promise<any> => {
    const { account, handle, action } = request
    if (!/^\d{1,30}$/.test(account) || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('无法识别当前账号')
    if (action === 'search') {
      const state = await repo.read(account)
      const words = normalize((request.query || '').slice(0,200)).split(/\s+/).filter(Boolean)
      const matches = Object.values(state.posts).filter(post => words.every(word => post.searchText.includes(word)))
        .sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0) || compareId(b.id,a.id))
      const offset = Math.max(0, Math.floor(Number(request.offset) || 0))
      const limit = Math.min(100, Math.max(1, Math.floor(Number(request.limit) || 30)))
      return { posts: matches.slice(offset,offset+limit).map(({searchText:_, ...post}) => ({...post,handle,url:`https://x.com/${handle}/status/${post.id}`})),
        total: matches.length, count: Object.keys(state.posts).length,
        meta: { ...state.meta, lease: undefined, syncing: (state.meta.lease?.expires || 0) > now() } }
    }
    return repo.update(account, state => {
      const meta = state.meta
      if (action === 'pause') { meta.paused = true; delete meta.lease; return { ok:true } }
      if (action === 'begin') {
        if ((meta.lease?.expires || 0) > now() || meta.retryAt > now() ||
            (!request.manual && (meta.paused || meta.nextRun > now()))) return { ...next(state), meta }
        if (request.manual) meta.paused = false
        // Old caches have no image metadata. Revisit the timeline once, retaining
        // searchable text and all existing pause, rate-limit and lease guarantees.
        if (meta.thumbnailVersion !== 1) {
          meta.thumbnailVersion = 1
          meta.historyCursor = null
          meta.historyDone = false
          meta.refreshing = false
          meta.refreshCursor = null
        }
        if ((meta.historyDone || Object.keys(state.posts).length) && ((request.manual && meta.historyDone) || now()-meta.lastRefresh >= REFRESH_INTERVAL) && !meta.refreshing) {
          meta.refreshing = true
          meta.refreshCursor = null
          meta.refreshBoundary = Object.keys(state.posts).sort(compareId).at(-1) || '0'
        }
        if (!meta.refreshing && meta.historyDone) return { ...next(state), meta }
        meta.lease = { token:crypto.randomUUID(), expires:now()+LEASE_MS }
        meta.error = ''
        return { ...next(state), token:meta.lease.token, meta }
      }
      if (!meta.lease || meta.lease.token !== request.token || meta.lease.expires < now()) throw new Error('同步已结束，请重新开始')
      if (action === 'finish') {
        delete meta.lease
        meta.error = (request.error || '').slice(0,300)
        if (meta.error) meta.retryAt = now() + (/频繁|429/.test(meta.error) ? 15*60_000 : 2*60_000)
        meta.nextRun = Math.max(meta.retryAt, now() + (meta.historyDone && !meta.refreshing ? REFRESH_INTERVAL : 60_000))
        return { ok:true }
      }
      if (action !== 'page' || !Array.isArray(request.posts) || request.posts.length>200 ||
          (request.cursor != null && (typeof request.cursor !== 'string' || request.cursor.length>4096))) throw new Error('无效的同步数据')
      const posts = request.posts.filter(p => p && /^\d{1,30}$/.test(p.id) && p.handle?.toLowerCase()===handle.toLowerCase() &&
        typeof p.text==='string' && typeof p.title==='string')
      const old = posts.filter(p => state.posts[p.id] && compareId(p.id,meta.refreshBoundary)<=0)
      const joined = old.length >= 2 && !!posts.length && old.some(p=>p.id===posts.at(-1)!.id)
      const previous = meta.refreshing ? meta.refreshCursor : meta.historyCursor
      const cursor = request.cursor || null
      if (meta.refreshing) {
        if (joined || !cursor || cursor===previous) { meta.refreshing=false;meta.refreshCursor=null;meta.lastRefresh=now() }
        else meta.refreshCursor=cursor
      } else {
        meta.historyCursor = cursor
        meta.historyDone = !cursor || cursor===previous
        if (!meta.lastRefresh) meta.lastRefresh=now()
      }
      for (const p of posts) {
        const post: OwnPost = {id:p.id,handle,thumbnailUrl:normalizeOwnPostThumbnail(p.thumbnailUrl),text:p.text.slice(0,200_000),title:p.title.slice(0,1000),
          timestamp: typeof p.timestamp==='number' && Number.isFinite(p.timestamp) ? p.timestamp : null,url:`https://x.com/${handle}/status/${p.id}`}
        state.posts[p.id] = {...post,searchText:normalize(`${post.title}\n${post.text}`)}
      }
      meta.lastWrite=now();meta.lease.expires=now()+LEASE_MS;meta.error='';meta.retryAt=0
      return { ...next(state), meta }
    })
  }
}

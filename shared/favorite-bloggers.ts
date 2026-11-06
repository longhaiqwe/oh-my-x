import { RESERVED_HANDLES } from './quick-list'
import { KeyFavoriteBloggers } from '../storage-keys'

export const FAVORITE_BLOGGER_MESSAGE = 'XF_FAVORITE_BLOGGER'

export interface FavoriteBlogger {
  handle: string
  name: string
}

/** 只接受用户名或 X / Twitter 主页地址，不把帖子、站内路由或外站链接当成博主。 */
export function parseBloggerHandle(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let value = input.trim()
  if (/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\//i.test(value)) {
    try {
      const url = new URL(/^https?:/i.test(value) ? value : `https://${value}`)
      if (!['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null
      value = url.pathname.replace(/^\/|\/$/g, '')
    } catch { return null }
  } else {
    value = value.replace(/^@/, '')
  }
  return /^[A-Za-z0-9_]{1,15}$/.test(value) && !RESERVED_HANDLES.has(value.toLowerCase()) &&
    !['explore', 'notifications', 'bookmarks', 'lists', 'communities', 'jobs', 'premium', 'grok', 'about', 'login', 'logout', 'signup', 'account', 'download', 'share'].includes(value.toLowerCase())
    ? value : null
}

export function toFavoriteBloggers(raw: unknown): FavoriteBlogger[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap(item => {
    const handle = parseBloggerHandle(item?.handle)
    if (!handle || seen.has(handle.toLowerCase())) return []
    seen.add(handle.toLowerCase())
    return [{ handle, name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 100) : handle }]
  })
}

type FavoriteStorage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (data: Record<string, unknown>) => Promise<unknown>
}

/** 后台串行处理所有标签页的增删与移动，避免各页面用旧数组覆盖其他收藏。 */
export function createFavoriteBloggerWriter(storage: FavoriteStorage) {
  let pending: Promise<unknown> = Promise.resolve()
  return (message: { action?: unknown; blogger?: unknown; handle?: unknown; targetHandle?: unknown; placement?: unknown }) => {
    const operation = pending.then(async () => {
      const blogger = toFavoriteBloggers([message.blogger])[0]
      const handle = message.action === 'add' ? blogger?.handle : parseBloggerHandle(message.handle)
      if (!handle || !['add', 'remove', 'move'].includes(String(message.action))) return { ok: false }
      const stored = await storage.get(KeyFavoriteBloggers)
      const items = toFavoriteBloggers(stored[KeyFavoriteBloggers])
      const index = items.findIndex(item => item.handle.toLowerCase() === handle.toLowerCase())
      if (message.action === 'move') {
        const target = parseBloggerHandle(message.targetHandle)?.toLowerCase()
        if (index < 0 || !target || !items.some(item => item.handle.toLowerCase() === target) ||
          (message.placement !== 'before' && message.placement !== 'after')) return { ok: false }
        if (target === handle.toLowerCase()) return { ok: true, items }
        const [moved] = items.splice(index, 1)
        const targetIndex = items.findIndex(item => item.handle.toLowerCase() === target)
        items.splice(targetIndex + (message.placement === 'after' ? 1 : 0), 0, moved)
      } else if (message.action === 'remove') {
        if (index >= 0) items.splice(index, 1)
      } else if (index < 0) {
        items.unshift(blogger)
      }
      await storage.set({ [KeyFavoriteBloggers]: items })
      return { ok: true, items }
    }).catch(() => ({ ok: false }))
    pending = operation
    return operation
  }
}

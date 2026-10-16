export interface QuickListItem {
  id: string
  name: string
  ownerHandle?: string
  isOwned?: boolean // 是否为自己创建的列表（默认为 true）
  isPinned?: boolean // 是否置顶
}

export const RESERVED_HANDLES = new Set([
  'i',
  'home',
  'explore',
  'notifications',
  'messages',
  'search',
  'settings',
  'compose',
  'intent',
  'hashtag',
  'personalization',
  'privacy',
  'tos',
  'help',
])

/**
 * 从 X List 链接或纯数字输入中解析 List ID
 */
export function extractListId(input: string): string | null {
  const s = String(input || '').trim()
  const m = s.match(/(?:x\.com|twitter\.com)\/i\/lists\/(\d+)/)
  if (m) return m[1]
  if (/^\d+$/.test(s)) return s
  return null
}

/**
 * 从卡片元素解析用户 @handle
 */
export function extractHandleFromCard(card: Element): string | null {
  const candidates = [
    ...card.querySelectorAll('a[data-testid="UserLink"][href^="/"]'),
    ...card.querySelectorAll('a[href^="/"]'),
  ]
  for (const a of candidates) {
    const href = a.getAttribute('href') || ''
    const m = href.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)
    if (m && !RESERVED_HANDLES.has(m[1].toLowerCase())) {
      return m[1]
    }
  }
  return null
}

/**
 * 从卡片元素及关注按钮中解析用户数字 ID
 */
export function extractUserIdFromCard(card: Element, followBtn?: Element | null): string | null {
  const t = (followBtn && followBtn.getAttribute('data-testid')) || ''
  const m = t.match(/^(\d+)-(?:un)?follow$/)
  if (m) return m[1]

  for (const el of card.querySelectorAll('[data-testid]')) {
    const tid = el.getAttribute('data-testid') || ''
    const mm = tid.match(/^(\d+)-(?:un)?follow$/)
    if (mm) return mm[1]
  }
  return null
}

/**
 * 规范化并清洗 QuickListItem 数组，剔除非法项与多余空白，剥离 Proxy 原型链
 */
export function toPlainQuickLists(items: unknown): QuickListItem[] {
  if (!items) return []
  let list: unknown[] = []
  if (Array.isArray(items)) {
    list = items
  } else if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items)
      if (Array.isArray(parsed)) list = parsed
    } catch {}
  }

  return list
    .map((item: any) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.name || '').trim(),
      ownerHandle: item?.ownerHandle ? String(item.ownerHandle).trim() : undefined,
      isOwned: item?.isOwned !== false, // 默认为 true（我创建的）
      isPinned: Boolean(item?.isPinned),
    }))
    .filter((item) => item.id && item.name)
}

/**
 * 排序 Lists：置顶项 (isPinned) 最前，其次为创建的列表 (isOwned)，最后为关注的列表
 */
export function sortQuickLists(items: QuickListItem[]): QuickListItem[] {
  return [...items].sort((a, b) => {
    // 1. 置顶列表优先排在最前
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1
    }
    // 2. 自己创建的列表优先排在关注列表前面
    if (Boolean(a.isOwned) !== Boolean(b.isOwned)) {
      return a.isOwned ? -1 : 1
    }
    return 0
  })
}

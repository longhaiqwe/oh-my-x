export type ProfileActivityType = 'post' | 'reply'

export interface ProfileActivityRoute {
  profileHandle: string
  type: ProfileActivityType
}

export interface ProfileActivityEntry {
  id: string
  date: string
  type: ProfileActivityType
  timestamp?: number
  isPinned?: boolean
}

export interface ProfileActivityDay {
  date: string
  posts: number
  replies: number
}

export interface ProfileActivitySummary {
  profileHandle: string
  posts: number
  replies: number
  days: ProfileActivityDay[]
}

const SYSTEM_ROUTES = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'settings',
  'search',
  'i',
  'compose',
  'intent',
  'tos',
  'privacy',
  'jobs',
  'bookmarks',
])

export function getProfileActivityRoute(pathname: string): ProfileActivityRoute | null {
  const parts = pathname.toLowerCase().split('/').filter(Boolean)
  const profileHandle = parts[0]
  if (!profileHandle || SYSTEM_ROUTES.has(profileHandle)) return null

  if (parts.length === 1) return { profileHandle, type: 'post' }
  if (parts.length === 2 && parts[1] === 'with_replies') {
    return { profileHandle, type: 'reply' }
  }
  return null
}

function parseStatusLink(href: string | null) {
  const match = href?.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/)
  if (!match?.[1] || !match[2]) return null
  return { handle: match[1].toLowerCase(), id: match[2] }
}

function formatLocalDay(datetime: string) {
  const date = new Date(datetime)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isPinnedTweet(article: HTMLElement): boolean {
  const socialContext = article.querySelector('[data-testid="socialContext"]')
  if (!socialContext) return false
  const text = (socialContext.textContent || '').trim().toLowerCase()
  return text.includes('pinned') || text.includes('置顶')
}

export function collectProfileActivity(
  doc: Document,
  route: ProfileActivityRoute,
): ProfileActivityEntry[] {
  const entries = new Map<string, ProfileActivityEntry>()

  doc.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach((article) => {
    const statusLink = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'))
      .map((link) => ({ link, status: parseStatusLink(link.getAttribute('href')) }))
      .find(({ status }) => status?.handle === route.profileHandle)
    if (!statusLink?.status) return

    const datetime = statusLink.link.querySelector('time[datetime]')?.getAttribute('datetime')
      ?? article.querySelector('time[datetime]')?.getAttribute('datetime')
    if (!datetime) return

    const date = formatLocalDay(datetime)
    if (!date) return
    const timestamp = new Date(datetime).getTime()
    const isPinned = isPinnedTweet(article)
    entries.set(statusLink.status.id, {
      id: statusLink.status.id,
      date,
      type: route.type,
      timestamp: Number.isNaN(timestamp) ? undefined : timestamp,
      isPinned,
    })
  })

  return Array.from(entries.values())
}

export function getOldestActivityTimestamp(
  entries: Iterable<ProfileActivityEntry>,
  options?: { ignorePinned?: boolean },
): number | null {
  let oldest: number | null = null
  for (const entry of entries) {
    if (options?.ignorePinned && entry.isPinned) continue
    if (typeof entry.timestamp === 'number') {
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp
      }
    }
  }
  return oldest
}

export function summarizeProfileActivity(
  profileHandle: string,
  entries: Iterable<ProfileActivityEntry>,
  options?: { cutoffTimestamp?: number },
): ProfileActivitySummary {
  const days = new Map<string, ProfileActivityDay>()
  let posts = 0
  let replies = 0

  for (const entry of entries) {
    if (
      typeof options?.cutoffTimestamp === 'number' &&
      typeof entry.timestamp === 'number' &&
      entry.timestamp < options.cutoffTimestamp
    ) {
      continue
    }

    const day = days.get(entry.date) ?? { date: entry.date, posts: 0, replies: 0 }
    if (entry.type === 'post') {
      day.posts += 1
      posts += 1
    } else {
      day.replies += 1
      replies += 1
    }
    days.set(entry.date, day)
  }

  return {
    profileHandle,
    posts,
    replies,
    days: Array.from(days.values()).sort((a, b) => b.date.localeCompare(a.date)),
  }
}

/** Only matching Followers / BlueVerifiedFollowers / Following timelines are accepted. No recursive user harvesting. */
export const AUDIENCE_MESSAGE = 'xf-audience'
export const AUDIENCE_CONTEXT = 'xf-audience-context'
export const AUDIENCE_DATA = 'xf-audience-data'
export type AudienceKind = 'followers' | 'verified_followers' | 'following'
export const AUDIENCE_KINDS = ['followers', 'verified_followers', 'following'] as const
export const AUDIENCE_CLASSIC = {
  followers: 'Followers',
  verified_followers: 'BlueVerifiedFollowers',
  following: 'Following',
} as const
export const AUDIENCE_RELAY = {
  followers: { operation: 'followersQuery', timeline: 'followers_timeline' },
  verified_followers: { operation: 'verifiedFollowersQuery', timeline: 'blue_verified_followers_timeline' },
  following: { operation: 'followingQuery', timeline: 'following_timeline' },
} as const
export const AUDIENCE_LABELS = {
  followers: 'audience.followers',
  verified_followers: 'audience.verifiedFollowers',
  following: 'audience.following',
} as const
export type AudienceMember = {
  id: string
  handle: string
  name?: string
  avatar?: string
  followers?: number
  following?: number
  createdAt?: number
  followsYou?: boolean
  observedAt: number
  clocks?: Record<string, number>
}
export type AudienceMeta = {
  key: string
  account: string
  targetId: string
  handle: string
  kind: AudienceKind
  batch: string
  startedAt: number
  updatedAt: number
  count: number
  bytes: number
  total?: number
  limited?: boolean
}
export type AudienceSnapshot = AudienceMeta & { members: AudienceMember[] }
export type AudienceContext = {
  account: string
  generation: number
  clearedAt?: number
  path: string
  token: string
}
export type AudiencePacket = {
  targetId: string
  handle: string
  kind: AudienceKind
  total?: number
  nextCursor?: string
  members: AudienceMember[]
}
export const AUDIENCE_BOUNDS = [0, 3000, 10000, 30000, 50000, 100000, Infinity]
export const audienceKey = (
  account: string,
  targetId: string,
  kind: AudienceKind,
) => `${account}:${targetId}:${kind}`
export function audienceRoute(path: string) {
  const match = path.match(
    /^\/([a-zA-Z0-9_]{1,15})\/(followers|verified_followers|following)\/?$/,
  )
  return match ? { handle: match[1], kind: match[2] as AudienceKind } : null
}
export function getClassicAudienceEndpoint(raw: unknown, kind: AudienceKind) {
  if (typeof raw !== 'string' || raw.length > 16_000) return
  try {
    const url = new URL(raw, 'https://x.com')
    const match = /^\/i\/api\/graphql\/[\w-]+\/(\w+)$/.exec(url.pathname)
    if (url.origin !== 'https://x.com' || match?.[1] !== AUDIENCE_CLASSIC[kind])
      return
    const endpoint = new URL(url.pathname, 'https://x.com')
    for (const key of ['features', 'fieldToggles']) {
      const text = url.searchParams.get(key)
      if (!text) continue
      const values = JSON.parse(text)
      if (!values || Array.isArray(values) || typeof values !== 'object') return
      const flags = Object.entries(values).filter(([k, value]) => /^\w{1,100}$/.test(k) && typeof value === 'boolean')
      endpoint.searchParams.set(key, JSON.stringify(Object.fromEntries(flags)))
    }
    return endpoint
  } catch {}
}

const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined
export function sanitizeAudienceMember(
  value: unknown,
  now = Date.now(),
): AudienceMember | null {
  const u = value as Partial<AudienceMember> | null
  if (
    !u ||
    typeof u.id !== 'string' ||
    !/^\d{1,30}$/.test(u.id) ||
    typeof u.handle !== 'string' ||
    !/^\w{1,15}$/.test(u.handle)
  )
    return null
  const result: AudienceMember = {
    id: u.id,
    handle: u.handle,
    observedAt: Math.min(now, count(u.observedAt) ?? now),
  }
  if (typeof u.name === 'string') result.name = u.name.slice(0, 200)
  if (
    typeof u.avatar === 'string' &&
    /^https:\/\/pbs\.twimg\.com\/profile_images\//.test(u.avatar)
  )
    result.avatar = u.avatar.slice(0, 1000)
  for (const key of ['followers', 'following', 'createdAt'] as const) {
    const n = count(u[key])
    if (n !== undefined && (key !== 'createdAt' || n <= now)) result[key] = n
  }
  if (typeof u.followsYou === 'boolean') result.followsYou = u.followsYou
  return result
}
export function parseAudienceResponse(
  url: string,
  data: unknown,
  path: string,
  now = Date.now(),
  ownerId?: string,
): AudiencePacket | null {
  const route = audienceRoute(path)
  if (!route) return null
  try {
    const request = new URL(url, 'https://x.com')
    const operation = request.pathname.match(/\/graphql\/[\w-]+\/(\w+)$/)?.[1]
    const relaySpec = AUDIENCE_RELAY[route.kind]
    const relay = operation === relaySpec.operation
    if (!relay && operation !== AUDIENCE_CLASSIC[route.kind]) return null
    const variables = JSON.parse(request.searchParams.get('variables') || '{}')
    const target = relay
      ? (data as any)?.data?.user_result_by_screen_name?.result
      : (data as any)?.data?.user?.result
    const targetId = relay ? (ownerId || target?.rest_id) : variables.userId
    if (typeof targetId !== 'string' || !/^\d+$/.test(targetId))
      return null
    if (
      !target ||
      (target.rest_id !== undefined && target.rest_id !== targetId) ||
      (relay && variables.screenName?.toLowerCase() !== route.handle.toLowerCase())
    )
      return null
    const handle = target.core?.screen_name || target.legacy?.screen_name
    // Some timeline responses contain only the target ID. The request-time route supplies its handle.
    if (handle && handle.toLowerCase() !== route.handle.toLowerCase())
      return null
    const instructions = relay
      ? target[relaySpec.timeline]?.timeline?.instructions
      : target.timeline?.timeline?.instructions || target.timeline?.instructions
    if (!Array.isArray(instructions)) return null
    const members = new Map<string, AudienceMember>()
    let nextCursor: string | undefined
    let ended = false
    for (const instruction of instructions) {
      const type = relay ? instruction?.__typename : instruction?.type
      if (type === 'TimelineTerminateTimeline' && instruction.direction === 'Bottom') ended = true
      if (type !== 'TimelineAddEntries' && type !== 'TimelineReplaceEntry') continue
      const entries = instruction.entries || [instruction.entry]
      if (!Array.isArray(entries)) continue
      for (const entry of entries.slice(0, 1000)) {
        const entryId = relay ? entry?.entry_id : entry?.entryId
        const content = entry?.content
        const item = relay ? content?.content : content?.itemContent
        if (/^cursor-bottom(?:-|$)/i.test(entryId || '')) {
          const cursor = relay ? (item || content) : content
          if (
            (cursor?.cursor_type ?? cursor?.cursorType) === 'Bottom' &&
            typeof cursor.value === 'string' && cursor.value.length > 0 && cursor.value.length <= 2048
          ) nextCursor = cursor.value
        }
        if (!/^user-\d+$/.test(entryId || '')) continue
        if (
          !item ||
          (relay && item.__typename !== 'TimelineUser') ||
          (item.itemType !== undefined && item.itemType !== 'TimelineUser') ||
          item.promotedMetadata ||
          entry.content.promotedMetadata
        )
          continue
        const u = item.user_results?.result
        if (!u || (u.__typename !== undefined && u.__typename !== 'User'))
          continue
        const legacy = u.legacy || {},
          core = u.core || {},
          rc = u.relationship_counts || {}
        const date = Date.parse(core.created_at || legacy.created_at || '')
        const member = sanitizeAudienceMember(
          {
            id: u.rest_id,
            handle: core.screen_name || legacy.screen_name,
            name: core.name ?? legacy.name,
            avatar: u.avatar?.image_url || legacy.profile_image_url_https,
            followers: rc.followers ?? legacy.followers_count,
            following: rc.following ?? legacy.friends_count,
            createdAt: Number.isFinite(date) ? date : undefined,
            followsYou: route.kind === 'verified_followers'
              ? undefined
              : u.relationship_perspectives?.followed_by ?? legacy.followed_by ?? u.is_followed_by,
            observedAt: now,
          },
          now,
        )
        if (member && entryId === `user-${member.id}`)
          members.set(member.id, member)
      }
    }
    return {
      targetId,
      handle: handle || route.handle,
      kind: route.kind,
      total:
        route.kind === 'verified_followers'
          ? undefined
          : count(
              route.kind === 'followers'
                ? (target.relationship_counts?.followers ??
                    target.legacy?.followers_count)
                : (target.relationship_counts?.following ??
                    target.legacy?.friends_count),
            ),
      members: [...members.values()],
      ...(!ended && nextCursor ? { nextCursor } : {}),
    }
  } catch {
    return null
  }
}
export function mergeAudienceMember(
  old: AudienceMember | undefined,
  next: AudienceMember,
): AudienceMember {
  const merged = {
    ...old,
    id: next.id,
    handle: old?.handle || next.handle,
    observedAt: Math.max(old?.observedAt || 0, next.observedAt),
    clocks: { ...old?.clocks },
  } as AudienceMember
  for (const key of [
    'handle',
    'name',
    'avatar',
    'followers',
    'following',
    'createdAt',
    'followsYou',
  ] as const) {
    if (
      next[key] !== undefined &&
      next.observedAt >=
        (old?.[key] === undefined ? 0 : (old.clocks?.[key] ?? old.observedAt))
    ) {
      ;(merged as any)[key] = next[key]
      merged.clocks![key] = next.observedAt
    }
  }
  return merged
}
export function audienceStats(members: AudienceMember[]) {
  const known = members.filter((m) => m.followers !== undefined)
  return {
    count: members.length,
    known: known.length,
    unknown: members.length - known.length,
    cumulative: [3000, 10000, 30000].map(
      (n) => known.filter((m) => m.followers! >= n).length,
    ),
    bins: AUDIENCE_BOUNDS.slice(0, -1).map(
      (n, i) =>
        known.filter(
          (m) => m.followers! >= n && m.followers! < AUDIENCE_BOUNDS[i + 1],
        ).length,
    ),
  }
}
export type AudienceFilter = {
  search?: string
  bin?: number
  relation?: 'all' | 'yes' | 'no' | 'unknown'
  large?: boolean
  recent?: boolean
  small?: boolean
  sort?: 'followers' | 'ratio'
}
export function queryAudience(
  snapshot: AudienceSnapshot,
  filter: AudienceFilter,
  now = Date.now(),
) {
  const search = (filter.search || '').toLowerCase().replace(/^@/, '')
  const ratio = (m: AudienceMember) =>
    m.followers !== undefined && m.following
      ? m.followers / m.following
      : undefined
  return snapshot.members
    .filter((m) => {
      if (
        search &&
        !`${m.handle} ${m.name || ''}`.toLowerCase().includes(search)
      )
        return false
      if (
        filter.bin !== undefined &&
        filter.bin >= 0 &&
        (m.followers === undefined ||
          m.followers < AUDIENCE_BOUNDS[filter.bin] ||
          m.followers >= AUDIENCE_BOUNDS[filter.bin + 1])
      )
        return false
      if (
        snapshot.kind === 'following' &&
        snapshot.account === snapshot.targetId &&
        filter.relation &&
        filter.relation !== 'all'
      ) {
        if (
          (filter.relation === 'yes' && m.followsYou !== true) ||
          (filter.relation === 'no' && m.followsYou !== false) ||
          (filter.relation === 'unknown' && m.followsYou !== undefined)
        )
          return false
      }
      return !(
        (filter.large && (m.followers === undefined || m.followers < 10000)) ||
        (filter.small && (m.followers === undefined || m.followers >= 100)) ||
        (filter.recent &&
          (m.createdAt === undefined || now - m.createdAt >= 90 * 86400000))
      )
    })
    .sort((a, b) => {
      const av = filter.sort === 'ratio' ? ratio(a) : a.followers,
        bv = filter.sort === 'ratio' ? ratio(b) : b.followers
      return av === undefined
        ? bv === undefined
          ? a.id.localeCompare(b.id)
          : 1
        : bv === undefined
          ? -1
          : bv - av || a.id.localeCompare(b.id)
    })
}
export const audienceStale = (s: AudienceMeta, now = Date.now()) =>
  s.kind !== 'verified_followers' &&
  (!s.account || s.account !== s.targetId) &&
  (now - s.updatedAt >= 86400000 ||
    new Date(now).toDateString() !== new Date(s.startedAt).toDateString())
export function audienceCsv(
  snapshot: AudienceSnapshot,
  members: AudienceMember[],
) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/^[\s]*[=+@-]/, (match) => "'" + match)
      .replace(/"/g, '""') +
    '"'
  const rows: unknown[][] = [
    [
      'target_id',
      'target_handle',
      'list',
      'batch',
      'relationship_account_id',
      'user_id',
      'handle',
      'name',
      'followers',
      'following',
      'follows_you',
      'created_at',
      'observed_at',
      'missing_fields',
    ],
  ]
  for (const m of members)
    rows.push([
      snapshot.targetId,
      snapshot.handle,
      snapshot.kind,
      snapshot.batch,
      snapshot.account,
      m.id,
      m.handle,
      m.name,
      m.followers,
      m.following,
      snapshot.account === snapshot.targetId && snapshot.kind === 'following'
        ? m.followsYou
        : undefined,
      m.createdAt ? new Date(m.createdAt).toISOString() : '',
      new Date(m.observedAt).toISOString(),
      ['followers', 'following', 'createdAt', 'followsYou']
        .filter((k) => m[k as keyof AudienceMember] === undefined)
        .join(';'),
    ])
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

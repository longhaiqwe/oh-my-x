import { KeyAudienceEnabled, KeyAudienceRevision, KeyExtensionStatus } from '../storage-keys'
import {
  AUDIENCE_CLASSIC,
  AUDIENCE_KINDS,
  AUDIENCE_RELAY,
  getClassicAudienceEndpoint,
  parseAudienceResponse,
  type AudienceKind,
} from './audience'
import type { createAudienceRepository } from './audience-db'

const ALARM = 'XF_ALARM_VERIFIED_AUDIENCE'
const PROGRESS = 'audienceSyncProgress'
const LEGACY_PROGRESS = 'verifiedAudienceSyncProgress'
export const AUDIENCE_ENDPOINT_KEYS = {
  followers: 'audienceFollowersClassicEndpoint',
  verified_followers: 'verifiedAudienceClassicEndpoint',
  following: 'audienceFollowingClassicEndpoint',
} as const
const MINUTE = 60_000
const NEXT_PAGE = 55_000 // Account for the interval between creating the alarm and starting its first request.
const DAY = 24 * 60 * MINUTE
const API = 'https://x.com/i/api/graphql'
const FOLLOWER_COUNT_BATCH_SIZE = 50
const BATCH_USER_QUERY_ID = 'cACg_kWQkzNQ74lcK5rksQ'
const batchUserFeatures = {
  hidden_profile_subscriptions_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: true,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
}
const CLASSIC_ID: Partial<Record<AudienceKind, string>> = {
  verified_followers: 'HP_mH6gi0qyrYpnRxVovew',
  following: 'eDqlbOS46zda8jDT8dEQ_Q',
}
// These read queries come from the corresponding X web list loaders.
const RELAY_IDS: Record<AudienceKind, string> = {
  followers: 'wClbeMd13vq4zCEKE8vyxQ',
  verified_followers: 'pkEZifvBpAEPxwYOHOCLMg',
  following: 'J_q3EbS-2yAvawwv1kQpWQ',
}
const VIEWER_QUERY_ID = 'VNDJhBbDKWIzHmR7xvScxA'
const signedInFlag = '__relay_internal__pv__xclientsfeaturesappviewerisloggedinrelayprovider'
const relayFlags = {
  [signedInFlag]: true,
  __relay_internal__pv__xclientsfeaturestranslationgroktranslatedpostenabledrelayprovider: false,
  __relay_internal__pv__replydownvoteenabledrelayprovider: false,
  __relay_internal__pv__postctafetchenabledrelayprovider: false,
  __relay_internal__pv__xclientsfeaturestweetcomponentsgrokanalyzepostrelayprovider: false,
  __relay_internal__pv__xclientsfeaturestranslationnoteautotranslationenabledrelayprovider: false,
  __relay_internal__pv__liveeventpostcontextenabledrelayprovider: false,
  __relay_internal__pv__sportspostcontextenabledrelayprovider: false,
  __relay_internal__pv__timelineuserbioautotranslationrelayprovider: false,
}

type ListProgress = {
  endpoint?: string
  cursor?: string
  recentCursors?: string[]
  nextAt: number
  clearedAt?: number
  useRelay?: boolean
}
type Profile = { handle: string; relayId: string; checkedAt: number }
type Progress = {
  account: string
  profile?: Profile
  profileRetryAt?: number
  followerCountsNextAt?: number
  lists: Partial<Record<AudienceKind, ListProgress>>
}
type LegacyProgress = ListProgress & { account: string; generation: number }
type ListResult = { next: ListProgress; changed?: boolean; recheckProfile?: boolean }

const settingKeys = [KeyAudienceEnabled, KeyExtensionStatus]
const storageKeys = [...settingKeys, PROGRESS, LEGACY_PROGRESS, ...Object.values(AUDIENCE_ENDPOINT_KEYS)]

function enabled(settings: Record<string, unknown>) {
  return settings[KeyAudienceEnabled] === 'on' && settings[KeyExtensionStatus] !== 'off'
}

async function signedInAccount() {
  const cookie = await browser.cookies.get({ url: 'https://x.com', name: 'twid' })
  return decodeURIComponent(cookie?.value || '').replace(/"/g, '').match(/^u=(\d+)$/)?.[1]
}

function retryAt(started: number, response?: Response) {
  return Math.max(
    started + 15 * MINUTE,
    Number(response?.headers.get('x-rate-limit-reset')) * 1000 || 0,
    started + (Number(response?.headers.get('retry-after')) || 0) * 1000,
  )
}

export function registerAudienceSync(
  db: ReturnType<typeof createAudienceRepository>,
  getHeaders: (csrf: string) => HeadersInit,
) {
  let running = false
  const schedule = () => void configure().catch(() => {})

  async function configure() {
    const settings = await browser.storage.local.get(settingKeys)
    if (!enabled(settings)) {
      await browser.alarms.clear(ALARM)
      return
    }
    if (!await browser.alarms.get(ALARM))
      await browser.alarms.create(ALARM, { periodInMinutes: 1 })
    await run()
  }

  async function run() {
    if (running) return
    running = true
    try {
      const settings = await browser.storage.local.get(storageKeys)
      if (!enabled(settings)) return
      const account = await signedInAccount()
      if (!account) return
      const started = Date.now()
      const { generation, ownClearedAt, verifiedClearedAt } = await db.accountState(account)
      const previous = settings[PROGRESS] as Progress | undefined
      const legacy = settings[LEGACY_PROGRESS] as LegacyProgress | undefined
      const progress: Progress = previous?.account === account ? previous : {
        account,
        lists: legacy?.account === account && legacy.generation === generation
          ? { verified_followers: {
              endpoint: legacy.endpoint,
              cursor: legacy.cursor,
              recentCursors: legacy.recentCursors,
              nextAt: legacy.nextAt,
              useRelay: legacy.useRelay,
            } }
          : {},
      }
      const due = AUDIENCE_KINDS.flatMap((kind) => {
        if ((progress.profileRetryAt ?? 0) > started) return []
        const clearedAt = ownClearedAt?.[kind] ?? (kind === 'verified_followers' ? verifiedClearedAt : undefined)
        if (clearedAt && started - clearedAt < DAY) return []
        const old = progress.lists[kind]
        const current: ListProgress = old && old.clearedAt === clearedAt ? old : { nextAt: 0, clearedAt }
        return current.nextAt <= started ? [{ kind, current }] : []
      })
      const ownFollowersClearedAt = ownClearedAt?.followers ?? 0
      const backfill = (progress.followerCountsNextAt ?? 0) <= started && started - ownFollowersClearedAt >= DAY
        ? await db.missingFollowerCounts(account, started, FOLLOWER_COUNT_BATCH_SIZE)
        : []
      if (!due.length && !backfill.length) return
      const csrf = (await browser.cookies.get({ url: 'https://x.com', name: 'ct0' }))?.value
      if (!csrf) return
      const headers = new Headers(getHeaders(csrf))
      headers.set('content-type', 'application/json')
      const request = (url: URL) => fetch(url, {
        credentials: 'include', cache: 'no-store', redirect: 'error', headers,
        signal: AbortSignal.timeout(12_000),
      })
      const stillEnabled = async () =>
        enabled(await browser.storage.local.get(settingKeys)) && await signedInAccount() === account
      const save = (changed = false) => browser.storage.local.set({
        [PROGRESS]: progress,
        ...(changed ? { [KeyAudienceRevision]: crypto.randomUUID() } : {}),
      })
      const metricsJob = (async () => {
        if (!backfill.length) return false
        const url = new URL(`${API}/${BATCH_USER_QUERY_ID}/UsersByScreenNames`)
        url.searchParams.set('variables', JSON.stringify({
          screen_names: backfill.map(({ handle }) => handle),
          withSafetyModeUserFields: true,
        }))
        url.searchParams.set('features', JSON.stringify(batchUserFeatures))
        url.searchParams.set('fieldToggles', JSON.stringify({ withAuxiliaryUserLabels: false }))
        const response = await request(url).catch(() => undefined)
        const data = response?.ok ? await response.json().catch(() => null) : null
        if (!Array.isArray(data?.data?.users) || (data.errors?.length && !data.data.users.length)) {
          progress.followerCountsNextAt = retryAt(started, response)
          return false
        }
        const counts = new Map<string, number>()
        for (const entry of data.data.users) {
          const result = entry?.result
          const followers = result?.relationship_counts?.followers ?? result?.legacy?.followers_count
          if (typeof result?.rest_id === 'string' && Number.isSafeInteger(followers) && followers >= 0)
            counts.set(result.rest_id, followers)
        }
        if (!await stillEnabled()) return false
        progress.followerCountsNextAt = started + NEXT_PAGE
        const updated = await db.fillFollowerCounts(account, generation, backfill.map(({ id }) => ({
          id, followers: counts.get(id),
        })), Date.now())
        return updated > 0
      })().catch(() => {
        progress.followerCountsNextAt = retryAt(started)
        return false
      })
      if (!due.length) return await save(await metricsJob)

      if (!progress.profile || started - progress.profile.checkedAt >= DAY) {
        const viewer = new URL(`${API}/${VIEWER_QUERY_ID}/viewerQuery`)
        viewer.searchParams.set('variables', JSON.stringify({ [signedInFlag]: true }))
        const response = await request(viewer).catch(() => undefined)
        const data = response?.ok ? await response.json().catch(() => null) : null
        const user = data?.data?.viewer?.user_results?.result
        const handle = user?.core?.screen_name
        if (user?.rest_id !== account || typeof user?.id !== 'string' ||
            typeof handle !== 'string' || !/^\w{1,15}$/.test(handle)) {
          progress.profileRetryAt = retryAt(started, response)
          await save(await metricsJob)
          return
        }
        progress.profile = { handle, relayId: user.id, checkedAt: started }
        delete progress.profileRetryAt
        if (!await stillEnabled()) return await save(await metricsJob)
      }
      const profile = progress.profile

      const syncList = async (kind: AudienceKind, current: ListProgress): Promise<ListResult> => {
        const fail = (response?: Response): ListResult => ({
          next: { ...current, nextAt: retryAt(started, response) },
        })
        const fallback = (): ListResult => ({
          next: { ...current, useRelay: true, nextAt: started + NEXT_PAGE },
        })
        try {
          const defaultId = CLASSIC_ID[kind]
          const classic = !current.useRelay && (
            getClassicAudienceEndpoint(settings[AUDIENCE_ENDPOINT_KEYS[kind]], kind) ??
            (defaultId ? new URL(`${API}/${defaultId}/${AUDIENCE_CLASSIC[kind]}?features=%7B%7D`) : undefined)
          )
          if (classic && !classic.searchParams.has('features')) classic.searchParams.set('features', '{}')
          const url = classic || new URL(`${API}/${RELAY_IDS[kind]}/${AUDIENCE_RELAY[kind].operation}`)
          const endpoint = url.href
          const cursor = endpoint === current.endpoint ? current.cursor : undefined
          const recent = cursor ? current.recentCursors ?? [] : []
          url.searchParams.set('variables', JSON.stringify({
            count: 20,
            ...(classic
              ? { userId: account, includePromotedContent: false, withGrokTranslatedBio: true, cursor }
              : { screenName: profile.handle, ...relayFlags, cursor: cursor ?? null }),
          }))

          const response = await request(url)
          if (!response.ok)
            return classic && [400, 403, 404, 422].includes(response.status) ? fallback() : fail(response)
          const data = await response.json()
          const targetMatches = classic || data?.data?.user_result_by_screen_name?.result?.id === profile.relayId
          const packet = targetMatches
            ? parseAudienceResponse(url.href, data, `/${profile.handle}/${kind}`, started, account)
            : null
          if (!packet)
            return classic ? fallback() : { ...fail(), recheckProfile: true }
          if (!await stillEnabled()) return { next: current }
          if (packet.kind !== 'following')
            for (const member of packet.members) delete member.followsYou
          const result = await db.add(account, generation, packet)
          if (result.state === 'changed') return { next: current }

          const next = result.state === 'saved' && packet.nextCursor !== cursor && !recent.includes(packet.nextCursor ?? '')
            ? packet.nextCursor : undefined
          return {
            changed: !!result.key,
            next: next
              ? { ...current, endpoint, cursor: next, recentCursors: [...recent.slice(-7), next], nextAt: started + NEXT_PAGE }
              : { clearedAt: current.clearedAt, nextAt: Date.now() + DAY },
          }
        } catch {
          return fail()
        }
      }

      const results = await Promise.all(due.map(async ({ kind, current }) => ({
        kind, result: await syncList(kind, current),
      })))
      for (const { kind, result } of results) progress.lists[kind] = result.next
      if (results.some(({ result }) => result.recheckProfile)) delete progress.profile
      await save(await metricsJob || results.some(({ result }) => result.changed))
    } finally {
      running = false
    }
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void run().catch(() => {})
  })
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (KeyAudienceEnabled in changes || KeyExtensionStatus in changes))
      schedule()
  })
  browser.runtime.onStartup.addListener(schedule)
  schedule()
}

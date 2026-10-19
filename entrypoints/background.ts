import { AI_REQUEST_PORT, AI_REQUEST_TIMEOUT_MS, aiPermissionOrigin, type AiRequest, type AiResponse } from '../shared/ai-request'
import { createLibraryService, LIBRARY_MESSAGE, LIBRARY_SYNC, LIBRARY_ALARM } from '../shared/own-post-library'
import { createLibraryRepository } from '../shared/own-post-library-db'
import { migrateSpamStorage } from '../shared/spam-migration'
import { getLocale, initI18n, type Locale } from '../shared/i18n'
import { AppError, toTransferable, type TransferableError } from '../shared/errors'
import type { QuickListItem } from '../shared/quick-list'
import {
  KeyAiRepostApiKey,
  KeyAiRepostBaseUrl,
  KeyAiRepostCustomPrompt,
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
  KeyAiRepostModel,
  KeyCreatorRewardsStats,
  defaultPreferences,
} from '../storage-keys'
import {
  parseCreatorRewardsPayload,
  isCreatorRewardsStale,
  type CreatorRewardsStats,
} from '../shared/creator-rewards'
import {
  buildRepostMessages,
  extractTweetFullTextFromGraphql,
  parseAiRepostResponse,
  resolveChatCompletionsUrl,
  type AiRepostOptionsResult,
  type RepostSourceInput,
} from '../shared/ai-repost'
import {
  extractTweetMediaFromGraphql,
  type ExtractedTweetMedia,
} from '../shared/tweet-media'

const X_API_BASE = 'https://x.com/i/api'
const X_PUBLIC_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const FALLBACK_TWEET_QUERY_ID = 'HJ9lpOL-ZlOk5CkCw0JW6Q'
const FALLBACK_TWEET_FEATURES: Record<string, boolean> = {
  creator_subscriptions_tweet_preview_api_enabled: true,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: false,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
}

const FALLBACK_TWEET_FIELD_TOGGLES: Record<string, boolean> = {
  withArticleRichContentState: true,
  withArticlePlainText: true,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
  withPayments: true,
  withAuxiliaryUserLabels: true,
}

let cachedTweetQueryId: string | null = null

async function getCsrfToken(): Promise<string> {
  try {
    const c = await browser.cookies.get({ url: 'https://x.com', name: 'ct0' })
    return c?.value || ''
  } catch {
    return ''
  }
}

async function getBaseApiHeaders(): Promise<HeadersInit> {
  const csrf = await getCsrfToken()
  return {
    authorization: X_PUBLIC_BEARER,
    'x-csrf-token': csrf,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    referer: 'https://x.com/home',
  }
}

async function resolveTweetResultQueryId(signal?: AbortSignal): Promise<string> {
  if (cachedTweetQueryId) return cachedTweetQueryId
  try {
    const htmlRes = await fetch('https://x.com/home', { credentials: 'include', signal })
    if (htmlRes.ok) {
      const html = await htmlRes.text()
      const mainMatch = html.match(
        /https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[a-z0-9a]+\.js/,
      )
      if (mainMatch?.[0]) {
        const jsRes = await fetch(mainMatch[0], { signal })
        if (jsRes.ok) {
          const jsText = await jsRes.text()
          const qMatch = jsText.match(
            /queryId:"([^"]+)",operationName:"TweetResultByRestId"/,
          )
          if (qMatch?.[1]) {
            cachedTweetQueryId = qMatch[1]
            return cachedTweetQueryId
          }
        }
      }
    }
  } catch {
    // ignore and fallback
  }
  signal?.throwIfAborted()
  return FALLBACK_TWEET_QUERY_ID
}

async function fetchTweetResultGraphqlJson(tweetId: string, signal?: AbortSignal): Promise<any> {
  if (!tweetId) return null
  const queryId = await resolveTweetResultQueryId(signal)
  const headers = await getBaseApiHeaders()
  const url = new URL(`${X_API_BASE}/graphql/${queryId}/TweetResultByRestId`)
  url.searchParams.set(
    'variables',
    JSON.stringify({
      tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: true,
    }),
  )
  url.searchParams.set('features', JSON.stringify(FALLBACK_TWEET_FEATURES))
  url.searchParams.set('fieldToggles', JSON.stringify(FALLBACK_TWEET_FIELD_TOGGLES))

  signal?.throwIfAborted()
  const res = await fetch(url.toString(), {
    signal,
    headers,
    credentials: 'include',
  })
  if (!res.ok) return null
  return await res.json().catch(() => null)
}

async function fetchTweetFullContentById(tweetId: string, signal?: AbortSignal): Promise<RepostSourceInput | null> {
  const json = await fetchTweetResultGraphqlJson(tweetId, signal)
  if (!json) return null
  return extractTweetFullTextFromGraphql(json, tweetId)
}

async function fetchTweetMediaById(tweetId: string): Promise<ExtractedTweetMedia | null> {
  const json = await fetchTweetResultGraphqlJson(tweetId)
  if (!json) return null
  return extractTweetMediaFromGraphql(json, tweetId)
}

async function downloadMediaFile(
  url: string,
  filename?: string,
): Promise<{ ok: boolean; downloadId?: number; error?: TransferableError }> {
  try {
    if (!url) throw new AppError('error.downloadNoUrl')
    const downloadId = await browser.downloads.download({
      url,
      filename: filename || undefined,
      saveAs: false,
    })
    return { ok: true, downloadId }
  } catch (e: any) {
    return { ok: false, error: toTransferable(e) ?? String(e) }
  }
}

async function callAiRepostApi(
  source: RepostSourceInput,
  signal: AbortSignal,
  overrideConfig?: {
    baseUrl?: string
    apiKey?: string
    model?: string
    customPrompt?: string
  },
  locale: Locale = getLocale(),
): Promise<AiRepostOptionsResult> {
  const stored = await browser.storage.local.get([
    KeyAiRepostBaseUrl,
    KeyAiRepostApiKey,
    KeyAiRepostModel,
    KeyAiRepostCustomPrompt,
    KeyAiRepostStylePrompt,
    KeyAiRepostStyleSamples,
  ])

  const baseUrl = String(
    overrideConfig?.baseUrl ??
      stored[KeyAiRepostBaseUrl] ??
      defaultPreferences[KeyAiRepostBaseUrl],
  ).trim()
  const apiKey = String(
    overrideConfig?.apiKey ?? stored[KeyAiRepostApiKey] ?? '',
  ).trim()
  const model = String(
    overrideConfig?.model ??
      stored[KeyAiRepostModel] ??
      defaultPreferences[KeyAiRepostModel],
  ).trim()
  const customPrompt = String(
    overrideConfig?.customPrompt ?? stored[KeyAiRepostCustomPrompt] ?? '',
  ).trim()

  if (!apiKey) {
    throw new AppError('error.aiNoKey')
  }
  if (!model) {
    throw new AppError('error.aiNoModel')
  }

  const endpoint = resolveChatCompletionsUrl(baseUrl)
  await requireAiPermission(baseUrl, signal)
  const style = {
    description: String(stored[KeyAiRepostStylePrompt] ?? ''),
    samples: String(stored[KeyAiRepostStyleSamples] ?? ''),
  }
  const messages = buildRepostMessages(source, customPrompt, style, locale)

  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    credentials: 'omit',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.65,
    }),
  })

  const rawText = await res.text()
  let json: any = null
  try {
    json = JSON.parse(rawText)
  } catch {
    // ignore
  }

  if (!res.ok) {
    const errDetail =
      json?.error?.message || json?.message || rawText.slice(0, 200) || `HTTP ${res.status}`
    throw new AppError('error.aiHttp', { status: res.status, detail: errDetail })
  }

  const content =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.text ??
    json?.output_text ??
    ''
  return parseAiRepostResponse(String(content), locale)
}

async function testAiConnection(config: {
  baseUrl?: string
  apiKey?: string
  model?: string
}, signal: AbortSignal): Promise<{ ok: boolean; model: string }> {
  const baseUrl = String(
    config.baseUrl || defaultPreferences[KeyAiRepostBaseUrl],
  ).trim()
  const apiKey = String(config.apiKey || '').trim()
  const model = String(config.model || defaultPreferences[KeyAiRepostModel]).trim()

  if (!apiKey) throw new AppError('error.aiKeyRequired')
  if (!model) throw new AppError('error.aiModelRequired')

  const endpoint = resolveChatCompletionsUrl(baseUrl)
  await requireAiPermission(baseUrl, signal)
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    credentials: 'omit',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: '请只回复 OK' }],
      max_tokens: 16,
    }),
  })

  const rawText = await res.text()
  let json: any = null
  try {
    json = JSON.parse(rawText)
  } catch {
    // ignore
  }

  if (!res.ok) {
    const errDetail =
      json?.error?.message || json?.message || rawText.slice(0, 200) || `HTTP ${res.status}`
    throw new AppError('error.aiConnectHttp', { status: res.status, detail: errDetail })
  }

  return { ok: true, model: json?.model || model }
}

async function addMemberToList(listId: string, handle: string, userId: string): Promise<{ ok: boolean; already?: boolean }> {
  if (!userId) {
    throw new AppError('error.userIdMissing', { handle })
  }

  const body = new URLSearchParams({
    list_id: String(listId),
    user_id: String(userId),
  })

  const res = await fetch(`${X_API_BASE}/1.1/lists/members/create.json`, {
    method: 'POST',
    headers: {
      ...(await getBaseApiHeaders()),
      'content-type': 'application/x-www-form-urlencoded',
    },
    credentials: 'include',
    body: body.toString(),
  })

  const json = await res.json().catch(() => null)
  if (res.ok && json && (json.id_str || json.id)) {
    return { ok: true }
  }

  const errorMsg = (json && json.errors && json.errors[0] && json.errors[0].message) || ('HTTP ' + res.status)
  if (/already/i.test(errorMsg)) {
    return { ok: true, already: true }
  }
  throw new Error(errorMsg)
}

async function fetchAllUserLists(): Promise<QuickListItem[]> {
  const headers = await getBaseApiHeaders()

  const [ownedRes, subRes] = await Promise.allSettled([
    fetch(`${X_API_BASE}/1.1/lists/ownerships.json?count=100`, {
      headers,
      credentials: 'include',
    }),
    fetch(`${X_API_BASE}/1.1/lists/subscriptions.json?count=100`, {
      headers,
      credentials: 'include',
    }),
  ])

  const map = new Map<string, QuickListItem>()

  // 1. 我创建的列表 (Owned)
  if (ownedRes.status === 'fulfilled' && ownedRes.value.ok) {
    const json = await ownedRes.value.json().catch(() => null)
    if (json && Array.isArray(json.lists)) {
      for (const l of json.lists) {
        const id = String(l.id_str || l.id || '').trim()
        const name = String(l.name || '').trim()
        if (id && name) {
          map.set(id, {
            id,
            name,
            isOwned: true,
            ownerHandle: l.user?.screen_name ? String(l.user.screen_name) : undefined,
          })
        }
      }
    }
  }

  // 2. 我关注的列表 (Subscribed / Followed)
  if (subRes.status === 'fulfilled' && subRes.value.ok) {
    const json = await subRes.value.json().catch(() => null)
    if (json && Array.isArray(json.lists)) {
      for (const l of json.lists) {
        const id = String(l.id_str || l.id || '').trim()
        const name = String(l.name || '').trim()
        if (id && name) {
          if (!map.has(id)) {
            map.set(id, {
              id,
              name,
              isOwned: false,
              ownerHandle: l.user?.screen_name ? String(l.user.screen_name) : undefined,
            })
          }
        }
      }
    }
  }

  if (map.size === 0) {
    const ownedErr = ownedRes.status === 'fulfilled' && !ownedRes.value.ok ? ownedRes.value.status : null
    const subErr = subRes.status === 'fulfilled' && !subRes.value.ok ? subRes.value.status : null
    if (ownedErr || subErr) {
      throw new AppError('error.listsHttp', { status: String(ownedErr || subErr) })
    }
  }

  return Array.from(map.values())
}

const ALARM_CREATOR_REWARDS_CHECK = 'XF_ALARM_CREATOR_REWARDS_CHECK'

async function setupCreatorRewardsAlarm() {
  try {
    const existing = await browser.alarms?.get(ALARM_CREATOR_REWARDS_CHECK)
    if (!existing) {
      await browser.alarms?.create(ALARM_CREATOR_REWARDS_CHECK, {
        periodInMinutes: 30,
      })
    }
  } catch {
    // 忽略 alarm 创建异常
  }
}

async function checkAndAutoRefreshCreatorRewards(): Promise<void> {
  try {
    const csrf = await getCsrfToken()
    if (!csrf) return // 用户当前未在浏览器登录 X，跳过

    const stored = await browser.storage.local.get(KeyCreatorRewardsStats)
    const raw = stored[KeyCreatorRewardsStats]
    let updatedAt: number | undefined
    if (typeof raw === 'string') {
      try {
        updatedAt = JSON.parse(raw)?.updatedAt
      } catch {}
    } else if (raw && typeof raw === 'object') {
      updatedAt = (raw as any)?.updatedAt
    }

    if (isCreatorRewardsStale(updatedAt)) {
      console.info('[oh-my-x] 创作者奖励数据已到每日刷新节点，执行静默同步...')
      await fetchCreatorRewardsFromApi()
    }
  } catch (e) {
    console.debug('[oh-my-x] 自动同步创作者奖励数据跳过或失败', e)
  }
}

async function requireAiPermission(baseUrl: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const granted = await browser.permissions.contains({ origins: [aiPermissionOrigin(baseUrl)] })
  signal.throwIfAborted()
  if (!granted) throw new AppError('error.aiNotAuthorized')
}

async function executeAiRequest(message: AiRequest, signal: AbortSignal): Promise<AiResponse> {
  signal.throwIfAborted()
  switch (message.type) {
    case 'XF_GENERATE_REPOST_OPTIONS':
      return { ok: true, ...await callAiRepostApi(message.source, signal, message.overrideConfig, message.locale === 'en' || message.locale === 'zh-CN' ? message.locale : getLocale()) }
    case 'XF_TEST_AI_CONNECTION':
      return await testAiConnection(message.config || {}, signal)
    case 'XF_FETCH_TWEET_FULL_TEXT': {
      const source = await fetchTweetFullContentById(String(message.tweetId || ''), signal)
      return { ok: Boolean(source), source }
    }
    default: throw new AppError('error.aiUnsupported')
  }
}

export default defineBackground(() => {
  void initI18n()

  browser.runtime.onConnect.addListener(port => {
    if (port.name !== AI_REQUEST_PORT) return
    const sender = port.sender
    const url = sender?.url || ''
    const validUrl = /^https:\/\/(x\.com|twitter\.com|mobile\.twitter\.com|pro\.x\.com)\//.test(url)
      || url === `chrome-extension://${browser.runtime.id}/popup.html`
    if (sender?.id !== browser.runtime.id || !validUrl) { port.disconnect(); return }
    const controller = new AbortController()
    let closed = false
    let started = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onDisconnect = () => {
      closed = true
      clearTimeout(timer)
      controller.abort(new AppError('error.requestCancelled'))
    }
    port.onDisconnect.addListener(onDisconnect)
    port.onMessage.addListener((message: AiRequest) => {
      if (started || closed) return
      started = true
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      })
      timer = setTimeout(() => controller.abort(new AppError('error.aiTimeout', { seconds: AI_REQUEST_TIMEOUT_MS / 1000 })), AI_REQUEST_TIMEOUT_MS)
      void Promise.race([executeAiRequest(message, controller.signal), aborted])
        .catch(error => ({ ok: false, error: toTransferable(error, 'error.aiFailed') }))
        .then(response => {
          clearTimeout(timer)
          if (!closed) {
            // Navigation may disconnect the port before the disconnect event arrives.
            try { port.postMessage(response) } catch { /* requester has gone */ }
            port.onDisconnect.removeListener(onDisconnect)
            port.disconnect()
            closed = true
          }
        })
    })
  })

  const library = createLibraryService(createLibraryRepository())
  void browser.alarms.create(LIBRARY_ALARM, { periodInMinutes: 1 })
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== LIBRARY_ALARM) return
    void browser.tabs.query({url:['https://x.com/*','https://twitter.com/*','https://mobile.twitter.com/*','https://pro.x.com/*']})
      .then(tabs => Promise.allSettled(tabs.filter(tab=>tab.id!=null).map(tab=>browser.tabs.sendMessage(tab.id!,{type:LIBRARY_SYNC}))))
      .catch(()=>{})
  })
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if(message?.type !== LIBRARY_MESSAGE) return
    void (async()=>{
      try {
        const url = new URL(sender.url || '')
        if(url.protocol!=='https:' || !['x.com','twitter.com','mobile.twitter.com','pro.x.com'].includes(url.hostname)) throw new AppError('error.libraryBadSource')
        const cookie = await browser.cookies.get({url:url.origin,name:'twid'})
        const account = decodeURIComponent(cookie?.value || '').replace(/"/g,'').match(/^u=(\d+)$/)?.[1]
        if(!account || account!==message.account) throw new AppError('error.accountChanged')
        respond({ok:true,result:await library(message)})
      } catch(error) {respond({ok:false,error:toTransferable(error, 'error.libraryUnavailable')})}
    })()
    return true
  })
  browser.runtime.onInstalled.addListener(() => {
    void migrateSpamStorage()
    void setupCreatorRewardsAlarm()
    void checkAndAutoRefreshCreatorRewards()
  })

  browser.runtime.onStartup?.addListener(() => {
    void setupCreatorRewardsAlarm()
    void checkAndAutoRefreshCreatorRewards()
  })

  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_CREATOR_REWARDS_CHECK) {
      void checkAndAutoRefreshCreatorRewards()
    }
  })

  void setupCreatorRewardsAlarm()
  void checkAndAutoRefreshCreatorRewards()

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'XF_FETCH_OWNED_LISTS' || msg?.type === 'fetchOwnedLists') {
      void (async () => {
        try {
          const lists = await fetchAllUserLists()
          sendResponse({ ok: true, lists })
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }

    if (msg?.type === 'XF_ADD_TO_LIST' || msg?.type === 'addToList') {
      void (async () => {
        try {
          const result = await addMemberToList(msg.listId, msg.handle, msg.userId)
          sendResponse({ ok: true, already: result.already })
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }

    if (msg?.type === 'XF_FETCH_TWEET_FULL_TEXT') {
      void (async () => {
        try {
          const source = await fetchTweetFullContentById(String(msg.tweetId || ''))
          sendResponse({ ok: Boolean(source), source })
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }

    if (msg?.type === 'XF_GET_TWEET_MEDIA') {
      void (async () => {
        try {
          const media = await fetchTweetMediaById(String(msg.tweetId || ''))
          sendResponse({ ok: Boolean(media), media })
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }

    if (msg?.type === 'XF_DOWNLOAD_MEDIA') {
      void (async () => {
        try {
          const result = await downloadMediaFile(String(msg.url || ''), msg.filename ? String(msg.filename) : undefined)
          sendResponse(result)
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }

    if (msg?.type === 'XF_FETCH_CREATOR_REWARDS') {
      void (async () => {
        try {
          const stats = await fetchCreatorRewardsFromApi()
          sendResponse({ ok: Boolean(stats), stats })
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }
  })
})

async function fetchCreatorRewardsFromApi(): Promise<CreatorRewardsStats | null> {
  const csrf = await getCsrfToken()
  if (!csrf) {
    throw new AppError('error.noXSession')
  }

  const url = 'https://x.com/i/jfapi/creators/original_content_rewards'
  const headers = {
    authorization: X_PUBLIC_BEARER,
    'x-csrf-token': csrf,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-jf-v': 'JP-5',
    referer: 'https://x.com/home',
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    throw new AppError('error.rewardsHttp', { status: res.status })
  }

  const arrayBuffer = await res.arrayBuffer()
  const stats = parseCreatorRewardsPayload(arrayBuffer)
  if (!stats) {
    throw new AppError('error.rewardsParse')
  }

  try {
    await browser.storage.local.set({
      [KeyCreatorRewardsStats]: JSON.stringify(stats),
    })
  } catch {
    // 忽略存储异常
  }

  return stats
}

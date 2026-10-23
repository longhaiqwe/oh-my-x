import { readChatCompletionStream } from '../shared/ai-stream'
import { startAiDeadline } from '../shared/ai-deadline'
import { AI_CONFIG_KEYS, MIGRATE_AI_SERVICE, migrateAiService, resolveAiService } from '../shared/ai-service'
import {
  AI_REQUEST_PORT,
  AI_KEEPALIVE,
  OPEN_SETTINGS,
  REPLY_LABEL_LIST,
  REPLY_LABEL_SET,
  REPLY_SCORE_FOLDED,
  REPLY_SCORE_LOOKUP,
  aiPermissionOrigin,
  type AiRequest,
  type AiResponse,
  type AiProgressHandler,
} from '../shared/ai-request'
import { REPLY_SCORE_SAMPLE_THREADS } from '../shared/ai-reply-samples'
import { buildSearchQueryMessages, parseSearchQueryResponse } from '../shared/search-ai'
import {
  REPLY_SCORE_BATCH_SIZE,
  REPLY_SCORE_PROMPT_VERSION,
  buildReplyScoreMessages,
  createReplyScoreStreamParser,
  parseReplyScoreResponse,
  type ReplyScore,
  type ReplyScoreItem,
  type ReplyScoreParent,
  type ReplyScoreTarget,
} from '../shared/ai-reply-score'
import { createReplyScoreRepository, toReplyScore, type StoredReplyLabel } from '../shared/reply-score-db'
import { createReplyScoreUsage } from '../shared/reply-score-usage'
import { parseBotAccounts, updateBotAccounts } from '../shared/reply-bot-accounts'
import { createLibraryService, LIBRARY_MESSAGE, LIBRARY_SYNC, LIBRARY_ALARM } from '../shared/own-post-library'
import { createLibraryRepository } from '../shared/own-post-library-db'
import { migrateSpamStorage } from '../shared/spam-migration'
import { getLocale, initI18n, onLocaleChange, t, type Locale } from '../shared/i18n'
import { AppError, errorText, toTransferable, type TransferableError } from '../shared/errors'
import type { QuickListItem } from '../shared/quick-list'
import {
  KeyAiServiceBaseUrl,
  KeyAiServiceModel,
  KeyAiRepostCustomPrompt,
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
  KeySpamAiDailyLimit,
  KeySpamAiBotAccounts,
  KeyCreatorRewardsStats,
  KeyCreatorRewardsHistory,
  KeyImpressionsDaily,
  KeyAccountOverviewQueryId,
  KeyCreateDraftQueryId,
  KeyExtensionStatus,
  KeySelectionDraft,
  defaultPreferences,
} from '../storage-keys'
import {
  parseCreatorRewardsPayload,
  isCreatorRewardsStale,
  type CreatorRewardsStats,
} from '../shared/creator-rewards'
import {
  ACCOUNT_OVERVIEW_OPERATION,
  FALLBACK_ACCOUNT_OVERVIEW_QUERY_ID,
  buildAccountOverviewVariables,
  isImpressionsMissingYesterday,
  isRewardsHistoryMissingToday,
  mergeImpressionsDays,
  parseAccountOverviewDaily,
  parseImpressionsCache,
  parseRewardsHistory,
  persistCreatorRewardsStats,
  type ImpressionsDailyCache,
} from '../shared/creator-rewards-daily'
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
import {
  MENTION_QUERY_MAX_LENGTH,
  MENTION_SEARCH_MESSAGE,
  buildMentionSearchUrl,
  parseMentionUsers,
  type MentionUser,
} from '../shared/mention-search'
import {
  FALLBACK_CREATE_DRAFT_QUERY_ID,
  SELECTION_DRAFT_MENU_ID,
  buildDraftText,
  composeIntentUrl,
  createDraftTweet,
} from '../shared/selection-draft'
import type { Browser } from 'wxt/browser'

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
    ...AI_CONFIG_KEYS,
    KeyAiRepostCustomPrompt,
    KeyAiRepostStylePrompt,
    KeyAiRepostStyleSamples,
  ])

  const connection = resolveAiService(stored, 'repost')
  const baseUrl = String(overrideConfig?.baseUrl ?? connection.baseUrl).trim()
  const apiKey = String(overrideConfig?.apiKey ?? connection.apiKey).trim()
  const model = String(overrideConfig?.model ?? connection.model).trim()
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
  const { content } = await postChatCompletion(endpoint, apiKey, { model, messages, temperature: 0.65 }, signal)
  return parseAiRepostResponse(content, locale)
}

/** 搜索框里的大白话转成 X 搜索词；用公共 AI 服务的默认模型，不流式 */
async function buildSearchQueryWithAi(text: string, signal: AbortSignal): Promise<string> {
  const input = String(text ?? '').trim()
  if (!input) throw new AppError('error.searchAiEmpty')
  const stored = await browser.storage.local.get(AI_CONFIG_KEYS)
  const { baseUrl, apiKey, model } = resolveAiService(stored, 'search')
  if (!apiKey) throw new AppError('error.aiNoKey')
  if (!model) throw new AppError('error.aiNoModel')
  const endpoint = resolveChatCompletionsUrl(baseUrl)
  await requireAiPermission(baseUrl, signal)
  const body: Record<string, unknown> = { model, messages: buildSearchQueryMessages(input, new Date()), temperature: 0 }
  if (supportsJsonMode(endpoint)) body.response_format = { type: 'json_object' }
  const { content } = await postChatCompletion(endpoint, apiKey, body, signal)
  return parseSearchQueryResponse(content)
}

/** 调用 OpenAI 兼容的 /chat/completions，返回模型输出的文字，以及服务返回的用量（没返回时为 null） */
async function postChatCompletion(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  onContent?: (delta: string) => void,
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number } | null }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    credentials: 'omit',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (res.ok && onContent && res.headers.get('content-type')?.includes('text/event-stream')) {
    return readChatCompletionStream(res, signal, onContent)
  }
  // Some compatible services ignore stream:true and return normal JSON.
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

  const prompt = Number(json?.usage?.prompt_tokens)
  const completion = Number(json?.usage?.completion_tokens)
  return {
    content: String(
      json?.choices?.[0]?.message?.content ??
        json?.choices?.[0]?.text ??
        json?.output_text ??
        '',
    ),
    usage: Number.isFinite(prompt) || Number.isFinite(completion)
      ? { promptTokens: Number.isFinite(prompt) ? prompt : 0, completionTokens: Number.isFinite(completion) ? completion : 0 }
      : null,
  }
}

// ---------- 回复区 AI 打分 ----------

const replyScores = createReplyScoreRepository()
const replyScoreUsage = createReplyScoreUsage()

// 机器人账号列表的读改写排成一队，连着标几条时不会互相覆盖
let botAccountWrites: Promise<unknown> = Promise.resolve()

function queueBotAccounts(task: () => Promise<void>): Promise<void> {
  const run = botAccountWrites.then(task)
  botAccountWrites = run.catch(() => {})
  return run
}

/** 标「机器人」时记下账号，撤销时移出 */
function setBotAccount(handle: string, add: boolean): Promise<void> {
  return queueBotAccounts(async () => {
    const stored = await browser.storage.local.get(KeySpamAiBotAccounts)
    const list = parseBotAccounts(stored[KeySpamAiBotAccounts])
    const next = updateBotAccounts(list, handle, add)
    if (next !== list) await browser.storage.local.set({ [KeySpamAiBotAccounts]: next })
  })
}

/** 还没有账号列表时（这个功能加上之前标的），把标过「机器人」的账号补进去 */
function fillBotAccountsFromLabels(): Promise<void> {
  return queueBotAccounts(async () => {
    const stored = await browser.storage.local.get(KeySpamAiBotAccounts)
    if (stored[KeySpamAiBotAccounts] !== undefined) return
    const handles = (await replyScores.allLabels()).filter((entry) => entry.label === 'bot').map((entry) => entry.author)
    if (handles.length) await browser.storage.local.set({ [KeySpamAiBotAccounts]: parseBotAccounts(handles) })
  })
}
const TWEET_ID_RE = /^\d{1,25}$/
const DEFAULT_REPLY_SCORE_DAILY_LIMIT = Number(defaultPreferences[KeySpamAiDailyLimit]) || 300

// 已知支持 response_format: json_object 的服务；其他 OpenAI 兼容服务可能不认这个参数，不带
const JSON_MODE_HOSTS = new Set(['api.openai.com', 'api.deepseek.com'])

function supportsJsonMode(endpoint: string): boolean {
  try { return JSON_MODE_HOSTS.has(new URL(endpoint).hostname) } catch { return false }
}

function sanitizeScoreParent(raw: any): ReplyScoreParent | null {
  if (!raw || typeof raw !== 'object') return null
  const text = typeof raw.text === 'string' ? raw.text : ''
  return { id: String(raw.id ?? ''), author: String(raw.author ?? ''), text }
}

function sanitizeScoreItems(raw: unknown): ReplyScoreItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const items: ReplyScoreItem[] = []
  for (const item of raw) {
    const id = String(item?.id ?? '')
    const text = typeof item?.text === 'string' ? item.text.trim() : ''
    if (!TWEET_ID_RE.test(id) || !text || seen.has(id)) continue
    seen.add(id)
    const delay = Number(item.delaySeconds)
    const followers = Number(item.followers)
    const replyTo = sanitizeReplyTarget(item.replyTo)
    items.push({
      id,
      author: String(item.author ?? ''),
      text,
      delaySeconds: item.delaySeconds != null && Number.isFinite(delay) && delay >= 0 ? Math.round(delay) : null,
      followers: item.followers != null && Number.isFinite(followers) && followers >= 0 ? Math.floor(followers) : null,
      verified: typeof item.verified === 'boolean' ? item.verified : null,
      ...(replyTo ? { replyTo } : {}),
    })
    if (items.length >= REPLY_SCORE_BATCH_SIZE) break
  }
  return items
}

function sanitizeReplyTarget(raw: any): ReplyScoreTarget | null {
  if (!raw || typeof raw !== 'object') return null
  const author = typeof raw.author === 'string' ? raw.author.trim().slice(0, 50) : ''
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  return author || text ? { author, text } : null
}

function sanitizeTweetIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map(String).filter((id) => TWEET_ID_RE.test(id)))].slice(0, 200)
}

/**
 * 把页面发来的标注整理成要存的记录；不合法时返回 null。
 * 标注时的模型名从打分缓存里取（页面不知道用的是哪个模型）。
 */
async function labelEntryOf(message: any): Promise<StoredReplyLabel | null> {
  const label = message?.label
  if (label !== 'bot' && label !== 'human') return null
  const [item] = sanitizeScoreItems([message.item])
  const parent = sanitizeScoreParent(message.parent)
  if (!item || !parent || item.id !== String(message.id)) return null
  let ai: StoredReplyLabel['ai'] = null
  const score = Number(message.ai?.score)
  if (message.ai && Number.isFinite(score)) {
    const cached = (await replyScores.getMany([item.id])).get(item.id)
    ai = {
      score: Math.min(100, Math.max(0, Math.round(score))),
      signals: Array.isArray(message.ai.signals) ? message.ai.signals.map(String).slice(0, 12) : [],
      reason: typeof message.ai.reason === 'string' ? message.ai.reason.slice(0, 160) : '',
      model: cached?.model ?? null,
      promptVersion: REPLY_SCORE_PROMPT_VERSION,
    }
  }
  return {
    id: item.id,
    label,
    author: item.author,
    text: item.text,
    parentAuthor: parent.author,
    parentText: parent.text,
    ...(item.replyTo ? { replyTo: item.replyTo } : {}),
    delaySeconds: item.delaySeconds,
    followers: item.followers ?? null,
    verified: item.verified ?? null,
    ai,
    labeledAt: Date.now(),
  }
}

function dailyLimitOf(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(5000, Math.max(0, Math.floor(n))) : DEFAULT_REPLY_SCORE_DAILY_LIMIT
}

interface ReplyScoreConnection {
  endpoint: string
  apiKey: string
  model: string
}

/** 打分与总结共用 AI 服务，各自的模型覆盖互不影响。 */
async function replyScoreConnection(signal: AbortSignal): Promise<ReplyScoreConnection> {
  const stored = await browser.storage.local.get(AI_CONFIG_KEYS)
  const { baseUrl, apiKey, model } = resolveAiService(stored, 'score')
  if (!apiKey) throw new AppError('error.aiNoKey')
  if (!model) throw new AppError('error.aiNoModel')
  const endpoint = resolveChatCompletionsUrl(baseUrl)
  await requireAiPermission(baseUrl, signal)
  return { endpoint, apiKey, model }
}

function requestReplyScores(
  connection: ReplyScoreConnection,
  parent: ReplyScoreParent,
  replies: ReplyScoreItem[],
  locale: Locale,
  signal: AbortSignal,
  onContent?: (delta: string) => void,
) {
  return postChatCompletion(connection.endpoint, connection.apiKey, {
    model: connection.model,
    messages: buildReplyScoreMessages(parent, replies, locale),
    temperature: 0,
    ...(onContent ? { stream: true } : {}),
    ...(supportsJsonMode(connection.endpoint) ? { response_format: { type: 'json_object' } } : {}),
  }, signal, onContent)
}

/** 设置页「用样例集测试」：一次一段对话。不写缓存，不计入当天用量 */
async function scoreReplySamples(
  message: Extract<AiRequest, { type: 'XF_TEST_REPLY_SCORE_SAMPLES' }>,
  signal: AbortSignal,
): Promise<AiResponse> {
  const thread = REPLY_SCORE_SAMPLE_THREADS[Number(message.threadIndex)]
  if (!thread) throw new AppError('error.aiUnsupported')
  const locale: Locale = message.locale === 'en' || message.locale === 'zh-CN' ? message.locale : getLocale()
  const connection = await replyScoreConnection(signal)
  const { content, usage } = await requestReplyScores(connection, thread.parent, thread.replies, locale, signal)
  const scores = parseReplyScoreResponse(content, thread.replies.map((r) => r.id))
  return { ok: true, scores, usage, model: connection.model }
}

async function scoreReplies(
  message: Extract<AiRequest, { type: 'XF_SCORE_REPLIES' }>,
  signal: AbortSignal,
  onProgress?: AiProgressHandler,
): Promise<AiResponse> {
  const parent = sanitizeScoreParent(message.parent)
  const replies = sanitizeScoreItems(message.replies)
  if (!parent || !replies.length) throw new AppError('error.aiUnsupported')
  const mode = message.mode === 'manual' ? 'manual' : 'auto'
  const locale: Locale = message.locale === 'en' || message.locale === 'zh-CN' ? message.locale : getLocale()

  const cached = await replyScores.getMany(replies.map((r) => r.id))
  const scores: ReplyScore[] = [...cached.values()].map(toReplyScore)
  if (cached.size) replyScoreUsage.add({ cached: cached.size })
  let batch = replies.filter((r) => !cached.has(r.id))
  if (!batch.length) return { ok: true, scores }

  if (mode === 'auto') {
    const stored = await browser.storage.local.get(KeySpamAiDailyLimit)
    const usage = await replyScoreUsage.read()
    const remaining = dailyLimitOf(stored[KeySpamAiDailyLimit] ?? DEFAULT_REPLY_SCORE_DAILY_LIMIT) - usage.auto
    if (remaining <= 0) return { ok: true, scores, limitReached: true }
    batch = batch.slice(0, remaining)
  }

  const connection = await replyScoreConnection(signal)
  const { model } = connection

  const fresh = new Map<string, ReplyScore>()
  const writes: Promise<unknown>[] = []
  const accept = (score: ReplyScore, publish: boolean) => {
    if (signal.aborted || fresh.has(score.id)) return
    fresh.set(score.id, score)
    // Persist each completed result so timeout/disconnect does not discard it.
    writes.push(replyScores.putMany([{ ...score, model, promptVersion: REPLY_SCORE_PROMPT_VERSION, savedAt: Date.now() }])
      .catch(error => console.debug('[oh-my-x] AI 打分结果写入缓存失败', error)))
    if (publish) onProgress?.({ type: 'XF_AI_PROGRESS', scores: [score] })
  }
  const push = createReplyScoreStreamParser(batch.map(r => r.id), score => accept(score, true))
  signal.throwIfAborted()
  try {
    const { content } = await requestReplyScores(connection, parent, batch, locale, signal, push)
    signal.throwIfAborted()
    for (const score of parseReplyScoreResponse(content, batch.map(r => r.id))) accept(score, false)
    return { ok: true, scores: [...scores, ...fresh.values()], model }
  } finally {
    // An interrupted request still consumed provider work; completed replies are not failures.
    replyScoreUsage.add({ [mode]: batch.length, failed: batch.length - fresh.size })
    await Promise.all(writes)
  }
}

async function testAiConnection(config: {
  baseUrl?: string
  apiKey?: string
  model?: string
}, signal: AbortSignal): Promise<{ ok: boolean; model: string }> {
  const baseUrl = String(
    config.baseUrl || defaultPreferences[KeyAiServiceBaseUrl],
  ).trim()
  const apiKey = String(config.apiKey || '').trim()
  const model = String(config.model || defaultPreferences[KeyAiServiceModel]).trim()

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

    const stored = await browser.storage.local.get([KeyCreatorRewardsStats, KeyCreatorRewardsHistory, KeyImpressionsDaily])
    const raw = stored[KeyCreatorRewardsStats]
    let updatedAt: number | undefined
    if (typeof raw === 'string') {
      try {
        updatedAt = JSON.parse(raw)?.updatedAt
      } catch {}
    } else if (raw && typeof raw === 'object') {
      updatedAt = (raw as any)?.updatedAt
    }

    // 过了刷新节点但还没记到当天的累计数（X 更新晚了），每次闹钟都再取一次
    const history = parseRewardsHistory(stored[KeyCreatorRewardsHistory])
    if (isCreatorRewardsStale(updatedAt) || isRewardsHistoryMissingToday(history)) {
      console.info('[oh-my-x] 创作者奖励数据已到每日刷新节点，执行静默同步...')
      await refreshCreatorRewardsData()
    } else if (isImpressionsMissingYesterday(parseImpressionsCache(stored[KeyImpressionsDaily]))) {
      // 账号分析比奖励计划晚出前一天的数，每次闹钟（30 分钟）补取一次，直到取到
      await fetchImpressionsDailyFromApi()
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

async function executeAiRequest(message: AiRequest, signal: AbortSignal, onProgress?: AiProgressHandler): Promise<AiResponse> {
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
    case 'XF_SCORE_REPLIES':
      return await scoreReplies(message, signal, onProgress)
    case 'XF_TEST_REPLY_SCORE_SAMPLES':
      return await scoreReplySamples(message, signal)
    case 'XF_BUILD_SEARCH_QUERY':
      return { ok: true, query: await buildSearchQueryWithAi(message.text, signal) }
    default: throw new AppError('error.aiUnsupported')
  }
}

// ---------- 右键「存为 X 草稿」 ----------

// 右键菜单接口在 Chrome 123 之前不返回 Promise，统一用回调，并读掉 lastError（菜单项不存在时 remove 会报错）
function removeContextMenu(id: string): Promise<void> {
  return new Promise(resolve => browser.contextMenus.remove(id, () => { void browser.runtime.lastError; resolve() }))
}

function createContextMenu(properties: Browser.contextMenus.CreateProperties): Promise<void> {
  return new Promise(resolve => { browser.contextMenus.create(properties, () => { void browser.runtime.lastError; resolve() }) })
}

let selectionDraftMenuSync: Promise<void> = Promise.resolve()

/** 按功能开关和扩展总开关加上或去掉右键菜单项；菜单名跟着界面语言 */
function syncSelectionDraftMenu() {
  if (!browser.contextMenus) return
  selectionDraftMenuSync = selectionDraftMenuSync.then(async () => {
    await initI18n()
    const stored = await browser.storage.local.get([KeySelectionDraft, KeyExtensionStatus])
    await removeContextMenu(SELECTION_DRAFT_MENU_ID)
    if (stored[KeySelectionDraft] === 'off' || stored[KeyExtensionStatus] === 'off') return
    await createContextMenu({ id: SELECTION_DRAFT_MENU_ID, title: t('selectionDraft.menu'), contexts: ['selection'] })
  }).catch(() => {})
}

/**
 * 菜单事件带的 selectionText 可能不保留换行，先在页面里读一次选区。
 * 输入框里的选区、浏览器内部页面读不到，用事件带的文字。
 */
async function readSelectedText(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab): Promise<string> {
  const fallback = info.selectionText || ''
  if (tab?.id == null || tab.id < 0) return fallback
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: () => window.getSelection()?.toString() ?? '',
    })
    const text = typeof injection?.result === 'string' ? injection.result : ''
    return text.trim() ? text : fallback
  } catch {
    return fallback
  }
}

/** 没登录 X（没有 ct0）时返回 null */
async function getDraftApiHeaders(): Promise<Record<string, string> | null> {
  if (!(await getCsrfToken())) return null
  return (await getBaseApiHeaders()) as Record<string, string>
}

/** 存好后在点右键的标签页的扩展图标上显示 ✓，3 秒后去掉；颜色是设计规范里的 success-600 */
async function flashSavedBadge(tabId: number | undefined) {
  if (tabId == null || tabId < 0) return
  try {
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#348a58' })
    await browser.action.setBadgeText({ tabId, text: '✓' })
    setTimeout(() => { void browser.action.setBadgeText({ tabId, text: '' }).catch(() => {}) }, 3000)
  } catch {}
}

/** 存进 X 草稿箱；存不进去时在旁边打开 X 发帖页，正文已填好，由用户手动保存 */
async function saveSelectionAsDraft(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) {
  const text = buildDraftText(await readSelectedText(info, tab), info.pageUrl)
  if (!text) return
  try {
    const stored = await browser.storage.local.get(KeyCreateDraftQueryId)
    const capturedId = typeof stored[KeyCreateDraftQueryId] === 'string' ? stored[KeyCreateDraftQueryId] : ''
    await createDraftTweet(text, {
      fetch: (input, init) => fetch(input, init),
      getHeaders: getDraftApiHeaders,
      queryIds: [capturedId, FALLBACK_CREATE_DRAFT_QUERY_ID],
    })
    await flashSavedBadge(tab?.id)
  } catch (error) {
    console.warn('[oh-my-x] 存草稿失败，改为打开发帖页：', errorText(error, 'error.draftHttp'))
    const position = tab && tab.windowId >= 0 ? { windowId: tab.windowId, index: tab.index + 1 } : {}
    await browser.tabs.create({ url: composeIntentUrl(text), ...position }).catch(() => {})
  }
}

export default defineBackground(() => {
  void initI18n()
  void migrateAiService().catch(() => {})
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== MIGRATE_AI_SERVICE) return
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(`chrome-extension://${browser.runtime.id}/`)) return
    void migrateAiService().then(() => respond({ ok: true }), () => respond({ ok: false }))
    return true
  })

  browser.runtime.onConnect.addListener(port => {
    if (port.name !== AI_REQUEST_PORT) return
    const sender = port.sender
    const url = sender?.url || ''
    // 弹窗和完整设置页（测试连接、用样例集测试）也可以发
    const validUrl = /^https:\/\/(x\.com|twitter\.com|mobile\.twitter\.com|pro\.x\.com)\//.test(url)
      || new RegExp(`^chrome-extension://${browser.runtime.id}/(popup|options)\\.html(#.*)?$`).test(url)
    if (sender?.id !== browser.runtime.id || !validUrl) { port.disconnect(); return }
    const controller = new AbortController()
    let closed = false
    let started = false
    let stopDeadline: (() => void) | undefined
    const onDisconnect = () => {
      closed = true
      stopDeadline?.()
      controller.abort(new AppError('error.requestCancelled'))
    }
    port.onDisconnect.addListener(onDisconnect)
    port.onMessage.addListener((message: AiRequest | { type: typeof AI_KEEPALIVE }) => {
      // 保活消息只是让后台保持运行，不用处理
      if (started || closed || message?.type === AI_KEEPALIVE) return
      started = true
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      })
      // 超时按多久没有新数据算，见 shared/ai-deadline.ts
      stopDeadline = startAiDeadline(controller)
      void Promise.race([executeAiRequest(message, controller.signal, progress => {
        if (!closed && !controller.signal.aborted) {
          try { port.postMessage(progress) } catch { onDisconnect() }
        }
      }), aborted])
        .catch(error => ({ ok: false, error: toTransferable(error, 'error.aiFailed') }))
        .then(response => {
          stopDeadline?.()
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
  // AI 打分：页面上折叠了一条，当天折叠数加 1；X 页面上点「AI 未配置」打开设置页
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender?.id !== browser.runtime.id) return
    if (message?.type === REPLY_SCORE_FOLDED) replyScoreUsage.add({ folded: 1 })
    if (message?.type === OPEN_SETTINGS) void browser.tabs.create({ url: browser.runtime.getURL(message.module === 'settings' ? '/options.html#settings' : '/options.html#filter') })
  })

  // AI 打分只查缓存和标注，不调用模型
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== REPLY_SCORE_LOOKUP) return
    if (sender?.id !== browser.runtime.id) return
    void (async () => {
      try {
        const ids = sanitizeTweetIds(message.ids)
        const [found, labels] = await Promise.all([replyScores.getMany(ids), replyScores.getLabels(ids)])
        if (found.size) replyScoreUsage.add({ cached: found.size })
        respond({
          ok: true,
          scores: [...found.values()].map(toReplyScore),
          labels: [...labels].map(([id, label]) => ({ id, label })),
        })
      } catch (error) {
        respond({ ok: false, error: toTransferable(error, 'error.readFailed') })
      }
    })()
    return true
  })

  // 标注：保存、撤销、列出全部（设置页显示条数和导出）
  // botAccount 为 true / false 时同时把作者加入 / 移出机器人账号列表，不传就不改
  void fillBotAccountsFromLabels().catch(() => {})
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== REPLY_LABEL_SET && message?.type !== REPLY_LABEL_LIST) return
    if (sender?.id !== browser.runtime.id) return
    void (async () => {
      try {
        if (message.type === REPLY_LABEL_LIST) {
          respond({ ok: true, labels: await replyScores.allLabels() })
          return
        }
        if (message.label === null) {
          const [id] = sanitizeTweetIds([message.id])
          if (!id) throw new AppError('error.aiUnsupported')
          await replyScores.deleteLabel(id)
        } else {
          const entry = await labelEntryOf(message)
          if (!entry) throw new AppError('error.aiUnsupported')
          await replyScores.putLabel(entry)
        }
        if (typeof message.botAccount === 'boolean') {
          await setBotAccount(String(message.item?.author ?? ''), message.botAccount)
        }
        respond({ ok: true })
      } catch (error) {
        respond({ ok: false, error: toTransferable(error, 'error.dbWriteFailed') })
      }
    })()
    return true
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
  // 右键「存为 X 草稿」：菜单项在安装、浏览器启动、开关或界面语言变化时重建
  browser.contextMenus?.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== SELECTION_DRAFT_MENU_ID) return
    void saveSelectionAsDraft(info, tab)
  })
  browser.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && (KeySelectionDraft in changes || KeyExtensionStatus in changes)) syncSelectionDraftMenu()
  })
  onLocaleChange(() => syncSelectionDraftMenu())

  browser.runtime.onInstalled.addListener(() => {
    syncSelectionDraftMenu()
    void migrateSpamStorage()
    void setupCreatorRewardsAlarm()
    void checkAndAutoRefreshCreatorRewards()
  })

  browser.runtime.onStartup?.addListener(() => {
    syncSelectionDraftMenu()
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
      void refreshCreatorRewardsData().then(sendResponse)
      return true
    }

    if (msg?.type === MENTION_SEARCH_MESSAGE) {
      void (async () => {
        try {
          const users = await searchMentionUsers(String(msg.query || ''))
          sendResponse({ ok: true, users })
        } catch (e: any) {
          sendResponse({ ok: false, error: toTransferable(e) ?? String(e) })
        }
      })()
      return true
    }
  })
})

/** 用 X 发帖框自己的用户查询接口按名字找账号 */
async function searchMentionUsers(query: string): Promise<MentionUser[]> {
  const q = query.trim().slice(0, MENTION_QUERY_MAX_LENGTH)
  if (!q) return []
  if (!(await getCsrfToken())) throw new AppError('error.noXSession')
  const res = await fetch(buildMentionSearchUrl(q), {
    headers: await getBaseApiHeaders(),
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new AppError('error.mentionSearchHttp', { status: res.status })
  return parseMentionUsers(await res.json())
}

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
    await persistCreatorRewardsStats(stats)
  } catch {
    // 忽略存储异常
  }

  return stats
}

/** 奖励计划进度和账号分析的每日曝光一起取；账号分析失败不影响进度 */
async function refreshCreatorRewardsData(): Promise<{
  ok: boolean
  stats?: CreatorRewardsStats | null
  error?: TransferableError
  impressionsError?: TransferableError
}> {
  const [rewards, impressions] = await Promise.allSettled([
    fetchCreatorRewardsFromApi(),
    fetchImpressionsDailyFromApi(),
  ])
  return {
    ok: rewards.status === 'fulfilled' && Boolean(rewards.value),
    stats: rewards.status === 'fulfilled' ? rewards.value : null,
    error: rewards.status === 'rejected' ? toTransferable(rewards.reason, 'error.rewardsParse') : undefined,
    impressionsError: impressions.status === 'rejected' ? toTransferable(impressions.reason, 'error.analyticsShape') : undefined,
  }
}

async function requestAccountOverview(queryId: string, headers: HeadersInit): Promise<Response> {
  const url = new URL(`${X_API_BASE}/graphql/${queryId}/${ACCOUNT_OVERVIEW_OPERATION}`)
  url.searchParams.set('variables', JSON.stringify(buildAccountOverviewVariables()))
  return fetch(url.toString(), { method: 'GET', headers, credentials: 'include' })
}

/** 账号分析页的按天曝光：整体 + 蓝 V 用户看到的部分 */
async function fetchImpressionsDailyFromApi(): Promise<ImpressionsDailyCache> {
  const csrf = await getCsrfToken()
  if (!csrf) {
    throw new AppError('error.noXSession')
  }

  const stored = await browser.storage.local.get([KeyAccountOverviewQueryId, KeyImpressionsDaily])
  const capturedId = typeof stored[KeyAccountOverviewQueryId] === 'string' ? stored[KeyAccountOverviewQueryId] : ''
  const queryIds = [...new Set([capturedId, FALLBACK_ACCOUNT_OVERVIEW_QUERY_ID].filter(Boolean))]
  const headers = {
    ...(await getBaseApiHeaders()),
    'content-type': 'application/json',
    referer: 'https://x.com/i/account_analytics',
  }

  let res: Response | null = null
  for (const queryId of queryIds) {
    res = await requestAccountOverview(queryId, headers)
    // 400/404 多半是接口编号过期，换下一个编号
    if (res.status !== 400 && res.status !== 404) break
  }
  if (!res?.ok) {
    if (!res) throw new AppError('error.analyticsNoResponse')
    // 400/404 多半是接口编号过期：提示打开一次账号分析页，让拦截器记下新编号
    throw new AppError(res.status === 400 || res.status === 404 ? 'error.analyticsHttpOpenPage' : 'error.analyticsHttp', { status: res.status })
  }

  const days = parseAccountOverviewDaily(await res.json())
  if (!days) throw new AppError('error.analyticsShape')

  const cache = mergeImpressionsDays(parseImpressionsCache(stored[KeyImpressionsDaily]), days, Date.now())
  await browser.storage.local.set({ [KeyImpressionsDaily]: JSON.stringify(cache) })
  return cache
}

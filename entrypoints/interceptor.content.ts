/**
 * MAIN world 数据拦截器（唯一入口）。
 *
 * 在 document_start 只安装一次 window.fetch / XMLHttpRequest 钩子，按 URL 分流：
 *   - FetchScheduledTweets → 排期数据（postMessage + sessionStorage 条目快照）
 *
 * 安全/隐蔽原则：
 * - 只读不改：clone 响应后再解析，绝不修改原始 Response / XHR 结果
 * - 零日志：默认静默；仅当 window.__XF_DEBUG_SCHEDULED__ = true 时输出排查信息
 * - 最小开销：先做 URL 字符串判断，命中且 response.ok 才 clone + 解析
 * - 静默失败：所有异常吞掉，绝不影响 X 页面自身逻辑
 *
 * 注意：MAIN world 无法直接访问 browser.storage，排期走 window.postMessage，
 * 由 isolated world 的监听器（initialize.ts 注册）落库。
 */
import {
  XF_BRIDGE_MARKER,
  SCHEDULED_TWEETS_TYPE,
  BOOKMARK_METRICS_TYPE,
  REPLY_POSTED_TYPE,
  USER_METRICS_TYPE,
  CREATOR_REWARDS_TYPE,
  PROFILE_ACTIVITY_FETCH_REQ_TYPE,
  PROFILE_ACTIVITY_FETCH_ACK_TYPE,
  PROFILE_ACTIVITY_FETCH_RES_TYPE,
  OWN_POSTS_FETCH_REQ_TYPE,
  OWN_POSTS_FETCH_RES_TYPE,
  SCHEDULED_FETCH_REQ_TYPE,
  SCHEDULED_FETCH_RES_TYPE,
} from '../shared/bridge'
import { createOwnPostsFetcher } from '../shared/own-posts-fetcher'
import {
  extractTimelinePage,
  extractQueryIdFromScript,
} from '../shared/profile-activity-fetcher'
import type { ProfileActivityEntry } from '../shared/profile-activity'
import {
  isCreatorRewardsUrl,
  parseCreatorRewardsPayload,
} from '../shared/creator-rewards'
import {
  getRequestUrl,
  isScheduledUrl,
  extractScheduledItems,
  type ExtractedScheduledItem,
} from '../shared/scheduled-interceptor'
import {
  createScheduledFetcher,
  isScheduledMutationUrl,
  parseScheduledRequestUrl,
  type CapturedScheduledRequest,
} from '../shared/scheduled-fetcher'
import {
  isTweetOrArticleUrl,
  extractBookmarkMetrics,
} from '../shared/bookmark-interceptor'
import {
  isCreateTweetUrl,
  extractInReplyToTweetId,
} from '../shared/reply-interceptor'
import {
  isUserOrTimelineUrl,
  extractUserMetrics,
  type UserMetrics,
} from '../shared/user-metrics-interceptor'

export default defineContentScript({
  matches: [
    'https://twitter.com/*',
    'https://mobile.twitter.com/*',
    'https://x.com/*',
    'https://pro.x.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // 扩展总开关：MAIN world 无法读 storage，由 isolated world 通过 postMessage 通知。
    // 默认 true 兼容现有行为（document_start 时还不知道开关状态）；收到关闭通知后停用拦截。
    let interceptEnabled = true

    const SCHEDULED_RAW_KEY = 'xf_scheduled_raw_last'
    const SCHEDULED_ITEMS_KEY = 'xf_scheduled_items_last'
    const DEBUG_FLAG = '__XF_DEBUG_SCHEDULED__'

    // 上次已广播的排期 payload，内容没变就不重复广播，减少 postMessage 与 storage 写入
    let lastScheduledPosted = ''

    function debug(...args: unknown[]) {
      try {
        if ((window as unknown as Record<string, unknown>)[DEBUG_FLAG]) {
          console.log('[oh-my-x 拦截器]', ...args)
        }
      } catch {
        // ignore
      }
    }

    function preloadRepliesChunk(handle: string) {
      try {
        const link = document.querySelector<HTMLAnchorElement>(
          `a[href*="/${handle.toLowerCase()}/with_replies"], a[href$="/with_replies"]`,
        )
        if (link) {
          link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
          link.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        }
      } catch {}
    }

    let cachedFeatures: Record<string, boolean> | null = null

    const DEFAULT_TIMELINE_FEATURES: Record<string, boolean> = {
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    }

    function findQueryIdFromWindow(operationName: string): string | null {
      try {
        const chunkArray = (window as unknown as { webpackChunk_twitter_responsive_web?: unknown[] })
          ?.webpackChunk_twitter_responsive_web
        if (Array.isArray(chunkArray)) {
          for (const chunk of chunkArray) {
            if (!Array.isArray(chunk)) continue
            const modules = chunk[1]
            if (!modules || typeof modules !== 'object') continue
            for (const modId of Object.keys(modules as Record<string, unknown>)) {
              const mod = (modules as Record<string, unknown>)[modId]
              const modStr = typeof mod === 'function' ? mod.toString() : ''
              if (modStr.includes(operationName)) {
                const qid = extractQueryIdFromScript(modStr, operationName)
                if (qid) return qid
              }
            }
          }
        }
      } catch {}
      return null
    }

    function findQueryIdFromDom(operationName: string): string | null {
      try {
        const scripts = Array.from(document.querySelectorAll('script'))
        for (const script of scripts) {
          const text = script.textContent
          if (text && text.includes(operationName)) {
            const qid = extractQueryIdFromScript(text, operationName)
            if (qid) return qid
          }
        }
      } catch {}
      return null
    }

    async function findQueryIdFromCdnScripts(operationName: string): Promise<string | null> {
      try {
        const sessionKey = `xf_qid_v2_${operationName}`
        const cached = sessionStorage.getItem(sessionKey)
        if (cached) return cached

        const elements = Array.from(
          document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
            'script[src], link[rel="modulepreload"], link[rel="preload"][as="script"]',
          ),
        )

        const urls = elements
          .map((el) => (el.tagName.toLowerCase() === 'script' ? (el as HTMLScriptElement).src : (el as HTMLLinkElement).href))
          .filter((src): src is string => Boolean(src && (src.includes('responsive-web') || src.includes('x-web') || src.includes('twimg.com'))))

        const uniqueUrls = Array.from(new Set(urls))
        uniqueUrls.sort((a, b) => {
          const aIsMain = a.includes('/main.') || a.includes('main-')
          const bIsMain = b.includes('/main.') || b.includes('main-')
          if (aIsMain && !bIsMain) return -1
          if (!aIsMain && bIsMain) return 1
          return 0
        })

        const BATCH_SIZE = 5
        for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
          const batch = uniqueUrls.slice(i, i + BATCH_SIZE)
          const results = await Promise.all(
            batch.map(async (src) => {
              try {
                const res = await originalFetch(src)
                if (res.ok) {
                  const text = await res.text()
                  if (text.includes(operationName)) {
                    return extractQueryIdFromScript(text, operationName)
                  }
                }
              } catch {}
              return null
            }),
          )

          for (const qid of results) {
            if (qid) {
              sessionStorage.setItem(sessionKey, qid)
              return qid
            }
          }
        }
      } catch {}
      return null
    }

    async function findQueryIdFromRepliesRoute(handle: string, operationName: string): Promise<string | null> {
      try {
        const sessionKey = `xf_qid_v2_${operationName}`
        const cached = sessionStorage.getItem(sessionKey)
        if (cached) return cached

        const targetUrl = `https://x.com/${handle}/with_replies`
        const res = await originalFetch(targetUrl, {
          method: 'GET',
          credentials: 'include',
        })
        if (!res.ok) return null
        const html = await res.text()

        const scriptUrls: string[] = []
        const regex = /(?:src|href)=["'](https:\/\/[^"']*(?:responsive-web|x-web|twimg\.com)[^"']*\.js[^"']*)["']/gi
        let match: RegExpExecArray | null
        while ((match = regex.exec(html)) !== null) {
          scriptUrls.push(match[1])
        }

        const uniqueUrls = Array.from(new Set(scriptUrls))
        uniqueUrls.sort((a, b) => {
          const aIsMain = a.includes('/main.') || a.includes('main-')
          const bIsMain = b.includes('/main.') || b.includes('main-')
          if (aIsMain && !bIsMain) return -1
          if (!aIsMain && bIsMain) return 1
          return 0
        })

        const BATCH_SIZE = 5
        for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
          const batch = uniqueUrls.slice(i, i + BATCH_SIZE)
          const results = await Promise.all(
            batch.map(async (src) => {
              try {
                const sRes = await originalFetch(src)
                if (sRes.ok) {
                  const text = await sRes.text()
                  if (text.includes(operationName)) {
                    return extractQueryIdFromScript(text, operationName)
                  }
                }
              } catch {}
              return null
            }),
          )

          for (const qid of results) {
            if (qid) {
              sessionStorage.setItem(sessionKey, qid)
              return qid
            }
          }
        }
      } catch {}
      return null
    }

    async function resolveQueryId(operationName: string, profileHandle?: string): Promise<string | null> {
      const sessionKey = `xf_qid_v2_${operationName}`
      const fromWin = findQueryIdFromWindow(operationName)
      if (fromWin) {
        sessionStorage.setItem(sessionKey, fromWin)
        return fromWin
      }

      const fromDom = findQueryIdFromDom(operationName)
      if (fromDom) {
        sessionStorage.setItem(sessionKey, fromDom)
        return fromDom
      }

      const cached = sessionStorage.getItem(sessionKey)
      if (cached) return cached

      const fromCdn = await findQueryIdFromCdnScripts(operationName)
      if (fromCdn) {
        sessionStorage.setItem(sessionKey, fromCdn)
        return fromCdn
      }

      if (profileHandle) {
        const fromRoute = await findQueryIdFromRepliesRoute(profileHandle, operationName)
        if (fromRoute) {
          sessionStorage.setItem(sessionKey, fromRoute)
          return fromRoute
        }
      }

      return null
    }

    function resolveProfileUserId(handle: string): string | null {
      // 0. 若已拦截到当前博主请求中的真实 userId，且确认属于当前 handle，优先使用
      const capturedId = capturedTimeline?.variablesTemplate?.userId
      if (typeof capturedId === 'string' && capturedId) {
        const cachedUser = userMetricsCache[capturedId] || userMetricsCache[handle.toLowerCase()]
        if (cachedUser?.screenName && cachedUser.screenName.toLowerCase() === handle.toLowerCase()) {
          return capturedId
        }
      }

      const cached = userMetricsCache[handle.toLowerCase()]?.restId
      if (cached) return cached

      // 1. 关注/取消关注按钮提取
      try {
        const followBtn = document.querySelector<HTMLElement>(
          'button[data-testid$="-follow"], button[data-testid$="-unfollow"]',
        )
        if (followBtn) {
          const tid = followBtn.getAttribute('data-testid') || ''
          const match = tid.match(/^(\d+)-(?:un)?follow$/)
          if (match?.[1]) return match[1]
        }
      } catch {}

      // 2. 从 meta 标签提取
      try {
        const metaTag = document.querySelector<HTMLMetaElement>(
          'meta[property="twitter:user:id"], meta[name="twitter:user:id"]',
        )
        if (metaTag?.content) return metaTag.content
      } catch {}

      // 3. 从 React Fiber 提取
      try {
        const targets = document.querySelectorAll<HTMLElement>(
          '[data-testid="UserName"], [data-testid="User-Name"], [data-testid="editProfileButton"], [data-testid="UserDescription"]',
        )
        for (const el of Array.from(targets)) {
          const fiberUser = extractUserFromFiber(el, handle)
          if (fiberUser?.restId) return fiberUser.restId
        }
      } catch {}

      return null
    }

    interface CapturedTimelineContext {
      url: string
      operationName: string
      queryId: string
      variablesTemplate: Record<string, unknown>
      features: Record<string, unknown>
      fieldToggles?: Record<string, unknown>
      headers: Record<string, string>
      timestamp: number
    }

    let capturedTimeline: CapturedTimelineContext | null = null
    const capturedTimelines = new Map<string, CapturedTimelineContext>()
    const timelineOperations = new Set(['UserRepliesTimeline', 'UserOriginalsTimeline', 'UserTweetsAndReplies', 'UserTweets'])
    const capturedHeaders: Record<string, string> = {}
    const timelineCooldowns = new Map<string, number>()

    function rateLimitMessage(until: number, pages = 0) {
      const time = new Date(until).toLocaleTimeString('zh-CN', { hour12: false })
      return `X 接口请求次数已用尽（429），请在 ${time} 后重试。已读取 ${pages} 页，未保存不完整统计`
    }

    // X 自己请求排期列表时记下接口编号和参数，右侧栏面板刷新时照着请求。
    // 存在页面的 localStorage 里，新开的标签页不用等 X 再请求一次。
    const SCHEDULED_REQUEST_KEY = 'xf_scheduled_request_v1'

    let lastScheduledRequest = ''
    function rememberScheduledRequest(url: string) {
      const request = parseScheduledRequestUrl(url, location.origin)
      if (!request) return
      // XHR 每设一个请求头都会再捕获一次，同一个请求只写一次
      const serialized = JSON.stringify(request)
      if (serialized === lastScheduledRequest) return
      lastScheduledRequest = serialized
      try {
        localStorage.setItem(SCHEDULED_REQUEST_KEY, serialized)
      } catch {}
    }

    function readScheduledRequest(): CapturedScheduledRequest | null {
      try {
        const raw = JSON.parse(localStorage.getItem(SCHEDULED_REQUEST_KEY) || 'null')
        if (raw && typeof raw.queryId === 'string' && /^[A-Za-z0-9_-]{10,64}$/.test(raw.queryId) && typeof raw.search === 'string') {
          return { queryId: raw.queryId, search: raw.search }
        }
      } catch {}
      return null
    }

    function forgetScheduledRequest() {
      lastScheduledRequest = ''
      try {
        localStorage.removeItem(SCHEDULED_REQUEST_KEY)
        sessionStorage.removeItem('xf_qid_v2_FetchScheduledTweets')
      } catch {}
    }

    // X 当前使用 XHR 加载个人时间线；fetch 与 XHR 必须共用请求捕获逻辑。
    function captureGraphQLRequest(url: string, headers?: HeadersInit) {
      try {
        const parsed = new URL(url, location.origin)
        const match = parsed.pathname.match(/\/graphql\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/)
        if (!match) return
        const [, queryId, operationName] = match
        if (operationName === 'FetchScheduledTweets') rememberScheduledRequest(parsed.toString())
        const features = JSON.parse(parsed.searchParams.get('features') || '{}')
        if (Object.keys(features).length) cachedFeatures = { ...cachedFeatures, ...features }
        const requestHeaders: Record<string, string> = {}
        new Headers(headers).forEach((value, key) => { requestHeaders[key] = value })
        Object.assign(capturedHeaders, requestHeaders)
        if (!timelineOperations.has(operationName) && operationName !== 'SearchTimeline') return
        const context: CapturedTimelineContext = {
          url: parsed.toString(), operationName, queryId,
          variablesTemplate: JSON.parse(parsed.searchParams.get('variables') || '{}'),
          features,
          fieldToggles: JSON.parse(parsed.searchParams.get('fieldToggles') || '{}'),
          headers: requestHeaders,
          timestamp: Date.now(),
        }
        capturedTimelines.set(operationName, context)
        if (timelineOperations.has(operationName)) capturedTimeline = context
        sessionStorage.setItem(`xf_qid_v2_${operationName}`, queryId)
      } catch { /* 不影响页面自身的请求 */ }
    }

    async function timelineCandidate(op: string) {
      const qid = capturedTimelines.get(op)?.queryId || await resolveQueryId(op)
      return qid ? { op, qid } : null
    }

    async function handleProfileActivityFetch(
      requestId: string,
      profileHandle: string,
      days: number,
    ) {
      try {
        const userId = resolveProfileUserId(profileHandle)
        if (!userId) {
          window.postMessage(
            {
              type: PROFILE_ACTIVITY_FETCH_RES_TYPE,
              requestId,
              ok: false,
              error: '未能解析当前博主数字 ID，请确认位于博主个人主页',
              __xf: XF_BRIDGE_MARKER,
            },
            '*',
          )
          return
        }

        preloadRepliesChunk(profileHandle)
        type Candidate = { op: string; qid: string }
        const groups: Array<{ candidates: Candidate[]; type?: 'post' | 'reply' }> = []
        const replies = await timelineCandidate('UserRepliesTimeline')
        if (replies) {
          const posts = await timelineCandidate('UserOriginalsTimeline') || await timelineCandidate('UserTweets')
          if (!posts) throw new Error('未能获取帖子接口，请打开博主的“帖子”标签后重新扫描')
          groups.push({ candidates: [replies], type: 'reply' }, { candidates: [posts], type: 'post' })
        } else {
          const combined = await timelineCandidate('UserTweetsAndReplies')
          if (!combined) throw new Error('未能获取回复接口，请打开博主的“回复”标签后重新扫描')
          groups.push({ candidates: [combined] })
        }

        const csrfMatch = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)
        const csrfToken = csrfMatch ? csrfMatch[1] : ''
        if (!csrfToken) {
          window.postMessage(
            {
              type: PROFILE_ACTIVITY_FETCH_RES_TYPE,
              requestId,
              ok: false,
              error: '缺少有效认证 Token，请确认已登录 X',
              __xf: XF_BRIDGE_MARKER,
            },
            '*',
          )
          return
        }

        const bearerToken =
          'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

        const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
        let allEntries: ProfileActivityEntry[] | null = null
        let lastError = ''

        const mergedEntries = new Map<string, ProfileActivityEntry>()
        for (const group of groups) {
          let groupEntries: ProfileActivityEntry[] | null = null
          for (const candidate of group.candidates) {
            const { op, qid } = candidate
            const cooldown = timelineCooldowns.get(op) || 0
            if (cooldown > Date.now()) throw new Error(rateLimitMessage(cooldown))
            let cursor: string | null = null
            const MAX_PAGES = 100
            const entriesMap = new Map<string, ProfileActivityEntry>()
            const seenCursors = new Set<string>()
            let candidateComplete = false
            lastError = '活动较多，尚未扫描完指定时间范围，请稍后重试'
            const timelineContext = capturedTimelines.get(op)

            for (let page = 0; page < MAX_PAGES; page++) {
              const baseVariables =
                timelineContext?.variablesTemplate
                  ? { ...timelineContext.variablesTemplate }
                  : {}

              // 确保从顶部第 0 页开始，清除可能残留的旧 cursor
              delete (baseVariables as Record<string, unknown>).cursor

              const variables: Record<string, unknown> = {
                withVoice: true,
                withCommunity: true,
                withV2Timeline: true,
                ...baseVariables,
                includePromotedContent: false,
                count: 100,
                userId,
              }
              if (cursor) variables.cursor = cursor

              const features = timelineContext && Object.keys(timelineContext.features).length
                ? timelineContext.features
                : { ...DEFAULT_TIMELINE_FEATURES, ...cachedFeatures }
              const ft = timelineContext?.fieldToggles
              const fieldTogglesParam =
                ft && Object.keys(ft).length > 0 ? `&fieldToggles=${encodeURIComponent(JSON.stringify(ft))}` : ''

              const url = `https://x.com/i/api/graphql/${qid}/${op}?variables=${encodeURIComponent(
                JSON.stringify(variables),
              )}&features=${encodeURIComponent(JSON.stringify(features))}${fieldTogglesParam}`

              const requestHeaders: Record<string, string> = {
                authorization: bearerToken,
                'x-csrf-token': csrfToken,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session',
                'x-twitter-client-language': 'zh-cn',
                'content-type': 'application/json',
                ...capturedHeaders,
                ...timelineContext?.headers,
              }
              if (csrfToken) requestHeaders['x-csrf-token'] = csrfToken

              const res = await originalFetch(url, {
                method: 'GET',
                headers: requestHeaders,
                credentials: 'include',
              })

              if (!res.ok) {
                if (res.status === 429) {
                  const reset = Number(res.headers.get('x-rate-limit-reset')) * 1000
                  const retryAfter = Number(res.headers.get('retry-after')) * 1000
                  const until = reset > Date.now() ? reset : Date.now() + (retryAfter || 60000)
                  timelineCooldowns.set(op, until)
                  throw new Error(rateLimitMessage(until, page))
                }
                if (res.status === 404) {
                  try {
                    sessionStorage.removeItem(`xf_qid_v2_${op}`)
                    capturedTimelines.delete(op)
                  } catch {}
                }
                debug('候选端点未响应或返回错误码:', op, res.status)
                lastError = `端点 ${op} 返回错误码 ${res.status}`
                break // 尝试下一个候选端点
              }

              const json = await res.json()
              const { entries, bottomCursor, oldestTimestamp, hasTimeline } = extractTimelinePage(
                json,
                profileHandle,
              )

              if (json.errors?.length || !hasTimeline) {
                lastError = '回复接口未返回完整时间线，请稍后重试'
                break
              }

              for (const item of entries) entriesMap.set(item.id, item)

              if ((typeof oldestTimestamp === 'number' && oldestTimestamp < cutoffMs) || !bottomCursor) {
                candidateComplete = true
                break
              }
              if (seenCursors.has(bottomCursor)) {
                lastError = '回复时间线分页停滞，扫描未完成，请稍后重试'
                break
              }

              seenCursors.add(bottomCursor)
              cursor = bottomCursor
              await new Promise((r) => setTimeout(r, 150))
            }

            if (candidateComplete) {
              groupEntries = Array.from(entriesMap.values())
              break
            }
          }
          if (groupEntries === null) break
          for (const entry of groupEntries) {
            if (!group.type || entry.type === group.type) mergedEntries.set(entry.id, entry)
          }
          if (group === groups[groups.length - 1]) allEntries = Array.from(mergedEntries.values())
        }

        window.postMessage(
          {
            type: PROFILE_ACTIVITY_FETCH_RES_TYPE,
            requestId,
            ok: allEntries !== null,
            ...(allEntries !== null
              ? { entries: allEntries }
              : { error: `${lastError || '回复扫描未完成'}。请打开博主的“回复”标签后重新扫描` }),
            __xf: XF_BRIDGE_MARKER,
          },
          '*',
        )
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        window.postMessage(
          {
            type: PROFILE_ACTIVITY_FETCH_RES_TYPE,
            requestId,
            ok: false,
            error: errorMsg || '后台抓取异常',
            __xf: XF_BRIDGE_MARKER,
          },
          '*',
        )
      }
    }

    // 扩展总开关状态由 isolated world 通过 postMessage 推送（MAIN world 无法读 storage）。
    // 带 XF_BRIDGE_MARKER 防止页面其他脚本伪造状态消息。
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const data = event.data
      if (
        data &&
        typeof data === 'object' &&
        data.__xf === XF_BRIDGE_MARKER
      ) {
        if (data.type === 'XF_EXTENSION_STATUS') {
          interceptEnabled = data.enabled === true
          debug('拦截器状态:', interceptEnabled ? '启用' : '停用')
        } else if (data.type === OWN_POSTS_FETCH_REQ_TYPE && interceptEnabled) {
          if (typeof data.requestId !== 'string' || typeof data.handle !== 'string' ||
              typeof data.query !== 'string' || data.query.length > 200 ||
              (data.cursor !== undefined && (typeof data.cursor !== 'string' || data.cursor.length > 4096))) return
          if (ownPostsBusy) {
            window.postMessage({ type: OWN_POSTS_FETCH_RES_TYPE, requestId: data.requestId, ok: false, error: '上一条读取请求尚未结束，请稍后重试', __xf: XF_BRIDGE_MARKER }, location.origin)
            return
          }
          ownPostsBusy = true
          void fetchOwnPosts({ handle: data.handle, query: data.query, cursor: data.cursor })
            .then(page => window.postMessage({ type: OWN_POSTS_FETCH_RES_TYPE, requestId: data.requestId, ok: true, page, __xf: XF_BRIDGE_MARKER }, location.origin))
            .catch(error => window.postMessage({ type: OWN_POSTS_FETCH_RES_TYPE, requestId: data.requestId, ok: false, error: error instanceof Error ? error.message : '读取失败，请重试', __xf: XF_BRIDGE_MARKER }, location.origin))
            .finally(() => { ownPostsBusy = false })
        } else if (data.type === SCHEDULED_FETCH_REQ_TYPE && interceptEnabled) {
          if (typeof data.requestId !== 'string' || data.requestId.length > 100) return
          const requestId = data.requestId
          void fetchScheduled()
            .then((items) => {
              // 主动刷新时总是广播：存储里的缓存可能已被清理，需要重新写入
              broadcastScheduledItems(items, true)
              window.postMessage({ type: SCHEDULED_FETCH_RES_TYPE, requestId, ok: true, items, __xf: XF_BRIDGE_MARKER }, location.origin)
            })
            .catch((error) => window.postMessage({ type: SCHEDULED_FETCH_RES_TYPE, requestId, ok: false, error: error instanceof Error ? error.message : '读取失败，请重试', __xf: XF_BRIDGE_MARKER }, location.origin))
        } else if (data.type === PROFILE_ACTIVITY_FETCH_REQ_TYPE) {
          window.postMessage(
            { type: PROFILE_ACTIVITY_FETCH_ACK_TYPE, requestId: data.requestId, __xf: XF_BRIDGE_MARKER },
            '*',
          )
          void handleProfileActivityFetch(
            data.requestId,
            data.profileHandle,
            data.days || 7,
          )
        }
      }
    })

    function handleScheduled(data: unknown) {
      try {
        const items = extractScheduledItems(data)
        if (!items) return

        // 原始响应便于 DevTools 核对结构
        try {
          sessionStorage.setItem(SCHEDULED_RAW_KEY, JSON.stringify(data))
        } catch {
          // ignore
        }
        broadcastScheduledItems(items, false)
      } catch (e) {
        debug('排期解析/发送失败', e)
      }
    }

    function broadcastScheduledItems(items: ExtractedScheduledItem[], force: boolean) {
      const payload = JSON.stringify(items)
      if (!force && payload === lastScheduledPosted) {
        debug('排期数据未变化，跳过广播（当前', items.length, '条）')
        return
      }
      lastScheduledPosted = payload

      // 条目快照供 isolated world 链路丢失时回退
      try {
        sessionStorage.setItem(SCHEDULED_ITEMS_KEY, payload)
      } catch {
        // ignore
      }

      // 携带桥接标记，isolated world 监听端校验 source + type + 标记后才会落库
      window.postMessage(
        { type: SCHEDULED_TWEETS_TYPE, payload: items, __xf: XF_BRIDGE_MARKER },
        '*',
      )
      debug('已广播排期数据', items.length, '条', items)
    }

    // 新建/修改/删除定时帖后 X 不会自动重读列表，这里稍等片刻主动读一次，
    // 右侧栏面板和弹窗里的排期全景就能马上反映变化。连续操作只读最后一次。
    let scheduledRefetchTimer: ReturnType<typeof setTimeout> | null = null
    function scheduleScheduledRefetch() {
      if (scheduledRefetchTimer) clearTimeout(scheduledRefetchTimer)
      scheduledRefetchTimer = setTimeout(() => {
        scheduledRefetchTimer = null
        if (!interceptEnabled) return
        void fetchScheduled()
          .then((items) => broadcastScheduledItems(items, false))
          .catch((e) => debug('排期变更后重新读取失败', e))
      }, 1500)
    }

    const BOOKMARK_METRICS_KEY = 'xf_bookmark_metrics_last'
    const bookmarkMetricsCache: Record<string, number> = {}

    function handleBookmarks(data: unknown) {
      try {
        const metrics = extractBookmarkMetrics(data)
        const entries = Object.entries(metrics)
        if (entries.length === 0) return

        let updated = false
        for (const [id, count] of entries) {
          if (bookmarkMetricsCache[id] !== count) {
            bookmarkMetricsCache[id] = count
            updated = true
          }
        }

        if (!updated) return

        try {
          sessionStorage.setItem(BOOKMARK_METRICS_KEY, JSON.stringify(bookmarkMetricsCache))
        } catch {
          // ignore
        }

        window.postMessage(
          { type: BOOKMARK_METRICS_TYPE, payload: metrics, __xf: XF_BRIDGE_MARKER },
          '*',
        )
        debug('已广播书签指标', entries.length, '条', metrics)
      } catch (e) {
        debug('书签解析/发送失败', e)
      }
    }

    function handleReplyPosted(inReplyToTweetId: string) {
      try {
        if (!inReplyToTweetId) return
        window.postMessage(
          {
            type: REPLY_POSTED_TYPE,
            payload: { inReplyToTweetId },
            __xf: XF_BRIDGE_MARKER,
          },
          '*',
        )
        debug('已广播回复发布成功，目标推文 ID:', inReplyToTweetId)
      } catch (e) {
        debug('广播回复失败', e)
      }
    }

    const USER_METRICS_KEY = 'xf_user_metrics_last'
    const userMetricsCache: Record<string, UserMetrics> = {}
    try {
      const raw = sessionStorage.getItem(USER_METRICS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          Object.assign(userMetricsCache, parsed)
        }
      }
    } catch {
      // ignore
    }

    function handleUserMetrics(data: unknown) {
      try {
        const metrics = extractUserMetrics(data)
        const entries = Object.entries(metrics)
        if (entries.length === 0) return

        let updated = false
        for (const [key, item] of entries) {
          if (!userMetricsCache[key] || userMetricsCache[key].followersCount !== item.followersCount) {
            userMetricsCache[key] = item
            updated = true
          }
        }

        if (!updated) return

        try {
          sessionStorage.setItem(USER_METRICS_KEY, JSON.stringify(userMetricsCache))
        } catch {
          // ignore
        }

        window.postMessage(
          { type: USER_METRICS_TYPE, payload: metrics, __xf: XF_BRIDGE_MARKER },
          '*',
        )
        debug('已广播用户粉丝指标', entries.length, '条')
      } catch (e) {
        debug('用户指标解析/发送失败', e)
      }
    }

    function handleCreatorRewards(payload: ArrayBuffer | Uint8Array | string) {
      try {
        const stats = parseCreatorRewardsPayload(payload)
        if (!stats) return
        window.postMessage(
          { type: CREATOR_REWARDS_TYPE, payload: stats, __xf: XF_BRIDGE_MARKER },
          '*',
        )
        debug('已广播创作者奖励指标', stats)
      } catch (e) {
        debug('创作者奖励指标解析/发送失败', e)
      }
    }

    function route(url: string, data: unknown) {
      if (!data) return
      // 排期：URL 命中后仍由 extractScheduledItems 做结构校验
      if (isScheduledUrl(url)) handleScheduled(data)
      if (isScheduledMutationUrl(url)) scheduleScheduledRefetch()
      // 推文/长文书签指标
      if (isTweetOrArticleUrl(url)) handleBookmarks(data)
      // 用户粉丝与关注指标
      if (isUserOrTimelineUrl(url)) handleUserMetrics(data)
      // 回复推文接口
      if (isCreateTweetUrl(url)) {
        const id = extractInReplyToTweetId(null, data)
        if (id) handleReplyPosted(id)
      }
      if (isCreatorRewardsUrl(url) && typeof data === 'string') {
        handleCreatorRewards(data)
      }
    }

    // ---------- Hook window.fetch ----------
    const originalFetch = window.fetch
    let ownPostsBusy = false
    const fetchOwnPosts = createOwnPostsFetcher({
      fetch: (...args) => originalFetch.apply(window, args),
      resolveQueryId,
      getHeaders: operation => ({ ...capturedHeaders, ...capturedTimelines.get(operation)?.headers }),
      getFeatures: operation => capturedTimelines.get(operation)?.features || ({ ...DEFAULT_TIMELINE_FEATURES, ...cachedFeatures }),
    })
    const fetchScheduled = createScheduledFetcher({
      fetch: (...args) => originalFetch.apply(window, args),
      resolveQueryId,
      getHeaders: () => ({ ...capturedHeaders }),
      getCapturedRequest: readScheduledRequest,
      forgetCapturedRequest: forgetScheduledRequest,
    })
    window.fetch = function (this: any, ...args: Parameters<typeof fetch>): Promise<Response> {
      let url = ''
      try {
        url = getRequestUrl(args[0])
        const requestHeaders = args[1]?.headers || (args[0] instanceof Request ? args[0].headers : undefined)
        captureGraphQLRequest(url, requestHeaders)
      } catch { /* ignore */ }

      const isTargetUrl =
        isScheduledUrl(url) ||
        isTweetOrArticleUrl(url) ||
        isCreateTweetUrl(url) ||
        isUserOrTimelineUrl(url) ||
        isCreatorRewardsUrl(url)

      // 1. 非目标请求或扩展关闭：零介入，直接透传原生 fetch 调用
      if (!interceptEnabled || !isTargetUrl) {
        return originalFetch.apply(this, args)
      }

      let inReplyToFromReq: string | null = null
      if (isCreateTweetUrl(url)) {
        try {
          const body = args[1]?.body
          inReplyToFromReq = extractInReplyToTweetId(body)
        } catch {
          // ignore
        }
      }

      // 2. 命中目标接口：调用原生 fetch，并通过 promise.then 旁路安全读取
      const promise = originalFetch.apply(this, args)
      promise
        .then((response) => {
          try {
            if (response && response.ok) {
              if (isCreateTweetUrl(url) && inReplyToFromReq) {
                handleReplyPosted(inReplyToFromReq)
              }
              const cloned = response.clone()
              if (isCreatorRewardsUrl(url)) {
                cloned
                  .arrayBuffer()
                  .then((buf) => handleCreatorRewards(buf))
                  .catch(() => {})
              } else {
                cloned
                  .json()
                  .then((data) => route(url, data))
                  .catch(() => {})
              }
            }
          } catch {
            // 旁路处理静默失败
          }
        })
        .catch(() => {
          // 吞掉旁路监听链异常
        })

      return promise
    }

    // ---------- Hook XMLHttpRequest（备用通道） ----------
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
    const xhrRequests = new WeakMap<XMLHttpRequest, { url: string; headers: Record<string, string> }>()
    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      const result = originalSetRequestHeader.call(this, name, value)
      const request = xhrRequests.get(this)
      if (request) {
        request.headers[name.toLowerCase()] = value
        captureGraphQLRequest(request.url, request.headers)
      }
      return result
    }

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      try {
        ;(this as XMLHttpRequest & { __xfUrl?: string }).__xfUrl = String(url)
        xhrRequests.set(this, { url: String(url), headers: {} })
        captureGraphQLRequest(String(url))
      } catch {
        // ignore
      }
      return originalOpen.call(this, method, url, async ?? true, username, password)
    }

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      ...args: Parameters<XMLHttpRequest['send']>
    ): void {
      const xhr = this as XMLHttpRequest & { __xfUrl?: string; __xfHooked?: boolean; __xfReplyToId?: string | null }
      const url = xhr.__xfUrl || ''
      const isTargetUrl =
        isScheduledUrl(url) ||
        isTweetOrArticleUrl(url) ||
        isCreateTweetUrl(url) ||
        isUserOrTimelineUrl(url) ||
        isCreatorRewardsUrl(url)

      if (interceptEnabled && isTargetUrl && !xhr.__xfHooked) {
        xhr.__xfHooked = true
        if (isCreateTweetUrl(url)) {
          try {
            xhr.__xfReplyToId = extractInReplyToTweetId(args[0])
          } catch {
            // ignore
          }
        }
        this.addEventListener('load', function (this: XMLHttpRequest) {
          if (!interceptEnabled) return
          try {
            if (xhr.__xfReplyToId && this.status >= 200 && this.status < 300) {
              handleReplyPosted(xhr.__xfReplyToId)
            }
            if (isCreatorRewardsUrl(url)) {
              if (this.response instanceof ArrayBuffer) {
                handleCreatorRewards(this.response)
              } else if (this.responseText) {
                handleCreatorRewards(this.responseText)
              }
              return
            }
            if (!this.responseText) return
            route(url, JSON.parse(this.responseText))
          } catch {
            // 静默忽略
          }
        })
      }
      return originalSend.apply(this, args)
    }

    // ---------- React Fiber 穿透探测与 DOM 自动标注机制 ----------
    function findCountInObj(obj: any, depth = 0, seen = new WeakSet()): number | null {
      if (!obj || depth > 6 || typeof obj !== 'object') return null
      if (typeof Node !== 'undefined' && obj instanceof Node) return null
      if (typeof Window !== 'undefined' && obj instanceof Window) return null
      if (seen.has(obj)) return null
      seen.add(obj)

      // 1. 直查 legacy.bookmark_count / bookmark_count / bookmarkCount
      if (obj.legacy && typeof obj.legacy.bookmark_count === 'number') {
        return obj.legacy.bookmark_count
      }
      if (typeof obj.bookmark_count === 'number') {
        return obj.bookmark_count
      }
      if (typeof obj.bookmarkCount === 'number') {
        return obj.bookmarkCount
      }
      // 2. 长文专属节点直查
      if (obj.article && typeof obj.article.bookmark_count === 'number') {
        return obj.article.bookmark_count
      }
      if (obj.article_results?.result && typeof obj.article_results.result.bookmark_count === 'number') {
        return obj.article_results.result.bookmark_count
      }
      if (obj.tweet_results?.result?.legacy && typeof obj.tweet_results.result.legacy.bookmark_count === 'number') {
        return obj.tweet_results.result.legacy.bookmark_count
      }

      // 3. 递归查子属性，避开无关的大型字段
      for (const [k, val] of Object.entries(obj)) {
        if (!val || typeof val !== 'object') continue
        if (
          k === 'core' ||
          k === 'profile_image_shape' ||
          k === 'entities' ||
          k === 'media' ||
          k === 'symbols' ||
          k === 'urls' ||
          k === 'user_mentions'
        ) {
          continue
        }
        const found = findCountInObj(val, depth + 1, seen)
        if (typeof found === 'number' && !isNaN(found)) return found
      }
      return null
    }

    function extractBookmarkFromFiber(element: Element | null): number | null {
      if (!element) return null
      try {
        let curr: any = element
        for (let i = 0; i < 20 && curr; i++) {
          const keys = Object.keys(curr)
          const fiberKey = keys.find((k) => k.startsWith('__reactFiber$'))
          const propsKey = keys.find((k) => k.startsWith('__reactProps$'))

          const props = propsKey ? curr[propsKey] : null
          if (props) {
            const count = findCountInObj(props)
            if (typeof count === 'number' && !isNaN(count)) return count
          }

          let fiber = fiberKey ? curr[fiberKey] : null
          let depth = 0
          while (fiber && depth < 35) {
            const memoized = fiber.memoizedProps
            if (memoized) {
              const count = findCountInObj(memoized)
              if (typeof count === 'number' && !isNaN(count)) return count
            }
            fiber = fiber.return
            depth++
          }

          curr = curr.parentElement
        }
      } catch {
        // ignore
      }
      return null
    }

    /**
     * 从推文详情页底部的原生统计文本中提取（如 "447 个书签" 或 "447 Bookmarks"）
     */
    function extractBookmarkFromDetailStats(articleOrContainer: Element | null): number | null {
      if (!articleOrContainer) return null
      try {
        const spansAndLinks = articleOrContainer.querySelectorAll('a, span')
        for (const el of Array.from(spansAndLinks)) {
          const txt = el.textContent?.trim() || ''
          if (txt.includes('书签') || txt.toLowerCase().includes('bookmark')) {
            const m =
              txt.match(/(\d[\d,]*)\s*(?:个|次)?\s*(?:书签|bookmarks|bookmark|收藏)/i) ||
              txt.match(/(?:书签|bookmarks|bookmark|收藏)\s*[:：(（]?\s*(\d[\d,]*)/i)
            if (m && m[1]) {
              const num = parseInt(m[1].replace(/,/g, ''), 10)
              if (!isNaN(num) && num >= 0) return num
            }
          }
        }
      } catch {
        // ignore
      }
      return null
    }

    /**
     * 在 MAIN world 中直接扫描页面上的推文卡片与书签按钮，
     * 提取真实 bookmark_count 并通过原生 DOM 属性 data-xf-bookmark-count 共享给 isolated world
     */
    function annotateBookmarksInDom() {
      try {
        const bookmarkButtons = document.querySelectorAll<HTMLElement>(
          'button[data-testid="bookmark"], button[data-testid="removeBookmark"], [role="button"][data-testid="bookmark"], [role="button"][data-testid="removeBookmark"]',
        )

        bookmarkButtons.forEach((btn) => {
          // 1. 尝试从所属推文/卡片的链接提取 ID，若接口缓存中已有则直接使用
          const article =
            btn.closest('article[data-testid="tweet"]') ||
            btn.closest('article') ||
            btn.closest('[data-testid="twitterArticleReadView"]')

          let matchedId: string | undefined
          let countFromCache: number | undefined

          if (article) {
            // 优先检查 time 标签内部或包裹的链接
            const timeLink = article.querySelector('time')?.closest<HTMLAnchorElement>('a')
            if (timeLink) {
              const href = timeLink.getAttribute('href') || ''
              const m = href.match(/\/(?:status|article)\/(\d+)/)
              if (m && m[1]) {
                matchedId = m[1]
                if (typeof bookmarkMetricsCache[matchedId] === 'number') {
                  countFromCache = bookmarkMetricsCache[matchedId]
                }
              }
            }

            if (typeof countFromCache !== 'number') {
              const links = article.querySelectorAll<HTMLAnchorElement>(
                'a[href*="/status/"], a[href*="/article/"]',
              )
              for (const link of Array.from(links)) {
                const href = link.getAttribute('href') || ''
                const m = href.match(/\/(?:status|article)\/(\d+)/)
                if (m && m[1]) {
                  if (!matchedId) matchedId = m[1]
                  if (typeof bookmarkMetricsCache[m[1]] === 'number') {
                    countFromCache = bookmarkMetricsCache[m[1]]
                    matchedId = m[1]
                    break
                  }
                }
              }
            }
          }

          let finalCount = countFromCache
          if (typeof finalCount !== 'number') {
            const fiberCount =
              extractBookmarkFromFiber(btn) ||
              extractBookmarkFromFiber(btn.closest('[role="group"]')) ||
              (article ? extractBookmarkFromFiber(article) : null) ||
              extractBookmarkFromDetailStats(article)

            if (typeof fiberCount === 'number' && !isNaN(fiberCount)) {
              finalCount = fiberCount
              // 提取成功后回填进缓存并持久化
              if (matchedId) {
                bookmarkMetricsCache[matchedId] = finalCount
                try {
                  sessionStorage.setItem(BOOKMARK_METRICS_KEY, JSON.stringify(bookmarkMetricsCache))
                } catch {}
              }
            }
          }

          if (typeof finalCount === 'number') {
            const countStr = String(finalCount)
            if (btn.getAttribute('data-xf-bookmark-count') !== countStr) {
              btn.setAttribute('data-xf-bookmark-count', countStr)
              // 触发自定义通知，让 isolated world 迅速响应
              btn.dispatchEvent(new CustomEvent('xf-bookmark-count-updated', { bubbles: true }))
            }
          }
        })
      } catch {
        // ignore
      }
    }

    const EXCLUDED_HANDLES = new Set([
      'home',
      'explore',
      'notifications',
      'messages',
      'bookmarks',
      'profile',
      'i',
      'compose',
      'search',
      'settings',
      'topics',
      'lists',
    ])

    function findUserInObj(
      obj: any,
      expectedHandle: string,
      depth = 0,
      seen = new WeakSet(),
    ): UserMetrics | null {
      if (!expectedHandle || !obj || depth > 6 || typeof obj !== 'object') return null
      if (typeof Node !== 'undefined' && obj instanceof Node) return null
      if (typeof Window !== 'undefined' && obj instanceof Window) return null
      if (seen.has(obj)) return null
      seen.add(obj)

      const lowerExpected = expectedHandle.toLowerCase()
      const legacy = obj.legacy || obj
      const core = obj.core || {}
      const rc = obj.relationship_counts || {}
      const sn = core.screen_name || legacy.screen_name || obj.screen_name
      if (typeof sn === 'string' && sn.toLowerCase() === lowerExpected) {
        const fc = rc.followers ?? legacy.followers_count ?? obj.followers_count
        if (typeof fc === 'number' && !isNaN(fc)) {
          return {
            screenName: sn,
            name: core.name || legacy.name || obj.name,
            followersCount: fc,
            followingCount: rc.following ?? legacy.friends_count ?? obj.friends_count,
            restId: obj.rest_id || obj.id_str,
          }
        }
      }

      for (const [k, val] of Object.entries(obj)) {
        if (!val || typeof val !== 'object') continue
        if (
          k === 'media' ||
          k === 'video_info' ||
          k === 'entities' ||
          k === 'symbols' ||
          k === 'urls' ||
          k === 'user_mentions' ||
          k === 'profile_image_shape' ||
          k === 'description'
        ) {
          continue
        }
        const found = findUserInObj(val, expectedHandle, depth + 1, seen)
        if (found) return found
      }
      return null
    }

    function extractUserFromFiber(element: Element | null, expectedHandle: string): UserMetrics | null {
      if (!element || !expectedHandle) return null
      try {
        let curr: any = element
        for (let i = 0; i < 20 && curr; i++) {
          const keys = Object.keys(curr)
          const fiberKey = keys.find((k) => k.startsWith('__reactFiber$'))
          const propsKey = keys.find((k) => k.startsWith('__reactProps$'))

          const props = propsKey ? curr[propsKey] : null
          if (props) {
            const user = findUserInObj(props, expectedHandle)
            if (user) return user
          }

          let fiber = fiberKey ? curr[fiberKey] : null
          let depth = 0
          while (fiber && depth < 35) {
            const memoized = fiber.memoizedProps
            if (memoized) {
              const user = findUserInObj(memoized, expectedHandle)
              if (user) return user
            }
            fiber = fiber.return
            depth++
          }

          curr = curr.parentElement
        }
      } catch {
        // ignore
      }
      return null
    }

    function annotateUserFollowersInDom() {
      try {
        // 1. 扫描关注列表、粉丝列表与搜索用户卡片 ([data-testid="UserCell"])
        const userCells = document.querySelectorAll<HTMLElement>('[data-testid="UserCell"]')
        userCells.forEach((cell) => {
          let handle = ''
          const links = Array.from(cell.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))

          // 1.1 优先提取以 @ 开头的文本链接，且严格排除社交证明区域
          for (const link of links) {
            if (link.closest('[data-testid="socialContext"]')) continue
            const text = link.textContent?.trim() || ''
            if (text.startsWith('@')) {
              const href = link.getAttribute('href') || ''
              const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
              if (m && m[1]) {
                const low = m[1].toLowerCase()
                if (!EXCLUDED_HANDLES.has(low)) {
                  handle = m[1]
                  break
                }
              }
              const textMatch = text.match(/^@([A-Za-z0-9_]{1,15})/)
              if (textMatch && textMatch[1]) {
                const low = textMatch[1].toLowerCase()
                if (!EXCLUDED_HANDLES.has(low)) {
                  handle = textMatch[1]
                  break
                }
              }
            }
          }

          // 1.2 兜底提取普通链接（严格排除 socialContext）
          if (!handle) {
            for (const link of links) {
              if (link.closest('[data-testid="socialContext"]')) continue
              const href = link.getAttribute('href') || ''
              const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
              if (m && m[1]) {
                const low = m[1].toLowerCase()
                if (!EXCLUDED_HANDLES.has(low)) {
                  handle = m[1]
                  break
                }
              }
            }
          }

          if (!handle) return

          // 清理历史可能存在的残留/不匹配脏属性
          const existingScreenName = cell.getAttribute('data-xf-screen-name')
          if (existingScreenName && existingScreenName.toLowerCase() !== handle.toLowerCase()) {
            cell.removeAttribute('data-xf-followers-count')
            cell.removeAttribute('data-xf-following-count')
            cell.removeAttribute('data-xf-screen-name')
          }

          let restId = ''
          const btn = cell.querySelector('button[data-testid$="-follow"], button[data-testid$="-unfollow"]')
          if (btn) {
            const testid = btn.getAttribute('data-testid') || ''
            const m = testid.match(/^(\d+)-(?:un)?follow$/)
            if (m && m[1]) restId = m[1]
          }

          let metrics = userMetricsCache[handle.toLowerCase()] || (restId ? userMetricsCache[restId] : undefined)

          if (!metrics) {
            const fiberUser = extractUserFromFiber(cell, handle)
            if (fiberUser && fiberUser.screenName.toLowerCase() === handle.toLowerCase()) {
              metrics = fiberUser
              userMetricsCache[handle.toLowerCase()] = fiberUser
              if (fiberUser.restId) userMetricsCache[fiberUser.restId] = fiberUser
              try {
                sessionStorage.setItem(USER_METRICS_KEY, JSON.stringify(userMetricsCache))
              } catch {}
            }
          }

          if (metrics && metrics.screenName.toLowerCase() === handle.toLowerCase()) {
            const countStr = String(metrics.followersCount)
            let updated = false
            if (cell.getAttribute('data-xf-followers-count') !== countStr) {
              cell.setAttribute('data-xf-followers-count', countStr)
              updated = true
            }
            if (metrics.followingCount !== undefined) {
              cell.setAttribute('data-xf-following-count', String(metrics.followingCount))
            }
            if (cell.getAttribute('data-xf-screen-name') !== handle) {
              cell.setAttribute('data-xf-screen-name', handle)
              updated = true
            }
            if (updated) {
              cell.dispatchEvent(new CustomEvent('xf-user-followers-updated', { bubbles: true }))
            }
          }
        })

        // 2. 扫描推文头部作者名 ([data-testid="User-Name"])
        const userNames = document.querySelectorAll<HTMLElement>(
          'article[data-testid="tweet"] [data-testid="User-Name"]',
        )
        userNames.forEach((userNameEl) => {
          let handle = ''
          const links = Array.from(userNameEl.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))

          // 2.1 优先从 @handle 提取
          for (const link of links) {
            if (link.closest('[data-testid="socialContext"]')) continue
            const text = link.textContent?.trim() || ''
            if (text.startsWith('@')) {
              const href = link.getAttribute('href') || ''
              const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
              if (m && m[1]) {
                const low = m[1].toLowerCase()
                if (!EXCLUDED_HANDLES.has(low)) {
                  handle = m[1]
                  break
                }
              }
              const textMatch = text.match(/^@([A-Za-z0-9_]{1,15})/)
              if (textMatch && textMatch[1]) {
                const low = textMatch[1].toLowerCase()
                if (!EXCLUDED_HANDLES.has(low)) {
                  handle = textMatch[1]
                  break
                }
              }
            }
          }

          // 2.2 兜底普通链接
          if (!handle) {
            for (const link of links) {
              if (link.closest('[data-testid="socialContext"]')) continue
              const href = link.getAttribute('href') || ''
              const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
              if (m && m[1]) {
                const low = m[1].toLowerCase()
                if (!EXCLUDED_HANDLES.has(low)) {
                  handle = m[1]
                  break
                }
              }
            }
          }

          if (!handle) return

          const existingScreenName = userNameEl.getAttribute('data-xf-screen-name')
          if (existingScreenName && existingScreenName.toLowerCase() !== handle.toLowerCase()) {
            userNameEl.removeAttribute('data-xf-followers-count')
            userNameEl.removeAttribute('data-xf-following-count')
            userNameEl.removeAttribute('data-xf-screen-name')
          }

          let metrics = userMetricsCache[handle.toLowerCase()]

          if (!metrics) {
            const fiberUser = extractUserFromFiber(userNameEl, handle)
            if (fiberUser && fiberUser.screenName.toLowerCase() === handle.toLowerCase()) {
              metrics = fiberUser
              userMetricsCache[handle.toLowerCase()] = fiberUser
              if (fiberUser.restId) userMetricsCache[fiberUser.restId] = fiberUser
              try {
                sessionStorage.setItem(USER_METRICS_KEY, JSON.stringify(userMetricsCache))
              } catch {}
            }
          }

          if (metrics && metrics.screenName.toLowerCase() === handle.toLowerCase()) {
            const countStr = String(metrics.followersCount)
            let updated = false
            if (userNameEl.getAttribute('data-xf-followers-count') !== countStr) {
              userNameEl.setAttribute('data-xf-followers-count', countStr)
              updated = true
            }
            if (metrics.followingCount !== undefined) {
              userNameEl.setAttribute('data-xf-following-count', String(metrics.followingCount))
            }
            if (userNameEl.getAttribute('data-xf-screen-name') !== handle) {
              userNameEl.setAttribute('data-xf-screen-name', handle)
              updated = true
            }
            if (updated) {
              userNameEl.dispatchEvent(new CustomEvent('xf-user-followers-updated', { bubbles: true }))
            }
          }
        })
      } catch {
        // ignore
      }
    }

    function runAllDomAnnotations() {
      annotateBookmarksInDom()
      annotateUserFollowersInDom()
    }

    // 页面加载及 DOM 变更时持续自动标注
    setInterval(runAllDomAnnotations, 600)
    const domObserver = new MutationObserver(() => runAllDomAnnotations())
    if (document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true })
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) domObserver.observe(document.body, { childList: true, subtree: true })
      })
    }
  },
})

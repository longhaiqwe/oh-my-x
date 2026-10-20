import { AppError, type TransferableError } from './errors'
import { resolveChatCompletionsUrl, type AiRepostOptionsResult, type RepostSourceInput } from './ai-repost'
import type { Locale } from './i18n'
import type { ReplyScore, ReplyScoreItem, ReplyScoreParent } from './ai-reply-score'

export const AI_REQUEST_PORT = 'XF_AI_REQUEST'
// Stay below MV3's 30-second limit for receiving a fetch response.
export const AI_REQUEST_TIMEOUT_MS = 25_000
export interface AiConfig { baseUrl?: string; apiKey?: string; model?: string; customPrompt?: string }
export type AiRequest =
  /** locale：发起请求一方的插件界面语言，转发文案用这种语言写 */
  | { type: 'XF_GENERATE_REPOST_OPTIONS'; source: RepostSourceInput; overrideConfig?: AiConfig; locale?: Locale }
  | { type: 'XF_TEST_AI_CONNECTION'; config: AiConfig }
  | { type: 'XF_FETCH_TWEET_FULL_TEXT'; tweetId: string }
  /** 回复区 AI 打分。mode：auto 计入每日上限，manual 不计入；locale 决定理由用哪种语言写 */
  | { type: 'XF_SCORE_REPLIES'; parent: ReplyScoreParent; replies: ReplyScoreItem[]; mode: 'auto' | 'manual'; locale?: Locale }
export interface AiResponse extends Partial<AiRepostOptionsResult> {
  ok: boolean
  /** 错误代号或原文，显示时用 errorText() 翻译 */
  error?: TransferableError
  model?: string
  source?: RepostSourceInput | null
  /** XF_SCORE_REPLIES：缓存命中的和新判断的结果 */
  scores?: ReplyScore[]
  /** XF_SCORE_REPLIES：今天的自动判断已达上限，这次没有发请求 */
  limitReached?: boolean
}

/** 只查 AI 打分缓存，不调用模型。走 runtime.sendMessage，回复 { ok, scores } */
export const REPLY_SCORE_LOOKUP = 'XF_LOOKUP_REPLY_SCORES'

// 只有本机服务可以用 HTTP；要和 wxt.config.ts 的 optional_host_permissions 一致
const AI_LOCAL_HTTP_HOSTS = ['localhost', '127.0.0.1']

export function aiPermissionOrigin(baseUrl: string): string {
  const url = new URL(resolveChatCompletionsUrl(baseUrl))
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && AI_LOCAL_HTTP_HOSTS.includes(url.hostname))
  if (!allowed || url.username || url.password) {
    throw new AppError('error.aiBadUrl')
  }
  // Chrome match patterns do not include ports; a host grant covers its ports.
  return `${url.protocol}//${url.hostname}/*`
}

/** Call only synchronously from a popup click handler to preserve its user gesture. */
export function requestAiPermission(baseUrl: string): Promise<boolean> {
  return browser.permissions.request({ origins: [aiPermissionOrigin(baseUrl)] })
}

/** One port per request: disconnecting the UI also cancels its background fetch. */
export function sendAiRequest(message: AiRequest, signal: AbortSignal): Promise<AiResponse> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: AI_REQUEST_PORT })
    let settled = false
    const finish = (response?: AiResponse, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      port.onMessage.removeListener(onMessage)
      port.onDisconnect.removeListener(onDisconnect)
      port.disconnect()
      if (error) reject(error)
      else resolve(response!)
    }
    const onAbort = () => finish(undefined, signal.reason || new AppError('error.requestCancelled'))
    const onDisconnect = () => {
      // Read lastError to consume Chrome's disconnect error without exposing it or keys.
      void browser.runtime.lastError
      finish(undefined, new AppError('error.backgroundDisconnected'))
    }
    const onMessage = (response: AiResponse) => finish(response)
    const timer = setTimeout(() => finish(undefined, new AppError('error.requestTimeout')), AI_REQUEST_TIMEOUT_MS + 5_000)
    signal.addEventListener('abort', onAbort, { once: true })
    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    try { port.postMessage(message) } catch (error) { finish(undefined, error) }
  })
}

import { isExtensionContextInvalidated } from './extension-context'
import { AppError, type TransferableError } from './errors'
import { AI_FIRST_DATA_TIMEOUT_MS, AI_MAX_DURATION_MS } from './ai-deadline'
import { resolveChatCompletionsUrl, type AiRepostOptionsResult, type RepostSourceInput } from './ai-repost'
import type { Locale } from './i18n'
import type { ReplyScore, ReplyScoreItem, ReplyScoreParent } from './ai-reply-score'

export const AI_REQUEST_PORT = 'XF_AI_REQUEST'
// Stay below MV3's 30-second limit for receiving a fetch response.
// 第一段数据的时限；之后按多久没有新数据算，见 ai-deadline.ts
export const AI_REQUEST_TIMEOUT_MS = AI_FIRST_DATA_TIMEOUT_MS
/** 等待期间页面隔多久给后台发一次保活消息：扩展后台 30 秒没有任何事件可能被关掉 */
export const AI_KEEPALIVE_MS = 10_000
export const AI_KEEPALIVE = 'XF_AI_KEEPALIVE'
export interface AiConfig { baseUrl?: string; apiKey?: string; model?: string; customPrompt?: string }
export type AiRequest =
  /** locale：发起请求一方的插件界面语言，转发文案用这种语言写 */
  | { type: 'XF_GENERATE_REPOST_OPTIONS'; source: RepostSourceInput; overrideConfig?: AiConfig; locale?: Locale }
  | { type: 'XF_TEST_AI_CONNECTION'; config: AiConfig }
  | { type: 'XF_FETCH_TWEET_FULL_TEXT'; tweetId: string }
  /** 回复区 AI 打分。mode：auto 计入每日上限，manual 不计入；locale 决定理由用哪种语言写 */
  | { type: 'XF_SCORE_REPLIES'; parent: ReplyScoreParent; replies: ReplyScoreItem[]; mode: 'auto' | 'manual'; locale?: Locale }
  /** 设置页「用样例集测试」：给样例集里第 threadIndex 段对话打分；不写缓存，不计入用量 */
  | { type: 'XF_TEST_REPLY_SCORE_SAMPLES'; threadIndex: number; locale?: Locale }
  /** 搜索框里的大白话转成 X 搜索词，用公共 AI 服务的默认模型 */
  | { type: 'XF_BUILD_SEARCH_QUERY'; text: string }
/** Non-terminal Port message: a completed reply can be rendered while the request continues. */
export interface AiProgress {
  type: 'XF_AI_PROGRESS'
  scores: ReplyScore[]
}
export type AiProgressHandler = (progress: AiProgress) => void

export interface AiResponse extends Partial<AiRepostOptionsResult> {
  ok: boolean
  /** 错误代号或原文，显示时用 errorText() 翻译 */
  error?: TransferableError
  model?: string
  source?: RepostSourceInput | null
  /** XF_SCORE_REPLIES：缓存命中的和新判断的结果 */
  scores?: ReplyScore[]
  /** XF_BUILD_SEARCH_QUERY：转好的搜索词 */
  query?: string
  /** XF_SCORE_REPLIES：今天的自动判断已达上限，这次没有发请求 */
  limitReached?: boolean
  /** XF_TEST_REPLY_SCORE_SAMPLES：接口返回的用量；服务没返回时为 null */
  usage?: { promptTokens: number; completionTokens: number } | null
}

/** 只查 AI 打分缓存和标注，不调用模型。走 runtime.sendMessage，回复 { ok, scores, labels } */
export const REPLY_SCORE_LOOKUP = 'XF_LOOKUP_REPLY_SCORES'
/**
 * 保存或撤销一条标注：{ id, label: 'bot' | 'human' | null, item, parent, ai }。
 * label 为 null 表示撤销；ai 是标注时的 AI 结果（没有时为 null）
 */
export const REPLY_LABEL_SET = 'XF_REPLY_LABEL_SET'
/** 列出全部标注（设置页显示条数、导出用），回复 { ok, labels } */
export const REPLY_LABEL_LIST = 'XF_REPLY_LABEL_LIST'
/** 页面上有一条回复被 AI 折叠了：后台把当天的折叠数加 1 */
export const REPLY_SCORE_FOLDED = 'XF_REPLY_SCORE_FOLDED'
/** 在新标签页打开完整设置页，module: settings 直达公共 AI 服务，默认打开过滤模块 */
export const OPEN_SETTINGS = 'XF_OPEN_SETTINGS'

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
export function sendAiRequest(message: AiRequest, signal: AbortSignal, onProgress?: AiProgressHandler): Promise<AiResponse> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    let port: ReturnType<typeof browser.runtime.connect>
    try {
      port = browser.runtime.connect({ name: AI_REQUEST_PORT })
    } catch (error) {
      reject(isExtensionContextInvalidated(error) ? new AppError('error.extensionInvalidated') : error)
      return
    }
    let settled = false
    const finish = (response?: AiResponse, error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(keepAlive)
      signal.removeEventListener('abort', onAbort)
      // Invalidated contexts may throw during cleanup too. Always settle the caller.
      try { port.onMessage.removeListener(onMessage) } catch {}
      try { port.onDisconnect.removeListener(onDisconnect) } catch {}
      try { port.disconnect() } catch {}
      if (error) reject(isExtensionContextInvalidated(error) ? new AppError('error.extensionInvalidated') : error)
      else resolve(response!)
    }
    const onAbort = () => finish(undefined, signal.reason || new AppError('error.requestCancelled'))
    const onDisconnect = () => {
      // Read lastError to consume Chrome's disconnect error without exposing it or keys.
      let error: unknown
      try { error = browser.runtime.lastError?.message } catch (cause) { error = cause }
      finish(undefined, isExtensionContextInvalidated(error) ? new AppError('error.extensionInvalidated') : new AppError('error.backgroundDisconnected'))
    }
    const onMessage = (response: AiResponse | AiProgress) => {
      if (settled) return
      if ('type' in response && response.type === 'XF_AI_PROGRESS') {
        try { onProgress?.(response) } catch (error) { finish(undefined, error) }
      } else {
        finish(response as AiResponse)
      }
    }
    // 后台最长 90 秒一定会回复；这里只防后台没有回应
    const timer = setTimeout(() => finish(undefined, new AppError('error.requestTimeout')), AI_MAX_DURATION_MS + 5_000)
    // 后台在读模型的流式返回时不算有事件，隔一会儿发一条消息让它保持运行；后台收到后不处理
    const keepAlive = setInterval(() => {
      try { port.postMessage({ type: AI_KEEPALIVE }) } catch {}
    }, AI_KEEPALIVE_MS)
    signal.addEventListener('abort', onAbort, { once: true })
    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    try { port.postMessage(message) } catch (error) { finish(undefined, error) }
  })
}

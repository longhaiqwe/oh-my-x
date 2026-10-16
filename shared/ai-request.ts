import { resolveChatCompletionsUrl, type AiRepostOptionsResult, type RepostSourceInput } from './ai-repost'

export const AI_REQUEST_PORT = 'XF_AI_REQUEST'
// Stay below MV3's 30-second limit for receiving a fetch response.
export const AI_REQUEST_TIMEOUT_MS = 25_000
export interface AiConfig { baseUrl?: string; apiKey?: string; model?: string; customPrompt?: string }
export type AiRequest =
  | { type: 'XF_GENERATE_REPOST_OPTIONS'; source: RepostSourceInput; overrideConfig?: AiConfig }
  | { type: 'XF_TEST_AI_CONNECTION'; config: AiConfig }
  | { type: 'XF_FETCH_TWEET_FULL_TEXT'; tweetId: string }
export interface AiResponse extends Partial<AiRepostOptionsResult> {
  ok: boolean
  error?: string
  model?: string
  source?: RepostSourceInput | null
}

export function aiPermissionOrigin(baseUrl: string): string {
  const url = new URL(resolveChatCompletionsUrl(baseUrl))
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('AI 接口地址必须是不含用户名和密码的 HTTP/HTTPS 地址')
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
    const onAbort = () => finish(undefined, signal.reason || new Error('请求已取消'))
    const onDisconnect = () => {
      // Read lastError to consume Chrome's disconnect error without exposing it or keys.
      void browser.runtime.lastError
      finish(undefined, new Error('扩展后台连接已断开，请重试'))
    }
    const onMessage = (response: AiResponse) => finish(response)
    const timer = setTimeout(() => finish(undefined, new Error('请求超时，请检查网络后重试')), AI_REQUEST_TIMEOUT_MS + 5_000)
    signal.addEventListener('abort', onAbort, { once: true })
    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    try { port.postMessage(message) } catch (error) { finish(undefined, error) }
  })
}

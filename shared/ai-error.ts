import { errorText, isErrorPayload } from './errors'
import { isExtensionContextInvalidated } from './extension-context'
import { t, type Locale } from './i18n'

export type AiErrorAction = 'retry' | 'refresh' | 'settings'
export interface AiErrorDescription {
  summary: string
  guidance: string
  detail: string
  action: AiErrorAction
}

/** Classify only what the error actually establishes; keep the original diagnostic. */
export function describeAiError(error: unknown, locale?: Locale): AiErrorDescription {
  const code = isErrorPayload(error) ? error.code : ''
  const status = isErrorPayload(error) ? Number(error.params?.status) : 0
  const detail = errorText(error, 'error.aiFailed', locale)
  type Kind = 'expired' | 'disconnected' | 'timeout' | 'context' | 'rate' | 'auth' | 'service' | 'format' | 'network' | 'config' | 'unknown'
  let kind: Kind = 'unknown'
  let action: AiErrorAction = 'retry'
  if (code === 'error.extensionInvalidated' || isExtensionContextInvalidated(error)) {
    kind = 'expired'; action = 'refresh'
  } else if (code === 'error.backgroundDisconnected') {
    kind = 'disconnected'; action = 'refresh'
  } else if (code === 'error.aiTimeout' || code === 'error.aiStalled' || code === 'error.requestTimeout') {
    kind = 'timeout'
  } else if (['error.aiNoKey', 'error.aiNoModel', 'error.aiNotAuthorized', 'error.aiBadUrl'].includes(code)) {
    kind = 'config'; action = 'settings'
  } else if (code === 'error.aiHttp' || code === 'error.aiConnectHttp') {
    if (/context_length_exceeded|maximum context length|context (?:window|length).*(?:exceed|too (?:long|large))|too many (?:input )?tokens|prompt (?:is )?too long|上下文.*(?:超出|超过)|输入.*过长/i.test(detail)) {
      kind = 'context'; action = 'settings'
    } else if (status === 401 || status === 403) {
      kind = 'auth'; action = 'settings'
    } else if (status === 429) {
      kind = 'rate'
    } else if (status >= 500 && status <= 599) {
      kind = 'service'
    }
  } else if (code === 'error.aiScoreParse') {
    kind = 'format'
  } else if (/failed to fetch|networkerror|network request failed|load failed/i.test(detail)) {
    kind = 'network'
  }
  return {
    summary: t(`aiError.${kind}.summary`, undefined, locale),
    guidance: t(`aiError.${kind}.guidance`, undefined, locale),
    detail,
    action,
  }
}

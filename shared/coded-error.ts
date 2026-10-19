// 带错误代号的报错，不依赖文案表：页面拦截器（MAIN world）和页面内的抓取逻辑也能用，不会把整张文案表打进去。
// 代号是 shared/i18n 文案表里 error.* 的条目，显示时用 shared/errors.ts 的 errorText() 按语言翻译。
import type { MessageKey, MessageParams } from './i18n'

export type ErrorCode = Extract<MessageKey, `error.${string}`>

export interface ErrorPayload {
  code: ErrorCode
  params?: MessageParams
}

/** 跨消息传递、存储用的报错：错误代号，或浏览器、网络、第三方服务给出的原文 */
export type TransferableError = ErrorPayload | string

export class CodedError extends Error {
  readonly code: ErrorCode
  readonly params?: MessageParams

  constructor(code: ErrorCode, params?: MessageParams, message: string = code) {
    super(message)
    this.name = 'CodedError'
    this.code = code
    this.params = params
  }
}

export function errorPayload(code: ErrorCode, params?: MessageParams): ErrorPayload {
  return params ? { code, params } : { code }
}

export function isErrorPayload(value: unknown): value is ErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ErrorPayload).code === 'string' &&
    (value as ErrorPayload).code.startsWith('error.')
  )
}

/** 转成可以放进 sendResponse / postMessage / 存储的形式 */
export function toTransferable(error: unknown, fallback?: ErrorCode): TransferableError | undefined {
  if (error instanceof CodedError) return errorPayload(error.code, error.params)
  if (isErrorPayload(error)) return error
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback ? errorPayload(fallback) : undefined
}

/** 报错是不是某个代号 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return (error instanceof CodedError || isErrorPayload(error)) && error.code === code
}

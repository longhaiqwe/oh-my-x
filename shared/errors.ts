// 跨上下文传递的报错：后台、页面拦截器只传错误代号和参数，显示的一方按当前语言翻译。
// 不依赖文案表的部分在 coded-error.ts（页面拦截器用）；这里加上翻译。
import { t, type Locale } from './i18n'
import { CodedError, isErrorPayload, type ErrorCode } from './coded-error'
import type { MessageParams } from './i18n'

export * from './coded-error'

/** 带错误代号的报错；message 是按当前语言翻译好的文字，只读 message 的地方也能显示 */
export class AppError extends CodedError {
  constructor(code: ErrorCode, params?: MessageParams) {
    super(code, params, t(code, params))
    this.name = 'AppError'
  }
}

/** 把收到的报错（代号或原文）还原成可以 throw 的 Error；拿不到时用 fallback */
export function fromTransferable(error: unknown, fallback: ErrorCode): Error {
  if (error instanceof Error) return error
  if (isErrorPayload(error)) return new AppError(error.code, error.params)
  if (typeof error === 'string' && error) return new Error(error)
  return new AppError(fallback)
}

/** 显示用的报错文字：错误代号按语言翻译，原文照样显示；拿不到时用 fallback */
export function errorText(error: unknown, fallback?: ErrorCode, locale?: Locale): string {
  if (error instanceof CodedError || isErrorPayload(error)) return t(error.code, error.params, locale)
  if (typeof error === 'string' && error) return error
  if (error instanceof Error && error.message) return error.message
  return fallback ? t(fallback, undefined, locale) : ''
}

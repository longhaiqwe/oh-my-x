import type { ProfileActivityEntry } from './profile-activity'
import type { ErrorPayload, TransferableError } from './coded-error'
import {
  XF_BRIDGE_MARKER,
  PROFILE_ACTIVITY_FETCH_REQ_TYPE,
  PROFILE_ACTIVITY_FETCH_ACK_TYPE,
  PROFILE_ACTIVITY_FETCH_RES_TYPE,
} from './bridge'

export interface ProfileActivityBridgeOptions {
  marker: string
  requestType: string
  ackType: string
  responseType: string
  profileHandle: string
  days: number
  /** 拦截器在这段时间内没回「收到」，就当页面里没有拦截器 */
  ackTimeoutMs: number
  timeoutMs: number
  notReadyError: ErrorPayload
}

export interface ProfileActivityBridgeResult {
  ok: boolean
  entries?: ProfileActivityEntry[]
  /** 错误代号或原文，显示时用 errorText() 翻译 */
  error?: TransferableError
}

/** 拦截器只在页面加载时注入，页面里没有它时只能靠刷新补上 */
export const PROFILE_ACTIVITY_PAGE_NOT_READY: ErrorPayload = { code: 'error.pageNotReady' }

export function createProfileActivityBridgeOptions(
  profileHandle: string,
  days: number,
): ProfileActivityBridgeOptions {
  return {
    marker: XF_BRIDGE_MARKER,
    requestType: PROFILE_ACTIVITY_FETCH_REQ_TYPE,
    ackType: PROFILE_ACTIVITY_FETCH_ACK_TYPE,
    responseType: PROFILE_ACTIVITY_FETCH_RES_TYPE,
    profileHandle,
    days,
    ackTimeoutMs: 5000,
    timeoutMs: 120000,
    notReadyError: PROFILE_ACTIVITY_PAGE_NOT_READY,
  }
}

/**
 * 请 MAIN world 拦截器抓取博主近期活动（后台静默拉取，界面零滚动）。
 *
 * 弹窗会用 scripting.executeScript 把这个函数注入页面执行，注入时只带函数源码，
 * 所以函数体只能用参数和浏览器全局对象，不能引用本模块的其他变量。
 */
export function requestProfileActivityFromPage(
  options: ProfileActivityBridgeOptions,
): Promise<ProfileActivityBridgeResult> {
  return new Promise((resolve) => {
    const requestId = `paf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const listener = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || typeof data !== 'object' || data.__xf !== options.marker || data.requestId !== requestId) return
      if (data.type === options.ackType) {
        clearTimeout(ackTimer)
      } else if (data.type === options.responseType) {
        finish({
          ok: data.ok === true,
          entries: Array.isArray(data.entries) ? (data.entries as ProfileActivityEntry[]) : undefined,
          error: typeof data.error === 'string' || (data.error && typeof data.error.code === 'string') ? data.error : undefined,
        })
      }
    }

    const finish = (result: ProfileActivityBridgeResult) => {
      clearTimeout(ackTimer)
      clearTimeout(timer)
      window.removeEventListener('message', listener)
      resolve(result)
    }

    window.addEventListener('message', listener)
    const ackTimer = setTimeout(() => finish({ ok: false, error: options.notReadyError }), options.ackTimeoutMs)
    // 注入的函数不能引用其他模块，报错代号直接写成对象
    const timer = setTimeout(() => finish({ ok: false, error: { code: 'error.pageFetchTimeout' } }), options.timeoutMs)

    window.postMessage(
      {
        type: options.requestType,
        profileHandle: options.profileHandle,
        days: options.days,
        requestId,
        __xf: options.marker,
      },
      '*',
    )
  })
}

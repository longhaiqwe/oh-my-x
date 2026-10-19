import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  PROFILE_ACTIVITY_FETCH_ACK_TYPE,
  PROFILE_ACTIVITY_FETCH_REQ_TYPE,
  PROFILE_ACTIVITY_FETCH_RES_TYPE,
  XF_BRIDGE_MARKER,
} from '../../shared/bridge'
import {
  PROFILE_ACTIVITY_PAGE_NOT_READY,
  createProfileActivityBridgeOptions,
  requestProfileActivityFromPage,
  type ProfileActivityBridgeResult,
} from '../../shared/profile-activity-bridge'

const entries = [{ id: '1', date: '2026-10-16', type: 'post', timestamp: 1 }]

describe('requestProfileActivityFromPage', () => {
  let post: MockInstance<typeof window.postMessage>

  beforeEach(() => {
    vi.useFakeTimers()
    post = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function sentRequest() {
    const call = post.mock.calls.find(([data]) => data?.type === PROFILE_ACTIVITY_FETCH_REQ_TYPE)
    expect(call).toBeTruthy()
    return call![0] as { requestId: string; profileHandle: string; days: number; __xf: string }
  }

  function reply(data: Record<string, unknown>) {
    window.dispatchEvent(new MessageEvent('message', { source: window, data: { __xf: XF_BRIDGE_MARKER, ...data } }))
  }

  async function settled(promise: Promise<ProfileActivityBridgeResult>) {
    let result: ProfileActivityBridgeResult | undefined
    void promise.then((r) => (result = r))
    await vi.advanceTimersByTimeAsync(0)
    return () => result
  }

  it('拦截器回「收到」后返回抓取结果', async () => {
    const result = await settled(requestProfileActivityFromPage(createProfileActivityBridgeOptions('alice', 7)))
    const req = sentRequest()
    expect(req).toMatchObject({ profileHandle: 'alice', days: 7, __xf: XF_BRIDGE_MARKER })

    reply({ type: PROFILE_ACTIVITY_FETCH_ACK_TYPE, requestId: req.requestId })
    // 收到确认后，超过确认等待时间也继续等结果
    await vi.advanceTimersByTimeAsync(30000)
    expect(result()).toBeUndefined()

    reply({ type: PROFILE_ACTIVITY_FETCH_RES_TYPE, requestId: req.requestId, ok: true, entries })
    await vi.advanceTimersByTimeAsync(0)
    expect(result()).toEqual({ ok: true, entries, error: undefined })
  })

  it('页面里没有拦截器时，5 秒内提示刷新，而不是等满 2 分钟', async () => {
    const result = await settled(requestProfileActivityFromPage(createProfileActivityBridgeOptions('alice', 7)))
    await vi.advanceTimersByTimeAsync(4999)
    expect(result()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(result()).toEqual({ ok: false, error: PROFILE_ACTIVITY_PAGE_NOT_READY })
  })

  it('拦截器确认收到但一直没有结果时，按总超时结束', async () => {
    const result = await settled(requestProfileActivityFromPage(createProfileActivityBridgeOptions('alice', 7)))
    reply({ type: PROFILE_ACTIVITY_FETCH_ACK_TYPE, requestId: sentRequest().requestId })
    await vi.advanceTimersByTimeAsync(120000)
    expect(result()).toEqual({ ok: false, error: { code: 'error.pageFetchTimeout' } })
  })

  it('忽略其他请求或没有桥接标记的消息', async () => {
    const result = await settled(requestProfileActivityFromPage(createProfileActivityBridgeOptions('alice', 7)))
    const { requestId } = sentRequest()
    reply({ type: PROFILE_ACTIVITY_FETCH_RES_TYPE, requestId: 'other', ok: true, entries })
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: PROFILE_ACTIVITY_FETCH_RES_TYPE, requestId, ok: true, entries },
    }))
    await vi.advanceTimersByTimeAsync(0)
    expect(result()).toBeUndefined()
  })

  it('函数不依赖模块变量，只凭源码也能在页面里执行', async () => {
    // scripting.executeScript 只把函数源码送进页面，这里模拟同样的处境
    const injected = new Function(`return (${requestProfileActivityFromPage.toString()})`)() as typeof requestProfileActivityFromPage
    const result = await settled(injected(createProfileActivityBridgeOptions('alice', 7)))
    const req = sentRequest()
    reply({ type: PROFILE_ACTIVITY_FETCH_ACK_TYPE, requestId: req.requestId })
    reply({ type: PROFILE_ACTIVITY_FETCH_RES_TYPE, requestId: req.requestId, ok: false, error: '缺少有效认证 Token' })
    await vi.advanceTimersByTimeAsync(0)
    expect(result()).toEqual({ ok: false, entries: undefined, error: '缺少有效认证 Token' })
  })
})

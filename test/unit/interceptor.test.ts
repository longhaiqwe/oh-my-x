import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getRequestUrl,
  isScheduledUrl,
  extractScheduledItems,
} from '../../shared/scheduled-interceptor'
import interceptorScript from '../../entrypoints/interceptor.content'

describe('interceptor pure logic (scheduled-interceptor)', () => {
  describe('getRequestUrl', () => {
    it('正确解析字符串 URL', () => {
      expect(getRequestUrl('https://x.com/i/api/graphql/xxx/FetchScheduledTweets')).toBe(
        'https://x.com/i/api/graphql/xxx/FetchScheduledTweets',
      )
    })

    it('正确解析 URL 实例', () => {
      const urlObj = new URL('https://x.com/api/test')
      expect(getRequestUrl(urlObj)).toBe('https://x.com/api/test')
    })

    it('正确解析 Request 对象', () => {
      const req = { url: 'https://money.x.com/customer/api/device-signal' } as Request
      expect(getRequestUrl(req)).toBe('https://money.x.com/customer/api/device-signal')
    })

    it('面对 null / undefined / 数字 / 畸形对象时安全返回空字符串，不抛错', () => {
      expect(getRequestUrl(null)).toBe('')
      expect(getRequestUrl(undefined)).toBe('')
      expect(getRequestUrl(12345)).toBe('')
      expect(getRequestUrl({})).toBe('')
      expect(getRequestUrl({ url: null })).toBe('null')
    })
  })

  describe('isScheduledUrl', () => {
    it('命中包含 FetchScheduledTweets 的接口（大小写不敏感）', () => {
      expect(isScheduledUrl('https://x.com/i/api/graphql/xxx/FetchScheduledTweets')).toBe(true)
      expect(isScheduledUrl('https://x.com/i/api/graphql/xxx/fetchscheduledtweets')).toBe(true)
    })

    it('命中包含 ScheduledTweets 的接口', () => {
      expect(isScheduledUrl('https://api.twitter.com/1.1/scheduledtweets/list')).toBe(true)
    })

    it('命中 graphql 路径下包含 scheduled 的接口', () => {
      expect(isScheduledUrl('https://x.com/i/api/graphql/abc/GetScheduledList')).toBe(true)
    })

    it('对非排期请求（99.99% 的普通请求及 CSP 违规请求）均返回 false', () => {
      // 本次报错的设备风控接口
      expect(isScheduledUrl('https://money.x.com/customer/api/device-signal')).toBe(false)
      // 时间线接口
      expect(isScheduledUrl('https://x.com/i/api/graphql/xxx/HomeTimeline')).toBe(false)
      // 个人主页
      expect(isScheduledUrl('https://x.com/longhaiqwe123')).toBe(false)
      // 打点上报
      expect(isScheduledUrl('https://analytics.twitter.com/1.1/jot/client_event.json')).toBe(false)
      // 空值
      expect(isScheduledUrl('')).toBe(false)
    })
  })

  describe('extractScheduledItems', () => {
    it('正确提取官方路径 data.viewer.scheduled_tweet_list', () => {
      const mockData = {
        data: {
          viewer: {
            scheduled_tweet_list: [
              {
                rest_id: '123',
                scheduling_info: { execute_at: 1786549440000, state: 'Scheduled' },
                tweet_create_request: { status: '测试推文 1' },
              },
              {
                rest_id: '456',
                scheduling_info: { execute_at: 1786559440000, state: 'Draft' }, // 非 Scheduled 过滤
                tweet_create_request: { status: '草稿' },
              },
            ],
          },
        },
      }
      const items = extractScheduledItems(mockData)
      expect(items).toHaveLength(1)
      expect(items![0]).toEqual({
        restId: '123',
        timestamp: 1786549440000,
        text: '测试推文 1',
      })
    })

    it('通过深度兜底遍历提取任意深度的排期列表', () => {
      const mockDeepData = {
        response: {
          nested: {
            scheduledTweetList: [
              {
                restId: 'deep_999',
                schedulingInfo: { execute_at: 1786560000000, state: 'Scheduled' },
                tweetCreateRequest: { status: '深度推文' },
              },
            ],
          },
        },
      }
      const items = extractScheduledItems(mockDeepData)
      expect(items).toHaveLength(1)
      expect(items![0].restId).toBe('deep_999')
      expect(items![0].text).toBe('深度推文')
    })

    it('非合法数据返回 null', () => {
      expect(extractScheduledItems(null)).toBeNull()
      expect(extractScheduledItems('string')).toBeNull()
      expect(extractScheduledItems({})).toBeNull()
    })
  })
})

describe('interceptor hook execution (window.fetch / XHR)', () => {
  let originalFetchBackup: typeof window.fetch
  let postMessageSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalFetchBackup = window.fetch
    postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  })

  afterEach(() => {
    window.fetch = originalFetchBackup
    postMessageSpy.mockRestore()
  })

  it('main() 安装钩子后，非排期普通请求直接透传原生 fetch 且不产生包装异常', async () => {
    const mockNativeFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    window.fetch = mockNativeFetch

    // 执行拦截器主入口安装 hook
    interceptorScript.main({} as any)

    // 模拟调用类似 money.x.com 的普通请求
    const res = await window.fetch('https://money.x.com/customer/api/device-signal', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect(mockNativeFetch).toHaveBeenCalledTimes(1)
    expect(mockNativeFetch).toHaveBeenCalledWith(
      'https://money.x.com/customer/api/device-signal',
      { method: 'POST' },
    )
    // 绝不触发排期广播
    expect(postMessageSpy).not.toHaveBeenCalled()
  })

  it('非排期请求若被 CSP 阻止或网络失败（reject），原生错误直接传给调用方且拦截器不抛出未捕获异常', async () => {
    const cspError = new TypeError(
      "Failed to fetch: Refused to connect because it violates document's CSP",
    )
    const mockNativeFetch = vi.fn().mockRejectedValue(cspError)
    window.fetch = mockNativeFetch

    interceptorScript.main({} as any)

    // 调用方正常 catch 页面错误
    await expect(
      window.fetch('https://money.x.com/customer/api/device-signal'),
    ).rejects.toThrow(/violates document's CSP/)

    expect(postMessageSpy).not.toHaveBeenCalled()
  })

  it('命中排期接口时，成功 clone 并在后台派发广播', async () => {
    const scheduledPayload = {
      data: {
        viewer: {
          scheduled_tweet_list: [
            {
              rest_id: 'tweet_1',
              scheduling_info: { execute_at: 1786599999000, state: 'Scheduled' },
              tweet_create_request: { status: '新排期推文' },
            },
          ],
        },
      }
    }

    const mockResponse = new Response(JSON.stringify(scheduledPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const mockNativeFetch = vi.fn().mockResolvedValue(mockResponse)
    window.fetch = mockNativeFetch

    interceptorScript.main({} as any)

    const res = await window.fetch('https://x.com/i/api/graphql/xxx/FetchScheduledTweets')
    expect(res.status).toBe(200)

    // 等待微任务处理 clone().json()
    await vi.waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'XF_SCHEDULED_TWEETS',
          payload: [
            expect.objectContaining({
              restId: 'tweet_1',
              text: '新排期推文',
            }),
          ],
          __xf: '__x_focus_bridge_v1__',
        }),
        '*',
      )
    })
  })

  it('X 页面自己存草稿时广播当时的接口编号，同一个编号只广播一次', async () => {
    const mockNativeFetch = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    window.fetch = mockNativeFetch

    interceptorScript.main({} as any)

    await window.fetch('https://x.com/i/api/graphql/newDraftQueryId1/CreateDraftTweet', { method: 'POST' })
    await window.fetch('https://x.com/i/api/graphql/newDraftQueryId1/CreateDraftTweet', { method: 'POST' })

    const calls = postMessageSpy.mock.calls.filter(([data]: unknown[]) => (data as { type?: string })?.type === 'XF_CREATE_DRAFT_QUERY')
    expect(calls).toEqual([[{ type: 'XF_CREATE_DRAFT_QUERY', queryId: 'newDraftQueryId1', __xf: '__x_focus_bridge_v1__' }, location.origin]])
  })

  it('排期接口自身失败（reject）时，静默安全透传，不引发未捕获异常', async () => {
    const networkError = new Error('Network timeout')
    const mockNativeFetch = vi.fn().mockRejectedValue(networkError)
    window.fetch = mockNativeFetch

    interceptorScript.main({} as any)

    // 页面调用方能捕获到该错误
    await expect(
      window.fetch('https://x.com/i/api/graphql/xxx/FetchScheduledTweets'),
    ).rejects.toThrow('Network timeout')

    // 拦截器内部的 then/catch 链静默安全
    expect(postMessageSpy).not.toHaveBeenCalled()
  })
})

describe('interceptor 搜索页跳转（XF_SEARCH_NAVIGATE）', () => {
  const send = (data: Record<string, unknown>) =>
    window.dispatchEvent(new MessageEvent('message', { data: { ...data, __xf: '__x_focus_bridge_v1__' }, source: window }))

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('收到消息后在页面里换成搜索页地址；不是搜索页或扩展关闭时不处理', () => {
    interceptorScript.main({} as any)
    send({ type: 'XF_SEARCH_NAVIGATE', href: '/search?q=a&f=live', replace: false })
    expect(location.pathname + location.search).toBe('/search?q=a&f=live')

    send({ type: 'XF_SEARCH_NAVIGATE', href: '/home', replace: false })
    expect(location.pathname).toBe('/search')

    send({ type: 'XF_EXTENSION_STATUS', enabled: false })
    send({ type: 'XF_SEARCH_NAVIGATE', href: '/search?q=b&f=live', replace: true })
    expect(location.search).toBe('?q=a&f=live')
    send({ type: 'XF_EXTENSION_STATUS', enabled: true })
  })
})

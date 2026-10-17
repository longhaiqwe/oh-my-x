import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SCHEDULED_SEARCH,
  createScheduledFetcher,
  isScheduledMutationUrl,
  parseScheduledRequestUrl,
} from '../../shared/scheduled-fetcher'

const scheduledList = (items: Array<{ id: string; at: number; text: string }>) => ({
  data: {
    viewer: {
      scheduled_tweet_list: items.map((item) => ({
        rest_id: item.id,
        scheduling_info: { execute_at: item.at, state: 'Scheduled' },
        tweet_create_request: { status: item.text },
      })),
    },
  },
})

describe('排期接口地址识别', () => {
  it('识别新建、修改、删除定时帖的接口', () => {
    expect(isScheduledMutationUrl('https://x.com/i/api/graphql/abc123/CreateScheduledTweet')).toBe(true)
    expect(isScheduledMutationUrl('/i/api/graphql/abc123/EditScheduledTweet?x=1')).toBe(true)
    expect(isScheduledMutationUrl('/i/api/graphql/abc123/DeleteScheduledTweet')).toBe(true)
    expect(isScheduledMutationUrl('/i/api/graphql/abc123/FetchScheduledTweets?variables=%7B%7D')).toBe(false)
    expect(isScheduledMutationUrl('/i/api/graphql/abc123/CreateTweet')).toBe(false)
    expect(isScheduledMutationUrl('')).toBe(false)
  })

  it('从 X 的排期列表请求里取出接口编号和参数', () => {
    expect(parseScheduledRequestUrl('https://x.com/i/api/graphql/ITtjAzvlZni2wWXwf295Qg/FetchScheduledTweets?variables=%7B%22ascending%22%3Atrue%7D'))
      .toEqual({ queryId: 'ITtjAzvlZni2wWXwf295Qg', search: 'variables=%7B%22ascending%22%3Atrue%7D' })
    expect(parseScheduledRequestUrl('/i/api/graphql/abc/FetchScheduledTweets')).toEqual({ queryId: 'abc', search: DEFAULT_SCHEDULED_SEARCH })
    expect(parseScheduledRequestUrl('/i/api/graphql/abc/UserTweets?variables=%7B%7D')).toBeNull()
  })
})

describe('createScheduledFetcher', () => {
  beforeEach(() => {
    document.cookie = 'ct0=csrf-token'
  })

  const setup = (captured: { queryId: string; search: string } | null = null) => {
    const fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(scheduledList([{ id: '1', at: 1786533060000, text: '第一条' }]))))
    const resolveQueryId = vi.fn().mockResolvedValue('resolvedQid')
    const forgetCapturedRequest = vi.fn()
    const load = createScheduledFetcher({
      fetch,
      resolveQueryId,
      getHeaders: () => ({ authorization: 'Bearer captured', 'x-client-transaction-id': 'tx' }),
      getCapturedRequest: () => captured,
      forgetCapturedRequest,
    })
    return { fetch, resolveQueryId, forgetCapturedRequest, load }
  }

  it('照着 X 自己的请求读取排期，带上登录凭据', async () => {
    const { fetch, resolveQueryId, load } = setup({ queryId: 'capturedQid', search: 'variables=%7B%22ascending%22%3Atrue%7D' })
    const items = await load()
    expect(items).toEqual([{ restId: '1', timestamp: 1786533060000, text: '第一条' }])
    expect(resolveQueryId).not.toHaveBeenCalled()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${location.origin}/i/api/graphql/capturedQid/FetchScheduledTweets?variables=%7B%22ascending%22%3Atrue%7D`)
    expect(init.credentials).toBe('include')
    expect(init.headers['x-csrf-token']).toBe('csrf-token')
    expect(init.headers.authorization).toBe('Bearer captured')
  })

  it('没有记下的请求时自己找接口编号，用默认参数', async () => {
    const { fetch, resolveQueryId, load } = setup()
    await load()
    expect(resolveQueryId).toHaveBeenCalledWith('FetchScheduledTweets')
    expect(fetch.mock.calls[0][0]).toBe(`${location.origin}/i/api/graphql/resolvedQid/FetchScheduledTweets?${DEFAULT_SCHEDULED_SEARCH}`)
  })

  it('找不到接口编号时提示先打开排期列表', async () => {
    const { fetch, resolveQueryId, load } = setup()
    resolveQueryId.mockResolvedValue(null)
    await expect(load()).rejects.toThrow('打开一次排期列表')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('接口编号失效（404）时清掉记下的请求', async () => {
    const { fetch, forgetCapturedRequest, load } = setup({ queryId: 'oldQid', search: DEFAULT_SCHEDULED_SEARCH })
    fetch.mockResolvedValue(new Response('', { status: 404 }))
    await expect(load()).rejects.toThrow('404')
    expect(forgetCapturedRequest).toHaveBeenCalled()
  })

  it('被限流（429）后到解除前不再请求', async () => {
    const { fetch, load } = setup()
    fetch.mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '60' } }))
    await expect(load()).rejects.toThrow('频繁')
    await expect(load()).rejects.toThrow('频繁')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('返回的数据里没有排期列表时报错，不当成空列表', async () => {
    const { fetch, load } = setup()
    fetch.mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'failure' }] })))
    await expect(load()).rejects.toThrow('没有排期列表')
  })

  it('同时多次请求只发一次', async () => {
    const { fetch, load } = setup()
    const [a, b] = await Promise.all([load(), load()])
    expect(a).toBe(b)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

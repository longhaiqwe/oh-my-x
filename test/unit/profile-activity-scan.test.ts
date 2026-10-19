import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import interceptorScript from '../../entrypoints/interceptor.content'
import { PROFILE_ACTIVITY_FETCH_ACK_TYPE, PROFILE_ACTIVITY_FETCH_REQ_TYPE, PROFILE_ACTIVITY_FETCH_RES_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { errorText } from '../../shared/errors'

const recent = '2026-10-15T10:00:00Z'
function tweet(id: string, created_at = recent, reply = false) {
  return {
    rest_id: id,
    legacy: { created_at, ...(reply ? { in_reply_to_status_id_str: 'parent' } : {}) },
    core: { user_results: { result: { legacy: { screen_name: 'alice' } } } },
  }
}
function item(result: ReturnType<typeof tweet>) {
  return { itemContent: { tweet_results: { result } } }
}
function timeline(entries: unknown[], cursor?: string) {
  return { data: { user: { result: { timeline_v2: { timeline: { instructions: [{
    type: 'TimelineAddEntries',
    entries: [...entries, ...(cursor ? [{ entryId: 'cursor-bottom', content: { cursorType: 'Bottom', value: cursor } }] : [])],
  }] } } } } } }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

describe('profile activity scan completeness', () => {
  let nativeFetch: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>
  let receive: (event: MessageEvent) => void
  let post: MockInstance<typeof window.postMessage>
  let fetchBackup: typeof window.fetch
  let openBackup: typeof XMLHttpRequest.prototype.open
  let headerBackup: typeof XMLHttpRequest.prototype.setRequestHeader
  let sendBackup: typeof XMLHttpRequest.prototype.send

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    fetchBackup = window.fetch
    openBackup = XMLHttpRequest.prototype.open
    sendBackup = XMLHttpRequest.prototype.send
    headerBackup = XMLHttpRequest.prototype.setRequestHeader
    sessionStorage.clear()
    sessionStorage.setItem('xf_qid_v2_UserTweetsAndReplies', 'replies_query_1234567890')
    sessionStorage.setItem('xf_qid_v2_UserTweets', 'posts_query_1234567890')
    document.body.innerHTML = '<button data-testid="123-follow"></button>'
    document.cookie = 'ct0=test'
    nativeFetch = vi.fn()
    window.fetch = ((url: string, init?: RequestInit) => url.includes('/graphql/')
      ? nativeFetch(url, init) : Promise.resolve(new Response(''))) as typeof fetch
    post = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'message') receive = listener as (event: MessageEvent) => void
    })
    interceptorScript.main({} as any)
  })

  afterEach(() => {
    window.fetch = fetchBackup
    XMLHttpRequest.prototype.open = openBackup
    XMLHttpRequest.prototype.send = sendBackup
    XMLHttpRequest.prototype.setRequestHeader = headerBackup
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    sessionStorage.clear()
    document.body.innerHTML = ''
    document.cookie = 'ct0=; Max-Age=0'
  })

  async function scan() {
    receive(new MessageEvent('message', { source: window, data: {
      type: PROFILE_ACTIVITY_FETCH_REQ_TYPE, requestId: 'scan', profileHandle: 'alice', days: 7, __xf: XF_BRIDGE_MARKER,
    } }))
    for (let i = 0; i < 220; i++) {
      await vi.advanceTimersByTimeAsync(150)
      const response = post.mock.calls.find(([data]) => data.type === PROFILE_ACTIVITY_FETCH_RES_TYPE)
      if (response) return response[0]
    }
    throw new Error('Scan did not respond')
  }

  it('acknowledges the request right away so callers can tell the interceptor is present', async () => {
    nativeFetch.mockResolvedValue(json({}, 404))
    receive(new MessageEvent('message', { source: window, data: {
      type: PROFILE_ACTIVITY_FETCH_REQ_TYPE, requestId: 'scan', profileHandle: 'alice', days: 7, __xf: XF_BRIDGE_MARKER,
    } }))
    expect(post.mock.calls[0][0]).toEqual({ type: PROFILE_ACTIVITY_FETCH_ACK_TYPE, requestId: 'scan', __xf: XF_BRIDGE_MARKER })
    expect(post.mock.calls.some(([data]) => data.type === PROFILE_ACTIVITY_FETCH_RES_TYPE)).toBe(false)
    await scan()
  })

  it('captures modern XHR timelines separately and fetches posts plus replies', async () => {
    const capture = (op: string, qid: string, cursor: string) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', `https://x.com/i/api/graphql/${qid}/${op}?variables=${encodeURIComponent(JSON.stringify({ userId: '123', count: 20, cursor, withCommunity: true }))}&features=${encodeURIComponent(JSON.stringify({ actual_flag: true }))}&fieldToggles=${encodeURIComponent(JSON.stringify({ withArticlePlainText: false }))}`)
      xhr.setRequestHeader('authorization', 'Bearer current-web-token')
      xhr.setRequestHeader('x-csrf-token', 'test')
    }
    capture('UserRepliesTimeline', 'live_reply_1234567890', 'old-reply-cursor')
    capture('UserOriginalsTimeline', 'live_posts_1234567890', 'old-post-cursor')
    nativeFetch.mockImplementation(async (url: string) => {
      const parsed = new URL(url)
      const variables = JSON.parse(parsed.searchParams.get('variables')!)
      if (parsed.pathname.endsWith('/UserRepliesTimeline')) {
        return json(timeline([{ content: item(tweet(variables.cursor ? 'reply-2' : 'reply-1', recent, true)) }], variables.cursor ? undefined : 'reply-next'))
      }
      if (parsed.pathname.endsWith('/UserOriginalsTimeline')) return json(timeline([{ content: item(tweet('post')) }]))
      return json({}, 404)
    })
    const result = await scan()
    expect(result.ok).toBe(true)
    expect(result.entries.map((entry: { id: string }) => entry.id).sort()).toEqual(['post', 'reply-1', 'reply-2'])
    expect(nativeFetch).toHaveBeenCalledTimes(3)
    for (const [url, init] of nativeFetch.mock.calls) {
      const parsed = new URL(url)
      const variables = JSON.parse(parsed.searchParams.get('variables')!)
      expect(String(variables.cursor)).not.toMatch(/^old-/)
      expect(JSON.parse(parsed.searchParams.get('features')!).actual_flag).toBe(true)
      expect(JSON.parse(parsed.searchParams.get('fieldToggles')!)).toEqual({ withArticlePlainText: false })
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer current-web-token')
    }
  })

  it('does not report replies-only modern results as complete when the posts request fails', async () => {
    sessionStorage.setItem('xf_qid_v2_UserRepliesTimeline', 'live_reply_1234567890')
    sessionStorage.setItem('xf_qid_v2_UserOriginalsTimeline', 'live_posts_1234567890')
    nativeFetch.mockImplementation(async (url: string) => url.includes('/UserRepliesTimeline')
      ? json(timeline([{ content: item(tweet('reply', recent, true)) }])) : json({}, 404))
    expect(await scan()).toMatchObject({ ok: false })
    expect(nativeFetch.mock.calls.some(([url]) => url.includes('/UserRepliesTimeline'))).toBe(true)
  })

  it('shows the rate limit reset time and avoids another request during the cooldown', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600
    nativeFetch.mockImplementation(async () => new Response('', { status: 429, headers: { 'x-rate-limit-reset': String(reset) } }))
    const first = await scan()
    expect(first.ok).toBe(false)
    expect(errorText(first.error)).toContain('请求次数已用尽')
    expect(errorText(first.error)).toContain(new Date(reset * 1000).toLocaleTimeString('zh-CN', { hour12: false }))
    post.mockClear()
    const second = await scan()
    expect(second.ok).toBe(false)
    expect(nativeFetch).toHaveBeenCalledTimes(1)
  })

  it('uses the actual replies query ID instead of a stale ID cached by the old parser', async () => {
    sessionStorage.setItem('xf_qid_UserTweetsAndReplies', 'wrong_posts_1234567890')
    const script = document.createElement('script')
    script.textContent = 'const q={queryId:"correct_reply_1234567890",operationName:"UserTweetsAndReplies"}'
    document.body.append(script)
    nativeFetch.mockResolvedValue(json(timeline([])))
    expect(await scan()).toMatchObject({ ok: true })
    expect(String(nativeFetch.mock.calls[0][0])).toContain('/correct_reply_1234567890/UserTweetsAndReplies')
  })

  it('returns an error instead of partial totals when the page safety limit is reached', async () => {
    let page = 0
    nativeFetch.mockImplementation(async () => {
      page++
      return json(timeline([{ content: item(tweet(`reply-${page}`, recent, true)) }], `page-${page}`))
    })
    expect(await scan()).toMatchObject({ ok: false })
  })

  it('stops at the date boundary and deduplicates replies across pages', async () => {
    nativeFetch.mockResolvedValueOnce(json(timeline([{ content: item(tweet('reply', recent, true)) }], 'next')))
      .mockResolvedValueOnce(json(timeline([
        { content: item(tweet('reply', recent, true)) },
        { content: item(tweet('older', '2026-10-01T00:00:00Z', true)) },
      ], 'unused')))
    const result = await scan()
    expect(result.ok).toBe(true)
    expect(result.entries.filter((entry: { id: string }) => entry.id === 'reply')).toHaveLength(1)
    expect(nativeFetch).toHaveBeenCalledTimes(2)
  })

  it('does not report posts-only fallback as complete replies after the replies endpoint fails', async () => {
    nativeFetch.mockImplementation(async (url: string) => url.includes('/UserTweetsAndReplies')
      ? json({}, 404)
      : json(timeline([{ content: item(tweet('post')) }, { content: item(tweet('self-reply', recent, true)) }])))
    expect(await scan()).toMatchObject({ ok: false })
    expect(nativeFetch.mock.calls.some(([url]) => String(url).includes('/UserTweets?'))).toBe(false)
  })

  it('does not save partial results when a later replies page fails', async () => {
    nativeFetch.mockResolvedValueOnce(json(timeline([{ content: item(tweet('reply', recent, true)) }], 'next')))
      .mockResolvedValue(json({}, 429))
    expect(await scan()).toMatchObject({ ok: false })
  })

  it('continues past old self-authored conversation context to fetch subsequent replies', async () => {
    nativeFetch.mockResolvedValueOnce(json(timeline([{
      content: { entryType: 'TimelineTimelineModule', items: [
        { item: item(tweet('old-parent', '2025-01-01T00:00:00Z')) },
        { item: item(tweet('reply-1', recent, true)) },
      ] },
    }], 'next'))).mockResolvedValueOnce(json(timeline([{ content: item(tweet('reply-2', recent, true)) }])))
    const result = await scan()
    expect(result.ok).toBe(true)
    expect(result.entries.map((entry: { id: string }) => entry.id)).toContain('reply-2')
    expect(nativeFetch).toHaveBeenCalledTimes(2)
  })

  it('does not silently truncate active accounts at 15 pages', async () => {
    let page = 0
    nativeFetch.mockImplementation(async () => {
      page++
      return json(timeline([{ content: item(tweet(`reply-${page}`, recent, true)) }], page <= 15 ? `page-${page}` : undefined))
    })
    const result = await scan()
    expect(result.ok).toBe(true)
    expect(result.entries).toHaveLength(16)
  })

  it.each([
    { errors: [{ message: 'Rate limit exceeded' }] },
    { data: { user: { result: {} } } },
  ])('rejects HTTP 200 responses without a usable timeline: %j', async (payload) => {
    nativeFetch.mockResolvedValueOnce(json(timeline([{ content: item(tweet('reply', recent, true)) }], 'next')))
      .mockResolvedValue(json(payload))
    expect(await scan()).toMatchObject({ ok: false })
  })

  it('accepts a valid empty timeline as zero activity', async () => {
    nativeFetch.mockResolvedValue(json(timeline([])))
    expect(await scan()).toMatchObject({ ok: true, entries: [] })
  })

  it('reports an incomplete scan when a cursor repeats', async () => {
    nativeFetch.mockImplementation(async () => json(timeline([{ content: item(tweet('reply', recent, true)) }], 'stuck')))
    expect(await scan()).toMatchObject({ ok: false })
  })
})

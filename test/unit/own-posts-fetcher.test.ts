import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOwnPostsFetcher } from '../../shared/own-posts-fetcher'

describe('own posts fetcher', () => {
  beforeEach(() => {
    document.body.innerHTML = '<a data-testid="AppTabBar_Profile_Link" href="/me"></a>'
    document.cookie = 'ct0=csrf'
    document.cookie = 'twid=u%3D42'
  })
  const setup = () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { instructions: [] } })))
    return { fetch, load: createOwnPostsFetcher({ fetch, resolveQueryId: async op => `${op}Id`, getHeaders: () => ({ authorization: 'Bearer captured', 'x-client-transaction-id': 'captured-session-request' }), getFeatures: () => ({ articles_preview_enabled: true }) }) }
  }
  it('loads own timeline using logged-in user ID and requested cursor', async () => {
    const { fetch, load } = setup()
    await load({ handle: 'me', query: '', cursor: 'older' })
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toContain('/UserTweets')
    expect(JSON.parse(url.searchParams.get('variables')!)).toMatchObject({ userId: '42', cursor: 'older' })
  })
  it('searches own history on X, not just the loaded recent posts', async () => {
    const { fetch, load } = setup()
    await load({ handle: 'me', query: '旧文章' })
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toContain('/SearchTimeline')
    expect(JSON.parse(url.searchParams.get('variables')!)).toMatchObject({ rawQuery: 'from:me "旧文章" -filter:retweets', product: 'Latest' })
    expect(fetch.mock.calls[0][1].headers['x-client-transaction-id']).toBe('captured-session-request')
    expect(fetch.mock.calls[0][1].headers['content-type']).toBe('application/json')
  })
  it('rejects an account switch instead of fetching the wrong author', async () => {
    const { fetch, load } = setup()
    await expect(load({ handle: 'other', query: '' })).rejects.toThrow('账号')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('reports 429 and respects the server cooldown', async () => {
    const { fetch, load } = setup()
    fetch.mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '60' } }))
    await expect(load({ handle: 'me', query: '' })).rejects.toThrow('频繁')
    await expect(load({ handle: 'me', query: '' })).rejects.toThrow('频繁')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not report a GraphQL failure as an empty list', async () => {
    const { fetch, load } = setup()
    fetch.mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: 'failure' }] })))
    await expect(load({ handle: 'me', query: '' })).rejects.toThrow()
  })
  it('falls back to paginated own timeline search when X search is unavailable', async () => {
    const { fetch, load } = setup()
    const post = (id: string, text: string) => ({ __typename: 'Tweet', rest_id: id,
      core: { user_results: { result: { legacy: { screen_name: 'me' } } } }, legacy: { full_text: text } })
    fetch.mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ instructions: [
      { entries: [post('1', '关于工位的旧文章'), post('2', '其他内容'), { cursorType: 'Bottom', value: 'older' }] },
    ] })))
    const page = await load({ handle: 'me', query: '工位' })
    expect(page.posts.map(p => p.id)).toEqual(['1'])
    expect(page.source).toBe('timeline-search')
    expect(page.scanned).toBe(2)
    expect(page.cursor).toBe('xf-timeline:older')
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ instructions: [] })))
    await load({ handle: 'me', query: '工位', cursor: page.cursor! })
    const url = new URL(fetch.mock.calls[2][0])
    expect(url.pathname).toContain('/UserTweets')
    expect(JSON.parse(url.searchParams.get('variables')!)).toMatchObject({ cursor: 'older', count: 100 })
  })
})

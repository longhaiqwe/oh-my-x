import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushMicrotasks } from '../helpers/runtime-port'
import { CREATE_DRAFT_QUERY_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { KeyCreateDraftQueryId } from '../../storage-keys'
import {
  FALLBACK_CREATE_DRAFT_QUERY_ID,
  buildCreateDraftBody,
  buildDraftText,
  composeIntentUrl,
  createDraftTweet,
  parseCreatedDraftId,
  sourceLink,
} from '../../shared/selection-draft'

const headers = { authorization: 'Bearer test', 'x-csrf-token': 'csrf' }

function draftResponse(id = '2113583789578633216') {
  return new Response(JSON.stringify({ data: { tweet: { rest_id: id } } }), { status: 200 })
}

describe('右键存草稿：草稿正文', () => {
  it('选中的文字后面空一行附来源链接', () => {
    expect(buildDraftText('  第一段\r\n\r\n第二段  ', 'https://example.com/a?b=1')).toBe('第一段\n\n第二段\n\nhttps://example.com/a?b=1')
  })

  it('只附 http/https 网页的链接', () => {
    expect(sourceLink('http://example.com/')).toBe('http://example.com/')
    expect(sourceLink('chrome://extensions/')).toBe('')
    expect(sourceLink('file:///Users/me/a.html')).toBe('')
    expect(sourceLink('not a url')).toBe('')
    expect(buildDraftText('想法', 'chrome-extension://abc/page.html')).toBe('想法')
    expect(buildDraftText('想法')).toBe('想法')
  })

  it('选中的文字里已有这个链接时不再附', () => {
    expect(buildDraftText('看这里 https://example.com/', 'https://example.com/')).toBe('看这里 https://example.com/')
  })

  it('只有空白时不存', () => {
    expect(buildDraftText(' \n ', 'https://example.com/')).toBe('')
  })

  it('请求体和 X 网页存草稿时一致', () => {
    expect(JSON.parse(buildCreateDraftBody('正文\n\n链接', 'qid'))).toEqual({
      variables: {
        post_tweet_request: {
          auto_populate_reply_metadata: false,
          status: '正文\n\n链接',
          exclude_reply_user_ids: [],
          media_ids: [],
        },
      },
      queryId: 'qid',
    })
  })

  it('从返回里取出草稿编号', () => {
    expect(parseCreatedDraftId({ data: { tweet: { rest_id: '123' } } })).toBe('123')
    expect(parseCreatedDraftId({ data: { tweet: {} } })).toBeNull()
    expect(parseCreatedDraftId({ errors: [{ message: 'x' }] })).toBeNull()
    expect(parseCreatedDraftId(null)).toBeNull()
  })

  it('发帖页地址带上编码后的正文', () => {
    expect(composeIntentUrl('a b\n\nhttps://example.com/?x=1&y=2')).toBe(
      'https://x.com/intent/post?text=a%20b%0A%0Ahttps%3A%2F%2Fexample.com%2F%3Fx%3D1%26y%3D2',
    )
  })
})

describe('右键存草稿：调用 X 接口', () => {
  it('没登录 X 时不发请求', async () => {
    const fetch = vi.fn()
    await expect(createDraftTweet('正文', { fetch, getHeaders: async () => null, queryIds: ['qid'] }))
      .rejects.toMatchObject({ code: 'error.noXSession' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('用记下的编号发 POST，返回草稿编号', async () => {
    const fetch = vi.fn().mockResolvedValue(draftResponse('42'))
    await expect(createDraftTweet('正文', { fetch, getHeaders: async () => headers, queryIds: ['captured', FALLBACK_CREATE_DRAFT_QUERY_ID] }))
      .resolves.toBe('42')
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://x.com/i/api/graphql/captured/CreateDraftTweet')
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(init.headers).toMatchObject({ ...headers, 'content-type': 'application/json' })
    expect(JSON.parse(init.body).variables.post_tweet_request.status).toBe('正文')
  })

  it('编号过期（404）时换内置编号', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(draftResponse('7'))
    await expect(createDraftTweet('正文', { fetch, getHeaders: async () => headers, queryIds: ['old', FALLBACK_CREATE_DRAFT_QUERY_ID] }))
      .resolves.toBe('7')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://x.com/i/api/graphql/old/CreateDraftTweet',
      `https://x.com/i/api/graphql/${FALLBACK_CREATE_DRAFT_QUERY_ID}/CreateDraftTweet`,
    ])
  })

  it('空编号和重复编号只请求一次', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    await expect(createDraftTweet('正文', { fetch, getHeaders: async () => headers, queryIds: ['', 'same', 'same'] }))
      .rejects.toMatchObject({ code: 'error.draftHttp', params: { status: 404 } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('其他失败不换编号重试，避免重复存', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 403 }))
    await expect(createDraftTweet('正文', { fetch, getHeaders: async () => headers, queryIds: ['a', 'b'] }))
      .rejects.toMatchObject({ code: 'error.draftHttp', params: { status: 403 } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('返回里没有草稿编号时报错', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))
    await expect(createDraftTweet('正文', { fetch, getHeaders: async () => headers, queryIds: ['a'] }))
      .rejects.toMatchObject({ code: 'error.draftShape' })
  })
})

describe('右键存草稿：页面里记下接口编号', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('收到拦截器广播后写进存储；来源标记或编号格式不对时忽略', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('browser', { runtime: { id: 'test-extension' }, storage: { local: { get: vi.fn().mockResolvedValue({}), set } } })
    const { listenForCreateDraftQueryId } = await import('../../content-scripts/features/selection-draft')
    listenForCreateDraftQueryId()

    const send = (data: Record<string, unknown>) =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: CREATE_DRAFT_QUERY_TYPE, ...data }, source: window, origin: location.origin }))
    send({ queryId: 'bad id!', __xf: XF_BRIDGE_MARKER })
    send({ queryId: 'newDraftQueryId1', __xf: 'other' })
    send({ queryId: 'newDraftQueryId1', __xf: XF_BRIDGE_MARKER })
    await flushMicrotasks()

    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith({ [KeyCreateDraftQueryId]: 'newDraftQueryId1' })
  })
})

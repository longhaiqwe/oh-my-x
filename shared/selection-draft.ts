// 右键「存为 X 草稿」：把网页上选中的文字和来源网页链接存进 X 草稿箱。
// 页面拦截器（MAIN world）也引用这里的操作名，所以只依赖不带文案表的 coded-error。
import { CodedError } from './coded-error'

/** X 新建草稿的 GraphQL 操作名 */
export const CREATE_DRAFT_OPERATION = 'CreateDraftTweet'

/** 2026-10-23 从 X 网页代码里取到的接口编号。X 页面自己存草稿时拦截器会记下当时的编号，优先用记下的 */
export const FALLBACK_CREATE_DRAFT_QUERY_ID = 'cH9HZWz_EW9gnswvA4ZRiQ'

/** 右键菜单项的 id */
export const SELECTION_DRAFT_MENU_ID = 'xf-selection-draft'

const X_GRAPHQL_BASE = 'https://x.com/i/api/graphql'

/** 来源链接：只附 http/https 网页，扩展页、本地文件、浏览器内部页面不附 */
export function sourceLink(pageUrl: string | undefined): string {
  if (!pageUrl) return ''
  try {
    const url = new URL(pageUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

/** 草稿正文：选中的文字，空一行后附来源链接；选中的文字里已经有这个链接时不再附 */
export function buildDraftText(selection: string, pageUrl?: string): string {
  const text = selection.replace(/\r\n?/g, '\n').trim()
  if (!text) return ''
  const link = sourceLink(pageUrl)
  return link && !text.includes(link) ? `${text}\n\n${link}` : text
}

/** 和 X 网页存草稿时发的请求体一致（2026-10-23 实测） */
export function buildCreateDraftBody(text: string, queryId: string): string {
  return JSON.stringify({
    variables: {
      post_tweet_request: {
        auto_populate_reply_metadata: false,
        status: text,
        exclude_reply_user_ids: [],
        media_ids: [],
      },
    },
    queryId,
  })
}

/** 返回 { data: { tweet: { rest_id } } }，取出新草稿的编号 */
export function parseCreatedDraftId(json: unknown): string | null {
  const id = (json as { data?: { tweet?: { rest_id?: unknown } } } | null)?.data?.tweet?.rest_id
  return typeof id === 'string' && /^\d+$/.test(id) ? id : null
}

/** 存不进草稿箱时打开的发帖页，正文已填好 */
export function composeIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

export interface CreateDraftDependencies {
  fetch: typeof fetch
  /** 带登录凭据的请求头；没登录 X 时返回 null */
  getHeaders: () => Promise<Record<string, string> | null>
  /** 依次尝试的接口编号：先记下的，再内置的 */
  queryIds: readonly string[]
}

/** 新建一条 X 草稿，返回草稿编号 */
export async function createDraftTweet(text: string, deps: CreateDraftDependencies): Promise<string> {
  const headers = await deps.getHeaders()
  if (!headers) throw new CodedError('error.noXSession')

  let response: Response | null = null
  for (const queryId of new Set(deps.queryIds.filter(Boolean))) {
    response = await deps.fetch(`${X_GRAPHQL_BASE}/${queryId}/${CREATE_DRAFT_OPERATION}`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...headers, 'content-type': 'application/json' },
      body: buildCreateDraftBody(text, queryId),
      signal: AbortSignal.timeout(20_000),
    })
    // 400/404 多半是接口编号过期，换下一个编号
    if (response.status !== 400 && response.status !== 404) break
  }
  if (!response) throw new CodedError('error.draftEndpointMissing')
  if (!response.ok) throw new CodedError('error.draftHttp', { status: response.status })
  const id = parseCreatedDraftId(await response.json().catch(() => null))
  if (!id) throw new CodedError('error.draftShape')
  return id
}

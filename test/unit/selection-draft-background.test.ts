import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { event, flushMicrotasks } from '../helpers/runtime-port'
import { KeyCreateDraftQueryId, KeyExtensionStatus, KeySelectionDraft } from '../../storage-keys'
import { FALLBACK_CREATE_DRAFT_QUERY_ID, SELECTION_DRAFT_MENU_ID } from '../../shared/selection-draft'

let store: Record<string, unknown>
let runtime: any
let storageChanged: ReturnType<typeof event>
let contextMenus: any
let scripting: any
let action: any
let tabs: any
let fetchMock: ReturnType<typeof vi.fn>

const tab = { id: 7, index: 2, windowId: 1 }
const info = { menuItemId: SELECTION_DRAFT_MENU_ID, selectionText: '第一段 第二段', pageUrl: 'https://example.com/article', frameId: 3 }

function pick(keys: unknown) {
  if (keys == null) return { ...store }
  const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys as object)
  return Object.fromEntries(list.filter(key => key in store).map(key => [key, store[key]]))
}

function draftCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/CreateDraftTweet'))
}

async function settle() {
  await flushMicrotasks()
  await flushMicrotasks()
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  store = {}
  runtime = { id: 'test-extension', onConnect: event(), onMessage: event(), onInstalled: event(), onStartup: event(), lastError: undefined }
  storageChanged = event()
  contextMenus = {
    create: vi.fn((_props, callback) => callback?.()),
    remove: vi.fn((_id, callback) => callback?.()),
    onClicked: event(),
  }
  scripting = { executeScript: vi.fn().mockResolvedValue([{ result: '第一段\n\n第二段' }]) }
  action = { setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined), setBadgeText: vi.fn().mockResolvedValue(undefined) }
  tabs = { create: vi.fn().mockResolvedValue({}), query: vi.fn().mockResolvedValue([]), sendMessage: vi.fn() }
  vi.stubGlobal('browser', {
    runtime, contextMenus, scripting, action, tabs,
    storage: { local: { get: vi.fn(async (keys: unknown) => pick(keys)), set: vi.fn(async (items: object) => { Object.assign(store, items) }) }, onChanged: storageChanged },
    cookies: { get: vi.fn(async ({ name }: { name: string }) => (name === 'ct0' ? { value: 'csrf' } : null)) },
    alarms: { create: vi.fn(), get: vi.fn().mockResolvedValue({}), onAlarm: event() },
    permissions: { contains: vi.fn().mockResolvedValue(false) },
    downloads: { download: vi.fn() },
  })
  fetchMock = vi.fn(async (url: string) => (
    String(url).includes('/CreateDraftTweet')
      ? new Response(JSON.stringify({ data: { tweet: { rest_id: '42' } } }), { status: 200 })
      : new Response('', { status: 500 })
  ))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('defineBackground', (fn: () => void) => fn)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const background = await import('../../entrypoints/background')
  ;(background.default as unknown as () => void)()
  await settle()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('右键存草稿：菜单项', () => {
  it('安装后加上只在选中文字时出现的菜单项', async () => {
    runtime.onInstalled.emit()
    await settle()
    expect(contextMenus.remove).toHaveBeenCalledWith(SELECTION_DRAFT_MENU_ID, expect.any(Function))
    expect(contextMenus.create).toHaveBeenCalledWith(
      { id: SELECTION_DRAFT_MENU_ID, title: '存为 X 草稿', contexts: ['selection'] },
      expect.any(Function),
    )
  })

  it('功能开关或扩展总开关关掉时不加，重新打开后加上', async () => {
    store[KeySelectionDraft] = 'off'
    runtime.onStartup.emit()
    await settle()
    expect(contextMenus.create).not.toHaveBeenCalled()

    store[KeySelectionDraft] = 'on'
    store[KeyExtensionStatus] = 'off'
    storageChanged.emit({ [KeySelectionDraft]: { newValue: 'on', oldValue: 'off' } }, 'local')
    await settle()
    expect(contextMenus.create).not.toHaveBeenCalled()

    store[KeyExtensionStatus] = 'on'
    storageChanged.emit({ [KeyExtensionStatus]: { newValue: 'on', oldValue: 'off' } }, 'local')
    await settle()
    expect(contextMenus.create).toHaveBeenCalledTimes(1)
  })
})

describe('右键存草稿：点菜单项', () => {
  it('读页面里的选区（保留换行），附链接存进草稿箱，图标显示 ✓ 后去掉', async () => {
    contextMenus.onClicked.emit(info, tab)
    await settle()

    expect(scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7, frameIds: [3] } }))
    expect(draftCalls()).toHaveLength(1)
    const [url, init] = draftCalls()[0]
    expect(url).toBe(`https://x.com/i/api/graphql/${FALLBACK_CREATE_DRAFT_QUERY_ID}/CreateDraftTweet`)
    expect(init.headers['x-csrf-token']).toBe('csrf')
    expect(JSON.parse(init.body).variables.post_tweet_request.status).toBe('第一段\n\n第二段\n\nhttps://example.com/article')
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '✓' })
    expect(tabs.create).not.toHaveBeenCalled()

    vi.advanceTimersByTime(3000)
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '' })
  })

  it('页面里读不到选区时用菜单事件带的文字', async () => {
    scripting.executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'))
    contextMenus.onClicked.emit(info, tab)
    await settle()
    expect(JSON.parse(draftCalls()[0][1].body).variables.post_tweet_request.status).toBe('第一段 第二段\n\nhttps://example.com/article')
  })

  it('先用 X 页面里记下的接口编号', async () => {
    store[KeyCreateDraftQueryId] = 'capturedQueryId'
    contextMenus.onClicked.emit(info, tab)
    await settle()
    expect(draftCalls()[0][0]).toBe('https://x.com/i/api/graphql/capturedQueryId/CreateDraftTweet')
  })

  it('存不进去时在旁边打开填好正文的发帖页', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 403 }))
    contextMenus.onClicked.emit(info, tab)
    await settle()
    expect(action.setBadgeText).not.toHaveBeenCalled()
    expect(tabs.create).toHaveBeenCalledWith({
      url: `https://x.com/intent/post?text=${encodeURIComponent('第一段\n\n第二段\n\nhttps://example.com/article')}`,
      windowId: 1,
      index: 3,
    })
  })

  it('没登录 X 时不发请求，直接打开发帖页', async () => {
    ;(globalThis as any).browser.cookies.get.mockResolvedValue(null)
    contextMenus.onClicked.emit(info, tab)
    await settle()
    expect(draftCalls()).toHaveLength(0)
    expect(tabs.create).toHaveBeenCalledTimes(1)
  })

  it('不处理别的菜单项', async () => {
    contextMenus.onClicked.emit({ ...info, menuItemId: 'other' }, tab)
    await settle()
    expect(scripting.executeScript).not.toHaveBeenCalled()
    expect(draftCalls()).toHaveLength(0)
  })
})

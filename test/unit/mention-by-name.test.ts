import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MENTION_SEARCH_MESSAGE, type MentionUser } from '../../shared/mention-search'

type MentionModule = typeof import('../../content-scripts/features/mention-by-name')

const USERS: MentionUser[] = [
  { id: '1', name: '宝玉', handle: 'dotey', avatar: 'https://pbs.twimg.com/a_normal.jpg', following: true, verified: true },
  { id: '2', name: '贾宝玉', handle: 'baoyu_jia', avatar: '', following: false, verified: false },
]

// jsdom 没有剪贴板事件，按浏览器的用法补一个最小实现
class FakeDataTransfer {
  private data = new Map<string, string>()
  setData(type: string, value: string) { this.data.set(type, value) }
  getData(type: string) { return this.data.get(type) ?? '' }
}
class FakeClipboardEvent extends Event {
  clipboardData: FakeDataTransfer | null
  constructor(type: string, init: EventInit & { clipboardData?: FakeDataTransfer } = {}) {
    super(type, init)
    this.clipboardData = init.clipboardData ?? null
  }
}

let mention: MentionModule
let sendMessage: ReturnType<typeof vi.fn>
let editor: HTMLElement

/** 仿 X 编辑器：一段文字被拆成两个节点，光标放在最后 */
function setupEditor(parts: string[]) {
  document.body.innerHTML = `<div data-testid="tweetTextarea_0" contenteditable="true" tabindex="0"><div data-contents="true"><div data-block="true"><div>${
    parts.map(part => `<span><span data-text="true">${part}</span></span>`).join('')
  }</div></div></div></div>`
  editor = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!
  editor.focus()
  const nodes = editor.querySelectorAll('[data-text="true"]')
  const last = nodes[nodes.length - 1].firstChild!
  const range = document.createRange()
  range.setStart(last, last.textContent!.length)
  range.collapse(true)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function menu() {
  return document.querySelector<HTMLElement>('[data-testid="xf-mention-menu"]')
}

function options() {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')]
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  editor.dispatchEvent(event)
  return event
}

async function openMenu() {
  mention.updateMentionMenu()
  await vi.waitFor(() => expect(options()).toHaveLength(USERS.length))
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('DataTransfer', FakeDataTransfer)
  vi.stubGlobal('ClipboardEvent', FakeClipboardEvent)
  sendMessage = vi.fn(async () => ({ ok: true, users: USERS }))
  ;(globalThis as any).browser.runtime.sendMessage = sendMessage
  mention = await import('../../content-scripts/features/mention-by-name')
  mention.setMentionByNameEnabled(true)
  setupEditor(['你好 ', '@宝玉'])
})

afterEach(() => {
  mention.setMentionByNameEnabled(false)
  vi.unstubAllGlobals()
  delete (globalThis as any).browser.runtime.sendMessage
  document.body.innerHTML = ''
})

describe('按名字艾特', () => {
  it('@ 后面是中文名时查询并列出账号', async () => {
    await openMenu()
    expect(sendMessage).toHaveBeenCalledWith({ type: MENTION_SEARCH_MESSAGE, query: '宝玉' })
    expect(options()[0].textContent).toContain('宝玉')
    expect(options()[0].textContent).toContain('@dotey')
    expect(options()[0].textContent).toContain('正在关注')
    expect(options()[0].querySelector('svg')?.getAttribute('aria-label')).toBe('已认证')
    expect(options()[0].getAttribute('aria-selected')).toBe('true')
    expect(options()[1].querySelector('img')).toBeNull()
  })

  it('纯英文名不查询', () => {
    setupEditor(['@Elon'])
    mention.updateMentionMenu()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(menu()).toBeNull()
  })

  it('输入法组字期间不查询，选完字再查', async () => {
    document.dispatchEvent(new Event('compositionstart'))
    mention.updateMentionMenu()
    expect(sendMessage).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('compositionend'))
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
  })

  it('上下键换选中项，回车把「@名字」换成「@用户名 」', async () => {
    await openMenu()
    const down = press('ArrowDown')
    expect(down.defaultPrevented).toBe(true)
    expect(options()[1].getAttribute('aria-selected')).toBe('true')
    press('ArrowDown')
    expect(options()[0].getAttribute('aria-selected')).toBe('true')
    press('ArrowUp')
    expect(options()[1].getAttribute('aria-selected')).toBe('true')

    const pasted: { text: string; selected: string }[] = []
    editor.addEventListener('paste', (event) => {
      pasted.push({
        text: (event as unknown as FakeClipboardEvent).clipboardData!.getData('text/plain'),
        selected: window.getSelection()!.toString(),
      })
      event.preventDefault()
    })
    const events: string[] = []
    document.addEventListener('selectionchange', () => events.push('selectionchange'))
    editor.addEventListener('paste', () => events.push('paste'))
    const enter = press('Enter')
    expect(enter.defaultPrevented).toBe(true)
    expect(menu()).toBeNull()
    // 回车当下就替换完：先通知选区变了，再粘贴，中间没有空档让后面打的字插进来
    expect(pasted).toEqual([{ text: '@baoyu_jia ', selected: '@宝玉' }])
    expect(events).toEqual(['selectionchange', 'paste'])
  })

  it('「@名字」被拆在两个节点里时也整段选中', async () => {
    setupEditor(['你好 @', '宝玉'])
    await openMenu()
    const selected: string[] = []
    editor.addEventListener('paste', (event) => {
      selected.push(window.getSelection()!.toString())
      event.preventDefault()
    })
    press('Enter')
    await vi.waitFor(() => expect(selected).toEqual(['@宝玉']))
  })

  it('点击账号同样替换，按下鼠标时编辑器不失焦', async () => {
    await openMenu()
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    options()[0].dispatchEvent(mousedown)
    expect(mousedown.defaultPrevented).toBe(true)

    const pasted: string[] = []
    editor.addEventListener('paste', (event) => {
      pasted.push((event as unknown as FakeClipboardEvent).clipboardData!.getData('text/plain'))
      event.preventDefault()
    })
    options()[0].querySelector<HTMLElement>('.xf-mention-handle')!.click()
    await vi.waitFor(() => expect(pasted).toEqual(['@dotey ']))
  })

  it('Esc 只关候选框，同一个名字不再弹出', async () => {
    await openMenu()
    const esc = press('Escape')
    expect(esc.defaultPrevented).toBe(true)
    expect(menu()).toBeNull()
    mention.updateMentionMenu()
    expect(menu()).toBeNull()
  })

  it('带 ⌘ 的回车留给 X 发帖', async () => {
    await openMenu()
    expect(press('Enter', { metaKey: true }).defaultPrevented).toBe(false)
    expect(menu()).not.toBeNull()
  })

  it('同一个名字再查时用缓存', async () => {
    await openMenu()
    press('Escape')
    setupEditor(['@宝'])
    mention.updateMentionMenu()
    setupEditor(['@宝玉'])
    mention.updateMentionMenu()
    expect(options()).toHaveLength(USERS.length)
    expect(sendMessage.mock.calls.map(call => call[0].query)).toEqual(['宝玉', '宝'])
  })

  it('查询失败时显示报错', async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: { code: 'error.mentionSearchHttp', params: { status: 429 } } })
    mention.updateMentionMenu()
    await vi.waitFor(() => expect(menu()?.textContent).toContain('查找账号失败 (HTTP 429)'))
  })

  it('没有结果时提示没找到', async () => {
    sendMessage.mockResolvedValueOnce({ ok: true, users: [] })
    mention.updateMentionMenu()
    await vi.waitFor(() => expect(menu()?.textContent).toContain('没有找到「宝玉」'))
    expect(press('Enter').defaultPrevented).toBe(false)
  })

  it('关掉开关后移除候选框，按键不再拦截', async () => {
    await openMenu()
    mention.setMentionByNameEnabled(false)
    expect(menu()).toBeNull()
    expect(press('ArrowDown').defaultPrevented).toBe(false)
  })
})

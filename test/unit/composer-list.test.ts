import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toggleBulletsInSelection, initComposerLists } from '../../content-scripts/options/composer-list'
import { addComposerInsertLinkButton } from '../../content-scripts/options/composer'

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

let dispose = () => {}
let editor: HTMLElement
let pastes: string[]
let replaceNodes = false

function setup(lines: string[], inline = false) {
  document.body.innerHTML = `<div ${inline ? '' : 'role="dialog" aria-labelledby="modal-header"'}><div class="DraftEditor-editorContainer"><div data-testid="tweetTextarea_0" contenteditable="true" tabindex="0"><div data-contents="true">${lines.map(line => `<div data-block="true"><span>${line}</span></div>`).join('')}</div></div></div><div role="tablist"></div>${inline ? '<button data-testid="tweetButtonInline">Post</button>' : ''}</div>`
  editor = document.querySelector<HTMLElement>('[contenteditable]')!
  editor.focus()
  // 模拟 DraftJS 的粘贴接收端；只插入选区处，不替换格式节点。
  editor.addEventListener('paste', event => {
    const text = (event as unknown as FakeClipboardEvent).clipboardData!.getData('text/plain')
    pastes.push(text)
    const range = window.getSelection()!.getRangeAt(0)
    range.deleteContents()
    expect((event as ClipboardEvent & { __xfHandled?: boolean }).__xfHandled).toBe(true)
    range.insertNode(document.createTextNode(text))
    event.preventDefault()
    if (replaceNodes) editor.innerHTML = editor.innerHTML
  })
  editor.addEventListener('cut', event => {
    const range = window.getSelection()!.getRangeAt(0)
    expect(range.collapsed).toBe(false)
    range.deleteContents()
    event.preventDefault()
    if (replaceNodes) editor.innerHTML = editor.innerHTML
  })
  addComposerInsertLinkButton()
}

function blocks() { return [...editor.querySelectorAll<HTMLElement>('[data-block]')] }
function texts() { return blocks().map(block => block.textContent) }
function select(start: number, startOffset: number, end: number, endOffset: number) {
  const range = document.createRange()
  const first = blocks()[start].querySelector('span')!.firstChild!
  const last = blocks()[end].querySelector('span')!.firstChild!
  range.setStart(first, startOffset)
  range.setEnd(last, endOffset)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  return range
}
function all() {
  const range = document.createRange()
  range.selectNodeContents(editor)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  return range
}

function nativeToolbar() {
  const toolbar = document.createElement('div')
  toolbar.style.position = 'fixed'
  toolbar.innerHTML = '<button aria-label="Bold"><svg><path d="M15.636 11.671"></path></svg></button><button aria-label="Italic" class="native-format-button"><div class="native-icon-wrapper"><svg class="native-format-icon" viewBox="0 0 24 24"><path d="M9 6h3.731L9.184 18H5v2h10v-2h-3.731l3.547-12H19V4H9v2z"></path></svg></div></button>'
  document.body.appendChild(toolbar)
  return toolbar
}

beforeEach(() => {
  vi.stubGlobal('DataTransfer', FakeDataTransfer)
  vi.stubGlobal('ClipboardEvent', FakeClipboardEvent)
  pastes = []
  replaceNodes = false
  dispose = initComposerLists()
})

afterEach(() => {
  dispose()
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('发帖列表', () => {
  it('混合选区的首尾已有圆点时补齐中间行，再次点击取消整个选区', async () => {
    setup(['• 首行', '中间行', '• 尾行'])
    await toggleBulletsInSelection({ editor, range: all() })
    expect(texts()).toEqual(['• 首行', '• 中间行', '• 尾行'])
    await toggleBulletsInSelection({ editor, range: window.getSelection()!.getRangeAt(0).cloneRange() })
    expect(texts()).toEqual(['首行', '中间行', '尾行'])
    await toggleBulletsInSelection({ editor, range: window.getSelection()!.getRangeAt(0).cloneRange() })
    expect(texts()).toEqual(['• 首行', '• 中间行', '• 尾行'])
  })

  it('取消列表只删除行首圆点和一个分隔空格，保留缩进、正文圆点和空行', async () => {
    setup(['  •  缩进 • 正文', '', '•无空格', '•'])
    expect(await toggleBulletsInSelection({ editor, range: all() })).toBe(true)
    expect(texts()).toEqual(['   缩进 • 正文', '', '无空格', ''])
  })

  it('取消部分列表时不改选区外的行，选区终点在下一行开头时不含该行', async () => {
    setup(['• 第一行', '• 第二行', '• 第三行'])
    await toggleBulletsInSelection({ editor, range: select(1, 2, 2, 0) })
    expect(texts()).toEqual(['• 第一行', '第二行', '• 第三行'])
  })

  it('只给选区涉及的整行添加圆点，跳过空行和已有圆点；再次点击统一取消', async () => {
    setup(['之前', '第一行', '', '• 已有项目', '最后一行', '之后'])
    const range = select(1, 1, 4, 2)
    expect(await toggleBulletsInSelection({ editor, range })).toBe(true)
    expect(texts()).toEqual(['之前', '• 第一行', '', '• 已有项目', '• 最后一行', '之后'])
    const next = window.getSelection()!.getRangeAt(0).cloneRange()
    await toggleBulletsInSelection({ editor, range: next })
    expect(texts()).toEqual(['之前', '第一行', '', '已有项目', '最后一行', '之后'])
  })

  it('选区在下一行开头结束时不改下一行', async () => {
    setup(['第一行', '第二行', '第三行'])
    await toggleBulletsInSelection({ editor, range: select(0, 1, 2, 0) })
    expect(texts()).toEqual(['• 第一行', '• 第二行', '第三行'])
  })

  it('段落被重新渲染后仍逐行插入，保留加粗、斜体和链接节点', async () => {
    setup(['<b>加粗</b>和<i>斜体</i>', '<a href="https://x.com/example">@example</a> 链接'])
    replaceNodes = true
    expect(await toggleBulletsInSelection({ editor, range: all() })).toBe(true)
    expect(texts()).toEqual(['• 加粗和斜体', '• @example 链接'])
    expect(editor.querySelector('b')?.textContent).toContain('加粗')
    expect(editor.querySelector('i')?.textContent).toBe('斜体')
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://x.com/example')
    expect(await toggleBulletsInSelection({ editor, range: window.getSelection()!.getRangeAt(0).cloneRange() })).toBe(true)
    expect(texts()).toEqual(['加粗和斜体', '@example 链接'])
    expect(editor.querySelector('b')?.textContent).toBe('加粗')
    expect(editor.querySelector('i')?.textContent).toBe('斜体')
    expect(editor.querySelector('a')?.textContent).toBe('@example')
  })

  it('无选区时处理光标所在行，支持段落中的显式换行和缩进', async () => {
    setup(['第一行\n  第二行\n第三行'])
    await toggleBulletsInSelection({ editor, range: select(0, 7, 0, 7) })
    expect(texts()).toEqual(['第一行\n  • 第二行\n第三行'])
    await toggleBulletsInSelection({ editor, range: window.getSelection()!.getRangeAt(0).cloneRange() })
    expect(texts()).toEqual(['第一行\n  第二行\n第三行'])
  })

  it('长段落的视觉折行不生成额外列表项', async () => {
    setup(['这是一个可能在窄窗口中显示为多行的段落'.repeat(10)])
    await toggleBulletsInSelection({ editor, range: all() })
    expect(pastes).toEqual(['• '])
  })

  it('浮层和底部工具栏只提供圆点、编号，不再生成不稳定的格式入口', () => {
    setup(['正文'])
    const toolbar = nativeToolbar()
    all()
    document.dispatchEvent(new Event('selectionchange'))
    const formats = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-xf-composer-format]')].map(button => button.dataset.xfComposerFormat)
    expect(formats(toolbar)).toEqual(['bullet', 'number'])
    expect(formats(document.querySelector('[role="tablist"]')!)).toEqual(['bullet', 'number'])
  })

  it('编辑器未处理粘贴时不直接改 DOM 冒充写入成功', async () => {
    setup(['第一行', '第二行'])
    const original = editor.cloneNode(true) as HTMLElement
    editor.replaceWith(original)
    editor = original
    const command = vi.fn(() => false)
    Object.defineProperty(document, 'execCommand', { value: command, configurable: true })
    expect(await toggleBulletsInSelection({ editor, range: all() })).toBe(false)
    expect(texts()).toEqual(['第一行', '第二行'])
    expect(command).toHaveBeenCalledWith('insertText', false, '• ')
    delete (document as unknown as { execCommand?: unknown }).execCommand
  })

  it('粘贴被取消但正文没有更新时停止后续操作', async () => {
    setup(['第一行', '第二行'])
    const replacement = editor.cloneNode(true) as HTMLElement
    editor.replaceWith(replacement)
    editor = replacement
    const paste = vi.fn((event: Event) => event.preventDefault())
    editor.addEventListener('paste', paste)
    expect(await toggleBulletsInSelection({ editor, range: all() })).toBe(false)
    expect(paste).toHaveBeenCalledTimes(1)
    expect(texts()).toEqual(['第一行', '第二行'])
  })

  it('插入前同步 selectionchange，编辑过程中其他正文变化会停止后续插入', async () => {
    setup(['第一行', '第二行'])
    const events: string[] = []
    const onSelection = () => events.push('selection')
    document.addEventListener('selectionchange', onSelection)
    editor.addEventListener('paste', () => {
      events.push('paste')
      blocks()[0].textContent = '用户的新内容'
    })
    expect(await toggleBulletsInSelection({ editor, range: all() })).toBe(false)
    expect(events.slice(0, 2)).toEqual(['selection', 'paste'])
    expect(texts()).toEqual(['用户的新内容', '• 第二行'])
    document.removeEventListener('selectionchange', onSelection)
  })

  it.each([false, true])('工具栏按钮保留选区且不重复注入（内联：%s）', async inline => {
    setup(['第一行', '第二行'], inline)
    addComposerInsertLinkButton()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-testid="xf-composer-list-button"]')
    expect(buttons).toHaveLength(1)
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    buttons[0].dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    buttons[0].click()
    await vi.waitFor(() => expect(buttons[0].disabled).toBe(false))
    expect(texts()).toEqual(['• 第一行', '• 第二行'])
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    expect(buttons[0].getAttribute('aria-label')).toBe('取消列表')
    buttons[0].click()
    await vi.waitFor(() => expect(buttons[0].disabled).toBe(false))
    expect(texts()).toEqual(['第一行', '第二行'])
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
    expect(buttons[0].getAttribute('aria-label')).toBe('添加列表')
  })

  it('多编辑器时不会修改另一个发帖框', async () => {
    setup(['第一行'])
    const firstButton = document.querySelector<HTMLButtonElement>('[data-testid="xf-composer-list-button"]')!
    const other = editor.cloneNode(true) as HTMLElement
    document.body.appendChild(other)
    const range = document.createRange()
    range.selectNodeContents(other)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    firstButton.click()
    expect(pastes).toEqual([])
    expect(texts()).toEqual(['第一行'])
  })

  it('仅在编辑器内选中文字时显示快捷入口，输入法组字和关闭弹窗时移除', async () => {
    setup(['第一行', '第二行'])
    nativeToolbar()
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    expect(document.querySelector('[data-testid="xf-selection-list-button"]')).not.toBeNull()
    document.dispatchEvent(new Event('compositionstart'))
    expect(document.querySelector('[data-testid="xf-selection-list-button"]')).toBeNull()
    document.dispatchEvent(new Event('compositionend'))
    expect(document.querySelector('[data-testid="xf-selection-list-button"]')).not.toBeNull()
    editor.closest('[role="dialog"]')!.remove()
    await vi.waitFor(() => expect(document.querySelector('[data-testid="xf-selection-list-button"]')).toBeNull())
  })

  it('列表按钮位于原生斜体之后，复用按钮样式，点击后正常添加列表', async () => {
    setup(['第一行', '第二行'])
    const toolbar = nativeToolbar()
    const italic = toolbar.lastElementChild as HTMLButtonElement
    const nativeClick = vi.fn()
    italic.addEventListener('click', nativeClick)
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    const button = toolbar.querySelector<HTMLButtonElement>('[data-testid="xf-selection-list-button"]')!
    expect([...toolbar.children].map(child => child.getAttribute('aria-label'))).toEqual(['Bold', 'Italic', '添加列表', '添加编号列表'])
    expect(button.dataset.testid).toBe('xf-selection-list-button')
    expect(button.className).toBe(italic.className)
    expect(button.querySelector('svg')?.getAttribute('class')).toBe('native-format-icon')
    expect(button.style.position).toBe('')
    expect(document.body.querySelector(':scope > [data-testid="xf-selection-list-button"]')).toBeNull()
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(texts()).toEqual(['• 第一行', '• 第二行'])
    expect(nativeClick).not.toHaveBeenCalled()
  })

  it('没有原生浮层时不显示独立按钮，原生浮层延迟出现后补上', async () => {
    setup(['第一行', '第二行'])
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    expect(document.querySelector('[data-testid="xf-selection-list-button"]')).toBeNull()
    const toolbar = nativeToolbar()
    await vi.waitFor(() => expect(toolbar.children).toHaveLength(4))
  })

  it.each([
    ['bullet', ['• 第一行', '• 第二行']],
    ['number', ['1. 第一行', '2. 第二行']],
  ] as const)('%s 原生浮层重建后可不重选文字连续添加、取消、再添加', async (format, formatted) => {
    setup(['第一行', '第二行'])
    let toolbar = nativeToolbar()
    const nativeBold = vi.fn()
    const nativeItalic = vi.fn()
    const removeOnCaret = () => {
      if (window.getSelection()?.isCollapsed) toolbar.remove()
    }
    document.addEventListener('selectionchange', removeOnCaret)
    const reopen = vi.fn(() => {
      expect(window.getSelection()?.isCollapsed).toBe(false)
      toolbar.remove()
      toolbar = nativeToolbar()
      toolbar.children[0].addEventListener('click', nativeBold)
      toolbar.children[1].addEventListener('click', nativeItalic)
    })
    editor.addEventListener('mouseup', reopen)
    editor.addEventListener('paste', () => toolbar.remove())
    editor.addEventListener('cut', () => toolbar.remove())
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    try {
      for (const listed of [true, false, true]) {
        const button = toolbar.querySelector<HTMLButtonElement>(`[data-xf-composer-format="${format}"]`)!
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        button.click()
        await vi.waitFor(() => {
          expect(toolbar.isConnected).toBe(true)
          expect(toolbar.children).toHaveLength(4)
          expect(toolbar.querySelector(`[data-xf-composer-format="${format}"]`)?.getAttribute('aria-pressed')).toBe(String(listed))
        })
        expect(texts()).toEqual(listed ? formatted : ['第一行', '第二行'])
      }
      expect(reopen).toHaveBeenCalledTimes(3)
      ;(toolbar.children[0] as HTMLButtonElement).click()
      ;(toolbar.children[1] as HTMLButtonElement).click()
      expect(nativeBold).toHaveBeenCalledOnce()
      expect(nativeItalic).toHaveBeenCalledOnce()
      const selection = window.getSelection()!
      selection.collapseToEnd()
      document.dispatchEvent(new Event('selectionchange'))
      expect(document.querySelector('[data-testid="xf-selection-list-button"]')).toBeNull()
    } finally {
      document.removeEventListener('selectionchange', removeOnCaret)
    }
  })

  it('编辑期间不会因为临时光标主动移除原生工具栏里的列表按钮', async () => {
    setup(['第一行', '第二行'])
    const toolbar = nativeToolbar()
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    const button = toolbar.querySelector<HTMLButtonElement>('[data-testid="xf-selection-list-button"]')!
    const duringPaste = vi.fn(() => expect(button.parentElement).toBe(toolbar))
    editor.addEventListener('paste', duringPaste)
    await toggleBulletsInSelection({ editor, range: window.getSelection()!.getRangeAt(0).cloneRange() })
    expect(duringPaste).toHaveBeenCalledTimes(2)
    expect(toolbar.querySelector('[data-testid="xf-selection-list-button"]')).toBe(button)
  })

  it('原生工具栏重绘后恢复按钮，多次选区事件不重复注入', async () => {
    setup(['第一行', '第二行'])
    const toolbar = nativeToolbar()
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    document.dispatchEvent(new Event('selectionchange'))
    expect(toolbar.children).toHaveLength(4)
    toolbar.lastElementChild!.remove()
    await vi.waitFor(() => expect(toolbar.children).toHaveLength(4))
    toolbar.remove()
    const replacement = nativeToolbar()
    await vi.waitFor(() => expect(replacement.children).toHaveLength(4))
    expect(document.querySelectorAll('[data-testid="xf-selection-list-button"]')).toHaveLength(1)
  })

  it('不向文章内的格式按钮注入列表入口', () => {
    setup(['第一行', '第二行'])
    const toolbar = nativeToolbar()
    editor.parentElement!.appendChild(toolbar)
    select(0, 0, 1, 3)
    document.dispatchEvent(new Event('selectionchange'))
    expect(toolbar.children).toHaveLength(2)
    expect(document.querySelector('[data-testid="xf-selection-list-button"]')).toBeNull()
  })
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { handleGifPaste } from '../../content-scripts/features/gif-clipboard'

class Transfer {
  private data = new Map<string, string>()
  files: File[] = []
  items = { add: (file: File) => this.files.push(file) }
  setData(type: string, value: string) { this.data.set(type, value) }
  getData(type: string) { return this.data.get(type) || '' }
}
class Paste extends Event {
  clipboardData: Transfer
  constructor(type: string, init: EventInit & { clipboardData: Transfer }) { super(type, init); this.clipboardData = init.clipboardData }
}
const html = '<img data-oh-my-x-gif="1" src="data:image/gif;base64,R0lGODlhAQABAAAAADs=">'

beforeEach(() => {
  vi.stubGlobal('DataTransfer', Transfer)
  vi.stubGlobal('ClipboardEvent', Paste)
  vi.useFakeTimers()
  window.addEventListener('paste', handleGifPaste as EventListener, true)
})
afterEach(() => {
  window.removeEventListener('paste', handleGifPaste as EventListener, true)
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function paste(markup: string, value = html) {
  document.body.innerHTML = markup
  const editor = document.body.firstElementChild as HTMLElement
  const received: File[] = []
  editor.addEventListener('paste', ev => {
    const event = ev as unknown as Paste
    if (event.clipboardData.files.length) { received.push(...event.clipboardData.files); ev.preventDefault() }
  })
  const data = new Transfer()
  data.setData('text/html', value)
  const event = new Paste('paste', { clipboardData: data, bubbles: true, cancelable: true })
  editor.dispatchEvent(event)
  return { event, received }
}

it('X 发帖框接收真实 GIF File，原始 HTML 不插入正文', () => {
  const { event, received } = paste('<div data-testid="tweetTextarea_0" contenteditable="true"></div>')
  expect(event.defaultPrevented).toBe(true)
  expect(received).toHaveLength(1)
  expect(received[0].type).toBe('image/gif')
  expect(received[0].size).toBe(14)
  expect(document.querySelector('#xf-gif-paste-status')).toBeNull()
})

it('非发帖框不拦截，普通 HTML 也不拦截', () => {
  expect(paste('<div contenteditable="true"></div>').event.defaultPrevented).toBe(false)
  expect(paste('<div data-testid="tweetTextarea_0" contenteditable="true"></div>', '<p>文字</p>').event.defaultPrevented).toBe(false)
})

it('坏数据只提示失败，不作为附件上传', () => {
  const result = paste('<div data-testid="tweetTextarea_0" contenteditable="true"></div>', '<img data-oh-my-x-gif="1" src="data:image/gif;base64,YmFk">')
  expect(result.received).toHaveLength(0)
  expect(document.querySelector('[role="alert"]')).not.toBeNull()
})

import { expect, it, vi } from 'vitest'
import { gifClipboardHtml, gifFileFromClipboardHtml, copyGifToClipboard } from '../../shared/gif-clipboard'

const gif = new Blob([new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 59])], { type: 'image/gif' })

it('剪贴板 HTML 可还原原始 GIF 字节，不转换成 PNG', async () => {
  const html = await gifClipboardHtml(gif)
  const file = gifFileFromClipboardHtml(html)
  expect(file?.type).toBe('image/gif')
  expect(file?.name).toBe('oh-my-x.gif')
  expect(file?.size).toBe(gif.size)
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file!)
  })
  expect(new Uint8Array(bytes).slice(0, 6)).toEqual(new Uint8Array([71, 73, 70, 56, 57, 97]))
})

it('忽略普通 HTML 和外部图片，拒绝伪装 GIF', () => {
  expect(gifFileFromClipboardHtml('<p>hello</p>')).toBeNull()
  expect(gifFileFromClipboardHtml('<img src="https://example.com/a.gif">')).toBeNull()
  expect(() => gifFileFromClipboardHtml('<img data-oh-my-x-gif="1" src="data:image/gif;base64,aGVsbG8=">')).toThrow()
  expect(() => gifFileFromClipboardHtml('<img data-oh-my-x-gif="1" src="https://example.com/a.gif">')).toThrow()
})

it('复制在点击任务内调用 Clipboard.write，不申请读取权限', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  class Item { constructor(public data: Record<string, Blob | Promise<Blob>>) {} }
  vi.stubGlobal('ClipboardItem', Item)
  const promise = copyGifToClipboard(gif, { write } as unknown as Clipboard)
  expect(write).toHaveBeenCalledTimes(1)
  const item = write.mock.calls[0][0][0] as Item
  expect(item.data['text/html']).toBeInstanceOf(Promise)
  expect(item.data['image/png']).toBeUndefined()
  await promise
  await item.data['text/html']
  vi.unstubAllGlobals()
})

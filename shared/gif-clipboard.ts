import { AppError } from './errors'

// HTML 是标准剪贴板格式；完整 GIF 保存在 data URL 中，粘贴时还原为 File。
// 不使用 image/png，避免浏览器把动画压成单帧，也不读取系统剪贴板。
const MAX_COPY_BYTES = 15 * 1024 * 1024
const MARKER = 'data-oh-my-x-gif'

export function gifClipboardHtml(gif: Blob): Promise<string> {
  if (gif.type !== 'image/gif' || gif.size > MAX_COPY_BYTES) return Promise.reject(new AppError('error.gifCopyTooLarge'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(`<img ${MARKER}="1" src="${reader.result}" alt="oh-my-x GIF" />`)
    reader.onerror = () => reject(new AppError('error.gifCopyFailed'))
    reader.readAsDataURL(gif)
  })
}

export async function copyGifToClipboard(gif: Blob, clipboard: Clipboard = navigator.clipboard): Promise<void> {
  if (!clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.reject(new AppError('error.gifCopyFailed'))
  if (gif.size > MAX_COPY_BYTES) return Promise.reject(new AppError('error.gifCopyTooLarge'))
  // Promise<Blob> 保留按钮点击时的用户激活，不等 FileReader 完成再调用 write。
  return clipboard.write([new ClipboardItem({
    'text/html': gifClipboardHtml(gif).then(html => new Blob([html], { type: 'text/html' })),
    'text/plain': new Blob(['oh-my-x GIF'], { type: 'text/plain' }),
  })])
}

export function gifFileFromClipboardHtml(html: string): File | null {
  if (!html.includes(MARKER)) return null
  if (html.length > MAX_COPY_BYTES * 4 / 3 + 4096) throw new AppError('error.gifCopyTooLarge')
  // template 不挂进页面，不执行 HTML，也不加载其中的远端资源。
  const template = document.createElement('template')
  template.innerHTML = html
  const image = template.content.querySelector<HTMLImageElement>(`img[${MARKER}="1"]`)
  if (!image) return null
  const src = image.getAttribute('src') || ''
  if (!src.startsWith('data:image/gif;base64,')) throw new AppError('error.gifPasteFailed')
  let raw: string
  try { raw = atob(src.slice('data:image/gif;base64,'.length)) } catch { throw new AppError('error.gifPasteFailed') }
  if (raw.length > MAX_COPY_BYTES) throw new AppError('error.gifCopyTooLarge')
  if (!/^GIF8[79]a/.test(raw) || raw.length < 14) throw new AppError('error.gifPasteFailed')
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0))
  return new File([bytes], 'oh-my-x.gif', { type: 'image/gif' })
}

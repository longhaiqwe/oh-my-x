import { gifFileFromClipboardHtml } from '../../shared/gif-clipboard'
import { AppError, errorText } from '../../shared/errors'

let attached = false
let feedbackTimer: ReturnType<typeof setTimeout> | undefined

function showError(error: unknown) {
  document.getElementById('xf-gif-paste-status')?.remove()
  clearTimeout(feedbackTimer)
  const status = document.createElement('div')
  status.id = 'xf-gif-paste-status'
  status.setAttribute('role', 'alert')
  status.textContent = errorText(error, 'error.gifPasteFailed')
  Object.assign(status.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '2147483647', maxWidth: 'min(480px, 90vw)', padding: '12px 18px',
    borderRadius: '8px', background: '#20262d', color: '#fff', font: '14px/1.5 system-ui',
  })
  document.body.append(status)
  feedbackTimer = setTimeout(() => status.remove(), 8000)
}

export function initGifClipboardPaste() {
  if (attached) return
  attached = true
  window.addEventListener('paste', handleGifPaste, true)
}

export function handleGifPaste(event: ClipboardEvent) {
  if ((event as ClipboardEvent & { __xfHandled?: boolean }).__xfHandled) return
  const target = event.target instanceof Element ? event.target : null
  const editor = target?.closest<HTMLElement>('[contenteditable="true"][data-testid^="tweetTextarea"]')
  if (!editor || !event.clipboardData) return
  // 有原生文件时直接使用 X 的原生粘贴，普通内容也不处理。
  if (event.clipboardData.files.length) return
  const html = event.clipboardData.getData('text/html')
  if (!html.includes('data-oh-my-x-gif')) return
  event.preventDefault()
  event.stopImmediatePropagation()
  try {
    const file = gifFileFromClipboardHtml(html)
    if (!file) throw new AppError('error.gifPasteFailed')
    const data = new DataTransfer()
    data.items.add(file)
    const paste = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true })
    ;(paste as ClipboardEvent & { __xfHandled?: boolean }).__xfHandled = true
    // DraftJS 的文件粘贴处理器消费该事件，并按附件上传；不触发发帖。
    if (editor.dispatchEvent(paste)) throw new AppError('error.gifPasteFailed')
  } catch (error) {
    showError(error)
  }
}

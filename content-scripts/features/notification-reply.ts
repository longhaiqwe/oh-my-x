import { getNotificationAccount } from './notification-parser'

const KEY = 'xf.notificationReplyTarget'
const TTL = 15_000
type ReplyTarget = { path: string; account: string; expires: number }
let pending: ReplyTarget | null = null
let observer: MutationObserver | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export function cancelNotificationReply() {
  observer?.disconnect(); observer = null
  if (timer) clearTimeout(timer)
  timer = null; pending = null
  window.removeEventListener('popstate', focusReply)
  try { sessionStorage.removeItem(KEY) } catch {}
}

function focusReply() {
  if (!pending) return
  const owner = getNotificationAccount()
  if (Date.now() >= pending.expires || (owner && owner !== pending.account)) { cancelNotificationReply(); return }
  if (location.pathname !== pending.path) {
    if (!location.pathname.startsWith('/notifications')) cancelNotificationReply()
    return
  }
  if (!owner) return
  const primary = document.querySelector('[data-testid="primaryColumn"]')
  const editor = [...(primary?.querySelectorAll<HTMLElement>('[data-testid="tweetTextarea_0"][contenteditable="true"], [data-testid="inlineReplyComposer"] [contenteditable="true"]') || [])]
    .find(el => !el.closest('[role="dialog"], [data-xf-notification-hidden], [aria-hidden="true"]') && el.getClientRects().length > 0)
  if (!editor) return
  // 使用帖子页现有输入框，保留 oh-my-x 在该编辑器上注入的所有增强。
  cancelNotificationReply()
  editor.scrollIntoView({ block: 'center', behavior: 'auto' })
  editor.focus({ preventScroll: true })
}

/** 跨完整页面导航只暂存目标和账号，不保存回复正文；完成、离开或超时即清除。 */
export function resumeNotificationReply() {
  if (!pending) {
    try {
      const value = JSON.parse(sessionStorage.getItem(KEY) || 'null')
      if (!value || typeof value.path !== 'string' || !/^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(value.path)
        || typeof value.account !== 'string' || !Number.isFinite(value.expires) || value.expires > Date.now() + TTL) {
        cancelNotificationReply(); return
      }
      pending = value
    } catch { cancelNotificationReply(); return }
  }
  if (!observer) {
    observer = new MutationObserver(focusReply)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'style'] })
    timer = setTimeout(cancelNotificationReply, Math.max(0, pending!.expires - Date.now()))
    window.addEventListener('popstate', focusReply)
  }
  focusReply()
}

export function prepareNotificationReply(url: string, account: string) {
  const path = new URL(url).pathname
  cancelNotificationReply()
  pending = { path, account, expires: Date.now() + TTL }
  try { sessionStorage.setItem(KEY, JSON.stringify(pending)) } catch {}
  resumeNotificationReply()
}

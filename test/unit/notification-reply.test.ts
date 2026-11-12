// @vitest-environment-options {"url":"https://x.com"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelNotificationReply, prepareNotificationReply, resumeNotificationReply } from '../../content-scripts/features/notification-reply'

const key = 'xf.notificationReplyTarget'
function editor(dialog = false) {
  const wrap = document.createElement('div')
  if (dialog) wrap.setAttribute('role', 'dialog')
  wrap.innerHTML = '<div data-testid="tweetTextarea_0" contenteditable="true" tabindex="0"></div>'
  document.querySelector('main')!.append(wrap)
  const input = wrap.firstElementChild as HTMLElement
  input.getClientRects = () => [new DOMRect(0, 0, 200, 60)] as unknown as DOMRectList
  input.scrollIntoView = vi.fn()
  return input
}
beforeEach(() => {
  cancelNotificationReply()
  document.body.innerHTML = '<nav><a data-testid="AppTabBar_Profile_Link" href="/me"></a></nav><main data-testid="primaryColumn"></main>'
  history.replaceState({}, '', '/notifications')
})
afterEach(() => { cancelNotificationReply(); vi.useRealTimers() })

describe('从通知进入帖子回复', () => {
  it('等待目标帖子页的内联输入框，不使用已有弹窗', async () => {
    const dialog = editor(true)
    prepareNotificationReply('https://x.com/alice/status/123', 'handle:me')
    history.replaceState({}, '', '/alice/status/123')
    const input = editor()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.activeElement).toBe(input)
    expect(document.activeElement).not.toBe(dialog)
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
    expect(sessionStorage.getItem(key)).toBeNull()
  })
  it('完整页面导航后恢复目标，只定位一次，不清空用户输入', () => {
    history.replaceState({}, '', '/alice/status/123')
    sessionStorage.setItem(key, JSON.stringify({ path: '/alice/status/123', account: 'handle:me', expires: Date.now() + 10000 }))
    const input = editor()
    input.textContent = '已输入的回复'
    resumeNotificationReply(); resumeNotificationReply()
    expect(document.activeElement).toBe(input)
    expect(input.textContent).toBe('已输入的回复')
    expect(input.scrollIntoView).toHaveBeenCalledTimes(1)
  })
  it.each(['account', 'route', 'expired'])('%s 变化后取消定位，避免跳到错误输入框', condition => {
    prepareNotificationReply('https://x.com/alice/status/123', 'handle:me')
    history.replaceState({}, '', condition === 'route' ? '/bob/status/456' : '/alice/status/123')
    if (condition === 'account') document.querySelector('nav a')!.setAttribute('href', '/other')
    if (condition === 'expired') { vi.useFakeTimers(); vi.setSystemTime(Date.now() + 16000) }
    const input = editor()
    resumeNotificationReply()
    expect(document.activeElement).not.toBe(input)
    expect(sessionStorage.getItem(key)).toBeNull()
  })
  it('输入框未出现时超时清理等待状态', () => {
    vi.useFakeTimers()
    prepareNotificationReply('https://x.com/alice/status/123', 'handle:me')
    vi.advanceTimersByTime(15000)
    expect(sessionStorage.getItem(key)).toBeNull()
  })
})

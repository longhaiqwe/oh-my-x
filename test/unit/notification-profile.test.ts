import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotificationProfileHover, findNotificationProfile } from '../../content-scripts/features/notification-profile'

let dom: JSDOM
beforeEach(() => {
  // 使用同一 JSDOM realm 的 Window 与事件构造器，避免 Vitest 全局代理被 UIEvent 拒绝。
  dom = new JSDOM('', { url: 'https://x.com', pretendToBeVisual: true })
  for (const key of ['window', 'document', 'location', 'MouseEvent', 'PointerEvent', 'FocusEvent', 'Event', 'DOMRect'] as const) vi.stubGlobal(key, dom.window[key])
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); dom.window.close(); vi.unstubAllGlobals() })

function fixture() {
  document.body.innerHTML = '<div id="cards"><a href="https://x.com/alice" id="proxy">Alice</a></div><section id="native"><article><a href="https://x.com/alice" id="source">Alice</a></article></section>'
  const source = document.querySelector<HTMLAnchorElement>('#source')!
  const proxy = document.querySelector<HTMLElement>('#proxy')!
  const article = source.closest('article')!
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 200, 30, 30))
  vi.spyOn(proxy, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 28, 28))
  return { source, proxy, article, hover: createNotificationProfileHover() }
}

describe('通知头像原生资料卡', () => {
  it('仅将事件转发给 X 的对应主页链接，排除站外、帖子和无效地址', () => {
    const { source } = fixture()
    const timeline = document.querySelector<HTMLElement>('#native')!
    timeline.querySelector('article')!.insertAdjacentHTML('afterbegin', '<a href="https://example.org/alice"></a><a href="https://x.com/alice/status/123"></a><a href="http://%"></a>')
    expect(findNotificationProfile(timeline, 'ALICE')).toBe(source)
    expect(findNotificationProfile(timeline, 'alice/other')).toBeNull()
    expect(findNotificationProfile(null, 'alice')).toBeNull()
  })
  it('以卡片头像定位原生悬停，保留 DOM 所属关系并在退出时恢复样式', () => {
    const { source, proxy, article, hover } = fixture()
    article.style.setProperty('translate', '1px 2px', 'important')
    const parent = article.parentElement
    const over = vi.fn(), out = vi.fn()
    source.addEventListener('mouseover', over); source.addEventListener('mouseout', out)
    hover.show(proxy, source)
    expect(over).toHaveBeenCalledTimes(1)
    expect(article.style.translate).toBe('80px -150px')
    expect(article.parentElement).toBe(parent)
    hover.close()
    expect(out).toHaveBeenCalledTimes(1)
    expect(article.style.translate).toBe('1px 2px')
    expect(article.style.getPropertyPriority('translate')).toBe('important')
  })
  it('键盘焦点也触发资料卡；滚动、缩放和显式关闭均恢复原始坐标', () => {
    const { source, proxy, article, hover } = fixture()
    const focus = vi.fn(), blur = vi.fn()
    source.addEventListener('focusin', focus); source.addEventListener('focusout', blur)
    hover.show(proxy, source, true)
    expect(focus).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('scroll'))
    expect(blur).toHaveBeenCalledTimes(1)
    expect(article.style.translate).toBe('')
    hover.show(proxy, source)
    window.dispatchEvent(new Event('resize'))
    expect(article.style.translate).toBe('')
    hover.close()
  })
  it('离开头像到资料卡内部不提前恢复定位，离开后释放；已回收节点不触发', () => {
    vi.useFakeTimers()
    const { source, proxy, article, hover } = fixture()
    hover.show(proxy, source)
    const card = document.createElement('div'); card.dataset.testid = 'HoverCard'; card.tabIndex = 0
    document.body.append(card); card.focus()
    hover.leave(proxy, card)
    vi.advanceTimersByTime(450)
    expect(article.style.translate).not.toBe('')
    card.remove(); vi.advanceTimersByTime(450)
    expect(article.style.translate).toBe('')
    source.remove()
    hover.show(proxy, source)
    expect(article.style.translate).toBe('')
    hover.close()
  })
})

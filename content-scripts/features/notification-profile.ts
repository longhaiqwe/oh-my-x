/** 复用 X 的头像链接和资料卡事件，不移动 React 节点或读取其私有状态。 */
export function findNotificationProfile(timeline: HTMLElement | null, handle: string): HTMLAnchorElement | null {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null
  return [...(timeline?.querySelectorAll<HTMLAnchorElement>('article a[href]') || [])].find(link => {
    try {
      const url = new URL(link.href, location.origin)
      return ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(url.hostname)
        && url.pathname.replace(/\/$/, '').toLowerCase() === `/${handle.toLowerCase()}`
    } catch { return false }
  }) || null
}

export function createNotificationProfileHover() {
  let active: { source: HTMLAnchorElement; proxy: HTMLElement; article: HTMLElement; translate: string; priority: string; keyboard: boolean } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const leaveEvents = (relatedTarget: EventTarget | null = null) => {
    if (!active) return
    active.source.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget }))
    active.source.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget }))
    if (active.keyboard) active.source.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }))
  }
  const close = () => {
    if (timer) clearTimeout(timer)
    timer = null
    leaveEvents()
    if (active) {
      if (active.translate) active.article.style.setProperty('translate', active.translate, active.priority)
      else active.article.style.removeProperty('translate')
    }
    active = null
    window.removeEventListener('scroll', close, true)
    window.removeEventListener('resize', close)
  }
  const release = () => {
    // 从头像移入 X 资料卡时，维持定位直到资料卡自身收到离开事件。
    const card = document.querySelector<HTMLElement>('[data-testid="HoverCard"]')
    if (card && (card.matches(':hover') || card.contains(document.activeElement))) {
      timer = setTimeout(release, 400)
    } else close()
  }
  return {
    close,
    show(proxy: HTMLElement, source: HTMLAnchorElement, keyboard = false) {
      if (active?.proxy === proxy) { if (timer) clearTimeout(timer); timer = null; return }
      close()
      const article = source.closest<HTMLElement>('article')
      if (!article || !source.isConnected) return
      const targetRect = proxy.getBoundingClientRect(), sourceRect = source.getBoundingClientRect()
      active = { source, proxy, article, keyboard, translate: article.style.getPropertyValue('translate'), priority: article.style.getPropertyPriority('translate') }
      // 只平移隐藏通知的绘制坐标，不改变虚拟列表的宽高。
      // CSS 在两个脚本执行环境间共享，X 能从原生头像读到卡片头像的屏幕位置。
      article.style.setProperty('translate', `${targetRect.left - sourceRect.left}px ${targetRect.top - sourceRect.top}px`, 'important')
      source.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
      source.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: document.defaultView }))
      if (keyboard) source.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      window.addEventListener('scroll', close, true)
      window.addEventListener('resize', close)
    },
    leave(proxy: HTMLElement, relatedTarget: EventTarget | null) {
      if (active?.proxy !== proxy) return
      leaveEvents(relatedTarget)
      if (timer) clearTimeout(timer)
      timer = setTimeout(release, 400)
    },
  }
}

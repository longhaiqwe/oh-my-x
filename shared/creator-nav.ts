// Radar 和创作者工作室「灵感」页的地址与换页。页面拦截器（MAIN world）也引用这里，所以不能引入 shared/i18n。

export type CreatorNavId = 'radar' | 'inspiration'

export const CREATOR_NAV_HREFS: Record<CreatorNavId, string> = {
  radar: '/i/radar',
  inspiration: '/i/jf/creators/inspiration/top_posts',
}

/**
 * 在 X 页面里（MAIN world）换到 Radar 或灵感页，和站内点链接一样不重新加载页面。
 * 历史记录照 X 自己切页时写的格式：{ key, state: { fromApp, previousPath } }（2026-10-23 实测）。
 * 只接受上面两个地址
 */
export function navigateCreatorPage(href: unknown): boolean {
  if (typeof href !== 'string' || !Object.values(CREATOR_NAV_HREFS).includes(href)) return false
  const previousPath = window.location.pathname + window.location.search
  if (previousPath === href) return true
  const state = { key: Math.random().toString(36).slice(2, 8), state: { fromApp: true, previousPath } }
  window.history.pushState(state, '', href)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
  return true
}

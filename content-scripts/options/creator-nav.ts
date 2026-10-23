import { CREATOR_NAV_NAVIGATE_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { CREATOR_NAV_HREFS, type CreatorNavId } from '../../shared/creator-nav'
import { t, type MessageKey } from '../../shared/i18n'
import { STATIC_NAV_ITEMS } from '../../shared/staticNavIcons'
import { isNavExpanded, stripNavBadges, syncNavEntryLayout } from '../utilities/navEntry'
import { RADAR_PATH_REGEX } from './radar'

// X 左侧导航栏里没有的两个页面：Radar（关键词实时追踪）和创作者工作室里的「灵感」（表现最好的帖子）。
// 入口照着「主页」克隆，放在「个人资料」前面；点击时由页面拦截器在 X 页面里换地址，页面不重新加载

interface CreatorNavItem {
  id: CreatorNavId
  href: string
  /** 地址匹配时入口显示为当前页 */
  activePath: RegExp
}

export const CREATOR_NAV_ITEMS: CreatorNavItem[] = [
  { id: 'radar', href: CREATOR_NAV_HREFS.radar, activePath: RADAR_PATH_REGEX },
  { id: 'inspiration', href: CREATOR_NAV_HREFS.inspiration, activePath: /^\/i\/jf\/creators\/inspiration(\/|$)/ },
]

const ENTRY_ATTR = 'data-xf-creator-nav'
/** 发出换页请求后等这么久地址还没变，说明页面里没有拦截器在处理，改为整页打开 */
export const NAVIGATE_FALLBACK_MS = 500

const enabled: Record<CreatorNavId, boolean> = { radar: false, inspiration: false }

/**
 * 请求页面拦截器在 X 自己的环境里换地址（shared/creator-nav.ts 的 navigateCreatorPage）。
 * 历史记录要由 X 的路由读到，在内容脚本这边派发 popstate 时记录数据能否传过去没有验证，所以交给拦截器
 */
export function openCreatorPage(href: string, fallback = (url: string) => window.location.assign(url)) {
  const from = window.location.pathname
  if (from === href) return
  window.postMessage({ type: CREATOR_NAV_NAVIGATE_TYPE, href, __xf: XF_BRIDGE_MARKER }, window.location.origin)
  setTimeout(() => {
    if (window.location.pathname === from) fallback(href)
  }, NAVIGATE_FALLBACK_MS)
}

function onEntryClick(e: MouseEvent) {
  // 中键和按着 Cmd / Ctrl / Shift / Alt 的点击交给浏览器，在新标签页或新窗口打开
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  e.stopPropagation()
  const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href')
  if (href) openCreatorPage(href)
}

function createEntry(refLink: HTMLElement, item: CreatorNavItem): HTMLAnchorElement {
  const entry = refLink.cloneNode(true) as HTMLAnchorElement
  entry.setAttribute('href', item.href)
  entry.removeAttribute('data-testid')
  entry.removeAttribute('aria-current')
  entry.setAttribute(ENTRY_ATTR, item.id)
  entry.classList.add('xf-sidebar-button')
  stripNavBadges(entry)

  const icon = STATIC_NAV_ITEMS.find((nav) => nav.id === item.id)
  const svg = entry.querySelector('svg')
  if (svg && icon) {
    svg.setAttribute('viewBox', icon.viewBox)
    svg.innerHTML = icon.innerHTML
  }

  entry.addEventListener('click', onEntryClick)
  return entry
}

/**
 * 按开关补上、移除入口，并同步文字、展开 / 收起排版和当前页状态。
 * 入口已经在位时不移动，避免和页面变化监听互相触发
 */
export function ensureCreatorNavEntries() {
  for (const item of CREATOR_NAV_ITEMS) {
    if (!enabled[item.id]) document.querySelectorAll(`[${ENTRY_ATTR}="${item.id}"]`).forEach((el) => el.remove())
  }

  const nav = document.querySelector('header[role="banner"] nav[role="navigation"]')
  if (!nav) return
  const homeLink = nav.querySelector<HTMLElement>('a[data-testid="AppTabBar_Home_Link"]')
  const anchor =
    nav.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ??
    nav.querySelector('[data-testid="AppTabBar_More_Menu"]')
  if (!homeLink || !anchor) return

  const expanded = isNavExpanded(homeLink)
  // 从后往前排：每个入口放在后一个入口（最后一个放在「个人资料」）前面
  let next: Element = anchor
  for (const item of [...CREATOR_NAV_ITEMS].reverse()) {
    if (!enabled[item.id]) continue
    const entry = nav.querySelector<HTMLElement>(`[${ENTRY_ATTR}="${item.id}"]`) ?? createEntry(homeLink, item)
    const label = t(`navItem.${item.id}` as MessageKey)
    const active = item.activePath.test(window.location.pathname)
    entry.setAttribute('aria-label', label)
    entry.setAttribute('title', label)
    if (active) entry.setAttribute('aria-current', 'page')
    else entry.removeAttribute('aria-current')
    syncNavEntryLayout(entry, expanded, homeLink, label, active)

    if (entry.nextElementSibling !== next) next.insertAdjacentElement('beforebegin', entry)
    next = entry
  }
}

export function setCreatorNavEntryEnabled(id: CreatorNavId, on: boolean) {
  enabled[id] = on
  ensureCreatorNavEntries()
}

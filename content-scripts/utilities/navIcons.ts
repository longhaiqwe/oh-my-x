import { NAV_ITEMS, type NavIconId, type NavItemConfig } from '../../shared/navItems'
import type { DiscoveredNavItem, NavIcon } from '../../shared/navIcons.types'

const DEFAULT_VIEW_BOX = '0 0 24 24'

const TEST_ID_TO_NAV: Partial<Record<string, NavIconId>> = {
  AppTabBar_Explore_Link: 'explore',
  AppTabBar_Notifications_Link: 'notifications',
  AppTabBar_DirectMessage_Link: 'messages',
  AppTabBar_Profile_Link: 'profile',
  AppTabBar_More_Menu: 'moreMenu',
  'premium-signup-tab': 'xPremium',
  AppTabBar_Bookmarks_Link: 'bookmarks',
  AppTabBar_History_Link: 'bookmarks',
}

function readSvgFromLink(link: Element): NavIcon | null {
  const svg = link.querySelector('svg')
  if (!svg) return null

  const innerHTML = svg.innerHTML.trim()
  if (!innerHTML) return null

  return {
    innerHTML,
    viewBox: svg.getAttribute('viewBox') ?? DEFAULT_VIEW_BOX,
  }
}

function matchesSelector(el: Element, selector: string): boolean {
  for (const part of selector.split(',')) {
    try {
      if (el.matches(part.trim())) return true
    } catch {
      // invalid selector fragment — skip
    }
  }
  return false
}

function matchByHref(href: string): NavItemConfig | null {
  if (href.includes('/i/grok')) return findConfig('grok')
  if (href.includes('/i/bookmarks') || href.includes('/i/history') || href.includes('/history')) return findConfig('bookmarks')
  if (href.includes('/compose/articles')) return findConfig('articles')
  if (href.includes('/topics')) return findConfig('topics')
  if (href.includes('/verified-orgs')) return findConfig('verifiedOrgs')
  if (href.includes('/jobs')) return findConfig('jobs')
  if (href.includes('/communities')) return findConfig('communities')
  if (href.includes('/lists')) return findConfig('lists')
  if (href.includes('premium')) return findConfig('xPremium')
  if (href.includes('creators/studio')) return findConfig('creatorStudio')
  if (href.includes('money') || href.includes('chatmoney')) return findConfig('chatMoney')
  return null
}

function findConfig(id: NavIconId): NavItemConfig | null {
  return NAV_ITEMS.find((item) => item.id === id) ?? null
}

function matchLinkToConfig(link: Element): NavItemConfig | null {
  const testId = link.getAttribute('data-testid')
  if (testId && TEST_ID_TO_NAV[testId]) {
    return findConfig(TEST_ID_TO_NAV[testId]!)
  }

  const href = link.getAttribute('href') ?? ''
  const byHref = matchByHref(href)
  if (byHref) return byHref

  for (const item of NAV_ITEMS) {
    if (matchesSelector(link, item.selector)) return item
  }

  return null
}

function getLabelFromLink(link: Element): string {
  const text =
    link.querySelector('[dir="ltr"] span, [dir="auto"] span, span')?.textContent?.trim()
  if (text) return text

  const ariaLabel = link.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  return 'Nav'
}

function findSideNav(): Element | null {
  const homeLink = document.querySelector('[data-testid="AppTabBar_Home_Link"]')
  const navFromHome = homeLink?.closest('nav[role="navigation"]')
  if (navFromHome) return navFromHome

  return (
    document.querySelector('header[role="banner"] nav[role="navigation"]') ??
    document.querySelector('nav[role="navigation"]')
  )
}

function collectNavLinks(nav: Element): Element[] {
  const direct = [...nav.children].filter((el) => el.matches('a, button'))
  if (direct.length > 0) return direct

  const selector =
    'a, button, a[data-testid^="AppTabBar_"], button[data-testid^="AppTabBar_"], a[data-testid="premium-signup-tab"], a[href*="/i/grok"], a[href*="creators/studio"], a[href*="/i/history"], a[href*="/i/bookmarks"], a[href*="/history"], a[href*="money"], a[href*="chatmoney"]'
  const results: Element[] = []
  const seen = new Set<Element>()

  for (const link of nav.querySelectorAll(selector)) {
    const parentLink = link.parentElement?.closest('a, button')
    if (parentLink && parentLink !== link) continue
    if (seen.has(link)) continue
    seen.add(link)
    results.push(link)
  }

  return results
}

/** Scan live nav in DOM order; only return items that exist on the page. */
export function extractNavItems(): DiscoveredNavItem[] {
  const nav = findSideNav()
  if (!nav) return []

  const items: DiscoveredNavItem[] = []
  const seenIds = new Set<NavIconId>()

  for (const link of collectNavLinks(nav)) {
    const icon = readSvgFromLink(link)
    if (!icon) continue

    const config = matchLinkToConfig(link)
    if (!config || seenIds.has(config.id)) continue

    seenIds.add(config.id)
    items.push({
      id: config.id,
      storageKey: config.storageKey,
      label: getLabelFromLink(link),
      icon,
    })
  }

  return items
}

export function getNavIconSvg(id: NavIconId): string | undefined {
  return extractNavItems().find((item) => item.id === id)?.icon.innerHTML
}

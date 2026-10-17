import { NAV_ITEMS, type NavIconId } from '../../shared/navItems'
import { STATIC_NAV_ITEMS } from '../../shared/staticNavIcons'
import waitForElement from '../utilities/waitForElement'

// X 会把部分导航入口收进「更多」菜单（例如创作者工作室；窗口较矮时还有书签、Lists 等）。
// 这个菜单是点开后才生成的弹出层，不在左侧导航栏里，导航栏的隐藏样式管不到它。
// 这里在每次打开「更多」菜单时，把用户在弹窗里关掉的入口在菜单里也隐藏。

const MORE_BUTTON = '[data-testid="AppTabBar_More_Menu"]'
const MENU = '[data-testid="Dropdown"], [role="menu"]'
const HIDDEN_ATTR = 'data-xf-nav-hidden'

const hiddenIds = new Set<NavIconId>()
let watching = false
let openMenu: Element | null = null

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

// 导航栏选择器里的 [aria-label]、[role="link"] 只在左侧导航栏成立，菜单里的链接不一定有，匹配菜单时去掉
function menuSelector(selector: string) {
  return selector.replace(/\[aria-label\]|\[role="link"\]/g, '')
}

// 每个入口的匹配方式：链接选择器，或菜单项文字（英文名 / 中文名）完全相同
function matcherFor(id: NavIconId) {
  const item = NAV_ITEMS.find((i) => i.id === id)
  if (!item) return null
  const selector = menuSelector(item.selector)
  const zhLabel = STATIC_NAV_ITEMS.find((s) => s.storageKey === item.storageKey)?.label
  const labels = [item.label, zhLabel].filter((l): l is string => Boolean(l)).map(normalize)
  return (el: Element) => {
    try {
      if (el.matches(selector)) return true
    } catch {
      // 选择器在当前环境不可用时只按文字匹配
    }
    return labels.includes(normalize(el.textContent ?? ''))
  }
}

/** 按当前记录隐藏菜单里对应的入口；先恢复上一次隐藏的，再重新隐藏 */
export function applyHiddenNavItemsToMenu(menu: Element) {
  menu.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((el) => {
    el.style.removeProperty('display')
    el.removeAttribute(HIDDEN_ATTR)
  })
  const entries = Array.from(menu.querySelectorAll<HTMLElement>('a[href], [role="menuitem"]'))
  for (const id of hiddenIds) {
    const matches = matcherFor(id)
    if (!matches) continue
    for (const el of entries) {
      if (!matches(el)) continue
      const target = el.closest<HTMLElement>('[role="menuitem"]') ?? el
      target.style.setProperty('display', 'none', 'important')
      target.setAttribute(HIDDEN_ATTR, id)
    }
  }
}

function ensureWatcher() {
  if (watching) return
  watching = true
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null
      if (!target?.closest?.(MORE_BUTTON)) return
      // 等菜单渲染出来；菜单项可能分两次渲染，稍后再处理一次
      setTimeout(() => {
        void waitForElement(MENU, 3000).then((menu) => {
          if (!menu) return
          openMenu = menu
          applyHiddenNavItemsToMenu(menu)
          setTimeout(() => {
            if (menu.isConnected) applyHiddenNavItemsToMenu(menu)
          }, 200)
        })
      }, 30)
    },
    true,
  )
}

/** 记录某个导航入口是否被隐藏，并同步到已打开的「更多」菜单 */
export function setNavItemHiddenInMoreMenu(id: NavIconId, hidden: boolean) {
  if (id === 'moreMenu') return
  if (hidden) hiddenIds.add(id)
  else hiddenIds.delete(id)
  ensureWatcher()
  if (openMenu?.isConnected) applyHiddenNavItemsToMenu(openMenu)
}

import { parseBloggerHandle } from '../../shared/favorite-bloggers'
import { ACCENT, getThemeColors } from './colors'

const LAYOUT = 'xf-profile-name-layout'
const NAME = 'xf-profile-name-content'
const ACTIONS = 'xf-profile-name-actions'

function ensureStyles() {
  if (document.getElementById('xf-profile-actions-style')) return
  const style = document.createElement('style')
  style.id = 'xf-profile-actions-style'
  style.textContent = `
    .${LAYOUT} { display: grid !important; grid-template-columns: minmax(0, max-content) max-content; column-gap: 8px; align-items: center; justify-content: start; min-width: 0; max-width: 100%; }
    .${LAYOUT} > * { grid-column: 1 / -1; min-width: 0; }
    .${LAYOUT} > .${NAME} { grid-column: 1; grid-row: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .${LAYOUT} > .${ACTIONS} { grid-column: 2; grid-row: 1; display: flex; flex-flow: row nowrap; gap: 6px; align-items: center; justify-self: start; width: max-content; }
    .${ACTIONS} > button { flex: none; align-self: center; width: max-content; margin: 0; box-sizing: border-box; }
    .${ACTIONS} > button:hover { background: var(--xf-profile-action-hover); }
    .${ACTIONS} > button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
  `
  document.documentElement.append(style)
}

/** 两种入口共用尺寸与主题，不受主页和资料卡原生按钮差异影响。 */
export function styleProfileAction(button: HTMLButtonElement) {
  const theme = getThemeColors()
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    height: '32px',
    minHeight: '32px',
    minWidth: '68px',
    padding: '0 12px',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '20px',
    border: `1px solid ${theme.isDark ? 'rgb(83, 100, 113)' : 'rgb(207, 217, 222)'}`,
    borderRadius: '9999px',
    color: button.getAttribute('aria-pressed') === 'true' ? ACCENT : theme.fg,
  })
  button.style.setProperty('--xf-profile-action-hover', theme.hoverBg)
}

/** SPA 切页时先验证页面上的用户名，避免把旧资料的操作发给新路由用户。 */
export function getCurrentProfileActionTarget() {
  const primary = document.querySelector('[data-testid="primaryColumn"]')
  const root = primary?.querySelector('[data-testid="UserName"]')
  const route = window.location.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|articles))?\/?$/)
  const handle = parseBloggerHandle(route?.[1])
  if (!primary || !root || root.closest('article') || !handle) return null
  const matches = [...root.querySelectorAll('span')].some(span => span.textContent?.trim().toLowerCase() === `@${handle.toLowerCase()}`)
  return matches ? { primary, root, handle } : null
}

/** 只移动扩展按钮：昵称与认证在左，扩展操作在右，原生用户名保持下一行。 */
export function placeProfileAction(root: Element, handle: string, button: HTMLButtonElement, order: number): boolean {
  const handleLabel = [...root.querySelectorAll('span')].find(span =>
    span.textContent?.trim().toLowerCase() === `@${handle.toLowerCase()}`,
  )
  if (!handleLabel) return false
  const markedName = root.matches('[data-testid="UserName"], [data-testid="User-Name"]') ? root :
    root.querySelector('[data-testid="UserName"], [data-testid="User-Name"]')
  const nameLink = [...root.querySelectorAll('a')].findLast(link =>
    link.getAttribute('href')?.replace(/\/$/, '').toLowerCase() === `/${handle.toLowerCase()}` &&
    link.textContent?.trim() && !link.contains(handleLabel),
  )
  const name = [...(markedName || nameLink || root).querySelectorAll('span')].find(span =>
    span.textContent?.trim() && !span.textContent.trim().startsWith('@') &&
    !span.contains(handleLabel) && !span.closest('button'),
  )
  if (!name) return false
  let container = name.parentElement
  while (container && root.contains(container) && (!container.contains(handleLabel) || container.closest('a, button'))) {
    container = container.parentElement
  }
  if (!container || !root.contains(container)) return false
  let branch: Element = name
  while (branch.parentElement && branch.parentElement !== container) branch = branch.parentElement
  ensureStyles()
  container.classList.add(LAYOUT)
  branch.classList.add(NAME)
  let actions = container.querySelector<HTMLElement>(`:scope > .${ACTIONS}`)
  if (!actions) {
    actions = document.createElement('div')
    actions.className = ACTIONS
  }
  if (branch.nextElementSibling !== actions) branch.insertAdjacentElement('afterend', actions)
  button.dataset.profileActionOrder = String(order)
  styleProfileAction(button)
  const next = [...actions.children].find(child => child !== button && Number((child as HTMLElement).dataset.profileActionOrder) > order)
  if (button.parentElement !== actions || button.nextElementSibling !== (next || null)) actions.insertBefore(button, next || null)
  return true
}

/** 单独关闭一个功能时保留另一个；最后一个按钮移除后恢复原生布局。 */
export function cleanupProfileActions(root: ParentNode = document) {
  root.querySelectorAll(`.${ACTIONS}`).forEach(group => {
    if (!group.childElementCount) group.remove()
  })
  root.querySelectorAll(`.${LAYOUT}`).forEach(container => {
    if (container.querySelector(`:scope > .${ACTIONS}`)) return
    container.classList.remove(LAYOUT)
    container.querySelectorAll(`:scope > .${NAME}`).forEach(name => name.classList.remove(NAME))
  })
}

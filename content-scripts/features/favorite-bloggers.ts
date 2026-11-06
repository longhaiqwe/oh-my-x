import { placeProfileAction, cleanupProfileActions, getCurrentProfileActionTarget, styleProfileAction } from '../utilities/profileActions'
import { KeyFavoriteBloggers, KeyFavoriteBloggersEnabled } from '../../storage-keys'
import { FAVORITE_BLOGGER_MESSAGE, parseBloggerHandle, toFavoriteBloggers, type FavoriteBlogger } from '../../shared/favorite-bloggers'
import { extractHandleFromCard } from '../../shared/quick-list'
import { t } from '../../shared/i18n'
import { ACCENT, getThemeColors } from '../utilities/colors'
import { isNavExpanded, stripNavBadges, syncNavEntryLayout } from '../utilities/navEntry'
import { computeNavPanelPosition, getNavAnchorRect } from './quick-list'

const NAV = 'xf-favorites-nav'
const BUTTON = 'xf-favorite-blogger-button'
const STAR = '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>'
let items: FavoriteBlogger[] = []
let loadFailed = false
let generation = 0
let panel: HTMLDivElement | null = null
let anchor: HTMLElement | null = null
let body: HTMLDivElement | null = null
let search: HTMLInputElement | null = null
let status: HTMLElement | null = null
let draggedHandle: string | null = null
let moving = false
let navReference: HTMLElement | null = null
let navLayoutObserver: MutationObserver | null = null

function syncNavLayout() {
  const entry = document.querySelector<HTMLElement>(`.${NAV}`)
  if (entry && navReference?.isConnected) {
    syncNavEntryLayout(entry, isNavExpanded(navReference), navReference, t('favorites.title'))
    positionPanel()
  }
}

function observeNavLayout(home: HTMLElement | null) {
  if (home === navReference) return
  navLayoutObserver?.disconnect()
  window.removeEventListener('resize', syncNavLayout)
  navReference = home
  if (!home) return
  navLayoutObserver = new MutationObserver(syncNavLayout)
  navLayoutObserver.observe(home, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
  window.addEventListener('resize', syncNavLayout)
}

function ensureStyles() {
  if (document.getElementById('xf-favorites-style')) return
  const style = document.createElement('style')
  style.id = 'xf-favorites-style'
  style.textContent = `
    .${NAV} { cursor: pointer; }
    .${BUTTON} { display: inline-flex; align-items: center; align-self: flex-start; flex-shrink: 0; white-space: nowrap; gap: 6px; margin: 4px; padding: 6px 12px; min-height: 32px; border: 1px solid var(--xf-fav-border); border-radius: 9999px; color: var(--xf-fav-fg); background: transparent; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .${BUTTON}[aria-pressed="true"] { color: ${ACCENT}; }
    .${BUTTON}[aria-pressed="true"] svg path { fill: currentColor; }
    .${BUTTON} svg { flex: none; }
    .xf-favorites-panel { position: fixed; z-index: 99999; width: 320px; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); display: flex; flex-direction: column; overflow: auto; border: 1px solid var(--xf-fav-border); border-radius: 16px; background: var(--xf-fav-bg); color: var(--xf-fav-fg); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .xf-favorites-panel * { box-sizing: border-box; }
    .xf-favorites-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 8px; font-size: 16px; font-weight: 700; }
    .xf-favorites-panel button { font: inherit; cursor: pointer; }
    .xf-favorites-panel button:disabled, .${BUTTON}:disabled { opacity: .5; cursor: wait; }
    .xf-favorites-panel button, .xf-favorites-panel input { color: inherit; background: transparent; border: 1px solid var(--xf-fav-border); border-radius: 8px; padding: 6px 8px; }
    .xf-favorites-panel button:hover, .${BUTTON}:hover { background: var(--xf-fav-hover); }
    .xf-favorites-panel :focus-visible, .${BUTTON}:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
    .xf-favorites-panel input { min-width: 0; width: 100%; font: inherit; }
    .xf-favorites-panel input::placeholder { color: var(--xf-fav-muted); }
    .xf-favorites-form { display: flex; gap: 8px; padding: 8px 16px; }
    .xf-favorites-form button { flex: none; color: ${ACCENT}; }
    .xf-favorites-search { padding: 0 16px 8px; }
    .xf-favorites-body { overflow-y: auto; min-height: 0; max-height: 360px; flex-shrink: 0; }
    .xf-favorites-row { position: relative; display: flex; align-items: center; gap: 8px; padding: 8px 16px; }
    .xf-favorites-row[data-dragging] { opacity: .45; }
    .xf-favorites-row[data-drop-position]::after { content: ''; position: absolute; left: 16px; right: 16px; height: 2px; background: ${ACCENT}; pointer-events: none; }
    .xf-favorites-row[data-drop-position="before"]::after { top: 0; }
    .xf-favorites-row[data-drop-position="after"]::after { bottom: 0; }
    .xf-favorites-panel .xf-favorites-drag { flex: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 32px; padding: 0; border: 0; color: var(--xf-fav-muted); cursor: grab; }
    .xf-favorites-panel .xf-favorites-drag:active { cursor: grabbing; }
    .xf-favorites-row:hover { background: var(--xf-fav-hover); }
    .xf-favorites-row a { flex: 1; min-width: 0; color: inherit; text-decoration: none; }
    .xf-favorites-row a span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .xf-favorites-handle, .xf-favorites-empty, .xf-favorites-footer { color: var(--xf-fav-muted); font-size: 13px; }
    .xf-favorites-empty { padding: 16px; }
    .xf-favorites-footer { padding: 8px 16px 12px; border-top: 1px solid var(--xf-fav-border); }
    .xf-favorites-status { padding: 0 16px 8px; font-size: 13px; }
    .xf-favorites-status:empty { display: none; }
    .xf-favorites-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 100000; max-width: 90vw; padding: 10px 16px; border-radius: 12px; color: var(--xf-fav-fg); background: var(--xf-fav-bg); border: 1px solid var(--xf-fav-border); }
  `
  document.documentElement.append(style)
}

function theme(el: HTMLElement) {
  const colors = getThemeColors()
  for (const [key, value] of Object.entries({ bg: colors.bg, fg: colors.fg, border: colors.border, hover: colors.hoverBg, muted: colors.fgSecondary })) {
    el.style.setProperty(`--xf-fav-${key}`, value)
  }
}

function notice(message: string) {
  if (status) { status.textContent = message; positionPanel(); return }
  document.querySelector('.xf-favorites-toast')?.remove()
  const toast = document.createElement('div')
  toast.className = 'xf-favorites-toast'
  toast.setAttribute('role', 'status')
  toast.textContent = message
  theme(toast)
  document.body.append(toast)
  setTimeout(() => toast.remove(), 3000)
}

function isSaved(handle: string) {
  return items.some(item => item.handle.toLowerCase() === handle.toLowerCase())
}

async function changeFavorite(action: 'add' | 'remove', blogger: FavoriteBlogger): Promise<boolean> {
  try {
    const result = await browser.runtime.sendMessage({ type: FAVORITE_BLOGGER_MESSAGE, action, blogger, handle: blogger.handle })
    if (!result?.ok || !Array.isArray(result.items)) throw new Error('save failed')
    items = toFavoriteBloggers(result.items)
    loadFailed = false
    renderRows()
    syncButtons()
    notice(t(action === 'add' ? 'favorites.added' : 'favorites.removed', { handle: blogger.handle }))
    return true
  } catch {
    notice(t('favorites.failed'))
    return false
  }
}

function positionPanel() {
  if (!panel || !anchor) return
  if (!anchor.isConnected) { closeFavoriteBloggersPanel(); return }
  const { left, top } = computeNavPanelPosition(getNavAnchorRect(anchor),
    { width: panel.offsetWidth || 320, height: panel.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight })
  panel.style.left = `${Math.min(left, Math.max(8, window.innerWidth - (panel.offsetWidth || 320) - 8))}px`
  panel.style.top = `${top}px`
}

export function closeFavoriteBloggersPanel(restoreFocus = false) {
  clearDrag()
  panel?.remove()
  anchor?.setAttribute('aria-expanded', 'false')
  if (anchor?.firstElementChild) (anchor.firstElementChild as HTMLElement).style.backgroundColor = ''
  if (restoreFocus) anchor?.focus()
  panel = body = null
  anchor = search = status = null
  document.removeEventListener('click', outsideClick, true)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', positionPanel)
  window.removeEventListener('scroll', positionPanel, true)
  window.removeEventListener('popstate', onNavigate)
}

function outsideClick(event: MouseEvent) {
  if (!panel?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) closeFavoriteBloggersPanel()
}
function onNavigate() { closeFavoriteBloggersPanel() }
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); closeFavoriteBloggersPanel(true) }
}

function clearDrag() {
  draggedHandle = null
  body?.querySelectorAll('[data-drop-position], [data-dragging]').forEach(row => {
    row.removeAttribute('data-drop-position')
    row.removeAttribute('data-dragging')
  })
}

async function moveFavorite(handle: string, targetHandle: string, placement: 'before' | 'after') {
  if (moving || handle === targetHandle) return
  moving = true
  const focusedDrag = (document.activeElement as HTMLElement | null)?.dataset.dragHandle
  const ownedPanel = panel
  body?.querySelectorAll<HTMLButtonElement>('.xf-favorites-drag').forEach(grip => { grip.disabled = true })
  try {
    const result = await browser.runtime.sendMessage({ type: FAVORITE_BLOGGER_MESSAGE, action: 'move', handle, targetHandle, placement })
    if (!result?.ok || !Array.isArray(result.items)) throw new Error('save failed')
    items = toFavoriteBloggers(result.items)
    loadFailed = false
    if (panel === ownedPanel) notice(t('favorites.reordered'))
  } catch {
    if (panel === ownedPanel) notice(t('favorites.failed'))
  } finally {
    moving = false
    renderRows()
    if (panel === ownedPanel && focusedDrag) body?.querySelector<HTMLButtonElement>(`[data-drag-handle="${focusedDrag}"]`)?.focus({ preventScroll: true })
  }
}

function addDragHandle(row: HTMLElement, item: FavoriteBlogger, visible: FavoriteBlogger[]) {
  const grip = document.createElement('button')
  grip.type = 'button'
  grip.className = 'xf-favorites-drag'
  grip.dataset.dragHandle = item.handle
  grip.draggable = true
  grip.disabled = moving
  grip.title = t('favorites.dragHandle', { handle: item.handle })
  grip.setAttribute('aria-label', grip.title)
  grip.innerHTML = '<svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><circle cx="5" cy="10" r="1.5"/><circle cx="11" cy="10" r="1.5"/><circle cx="5" cy="15" r="1.5"/><circle cx="11" cy="15" r="1.5"/></svg>'
  grip.addEventListener('dragstart', event => {
    if (moving) { event.preventDefault(); return }
    clearDrag()
    draggedHandle = item.handle
    row.setAttribute('data-dragging', '')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', item.handle)
      event.dataTransfer.setDragImage?.(row, 24, row.offsetHeight / 2)
    }
  })
  grip.addEventListener('dragend', clearDrag)
  grip.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const direction = event.key === 'ArrowUp' ? -1 : 1
    const target = visible[visible.findIndex(candidate => candidate.handle === item.handle) + direction]
    if (target) void moveFavorite(item.handle, target.handle, direction < 0 ? 'before' : 'after')
  })
  const placementAt = (event: DragEvent) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 ? 'before' : 'after'
  row.addEventListener('dragover', event => {
    if (!draggedHandle || draggedHandle === item.handle || moving) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    body?.querySelectorAll('[data-drop-position]').forEach(el => el.removeAttribute('data-drop-position'))
    row.dataset.dropPosition = placementAt(event)
    // 指针靠近滚动区边缘时，让较长的列表继续滚动。
    if (body) {
      const bounds = body.getBoundingClientRect()
      if (event.clientY < bounds.top + 24) body.scrollTop -= 12
      else if (event.clientY > bounds.bottom - 24) body.scrollTop += 12
    }
  })
  row.addEventListener('dragleave', event => {
    if (!row.contains(event.relatedTarget as Node | null)) row.removeAttribute('data-drop-position')
  })
  row.addEventListener('drop', event => {
    if (!draggedHandle) return
    event.preventDefault()
    event.stopPropagation()
    const handle = draggedHandle
    clearDrag()
    void moveFavorite(handle, item.handle, placementAt(event))
  })
  row.append(grip)
}

function renderRows() {
  if (!body) return
  clearDrag()
  const scrollTop = body.scrollTop
  const focusedHandle = (document.activeElement as HTMLElement | null)?.dataset.removeHandle
  const focusedDrag = (document.activeElement as HTMLElement | null)?.dataset.dragHandle
  const query = search?.value.trim().replace(/^@/, '').toLowerCase() || ''
  const filtered = items.filter(item => `${item.name} ${item.handle}`.toLowerCase().includes(query))
  body.replaceChildren()
  if (loadFailed || !filtered.length) {
    const empty = document.createElement('div')
    empty.className = 'xf-favorites-empty'
    empty.textContent = t(loadFailed ? 'favorites.loadFailed' : items.length ? 'favorites.noMatch' : 'favorites.empty')
    body.append(empty)
  }
  for (const item of filtered) {
    const row = document.createElement('div')
    row.className = 'xf-favorites-row'
    addDragHandle(row, item, filtered)
    const link = document.createElement('a')
    link.href = `https://x.com/${item.handle}`
    link.draggable = false
    link.title = `${item.name} (@${item.handle})`
    const name = document.createElement('span')
    name.textContent = item.name
    const handle = document.createElement('span')
    handle.className = 'xf-favorites-handle'
    handle.textContent = `@${item.handle}`
    link.append(name, handle)
    link.addEventListener('click', () => closeFavoriteBloggersPanel())
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = '×'
    remove.dataset.removeHandle = item.handle
    remove.title = t('favorites.removeHandle', { handle: item.handle })
    remove.setAttribute('aria-label', remove.title)
    remove.addEventListener('click', async () => {
      remove.disabled = true
      await changeFavorite('remove', item)
      remove.disabled = false
    })
    row.append(link, remove)
    body.append(row)
  }
  body.scrollTop = scrollTop
  if (focusedDrag) body.querySelector<HTMLButtonElement>(`[data-drag-handle="${focusedDrag}"]`)?.focus({ preventScroll: true })
  if (focusedHandle) {
    const next = body.querySelector<HTMLButtonElement>(`button[data-remove-handle="${focusedHandle}"]`) || body.querySelector<HTMLButtonElement>('button')
    ;(next || search)?.focus()
  }
  positionPanel()
}

async function openPanel(entry: HTMLElement) {
  if (panel) { closeFavoriteBloggersPanel(); return }
  panel = document.createElement('div')
  panel.id = 'xf-favorites-panel'
  panel.className = 'xf-favorites-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', t('favorites.title'))
  theme(panel)
  panel.style.boxShadow = getThemeColors().shadow
  const header = document.createElement('div')
  header.className = 'xf-favorites-header'
  const title = document.createElement('span')
  title.textContent = t('favorites.title')
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '×'
  close.setAttribute('aria-label', t('favorites.close'))
  close.addEventListener('click', () => closeFavoriteBloggersPanel(true))
  header.append(title, close)
  const form = document.createElement('form')
  form.className = 'xf-favorites-form'
  const input = document.createElement('input')
  input.placeholder = t('favorites.placeholder')
  input.setAttribute('aria-label', input.placeholder)
  input.autocomplete = 'off'
  const add = document.createElement('button')
  add.type = 'submit'
  add.textContent = t('favorites.add')
  form.append(input, add)
  const ownedPanel = panel
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (add.disabled) return
    const handle = parseBloggerHandle(input.value)
    if (!handle) { notice(t('favorites.invalid')); return }
    if (isSaved(handle)) { notice(t('favorites.exists')); return }
    add.disabled = true
    const added = await changeFavorite('add', { handle, name: handle })
    if (added && panel === ownedPanel) { input.value = ''; input.focus() }
    add.disabled = false
  })
  const searchWrap = document.createElement('div')
  searchWrap.className = 'xf-favorites-search'
  search = document.createElement('input')
  search.type = 'search'
  search.placeholder = t('favorites.search')
  search.setAttribute('aria-label', search.placeholder)
  search.addEventListener('input', renderRows)
  searchWrap.append(search)
  body = document.createElement('div')
  body.className = 'xf-favorites-body'
  status = document.createElement('div')
  status.className = 'xf-favorites-status'
  status.setAttribute('role', 'status')
  const foot = document.createElement('div')
  foot.className = 'xf-favorites-footer'
  foot.textContent = t('favorites.local')
  panel.append(header, form, searchWrap, status, body, foot)
  document.body.append(panel)
  anchor = entry
  entry.setAttribute('aria-expanded', 'true')
  if (entry.firstElementChild) (entry.firstElementChild as HTMLElement).style.backgroundColor = getThemeColors().hoverBg
  renderRows()
  search.focus()
  document.addEventListener('click', outsideClick, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', positionPanel)
  window.addEventListener('scroll', positionPanel, true)
  window.addEventListener('popstate', onNavigate)
  await runFavoriteBloggersFeature()
}

function ensureNav() {
  const nav = document.querySelector('header[role="banner"] nav[role="navigation"]') || document.querySelector('nav[role="navigation"]')
  const home = nav?.querySelector<HTMLElement>('a[data-testid="AppTabBar_Home_Link"], a[role="link"][href="/home"]')
  if (!home) return
  let entry = nav!.querySelector<HTMLAnchorElement>(`.${NAV}`)
  if (!entry) {
    entry = home.cloneNode(true) as HTMLAnchorElement
    entry.classList.add(NAV, 'xf-sidebar-button')
    entry.removeAttribute('data-testid')
    entry.removeAttribute('aria-current')
    entry.removeAttribute('id')
    entry.removeAttribute('href')
    entry.setAttribute('role', 'button')
    entry.tabIndex = 0
    entry.setAttribute('aria-label', t('favorites.title'))
    entry.title = t('favorites.title')
    entry.setAttribute('aria-haspopup', 'dialog')
    entry.setAttribute('aria-controls', 'xf-favorites-panel')
    entry.setAttribute('aria-expanded', 'false')
    stripNavBadges(entry)
    const svg = entry.querySelector('svg')
    if (svg) { svg.setAttribute('viewBox', '0 0 24 24'); svg.innerHTML = STAR }
    const target = entry
    entry.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void openPanel(target) })
    entry.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); target.click() }
    })
  }
  // 我的列表保持紧邻 Home；收藏排在它前面，避免两个入口反复互换位置。
  const target = home.previousElementSibling?.classList.contains('xf-quick-list-nav-entry')
    ? home.previousElementSibling : home
  if (entry.nextElementSibling !== target) target.insertAdjacentElement('beforebegin', entry)
  entry.setAttribute('aria-label', t('favorites.title'))
  entry.title = t('favorites.title')
  observeNavLayout(home)
  syncNavLayout()
}

function profileName(root: Element, handle: string): string {
  const name = root.querySelector('[data-testid="UserName"], [data-testid="User-Name"]')
  for (const span of name?.querySelectorAll('span') || []) {
    const text = span.textContent?.trim()
    if (text && !text.startsWith('@')) return text.slice(0, 100)
  }
  return handle
}

function injectButton(root: Element, blogger: FavoriteBlogger) {
  const existing = root.querySelector<HTMLButtonElement>(`.${BUTTON}`)
  if (existing?.dataset.handle === blogger.handle) {
    return existing
  }
  existing?.remove()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = BUTTON
  button.dataset.handle = blogger.handle
  button.append(document.createElement('span'))
  button.addEventListener('click', async event => {
    event.preventDefault()
    event.stopPropagation()
    button.disabled = true
    await changeFavorite(isSaved(blogger.handle) ? 'remove' : 'add', blogger)
    button.disabled = false
  })
  return button
}

function syncButtons() {
  document.querySelectorAll<HTMLButtonElement>(`.${BUTTON}`).forEach(button => {
    const handle = button.dataset.handle!
    const saved = isSaved(handle)
    button.setAttribute('aria-pressed', String(saved))
    button.title = t(saved ? 'favorites.removeHandle' : 'favorites.addHandle', { handle })
    button.setAttribute('aria-label', button.title)
    const label = button.querySelector('span')!
    const text = t(saved ? 'favorites.saved' : 'favorites.save')
    if (label.textContent !== text) label.textContent = text
    theme(button)
    styleProfileAction(button)
  })
}

function injectBesideName(root: Element, blogger: FavoriteBlogger) {
  placeProfileAction(root, blogger.handle, injectButton(root, blogger), 2)
}

function scanProfiles() {
  document.querySelectorAll('[data-testid="HoverCard"]').forEach(card => {
    const handle = parseBloggerHandle(extractHandleFromCard(card))
    if (handle) injectBesideName(card, { handle, name: profileName(card, handle) })
  })
  const profile = getCurrentProfileActionTarget()
  if (profile) {
    injectBesideName(profile.root, { handle: profile.handle, name: profileName(profile.primary, profile.handle) })
  } else {
    const primary = document.querySelector('[data-testid="primaryColumn"]')
    primary?.querySelectorAll(`.${BUTTON}`).forEach(button => button.remove())
    if (primary) cleanupProfileActions(primary)
  }
  syncButtons()
}

export async function runFavoriteBloggersFeature() {
  const request = ++generation
  try {
    const data = await browser.storage.local.get([KeyFavoriteBloggersEnabled, KeyFavoriteBloggers])
    if (request !== generation) return
    const enabled = data[KeyFavoriteBloggersEnabled] !== 'off'
    const next = toFavoriteBloggers(data[KeyFavoriteBloggers])
    const changed = loadFailed || JSON.stringify(next) !== JSON.stringify(items)
    items = next
    loadFailed = false
    if (!enabled) {
      observeNavLayout(null)
      document.querySelectorAll(`.${NAV}, .${BUTTON}`).forEach(el => el.remove())
      cleanupProfileActions()
      closeFavoriteBloggersPanel()
      return
    }
    ensureStyles()
    ensureNav()
    scanProfiles()
    if (panel) { theme(panel); if (changed) renderRows(); positionPanel() }
  } catch {
    if (request !== generation) return
    loadFailed = true
    renderRows()
  }
}

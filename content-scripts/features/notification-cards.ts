import { KeyNotificationCardsEnabled, KeyNotificationCardsView } from '../../storage-keys'
import { getLocale, onLocaleChange, t, type MessageKey } from '../../shared/i18n'
import {
  groupNotifications, notificationIsUnread, NOTIFICATION_STATE_KEY, NOTIFICATION_STATE_MESSAGE,
  type NotificationEntry, type NotificationReadState, type NotificationGroup, type NotificationActor,
} from '../../shared/notification-cards'
import { getStorage } from '../utilities/storage'
import { getThemeColors } from '../utilities/colors'
import { getXFontFamily } from '../utilities/xTypography'
import { findNotificationTimeline, getNotificationAccount, parseNotificationArticle } from './notification-parser'
import { ensureNotificationStyles } from './notification-cards-style'

const ROOT_ID = 'xf-notification-cards'
const MAX_ENTRIES = 500
const kindLabels: Record<NotificationEntry['kind'], MessageKey> = {
  reply: 'notifications.reply', like: 'notifications.like', repost: 'notifications.repost', follow: 'notifications.follow', other: 'notifications.other',
}
const paths = {
  reply: '<path d="M21 11.5a8 8 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8 8 0 0 1 12.5 3H13a8 8 0 0 1 8 8v.5Z"/>',
  like: '<path d="m20.8 4.6 0 0a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  repost: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  follow: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m4-14v6m-3-3h6"/>',
  other: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
} as const
const icon = (kind: keyof typeof paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
let enabled = false
let initialized = false
let root: HTMLElement | null = null
let timeline: HTMLElement | null = null
let account = '', route = '', signature = ''
let state: NotificationReadState | null = null
let mode: 'cards' | 'list' = 'cards'
let onlyUnread = false, selected = '', status = ''
let unknownCount = 0
let generation = 0
let pending: Promise<void> | null = null
let updateAgain = false
let themeObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let nativeObserver: MutationObserver | null = null
let scanTimer: ReturnType<typeof setTimeout> | null = null
const entries = new Map<string, NotificationEntry>()

function supportedRoute() { return /^\/notifications(?:\/(?:verified|priority|mentions))?\/?$/.test(location.pathname) }
function avatar(actor: NotificationActor) {
  return actor.avatar ? `<img class="xf-nc-avatar" src="${esc(actor.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="xf-nc-avatar" aria-hidden="true">${esc([...actor.name][0] || '@')}</span>`
}
function dateLabel(timestamp: number) {
  return timestamp ? new Date(timestamp).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('notifications.unknownTime')
}
function applyTheme() {
  if (!root) return
  const c = getThemeColors()
  const variables = { bg: c.bg, fg: c.fg, secondary: c.fgSecondary, border: c.border, hover: c.hoverBg }
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(`--xf-nc-${name}`, value)
  root.style.fontFamily = getXFontFamily()
}
function restoreTimeline() { timeline?.removeAttribute('data-xf-notification-hidden') }

export function cleanupNotificationCards() {
  generation++
  restoreTimeline()
  root?.remove(); root = null; timeline = null
  themeObserver?.disconnect(); themeObserver = null
  resizeObserver?.disconnect(); resizeObserver = null
  nativeObserver?.disconnect(); nativeObserver = null
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = null
  entries.clear(); state = null; account = ''; route = ''; selected = ''; signature = ''; status = ''
  unknownCount = 0
}

function eventHtml(entry: NotificationEntry) {
  return `<div class="xf-nc-event">${icon(entry.kind)}<div><div class="xf-nc-event-head"><b>${esc(t(kindLabels[entry.kind]))}</b><time class="xf-nc-time"${entry.timestamp ? ` datetime="${new Date(entry.timestamp).toISOString()}"` : ''}>${esc(dateLabel(entry.timestamp))}</time></div>${entry.summary ? `<p class="xf-nc-note">${esc(entry.summary)}</p>` : ''}${entry.text ? `<p>${esc(entry.text)}</p>` : ''}${entry.grouped ? `<p class="xf-nc-note">${esc(t('notifications.grouped'))}</p>` : ''}${entry.url ? `<a class="xf-nc-link" href="${esc(entry.url)}">${esc(t('notifications.openPost'))}</a>` : ''}</div></div>`
}
function detailHtml(group: NotificationGroup) {
  return `<section class="xf-nc-detail" id="xf-notification-detail" aria-label="${esc(t('notifications.detail', { name: group.actor.name }))}"><div class="xf-nc-detail-heading">${avatar(group.actor)}<div><h3>${esc(t('notifications.detail', { name: group.actor.name }))}</h3><a class="xf-nc-link" href="https://x.com/${esc(group.actor.handle)}">@${esc(group.actor.handle)}</a></div><button type="button" class="xf-nc-close" data-action="close" aria-label="${esc(t('notifications.collapse'))}">${icon('close')}</button></div>${group.entries.map(eventHtml).join('')}</section>`
}

function render(force = false) {
  if (!root || !timeline || !state) return
  const all = [...entries.values()]
  const groups = groupNotifications(all, state).filter(g => !onlyUnread || g.unread > 0 || g.actor.handle.toLowerCase() === selected)
  const others = all.filter(e => e.kind === 'other' || !e.actors.length).sort((a, b) => b.timestamp - a.timestamp)
  const unreadCount = new Set(groups.flatMap(g => g.entries.filter(e => notificationIsUnread(e, state!, g.actor.handle)).map(e => e.id))).size
  const wide = root.clientWidth >= 660
  const nextSignature = JSON.stringify([all, state, selected, onlyUnread, mode, wide, getLocale(), status, unknownCount])
  applyTheme()
  if (!force && signature === nextSignature) return
  signature = nextSignature
  const focused = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null
  const focusPerson = focused?.dataset.person
  const focusAction = focused?.dataset.action
  const focusFilter = focused?.matches('input')
  let cards = ''
  const selectedIndex = groups.findIndex(g => g.actor.handle.toLowerCase() === selected)
  const rowEnd = wide ? (selectedIndex < 2 ? 1 : 4 + Math.floor((selectedIndex - 2) / 3) * 3) : (selectedIndex === 0 ? 0 : Math.ceil(selectedIndex / 2) * 2)
  for (const [index, group] of groups.entries()) {
    const actor = group.actor, open = actor.handle.toLowerCase() === selected
    const counts = new Map<NotificationEntry['kind'], number>()
    group.entries.forEach(e => counts.set(e.kind, (counts.get(e.kind) || 0) + 1))
    cards += `<button type="button" class="xf-nc-card" data-person="${esc(actor.handle.toLowerCase())}" data-new="${group.unread > 0}" aria-expanded="${open}"${open ? ' aria-controls="xf-notification-detail"' : ''} aria-label="${esc(t('notifications.cardLabel', { name: actor.name, count: group.unread }))}"><span class="xf-nc-identity">${avatar(actor)}<span class="xf-nc-user"><b>${esc(actor.name)}</b><small>@${esc(actor.handle)}</small></span></span>${group.unread ? `<span class="xf-nc-badge">${group.unread}</span>` : ''}<span class="xf-nc-excerpt">${esc(group.entries[0].text || group.entries[0].summary || t(kindLabels[group.entries[0].kind]))}</span><span class="xf-nc-types">${[...counts].map(([kind, count]) => `<span>${icon(kind)}${esc(t(kindLabels[kind]))} ${count}</span>`).join('')}</span><span class="xf-nc-bottom"><span>${esc(dateLabel(group.entries[0].timestamp))}</span><span>${esc(open ? t('notifications.collapse') : group.unread ? t('notifications.new', { count: group.unread }) : t('notifications.view'))}</span>${icon('down')}</span></button>`
    if (selectedIndex >= 0 && index === Math.min(rowEnd, groups.length - 1)) cards += detailHtml(groups[selectedIndex])
  }
  root.innerHTML = `<div class="xf-nc-toolbar"><div class="xf-nc-modes" aria-label="${esc(t('notifications.viewMode'))}"><button type="button" data-action="cards" aria-pressed="${mode === 'cards'}">${icon('grid')}${esc(t('notifications.cards'))}</button><button type="button" data-action="list" aria-pressed="${mode === 'list'}">${icon('list')}${esc(t('notifications.list'))}</button></div><label class="xf-nc-filter"${mode === 'list' ? ' hidden' : ''}><input type="checkbox"${onlyUnread ? ' checked' : ''}>${esc(t('notifications.onlyUnread'))}</label></div><div class="xf-nc-content"${mode === 'list' ? ' hidden' : ''}><div class="xf-nc-heading"><div><h2>${esc(t('notifications.recent'))}</h2><p>${esc(t('notifications.count', { users: groups.length, count: unreadCount }))}</p></div></div><div class="xf-nc-grid">${cards}</div>${!groups.length ? `<p class="xf-nc-empty">${esc(t(onlyUnread ? 'notifications.noUnread' : 'notifications.empty'))}</p>` : ''}${others.length && !onlyUnread ? `<details class="xf-nc-other"><summary>${esc(t('notifications.otherCount', { count: others.length }))}</summary>${others.map(eventHtml).join('')}</details>` : ''}<div class="xf-nc-footer"><span>${esc(t('notifications.scope'))}</span><button type="button" class="xf-nc-text-button" data-action="list">${esc(t('notifications.loadMore'))}</button></div><p class="xf-nc-status" role="status" aria-live="polite">${esc(status)}</p></div>`
  // 没有解析成功时保留原列表；卡片视图不移动或删除 X 的虚拟列表节点。
  if (mode === 'cards' && all.length) timeline.setAttribute('data-xf-notification-hidden', 'true')
  else restoreTimeline()
  if (unknownCount) {
    const note = document.createElement('p')
    note.className = 'xf-nc-status'
    note.textContent = t('notifications.unrecognized', { count: unknownCount })
    root.querySelector('.xf-nc-content')?.append(note)
  }
  if (focusPerson) [...root.querySelectorAll<HTMLElement>('[data-person]')].find(el => el.dataset.person === focusPerson)?.focus({ preventScroll: true })
  else if (focusAction) root.querySelector<HTMLElement>(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true })
  else if (focusFilter) root.querySelector('input')?.focus({ preventScroll: true })
}

async function openPerson(handle: string) {
  if (!state) return
  if (selected === handle) { selected = ''; render(true); return }
  selected = handle; status = ''; render(true)
  const group = groupNotifications([...entries.values()], state).find(g => g.actor.handle.toLowerCase() === handle)
  if (!group?.unread) return
  const token = generation, owner = account
  try {
    const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner, read: group.entries.map(e => `${e.id}:${handle}`) })
    if (token !== generation || owner !== account) return
    if (!response?.ok) throw new Error('Read state unavailable')
    state = response.state
    render(true)
  } catch {
    if (token !== generation) return
    status = t('notifications.saveFailed'); render(true)
  }
}
function setView(next: 'cards' | 'list') {
  mode = next; selected = ''; status = ''; render(true)
  void browser.storage.local.set({ [KeyNotificationCardsView]: next }).catch(() => {
    status = t('notifications.saveFailed'); render(true)
  })
}
function mount(target: HTMLElement) {
  restoreTimeline(); root?.remove()
  timeline = target; root = document.createElement('div'); root.id = ROOT_ID
  target.before(root)
  root.addEventListener('click', event => {
    const element = event.target as Element
    const person = element.closest<HTMLElement>('[data-person]')
    if (person) { void openPerson(person.dataset.person!); return }
    const action = element.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'cards' || action === 'list') setView(action)
    if (action === 'close') {
      const previous = selected; selected = ''; render(true)
      ;[...root!.querySelectorAll<HTMLElement>('[data-person]')].find(el => el.dataset.person === previous)?.focus({ preventScroll: true })
    }
  })
  root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLInputElement)) return
    onlyUnread = event.target.checked; selected = ''; render(true)
  })
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selected) {
      event.preventDefault(); const previous = selected; selected = ''; render(true)
      ;[...root!.querySelectorAll<HTMLElement>('[data-person]')].find(el => el.dataset.person === previous)?.focus({ preventScroll: true })
    }
  })
  themeObserver?.disconnect()
  themeObserver = new MutationObserver(applyTheme)
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] })
  resizeObserver?.disconnect()
  if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(() => render()); resizeObserver.observe(root) }
  // X 会原地更新合并通知的时间和文字。全局 observer 跳过文本变化，
  // 因此只在原生通知列表上补充监听；插件自己的卡片是兄弟节点，不会形成循环。
  nativeObserver?.disconnect()
  nativeObserver = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer)
    scanTimer = setTimeout(() => { scanTimer = null; void updateNotificationCards() }, 100)
  })
  nativeObserver.observe(target, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['datetime', 'href', 'src'] })
  signature = ''
}

async function update() {
  if (!enabled || !supportedRoute()) { if (root || account) cleanupNotificationCards(); return }
  const owner = getNotificationAccount(), currentRoute = location.pathname
  if (!owner) { if (root || account) cleanupNotificationCards(); return }
  if (owner !== account || currentRoute !== route) {
    cleanupNotificationCards(); account = owner; route = currentRoute; onlyUnread = false
  }
  const target = findNotificationTimeline()
  if (!target) { if (root && !root.isConnected) { restoreTimeline(); root = null; timeline = null }; return }
  if (!state) {
    const token = generation
    try {
      const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner })
      if (token !== generation || !enabled || location.pathname !== currentRoute || getNotificationAccount() !== owner) return
      if (!response?.ok) return // 后台失联时不接管原页面。
      state = response.state
    } catch { return }
  }
  unknownCount = 0
  for (const article of target.querySelectorAll('article[data-testid="notification"], article[data-testid="tweet"]')) {
    if (article.closest(`#${ROOT_ID}`)) continue
    const entry = parseNotificationArticle(article)
    if (entry) entries.set(entry.id, entry)
    else unknownCount++
  }
  if (entries.size > MAX_ENTRIES) {
    const retained = [...entries.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ENTRIES)
    entries.clear(); retained.forEach(entry => entries.set(entry.id, entry))
  }
  ensureNotificationStyles()
  if (timeline !== target || !root?.isConnected) mount(target)
  render()
}

export function updateNotificationCards(): Promise<void> {
  if (pending) { updateAgain = true; return pending }
  pending = (async () => {
    do { updateAgain = false; await update() } while (updateAgain)
  })().catch(() => { cleanupNotificationCards() }).finally(() => { pending = null })
  return pending
}
export function setNotificationCardsEnabled(value: boolean) {
  enabled = value
  if (!value) cleanupNotificationCards()
  else void updateNotificationCards()
}
export async function initNotificationCards() {
  if (initialized) return
  initialized = true
  const data = await getStorage([KeyNotificationCardsEnabled, KeyNotificationCardsView])
  mode = data[KeyNotificationCardsView] === 'list' ? 'list' : 'cards'
  enabled = data[KeyNotificationCardsEnabled] !== 'off'
  onLocaleChange(() => render(true))
  browser.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[KeyNotificationCardsView]) {
      mode = changes[KeyNotificationCardsView].newValue === 'list' ? 'list' : 'cards'; render(true)
    }
    if (changes[NOTIFICATION_STATE_KEY] && account && state) {
      const incoming = (changes[NOTIFICATION_STATE_KEY].newValue as Record<string, NotificationReadState> | undefined)?.[account]
      if (incoming?.baseline) { state = incoming; render(true) }
    }
  })
  window.addEventListener('popstate', () => { void updateNotificationCards() })
  await updateNotificationCards()
}

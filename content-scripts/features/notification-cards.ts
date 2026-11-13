import { KeyNotificationCardsEnabled, KeyNotificationCardsView, KeyNotificationCardsOnlyReplies, KeyNotificationCardsOnlyUnread } from '../../storage-keys'
import { getLocale, onLocaleChange, t, type MessageKey } from '../../shared/i18n'
import {
  groupNotifications, notificationIsUnread, notificationReadKey, mergeNotificationReadState, NOTIFICATION_STATE_KEY, NOTIFICATION_STATE_MESSAGE,
  type NotificationEntry, type NotificationReadState, type NotificationGroup, type NotificationActor,
} from '../../shared/notification-cards'
import { getStorage } from '../utilities/storage'
import { getThemeColors } from '../utilities/colors'
import { getXFontFamily } from '../utilities/xTypography'
import { findNotificationTimeline, getNotificationAccount, parseNotificationArticle } from './notification-parser'
import { createNotificationProfileHover, findNotificationProfile } from './notification-profile'
import { ensureNotificationStyles } from './notification-cards-style'
import { prepareNotificationReply, resumeNotificationReply, cancelNotificationReply } from './notification-reply'

const ROOT_ID = 'xf-notification-cards'
const MAX_ENTRIES = 500
const POST_ALERT_RECEIPT = 'post_alert'
const POST_AVATAR_LIMIT = 7
const kindLabels: Record<NotificationEntry['kind'], MessageKey> = {
  reply: 'notifications.reply', like: 'notifications.like', repost: 'notifications.repost', follow: 'notifications.follow', post: 'notifications.post', other: 'notifications.other',
}
const paths = {
  reply: '<path d="M21 11.5a8 8 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8 8 0 0 1 12.5 3H13a8 8 0 0 1 8 8v.5Z"/>',
  like: '<path d="m20.8 4.6 0 0a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  repost: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  follow: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m4-14v6m-3-3h6"/>',
  other: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  post: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
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
let account = '', route = '', signature = '', toolbarLocale = ''
let state: NotificationReadState | null = null
let mode: 'cards' | 'list' = 'cards'
let markingAllRead = false
let onlyUnread = false, onlyReplies = false, selected = '', status = ''
let unknownCount = 0
let generation = 0
let pending: Promise<void> | null = null
let updateAgain = false
let needsNativeRefresh = true
let loadFailed = false
let preferencesRevision = 0
let themeObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let nativeObserver: MutationObserver | null = null
let scanTimer: ReturnType<typeof setTimeout> | null = null
const entries = new Map<string, NotificationEntry>()
const profileHover = createNotificationProfileHover()

function supportedRoute(path = location.pathname) { return /^\/notifications(?:\/(?:verified|priority|mentions))?\/?$/.test(path) }
function avatar(actor: NotificationActor) {
  return actor.avatar ? `<img class="xf-nc-avatar" src="${esc(actor.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="xf-nc-avatar" aria-hidden="true">${esc([...actor.name][0] || '@')}</span>`
}
function profileAvatar(actor: NotificationActor) {
  return `<a class="xf-nc-profile" data-profile="${esc(actor.handle)}" href="https://x.com/${esc(actor.handle)}" aria-label="${esc(t('notifications.openProfile', { name: actor.name }))}" title="${esc(`${actor.name} (@${actor.handle})`)}">${avatar(actor)}</a>`
}
function focusPersonCard(handle: string) {
  root?.querySelector<HTMLElement>(`[data-open-person="${CSS.escape(handle)}"]`)?.focus({ preventScroll: true })
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
function restoreTimeline() {
  if (timeline?.hasAttribute('data-xf-notification-hidden')) timeline.removeAttribute('data-xf-notification-hidden')
  timeline?.style.removeProperty('--xf-nc-native-width')
}

function detachNativeReadListener() {
  timeline?.removeEventListener('click', onNativeNotificationClick, true)
  timeline?.removeEventListener('auxclick', onNativeNotificationClick, true)
}

export function cleanupNotificationCards() {
  generation++
  profileHover.close()
  restoreTimeline()
  detachNativeReadListener()
  root?.remove(); root = null; timeline = null
  themeObserver?.disconnect(); themeObserver = null
  resizeObserver?.disconnect(); resizeObserver = null
  nativeObserver?.disconnect(); nativeObserver = null
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = null
  entries.clear(); state = null; account = ''; route = ''; selected = ''; signature = ''; status = ''
  unknownCount = 0; toolbarLocale = ''; markingAllRead = false
  needsNativeRefresh = true
  loadFailed = false
  document.removeEventListener('visibilitychange', refreshVisibleNotifications)
}

function replyPostId(entry: NotificationEntry) {
  return entry.kind === 'reply' ? entry.url.match(/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/(\d+)$/)?.[1] : undefined
}
function eventHtml(entry: NotificationEntry) {
  const postId = replyPostId(entry)
  const reply = postId ? `<a class="xf-nc-reply" data-reply="${esc(entry.id)}" href="${esc(entry.url)}" title="${esc(t('notifications.replyHint'))}">${icon('reply')}${esc(t('notifications.replyAction'))}</a>` : ''
  return `<div class="xf-nc-event" data-kind="${entry.kind}">${icon(entry.kind)}<div><div class="xf-nc-event-head"><b>${esc(t(kindLabels[entry.kind]))}</b><time class="xf-nc-time"${entry.timestamp ? ` datetime="${new Date(entry.timestamp).toISOString()}"` : ''}>${esc(dateLabel(entry.timestamp))}</time></div>${entry.summary ? `<p class="xf-nc-note">${esc(entry.summary)}</p>` : ''}${entry.text ? `<p>${esc(entry.text)}</p>` : ''}${entry.url ? `<div class="xf-nc-event-actions">${reply}<a class="xf-nc-link" href="${esc(entry.url)}">${esc(t('notifications.openPost'))}</a></div>` : ''}</div></div>`
}

// Refactoring UI §2.1 / §3.6 / §4.4：摘要为主，标题与提醒元信息为一组，时间按基线对齐。
// 单条汇总不显示固定数量；沿用 12/16px 间距、14/11px 字号、16px 圆角及主题变量。
function postAlertsHtml(alerts: NotificationEntry[]) {
  const entry = alerts[0]
  if (!entry) return ''
  const unread = notificationIsUnread(entry, state!, POST_ALERT_RECEIPT)
  const remaining = Math.max(0, entry.actors.length - POST_AVATAR_LIMIT)
  const avatars = entry.actors.slice(0, POST_AVATAR_LIMIT).map(profileAvatar).join('')
  const overflow = remaining ? `<span class="xf-nc-post-more" role="img" aria-label="${esc(t('notifications.moreActors', { count: remaining }))}">+${remaining}</span>` : ''
  return `<section class="xf-nc-posts xf-nc-post" aria-labelledby="xf-nc-posts-title" data-new="${unread}"><button type="button" class="xf-nc-post-open" data-post-alert="${esc(entry.id)}" aria-label="${esc(`${t('notifications.openPosts')}：${entry.summary}`)}"></button><div class="xf-nc-post-heading"><h2 id="xf-nc-posts-title">${icon('post')}${esc(t('notifications.post'))}</h2><div class="xf-nc-post-meta"><time class="xf-nc-time"${entry.timestamp ? ` datetime="${new Date(entry.timestamp).toISOString()}"` : ''}>${esc(dateLabel(entry.timestamp))}</time>${unread ? `<span>${esc(t('notifications.unviewed'))}</span>` : ''}</div></div><div class="xf-nc-post-content"><div class="xf-nc-post-avatars">${avatars}${overflow}</div><div class="xf-nc-post-body"><p>${esc(entry.summary)}</p><span class="xf-nc-post-action">${esc(t('notifications.openPosts'))} →</span></div></div></section>`
}

function openPostAlert(id: string) {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'post' || !state) return
  const article = [...(timeline?.querySelectorAll<HTMLElement>('article[data-testid="notification"]') || [])]
    .find(node => parseNotificationArticle(node)?.id === id)
  if (!article) {
    status = t('notifications.postUnavailable'); render(true)
    return
  }
  profileHover.close()
  // X 的 /i/timeline 依赖原生事件传入的时间线状态，不能直接拼接 URL。
  // 先提交查看记录，再同步触发导航；异步返回不能阻断点击或修改新页面。
  void markPostAlertViewed(entry)
  article.click()
}

async function markPostAlertViewed(entry: NotificationEntry) {
  const token = generation, owner = account
  try {
    const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner, read: [`${entry.id}:${POST_ALERT_RECEIPT}`], postReadThrough: entry.timestamp })
    if (token !== generation || owner !== account || !supportedRoute()) return
    if (!response?.ok) throw new Error('Read state unavailable')
    state = mergeNotificationReadState(state, response.state); render(true)
  } catch {
    if (token === generation && supportedRoute()) { status = t('notifications.saveFailed'); render(true) }
  }
}

function openProfile(event: MouseEvent, link: HTMLAnchorElement) {
  // 普通点击沿用 X 站内导航；修饰键、右键与中键保留真实链接的浏览器行为。
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const native = findNotificationProfile(timeline, link.dataset.profile!)
  if (!native) return
  event.preventDefault()
  profileHover.close()
  native.click()
}

function replyToEntry(event: MouseEvent, id: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const entry = entries.get(id)
  const postId = entry && replyPostId(entry)
  if (!entry || !postId) { event.preventDefault(); return }
  prepareNotificationReply(entry.url, account)
  for (const article of timeline?.querySelectorAll('article[data-testid="tweet"]') || []) {
    const permalink = article.querySelector('time[datetime]')?.closest('a')
    if (permalink?.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)$/)?.[1] !== postId) continue
    event.preventDefault()
    // 原生帖子链接保留 X 的站内导航；节点回收后则由卡片链接在当前标签页导航。
    permalink.click()
    resumeNotificationReply()
    return
  }
}
function detailHtml(group: NotificationGroup) {
  return `<section class="xf-nc-detail" id="xf-notification-detail" aria-label="${esc(t('notifications.detail', { name: group.actor.name }))}"><div class="xf-nc-detail-heading">${profileAvatar(group.actor)}<div><h3>${esc(t('notifications.detail', { name: group.actor.name }))}</h3><a class="xf-nc-link" href="https://x.com/${esc(group.actor.handle)}">@${esc(group.actor.handle)}</a></div><button type="button" class="xf-nc-close" data-action="close" aria-label="${esc(t('notifications.collapse'))}">${icon('close')}</button></div>${group.entries.map(eventHtml).join('')}</section>`
}

function matchesNotificationType(entry: NotificationEntry) {
  return !onlyReplies || entry.kind === 'reply'
}

// Refactoring UI §2.1 / §3.6：卡片内容为主，筛选为次；显示方式与筛选分组。
// 两个独立布尔条件使用原生复选框。沿用 12px 组间距、6px 标签间距、32px 点击高度及主题色。
// 切换只改变现有节点的可见性；不要在恢复 X 列表之前重建隐藏卡片。
function syncView(): HTMLElement {
  if (!root!.querySelector('.xf-nc-toolbar')) {
    root!.innerHTML = '<div class="xf-nc-toolbar"></div><div class="xf-nc-content"></div>'
  }
  const toolbar = root!.querySelector<HTMLElement>('.xf-nc-toolbar')!
  if (toolbarLocale !== getLocale()) {
    toolbar.innerHTML = `<div class="xf-nc-modes" aria-label="${esc(t('notifications.viewMode'))}"><button type="button" data-action="cards" aria-pressed="${mode === 'cards'}">${icon('grid')}${esc(t('notifications.cards'))}</button><button type="button" data-action="list" aria-pressed="${mode === 'list'}">${icon('list')}${esc(t('notifications.list'))}</button></div><div class="xf-nc-filters" role="group" aria-label="${esc(t('notifications.filters'))}"${mode === 'list' ? ' hidden' : ''}><label class="xf-nc-filter"><input type="checkbox" data-filter="replies"${onlyReplies ? ' checked' : ''}>${esc(t('notifications.onlyReplies'))}</label><label class="xf-nc-filter"><input type="checkbox" data-filter="unread"${onlyUnread ? ' checked' : ''}>${esc(t('notifications.onlyUnread'))}</label></div>`
    toolbarLocale = getLocale()
  }
  for (const button of toolbar.querySelectorAll<HTMLElement>('[data-action]')) {
    const pressed = String(button.dataset.action === mode)
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  }
  const filters = toolbar.querySelector<HTMLElement>('.xf-nc-filters')!
  const hideFilters = mode === 'list' || !entries.size
  if (filters.hidden !== hideFilters) filters.hidden = hideFilters
  for (const checkbox of filters.querySelectorAll<HTMLInputElement>('input')) {
    const checked = checkbox.dataset.filter === 'replies' ? onlyReplies : onlyUnread
    if (checkbox.checked !== checked) checkbox.checked = checked
  }
  const content = root!.querySelector<HTMLElement>('.xf-nc-content')!
  if (content.hidden !== (mode === 'list')) content.hidden = mode === 'list'
  if (mode === 'cards' && (!state || entries.size)) {
    const width = root!.getBoundingClientRect().width
    if (width > 0 && timeline!.style.getPropertyValue('--xf-nc-native-width') !== `${width}px`) timeline!.style.setProperty('--xf-nc-native-width', `${width}px`)
    if (!timeline!.hasAttribute('data-xf-notification-hidden')) timeline!.setAttribute('data-xf-notification-hidden', 'true')
  } else restoreTimeline()
  return content
}

function render(force = false) {
  if (!root || !timeline) return
  const content = syncView()
  if (!state) {
    if (!root.hasAttribute('aria-busy')) {
      root.setAttribute('aria-busy', 'true')
      content.innerHTML = `<p class="xf-nc-status" role="status">${esc(t('notifications.loading'))}</p><div class="xf-nc-grid xf-nc-loading" aria-hidden="true"><div></div><div></div><div></div></div>`
    }
    return
  }
  root.removeAttribute('aria-busy')
  // 原始列表滚动时仍收集通知，但不计算分组、不格式化时间、不渲染隐藏卡片。
  if (mode === 'list') return
  const all = [...entries.values()]
  // clientWidth 会取整，缩放后的临界宽度可能与 CSS 容器查询算出不同列数。
  const width = root.getBoundingClientRect().width
  const columns = width >= 660 ? 3 : width <= 380 ? 1 : 2
  const nextSignature = JSON.stringify([all, state, selected, onlyUnread, onlyReplies, columns, getLocale(), status, unknownCount, markingAllRead])
  if (!force && signature === nextSignature) return
  signature = nextSignature
  const matching = all.filter(matchesNotificationType)
  const groups = groupNotifications(matching, state).filter(g => !onlyUnread || g.unread > 0 || g.actor.handle.toLowerCase() === selected)
  const alerts = matching.filter(e => e.kind === 'post' && notificationIsUnread(e, state!, POST_ALERT_RECEIPT)).sort((a, b) => b.timestamp - a.timestamp)
  const others = matching.filter(e => e.kind !== 'post' && (e.kind === 'other' || !e.actors.length)).sort((a, b) => b.timestamp - a.timestamp)
  const hasGrouped = groups.some(group => group.entries.some(entry => entry.grouped)) || alerts.some(entry => entry.grouped) || (!onlyUnread && others.some(entry => entry.grouped))
  const unreadCount = new Set(groups.flatMap(g => g.entries.filter(e => notificationIsUnread(e, state!, g.actor.handle)).map(e => e.readId || e.id))).size
  const focused = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null
  const focusPostAlert = focused?.dataset.postAlert
  const focusProfile = focused?.dataset.profile
  const focusPerson = focused?.dataset.openPerson
  const focusAction = focused?.dataset.action
  const focusFilter = focused?.dataset.filter
  let cards = ''
  const selectedIndex = groups.findIndex(g => g.actor.handle.toLowerCase() === selected)
  const rowEnd = Math.floor(selectedIndex / columns) * columns + columns - 1
  for (const [index, group] of groups.entries()) {
    const actor = group.actor, open = actor.handle.toLowerCase() === selected
    // Refactoring UI §2.1 / §2.4 / §5.7：回复正文为主，其他互动为次；类型文字与图标共同区分。
    // 保持最近互动排序，但混合卡片优先预览最新未查看回复，其次为最新回复。
    const replies = group.entries.filter(e => e.kind === 'reply')
    const unreadReplies = replies.filter(e => notificationIsUnread(e, state!, actor.handle))
    const preview = unreadReplies[0] || replies[0] || group.entries[0]
    const primaryKind = preview.kind
    const typeLabel = t(kindLabels[primaryKind])
    const otherKinds = [...new Set(group.entries.map(entry => entry.kind))].filter(kind => kind !== primaryKind)
    const action = open ? t('notifications.collapse') : replies.length ? t('notifications.viewReplies') : t('notifications.view')
    const excerpt = replies.length ? preview.text || preview.summary : preview.summary || preview.text
    cards += `<div class="xf-nc-card" data-person="${esc(actor.handle.toLowerCase())}" data-kind="${primaryKind}" data-new="${group.unread > 0}" data-new-reply="${unreadReplies.length > 0}" data-expanded="${open}"><button type="button" class="xf-nc-card-open" data-open-person="${esc(actor.handle.toLowerCase())}" aria-expanded="${open}"${open ? ' aria-controls="xf-notification-detail"' : ''} aria-label="${esc(`${t('notifications.cardLabel', { name: actor.name, count: group.unread })}，${typeLabel}`)}"></button><span class="xf-nc-card-kind">${icon(primaryKind)}${esc(typeLabel)}</span><span class="xf-nc-identity">${profileAvatar(actor)}<span class="xf-nc-user"><b>${esc(actor.name)}</b><small>@${esc(actor.handle)}</small></span></span>${group.unread ? `<span class="xf-nc-badge">${group.unread}</span>` : ''}<span class="xf-nc-excerpt">${esc(excerpt || t(kindLabels[primaryKind]))}</span>${otherKinds.length ? `<span class="xf-nc-types">${otherKinds.map(kind => `<span>${icon(kind)}${esc(t(kindLabels[kind]))}</span>`).join('')}</span>` : ''}<span class="xf-nc-bottom"><span>${esc(dateLabel(preview.timestamp))}</span><span class="xf-nc-card-action">${esc(action)}${icon('down')}</span></span></div>`
    if (selectedIndex >= 0 && index === Math.min(rowEnd, groups.length - 1)) cards += detailHtml(groups[selectedIndex])
  }
  const emptyKey: MessageKey = onlyReplies ? (onlyUnread ? 'notifications.noUnreadReplies' : 'notifications.noReplies') : (onlyUnread ? 'notifications.noUnread' : 'notifications.empty')
  profileHover.close()
  content.innerHTML = `${postAlertsHtml(alerts)}<div class="xf-nc-heading"><div><h2>${esc(t(onlyReplies ? 'notifications.reply' : 'notifications.recent'))}</h2><p>${esc(t('notifications.count', { users: groups.length, count: unreadCount }))}</p></div><button type="button" class="xf-nc-mark-all" data-action="mark-all-read" title="${esc(t('notifications.markAllReadHint'))}"${markingAllRead || !unreadCount ? ' disabled' : ''}>${esc(t(markingAllRead ? 'notifications.markingRead' : 'notifications.markAllRead'))}</button></div><div class="xf-nc-grid">${cards}</div>${!groups.length ? `<p class="xf-nc-empty">${esc(t(emptyKey))}</p>` : ''}${others.length && !onlyUnread ? `<details class="xf-nc-other"><summary>${esc(t('notifications.otherCount', { count: others.length }))}</summary>${others.map(eventHtml).join('')}</details>` : ''}<div class="xf-nc-footer"><span>${esc(t('notifications.scope'))}</span><button type="button" class="xf-nc-text-button" data-action="list">${esc(t('notifications.loadMore'))}</button></div>${hasGrouped ? `<details class="xf-nc-grouped-note"><summary>${esc(t('notifications.groupedHelp'))}</summary><p>${esc(t('notifications.grouped'))}</p></details>` : ''}<p class="xf-nc-status" role="status" aria-live="polite">${esc(status)}</p>`
  if (unknownCount && !onlyReplies) {
    const note = document.createElement('p')
    note.className = 'xf-nc-status'
    note.textContent = t('notifications.unrecognized', { count: unknownCount })
    root.querySelector('.xf-nc-content')?.append(note)
  }
  if (focusProfile) [...root.querySelectorAll<HTMLElement>('[data-profile]')].find(el => el.dataset.profile === focusProfile)?.focus({ preventScroll: true })
  else if (focusPostAlert) [...root.querySelectorAll<HTMLElement>('[data-post-alert]')].find(el => el.dataset.postAlert === focusPostAlert)?.focus({ preventScroll: true })
  else if (focusPerson) focusPersonCard(focusPerson)
  else if (focusAction) root.querySelector<HTMLElement>(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true })
  else if (focusFilter) root.querySelector<HTMLElement>(`[data-filter="${focusFilter}"]`)?.focus({ preventScroll: true })
}

async function markAllInteractionsRead() {
  if (!state || markingAllRead) return
  const groups = groupNotifications([...entries.values()].filter(matchesNotificationType), state)
  const read = new Set<string>(), notificationIds = new Set<string>()
  for (const group of groups) for (const entry of group.entries) {
    if (!notificationIsUnread(entry, state, group.actor.handle)) continue
    read.add(notificationReadKey(entry, group.actor.handle)); notificationIds.add(entry.readId || entry.id)
  }
  if (!read.size) return
  const token = generation, owner = account, receipts = [...read]
  markingAllRead = true; status = ''; render(true)
  try {
    // 后台每次最多接收 500 个查看记录。固定点击时的记录集合，新到达通知仍保持未查看。
    for (let i = 0; i < receipts.length; i += 500) {
      const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner, read: receipts.slice(i, i + 500) })
      if (token !== generation || owner !== account) return
      if (!response?.ok) throw new Error('Read state unavailable')
      state = mergeNotificationReadState(state, response.state)
    }
    status = t('notifications.markAllReadDone', { count: notificationIds.size })
  } catch {
    if (token !== generation || owner !== account) return
    status = t('notifications.saveFailed')
  } finally {
    if (token === generation && owner === account) { markingAllRead = false; render(true) }
  }
}

async function openPerson(handle: string) {
  if (!state) return
  if (selected === handle) { selected = ''; render(true); return }
  selected = handle; status = ''; render(true)
  // 筛选只限制详情展示；点开用户卡片时统一标记该用户已加载的互动。
  // 固定点击时的集合，保存期间新到达的通知不随本次操作清除。
  const group = groupNotifications([...entries.values()], state).find(g => g.actor.handle.toLowerCase() === handle)
  if (!group?.unread) return
  const token = generation, owner = account
  try {
    const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner, read: group.entries.map(e => notificationReadKey(e, handle)) })
    if (token !== generation || owner !== account) return
    if (!response?.ok) throw new Error('Read state unavailable')
    state = mergeNotificationReadState(state, response.state)
    render(true)
  } catch {
    if (token !== generation) return
    status = t('notifications.saveFailed'); render(true)
  }
}

function onNativeNotificationClick(event: MouseEvent) {
  if (!enabled || mode !== 'list' || !supportedRoute() || !account || getNotificationAccount() !== account) return
  if (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0) return
  const element = event.target instanceof Element ? event.target : null
  const article = element?.closest('article[data-testid="notification"], article[data-testid="tweet"]')
  if (!article || !timeline?.contains(article)) return
  // 头像、菜单、点赞等独立控件不代表打开通知；行本身可以带 role="button"。
  const control = element?.closest('button, [role="button"], input, textarea, select, [contenteditable="true"]')
  if (control && control !== article && article.contains(control)) return
  const entry = parseNotificationArticle(article)
  if (!entry || entry.kind === 'other') return
  const link = element?.closest<HTMLAnchorElement>('a[href]')
  if (link) {
    const match = link.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)\/?$/)
    if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(link.hostname) || !match) return
    if (entry.kind === 'reply' && match[1] !== replyPostId(entry)) return
  } else if (event.type === 'auxclick') return
  // 捕获阶段提交保存，原生点击即使同步跳转并清理页面，也不会丢失本次查看记录。
  if (entry.kind === 'post') void markPostAlertViewed(entry)
  else void markNativeInteractionViewed(entry)
}

async function markNativeInteractionViewed(entry: NotificationEntry) {
  const token = generation, owner = account
  const read = entry.actors.filter(actor => !state || notificationIsUnread(entry, state, actor.handle))
    .map(actor => notificationReadKey(entry, actor.handle))
  if (!read.length) return
  try {
    for (let i = 0; i < read.length; i += 500) {
      const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner, read: read.slice(i, i + 500) })
      if (token !== generation || owner !== account || !supportedRoute()) return
      if (!response?.ok) throw new Error('Read state unavailable')
      state = mergeNotificationReadState(state, response.state)
    }
    render(true)
  } catch {
    if (token === generation && owner === account && supportedRoute()) { status = t('notifications.saveFailed'); render(true) }
  }
}

function setView(next: 'cards' | 'list') {
  if (mode === next) return
  preferencesRevision++
  profileHover.close()
  mode = next; selected = ''; status = ''; render()
  void browser.storage.local.set({ [KeyNotificationCardsView]: next }).catch(() => {
    status = t('notifications.saveFailed'); render(true)
  })
}
function mount(target: HTMLElement) {
  profileHover.close(); restoreTimeline(); detachNativeReadListener(); root?.remove()
  timeline = target; root = document.createElement('div'); root.id = ROOT_ID
  target.addEventListener('click', onNativeNotificationClick, true)
  target.addEventListener('auxclick', onNativeNotificationClick, true)
  target.before(root)
  toolbarLocale = ''; applyTheme()
  root.addEventListener('click', event => {
    const element = event.target as Element
    const profile = element.closest<HTMLAnchorElement>('[data-profile]')
    if (profile) { openProfile(event, profile); return }
    const alert = element.closest<HTMLElement>('[data-post-alert]')
    if (alert) { void openPostAlert(alert.dataset.postAlert!); return }
    const reply = element.closest<HTMLElement>('[data-reply]')
    if (reply) { replyToEntry(event, reply.dataset.reply!); return }
    const person = element.closest<HTMLElement>('[data-person]')
    if (person) { void openPerson(person.dataset.person!); return }
    const action = element.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'cards' || action === 'list') setView(action)
    if (action === 'mark-all-read') void markAllInteractionsRead()
    if (action === 'close') {
      const previous = selected; selected = ''; render(true)
      ;focusPersonCard(previous)
    }
  })
  for (const type of ['mouseover', 'focusin'] as const) root.addEventListener(type, event => {
    const profile = (event.target as Element).closest<HTMLElement>('[data-profile]')
    if (!profile || (event.relatedTarget instanceof Node && profile.contains(event.relatedTarget))) return
    const native = findNotificationProfile(timeline, profile.dataset.profile!)
    if (native) profileHover.show(profile, native, type === 'focusin')
  })
  for (const type of ['mouseout', 'focusout'] as const) root.addEventListener(type, event => {
    const profile = (event.target as Element).closest<HTMLElement>('[data-profile]')
    if (!profile || (event.relatedTarget instanceof Node && profile.contains(event.relatedTarget))) return
    profileHover.leave(profile, event.relatedTarget)
  })
  root.addEventListener('change', event => {
    if (!(event.target instanceof HTMLInputElement)) return
    let key: string
    if (event.target.dataset.filter === 'replies') { key = KeyNotificationCardsOnlyReplies; onlyReplies = event.target.checked }
    else if (event.target.dataset.filter === 'unread') { key = KeyNotificationCardsOnlyUnread; onlyUnread = event.target.checked }
    else return
    preferencesRevision++
    selected = ''; status = ''; render(true)
    // 分别保存两个偏好，避免另一标签页修改一项时覆盖另一项。
    const token = generation
    void browser.storage.local.set({ [key]: event.target.checked }).catch(() => {
      if (token !== generation) return
      status = t('notifications.saveFailed'); render(true)
    })
  })
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') profileHover.close()
    if (event.key === 'Escape' && selected) {
      event.preventDefault(); const previous = selected; selected = ''; render(true)
      ;focusPersonCard(previous)
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

function refreshVisibleNotifications() {
  if (document.visibilityState !== 'visible' || !supportedRoute()) return
  needsNativeRefresh = true
  void updateNotificationCards()
}

function refreshNativeNotifications() {
  if (!needsNativeRefresh || document.visibilityState === 'hidden') return
  const tab = document.querySelector<HTMLAnchorElement>('[data-testid="primaryColumn"] [role="tablist"] a[role="tab"][aria-selected="true"]')
  // 只触发当前通知分类；路由过渡期间可能仍残留上一个分类的节点。
  if (!tab || tab.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '')) return
  needsNativeRefresh = false // 在 click 之前置位，防止原生更新再次触发刷新。
  tab.click()
}

/** 在 MutationObserver 的同一轮先挂载外壳，不等待通用动态队列或后台 RPC。 */
export function prepareNotificationCards() {
  if (!enabled || !supportedRoute()) return
  const owner = getNotificationAccount()
  if (!owner) return
  if (owner !== account || location.pathname !== route) {
    cleanupNotificationCards(); account = owner; route = location.pathname
  }
  if (loadFailed) return
  const target = findNotificationTimeline()
  if (!target) return
  if (timeline !== target || !root?.isConnected) {
    ensureNotificationStyles(); mount(target); render()
  }
}

async function update() {
  prepareNotificationCards()
  if (!enabled) { if (root || account) cleanupNotificationCards(); return }
  const owner = getNotificationAccount(), currentRoute = location.pathname
  if (!supportedRoute()) {
    // X 原生回复弹窗会改变地址，底下仍是通知页；不因此清空卡片、展开状态和缓存。
    if (/^\/compose\/(?:post|tweet)\/?$/.test(currentRoute) && supportedRoute(route) && root?.isConnected && timeline?.isConnected && owner === account) return
    if (root || account) cleanupNotificationCards()
    return
  }
  if (!owner) { if (root || account) cleanupNotificationCards(); return }
  if (owner !== account || currentRoute !== route) {
    cleanupNotificationCards(); account = owner; route = currentRoute
  }
  document.addEventListener('visibilitychange', refreshVisibleNotifications)
  if (loadFailed) return
  refreshNativeNotifications()
  let target = findNotificationTimeline()
  if (!target) { if (root && !root.isConnected) { restoreTimeline(); detachNativeReadListener(); root = null; timeline = null }; return }
  if (!state) {
    const token = generation
    const revision = preferencesRevision
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      // 首次挂载及重新进入页面时一起恢复显示方式和筛选，避免先展示错误视图。
      const [preferences, response] = await Promise.race([
        Promise.all([
          getStorage([KeyNotificationCardsView, KeyNotificationCardsOnlyReplies, KeyNotificationCardsOnlyUnread]),
          browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner }),
        ]),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Notification state timeout')), 3000) }),
      ])
      if (token !== generation || !enabled || location.pathname !== currentRoute || getNotificationAccount() !== owner) return
      if (!response?.ok) throw new Error('Notification state unavailable')
      // 加载期间用户可能已经切换显示方式或筛选，不能用旧快照覆盖。
      if (revision === preferencesRevision) {
        mode = preferences[KeyNotificationCardsView] === 'list' ? 'list' : 'cards'
        onlyReplies = preferences[KeyNotificationCardsOnlyReplies] === true
        onlyUnread = preferences[KeyNotificationCardsOnlyUnread] === true
      }
      state = mergeNotificationReadState(state, response.state)
    } catch {
      if (token === generation) {
        cleanupNotificationCards(); account = owner; route = currentRoute; loadFailed = true
      }
      return
    } finally { if (timeout) clearTimeout(timeout) }
  }
  // 原生刷新可能同步更换列表，不能继续扫描刚才的旧节点。
  target = findNotificationTimeline()
  if (!target) return
  unknownCount = 0
  const cachedPost = [...entries.values()].find(entry => entry.kind === 'post')
  let pagePost: NotificationEntry | undefined
  for (const article of target.querySelectorAll('article[data-testid="notification"], article[data-testid="tweet"]')) {
    if (article.closest(`#${ROOT_ID}`)) continue
    const entry = parseNotificationArticle(article)
    if (entry?.kind === 'post') {
      // 同时间以页面靠前的提醒为准，避免每次扫描在两个版本间切换。
      if (!pagePost || entry.timestamp > pagePost.timestamp) pagePost = entry
    } else if (entry) entries.set(entry.id, entry)
    else unknownCount++
  }
  // 新帖提醒是汇总入口，只保留最新快照；先替换缓存，再应用未查看筛选。
  // 回看旧列表或原生节点回收时，不用较旧记录覆盖已获取的新版本。
  const latestPost = pagePost && (!cachedPost || pagePost.timestamp >= cachedPost.timestamp) ? pagePost : cachedPost
  for (const [id, entry] of entries) if (entry.kind === 'post' && id !== latestPost?.id) entries.delete(id)
  if (latestPost) entries.set(latestPost.id, latestPost)
  if (entries.size > MAX_ENTRIES) {
    const retained = [...entries.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ENTRIES)
    entries.clear(); retained.forEach(entry => entries.set(entry.id, entry))
  }
  // 旧版本仅保存原始指纹；遇到能匹配的旧收据时补存稳定编号，不重置任何已读记录。
  const upgraded = new Map<string, string>()
  for (const entry of entries.values()) for (const actor of entry.actors) {
    const key = notificationReadKey(entry, actor.handle)
    const legacy = `${entry.id}:${actor.handle.toLowerCase()}`
    if (entry.readId && state!.read[legacy] && !state!.read[key]) upgraded.set(legacy, key)
  }
  if (upgraded.size) {
    const token = generation, receipts = [...upgraded].map(([from, to]) => ({ from, to }))
    try {
      for (let i = 0; i < receipts.length; i += 500) {
        const migrate = receipts.slice(i, i + 500)
        const response = await browser.runtime.sendMessage({ type: NOTIFICATION_STATE_MESSAGE, account: owner, migrate })
        if (token !== generation || owner !== account) return
        if (!response?.ok) throw new Error('Read state unavailable')
        for (const { from } of migrate) if (state) delete state.read[from]
        state = mergeNotificationReadState(state, response.state)
      }
    } catch {
      if (token !== generation || owner !== account) return
      status = t('notifications.saveFailed')
    }
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
  if (!value) { cancelNotificationReply(); cleanupNotificationCards() }
  else void updateNotificationCards()
}
export async function initNotificationCards() {
  if (initialized) return
  initialized = true
  const data = await getStorage([KeyNotificationCardsEnabled, KeyNotificationCardsView])
  mode = data[KeyNotificationCardsView] === 'list' ? 'list' : 'cards'
  enabled = data[KeyNotificationCardsEnabled] !== 'off'
  if (enabled) resumeNotificationReply()
  else cancelNotificationReply()
  onLocaleChange(() => render(true))
  browser.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[KeyNotificationCardsView]) {
      const next = changes[KeyNotificationCardsView].newValue === 'list' ? 'list' : 'cards'
      if (mode !== next) {
        // 与本页切换保持一致：先还原原生头像的定位，再让原始列表可见。
        profileHover.close()
        preferencesRevision++; mode = next; selected = ''; status = ''; render()
      }
    }
    let filtersChanged = false
    if (changes[KeyNotificationCardsOnlyReplies]) {
      const next = changes[KeyNotificationCardsOnlyReplies].newValue === true
      if (onlyReplies !== next) { onlyReplies = next; filtersChanged = true }
    }
    if (changes[KeyNotificationCardsOnlyUnread]) {
      const next = changes[KeyNotificationCardsOnlyUnread].newValue === true
      if (onlyUnread !== next) { onlyUnread = next; filtersChanged = true }
    }
    if (filtersChanged) { preferencesRevision++; selected = ''; status = ''; render() }
    if (changes[NOTIFICATION_STATE_KEY] && account && state) {
      const incoming = (changes[NOTIFICATION_STATE_KEY].newValue as Record<string, NotificationReadState> | undefined)?.[account]
      if (incoming?.baseline) { state = mergeNotificationReadState(state, incoming); render(true) }
    }
  })
  window.addEventListener('popstate', () => { void updateNotificationCards() })
  await updateNotificationCards()
}

import dayjs from 'dayjs'
import { KeyScheduledPostsCache, KeyScheduledSidebarCollapsed } from '../../storage-keys'
import {
  formatDurationGap,
  formatRelativePublishTime,
  getIntervalTheme,
  getPersistedScheduledPosts,
  normalizeScheduledItems,
  requestScheduledRefresh,
  type IntervalTheme,
  type PersistedScheduledItem,
} from '../options/scheduled-time'
import selectors from '../selectors'
import addStyles, { removeStyles, stylesExist } from '../utilities/addStyles'
import { ACCENT, accentAlpha, getThemeColors } from '../utilities/colors'
import { getStorage, setStorage } from '../utilities/storage'
import { getLocale, t } from '../../shared/i18n'
import { errorText } from '../../shared/errors'

/**
 * 右侧栏排期面板：放在搜索框下面，按天列出待发布的定时帖和相邻两条的间隔。
 * 数据来自 scheduled-time.ts 维护的排期缓存；刷新按钮请求 MAIN world 拦截器重新读取。
 */

export const SCHEDULED_SIDEBAR_ID = 'xf-sched-side'
const STYLE_ID = 'scheduledSidebar'
/** X 的定时帖列表 */
export const SCHEDULED_LIST_PATH = '/compose/post/unsent/scheduled'
/** 上次自动读取排期的时间，存在页面 localStorage，所有标签页共用 */
const AUTO_REFRESH_KEY = 'xf_sched_side_synced_at'
const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000
const TICK_MS = 60 * 1000
const TIGHT_GAP_MS = 2 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000
/** 识别右侧栏里的正文区块（推荐、趋势、推荐关注、页脚、加载中） */
const CONTENT_MARKERS = 'aside, section, nav, [role="progressbar"]'

// ---------- 分组（纯逻辑） ----------

export interface ScheduleGap {
  label: string
  text: string
  tight: boolean
  color: string
}

export interface ScheduleRow {
  item: PersistedScheduledItem
  time: string
  theme: IntervalTheme
  /** 与当天上一条的间隔；当天第一条为 null */
  gap: ScheduleGap | null
}

export interface ScheduleDayGroup {
  key: string
  label: string
  rows: ScheduleRow[]
  /** 日期行右侧：第一天写下一条还有多久，之后每天写与前一天最后一条的间隔 */
  note: { text: string; color: string } | null
}

/** 星期的短名按语言取：中文「周二」，英文「Tue」 */
function weekdayName(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(date)
}

export function formatScheduleDayLabel(date: Date, now: Date = new Date()): string {
  const day = dayjs(date).startOf('day')
  const diff = day.diff(dayjs(now).startOf('day'), 'day')
  const name = diff === 0 ? t('day.today') : diff === 1 ? t('day.tomorrow') : diff === 2 ? t('day.dayAfterTomorrow') : weekdayName(day.toDate())
  const dateText = day.year() === dayjs(now).year() ? day.format('MM-DD') : day.format('YYYY-MM-DD')
  return `${name} · ${dateText}`
}

/** 跨天的间隔：不到 2 小时算过密，不到 24 小时算跨夜，再长算跨日 */
function crossDayLabel(gapMs: number): string {
  if (gapMs < TIGHT_GAP_MS) return t('sidebar.gapTight')
  return gapMs < DAY_MS ? t('sidebar.gapOvernight') : t('sidebar.gapOverDay')
}

/** 只保留还没到发布时间的定时帖，按天分组，并算出每条与上一条的间隔 */
export function buildScheduleDayGroups(items: PersistedScheduledItem[], now: Date = new Date()): ScheduleDayGroup[] {
  const nowMs = now.getTime()
  const upcoming = items
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp > nowMs)
    .sort((a, b) => a.timestamp - b.timestamp)

  const groups: ScheduleDayGroup[] = []
  upcoming.forEach((item, index) => {
    const date = new Date(item.timestamp)
    const gapMs = Math.max(0, item.timestamp - (index > 0 ? upcoming[index - 1].timestamp : nowMs))
    const theme = getIntervalTheme(index === 0, gapMs)
    const key = dayjs(date).format('YYYY-MM-DD')
    let group = groups[groups.length - 1]
    const startsDay = !group || group.key !== key

    if (startsDay) {
      group = {
        key,
        label: formatScheduleDayLabel(date, now),
        rows: [],
        note: index === 0
          ? { text: t('sidebar.next', { time: formatRelativePublishTime(date, now) }), color: theme.accentColor }
          : { text: `${crossDayLabel(gapMs)} ${formatDurationGap(gapMs)}`, color: theme.accentColor },
      }
      groups.push(group)
    }

    const tight = gapMs < TIGHT_GAP_MS
    group.rows.push({
      item,
      time: dayjs(date).format('HH:mm'),
      theme,
      gap: startsDay
        ? null
        : { label: tight ? t('sidebar.gapTight') : t('sidebar.gap'), text: formatDurationGap(gapMs), tight, color: theme.accentColor },
    })
  })
  return groups
}

// ---------- 放置位置 ----------

export type PanelSlot = { after: Element } | { before: Element }

function isContentBlock(el: Element): boolean {
  if (el.id === SCHEDULED_SIDEBAR_ID) return false
  return el.matches(CONTENT_MARKERS) || Boolean(el.querySelector(CONTENT_MARKERS))
}

/** 从 node 往上找，直到某一层旁边有正文区块；返回这一层的元素 */
function findBlock(sidebar: Element, node: Element): Element | null {
  let el = node
  while (el.parentElement && el.parentElement !== sidebar) {
    const parent = el.parentElement
    if (Array.from(parent.children).some((child) => child !== el && isContentBlock(child))) return el
    el = parent
  }
  return null
}

/**
 * 面板在右侧栏里的位置：有搜索框时放在搜索框那一块下面；
 * 没有搜索框（探索页、搜索页）时放在第一个正文区块前面。
 */
export function findScheduledSidebarSlot(sidebar: Element): PanelSlot | null {
  const search =
    sidebar.querySelector('form[role="search"]') ??
    sidebar.querySelector('[data-testid="SearchBox_Search_Input"]')
  if (search) {
    const block = findBlock(sidebar, search)
    if (!block) return null
    // 搜索框悬浮在顶部时，下面跟着一个等高的空白占位；面板放在占位后面，不被搜索框盖住
    let after: Element = block
    let next = after.nextElementSibling
    while (next && next.id !== SCHEDULED_SIDEBAR_ID && !isContentBlock(next)) {
      after = next
      next = next.nextElementSibling
    }
    return { after }
  }

  const first = sidebar.querySelector('aside, section')
  if (!first) return null
  const block = findBlock(sidebar, first)
  return block ? { before: block } : null
}

function placePanel(panel: HTMLElement, slot: PanelSlot) {
  if ('after' in slot) {
    if (slot.after.nextElementSibling !== panel) slot.after.insertAdjacentElement('afterend', panel)
  } else if (slot.before.previousElementSibling !== panel) {
    slot.before.insertAdjacentElement('beforebegin', panel)
  }
}

// ---------- 状态 ----------

const state = {
  enabled: false,
  items: [] as PersistedScheduledItem[],
  itemsSig: '',
  collapsed: false,
  refreshing: false,
  error: '',
}

let loadPromise: Promise<void> | null = null
let storageListenerAdded = false
let ticker: ReturnType<typeof setInterval> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryCount = 0
let retryPath = ''
let nextAutoRefreshCheck = 0

function setItems(items: PersistedScheduledItem[]) {
  state.items = items
  state.itemsSig = items.map((item) => `${item.timestamp}\u0001${item.text}`).join('\u0002')
}

function parseCache(raw: unknown): PersistedScheduledItem[] {
  if (typeof raw !== 'string' || !raw) return []
  try {
    return normalizeScheduledItems(JSON.parse(raw))
  } catch {
    return []
  }
}

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const [items, collapsed] = await Promise.all([
        getPersistedScheduledPosts(),
        getStorage(KeyScheduledSidebarCollapsed),
      ])
      setItems(items)
      state.collapsed = collapsed === 'on'
      addStorageListener()
    })()
  }
  return loadPromise
}

function addStorageListener() {
  if (storageListenerAdded) return
  const onChanged = (globalThis as { browser?: typeof browser }).browser?.storage?.onChanged
  if (!onChanged?.addListener) return
  storageListenerAdded = true
  onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    let changed = false
    if (changes[KeyScheduledPostsCache]) {
      setItems(parseCache(changes[KeyScheduledPostsCache].newValue))
      changed = true
    }
    if (changes[KeyScheduledSidebarCollapsed]) {
      state.collapsed = changes[KeyScheduledSidebarCollapsed].newValue === 'on'
      changed = true
    }
    if (changed) rerender()
  })
}

function isLoggedIn(): boolean {
  return /(?:^|;\s*)twid=/.test(document.cookie) ||
    Boolean(document.querySelector('[data-testid="AppTabBar_Profile_Link"], [data-testid="SideNav_AccountSwitcher_Button"]'))
}

// ---------- 对外接口 ----------

/** 由「排期全景」和「右侧栏面板」两个开关共同决定 */
export function setScheduledSidebarEnabled(enabled: boolean) {
  state.enabled = enabled
  if (enabled) {
    void updateScheduledSidebar()
  } else {
    removeScheduledSidebar()
  }
}

export function removeScheduledSidebar() {
  document.getElementById(SCHEDULED_SIDEBAR_ID)?.remove()
  removeStyles(STYLE_ID)
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

/** 插入或更新面板。动态功能每轮都会调用，没有变化时只做几次 DOM 查询 */
export async function updateScheduledSidebar(): Promise<void> {
  if (!state.enabled) return
  await ensureLoaded()
  if (!state.enabled) return

  const sidebar = document.querySelector(selectors.rightSidebar)
  if (!sidebar || !isLoggedIn()) {
    document.getElementById(SCHEDULED_SIDEBAR_ID)?.remove()
    if (sidebar) scheduleRetry()
    return
  }
  const slot = findScheduledSidebarSlot(sidebar)
  if (!slot) {
    scheduleRetry()
    return
  }

  let panel = document.getElementById(SCHEDULED_SIDEBAR_ID)
  if (!panel) panel = createPanel()
  ensureStyles()
  placePanel(panel, slot)
  renderPanel(panel)
  ensureTicker()
  maybeAutoRefresh()
}

/** 右侧栏内容是异步加载的；没找到位置时每秒再试一次，每个页面最多 10 次 */
function scheduleRetry() {
  if (location.pathname !== retryPath) {
    retryPath = location.pathname
    retryCount = 0
  }
  if (retryTimer || retryCount >= 10) return
  retryCount++
  retryTimer = setTimeout(() => {
    retryTimer = null
    void updateScheduledSidebar()
  }, 1000)
}

/** 每分钟更新一次：去掉已发布的条目、更新「下一条还有多久」，面板被 X 移除时重新插入 */
function ensureTicker() {
  if (ticker) return
  ticker = setInterval(() => {
    if (document.hidden) return
    void updateScheduledSidebar()
  }, TICK_MS)
}

/** 距上次读取超过 30 分钟时自动读一次，所有标签页合计 */
function maybeAutoRefresh() {
  const now = Date.now()
  if (state.refreshing || now < nextAutoRefreshCheck) return
  nextAutoRefreshCheck = now + TICK_MS
  let last = 0
  try {
    last = Number(localStorage.getItem(AUTO_REFRESH_KEY)) || 0
  } catch {}
  if (now - last >= AUTO_REFRESH_INTERVAL_MS) void refreshScheduledSidebar()
}

export async function refreshScheduledSidebar(): Promise<void> {
  if (state.refreshing) return
  state.refreshing = true
  state.error = ''
  try {
    localStorage.setItem(AUTO_REFRESH_KEY, String(Date.now()))
  } catch {}
  rerender()
  try {
    setItems(await requestScheduledRefresh())
  } catch (e) {
    state.error = errorText(e) || t('error.readFailed')
  } finally {
    state.refreshing = false
    rerender()
  }
}

function toggleCollapsed() {
  state.collapsed = !state.collapsed
  rerender()
  void setStorage({ [KeyScheduledSidebarCollapsed]: state.collapsed ? 'on' : 'off' })
}

// ---------- 渲染 ----------

const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4V3h2v1h6V3h2v1h1.5C19.89 4 21 5.12 21 6.5v12c0 1.38-1.11 2.5-2.5 2.5h-13C4.12 21 3 19.88 3 18.5v-12C3 5.12 4.12 4 5.5 4H7zm0 2H5.5c-.27 0-.5.22-.5.5v12c0 .28.23.5.5.5h13c.28 0 .5-.22.5-.5v-12c0-.28-.22-.5-.5-.5H17v1h-2V6H9v1H7V6z"/></svg>'
const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>'
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/></svg>'
const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>'
const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function icon(svg: string): HTMLSpanElement {
  const span = el('span', 'xf-sched-side-svg')
  span.innerHTML = svg
  return span
}

function createPanel(): HTMLElement {
  const panel = el('div', 'xf-sched-side')
  panel.id = SCHEDULED_SIDEBAR_ID
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', t('feature.scheduledPanorama.label'))
  panel.addEventListener('click', (event) => {
    const action = (event.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'refresh') void refreshScheduledSidebar()
    else if (action === 'toggle') toggleCollapsed()
  })
  return panel
}

function rerender() {
  const panel = document.getElementById(SCHEDULED_SIDEBAR_ID)
  if (panel) renderPanel(panel)
}

function renderPanel(panel: HTMLElement) {
  const now = new Date()
  const sig = [
    state.itemsSig,
    state.collapsed,
    state.refreshing,
    state.error,
    Math.floor(now.getTime() / TICK_MS),
  ].join('|')
  if (panel.dataset.xfSig === sig) return
  panel.dataset.xfSig = sig

  const theme = getThemeColors()
  panel.style.setProperty('--xf-ss-fg', theme.fg)
  panel.style.setProperty('--xf-ss-fg2', theme.fgSecondary)
  panel.style.setProperty('--xf-ss-fg3', theme.isDark ? 'rgb(113, 118, 123)' : 'rgb(139, 152, 165)')
  panel.style.setProperty('--xf-ss-border', theme.border)
  panel.style.setProperty('--xf-ss-hover', theme.hoverBg)
  panel.classList.toggle('is-collapsed', state.collapsed)

  const groups = buildScheduleDayGroups(state.items, now)
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const scrollTop = panel.querySelector('.xf-sched-side-list')?.scrollTop ?? 0

  const children: HTMLElement[] = [renderHead(total)]
  if (!state.collapsed) children.push(renderBody(groups, now))
  panel.replaceChildren(...children)

  const list = panel.querySelector('.xf-sched-side-list')
  if (list && scrollTop) list.scrollTop = scrollTop
}

function renderHead(total: number): HTMLElement {
  const head = el('div', 'xf-sched-side-head')

  const title = el('span', 'xf-sched-side-title')
  title.append(icon(ICON_CALENDAR), el('span', undefined, t('feature.scheduledPanorama.label')))

  const link = el('a', 'xf-sched-side-link')
  link.href = SCHEDULED_LIST_PATH
  link.title = t('sidebar.openListTitle')
  link.setAttribute('aria-label', t('sidebar.openList'))
  link.append(icon(ICON_OPEN), el('span', 'xf-sched-side-link-text', t('sidebar.openList')))

  const refresh = el('button', 'xf-sched-side-icon')
  refresh.type = 'button'
  refresh.dataset.action = 'refresh'
  refresh.disabled = state.refreshing
  refresh.classList.toggle('is-spinning', state.refreshing)
  refresh.setAttribute('aria-label', state.refreshing ? t('sidebar.reading') : t('sidebar.reload'))
  refresh.title = state.refreshing ? t('sidebar.reading') : t('sidebar.reloadTitle')
  refresh.append(icon(ICON_REFRESH))

  const count = el('span', 'xf-sched-side-count', t('sidebar.count', { count: total }))

  const toggle = el('button', 'xf-sched-side-toggle')
  toggle.type = 'button'
  toggle.dataset.action = 'toggle'
  toggle.setAttribute('aria-expanded', String(!state.collapsed))
  toggle.setAttribute('aria-label', state.collapsed ? t('sidebar.expandLabel') : t('sidebar.collapseLabel'))
  toggle.append(el('span', 'xf-sched-side-toggle-text', state.collapsed ? t('sidebar.expand') : t('sidebar.collapse')), icon(state.collapsed ? ICON_DOWN : ICON_UP))

  head.append(title, link, refresh, el('span', 'xf-sched-side-spacer'), count, toggle)
  return head
}

function renderBody(groups: ScheduleDayGroup[], now: Date): HTMLElement {
  const body = el('div', 'xf-sched-side-body')
  if (state.error) {
    const error = el('p', 'xf-sched-side-error', t('sidebar.readFailed', { reason: state.error }))
    error.setAttribute('role', 'status')
    body.append(error)
  }
  if (!groups.length) {
    body.append(el('p', 'xf-sched-side-empty', state.refreshing ? t('sidebar.readingEllipsis') : t('sidebar.empty')))
    return body
  }

  const list = el('div', 'xf-sched-side-list')
  for (const group of groups) {
    const day = el('div', 'xf-sched-side-day')
    const dayHead = el('div', 'xf-sched-side-day-head')
    dayHead.append(
      el('span', 'xf-sched-side-day-label', group.label),
      el('span', 'xf-sched-side-day-count', t('sidebar.dayCount', { count: group.rows.length })),
      el('span', 'xf-sched-side-day-rule'),
    )
    if (group.note) {
      const note = el('span', 'xf-sched-side-day-note', group.note.text)
      note.style.color = group.note.color
      dayHead.append(note)
    }
    day.append(dayHead)

    for (const row of group.rows) {
      if (row.gap) {
        const gap = el('div', `xf-sched-side-gap${row.gap.tight ? ' is-tight' : ''}`, `${row.gap.label} ${row.gap.text}`)
        if (row.gap.tight) gap.style.color = row.gap.color
        day.append(gap)
      }
      day.append(renderItem(row, now))
    }
    list.append(day)
  }
  body.append(list)
  return body
}

function renderItem(row: ScheduleRow, now: Date): HTMLElement {
  const date = new Date(row.item.timestamp)
  const text = row.item.text.replace(/\s+/g, ' ').trim()
  const item = el('a', 'xf-sched-side-item')
  item.href = SCHEDULED_LIST_PATH
  item.title = `${dayjs(date).format('YYYY-MM-DD HH:mm')}（${formatRelativePublishTime(date, now)}）\n${row.item.text.slice(0, 280)}`
  item.style.setProperty('--c', row.theme.accentColor)
  item.style.setProperty('--bg', row.theme.bg)
  item.style.setProperty('--bd', `${row.theme.borderColor}55`)
  item.append(
    el('span', 'xf-sched-side-time', row.time),
    el('span', 'xf-sched-side-sep'),
    el('span', 'xf-sched-side-text', text || t('sidebar.mediaOnly')),
  )
  return item
}

function ensureStyles() {
  if (stylesExist(STYLE_ID)) return
  addStyles(STYLE_ID, `
#${SCHEDULED_SIDEBAR_ID} { container-type: inline-size; box-sizing: border-box; margin: 0 0 16px; padding: 12px 12px 10px; border: 1px solid ${accentAlpha(0.35)}; border-radius: 16px; background: ${accentAlpha(0.04)}; color: var(--xf-ss-fg); font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.3; }
#${SCHEDULED_SIDEBAR_ID} * { box-sizing: border-box; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-svg { display: inline-flex; flex-shrink: 0; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-svg svg { width: 100%; height: 100%; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
#${SCHEDULED_SIDEBAR_ID}:not(.is-collapsed) .xf-sched-side-head { padding-bottom: 10px; margin-bottom: 8px; border-bottom: 1px solid var(--xf-ss-border); }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-title { display: inline-flex; align-items: center; gap: 6px; color: ${ACCENT}; font-size: 14px; font-weight: 800; white-space: nowrap; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-title .xf-sched-side-svg { width: 16px; height: 16px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-link { display: inline-flex; align-items: center; gap: 3px; margin: -2px -4px; padding: 2px 4px; border-radius: 6px; color: ${ACCENT}; font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-link .xf-sched-side-svg { width: 13px; height: 13px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-link:hover { background: ${accentAlpha(0.1)}; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 26px; height: 26px; margin: -4px 0; padding: 5px; border: 0; border-radius: 999px; background: transparent; color: ${ACCENT}; cursor: pointer; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-icon .xf-sched-side-svg { width: 15px; height: 15px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-icon:hover:not(:disabled) { background: ${accentAlpha(0.1)}; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-icon:disabled { cursor: default; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-icon.is-spinning .xf-sched-side-svg { animation: xf-sched-side-spin 0.9s linear infinite; }
@keyframes xf-sched-side-spin { to { transform: rotate(360deg); } }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-spacer { flex: 1 1 auto; min-width: 0; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-count { flex-shrink: 0; padding: 2px 8px; border-radius: 999px; background: var(--xf-ss-hover); color: var(--xf-ss-fg2); font-size: 12px; font-weight: 700; white-space: nowrap; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-toggle { display: inline-flex; align-items: center; gap: 1px; flex-shrink: 0; padding: 2px 6px 2px 8px; border: 1px solid ${accentAlpha(0.45)}; border-radius: 999px; background: ${accentAlpha(0.12)}; color: ${ACCENT}; font: inherit; font-size: 12px; font-weight: 700; line-height: 1.3; white-space: nowrap; cursor: pointer; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-toggle .xf-sched-side-svg { width: 13px; height: 13px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-toggle:hover { background: ${accentAlpha(0.2)}; }
#${SCHEDULED_SIDEBAR_ID} a:focus-visible, #${SCHEDULED_SIDEBAR_ID} button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 1px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-list { max-height: 360px; margin-right: -6px; padding-right: 6px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--xf-ss-border) transparent; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-day + .xf-sched-side-day { margin-top: 12px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-day-head { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; color: var(--xf-ss-fg2); font-size: 13px; white-space: nowrap; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-day-label { font-weight: 700; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-day-count { color: var(--xf-ss-fg3); }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-day-rule { flex: 1 1 auto; min-width: 12px; border-top: 1px dashed var(--xf-ss-border); }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-day-note { font-size: 12px; font-weight: 600; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-item { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 12px; border: 1px solid var(--bd); border-radius: 10px; background: var(--bg); color: var(--xf-ss-fg); text-decoration: none; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-item:hover { border-color: var(--c); }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-time { flex-shrink: 0; color: var(--c); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-sep { flex-shrink: 0; width: 2px; height: 16px; border-radius: 1px; background: var(--c); opacity: 0.7; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-gap { display: flex; align-items: center; gap: 6px; margin: 4px 0 4px 16px; color: var(--xf-ss-fg3); font-size: 12px; font-weight: 600; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-gap::before { content: ""; height: 14px; border-left: 2px dotted currentColor; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-empty, #${SCHEDULED_SIDEBAR_ID} .xf-sched-side-error { margin: 2px 0; color: var(--xf-ss-fg2); font-size: 13px; }
#${SCHEDULED_SIDEBAR_ID} .xf-sched-side-error { margin-bottom: 8px; color: rgb(244, 33, 46); }
@container (max-width: 300px) { #${SCHEDULED_SIDEBAR_ID} .xf-sched-side-link-text, #${SCHEDULED_SIDEBAR_ID} .xf-sched-side-toggle-text { display: none; } #${SCHEDULED_SIDEBAR_ID} .xf-sched-side-toggle { padding: 2px 5px; } }
`)
}

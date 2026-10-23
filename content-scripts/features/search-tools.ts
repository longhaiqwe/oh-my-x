// 搜索：新的搜索默认打开「最新」标签；搜索结果页的标签下面加一排筛选，选择后改写搜索词再搜。
// 换地址由页面拦截器在 X 自己的环境里做（navigateSearchPage），这里只发消息。
import { KeySearchDefaultLatest, KeySearchFilterBar } from '../../storage-keys'
import { SEARCH_NAVIGATE_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { t, type MessageKey } from '../../shared/i18n'
import {
  EMPTY_SEARCH_FILTERS,
  SEARCH_LIKES_OPTIONS,
  SEARCH_MEDIA_OPTIONS,
  SEARCH_TIME_OPTIONS,
  buildSearchQuery,
  createSearchLatestTracker,
  filteredSearchHref,
  hasSearchFilters,
  parseSearchLocation,
  splitSearchQuery,
  type SearchFilters,
} from '../../shared/search-tools'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { ACCENT, accentAlpha, getThemeColors } from '../utilities/colors'
import { getStorage } from '../utilities/storage'

const BAR_CLASS = 'xf-search-filters'
// 「用户」「列表」标签里的结果不是帖子，筛选语法不适用
const FILTERABLE_TABS = new Set([null, 'live', 'media'])

type SelectField = 'time' | 'minLikes' | 'media'
type ToggleField = 'originalOnly' | 'following'

interface SelectSpec {
  field: SelectField
  label: MessageKey
  any: MessageKey
  options: readonly { value: string; label: MessageKey | ((value: string) => string) }[]
  /** 不在预设里的值（用户在搜索框里自己写的）怎么显示 */
  custom: (value: string) => string
}

const minLikesLabel = (value: string) => t('searchFilters.minLikes', { count: value })

const SELECTS: readonly SelectSpec[] = [
  {
    field: 'time',
    label: 'searchFilters.time',
    any: 'searchFilters.anyTime',
    options: SEARCH_TIME_OPTIONS.map((value) => ({ value, label: `searchFilters.within${value}` as MessageKey })),
    custom: (value) => `within_time:${value}`,
  },
  {
    field: 'minLikes',
    label: 'searchFilters.likes',
    any: 'searchFilters.anyLikes',
    options: SEARCH_LIKES_OPTIONS.map((value) => ({ value: String(value), label: minLikesLabel })),
    custom: minLikesLabel,
  },
  {
    field: 'media',
    label: 'searchFilters.mediaType',
    any: 'searchFilters.anyMedia',
    options: SEARCH_MEDIA_OPTIONS.map((value) => ({ value, label: `searchFilters.${value}` as MessageKey })),
    custom: (value) => `filter:${value}`,
  },
]

let latestEnabled = false
let filterBarEnabled = false
let initialized = false
let lastHref: string | null = null
const tracker = createSearchLatestTracker()

/** 请求页面拦截器在 X 页面里换地址（只接受搜索页和 Grok 页） */
export function navigateInPage(href: string, replace: boolean) {
  window.postMessage({ type: SEARCH_NAVIGATE_TYPE, href, replace, __xf: XF_BRIDGE_MARKER }, location.origin)
}

function ensureStyles() {
  if (stylesExist('searchFilters')) return
  addStyles('searchFilters', `
    .${BAR_CLASS}{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--xf-sf-border);color:var(--xf-sf-fg);font-family:TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:16px}
    .${BAR_CLASS} select,.${BAR_CLASS} button{box-sizing:border-box;height:32px;margin:0;border:1px solid var(--xf-sf-border);border-radius:9999px;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}
    .${BAR_CLASS} select{appearance:none;-webkit-appearance:none;padding:0 28px 0 12px;color-scheme:var(--xf-sf-scheme)}
    .${BAR_CLASS} option{background:var(--xf-sf-bg);color:var(--xf-sf-fg)}
    .${BAR_CLASS} button{padding:0 12px}
    .${BAR_CLASS} select:hover,.${BAR_CLASS} button:hover{background:var(--xf-sf-hover)}
    .${BAR_CLASS} select:focus-visible,.${BAR_CLASS} button:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px}
    .xf-search-select{position:relative;display:inline-flex}
    .xf-search-select::after{content:"";position:absolute;top:50%;right:13px;width:5px;height:5px;margin-top:-4px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);pointer-events:none}
    .xf-search-select[data-active="true"],.${BAR_CLASS} button[aria-pressed="true"]{color:${ACCENT}}
    .xf-search-select[data-active="true"] select,.${BAR_CLASS} button[aria-pressed="true"]{border-color:${ACCENT};background:${accentAlpha(0.1)}}
    .${BAR_CLASS} .xf-search-clear{border-color:transparent;color:${ACCENT}}
    .${BAR_CLASS} .xf-search-clear[hidden]{display:none}
  `)
}

/** 当前搜索页的标签栏（nav）；标签链接指向搜索页或话题标签页才算 */
function findSearchTabs(): HTMLElement | null {
  const tab = document.querySelector<HTMLElement>(
    '[data-testid="primaryColumn"] nav [role="tab"][href^="/search?"], [data-testid="primaryColumn"] nav [role="tab"][href^="/hashtag/"]',
  )
  return tab?.closest<HTMLElement>('nav') ?? null
}

function currentState() {
  const page = parseSearchLocation(location.href)
  if (!page) return null
  return { page, ...splitSearchQuery(page.query) }
}

/** 按新的条件换地址；停在「热门」时记住新搜索词，默认「最新」不再把它切走 */
function applyFilters(filters: SearchFilters, following: boolean) {
  const state = currentState()
  if (!state) return
  const query = buildSearchQuery(state.terms, filters)
  const href = filteredSearchHref(location.href, query, following)
  if (!href) return
  if (!state.page.tab) tracker.keepTop(query)
  navigateInPage(href, false)
}

function onSelectChange(field: SelectField, value: string) {
  const state = currentState()
  if (!state) return
  const filters = { ...state.filters }
  if (field === 'minLikes') filters.minLikes = value ? Number(value) : null
  else filters[field] = value || null
  applyFilters(filters, state.page.following)
}

function onToggle(field: ToggleField) {
  const state = currentState()
  if (!state) return
  if (field === 'following') applyFilters(state.filters, !state.page.following)
  else applyFilters({ ...state.filters, originalOnly: !state.filters.originalOnly }, state.page.following)
}

function createBar(): HTMLElement {
  const bar = document.createElement('div')
  bar.className = BAR_CLASS
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', t('searchFilters.label'))

  for (const spec of SELECTS) {
    const wrap = document.createElement('span')
    wrap.className = 'xf-search-select'
    const select = document.createElement('select')
    select.dataset.field = spec.field
    select.setAttribute('aria-label', t(spec.label))
    const any = new Option(t(spec.any), '')
    select.append(any, ...spec.options.map(({ value, label }) =>
      new Option(typeof label === 'function' ? label(value) : t(label), value)))
    select.addEventListener('change', () => onSelectChange(spec.field, select.value))
    wrap.append(select)
    bar.append(wrap)
  }

  const toggles: [ToggleField, MessageKey][] = [['originalOnly', 'searchFilters.originalOnly'], ['following', 'searchFilters.following']]
  for (const [field, label] of toggles) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.field = field
    button.textContent = t(label)
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('click', () => onToggle(field))
    bar.append(button)
  }

  const clear = document.createElement('button')
  clear.type = 'button'
  clear.className = 'xf-search-clear'
  clear.textContent = t('searchFilters.clear')
  clear.addEventListener('click', () => applyFilters({ ...EMPTY_SEARCH_FILTERS }, false))
  bar.append(clear)
  return bar
}

function renderBar(bar: HTMLElement, filters: SearchFilters, following: boolean) {
  const theme = getThemeColors()
  for (const [key, value] of Object.entries({
    fg: theme.fg, bg: theme.bg, border: theme.border, hover: theme.hoverBg, scheme: theme.isDark ? 'dark' : 'light',
  })) {
    bar.style.setProperty(`--xf-sf-${key}`, value)
  }

  for (const spec of SELECTS) {
    const select = bar.querySelector<HTMLSelectElement>(`select[data-field="${spec.field}"]`)
    if (!select) continue
    const raw = filters[spec.field]
    const value = raw === null ? '' : String(raw)
    select.querySelectorAll('option[data-custom]').forEach((option) => option.remove())
    if (value && ![...select.options].some((option) => option.value === value)) {
      const custom = new Option(spec.custom(value), value)
      custom.dataset.custom = ''
      select.append(custom)
    }
    select.value = value
    select.parentElement!.dataset.active = String(Boolean(value))
  }

  const pressed: Record<ToggleField, boolean> = { originalOnly: filters.originalOnly, following }
  for (const [field, on] of Object.entries(pressed)) {
    bar.querySelector(`button[data-field="${field}"]`)?.setAttribute('aria-pressed', String(on))
  }
  bar.querySelector<HTMLElement>('.xf-search-clear')!.hidden = !hasSearchFilters(filters) && !following
}

function syncFilterBar() {
  const state = filterBarEnabled ? currentState() : null
  const nav = state && FILTERABLE_TABS.has(state.page.tab) ? findSearchTabs() : null
  const existing = document.querySelector<HTMLElement>(`.${BAR_CLASS}`)
  if (!state || !nav) {
    existing?.remove()
    return
  }
  let bar = existing
  if (!bar || bar.previousElementSibling !== nav) {
    existing?.remove()
    ensureStyles()
    bar = createBar()
    // 放在标签栏后面、同一层里，跟着 X 的顶部区域一起固定
    nav.after(bar)
  }
  if (bar.dataset.href !== location.href) {
    bar.dataset.href = location.href
    renderBar(bar, state.filters, state.page.following)
  }
}

/** 每轮动态循环调用：地址变了就判断要不要换成「最新」，再同步筛选条 */
export function updateSearchTools() {
  if (!initialized) return
  const href = location.href
  if (href !== lastHref) {
    lastHref = href
    const latest = latestEnabled ? tracker.next(href) : null
    if (latest) {
      navigateInPage(latest, true)
      return
    }
  }
  syncFilterBar()
}

// 用户自己点「热门」标签：这个搜索词之后保持「热门」
function onTabClick(event: MouseEvent) {
  const tab = (event.target as Element | null)?.closest?.('a[role="tab"][href]')
  const page = tab ? parseSearchLocation(tab.getAttribute('href')!) : null
  if (page && !page.tab) tracker.keepTop(page.query)
}

export function setSearchToolsSettings(settings: { latest: boolean; filterBar: boolean }) {
  latestEnabled = settings.latest
  filterBarEnabled = settings.filterBar
  updateSearchTools()
}

export async function initSearchTools() {
  const data = await getStorage([KeySearchDefaultLatest, KeySearchFilterBar])
  document.addEventListener('click', onTabClick, true)
  initialized = true
  // 读设置之前已经路过的地址也要按设置判断一次
  lastHref = null
  setSearchToolsSettings({
    latest: data?.[KeySearchDefaultLatest] !== 'off',
    filterBar: data?.[KeySearchFilterBar] !== 'off',
  })
}

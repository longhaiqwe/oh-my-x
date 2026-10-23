// 搜索框下拉：在 X 的「搜索“…”」下面加「问 Grok」和「用 AI 转成搜索语法」；可选在搜索框按回车时问 Grok。
// 问 Grok 打开 /i/grok?text=…，X 会先弹确认框，用户点 Send 后才发送（见 shared/search-tools.ts 的 grokAskHref）。
// AI 转搜索语法走后台 XF_BUILD_SEARCH_QUERY，用「设置 → AI 服务」的默认模型，拿到搜索词后用 X 自己的搜索。
import { KeySearchAiQuery, KeySearchAskGrok, KeySearchEnterGrok } from '../../storage-keys'
import { OPEN_SETTINGS, sendAiRequest } from '../../shared/ai-request'
import { CodedError, errorText, fromTransferable } from '../../shared/errors'
import { t } from '../../shared/i18n'
import { grokAskHref, searchHref } from '../../shared/search-tools'
import { STATIC_NAV_ITEMS } from '../../shared/staticNavIcons'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { getThemeColors } from '../utilities/colors'
import { getStorage } from '../utilities/storage'
import { navigateInPage } from './search-tools'

const INPUT_SELECTOR = 'input[data-testid="SearchBox_Search_Input"]'
const MENU_CLASS = 'xf-search-menu'
// X 的下拉内容是输入后异步出来的，输入或获得焦点后隔几次再看
const SYNC_DELAYS_MS = [0, 150, 400]
// 这些报错要去设置页处理，报错下面给一个入口
const SETTINGS_ERRORS = new Set(['error.aiNoKey', 'error.aiNoModel', 'error.aiNotAuthorized', 'error.aiBadUrl'])

const AI_ICON = '<path d="M12 2.5l1.8 5.2 5.2 1.8-5.2 1.8L12 16.5l-1.8-5.2L5 9.5l5.2-1.8zM18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>'

interface Settings {
  grok: boolean
  enterGrok: boolean
  ai: boolean
}

let settings: Settings = { grok: false, enterGrok: false, ai: false }
let listening = false
/** 正在转换的文字；输入框里的文字变了就取消 */
let aiRequest: { text: string; controller: AbortController } | null = null
let aiError: { text: string; message: string; needsSettings: boolean } | null = null
const observedLists = new WeakSet<Element>()

function ensureStyles() {
  if (stylesExist('searchMenu')) return
  addStyles('searchMenu', `
    .${MENU_CLASS}{border-bottom:1px solid var(--xf-sm-border)}
    .xf-search-menu-item{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin:0;padding:12px 16px;border:0;background:transparent;color:var(--xf-sm-fg);font-family:TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:20px;text-align:left;cursor:pointer}
    .xf-search-menu-item:hover,.xf-search-menu-item:focus-visible{background:var(--xf-sm-hover);outline:none}
    .xf-search-menu-item[aria-disabled="true"]{cursor:progress}
    .xf-search-menu-item svg{flex:none;width:20px;height:20px;fill:currentColor}
    .xf-search-menu-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .xf-search-menu-error{padding:0 16px 12px 48px;color:var(--xf-sm-muted);font-size:13px;line-height:16px}
    .xf-search-menu-error button{margin:4px 0 0;padding:0;border:0;background:transparent;color:var(--xf-accent, rgb(29, 155, 240));font:inherit;cursor:pointer}
    .xf-search-menu-error button:hover{text-decoration:underline}
  `)
}

function searchInputOf(target: EventTarget | null): HTMLInputElement | null {
  return target instanceof HTMLInputElement && target.matches(INPUT_SELECTOR) ? target : null
}

/** 输入框对应的下拉列表（X 用 aria-owns 指向它） */
function dropdownOf(input: HTMLInputElement): HTMLElement | null {
  const id = input.getAttribute('aria-owns') || input.getAttribute('aria-controls')
  const list = id ? document.getElementById(id) : null
  return list?.getAttribute('role') === 'listbox' ? list : null
}

function svg(viewBox: string, inner: string) {
  return `<svg viewBox="${viewBox}" aria-hidden="true">${inner}</svg>`
}

function grokIcon() {
  const item = STATIC_NAV_ITEMS.find((nav) => nav.id === 'grok')
  return item ? svg(item.viewBox, item.innerHTML) : ''
}

function menuItem(action: string, icon: string, label: string, busy = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'xf-search-menu-item'
  button.dataset.action = action
  // X 的按钮会抢焦点，这里不参与 Tab 顺序，用鼠标点
  button.tabIndex = -1
  if (busy) button.setAttribute('aria-disabled', 'true')
  button.innerHTML = icon
  const text = document.createElement('span')
  text.className = 'xf-search-menu-text'
  text.textContent = label
  button.append(text)
  return button
}

function renderMenu(menu: HTMLElement, text: string) {
  const loading = aiRequest?.text === text
  const error = !loading && aiError?.text === text ? aiError : null
  const signature = JSON.stringify([settings.grok, settings.ai, text, loading, error?.message ?? null])
  if (menu.dataset.signature === signature) return
  menu.dataset.signature = signature

  const theme = getThemeColors()
  for (const [key, value] of Object.entries({ fg: theme.fg, muted: theme.fgSecondary, border: theme.border, hover: theme.hoverBg })) {
    menu.style.setProperty(`--xf-sm-${key}`, value)
  }
  const children: HTMLElement[] = []
  if (settings.grok) children.push(menuItem('grok', grokIcon(), t('searchMenu.askGrok', { text })))
  if (settings.ai) {
    const label = loading ? t('searchMenu.aiLoading', { text }) : t('searchMenu.aiQuery', { text })
    children.push(menuItem('ai', svg('0 0 24 24', AI_ICON), label, loading))
    if (error) {
      const box = document.createElement('div')
      box.className = 'xf-search-menu-error'
      box.setAttribute('role', 'alert')
      box.textContent = error.message
      if (error.needsSettings) {
        const link = document.createElement('button')
        link.type = 'button'
        link.dataset.action = 'settings'
        link.textContent = t('searchMenu.openAiSettings')
        box.append(document.createElement('br'), link)
      }
      children.push(box)
    }
  }
  menu.replaceChildren(...children)
}

function createMenu(input: HTMLInputElement): HTMLElement {
  const menu = document.createElement('div')
  menu.className = MENU_CLASS
  menu.setAttribute('role', 'presentation')
  // 按下鼠标时不让输入框失焦，否则 X 会先关掉下拉
  menu.addEventListener('mousedown', (event) => event.preventDefault())
  menu.addEventListener('click', (event) => {
    const action = (event.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset.action
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    onAction(action, input)
  })
  return menu
}

/** 把附加选项放在 X 的第一项（「搜索“…”」）后面；没有文字或没有下拉时去掉 */
function syncMenu(input: HTMLInputElement) {
  const list = dropdownOf(input)
  if (list && !observedLists.has(list)) {
    observedLists.add(list)
    // 下拉里的项目要等 X 的查询返回（实测约 2 秒）才出来，X 换内容时也可能把附加选项挤走：
    // 有变化就重新放；位置和内容没变时不改 DOM。下拉还是空的时候也先挂上
    new MutationObserver(() => {
      const current = document.querySelector<HTMLInputElement>(`${INPUT_SELECTOR}[aria-owns="${list.id}"]`) ?? input
      syncMenu(current)
    }).observe(list, { childList: true })
  }
  const text = input.value.trim()
  const existing = list?.querySelector<HTMLElement>(`:scope > .${MENU_CLASS}`) ?? null
  const first = list?.querySelector<HTMLElement>(':scope > [role="option"]') ?? null
  if (!list || !first || !text || (!settings.grok && !settings.ai)) {
    existing?.remove()
    return
  }
  let menu = existing
  if (!menu || menu.previousElementSibling !== first) {
    existing?.remove()
    ensureStyles()
    menu = createMenu(input)
    first.after(menu)
  }
  renderMenu(menu, text)
}

function scheduleSync(input: HTMLInputElement) {
  for (const delay of SYNC_DELAYS_MS) setTimeout(() => { if (input.isConnected) syncMenu(input) }, delay)
}

function cancelAi() {
  aiRequest?.controller.abort()
  aiRequest = null
}

/** 关掉 X 的下拉：输入框失焦后 X 自己会收起 */
function closeDropdown(input: HTMLInputElement) {
  input.blur()
}

function askGrok(input: HTMLInputElement) {
  const href = grokAskHref(input.value)
  if (!href) return
  navigateInPage(href, false)
  closeDropdown(input)
}

async function convertWithAi(input: HTMLInputElement) {
  const text = input.value.trim()
  if (!text || aiRequest?.text === text) return
  cancelAi()
  const controller = new AbortController()
  aiRequest = { text, controller }
  aiError = null
  syncMenu(input)
  try {
    const response = await sendAiRequest({ type: 'XF_BUILD_SEARCH_QUERY', text }, controller.signal)
    if (!response?.ok) throw fromTransferable(response?.error, 'error.aiFailed')
    if (aiRequest?.controller !== controller) return
    aiRequest = null
    const href = response.query ? searchHref(response.query) : null
    if (!href) throw new CodedError('error.searchAiEmpty')
    navigateInPage(href, false)
    closeDropdown(input)
  } catch (error) {
    if (controller.signal.aborted || aiRequest?.controller !== controller) return
    aiRequest = null
    aiError = {
      text,
      message: errorText(error, 'error.aiFailed'),
      needsSettings: error instanceof CodedError && SETTINGS_ERRORS.has(error.code),
    }
    if (input.isConnected) syncMenu(input)
  }
}

function onAction(action: string, input: HTMLInputElement) {
  if (action === 'grok' && settings.grok) askGrok(input)
  else if (action === 'ai' && settings.ai) void convertWithAi(input)
  else if (action === 'settings') {
    try {
      void browser.runtime.sendMessage({ type: OPEN_SETTINGS, module: 'settings' })?.catch?.(() => {})
    } catch {
      // 插件更新后旧页面连不上后台，忽略
    }
  }
}

function onInput(event: Event) {
  const input = searchInputOf(event.target)
  if (!input) return
  const text = input.value.trim()
  if (aiRequest && aiRequest.text !== text) cancelAi()
  if (aiError && aiError.text !== text) aiError = null
  scheduleSync(input)
}

function onFocusIn(event: Event) {
  const input = searchInputOf(event.target)
  if (input) scheduleSync(input)
}

// 比 X 先收到按键；用方向键选中了下拉里的项目、输入法组字中、带修饰键时都交给 X
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
  const input = searchInputOf(event.target)
  if (!input || !settings.grok || !settings.enterGrok || !input.value.trim()) return
  if (dropdownOf(input)?.querySelector('[role="option"][aria-selected="true"]')) return
  event.preventDefault()
  event.stopImmediatePropagation()
  askGrok(input)
}

function listeners(): [EventTarget, string, EventListener, boolean][] {
  return [
    [document, 'input', onInput, true],
    [document, 'focusin', onFocusIn, true],
    [window, 'keydown', onKeyDown as EventListener, true],
  ]
}

export function setSearchMenuSettings(next: Settings) {
  settings = next
  const listen = next.grok || next.ai
  if (listen !== listening) {
    listening = listen
    for (const [target, type, listener, capture] of listeners()) {
      if (listen) target.addEventListener(type, listener, capture)
      else target.removeEventListener(type, listener, capture)
    }
  }
  if (!next.ai) {
    cancelAi()
    aiError = null
  }
  document.querySelectorAll<HTMLInputElement>(INPUT_SELECTOR).forEach(syncMenu)
}

export async function initSearchMenu() {
  const data = await getStorage([KeySearchAskGrok, KeySearchEnterGrok, KeySearchAiQuery])
  setSearchMenuSettings({
    grok: data?.[KeySearchAskGrok] !== 'off',
    enterGrok: data?.[KeySearchEnterGrok] === 'on',
    ai: data?.[KeySearchAiQuery] !== 'off',
  })
}

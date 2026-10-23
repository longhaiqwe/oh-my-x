// 按名字艾特：在发帖框 @ 后面输入非英文名字时，用 X 的用户查询接口列出账号，选中后换成 @用户名。
// 纯英文的 @ 由 X 自己的候选框处理，这里不重复。
import { KeyMentionByName } from '../../storage-keys'
import { t } from '../../shared/i18n'
import { errorText } from '../../shared/errors'
import { MENTION_SEARCH_MESSAGE, findMentionQuery, type MentionUser } from '../../shared/mention-search'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { getThemeColors } from '../utilities/colors'
import { getStorage } from '../utilities/storage'

const EDITOR_SELECTOR = '[data-testid^="tweetTextarea"][contenteditable="true"]'
const UPDATE_DELAY_MS = 150
const MENU_WIDTH = 320
const MENU_MAX_HEIGHT = 360
const CACHE_LIMIT = 30

interface MentionSession {
  editor: HTMLElement
  query: string
  users: MentionUser[]
  active: number
  status: 'loading' | 'ready' | 'error'
  error: string
}

interface Caret {
  editor: HTMLElement
  /** 光标所在的段落；X 的编辑器每段一个 data-block */
  block: HTMLElement
  textBefore: string
}

let enabled = false
let composing = false
let updateTimer: ReturnType<typeof setTimeout> | undefined
let session: MentionSession | null = null
let menu: HTMLElement | null = null
// 按 Esc 关掉后，同一个名字不再弹出，改了名字再查
let dismissedQuery: string | null = null
let sequence = 0
const cache = new Map<string, MentionUser[]>()

function ensureStyles() {
  if (stylesExist('mentionByName')) return
  addStyles('mentionByName', `
    .xf-mention-menu{position:fixed;z-index:10000;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;padding:4px 0;border:1px solid var(--xf-mention-border);border-radius:8px;background:var(--xf-mention-bg);color:var(--xf-mention-fg);box-shadow:var(--xf-mention-shadow);font-family:TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:20px}
    .xf-mention-menu *{box-sizing:border-box}
    .xf-mention-option{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer}
    .xf-mention-option:hover,.xf-mention-option[aria-selected="true"]{background:var(--xf-mention-hover)}
    .xf-mention-avatar{flex:none;width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--xf-mention-hover)}
    .xf-mention-text{display:flex;flex-direction:column;min-width:0}
    .xf-mention-name{display:flex;align-items:center;gap:2px;min-width:0;font-weight:700}
    .xf-mention-name>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .xf-mention-name svg{flex:none;width:18px;height:18px}
    .xf-mention-handle,.xf-mention-following{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--xf-mention-muted)}
    .xf-mention-following{font-size:13px;line-height:16px}
    .xf-mention-status{padding:12px 16px;color:var(--xf-mention-muted)}
    .xf-mention-status:empty{display:none}
  `)
}

function elementOf(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null
}

function readCaret(): Caret | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
  const anchor = elementOf(selection.anchorNode)
  const editor = anchor?.closest<HTMLElement>(EDITOR_SELECTOR)
  if (!anchor || !editor || !editor.contains(document.activeElement)) return null
  const paragraph = anchor.closest<HTMLElement>('[data-block="true"]')
  const block = paragraph && editor.contains(paragraph) ? paragraph : editor
  const range = selection.getRangeAt(0)
  const before = document.createRange()
  before.selectNodeContents(block)
  before.setEnd(range.endContainer, range.endOffset)
  return { editor, block, textBefore: before.toString() }
}

/** 按段落里的文字位置建选区；X 会把一段文字拆成多个节点 */
function rangeForText(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && start <= offset + length) {
      range.setStart(node, start - offset)
      started = true
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset)
      return range
    }
    offset += length
  }
  return null
}

function scheduleUpdate() {
  clearTimeout(updateTimer)
  updateTimer = setTimeout(updateMentionMenu, UPDATE_DELAY_MS)
}

/** 按光标前的文字决定显示、更新还是关闭候选框 */
export function updateMentionMenu() {
  if (!enabled || composing) return
  const caret = readCaret()
  const found = caret ? findMentionQuery(caret.textBefore) : null
  if (!caret || !found) {
    dismissedQuery = null
    closeMenu()
    return
  }
  if (found.query === dismissedQuery) return
  dismissedQuery = null
  if (session?.editor === caret.editor && session.query === found.query) {
    positionMenu()
    return
  }
  search(caret.editor, found.query)
}

function remember(query: string, users: MentionUser[]) {
  cache.delete(query)
  cache.set(query, users)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
}

async function requestUsers(query: string): Promise<MentionUser[]> {
  const res = await browser.runtime.sendMessage({ type: MENTION_SEARCH_MESSAGE, query })
  if (!res?.ok) throw res?.error ?? null
  return Array.isArray(res.users) ? res.users : []
}

function search(editor: HTMLElement, query: string) {
  const id = ++sequence
  const cached = cache.get(query)
  // 查新名字时先留着上一个名字的结果，避免每打一个字列表闪一下
  const previous = session?.editor === editor ? session.users : []
  session = { editor, query, users: cached ?? previous, active: 0, status: cached ? 'ready' : 'loading', error: '' }
  renderMenu()
  if (cached) return
  requestUsers(query).then(
    (users) => {
      remember(query, users)
      if (id !== sequence || !session) return
      session.users = users
      session.active = 0
      session.status = 'ready'
      renderMenu()
    },
    (error) => {
      if (id !== sequence || !session) return
      session.users = []
      session.status = 'error'
      session.error = errorText(error, 'error.mentionSearchFailed')
      renderMenu()
    },
  )
}

function verifiedBadge(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', t('mention.verified'))
  // 认证徽章是 X 固定的蓝色，不跟强调色
  svg.innerHTML = '<circle cx="12" cy="12" r="10" fill="rgb(29, 155, 240)"/><path d="m7.5 12.2 3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
  return svg
}

function renderOption(user: MentionUser, index: number, active: boolean): HTMLElement {
  const option = document.createElement('div')
  option.className = 'xf-mention-option'
  option.id = `xf-mention-option-${index}`
  option.dataset.index = String(index)
  option.setAttribute('role', 'option')
  option.setAttribute('aria-selected', String(active))

  const avatar = document.createElement(user.avatar ? 'img' : 'span')
  avatar.className = 'xf-mention-avatar'
  if (avatar instanceof HTMLImageElement) {
    avatar.src = user.avatar
    avatar.alt = ''
  }

  const text = document.createElement('span')
  text.className = 'xf-mention-text'
  const name = document.createElement('span')
  name.className = 'xf-mention-name'
  const nameText = document.createElement('span')
  nameText.textContent = user.name
  name.append(nameText)
  if (user.verified) name.append(verifiedBadge())
  const handle = document.createElement('span')
  handle.className = 'xf-mention-handle'
  handle.textContent = `@${user.handle}`
  text.append(name, handle)
  if (user.following) {
    const following = document.createElement('span')
    following.className = 'xf-mention-following'
    following.textContent = t('mention.following')
    text.append(following)
  }

  option.append(avatar, text)
  return option
}

function ensureMenu(): HTMLElement {
  if (menu?.isConnected) return menu
  ensureStyles()
  const el = document.createElement('div')
  el.className = 'xf-mention-menu'
  el.dataset.testid = 'xf-mention-menu'
  el.innerHTML = '<div class="xf-mention-status" role="status" aria-live="polite"></div><div class="xf-mention-list" role="listbox"></div>'
  el.querySelector('[role="listbox"]')!.setAttribute('aria-label', t('mention.listLabel'))
  // 点选时不让编辑器失焦，光标留在原处
  el.addEventListener('mousedown', event => event.preventDefault())
  el.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('[data-index]')
    const user = option && session?.users[Number(option.dataset.index)]
    if (user) choose(user)
  })
  document.body.appendChild(el)
  menu = el
  return el
}

function renderMenu() {
  if (!session) return
  const el = ensureMenu()
  const theme = getThemeColors()
  for (const [key, value] of Object.entries({ bg: theme.bg, fg: theme.fg, muted: theme.fgSecondary, border: theme.border, hover: theme.hoverBg, shadow: theme.shadow })) {
    el.style.setProperty(`--xf-mention-${key}`, value)
  }
  const { users, status, query, active } = session
  const list = el.querySelector<HTMLElement>('[role="listbox"]')!
  list.replaceChildren(...users.map((user, index) => renderOption(user, index, index === active)))
  el.querySelector<HTMLElement>('[role="status"]')!.textContent = users.length
    ? ''
    : status === 'loading'
      ? t('mention.loading', { query })
      : status === 'error'
        ? session.error
        : t('mention.empty', { query })
  positionMenu()
}

function highlight(index: number) {
  if (!session || !menu) return
  session.active = index
  for (const option of menu.querySelectorAll<HTMLElement>('[role="option"]')) {
    option.setAttribute('aria-selected', String(option.dataset.index === String(index)))
  }
  menu.querySelector<HTMLElement>(`#xf-mention-option-${index}`)?.scrollIntoView?.({ block: 'nearest' })
}

function caretRect(editor: HTMLElement): DOMRect {
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const rects = typeof range?.getClientRects === 'function' ? range.getClientRects() : null
  const rect = rects?.length
    ? rects[rects.length - 1]
    : typeof range?.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null
  // 光标在空段落时量不到位置，退回编辑器的位置
  return rect && (rect.width || rect.height) ? rect : editor.getBoundingClientRect()
}

function positionMenu() {
  if (!session || !menu) return
  const rect = caretRect(session.editor)
  const width = Math.min(MENU_WIDTH, window.innerWidth - 16)
  menu.style.width = `${width}px`
  menu.style.left = `${Math.max(8, Math.min(rect.left - 16, window.innerWidth - width - 8))}px`
  // 光标下方放得下就放下方；放不下时放在空间大的一侧，高度按那一侧的空间收
  const natural = Math.min(MENU_MAX_HEIGHT, menu.scrollHeight + 2)
  const spaceBelow = window.innerHeight - rect.bottom - 16
  const spaceAbove = rect.top - 16
  const above = natural > spaceBelow && spaceAbove > spaceBelow
  const height = Math.min(natural, Math.max(above ? spaceAbove : spaceBelow, 80))
  menu.style.maxHeight = `${height}px`
  menu.style.top = `${above ? rect.top - 8 - height : rect.bottom + 8}px`
}

function closeMenu() {
  sequence++
  session = null
  menu?.remove()
  menu = null
}

/** 把光标前的「@名字」换成「@用户名 」 */
function insertText(editor: HTMLElement, text: string) {
  try {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    const paste = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true })
    // composer.ts 的 Markdown 粘贴处理跳过带这个标记的事件
    ;(paste as ClipboardEvent & { __xfHandled?: boolean }).__xfHandled = true
    // X 的编辑器处理粘贴后会取消事件
    if (!editor.dispatchEvent(paste)) return
  } catch {
    // 用下面的 insertText
  }
  try {
    document.execCommand('insertText', false, text)
  } catch {
    // 替换不了时留着选中的「@名字」
  }
}

function choose(user: MentionUser) {
  const current = session
  if (!current) return
  closeMenu()
  const caret = readCaret()
  if (!caret || caret.editor !== current.editor) return
  const found = findMentionQuery(caret.textBefore)
  const range = found && rangeForText(caret.block, found.start, caret.textBefore.length)
  if (!range) return
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  // 浏览器要到下一轮才发 selectionchange；X 的编辑器靠它读选区，不立即发的话粘贴会插在原来的光标处。
  // 也不能等下一轮：中间打的字会先替换掉选中的「@名字」
  document.dispatchEvent(new Event('selectionchange'))
  insertText(current.editor, `@${user.handle} `)
}

function stop(event: Event) {
  event.preventDefault()
  event.stopImmediatePropagation()
}

function onKeyDown(event: KeyboardEvent) {
  const current = session
  // 输入法选字时的按键留给输入法
  if (!current || event.isComposing || event.keyCode === 229) return
  if (!(event.target instanceof Node) || !current.editor.contains(event.target)) return
  if (event.key === 'Escape') {
    // 只关候选框，不让 X 关掉发帖弹窗
    dismissedQuery = current.query
    closeMenu()
    stop(event)
    return
  }
  // ⌘/Ctrl + 回车是 X 的发帖快捷键，不拦
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const count = current.users.length
  if (!count) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    stop(event)
    highlight((current.active + (event.key === 'ArrowDown' ? 1 : count - 1)) % count)
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    stop(event)
    choose(current.users[current.active])
  }
}

function onCompositionStart() {
  composing = true
}

function onCompositionEnd() {
  composing = false
  scheduleUpdate()
}

function onViewportChange() {
  if (session) positionMenu()
}

function listeners(): [EventTarget, string, EventListener, boolean][] {
  return [
    [document, 'selectionchange', scheduleUpdate, false],
    [document, 'input', scheduleUpdate, true],
    [document, 'focusout', scheduleUpdate, true],
    [document, 'compositionstart', onCompositionStart, true],
    [document, 'compositionend', onCompositionEnd, true],
    // 比 X 的编辑器先收到按键
    [window, 'keydown', onKeyDown as EventListener, true],
    [window, 'scroll', onViewportChange, true],
    [window, 'resize', onViewportChange, false],
  ]
}

export function setMentionByNameEnabled(next: boolean) {
  if (next === enabled) return
  enabled = next
  for (const [target, type, listener, capture] of listeners()) {
    if (next) target.addEventListener(type, listener, capture)
    else target.removeEventListener(type, listener, capture)
  }
  if (!next) {
    clearTimeout(updateTimer)
    composing = false
    dismissedQuery = null
    closeMenu()
  }
}

export async function initMentionByName() {
  setMentionByNameEnabled((await getStorage(KeyMentionByName)) !== 'off')
}

/**
 * 发帖框多图排版与排序（isolated world）。
 *
 * - 排版：2 到 20 张全是图片时，把 X 的分列布局改成两列等大格子，按发帖顺序从左到右、从上到下排，
 *   超过 4 张可切换总览和大图；右下角标序号，图片完整显示。只改 CSS 和 data 属性，不移动 X 的节点。
 * - 排序：按住图片拖到别的格子，松手后请 MAIN world（shared/composer-media-bridge.ts）改 X 自己的图片顺序，
 *   预览和发出的帖子都用新顺序。
 * - 每张图的编号和顺序由 MAIN world 读 X 的组件数据后写进 DOM；读不到时保持 X 原样。
 */
import { t } from '../../shared/i18n'
import {
  COMPOSER_MEDIA_REORDER_EVENT,
  COMPOSER_MEDIA_SYNC_EVENT,
  MAX_COMPOSER_MEDIA,
  MEDIA_ID_ATTR,
  MEDIA_IDS_ATTR,
  MEDIA_IMAGE_ATTR,
  MEDIA_INDEX_ATTR,
  MEDIA_REORDER_ATTR,
  MEDIA_REORDER_RESULT_ATTR,
  moveItem,
  parseMediaIds,
  slotFromPoint,
  type SlotRect,
} from '../../shared/composer-media'
import addStyles, { removeStyles, stylesExist } from '../utilities/addStyles'
import { ACCENT, ACCENT_TEXT, getThemeColors } from '../utilities/colors'
import { getXFontFamily } from '../utilities/xTypography'

const ROOT_SELECTOR = '[data-testid="attachments"]'
const STYLE_ID = 'composerMediaGrid'

export const GRID_ATTR = 'data-xf-media-grid'
export const WRAPPER_ATTR = 'data-xf-media-wrapper'
export const COLUMN_ATTR = 'data-xf-media-column'
export const FRAME_ATTR = 'data-xf-media-frame'
export const SPACER_ATTR = 'data-xf-media-spacer'
export const SLOT_ATTR = 'data-xf-media-slot'
export const ORDER_ATTR = 'data-xf-media-order'
export const VIEW_ATTR = 'data-xf-media-view'
const TOOLBAR_CLASS = 'xf-media-toolbar'
const views = new WeakMap<HTMLElement, 'overview' | 'detail'>()
const selectedIds = new WeakMap<HTMLElement, string>()
const DRAGGING_ATTR = 'data-xf-media-dragging'
const TITLE_MARK_ATTR = 'data-xf-media-title'
const LAYOUT_ATTRS = [WRAPPER_ATTR, COLUMN_ATTR, FRAME_ATTR, SPACER_ATTR, SLOT_ATTR, ORDER_ATTR, DRAGGING_ATTR]

/** 按下后移动超过这个距离才算拖动，否则交给 X 处理点击 */
const DRAG_THRESHOLD = 5

let enabled = true
const observers = new Map<HTMLElement, MutationObserver>()
const boundRoots = new WeakSet<HTMLElement>()

export interface MediaGridLayout {
  wrapper: HTMLElement
  columns: HTMLElement[]
  frames: HTMLElement[]
  spacers: HTMLElement[]
  /** 按发帖顺序排列的图片格子 */
  groups: HTMLElement[]
}

interface DragState {
  root: HTMLElement
  group: HTMLElement
  groups: HTMLElement[]
  ids: string[]
  from: number
  target: number
  rects: SlotRect[]
  pointerId: number
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  started: boolean
  ghost: HTMLElement | null
  x: number
  y: number
  frame: number | null
}

let drag: DragState | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

// Refactoring UI §2.1 / §3.6：图片为主，模式切换次之，移动快捷操作与提示再次之。
// §2.2 / §2.8 / §8.5：复用 X 字体；13px 控件、12px 提示，400/600 两种字重。
// 模式切换用浅底分段控件，移动用文字按钮；沿用 4/8/12 间距和 8px 圆角。
// 总览 5 列（窄屏 4 列），大图 2 列。键盘焦点和边缘滚动是交互补充。
function ensureStyles() {
  if (stylesExist(STYLE_ID)) return
  const grid = `[${GRID_ATTR}]`
  const slotOrders = Array.from({ length: MAX_COMPOSER_MEDIA }, (_, i) => `${grid} [${SLOT_ATTR}="${i}"]{order:${i}!important}`).join('')
  addStyles(STYLE_ID, [
    `${grid} [${SPACER_ATTR}]{display:none!important}`,
    // 网格无需原生轮播导航；限定在已接管的附件区，退出网格后自动恢复。
    `${grid} [data-testid="ScrollSnap-prevButtonWrapper"],${grid} [data-testid="ScrollSnap-nextButtonWrapper"]{display:none!important}`,
    `${grid} [${FRAME_ATTR}]{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;height:auto!important;max-height:none!important;overflow:visible!important;transform:none!important}`,
    `${grid} [${WRAPPER_ATTR}]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;width:100%!important;height:auto!important;max-width:none!important;transform:none!important;position:relative!important;left:auto!important}`,
    `${grid} [${COLUMN_ATTR}]{display:contents!important;transform:none!important}`,
    `${grid} [${SLOT_ATTR}]{position:relative!important;touch-action:none;aspect-ratio:16/10;width:auto!important;height:auto!important;min-width:0!important;max-width:none!important;transform:none!important;margin:0!important;flex:none!important;cursor:grab;background-color:rgba(127,127,127,0.14)!important}`,
    `${grid} [${SLOT_ATTR}] img{object-fit:contain!important}`,
    `${grid}[${VIEW_ATTR}] [${WRAPPER_ATTR}]{max-height:min(560px,65vh)!important;overflow:auto!important;overscroll-behavior:contain;scrollbar-width:thin;scroll-behavior:auto!important;align-content:start!important}`,
    `${grid}[${VIEW_ATTR}="overview"] [${WRAPPER_ATTR}]{grid-template-columns:repeat(5,minmax(0,1fr))!important}`,
    `@media(max-width:600px){${grid}[${VIEW_ATTR}="overview"] [${WRAPPER_ATTR}]{grid-template-columns:repeat(4,minmax(0,1fr))!important}}`,
    `${grid}[${VIEW_ATTR}="overview"] [${SLOT_ATTR}]{aspect-ratio:1!important}`,
    `${grid}[${VIEW_ATTR}="overview"] [${SLOT_ATTR}]::after{right:4px;bottom:4px;padding:0 4px}`,
    `.${TOOLBAR_CLASS}{display:flex;flex-direction:column;gap:8px;margin-bottom:12px;color:var(--xf-media-fg);font-size:13px;font-weight:400;line-height:20px}`,
    `.${TOOLBAR_CLASS} .xf-media-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}`,
    `.${TOOLBAR_CLASS} .xf-media-count{font-size:inherit;font-weight:400;color:var(--xf-media-muted);margin-right:auto}`,
    `.${TOOLBAR_CLASS} button,.${TOOLBAR_CLASS} select{box-sizing:border-box;min-height:32px;margin:0;border:1px solid transparent;border-radius:8px;padding:4px 12px;background:transparent;color:inherit;font:inherit;letter-spacing:normal;cursor:pointer;white-space:nowrap}`,
    `.${TOOLBAR_CLASS} .xf-media-views{display:inline-flex;align-items:center;gap:4px;padding:4px;border-radius:8px;background:var(--xf-media-hover)}`,
    `.${TOOLBAR_CLASS} [data-view]{min-height:28px;padding:0 12px;color:var(--xf-media-muted)}`,
    `.${TOOLBAR_CLASS} [data-view][aria-pressed="true"]{background:var(--xf-media-bg);color:var(--xf-media-fg);border-color:var(--xf-media-border);font-weight:600}`,
    `.${TOOLBAR_CLASS} button:not(:disabled):hover{background:var(--xf-media-hover);color:var(--xf-media-fg)}`,
    `.${TOOLBAR_CLASS} [data-view][aria-pressed="true"]:hover{background:var(--xf-media-bg)}`,
    `.${TOOLBAR_CLASS} [data-edge]{color:var(--xf-media-muted)}`,
    `.${TOOLBAR_CLASS} .xf-media-select{position:relative;display:inline-flex;color:var(--xf-media-fg)}`,
    `.${TOOLBAR_CLASS} select{appearance:none;-webkit-appearance:none;padding-right:32px;border-color:var(--xf-media-border);background:var(--xf-media-bg)}`,
    `.${TOOLBAR_CLASS} .xf-media-select::after{content:"";position:absolute;right:12px;top:12px;width:6px;height:6px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(45deg);pointer-events:none;color:var(--xf-media-muted)}`,
    `.${TOOLBAR_CLASS} button:disabled{opacity:0.4;cursor:default}`,
    `.${TOOLBAR_CLASS} button:focus-visible,.${TOOLBAR_CLASS} select:focus-visible{outline:2px solid var(--xf-media-fg);outline-offset:0;border-color:transparent}`,
    `.${TOOLBAR_CLASS} .xf-media-hint{color:var(--xf-media-muted);font-size:12px;line-height:16px;margin:0}`,
    slotOrders,
    `${grid} [${SLOT_ATTR}] [style*="background-image"]{background-size:contain!important;background-repeat:no-repeat!important;background-position:center!important}`,
    `${grid} [${SLOT_ATTR}]::after{content:attr(${ORDER_ATTR});position:absolute;right:8px;bottom:8px;z-index:1;min-width:24px;height:24px;padding:0 8px;box-sizing:border-box;border-radius:9999px;background:${ACCENT};color:${ACCENT_TEXT};font:700 13px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;pointer-events:none}`,
    `${grid} [${DRAGGING_ATTR}]{opacity:0.4!important;outline:2px dashed ${ACCENT};outline-offset:-2px}`,
    `.xf-media-drag-ghost{position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border-radius:16px;background-color:rgba(15,20,25,0.9);background-position:center;background-repeat:no-repeat;background-size:contain;box-shadow:0 8px 24px rgba(0,0,0,0.35);opacity:0.95;transform:scale(1.04)}`,
    `html.xf-media-dragging,html.xf-media-dragging *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}`,
    `.xf-media-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483647;max-width:80vw;padding:12px 20px;border-radius:9999px;background:rgb(15,20,25);color:#fff;font:600 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);pointer-events:none}`,
  ].join('\n'))
}

function commonAncestor(elements: HTMLElement[], root: HTMLElement): HTMLElement | null {
  let candidate = elements[0]?.parentElement ?? null
  while (candidate && candidate !== root && !elements.every((el) => candidate!.contains(el))) {
    candidate = candidate.parentElement
  }
  return candidate && root.contains(candidate) ? candidate : null
}

function isSpacer(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && el.childElementCount === 0 && /%$/.test(el.style.paddingBottom || '')
}

/** 根据 MAIN world 写好的属性找出网格结构；不满足条件（少于 2 张、有视频或 GIF、图片不完整）时返回 null */
export function resolveMediaGridLayout(root: HTMLElement): MediaGridLayout | null {
  const found = Array.from(root.querySelectorAll<HTMLElement>(`[${MEDIA_ID_ATTR}]`))
  const count = found.length
  if (count < 2 || count > MAX_COMPOSER_MEDIA) return null
  const ids = parseMediaIds(root.getAttribute(MEDIA_IDS_ATTR))
  if (ids.length !== count) return null

  const groups: HTMLElement[] = new Array(count)
  for (const group of found) {
    if (group.getAttribute(MEDIA_IMAGE_ATTR) !== '1') return null
    const index = Number(group.getAttribute(MEDIA_INDEX_ATTR))
    if (!Number.isInteger(index) || index < 0 || index >= count || groups[index]) return null
    if (ids[index] !== group.getAttribute(MEDIA_ID_ATTR)) return null
    groups[index] = group
  }

  const wrapper = commonAncestor(groups, root)
  if (!wrapper || wrapper === root) return null

  // 网格与轮播都只展平图片到公共容器之间的包装层，不移动 React 管理的节点。
  const columns = new Set<HTMLElement>()
  for (const group of groups) {
    for (let parent = group.parentElement; parent && parent !== wrapper; parent = parent.parentElement) {
      // 不展平包含其他交互控件的未知结构。
      if (Array.from(parent.querySelectorAll('button, [role="button"], a, input')).some(
        control => !groups.some(item => item.contains(control)),
      )) return null
      columns.add(parent)
    }
  }

  const frames: HTMLElement[] = []
  const spacers: HTMLElement[] = []
  for (let el = wrapper.parentElement; el && el !== root; el = el.parentElement) {
    frames.push(el)
    for (const sibling of Array.from(el.parentElement?.children ?? [])) {
      if (sibling !== el && isSpacer(sibling)) spacers.push(sibling)
    }
  }

  return { wrapper, columns: [...columns], frames, spacers, groups }
}

function setMarks(root: HTMLElement, attr: string, marks: Map<HTMLElement, string>) {
  root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    if (!marks.has(el)) el.removeAttribute(attr)
  })
  marks.forEach((value, el) => {
    if (el.getAttribute(attr) !== value) el.setAttribute(attr, value)
  })
}

function setSlots(groups: HTMLElement[]) {
  groups.forEach((group, slot) => {
    if (group.getAttribute(SLOT_ATTR) !== String(slot)) group.setAttribute(SLOT_ATTR, String(slot))
    if (group.getAttribute(ORDER_ATTR) !== String(slot + 1)) group.setAttribute(ORDER_ATTR, String(slot + 1))
  })
}

function clearRoot(root: HTMLElement) {
  root.querySelector(`.${TOOLBAR_CLASS}`)?.remove()
  root.removeAttribute(VIEW_ATTR)
  root.removeAttribute(GRID_ATTR)
  for (const attr of LAYOUT_ATTRS) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr))
  }
  root.querySelectorAll<HTMLElement>(`[${TITLE_MARK_ATTR}]`).forEach((el) => {
    el.removeAttribute('title')
    el.removeAttribute(TITLE_MARK_ATTR)
  })
}

function applyLayout(root: HTMLElement, layout: MediaGridLayout) {
  const single = (els: HTMLElement[]) => new Map(els.map((el) => [el, '']))
  setMarks(root, WRAPPER_ATTR, single([layout.wrapper]))
  setMarks(root, COLUMN_ATTR, single(layout.columns))
  setMarks(root, FRAME_ATTR, single(layout.frames))
  setMarks(root, SPACER_ATTR, single(layout.spacers))
  root.querySelectorAll<HTMLElement>(`[${SLOT_ATTR}]`).forEach((el) => {
    if (!layout.groups.includes(el)) {
      el.removeAttribute(SLOT_ATTR)
      el.removeAttribute(ORDER_ATTR)
    }
  })
  setSlots(layout.groups)

  const hint = t('composerMedia.dragHint')
  for (const group of layout.groups) {
    if (!group.hasAttribute('title') || group.hasAttribute(TITLE_MARK_ATTR)) {
      group.setAttribute('title', hint)
      group.setAttribute(TITLE_MARK_ATTR, '1')
    }
  }
  updateToolbar(root, layout)
  const count = String(layout.groups.length)
  if (root.getAttribute(GRID_ATTR) !== count) root.setAttribute(GRID_ATTR, count)
}

function updateToolbar(root: HTMLElement, layout: MediaGridLayout) {
  if (layout.groups.length <= 4) {
    root.querySelector(`.${TOOLBAR_CLASS}`)?.remove()
    root.removeAttribute(VIEW_ATTR)
    return
  }
  const view = views.get(root) ?? 'overview'
  root.setAttribute(VIEW_ATTR, view)
  let toolbar = root.querySelector<HTMLElement>(`.${TOOLBAR_CLASS}`)
  if (!toolbar) {
    toolbar = document.createElement('div')
    toolbar.className = TOOLBAR_CLASS
    const top = document.createElement('div')
    top.className = 'xf-media-row'
    const count = document.createElement('span')
    count.className = 'xf-media-count'
    const modes = document.createElement('div')
    modes.className = 'xf-media-views'
    top.append(count, modes)
    for (const mode of ['overview', 'detail'] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.view = mode
      button.addEventListener('click', () => {
        if (drag) return
        views.set(root, mode)
        syncRoot(root)
        const selected = selectedIds.get(root)
        const group = resolveMediaGridLayout(root)?.groups.find(item => item.getAttribute(MEDIA_ID_ATTR) === selected)
        group?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      })
      modes.append(button)
    }
    const actions = document.createElement('div')
    actions.className = 'xf-media-row'
    const field = document.createElement('div')
    field.className = 'xf-media-select'
    const select = document.createElement('select')
    select.addEventListener('change', () => {
      selectedIds.set(root, select.value)
      syncRoot(root)
    })
    field.append(select)
    actions.append(field)
    for (const edge of ['first', 'last'] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.edge = edge
      button.addEventListener('click', () => {
        if (drag) return
        const ids = parseMediaIds(root.getAttribute(MEDIA_IDS_ATTR))
        const from = ids.indexOf(select.value)
        if (from < 0) return
        commitOrder(root, moveItem(ids, from, edge === 'first' ? 0 : ids.length - 1))
      })
      actions.append(button)
    }
    const hint = document.createElement('p')
    hint.className = 'xf-media-hint'
    toolbar.append(top, actions, hint)
    root.prepend(toolbar)
  }
  // 与原生媒体按钮使用同一字体；不能从附件容器或 body 继承，它们可能是另一套字体。
  toolbar.style.fontFamily = getXFontFamily(layout.groups[0].querySelector('button span, [role="button"] span'))
  const colors = getThemeColors()
  for (const [name, value] of Object.entries({ fg: colors.fg, bg: colors.bg, muted: colors.fgSecondary, border: colors.border, hover: colors.hoverBg })) {
    toolbar.style.setProperty(`--xf-media-${name}`, value)
  }
  const setText = (el: Element, value: string) => { if (el.textContent !== value) el.textContent = value }
  setText(toolbar.querySelector('.xf-media-count')!, t('composerMedia.count', { count: layout.groups.length }))
  toolbar.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    setText(button, t(button.dataset.view === 'overview' ? 'composerMedia.overview' : 'composerMedia.detail'))
    button.setAttribute('aria-pressed', String(button.dataset.view === view))
  })
  const select = toolbar.querySelector('select')!
  select.setAttribute('aria-label', t('composerMedia.selectImage'))
  const ids = layout.groups.map(item => item.getAttribute(MEDIA_ID_ATTR)!)
  const selected = selectedIds.get(root)
  const labels = ids.map((_, index) => t('composerMedia.imageNumber', { number: index + 1 }))
  if (select.options.length !== ids.length || ids.some((id, index) => select.options[index]?.value !== id || select.options[index]?.textContent !== labels[index])) {
    select.replaceChildren(...ids.map((id, index) => {
      const option = document.createElement('option')
      option.value = id
      option.textContent = labels[index]
      return option
    }))
  }
  select.value = selected && ids.includes(selected) ? selected : ids[0]
  selectedIds.set(root, select.value)
  toolbar.querySelectorAll<HTMLButtonElement>('[data-edge]').forEach(button => {
    const first = button.dataset.edge === 'first'
    setText(button, t(first ? 'composerMedia.toFirst' : 'composerMedia.toLast'))
    button.disabled = select.value === (first ? ids[0] : ids[ids.length - 1])
  })
  setText(toolbar.querySelector('.xf-media-hint')!, t(view === 'overview' ? 'composerMedia.overviewHint' : 'composerMedia.detailHint'))
}

function commitOrder(root: HTMLElement, ids: string[]) {
  if (!requestComposerMediaReorder(root, ids)) {
    syncRoot(root)
    showToast(t('composerMedia.reorderFailed'))
  }
  // 成功由 X 更新数据并重新渲染，MutationObserver 随后同步。
}

function syncRoot(root: HTMLElement) {
  if (drag?.root === root) return
  if (!enabled || !root.isConnected) {
    clearRoot(root)
    return
  }
  root.dispatchEvent(new CustomEvent(COMPOSER_MEDIA_SYNC_EVENT, { bubbles: true }))
  const layout = resolveMediaGridLayout(root)
  const observer = observers.get(root)
  observer?.disconnect()
  try {
    if (layout) applyLayout(root, layout)
    else clearRoot(root)
  } finally {
    observer?.observe(root, { childList: true, subtree: true })
  }
}

function observeRoot(root: HTMLElement) {
  if (observers.has(root)) return
  // X 重排后会重新创建图片格子；在同一轮微任务里重新标记，避免闪出原来的排版
  const observer = new MutationObserver(() => syncRoot(root))
  observer.observe(root, { childList: true, subtree: true })
  observers.set(root, observer)
  if (!boundRoots.has(root)) {
    boundRoots.add(root)
    root.addEventListener('pointerdown', (event) => onPointerDown(root, event))
    root.addEventListener('dragstart', event => { if (drag?.root === root) event.preventDefault() })
  }
}

export function updateComposerMediaGrids() {
  for (const [root, observer] of observers) {
    if (!root.isConnected) {
      observer.disconnect()
      observers.delete(root)
    }
  }
  if (!enabled) return
  const roots = document.querySelectorAll<HTMLElement>(ROOT_SELECTOR)
  if (!roots.length) return
  ensureStyles()
  roots.forEach((root) => {
    observeRoot(root)
    syncRoot(root)
  })
}

export function setComposerMediaGridEnabled(next: boolean) {
  if (enabled === next) return
  enabled = next
  if (next) return
  cancelDrag()
  for (const observer of observers.values()) observer.disconnect()
  observers.clear()
  document.querySelectorAll<HTMLElement>(ROOT_SELECTOR).forEach(clearRoot)
  removeStyles(STYLE_ID)
}

/** 请 MAIN world 按 ids 的顺序重排；同步返回是否成功 */
export function requestComposerMediaReorder(root: HTMLElement, ids: string[]): boolean {
  root.removeAttribute(MEDIA_REORDER_RESULT_ATTR)
  root.setAttribute(MEDIA_REORDER_ATTR, ids.join(','))
  root.dispatchEvent(new CustomEvent(COMPOSER_MEDIA_REORDER_EVENT, { bubbles: true }))
  const ok = root.getAttribute(MEDIA_REORDER_RESULT_ATTR) === 'ok'
  root.removeAttribute(MEDIA_REORDER_RESULT_ATTR)
  root.removeAttribute(MEDIA_REORDER_ATTR)
  return ok
}

function onPointerDown(root: HTMLElement, event: PointerEvent) {
  if (!enabled || drag || event.button !== 0 || !root.hasAttribute(GRID_ATTR)) return
  const target = event.target instanceof Element ? event.target : null
  if (!target || target.closest('button, a, input, textarea, [role="button"], [role="link"]')) return
  const group = target.closest<HTMLElement>(`[${SLOT_ATTR}]`)
  if (!group || !root.contains(group)) return
  const layout = resolveMediaGridLayout(root)
  if (!layout) return
  const from = layout.groups.indexOf(group)
  if (from < 0) return

  selectedIds.set(root, group.getAttribute(MEDIA_ID_ATTR)!)
  const rect = group.getBoundingClientRect()
  drag = {
    root,
    group,
    groups: layout.groups,
    ids: layout.groups.map((g) => g.getAttribute(MEDIA_ID_ATTR) || ''),
    from,
    target: from,
    rects: layout.groups.map((g) => {
      const r = g.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }),
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    started: false,
    ghost: null,
    x: event.clientX,
    y: event.clientY,
    frame: null,
  }
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerCancel, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', cancelDrag)
}

function startDrag(state: DragState) {
  state.started = true
  const rect = state.group.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.className = 'xf-media-drag-ghost'
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  const src = state.group.querySelector('img')?.getAttribute('src')
  if (src) ghost.style.backgroundImage = `url(${JSON.stringify(src)})`
  document.body.appendChild(ghost)
  state.ghost = ghost
  state.group.setAttribute(DRAGGING_ATTR, '1')
  document.documentElement.classList.add('xf-media-dragging')
  state.frame = requestAnimationFrame(autoScroll)
}

function moveGhost(state: DragState, x: number, y: number) {
  if (!state.ghost) return
  state.ghost.style.left = `${x - state.offsetX}px`
  state.ghost.style.top = `${y - state.offsetY}px`
}

function onPointerMove(event: PointerEvent) {
  const state = drag
  if (!state || event.pointerId !== state.pointerId) return
  if (!state.started) {
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD) return
    if (!state.group.isConnected) {
      cancelDrag()
      return
    }
    startDrag(state)
  }
  event.preventDefault()
  moveGhost(state, event.clientX, event.clientY)
  state.x = event.clientX
  state.y = event.clientY
  updateDragTarget(state)
}

function updateDragTarget(state: DragState) {
  // 读取当前槽位而非图片身份：预览重排、手动滚动和边缘滚动后都不会错位。
  const ordered = [...state.groups].sort((a, b) => Number(a.getAttribute(SLOT_ATTR)) - Number(b.getAttribute(SLOT_ATTR)))
  state.rects = ordered.map(group => group.getBoundingClientRect())
  const target = slotFromPoint(state.rects, state.x, state.y)
  if (target >= 0 && target !== state.target) {
    state.target = target
    setSlots(moveItem(state.groups, state.from, target))
  }
}

function autoScroll() {
  const state = drag
  if (!state?.started) return
  if (!state.root.isConnected || state.groups.some(group => !group.isConnected)) {
    cancelDrag()
    return
  }
  // 从图片网格向外查找可滚动容器，兼容弹窗和页面发帖框。
  for (let el = state.group.parentElement; el; el = el.parentElement) {
    const isPage = el === document.scrollingElement
    const style = getComputedStyle(el)
    if (!isPage && !/(auto|scroll)/.test(style.overflowY)) continue
    if (el.scrollHeight <= el.clientHeight) continue
    const rect = el.getBoundingClientRect()
    const top = isPage ? 0 : Math.max(0, rect.top)
    const bottom = isPage ? window.innerHeight : Math.min(window.innerHeight, rect.bottom)
    if (state.x < rect.left || state.x > rect.right || bottom <= top) continue
    const edge = Math.min(48, (bottom - top) / 3)
    const delta = state.y < top + edge ? -Math.min(1, (top + edge - state.y) / edge)
      : state.y > bottom - edge ? Math.min(1, (state.y - bottom + edge) / edge) : 0
    if (!delta) continue
    const before = el.scrollTop
    el.scrollTop += delta * 12
    if (el.scrollTop !== before) break
  }
  updateDragTarget(state)
  state.frame = requestAnimationFrame(autoScroll)
}

function endDrag(): DragState | null {
  const state = drag
  drag = null
  window.removeEventListener('pointermove', onPointerMove, true)
  window.removeEventListener('pointerup', onPointerUp, true)
  window.removeEventListener('pointercancel', onPointerCancel, true)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', cancelDrag)
  if (!state) return null
  if (state.frame !== null) cancelAnimationFrame(state.frame)
  state.ghost?.remove()
  state.group.removeAttribute(DRAGGING_ATTR)
  document.documentElement.classList.remove('xf-media-dragging')
  return state
}

function cancelDrag() {
  const state = endDrag()
  if (state?.started) {
    suppressNextClick()
    syncRoot(state.root)
  }
}

function suppressNextClick() {
  const stop = (event: Event) => {
    // 仅拦截拖动产生的图片点击，不吞掉紧接着点击工具栏的操作。
    if (!(event.target instanceof Element) || !event.target.closest(`[${SLOT_ATTR}]`)) return
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, true), 400)
}

function onPointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const state = endDrag()
  if (!state?.started) return
  suppressNextClick()
  if (!state.root.isConnected || state.groups.some(group => !group.isConnected)) {
    syncRoot(state.root)
    return
  }
  if (state.target === state.from) {
    syncRoot(state.root)
    return
  }
  const ids = moveItem(state.ids, state.from, state.target)
  commitOrder(state.root, ids)
  // 成功时 X 会重新渲染图片格子，附件区上的监听会重新标记
}

function onPointerCancel(event: PointerEvent) {
  if (drag && event.pointerId === drag.pointerId) cancelDrag()
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !drag) return
  event.preventDefault()
  event.stopPropagation()
  cancelDrag()
}

function showToast(text: string) {
  document.querySelector('.xf-media-toast')?.remove()
  if (toastTimer) clearTimeout(toastTimer)
  const toast = document.createElement('div')
  toast.className = 'xf-media-toast'
  toast.setAttribute('role', 'status')
  toast.textContent = text
  document.body.appendChild(toast)
  toastTimer = setTimeout(() => toast.remove(), 3000)
}

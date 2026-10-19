/**
 * 发帖框多图排版与排序（isolated world）。
 *
 * - 排版：2 到 4 张全是图片时，把 X 的分列布局改成两列等大格子，按发帖顺序从左到右、从上到下排，
 *   右下角标序号，图片完整显示。只改 CSS 和 data 属性，不移动 X 的节点。
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
import { ACCENT } from '../utilities/colors'

const ROOT_SELECTOR = '[data-testid="attachments"]'
const STYLE_ID = 'composerMediaGrid'

export const GRID_ATTR = 'data-xf-media-grid'
export const WRAPPER_ATTR = 'data-xf-media-wrapper'
export const COLUMN_ATTR = 'data-xf-media-column'
export const FRAME_ATTR = 'data-xf-media-frame'
export const SPACER_ATTR = 'data-xf-media-spacer'
export const SLOT_ATTR = 'data-xf-media-slot'
export const ORDER_ATTR = 'data-xf-media-order'
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
}

let drag: DragState | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

function ensureStyles() {
  if (stylesExist(STYLE_ID)) return
  const grid = `[${GRID_ATTR}]`
  const slotOrders = Array.from({ length: MAX_COMPOSER_MEDIA }, (_, i) => `${grid} [${SLOT_ATTR}="${i}"]{order:${i}!important}`).join('')
  addStyles(STYLE_ID, [
    `${grid} [${SPACER_ATTR}]{display:none!important}`,
    `${grid} [${FRAME_ATTR}]{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;height:auto!important}`,
    `${grid} [${WRAPPER_ATTR}]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;width:100%!important;height:auto!important}`,
    `${grid} [${COLUMN_ATTR}]{display:contents!important}`,
    `${grid} [${SLOT_ATTR}]{aspect-ratio:16/10;width:auto!important;height:auto!important;min-width:0!important;margin:0!important;flex:none!important;cursor:grab;background-color:rgba(127,127,127,0.14)!important}`,
    slotOrders,
    `${grid} [${SLOT_ATTR}] [style*="background-image"]{background-size:contain!important;background-repeat:no-repeat!important;background-position:center!important}`,
    `${grid} [${SLOT_ATTR}]::after{content:attr(${ORDER_ATTR});position:absolute;right:8px;bottom:8px;z-index:1;min-width:24px;height:24px;padding:0 8px;box-sizing:border-box;border-radius:9999px;background:rgba(15,20,25,0.75);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:#fff;font:700 13px/24px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;pointer-events:none}`,
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

/** 根据 MAIN world 写好的属性找出网格结构；不满足条件（少于 2 张、有视频或 GIF、轮播结构）时返回 null */
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

  // X 的网格是「格子」或「列 > 格子」两种层级；更深的层级是轮播，不处理
  const columns = new Set<HTMLElement>()
  for (const group of groups) {
    const parent = group.parentElement
    if (parent === wrapper) continue
    if (!parent || parent.parentElement !== wrapper) return null
    columns.add(parent)
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
  const count = String(layout.groups.length)
  if (root.getAttribute(GRID_ATTR) !== count) root.setAttribute(GRID_ATTR, count)
}

function syncRoot(root: HTMLElement) {
  if (drag?.root === root) return
  if (!enabled || !root.isConnected) {
    clearRoot(root)
    return
  }
  root.dispatchEvent(new CustomEvent(COMPOSER_MEDIA_SYNC_EVENT, { bubbles: true }))
  const layout = resolveMediaGridLayout(root)
  if (layout) applyLayout(root, layout)
  else clearRoot(root)
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
  }
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerCancel, true)
  window.addEventListener('keydown', onKeyDown, true)
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
  const target = slotFromPoint(state.rects, event.clientX, event.clientY)
  if (target >= 0 && target !== state.target) {
    state.target = target
    setSlots(moveItem(state.groups, state.from, target))
  }
}

function endDrag(): DragState | null {
  const state = drag
  drag = null
  window.removeEventListener('pointermove', onPointerMove, true)
  window.removeEventListener('pointerup', onPointerUp, true)
  window.removeEventListener('pointercancel', onPointerCancel, true)
  window.removeEventListener('keydown', onKeyDown, true)
  if (!state) return null
  state.ghost?.remove()
  state.group.removeAttribute(DRAGGING_ATTR)
  document.documentElement.classList.remove('xf-media-dragging')
  return state
}

function cancelDrag() {
  const state = endDrag()
  if (state?.started) syncRoot(state.root)
}

function suppressNextClick() {
  const stop = (event: Event) => {
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
  if (state.target === state.from) {
    syncRoot(state.root)
    return
  }
  const ids = moveItem(state.ids, state.from, state.target)
  if (!requestComposerMediaReorder(state.root, ids)) {
    syncRoot(state.root)
    showToast(t('composerMedia.reorderFailed'))
  }
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

import { t, type MessageKey } from '../../shared/i18n'
import { BULLET_LIST_ICON, NUMBERED_LIST_ICON } from '../../shared/composer-icons'
import { COMPOSER_FORMATS, planComposerFormat, mapFormatPoint, type ComposerFormat, type SelectedBlock } from '../../shared/composer-formatting'

const EDITOR = '[data-testid^="tweetTextarea"][contenteditable="true"]'
type SelectionTarget = { editor: HTMLElement; range: Range }
let saved: SelectionTarget | null = null
let busy = false
let composing = false

function readSelection(): SelectionTarget | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  const node = range.startContainer
  const editor = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(EDITOR)
  if (!editor || !editor.contains(range.endContainer)) return null
  return { editor, range: range.cloneRange() }
}

function blocksOf(editor: HTMLElement): HTMLElement[] {
  const blocks = [...editor.querySelectorAll<HTMLElement>('[data-block="true"]')]
  return blocks.length ? blocks : [editor]
}

/** 文本偏移跨越加粗、斜体和链接节点，插入时只改行首。 */
function textPoint(block: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (offset <= length) return [node, offset]
    offset -= length
  }
  return [block, block.childNodes.length]
}

function selectRange(range: Range) {
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  // 与按名字艾特一致：先同步 DraftJS 的选区，再派发编辑事件。
  document.dispatchEvent(new Event('selectionchange'))
}

function editText(editor: HTMLElement, text: string): boolean {
  try {
    const data = new DataTransfer()
    if (text) data.setData('text/plain', text)
    // cut 使用独立 DataTransfer，不读写系统剪贴板；paste 交由 DraftJS 更新状态。
    const event = new ClipboardEvent(text ? 'paste' : 'cut', { clipboardData: data, bubbles: true, cancelable: true, composed: true })
    ;(event as ClipboardEvent & { __xfHandled?: boolean }).__xfHandled = true
    if (!editor.dispatchEvent(event)) return true
  } catch {}
  try {
    return document.execCommand(text ? 'insertText' : 'delete', false, text || undefined)
  } catch {
    return false
  }
}

function selectedBlocks({ editor, range }: SelectionTarget): SelectedBlock[] {
  if (!editor.isConnected || !editor.contains(range.commonAncestorContainer)) return []
  const result: SelectedBlock[] = []
  blocksOf(editor).forEach((block, index) => {
    if (!range.intersectsNode(block)) return
    const portion = document.createRange()
    portion.selectNodeContents(block)
    if (portion.compareBoundaryPoints(Range.START_TO_START, range) < 0) portion.setStart(range.startContainer, range.startOffset)
    if (portion.compareBoundaryPoints(Range.END_TO_END, range) > 0) portion.setEnd(range.endContainer, range.endOffset)
    const before = document.createRange()
    before.selectNodeContents(block)
    before.setEnd(portion.startContainer, portion.startOffset)
    const start = before.toString().length
    const end = start + portion.toString().length
    if (!range.collapsed && start === end) return
    result.push({ block: index, text: block.textContent ?? '', start, end })
  })
  return result
}

export const toggleBulletsInSelection = (target: SelectionTarget) => toggleComposerFormat(target, 'bullet')

export async function toggleComposerFormat(target: SelectionTarget, format: ComposerFormat): Promise<boolean> {
  const { editor, range } = target
  if (busy || composing || !editor.isConnected || !editor.contains(range.commonAncestorContainer)) return false
  const plan = planComposerFormat(selectedBlocks(target), format)
  if (!plan?.available) return false
  const blocks = blocksOf(editor)
  const expected = blocks.map(block => block.textContent ?? '')
  const edits = plan.edits
  busy = true
  let interrupted = false
  let inserting = false
  const interrupt = (event: Event) => { if (event.isTrusted && !inserting) interrupted = true }
  // 多行编辑之间可能发生用户输入；此时停止，避免覆盖新的操作。
  window.addEventListener('keydown', interrupt, true)
  window.addEventListener('pointerdown', interrupt, true)
  editor.addEventListener('beforeinput', interrupt, true)
  try {
    editor.focus()
    for (const edit of [...edits].reverse()) {
      const current = blocksOf(editor)
      if (interrupted || !editor.isConnected || current.length !== expected.length || current.some((block, index) => block.textContent !== expected[index])) return false
      const insertion = document.createRange()
      insertion.setStart(...textPoint(current[edit.block], edit.start))
      insertion.setEnd(...textPoint(current[edit.block], edit.end))
      selectRange(insertion)
      inserting = true
      const inserted = editText(editor, edit.text)
      inserting = false
      if (!inserted) return false
      expected[edit.block] = expected[edit.block].slice(0, edit.start) + edit.text + expected[edit.block].slice(edit.end)
      // 等 React 提交后重新找节点；原来的节点可能已经被替换。
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    const current = blocksOf(editor)
    if (interrupted || !editor.isConnected || current.length !== expected.length || current.some((block, index) => block.textContent !== expected[index])) return false
    const selection = document.createRange()
    const start = mapFormatPoint(plan.start, edits, 'start')
    const end = mapFormatPoint(plan.end, edits, 'end')
    selection.setStart(...textPoint(current[start.block], start.offset))
    selection.setEnd(...textPoint(current[end.block], end.offset))
    selectRange(selection)
    saved = readSelection()
    return true
  } finally {
    busy = false
    document.dispatchEvent(new Event('selectionchange'))
    window.removeEventListener('keydown', interrupt, true)
    window.removeEventListener('pointerdown', interrupt, true)
    editor.removeEventListener('beforeinput', interrupt, true)
  }
}

const FORMATS: Record<ComposerFormat, { label: MessageKey; remove: MessageKey; title: MessageKey; removeTitle: MessageKey; icon: string }> = {
  bullet: { label: 'composerPage.listLabel', remove: 'composerPage.listRemoveLabel', title: 'composerPage.listTitle', removeTitle: 'composerPage.listRemoveTitle', icon: BULLET_LIST_ICON },
  number: { label: 'composerPage.numberLabel', remove: 'composerPage.numberRemoveLabel', title: 'composerPage.numberTitle', removeTitle: 'composerPage.numberRemoveTitle', icon: NUMBERED_LIST_ICON },
}

function updateFormatButton(button: HTMLButtonElement, target: SelectionTarget | null) {
  const format = button.dataset.xfComposerFormat as ComposerFormat
  const config = FORMATS[format]
  const plan = target ? planComposerFormat(selectedBlocks(target), format) : null
  const active = plan?.active ?? false
  button.setAttribute('aria-pressed', String(active))
  button.setAttribute('aria-label', t(active ? config.remove : config.label))
  button.title = t(active ? config.removeTitle : config.title)
  button.style.setProperty('background-color', active ? 'rgba(128, 128, 128, 0.24)' : '', active ? 'important' : '')
  button.disabled = busy || !plan?.available
}

export const createComposerListButton = (root: HTMLElement, nativeButton?: HTMLButtonElement) => createComposerFormatButton(root, 'bullet', nativeButton)

export function createComposerFormatButtons(root: HTMLElement, nativeButton?: HTMLButtonElement): HTMLButtonElement[] {
  return COMPOSER_FORMATS.map(format => createComposerFormatButton(root, format, nativeButton))
}

export function createComposerFormatButton(root: HTMLElement, format: ComposerFormat, nativeButton?: HTMLButtonElement): HTMLButtonElement {
  // cloneNode 不复制 React 事件，只复用原生按钮及图标的样式结构。
  const button = nativeButton ? nativeButton.cloneNode(true) as HTMLButtonElement : document.createElement('button')
  button.type = 'button'
  if (!nativeButton) button.className = 'xf-insert-link-button xf-composer-list-button'
  button.dataset.testid = format === 'bullet' ? 'xf-composer-list-button' : `xf-composer-${format}-button`
  button.dataset.xfComposerFormat = format
  const initialTarget = readSelection() ?? saved
  updateFormatButton(button, initialTarget && root.contains(initialTarget.editor) ? initialTarget : null)
  const nativeIcon = button.querySelector('svg')
  if (nativeIcon) {
    const icon = document.createElement('template')
    icon.innerHTML = FORMATS[format].icon
    nativeIcon.replaceChildren(...Array.from(icon.content.querySelector('svg')!.childNodes))
  } else button.innerHTML = FORMATS[format].icon
  button.addEventListener('mousedown', event => {
    saved = readSelection()
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('mouseup', event => event.stopPropagation())
  button.addEventListener('click', async event => {
    event.preventDefault()
    event.stopPropagation()
    const target = readSelection() ?? saved
    if (!target || !root.contains(target.editor)) return
    button.disabled = true
    try {
      const changed = await toggleComposerFormat(target, format)
      updateFormatButton(button, readSelection())
      if (!changed) button.title = t('composerPage.listFailed')
      else if (nativeButton && target.editor.isConnected && target.editor.contains(document.activeElement)) {
        // 逐行修改时，临时光标会使 X 收起原生工具栏。完整选区恢复后，
        // 重新触发 X 自己的选区鼠标处理，让 B / I 和列表一起恢复，保留原生事件。
        target.editor.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          clientX: event.clientX,
          clientY: event.clientY,
          button: 0,
        }))
      }
    } catch {
      button.title = t('composerPage.listFailed')
    } finally {
      const current = readSelection()
      button.disabled = busy || !current || !planComposerFormat(selectedBlocks(current), format)?.available
    }
  })
  return button
}

// X 的原生图标不随界面语言变化；只识别 body 下同时含 B / I 的浮动工具栏。
const ITALIC_PATH = 'M9 6h3.731L9.184 18H5v2h10v-2h-3.731l3.547-12H19V4H9v2z'
const BOLD_PATH_PREFIX = 'M15.636 11.671'

function nativeFormattingButtons(): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = []
  for (const root of document.body.children) {
    const native = [...root.querySelectorAll<HTMLButtonElement>(':scope > button:not([data-xf-composer-format])')]
    if (native.length !== 2 || getComputedStyle(root).position !== 'fixed') continue
    const italic = native.find(button => button.querySelector(`svg path[d="${ITALIC_PATH}"]`))
    const bold = native.find(button => button.querySelector(`svg path[d^="${BOLD_PATH_PREFIX}"]`))
    if (italic && bold) buttons.push(italic)
  }
  return buttons
}

/** 直接扩展 X 原生的 B / I 浮动工具栏；没有原生浮层时仍可用底部按钮。 */
export function initComposerLists(): () => void {
  const attached = new Map<HTMLElement, HTMLButtonElement[]>()
  let queued = false
  let disposed = false
  const hide = () => {
    for (const buttons of attached.values()) buttons.forEach(button => button.remove())
    attached.clear()
  }
  const update = () => {
    // 临时光标只服务于逐行编辑，不代表用户已离开选区。
    if (busy) return
    const target = readSelection()
    if (!busy) {
      saved = target
      for (const button of document.querySelectorAll<HTMLButtonElement>('[data-xf-composer-format]')) {
        // 底部按钮只反映其所属编辑器；原生浮层反映当前选区。
        const root = button.closest('[data-xf-inline-composer], [role="dialog"]')
        updateFormatButton(button, target && (!root || root.contains(target.editor)) ? target : null)
      }
    }
    if (!target || target.range.collapsed || composing || !target.editor.isConnected) { hide(); return }
    const active = document.activeElement
    if (!target.editor.contains(active) && ![...attached.keys()].some(root => root.contains(active))) { hide(); return }
    const templates = nativeFormattingButtons()
    const roots = new Set(templates.map(button => button.parentElement!))
    for (const [root, buttons] of attached) {
      if (!roots.has(root) || buttons.some(button => button.parentElement !== root)) {
        buttons.forEach(button => button.remove())
        attached.delete(root)
      }
    }
    for (const template of templates) {
      const root = template.parentElement!
      if (attached.has(root)) continue
      const buttons = createComposerFormatButtons(document.body, template)
      buttons.forEach(button => { button.dataset.testid = button.dataset.xfComposerFormat === 'bullet' ? 'xf-selection-list-button' : `xf-selection-${button.dataset.xfComposerFormat}-button` })
      // 使用同一容器的布局、背景、圆角、阴影与定位，不再单独创建悬浮面板。
      root.append(...buttons)
      attached.set(root, buttons)
    }
  }
  const scheduleUpdate = () => {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!disposed) update()
    })
  }
  const startComposition = () => { composing = true; hide() }
  const endComposition = () => { composing = false; update() }
  const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
  document.addEventListener('selectionchange', update)
  document.addEventListener('compositionstart', startComposition)
  document.addEventListener('compositionend', endComposition)
  document.addEventListener('keydown', dismiss)
  // 原生工具栏可能在 selectionchange 之后才出现，或被 React 重新创建。
  const observer = new MutationObserver(records => {
    if (saved && !saved.editor.isConnected || records.some(record => record.target === document.body || attached.has(record.target as HTMLElement))) scheduleUpdate()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    disposed = true
    observer.disconnect()
    hide()
    saved = null
    composing = false
    document.removeEventListener('selectionchange', update)
    document.removeEventListener('compositionstart', startComposition)
    document.removeEventListener('compositionend', endComposition)
    document.removeEventListener('keydown', dismiss)
  }
}

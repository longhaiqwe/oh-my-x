import { t } from '../../shared/i18n'
import { findComposerRoots } from '../utilities/composer-roots'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { accentAlpha } from '../utilities/colors'
import { openOwnPostPicker } from './own-post-picker'
import { convertMarkdownToPost, isMarkdownContent } from '../../shared/markdown-to-post'

// 用 WeakMap 保存每个编辑器「失焦前」的光标位置
// 点击工具栏按钮时编辑器已失焦，必须在 blur 时提前保存
const savedRangeMap = new WeakMap<HTMLElement, Range>()

function findEditorInModal(modalEl: Element): HTMLElement | null {
  return (
    modalEl.querySelector('.DraftEditor-editorContainer [contenteditable="true"]') ||
    modalEl.querySelector('[data-testid^="tweetTextarea"][contenteditable="true"]')
  ) as HTMLElement | null
}

export function formatMarkdownInEditor(modalEl: Element) {
  const editor = findEditorInModal(modalEl)
  if (!editor) return

  const currentContent = editor.innerText || editor.textContent || ''

  if (!currentContent.trim()) {
    // 编辑器为空时，尝试从系统剪贴板读取 Markdown 并转格式插入
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      navigator.clipboard.readText().then((clipText) => {
        if (clipText && clipText.trim()) {
          const formatted = convertMarkdownToPost(clipText)
          insertTextIntoContentEditable(editor, formatted)
        }
      }).catch(() => {})
    }
    return
  }

  const formatted = convertMarkdownToPost(currentContent)
  if (formatted === currentContent) return

  // 全选当前编辑器内容，然后替换为格式化文本
  replaceAllEditorContent(editor, formatted)
}

function replaceAllEditorContent(editor: HTMLElement, text: string) {
  editor.focus()
  const sel = window.getSelection()
  if (sel) {
    const range = document.createRange()
    range.selectNodeContents(editor)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // 1. 尝试使用 paste 事件让 DraftJS 整体替换选中内容
  try {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', text)
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    ;(pasteEvent as any).__xfHandled = true

    const handledByDraftJS = !editor.dispatchEvent(pasteEvent)
    if (handledByDraftJS) {
      savedRangeMap.delete(editor)
      return
    }
  } catch (e) {
    // ignore
  }

  // 2. 尝试 execCommand 插入文本
  try {
    const worked = document.execCommand('insertText', false, text)
    if (worked) {
      savedRangeMap.delete(editor)
      return
    }
  } catch (e) {
    // ignore
  }

  // 3. Fallback: 直接赋值并派发 input 事件
  editor.innerText = text
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  savedRangeMap.delete(editor)
}

function ensureComposerStyles() {
  if (!stylesExist('insertLinkButton')) {
    addStyles(
      'insertLinkButton',
      '.xf-insert-link-presentation{display:inline-flex!important}.xf-insert-link-inner{display:inline-flex!important;align-items:center!important;gap:2px!important}.xf-insert-link-button{background:transparent!important;border:0!important;padding:6px!important;margin-left:2px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;color:inherit!important;border-radius:9999px!important}.xf-insert-link-button:hover{background-color:' + accentAlpha(0.1) + '!important}.xf-insert-link-button svg{width:20px!important;height:20px!important;color:inherit!important}'
    )
  }
}

export const addComposerInsertLinkButton = () => {
  try {
    const modals = findComposerRoots()

    modals.forEach((modal) => {
      const modalEl = modal as HTMLElement
      const isInline = modalEl.dataset.xfInlineComposer === '1'

      ensureComposerStyles()

      // 找到编辑器并监听 blur 与快捷键
      const attachEditorListeners = (editorEl: HTMLElement) => {
        if ((editorEl as any).__xfEditorListenersAttached) return
        ;(editorEl as any).__xfEditorListenersAttached = true

        editorEl.addEventListener('blur', () => {
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0 && editorEl.contains(sel.anchorNode)) {
            savedRangeMap.set(editorEl, sel.getRangeAt(0).cloneRange())
          }
        }, true)

        // Inline replies only gain the requested quote picker; keep their existing paste behavior.
        if (isInline) return

        // 绑定快捷键 ⌘⇧M / Ctrl+Shift+M 格式化 Markdown
        editorEl.addEventListener('keydown', (ev: KeyboardEvent) => {
          if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && (ev.key === 'm' || ev.key === 'M')) {
            ev.preventDefault()
            ev.stopPropagation()
            formatMarkdownInEditor(modalEl)
          }
        })

        // 监听粘贴事件：若粘贴内容为 Markdown，自动清洗为规范 Post 格式并写入
        editorEl.addEventListener('paste', (ev: ClipboardEvent) => {
          if ((ev as any).__xfHandled) return
          const clipboardData = ev.clipboardData
          if (!clipboardData) return
          const text = clipboardData.getData('text/plain')
          if (!text) return

          if (isMarkdownContent(text)) {
            const formatted = convertMarkdownToPost(text)
            if (formatted && formatted !== text) {
              ev.preventDefault()
              ev.stopPropagation()
              insertTextIntoContentEditable(editorEl, formatted)
            }
          }
        }, true)
      }

      const findAndAttach = () => {
        const editors = [
          modalEl.querySelector('.DraftEditor-editorContainer [contenteditable="true"]'),
          modalEl.querySelector('[data-testid^="tweetTextarea"]'),
        ].filter(Boolean) as HTMLElement[]
        editors.forEach(attachEditorListeners)
      }

      findAndAttach()
      if (!modalEl.querySelector('[contenteditable="true"]')) {
        const obs = new MutationObserver(() => { findAndAttach(); obs.disconnect() })
        obs.observe(modalEl, { childList: true, subtree: true })
      }

      if (modalEl.querySelector('[data-testid="xf-insert-link-button"]')) return

      const tablist = modalEl.querySelector('[role="tablist"], [data-testid="ScrollSnap-List"]') as HTMLElement | null

      // 1. 插入链接按钮
      const linkBtn = document.createElement('button')
      linkBtn.setAttribute('type', 'button')
      linkBtn.setAttribute('aria-label', t('ownPage.title'))
      linkBtn.setAttribute('title', t('composerPage.ownPostsTitle'))
      linkBtn.setAttribute('aria-expanded', 'false')
      linkBtn.setAttribute('data-testid', 'xf-insert-link-button')
      linkBtn.className = 'xf-insert-link-button'
      linkBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M11.75 22q-2.6 0-4.425-1.825T5.5 15.75V6.5q0-1.875 1.313-3.187T10 2t3.188 1.313T14.5 6.5V13q0 .425-.288.713T13.5 14t-.712-.288T12.5 13V6.5q-.025-1.05-.737-1.775T10 4t-1.775.725T7.5 6.5v9.25q-.025 1.775 1.225 3.013T11.75 20q.425 0 .8-.088t.725-.212q.4-.15.775.013t.525.562t-.012.775t-.563.525q-.525.2-1.087.313T11.75 22M17 21q-.425 0-.712-.288T16 20v-2h-2q-.425 0-.712-.288T13 17t.288-.712T14 16h2v-2q0-.425.288-.712T17 13t.713.288T18 14v2h2q.425 0 .713.288T21 17t-.288.713T20 18h-2v2q0 .425-.288.713T17 21m-7-4q-.425 0-.712-.288T9 16V7q0-.425.288-.712T10 6t.713.288T11 7v9q0 .425-.288.713T10 17m7-6q-.425 0-.712-.288T16 10V7q0-.425.288-.712T17 6t.713.288T18 7v3q0 .425-.288.713T17 11"/>
        </svg>
      `

      // 2. 转为推文格式 (Markdown to Post) 按钮
      const mdBtn = document.createElement('button')
      mdBtn.setAttribute('type', 'button')
      mdBtn.setAttribute('aria-label', t('composerPage.markdownLabel'))
      mdBtn.setAttribute('title', t('composerPage.markdownTitle'))
      mdBtn.setAttribute('data-testid', 'xf-format-markdown-button')
      mdBtn.className = 'xf-insert-link-button xf-format-markdown-button'
      mdBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M2.5 5h19a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 1 17.5v-11A1.5 1.5 0 0 1 2.5 5m1.5 3v8h2.5v-4.5l2 2.5 2-2.5V16h2.5V8h-2.5l-2 2.5-2-2.5zm11.5 0v5h-2l3.5 4 3.5-4h-2V8z"/>
        </svg>
      `

      const handleBtnMouseDown = (ev: MouseEvent) => {
        const sel = window.getSelection()
        const activeEditor = [
          modalEl.querySelector('.DraftEditor-editorContainer [contenteditable="true"]'),
          modalEl.querySelector('[data-testid^="tweetTextarea"]'),
        ].find((el) => el && sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) as HTMLElement | undefined
        if (activeEditor && sel && sel.rangeCount > 0) {
          savedRangeMap.set(activeEditor, sel.getRangeAt(0).cloneRange())
        }
        ev.preventDefault()
      }

      linkBtn.addEventListener('mousedown', handleBtnMouseDown)
      linkBtn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        const editor = Array.from(modalEl.querySelectorAll<HTMLElement>('[contenteditable="true"]'))
          .find(el => el === document.activeElement || el.contains(window.getSelection()?.anchorNode || null))
          || modalEl.querySelector<HTMLElement>('.DraftEditor-editorContainer [contenteditable="true"], [data-testid^="tweetTextarea"][contenteditable="true"]')
        if (editor) openOwnPostPicker(modalEl, linkBtn, url => insertPostUrlIntoEditor(editor, url))
      })

      mdBtn.addEventListener('mousedown', handleBtnMouseDown)
      mdBtn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        formatMarkdownInEditor(modalEl)
      })

      if (tablist) {
        const presentation = document.createElement('div')
        presentation.setAttribute('role', 'presentation')
        presentation.setAttribute('data-testid', 'xf-insert-link-presentation')
        presentation.className = 'xf-insert-link-presentation'

        const inner1 = document.createElement('div')
        inner1.className = 'xf-insert-link-inner'
        inner1.appendChild(linkBtn)
        if (!isInline) inner1.appendChild(mdBtn)
        presentation.appendChild(inner1)

        tablist.appendChild(presentation)
        modalEl.dataset.xfInsertLinkAdded = '1'
        return
      }

      let toolbarContainer: HTMLElement | null = null
      toolbarContainer = modalEl.querySelector('[data-testid="toolBar"]')
      const fileInput = modalEl.querySelector('input[data-testid="fileInput"], input[type="file"]') as HTMLElement | null
      if (!toolbarContainer && fileInput && fileInput.parentElement) toolbarContainer = fileInput.parentElement as HTMLElement

      if (!toolbarContainer && !isInline) {
        const svgButtons = Array.from(modalEl.querySelectorAll('button')).filter((b) => b.querySelector('svg'))
        if (svgButtons.length) {
          const candidate = svgButtons[0].parentElement as HTMLElement | null
          if (candidate) toolbarContainer = candidate
        }
      }

      if (!toolbarContainer) return

      toolbarContainer.appendChild(linkBtn)
      if (!isInline) toolbarContainer.appendChild(mdBtn)
      modalEl.dataset.xfInsertLinkAdded = '1'
    })
  } catch {
    // Silent fail
  }
}

function insertPostUrlIntoEditor(editor: HTMLElement, urlToInsert: string) {
  if (!editor.isConnected) return

  const saved = savedRangeMap.get(editor)
  let before = editor.innerText || editor.textContent || ''
  let after = ''
  if (saved && editor.contains(saved.commonAncestorContainer)) {
    const left = document.createRange()
    left.selectNodeContents(editor)
    left.setEnd(saved.startContainer, saved.startOffset)
    before = left.toString()
    const right = document.createRange()
    right.selectNodeContents(editor)
    right.setStart(saved.endContainer, saved.endOffset)
    after = right.toString()
  }
  const prefix = before && !/\s$/.test(before) ? ' ' : ''
  const suffix = after && !/^\s/.test(after) ? ' ' : ''
  insertTextIntoContentEditable(editor, prefix + urlToInsert + suffix)
}

function insertTextIntoContentEditable(editor: HTMLElement, text: string) {
  // 优先取 blur 时保存的光标（点击按钮后编辑器已失焦，实时 getSelection 此时无效）
  const candidate = savedRangeMap.get(editor)
  const savedRange = candidate && editor.contains(candidate.commonAncestorContainer) ? candidate : null

  // focus() may create a new selection at the start; only trust a live selection captured before it.
  const sel = window.getSelection()
  const liveRange = sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)
    ? sel.getRangeAt(0).cloneRange() : null
  const restoreRange = savedRange || liveRange
  editor.focus()

  if (restoreRange && sel) {
    sel.removeAllRanges()
    sel.addRange(restoreRange)
  } else if (sel) {
    const end = document.createRange()
    end.selectNodeContents(editor)
    end.collapse(false)
    sel.removeAllRanges()
    sel.addRange(end)
  }

  // 1. 标准 ClipboardEvent ('paste')
  // Twitter 的 DraftJS 编辑器内置 editOnPaste 处理器，监听到 paste 事件后会自动解析 URL、格式化为蓝色链接并更新 React State，同时调用 e.preventDefault()
  try {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', text)
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    ;(pasteEvent as any).__xfHandled = true

    const handledByDraftJS = !editor.dispatchEvent(pasteEvent)
    if (handledByDraftJS) {
      savedRangeMap.delete(editor)
      return
    }
  } catch (e) {
    // ignore
  }

  // 2. 尝试 execCommand 插入文本
  try {
    const worked = document.execCommand('insertText', false, text)
    if (worked) {
      savedRangeMap.delete(editor)
      return
    }
  } catch (e) {
    // ignore and fallback
  }

  // 3. Fallback: 手动操作 Range 插入文本节点（仅用于非 DraftJS 的普通 contenteditable）
  let range: Range
  if (savedRange) {
    range = savedRange.cloneRange()
  } else if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0)
  } else {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false) // 移到末尾
  }

  // 若有选区则先清除（只清选区范围内内容，不影响其他文字）
  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)

  // 将光标移到插入内容之后
  range.setStartAfter(textNode)
  range.collapse(true)
  if (sel) {
    sel.removeAllRanges()
    sel.addRange(range)
  }

  savedRangeMap.delete(editor)

  // 通知普通 DOM 状态更新
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
}

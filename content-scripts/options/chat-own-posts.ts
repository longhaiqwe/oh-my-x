import { t } from '../../shared/i18n'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { openOwnPostPicker } from './own-post-picker'

const editorSelector = 'textarea[data-testid="dm-composer-textarea"]'
const bindings = new Map<HTMLTextAreaElement, { route: string; button: HTMLButtonElement; dispose: () => void }>()
const shadowObservers = new Map<ShadowRoot, MutationObserver>()
let discoveryTimer: ReturnType<typeof setTimeout> | undefined

function chatRoots(): (Document | ShadowRoot)[] {
  clearTimeout(discoveryTimer)
  discoveryTimer = undefined
  for (const [root, observer] of shadowObservers) {
    if (!root.host.isConnected) { observer.disconnect(); shadowObservers.delete(root) }
  }
  const roots: (Document | ShadowRoot)[] = [document]
  for (const host of document.querySelectorAll('[data-testid="xchatEmbedRoute"]')) {
    const root = host.shadowRoot
    if (!root) {
      // attachShadow itself does not produce a document MutationRecord.
      discoveryTimer ??= setTimeout(updateChatOwnPosts, 250)
      continue
    }
    roots.push(root)
    if (shadowObservers.has(root)) continue
    const observer = new MutationObserver(updateChatOwnPosts)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly'] })
    shadowObservers.set(root, observer)
  }
  return roots
}

/** XChat uses a React-controlled textarea, rather than the post editor's DraftJS. */
export function updateChatOwnPosts() {
  const roots = chatRoots()
  for (const [editor, binding] of bindings) {
    if (!editor.isConnected || !binding.button.isConnected || binding.route !== location.pathname || editor.disabled || editor.readOnly) {
      binding.dispose()
      bindings.delete(editor)
    }
  }
  for (const editor of roots.flatMap(root => Array.from(root.querySelectorAll<HTMLTextAreaElement>(editorSelector)))) {
    if (bindings.has(editor) || editor.disabled || editor.readOnly) continue
    const form = editor.closest<HTMLElement>('[data-testid="dm-composer-form"]')
    const container = editor.closest<HTMLElement>('[data-testid="dm-composer-input-container"]')
    const host = form?.parentElement
    if (!form || !container || !host) continue
    // Use the input row observed in XChat; keep the search form outside the message form.
    let row: HTMLElement = editor
    while (row.parentElement && row.parentElement !== container) row = row.parentElement
    if (row.parentElement !== container || row === editor) continue
    const root = editor.getRootNode() as Document | ShadowRoot
    if (!stylesExist('chatOwnPosts', root)) addStyles('chatOwnPosts', `
      .xf-chat-own-post-button{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end;width:32px;height:32px;padding:6px;border:0;border-radius:50%;color:inherit;background:transparent;cursor:pointer}
      .xf-chat-own-post-button:hover{background:rgba(128,128,128,.15)}
      .xf-chat-own-post-button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
      .xf-chat-own-post-button svg{width:20px;height:20px}
    `, root)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'xf-chat-own-post-button'
    button.dataset.testid = 'xf-chat-own-post-button'
    button.setAttribute('aria-label', t('ownPage.title'))
    button.setAttribute('aria-expanded', 'false')
    button.title = t('composerPage.chatOwnPostsTitle')
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>'
    row.prepend(button)
    const route = location.pathname
    const controller = new AbortController()
    const listenerOptions = { signal: controller.signal }
    let closePicker: (() => void) | undefined
    const open = () => {
      if (editor.disabled || editor.readOnly || !editor.isConnected || location.pathname !== route) return
      if (closePicker) { root.querySelector<HTMLInputElement>('[data-testid="xf-own-post-picker"] input')?.focus(); return }
      const draft = editor.value
      const start = editor.selectionStart
      const end = editor.selectionEnd
      closePicker = openOwnPostPicker(host, button, url => {
        if (!editor.isConnected || location.pathname !== route || editor.disabled || editor.readOnly) return
        // Do not apply a stale selection if another action changed the draft while searching.
        const unchanged = editor.value === draft
        const left = editor.value.slice(0, unchanged ? start : editor.value.length)
        const right = unchanged ? editor.value.slice(end) : ''
        const insertion = `${left && !/\s$/.test(left) ? ' ' : ''}${url}${right && !/^\s/.test(right) ? ' ' : ''}`
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
        setter.call(editor, left + insertion + right)
        editor.focus()
        editor.setSelectionRange(left.length + insertion.length, left.length + insertion.length)
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: insertion }))
      }, { presentation: 'dialog', onClose: () => { closePicker = undefined } })
    }
    button.addEventListener('mousedown', event => event.preventDefault(), listenerOptions)
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open() }, listenerOptions)
    editor.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key !== '/' || editor.value !== '') return
      event.preventDefault()
      event.stopPropagation()
      open()
    }, { ...listenerOptions, capture: true })
    bindings.set(editor, { route, button, dispose: () => { closePicker?.(); controller.abort(); button.remove() } })
  }
}

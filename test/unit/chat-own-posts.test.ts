import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateChatOwnPosts } from '../../content-scripts/options/chat-own-posts'
import { searchLibrary, syncLibrary } from '../../content-scripts/options/own-post-library-client'

vi.mock('../../content-scripts/options/own-post-library-client', () => ({ searchLibrary: vi.fn(), syncLibrary: vi.fn(), pauseLibrary: vi.fn() }))
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const button = () => document.querySelector<HTMLButtonElement>('[data-testid="xf-chat-own-post-button"]')!
const picker = () => document.querySelector<HTMLElement>('[data-testid="xf-own-post-picker"]')
const selectPost = () => document.querySelector<HTMLButtonElement>('[data-post-id="123"]')!.click()
const slash = (editor: HTMLTextAreaElement, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, ...init })
  editor.dispatchEvent(event)
  return event
}

// XChat DOM inspected on 2026-11-09: textarea > wrappers > input row > input container > form.
function setup() {
  document.body.innerHTML = `<a data-testid="AppTabBar_Profile_Link" href="/me"></a><main><div class="chat-grid">
    <div><button>GIF</button></div><form data-testid="dm-composer-form">
    <div data-testid="dm-composer-input-container"><div class="input-row"><div><div>
      <textarea data-testid="dm-composer-textarea" aria-label="私信"></textarea>
    </div></div><div><button type="submit">发送</button></div></div></div></form></div></main>`
  return document.querySelector('textarea')!
}

describe('XChat own post references', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no top-layer layout; browser preview verifies geometry separately.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true }) })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false }) })
    window.history.replaceState({}, '', '/i/chat/group1')
    vi.mocked(searchLibrary).mockResolvedValue({ posts: [{ id: '123', handle: 'me', url: 'https://x.com/me/status/123', text: '测试帖子', title: '', timestamp: null }], total: 1, count: 1, meta: { historyDone: true, syncing: false, paused: false } } as any)
    vi.mocked(syncLibrary).mockResolvedValue()
  })
  afterEach(() => {
    document.body.replaceChildren()
    updateChatOwnPosts()
    window.history.replaceState({}, '', '/')
    vi.useRealTimers()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  })

  function setupShadow() {
    const editor = setup()
    const host = document.createElement('div')
    host.dataset.testid = 'xchatEmbedRoute'
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    root.append(document.querySelector('main')!)
    return { editor, root, host }
  }

  it('injects the icon and picker styles inside the real XChat shadow root', async () => {
    const { editor, root } = setupShadow()
    expect(document.querySelector('textarea')).toBeNull()
    updateChatOwnPosts()
    const trigger = root.querySelector<HTMLButtonElement>('[data-testid="xf-chat-own-post-button"]')
    expect(trigger).not.toBeNull()
    expect(root.querySelector('#xf-style-chatOwnPosts')).not.toBeNull()
    trigger!.click(); await flush()
    expect(root.querySelector('#xf-style-ownPostPicker')).not.toBeNull()
    root.querySelector<HTMLButtonElement>('[data-post-id="123"]')!.click()
    expect(editor.value).toBe('https://x.com/me/status/123')
    editor.value = ''
    expect(slash(editor).defaultPrevented).toBe(true)
    await flush()
    expect(root.querySelector('[data-testid="xf-own-post-picker"]')).not.toBeNull()
  })

  it('observes replacement inputs inside the shadow root and removes a stale picker', async () => {
    const { editor, root } = setupShadow()
    updateChatOwnPosts()
    expect(slash(editor).defaultPrevented).toBe(true)
    await flush()
    const replacement = editor.cloneNode() as HTMLTextAreaElement
    editor.replaceWith(replacement)
    await flush()
    expect(root.querySelector('[data-testid="xf-own-post-picker"]')).toBeNull()
    expect(root.querySelectorAll('[data-testid="xf-chat-own-post-button"]')).toHaveLength(1)
    expect(slash(replacement).defaultPrevented).toBe(true)
  })

  it('discovers a shadow root attached after the host was mounted', async () => {
    vi.useFakeTimers()
    setup()
    const main = document.querySelector('main')!
    main.remove()
    const host = document.createElement('div')
    host.dataset.testid = 'xchatEmbedRoute'
    document.body.append(host)
    updateChatOwnPosts()
    const root = host.attachShadow({ mode: 'open' })
    root.append(main)
    await vi.advanceTimersByTimeAsync(300)
    expect(root.querySelector('[data-testid="xf-chat-own-post-button"]')).not.toBeNull()
  })

  it('adds one icon and keeps the picker search form outside the message form', async () => {
    setup()
    updateChatOwnPosts(); updateChatOwnPosts()
    expect(document.querySelectorAll('[data-testid="xf-chat-own-post-button"]')).toHaveLength(1)
    button().click(); await flush()
    expect(picker()).not.toBeNull()
    expect(picker()!.closest('[data-testid="dm-composer-form"]')).toBeNull()
    expect(picker()!.closest('dialog')?.open).toBe(true)
    expect(searchLibrary).toHaveBeenCalledWith('me', '', 30)
  })

  it('opens from a pointer click in a translated shadow composer using a top-layer dialog', async () => {
    const { root } = setupShadow()
    const main = root.querySelector('main')!
    main.style.translate = '-50%'
    main.style.overflow = 'hidden'
    updateChatOwnPosts()
    const trigger = root.querySelector<HTMLButtonElement>('[data-testid="xf-chat-own-post-button"]')!
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }))
    trigger.click(); await flush()
    const dialog = root.querySelector('dialog')!
    expect(dialog).not.toBeNull()
    expect(dialog.parentNode).toBe(root)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    expect(main.contains(dialog)).toBe(false)
    expect(dialog.querySelector('[data-post-id="123"]')).not.toBeNull()
    // A rescan and repeated click must not remove or recreate the open dialog.
    updateChatOwnPosts(); trigger.click(); await flush()
    expect(root.querySelector('dialog')).toBe(dialog)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(root.querySelector('dialog')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('replaces only the saved selection, updates controlled state, and never submits', async () => {
    const editor = setup()
    editor.value = '前文旧链接后文'
    editor.setSelectionRange(2, 5)
    // Simulate React tracking the element value: the native setter must bypass its own setter.
    const ownSetter = vi.fn()
    Object.defineProperty(editor, 'value', { get: () => Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.get!.call(editor), set: ownSetter, configurable: true })
    const input = vi.fn(); const submit = vi.fn(event => event.preventDefault())
    editor.addEventListener('input', input)
    editor.closest('form')!.addEventListener('submit', submit)
    updateChatOwnPosts(); button().click(); await flush(); selectPost()
    expect(editor.value).toBe('前文 https://x.com/me/status/123 后文')
    expect(editor.selectionStart).toBe('前文 https://x.com/me/status/123 '.length)
    expect(input).toHaveBeenCalledOnce()
    expect(ownSetter).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(editor)
    expect(picker()).toBeNull()
  })

  it('opens on slash only in an empty draft and supports Escape and reopening', async () => {
    const editor = setup(); updateChatOwnPosts()
    expect(slash(editor).defaultPrevented).toBe(true)
    await flush()
    expect(editor.value).toBe('')
    picker()!.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(picker()).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(slash(editor).defaultPrevented).toBe(true)
    await flush(); selectPost()
    expect(editor.value).toBe('https://x.com/me/status/123')
  })

  it('leaves existing text, URLs, IME input and modified slash keys alone', () => {
    const editor = setup(); updateChatOwnPosts()
    for (const value of ['已有文字', 'https:', ' ']) {
      editor.value = value
      expect(slash(editor).defaultPrevented).toBe(false)
    }
    editor.value = ''
    for (const init of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
      expect(slash(editor, init).defaultPrevented).toBe(false)
    }
    expect(picker()).toBeNull()
  })

  it('preserves a draft changed while the picker is open', async () => {
    const editor = setup(); updateChatOwnPosts(); button().click(); await flush()
    editor.value = '更新后的文字'
    selectPost()
    expect(editor.value).toBe('更新后的文字 https://x.com/me/status/123')
  })

  it('does not insert into a different conversation and resets the binding after navigation', async () => {
    const editor = setup(); updateChatOwnPosts(); button().click(); await flush()
    window.history.pushState({}, '', '/i/chat/group2')
    selectPost()
    expect(editor.value).toBe('')
    updateChatOwnPosts(); button().click(); await flush(); selectPost()
    expect(editor.value).toBe('https://x.com/me/status/123')
  })

  it('cleans up a removed input and reconnects to the replacement', async () => {
    setup(); updateChatOwnPosts(); button().click(); await flush()
    const old = button()
    document.querySelector('textarea')!.remove()
    updateChatOwnPosts()
    expect(picker()).toBeNull()
    expect(old.isConnected).toBe(false)
    const editor = setup(); updateChatOwnPosts(); button().click(); await flush(); selectPost()
    expect(editor.value).toContain('/status/123')
  })

  it('ignores disabled/read-only chat fields and unrelated textareas', () => {
    const editor = setup(); editor.disabled = true; updateChatOwnPosts()
    expect(button()).toBeNull()
    editor.disabled = false; editor.readOnly = true; updateChatOwnPosts()
    expect(button()).toBeNull()
    editor.readOnly = false; editor.removeAttribute('data-testid'); updateChatOwnPosts()
    expect(button()).toBeNull()
  })
})

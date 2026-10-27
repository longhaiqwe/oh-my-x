import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isComposeUrl,
  isComposeModalOpen,
  savePrecomposeUrl,
  getPrecomposeUrl,
  attachPrecomposeUrlCapture,
} from '../../content-scripts/options/precompose'
import { addComposerInsertLinkButton } from '../../content-scripts/options/composer'

describe('composer and precompose URL handling', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    sessionStorage.clear()
    delete (window as any).__xf_preComposeUrl
    delete (window as any).__xf_precompose_listener_installed
  })

  describe('isComposeUrl', () => {
    it('accurately identifies compose routes', () => {
      expect(isComposeUrl('/compose/post')).toBe(true)
      expect(isComposeUrl('https://x.com/compose/post')).toBe(true)
      expect(isComposeUrl('https://x.com/compose/articles')).toBe(true)
      expect(isComposeUrl('https://x.com/intent/post')).toBe(true)
      expect(isComposeUrl('https://x.com/intent/tweet')).toBe(true)

      expect(isComposeUrl('https://x.com/home')).toBe(false)
      expect(isComposeUrl('https://x.com/username/status/123456789')).toBe(false)
      expect(isComposeUrl('https://x.com/i/bookmarks')).toBe(false)
      expect(isComposeUrl(null)).toBe(false)
      expect(isComposeUrl('')).toBe(false)
    })
  })

  describe('savePrecomposeUrl & getPrecomposeUrl anti-overwrite guards', () => {
    it('saves regular browsing URL into sessionStorage and window memory', () => {
      const normalUrl = 'https://x.com/elonmusk/status/18888888888'
      savePrecomposeUrl(normalUrl)

      expect(sessionStorage.getItem('xf.preComposeUrl')).toBe(normalUrl)
      expect((window as any).__xf_preComposeUrl).toBe(normalUrl)
      expect(getPrecomposeUrl()).toBe(normalUrl)
    })

    it('refuses to save or overwrite with compose URL', () => {
      const normalUrl = 'https://x.com/someuser/status/111222'
      savePrecomposeUrl(normalUrl)

      // Try to overwrite with compose URL
      savePrecomposeUrl('https://x.com/compose/post')

      // Should still retain the previous normal URL
      expect(getPrecomposeUrl()).toBe(normalUrl)
    })

    it('refuses to overwrite when compose modal is already open in DOM', () => {
      const normalUrl = 'https://x.com/someuser/status/333444'
      savePrecomposeUrl(normalUrl)

      // Create an open compose modal
      const modal = document.createElement('div')
      modal.setAttribute('role', 'dialog')
      modal.innerHTML = '<div class="DraftEditor-editorContainer"><div contenteditable="true" data-testid="tweetTextarea_0"></div></div>'
      document.body.appendChild(modal)

      expect(isComposeModalOpen()).toBe(true)

      // Attempt to save another URL while modal is open
      savePrecomposeUrl('https://x.com/another/page')

      // Must NOT be overwritten
      expect(getPrecomposeUrl()).toBe(normalUrl)
    })

    it('does not overwrite existing tweet URL when user navigates to home/explore', () => {
      const tweetUrl = 'https://x.com/Vincent_AINotes/status/2097214018025037831'
      savePrecomposeUrl(tweetUrl)
      expect(getPrecomposeUrl()).toBe(tweetUrl)

      // User goes back to /home
      savePrecomposeUrl('https://x.com/home')
      expect(getPrecomposeUrl()).toBe(tweetUrl)

      // User goes to /explore
      savePrecomposeUrl('https://x.com/explore')
      expect(getPrecomposeUrl()).toBe(tweetUrl)
    })
  })

  describe('keyboard typing guard (anti-rewrite when typing n/N in contenteditable)', () => {
    it('does not trigger savePrecomposeUrl when pressing n in contenteditable editor', () => {
      const normalUrl = 'https://x.com/test/status/999'
      savePrecomposeUrl(normalUrl)

      attachPrecomposeUrlCapture()

      // Compose link in sidebar
      const sidebarLink = document.createElement('a')
      sidebarLink.setAttribute('href', '/compose/post')
      document.body.appendChild(sidebarLink)

      // Compose modal with contenteditable
      const modal = document.createElement('div')
      modal.setAttribute('role', 'dialog')
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      editor.setAttribute('data-testid', 'tweetTextarea_0')
      modal.appendChild(editor)
      document.body.appendChild(modal)

      // User types 'n' inside editor
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'n',
        bubbles: true,
        cancelable: true,
      })
      editor.dispatchEvent(keyEvent)

      // URL should remain the pre-compose URL, not overwritten
      expect(getPrecomposeUrl()).toBe(normalUrl)
    })
  })

  describe('composer insert link button lifecycle', () => {
    it('retains preComposeUrl in storage after insert, supporting typing and repeated insertion', () => {
      const normalUrl = 'https://x.com/developer/status/777'
      savePrecomposeUrl(normalUrl)

      // Setup compose modal structure
      const modal = document.createElement('div')
      modal.setAttribute('aria-labelledby', 'modal-header')
      modal.setAttribute('role', 'dialog')

      const draftContainer = document.createElement('div')
      draftContainer.className = 'DraftEditor-editorContainer'
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      editor.setAttribute('data-testid', 'tweetTextarea_0')
      draftContainer.appendChild(editor)
      modal.appendChild(draftContainer)

      const tablist = document.createElement('div')
      tablist.setAttribute('role', 'tablist')
      modal.appendChild(tablist)

      document.body.appendChild(modal)

      // Inject insert button
      addComposerInsertLinkButton()

      const insertBtn = modal.querySelector<HTMLButtonElement>('[data-testid="xf-insert-link-button"]')
      expect(insertBtn).not.toBeNull()

      // 1. Direct insert: should work
      insertBtn!.click()

      // Crucial: sessionStorage MUST NOT be destroyed
      expect(getPrecomposeUrl()).toBe(normalUrl)

      // 2. Simulate user typing content 'a' in the editor
      editor.innerText = 'a'

      // 3. User clicks insert button again: should still insert pre-compose URL, not https://x.com/
      insertBtn!.click()
      expect(getPrecomposeUrl()).toBe(normalUrl)
    })

    it('refuses to insert root domain https://x.com/ when preComposeUrl is missing and referrer is root', () => {
      // No preComposeUrl
      sessionStorage.clear()
      delete (window as any).__xf_preComposeUrl

      Object.defineProperty(document, 'referrer', {
        value: 'https://x.com/',
        configurable: true,
      })

      const modal = document.createElement('div')
      modal.setAttribute('aria-labelledby', 'modal-header')
      modal.setAttribute('role', 'dialog')
      const draftContainer = document.createElement('div')
      draftContainer.className = 'DraftEditor-editorContainer'
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      editor.setAttribute('data-testid', 'tweetTextarea_0')
      draftContainer.appendChild(editor)
      modal.appendChild(draftContainer)
      const tablist = document.createElement('div')
      tablist.setAttribute('role', 'tablist')
      modal.appendChild(tablist)
      document.body.appendChild(modal)

      addComposerInsertLinkButton()
      const insertBtn = modal.querySelector<HTMLButtonElement>('[data-testid="xf-insert-link-button"]')
      expect(insertBtn).not.toBeNull()

      insertBtn!.click()

      // Editor should NOT contain 'https://x.com/'
      expect(editor.innerText || '').not.toContain('https://x.com/')
    })

    it('injects markdown format button and reformats editor content on click', () => {
      const modal = document.createElement('div')
      modal.setAttribute('aria-labelledby', 'modal-header')
      modal.setAttribute('role', 'dialog')

      const draftContainer = document.createElement('div')
      draftContainer.className = 'DraftEditor-editorContainer'
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      editor.setAttribute('data-testid', 'tweetTextarea_0')
      editor.innerText = '* **例子**: 这是一个测试。\n### 标题'
      draftContainer.appendChild(editor)
      modal.appendChild(draftContainer)

      const tablist = document.createElement('div')
      tablist.setAttribute('role', 'tablist')
      modal.appendChild(tablist)
      document.body.appendChild(modal)

      addComposerInsertLinkButton()

      const formatBtn = modal.querySelector<HTMLButtonElement>('[data-testid="xf-format-markdown-button"]')
      expect(formatBtn).not.toBeNull()

      // 模拟点击格式化按钮
      formatBtn!.click()

      // 内容应该被规范为无 ** 和无 ### 的格式
      const text = editor.innerText || editor.textContent || ''
      expect(text).not.toContain('###')
      expect(text).not.toContain('**')
      expect(text).toContain('• 例子：这是一个测试。')
    })

    it('intercepts paste event with markdown content and converts automatically', () => {
      const modal = document.createElement('div')
      modal.setAttribute('aria-labelledby', 'modal-header')
      modal.setAttribute('role', 'dialog')

      const draftContainer = document.createElement('div')
      draftContainer.className = 'DraftEditor-editorContainer'
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      editor.setAttribute('data-testid', 'tweetTextarea_0')
      draftContainer.appendChild(editor)
      modal.appendChild(draftContainer)

      const tablist = document.createElement('div')
      tablist.setAttribute('role', 'tablist')
      modal.appendChild(tablist)
      document.body.appendChild(modal)

      addComposerInsertLinkButton()

      // 模拟向编辑器粘贴含有 Markdown 的文本
      const rawMarkdown = '### 核心观点\n* **重点**: 说明内容'
      const pasteEvent = new Event('paste', {
        bubbles: true,
        cancelable: true,
      }) as any
      pasteEvent.clipboardData = {
        getData: (type: string) => (type === 'text/plain' ? rawMarkdown : ''),
      }

      editor.dispatchEvent(pasteEvent)

      const text = editor.innerText || editor.textContent || ''
      expect(text).not.toContain('###')
      expect(text).not.toContain('**')
      expect(text).toContain('核心观点')
      expect(text).toContain('• 重点：说明内容')
    })

    describe('paste inside X editor wrappers', () => {
      // jsdom 没有剪贴板事件，按浏览器的用法补一个最小实现
      class FakeDataTransfer {
        private data = new Map<string, string>()
        setData(type: string, value: string) { this.data.set(type, value) }
        getData(type: string) { return this.data.get(type) ?? '' }
      }
      class FakeClipboardEvent extends Event {
        clipboardData: FakeDataTransfer | null
        constructor(type: string, init: EventInit & { clipboardData?: FakeDataTransfer } = {}) {
          super(type, init)
          this.clipboardData = init.clipboardData ?? null
        }
      }

      afterEach(() => {
        vi.unstubAllGlobals()
      })

      /** 仿 X 真实结构：label > RichTextInputContainer > DraftEditor-editorContainer > 编辑器 */
      function setupXComposer(lines: string[]) {
        vi.stubGlobal('DataTransfer', FakeDataTransfer)
        vi.stubGlobal('ClipboardEvent', FakeClipboardEvent)
        document.body.innerHTML = `
          <div role="dialog" aria-labelledby="modal-header">
            <div data-testid="tweetTextarea_0_label">
              <div data-testid="tweetTextarea_0RichTextInputContainer">
                <div class="DraftEditor-editorContainer">
                  <div data-testid="tweetTextarea_0" contenteditable="true" tabindex="0">${
                    lines.map(line => `<div data-block="true"><span data-text="true">${line}</span></div>`).join('')
                  }</div>
                </div>
              </div>
            </div>
            <div role="tablist"></div>
          </div>`
        const editor = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!
        // 模拟 DraftJS 的 onPaste：接管插件派发的粘贴并记录文字和光标所在行
        const handled: { text: string, line: string | null }[] = []
        editor.addEventListener('paste', (ev) => {
          ev.preventDefault()
          handled.push({
            text: (ev as unknown as FakeClipboardEvent).clipboardData!.getData('text/plain'),
            line: window.getSelection()?.anchorNode?.textContent ?? null,
          })
        })
        addComposerInsertLinkButton()
        return { editor, handled }
      }

      function placeCaret(node: Node, offset: number) {
        const range = document.createRange()
        range.setStart(node, offset)
        range.collapse(true)
        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)
      }

      function pasteInto(target: HTMLElement, text: string) {
        const data = new FakeDataTransfer()
        data.setData('text/plain', text)
        target.dispatchEvent(new FakeClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      }

      it('hands converted markdown to the editor exactly once', () => {
        const { editor, handled } = setupXComposer([''])
        const span = editor.querySelector<HTMLElement>('[data-text="true"]')!
        editor.focus()
        placeCaret(span, 0)

        pasteInto(span, '第一段，共 152 行。\n\n* Crapper：计算复杂度。\n\n最后一段。')

        expect(handled.map(h => h.text)).toEqual(['第一段，共 152 行。\n\n• Crapper：计算复杂度。\n\n最后一段。'])
      })

      it('pastes at the live caret instead of the position saved on blur', () => {
        const { editor, handled } = setupXComposer(['旧位置', '新位置'])
        const [oldLine, newLine] = [...editor.querySelectorAll<HTMLElement>('[data-text="true"]')]
        editor.focus()
        placeCaret(oldLine.firstChild!, 3)
        editor.dispatchEvent(new FocusEvent('blur'))

        editor.focus()
        placeCaret(newLine.firstChild!, 3)
        pasteInto(newLine, '* 列表项')

        expect(handled).toEqual([{ text: '• 列表项', line: '新位置' }])
      })
    })
  })
})

import { createApp, nextTick, type App as VueApp } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../entrypoints/popup/App.vue'
import OptionsApp from '../../entrypoints/options/OptionsApp.vue'
import { applyLanguageSetting } from '../../shared/i18n'
import { defaultSpamKeywords, defaultTweetFilterKeywords } from '../../storage-keys'
import { event, flushMicrotasks } from '../helpers/runtime-port'

// 英文界面下，弹窗和完整设置页里不应再有中文。
// 例外：默认垃圾词和屏蔽词是用户可编辑的数据；语言菜单里「中文」和语言按钮名故意保留中文
const ALLOWED = new Set<string>([
  ...defaultSpamKeywords,
  ...defaultTweetFilterKeywords,
  '中文',
  'Language · 语言',
])
const CJK = /[一-鿿]/
// 先去掉允许的词（长的先去），再看剩下的有没有中文；「Remove 同城」这类带用户数据的标签可以通过
const ALLOWED_BY_LENGTH = [...ALLOWED].sort((a, b) => b.length - a.length)
const hasDisallowedChinese = (text: string) =>
  CJK.test(ALLOWED_BY_LENGTH.reduce((rest, word) => rest.split(word).join(''), text))

let app: VueApp | undefined
let root: HTMLDivElement

async function settle() {
  for (let i = 0; i < 3; i++) {
    await flushMicrotasks()
    await nextTick()
  }
}

/** 页面上所有带中文的文字和属性（排除允许的） */
function chineseLeftovers(): string[] {
  const found = new Set<string>()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() ?? ''
    if (hasDisallowedChinese(text)) found.add(text)
  }
  for (const el of document.body.querySelectorAll('*')) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const value = el.getAttribute(attr)?.trim()
      if (value && hasDisallowedChinese(value)) found.add(`[${attr}] ${value}`)
    }
  }
  return [...found]
}

async function expandAll() {
  for (const button of document.querySelectorAll<HTMLElement>('#root [aria-expanded="false"]')) {
    if (!button.closest('[role="tablist"]') && button.getAttribute('aria-haspopup') !== 'menu') button.click()
  }
  await settle()
}

beforeEach(() => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('browser', {
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension${path}`,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: { addListener: () => {} },
    },
    tabs: { query: vi.fn().mockResolvedValue([]), create: vi.fn() },
    i18n: { getUILanguage: () => 'zh-CN' },
    permissions: { contains: vi.fn().mockResolvedValue(false), request: vi.fn().mockResolvedValue(false) },
    storage: {
      local: {
        get: async () => ({ ...store }),
        set: async (kv: Record<string, unknown>) => { Object.assign(store, kv) },
        remove: async () => {},
      },
      onChanged: event(),
    },
  })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  applyLanguageSetting('en')
  root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
})

afterEach(() => {
  app?.unmount()
  app = undefined
  root.remove()
  document.body.innerHTML = ''
  applyLanguageSetting('auto')
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('英文界面没有残留中文', () => {
  it('弹窗：5 个模块和过滤的 4 个子页', async () => {
    app = createApp(App)
    app.mount(root)
    await settle()

    const leftovers: Record<string, string[]> = {}
    const tabs = () => [...root.querySelectorAll<HTMLElement>('[role="tab"]')]
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual(['Layout', 'Filter', 'Insights', 'Create', 'Engage'])

    for (let i = 0; i < tabs().length; i++) {
      tabs()[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      await settle()
      await expandAll()
      leftovers[`tab ${i}`] = chineseLeftovers()

      if (i === 1) {
        const pages = [...root.querySelectorAll<HTMLElement>('[data-details-for]')].map((el) => el.dataset.detailsFor!)
        expect(pages).toEqual(['spamFilter', 'tweetFilter', 'spamAccountLists', 'spamLog'])
        for (const id of pages) {
          root.querySelector<HTMLElement>(`[data-details-for="${id}"]`)!.click()
          await settle()
          await expandAll()
          leftovers[`filter/${id}`] = chineseLeftovers()
          root.querySelector<HTMLElement>('[aria-label="Back to Content Filter"]')!.click()
          await settle()
        }
      }
    }

    expect(Object.fromEntries(Object.entries(leftovers).filter(([, list]) => list.length))).toEqual({})
  })

  it('完整设置页：侧栏和每个模块', async () => {
    history.replaceState(null, '', '/options.html#layout')
    app = createApp(OptionsApp)
    app.mount(root)
    await settle()

    const leftovers: Record<string, string[]> = {}
    for (const button of [...root.querySelectorAll<HTMLButtonElement>('nav button')]) {
      button.click()
      await settle()
      await expandAll()
      leftovers[button.textContent?.trim() ?? ''] = chineseLeftovers()
    }
    expect(document.title).toMatch(/· oh-my-x settings$/)
    expect(Object.fromEntries(Object.entries(leftovers).filter(([, list]) => list.length))).toEqual({})
  })
})

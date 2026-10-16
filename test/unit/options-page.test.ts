import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OptionsApp from '../../entrypoints/options/OptionsApp.vue'
import Header from '../../entrypoints/popup/components/sections/Header.vue'
import { event, flushMicrotasks } from '../helpers/runtime-port'

let app: App | undefined
let root: HTMLDivElement
let tabsCreate: ReturnType<typeof vi.fn>

async function settle() {
  await flushMicrotasks()
  await nextTick()
  await flushMicrotasks()
  await nextTick()
}

function mount(component: Parameters<typeof createApp>[0], props?: Record<string, unknown>) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(component, props)
  app.mount(root)
}

function navButton(title: string) {
  return [...root.querySelectorAll<HTMLButtonElement>('nav button')].find((b) => b.textContent?.includes(title))!
}

beforeEach(() => {
  const store: Record<string, unknown> = {}
  tabsCreate = vi.fn().mockResolvedValue({})
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('browser', {
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension${path}`,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    tabs: { query: vi.fn().mockResolvedValue([]), create: tabsCreate },
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
})

afterEach(() => {
  app?.unmount()
  app = undefined
  root.remove()
  history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

it('按地址里的模块 id 打开对应模块', async () => {
  history.replaceState(null, '', '/options.html#create')
  mount(OptionsApp)
  await settle()
  expect(root.querySelector('main')?.textContent).toContain('创作与发布')
  expect(navButton('创作与发布').getAttribute('aria-current')).toBe('page')
  expect(document.title).toContain('创作与发布')
})

it('点击左侧导航切换模块，地址同步更新', async () => {
  history.replaceState(null, '', '/options.html')
  mount(OptionsApp)
  await settle()
  expect(window.location.hash).toBe('#layout')

  navButton('内容过滤').click()
  await settle()
  expect(window.location.hash).toBe('#filter')
  expect(root.querySelector('main')?.textContent).toContain('垃圾回复过滤')
})

it('旧版标签 id 打开对应的新模块', async () => {
  history.replaceState(null, '', '/options.html#viral')
  mount(OptionsApp)
  await settle()
  expect(root.querySelector('main')?.textContent).toContain('数据洞察')
  expect(window.location.hash).toBe('#insight')
})

it('完整设置页里博主活动度只显示提示，不显示扫描按钮', async () => {
  history.replaceState(null, '', '/options.html#insight')
  mount(OptionsApp)
  await settle()
  const text = root.querySelector('main')?.textContent ?? ''
  expect(text).toContain('在博主主页打开插件弹窗')
  expect(text).not.toContain('扫描近 7 天')
})

it('弹窗头部的「完整设置」按钮打开设置页并定位到当前模块', async () => {
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  mount(Header, { currentModule: 'filter' })
  await settle()
  root.querySelector<HTMLButtonElement>('[aria-label="在新标签页打开完整设置"]')!.click()
  await settle()
  expect(tabsCreate).toHaveBeenCalledWith({ url: 'chrome-extension://test-extension/options.html#filter' })
  expect(close).toHaveBeenCalled()
  close.mockRestore()
})

import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LayoutModule from '../../entrypoints/popup/components/modules/LayoutModule.vue'
import { KeySidebarColumn, KeyTweetButton } from '../../storage-keys'
import { event, flushMicrotasks } from '../helpers/runtime-port'

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>

let app: App
let root: HTMLDivElement
let store: Record<string, unknown>

function pick(keys?: string | string[] | Record<string, unknown> | null) {
  if (keys == null) return { ...store }
  const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
  return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]))
}

async function settle() {
  await flushMicrotasks()
  await nextTick()
  await flushMicrotasks()
  await nextTick()
}

function switchFor(label: string) {
  return root.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`)!
}

async function mount(initial: Record<string, unknown> = {}) {
  store = { ...initial }
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(LayoutModule)
  app.mount(root)
  await settle()
}

beforeEach(() => {
  localStorage.clear()
  const onChanged = event<(changes: Changes, area: string) => void>()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('browser', {
    runtime: { id: 'test-extension', sendMessage: vi.fn().mockResolvedValue(undefined) },
    storage: {
      local: {
        get: async (keys?: string | string[] | null) => pick(keys),
        set: async (kv: Record<string, unknown>) => {
          const changes: Changes = {}
          for (const [k, v] of Object.entries(kv)) changes[k] = { oldValue: store[k], newValue: v }
          Object.assign(store, kv)
          onChanged.emit(changes, 'local')
        },
        remove: async (keys: string | string[]) => {
          for (const k of ([] as string[]).concat(keys)) delete store[k]
        },
      },
      onChanged,
    },
  })
})

afterEach(() => {
  app.unmount()
  root.remove()
  vi.unstubAllGlobals()
})

it('X 默认显示的右侧边栏和发帖按钮，开关写成「隐藏…」，默认关闭', async () => {
  await mount()
  expect(root.textContent).toContain('隐藏右侧边栏')
  expect(root.textContent).toContain('隐藏发帖按钮')
  expect(root.textContent).not.toContain('显示右侧边栏')
  expect(root.textContent).not.toContain('显示发帖按钮')
  expect(switchFor('隐藏右侧边栏').getAttribute('aria-checked')).toBe('false')
  expect(switchFor('隐藏发帖按钮').getAttribute('aria-checked')).toBe('false')
})

it('打开开关 = 隐藏，存储值保持原来的含义', async () => {
  await mount()
  switchFor('隐藏右侧边栏').click()
  switchFor('隐藏发帖按钮').click()
  await settle()
  // sidebarColumn 存 'on' 表示隐藏；tweetButton 存 'off' 表示隐藏
  expect(store[KeySidebarColumn]).toBe('on')
  expect(store[KeyTweetButton]).toBe('off')
})

it('已经隐藏的用户升级后，开关显示为打开', async () => {
  await mount({ [KeySidebarColumn]: 'on', [KeyTweetButton]: 'off' })
  expect(switchFor('隐藏右侧边栏').getAttribute('aria-checked')).toBe('true')
  expect(switchFor('隐藏发帖按钮').getAttribute('aria-checked')).toBe('true')
})

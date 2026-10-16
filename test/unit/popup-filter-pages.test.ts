import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FilterModule from '../../entrypoints/popup/components/modules/FilterModule.vue'
import { KeySpamThreshold, KeySpamWhitelist } from '../../storage-keys'
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

function detailsButton(featureId: string) {
  return root.querySelector<HTMLButtonElement>(`[data-details-for="${featureId}"]`)!
}

function backButton() {
  return root.querySelector<HTMLButtonElement>('[aria-label="返回内容过滤"]')!
}

beforeEach(async () => {
  store = {}
  localStorage.clear()
  const onChanged = event<(changes: Changes, area: string) => void>()
  // jsdom 没有 ResizeObserver，滑块组件挂载时会用到
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
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(FilterModule)
  app.mount(root)
  await settle()
})

afterEach(() => {
  app.unmount()
  root.remove()
  vi.unstubAllGlobals()
})

it('从第一层进入垃圾回复过滤的第二层，返回后焦点回到入口按钮', async () => {
  expect(root.textContent).toContain('账号例外')
  expect(root.textContent).toContain('拦截记录')

  detailsButton('spamFilter').click()
  await settle()
  expect(backButton()).toBeTruthy()
  expect(root.textContent).toContain('隐藏阈值')
  expect(root.textContent).toContain('检测规则')
  expect(root.textContent).not.toContain('账号例外')

  backButton().click()
  await settle()
  expect(root.textContent).toContain('账号例外')
  expect(root.querySelector('[aria-label="返回内容过滤"]')).toBeNull()
  expect(document.activeElement).toBe(detailsButton('spamFilter'))
})

it('在名单页修改后直接返回，第一层显示新数量', async () => {
  expect(root.textContent).toContain('白名单 0 个')

  detailsButton('spamAccountLists').click()
  await settle()
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="白名单"]')!
  textarea.value = '@alice\n@bob'
  textarea.dispatchEvent(new Event('input'))

  // 不等防抖保存，立即返回
  backButton().click()
  await settle()
  expect(store[KeySpamWhitelist]).toBe('@alice\n@bob')
  expect(root.textContent).toContain('白名单 2 个')
})

it('设置在别处修改时，第一层状态行同步更新', async () => {
  expect(root.textContent).toContain('阈值 55')
  await browser.storage.local.set({ [KeySpamThreshold]: 80 })
  await settle()
  expect(root.textContent).toContain('阈值 80')
})

import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AiRepostCard from '../../entrypoints/popup/components/sections/AiRepostCard.vue'
import SettingsReady from '../../entrypoints/popup/components/ui/SettingsReady.vue'
import { ModuleNavigationKey } from '../../entrypoints/popup/module-navigation'
import { event, flushMicrotasks } from '../helpers/runtime-port'

let app: App | undefined
let root: HTMLDivElement
let stored: Record<string, unknown>
let sendMessage: ReturnType<typeof vi.fn>
async function settle() { await flushMicrotasks(); await nextTick() }
beforeEach(() => {
  stored = { aiServiceBaseUrl: 'https://shared.example/v1', aiServiceApiKey: 'key', aiServiceModel: 'common-model', aiRepostModel: 'summary-model' }
  sendMessage = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('browser', {
    runtime: { id: 'test-extension', sendMessage },
    storage: { local: { get: async () => ({ ...stored }), set: async (patch: object) => Object.assign(stored, patch) }, onChanged: event() },
  })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => { app?.unmount(); root.remove(); vi.unstubAllGlobals() })

it('shows the shared endpoint and effective summary model, and navigates to Settings', async () => {
  const navigate = vi.fn()
  app = createApp(AiRepostCard)
  app.provide(ModuleNavigationKey, navigate).mount(root)
  await settle()
  expect(root.textContent).toContain('shared.example / summary-model')
  const button = [...root.querySelectorAll('button')].find(el => el.textContent?.trim() === '配置 AI 服务')!
  button.click()
  expect(navigate).toHaveBeenCalledWith('settings')
  expect(root.querySelector('#ai-api-key')).toBeNull()
  expect(root.querySelector('#ai-base-url')).toBeNull()
})

it('clearing the summary override follows the default and only persists feature settings', async () => {
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  const input = root.querySelector<HTMLInputElement>('#ai-repost-model')!
  input.value = ''; input.dispatchEvent(new Event('input'))
  await nextTick()
  expect(root.textContent).toContain('shared.example / common-model')
  app.unmount(); app = undefined
  await settle()
  expect(stored.aiRepostModel).toBe('')
  expect(stored.aiServiceModel).toBe('common-model')
  expect(stored.aiServiceApiKey).toBe('key')
})

it('does not mount editable settings before migration finishes and allows retry after failure', async () => {
  let resolve!: (result: unknown) => void
  sendMessage.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  app = createApp({ render: () => h(SettingsReady, null, { default: () => h('input', { id: 'editable' }) }) })
  app.mount(root)
  expect(root.querySelector('#editable')).toBeNull()
  resolve({ ok: false }); await settle()
  expect(root.textContent).toContain('设置加载失败')
  root.querySelector('button')!.click(); await settle()
  expect(root.querySelector('#editable')).not.toBeNull()
  expect(sendMessage).toHaveBeenCalledWith({ type: 'XF_MIGRATE_AI_SERVICE' })
})


it('defaults to summary and reply, saves chosen types, and restores them on remount', async () => {
  stored.aiRepostStylePrompt = '自己的语气'
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  const first = root.querySelector<HTMLSelectElement>('#ai-option-a')!
  const second = root.querySelector<HTMLSelectElement>('#ai-option-b')!
  expect(first.value).toBe('summary')
  expect(second.value).toBe('summary-short')
  expect(second.options).toHaveLength(4)
  first.value = 'extension'; first.dispatchEvent(new Event('change'))
  second.value = 'extension-short'; second.dispatchEvent(new Event('change'))
  await nextTick()
  app.unmount(); app = undefined
  await settle()
  expect(stored).toMatchObject({ aiRepostOptionA: 'extension', aiRepostOptionB: 'extension-short', aiRepostStylePrompt: '自己的语气' })
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  expect(root.querySelector<HTMLSelectElement>('#ai-option-a')!.value).toBe('extension')
  expect(root.querySelector<HTMLSelectElement>('#ai-option-b')!.value).toBe('extension-short')
})

async function fill(selector: string, value: string, event = 'input') {
  const input = root.querySelector<HTMLInputElement>(selector)!
  input.value = value
  input.dispatchEvent(new Event(event))
  await settle()
}
async function action(name: string) {
  root.querySelector<HTMLButtonElement>(`[data-action="style-${name}"]`)!.click()
  await settle()
}

it('creates, selects, renames, copies, and deletes styles while preserving legacy preferences', async () => {
  stored.aiRepostStylePrompt = '旧的偏好'
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  await action('add')
  await action('save')
  expect(root.textContent).toContain('请填写风格名称')
  await fill('#ai-style-name', '我的短评')
  await fill('#ai-style-requirements', '20 字左右，只回应一个事实')
  await fill('#ai-style-examples', '省掉这一步就够了。')
  await action('save')
  const [saved] = JSON.parse(stored.aiRepostStyles as string)
  expect(saved).toMatchObject({ name: '我的短评', base: 'summary-short', description: '20 字左右，只回应一个事实', samples: '省掉这一步就够了。' })
  expect(root.querySelector<HTMLSelectElement>('#ai-option-b')!.options).toHaveLength(5)
  await fill('#ai-option-a', saved.id, 'change')
  await fill('#ai-option-b', saved.id, 'change')
  await fill('#ai-style-name', '改名后的短评')
  await action('save')
  expect(root.querySelector<HTMLSelectElement>('#ai-option-b')!.selectedOptions[0].textContent).toBe('改名后的短评')
  await action('copy')
  await action('save')
  const copied = JSON.parse(stored.aiRepostStyles as string)
  expect(copied).toHaveLength(2)
  expect(copied[1].id).not.toBe(saved.id)
  expect(copied[1].samples).toBe(saved.samples)
  await fill('#ai-style-library', saved.id, 'change')
  await action('delete')
  expect(stored.aiRepostOptionA).toBe('summary')
  expect(stored.aiRepostOptionB).toBe('summary-short')
  expect(JSON.parse(stored.aiRepostStyles as string)).toHaveLength(1)
  expect(stored.aiRepostStylePrompt).toBe('旧的偏好')
  app.unmount(); app = undefined
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  expect(root.querySelector<HTMLSelectElement>('#ai-option-b')!.options).toHaveLength(5)
})

it('copies a built-in without modifying it and cancels unsaved edits', async () => {
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  await fill('#ai-style-library', 'extension-short', 'change')
  await action('copy')
  expect(root.querySelector<HTMLSelectElement>('#ai-style-base')!.value).toBe('extension-short')
  await fill('#ai-style-name', '未保存的风格')
  await action('cancel')
  expect(stored.aiRepostStyles).toBeUndefined()
  expect(root.querySelector('#ai-style-name')).toBeNull()
  expect(root.querySelector<HTMLSelectElement>('#ai-option-a')!.options).toHaveLength(4)
})

it('keeps an unsaved style editable when storage fails and allows retry', async () => {
  const storage = (globalThis as any).browser.storage.local
  const originalSet = storage.set
  storage.set = vi.fn().mockRejectedValue(new Error('storage failed'))
  app = createApp(AiRepostCard); app.mount(root)
  await settle()
  await action('add')
  await fill('#ai-style-name', '重试风格')
  await action('save')
  expect(root.textContent).toContain('设置保存失败')
  expect(root.querySelector<HTMLInputElement>('#ai-style-name')!.value).toBe('重试风格')
  expect(root.querySelector<HTMLSelectElement>('#ai-option-a')!.options).toHaveLength(4)
  storage.set = originalSet
  await action('save')
  expect(JSON.parse(stored.aiRepostStyles as string)[0].name).toBe('重试风格')
  expect(root.querySelector<HTMLSelectElement>('#ai-option-a')!.options).toHaveLength(5)
})

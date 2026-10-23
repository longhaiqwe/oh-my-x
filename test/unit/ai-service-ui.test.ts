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

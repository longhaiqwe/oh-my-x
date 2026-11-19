import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CreatorRewardsCard from '../../entrypoints/popup/components/sections/CreatorRewardsCard.vue'
import { KeyCreatorRewardsStats, KeyCreatorRewardsPageState } from '../../storage-keys'

let app: App | undefined
let root: HTMLDivElement
let store: Record<string, unknown>
let listener: (changes: Record<string, unknown>, area: string) => void
let sendMessage: ReturnType<typeof vi.fn>
const stats = { impressionsCount: 494600, impressionsText: '494.6K', targetImpressionsCount: 500000, targetImpressionsText: '500K', progressPercent: 98.9, updatedAt: 1 }
async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() } }
async function mount() { app = createApp(CreatorRewardsCard); app.mount(root); await settle() }
beforeEach(() => {
  store = { [KeyCreatorRewardsStats]: JSON.stringify(stats) }
  sendMessage = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('browser', {
    runtime: { id: 'test', sendMessage },
    storage: { local: { get: async () => ({ ...store }), set: async (kv: Record<string, unknown>) => { Object.assign(store, kv) } }, onChanged: { addListener: (fn: typeof listener) => { listener = fn }, removeListener: vi.fn() } },
    i18n: { getUILanguage: () => 'zh-CN' },
  })
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => { app?.unmount(); root.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('申请阶段显示庆祝与可申请，不显示还差 5.4K，保留最后真实读数', async () => {
  store[KeyCreatorRewardsPageState] = JSON.stringify({ stage: 'application', updatedAt: Date.now() })
  await mount()
  expect(root.textContent).toContain('恭喜通关成功')
  expect(root.textContent).toContain('已达标，可以申请')
  expect(root.textContent).toContain('最后记录：494.6K')
  expect(root.textContent).not.toContain('还差')
})
it('第一次获取就是申请页、没有读数也能庆祝，不能出现 0 / 500K', async () => {
  delete store[KeyCreatorRewardsStats]
  store[KeyCreatorRewardsPageState] = JSON.stringify({ stage: 'application', updatedAt: Date.now() })
  await mount()
  expect(root.textContent).toContain('已达标，可以申请')
  expect(root.textContent).not.toContain('还没有数据')
  expect(root.textContent).not.toContain('0 / 500K')
})
it('已提交申请显示审核中，保留庆祝但不再重复引导申请', async () => {
  store[KeyCreatorRewardsPageState] = JSON.stringify({ stage: 'under_review', updatedAt: Date.now() })
  await mount()
  expect(root.textContent).toContain('已达标，申请审核中')
  expect(root.textContent).toContain('恭喜通关成功')
  expect(root.textContent).toContain('查看 X 审核状态')
  expect(root.textContent).not.toContain('前往 X 继续申请')
  expect(root.textContent).not.toContain('还差')
})
it('面板已打开时首次进入申请页，存储变更会立即更新达标提示', async () => {
  await mount()
  expect(root.textContent).toContain('还差 5.4K')
  store[KeyCreatorRewardsPageState] = JSON.stringify({ stage: 'application', updatedAt: Date.now() })
  listener({ [KeyCreatorRewardsPageState]: { newValue: store[KeyCreatorRewardsPageState] } }, 'local')
  await settle()
  expect(root.textContent).toContain('恭喜通关成功')
  expect(root.textContent).not.toContain('还差')
})
it('真实数字首次跨过 500K 也显示庆祝', async () => {
  store[KeyCreatorRewardsStats] = JSON.stringify({ ...stats, impressionsCount: 503100, impressionsText: '503.1K', progressPercent: 100 })
  await mount()
  expect(root.textContent).toContain('恭喜通关成功')
  expect(root.textContent).not.toContain('还差')
})
it('暂未提供数字时提示稍后重试，并保留最后进度', async () => {
  sendMessage.mockResolvedValue({ ok: false, error: { code: 'error.rewardsParse' } })
  await mount()
  expect(root.textContent).toContain('494.6K')
  expect(root.textContent).toContain('已保留上次记录')
  expect(root.textContent).not.toContain('恭喜通关成功')
})

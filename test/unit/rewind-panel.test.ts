import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const { saved } = vi.hoisted(() => ({ saved: {} as Record<string, unknown> }))
vi.mock('../../content-scripts/options/rewind-account', () => ({
  getRewindAccount: () => ({ account: '123', handle: 'reader' }),
}))
vi.mock('../../shared/rewind-client', () => ({
  rewindRequest: vi.fn(async () => ({
    account: '123',
    handle: 'reader',
    posts: [],
    count: 1,
    total: 0,
    generation: 0,
    recording: true,
    ocr: false,
    ocrState: { phase: 'off' },
  })),
}))
vi.mock('../../content-scripts/utilities/colors', () => ({
  getThemeColors: () => ({ bg: '#fff', fg: '#000' }),
}))
vi.mock('../../content-scripts/utilities/xTypography', () => ({
  getXFontFamily: () => 'sans-serif',
}))
let open: typeof import('../../content-scripts/options/rewind-panel').openRewindPanel
beforeEach(async () => {
  vi.resetModules()
  Object.keys(saved).forEach((k) => delete saved[k])
  vi.stubGlobal('browser', {
    runtime: { id: 'test' },
    storage: {
      local: {
        get: vi.fn(async () => ({ ...saved })),
        set: vi.fn(async (v) => Object.assign(saved, v)),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    i18n: { getUILanguage: () => 'zh-CN' },
  })
  ;({ openRewindPanel: open } =
    await import('../../content-scripts/options/rewind-panel'))
})
afterEach(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  vi.unstubAllGlobals()
})
it('打开时恢复持久筛选，切换和清除筛选都保存到扩展存储', async () => {
  saved.rewindFilter = 'video'
  await open()
  const root = document.getElementById('xf-rewind-root')!.shadowRoot!
  expect(
    root.querySelector('[data-filter="video"]')?.getAttribute('aria-pressed'),
  ).toBe('true')
  ;(root.querySelector('[data-filter="image"]') as HTMLElement).click()
  await Promise.resolve()
  expect(saved.rewindFilter).toBe('image')
  ;(root.querySelector('[data-action=reset]') as HTMLElement).click()
  await Promise.resolve()
  expect(saved.rewindFilter).toBe('all')
})
it('搜索框的 j/k/n 不冒泡到 X 快捷键监听，Escape 仍关闭面板', async () => {
  await open()
  const input = document
    .getElementById('xf-rewind-root')!
    .shadowRoot!.querySelector('input')!
  for (const type of ['keydown', 'keyup', 'keypress']) {
    const seen = vi.fn()
    window.addEventListener(type, seen)
    input.dispatchEvent(
      new KeyboardEvent(type, { key: 'n', bubbles: true, composed: true }),
    )
    window.removeEventListener(type, seen)
    expect(seen).not.toHaveBeenCalled()
  }
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
    }),
  )
  expect(document.getElementById('xf-rewind-root')).toBeNull()
})

it('扩展重载后清理监听即使同步抛错，面板仍能完整关闭', async () => {
  await open()
  vi.mocked(browser.storage.onChanged.removeListener).mockImplementation(() => {
    throw new Error('Extension context invalidated.')
  })
  const { closeRewindPanel } = await import('../../content-scripts/options/rewind-panel')
  expect(() => closeRewindPanel()).not.toThrow()
  expect(document.getElementById('xf-rewind-root')).toBeNull()
})

it('筛选写入遇到同步上下文失效时提示失败，不产生未捕获异常', async () => {
  await open()
  vi.mocked(browser.storage.local.set).mockImplementation(() => {
    throw new Error('Extension context invalidated.')
  })
  const root = document.getElementById('xf-rewind-root')!.shadowRoot!
  ;(root.querySelector('[data-filter="video"]') as HTMLElement).click()
  await vi.waitFor(() => expect(root.querySelector('#notice')!.textContent).not.toBe(''))
})

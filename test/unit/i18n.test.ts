import { readFileSync } from 'node:fs'
import { createApp, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../../shared/i18n/en'
import { zhCN } from '../../shared/i18n/zh-CN'
import {
  applyLanguageSetting,
  getLocale,
  normalizeLanguageSetting,
  onLocaleChange,
  resolveLocale,
  t,
} from '../../shared/i18n'
import { normalizeSettings } from '../../shared/settings'
import Header from '../../entrypoints/popup/components/sections/Header.vue'
import { event, flushMicrotasks } from '../helpers/runtime-port'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('文案表', () => {
  it('中英文条目完全一致', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it('中英文的参数一致', () => {
    for (const key of Object.keys(zhCN) as (keyof typeof zhCN)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zhCN[key]))
    }
  })

  it('没有空文案，英文里没有漏翻的中文', () => {
    // 语言按钮故意中英都写，看不懂当前语言的人也能找到
    const bilingual = new Set(['language.button'])
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), key).not.toBe('')
      if (!bilingual.has(key)) expect(/[一-鿿]/.test(value), `${key}: ${value}`).toBe(false)
    }
    for (const [key, value] of Object.entries(zhCN)) expect(value.trim(), key).not.toBe('')
  })
})

describe('语言判断', () => {
  it('跟随浏览器：zh 开头用中文，其余用英文', () => {
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh-CN')
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh-CN')
    expect(resolveLocale('auto', 'zh')).toBe('zh-CN')
    expect(resolveLocale('auto', 'en-US')).toBe('en')
    expect(resolveLocale('auto', 'ja')).toBe('en')
  })

  it('手动选择的语言优先于浏览器语言', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN')
  })

  it('无效的设置值按跟随浏览器处理', () => {
    expect(normalizeLanguageSetting('fr')).toBe('auto')
    expect(normalizeLanguageSetting(undefined)).toBe('auto')
    expect(resolveLocale('fr', 'zh-CN')).toBe('zh-CN')
    expect(normalizeSettings({ uiLanguage: 'fr' }).uiLanguage).toBe('auto')
    expect(normalizeSettings({ uiLanguage: 'en' }).uiLanguage).toBe('en')
    expect(normalizeSettings({}).uiLanguage).toBe('auto')
  })
})

describe('取文案', () => {
  afterEach(() => applyLanguageSetting('auto'))

  it('测试环境默认中文', () => {
    expect(getLocale()).toBe('zh-CN')
    expect(t('app.enableExtension')).toBe('启用插件')
  })

  it('替换参数，缺少的参数保留原样', () => {
    expect(t('app.fullSettingsVersion', { version: '2.1.0' })).toBe('完整设置 · v2.1.0')
    expect(t('app.fullSettingsVersion')).toBe('完整设置 · v{version}')
    expect(t('app.fullSettingsVersion', { version: '2.1.0' }, 'en')).toBe('Full settings · v2.1.0')
  })

  it('切换语言后返回对应文案，并通知订阅方', () => {
    const listener = vi.fn()
    const off = onLocaleChange(listener)
    applyLanguageSetting('en')
    expect(t('app.enableExtension')).toBe('Enable extension')
    expect(listener).toHaveBeenCalledWith('en', 'en')
    applyLanguageSetting('en')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })
})

describe('initI18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('读取存储里的语言设置，存储变化时跟着切换', async () => {
    const onChanged = event()
    vi.stubGlobal('browser', {
      i18n: { getUILanguage: () => 'zh-CN' },
      storage: { local: { get: async () => ({ uiLanguage: 'en' }), set: async () => {} }, onChanged },
    })
    vi.resetModules()
    const i18n = await import('../../shared/i18n')
    expect(await i18n.initI18n()).toBe('en')
    expect(i18n.t('app.modules')).toBe('Modules')

    onChanged.emit({ uiLanguage: { newValue: 'auto', oldValue: 'en' } }, 'local')
    expect(i18n.getLocale()).toBe('zh-CN')
    expect(i18n.getLanguageSetting()).toBe('auto')
  })
})

describe('插件描述的多语言文件', () => {
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, { message: string }>

  it('中英两份条目一致，manifest 引用的条目都存在', () => {
    const enMessages = read('public/_locales/en/messages.json')
    const zhMessages = read('public/_locales/zh_CN/messages.json')
    expect(Object.keys(enMessages).sort()).toEqual(Object.keys(zhMessages).sort())

    const config = readFileSync('wxt.config.ts', 'utf8')
    expect(config).toMatch(/default_locale:\s*'en'/)
    for (const [, name] of config.matchAll(/__MSG_(\w+)__/g)) {
      expect(enMessages[name]?.message, name).toBeTruthy()
      expect(zhMessages[name]?.message, name).toBeTruthy()
    }
  })
})

describe('弹窗顶部和语言菜单', () => {
  let app: App | undefined
  let root: HTMLDivElement
  let store: Record<string, unknown>

  async function settle() {
    await flushMicrotasks()
    await nextTick()
    await flushMicrotasks()
    await nextTick()
  }

  function mountHeader() {
    store = {}
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.stubGlobal('browser', {
      runtime: { id: 'test-extension', getURL: (p: string) => p, sendMessage: vi.fn() },
      tabs: { create: vi.fn() },
      i18n: { getUILanguage: () => 'zh-CN' },
      storage: {
        local: {
          get: async () => ({ ...store }),
          set: async (kv: Record<string, unknown>) => { Object.assign(store, kv) },
          remove: async () => {},
        },
        onChanged: event(),
      },
    })
    root = document.createElement('div')
    document.body.append(root)
    app = createApp(Header)
    app.mount(root)
  }

  afterEach(() => {
    app?.unmount()
    app = undefined
    root?.remove()
    applyLanguageSetting('auto')
    vi.unstubAllGlobals()
  })

  it('切换语言后，顶部按钮的文字和页面语言标记跟着变', async () => {
    mountHeader()
    await settle()
    expect(root.querySelector('[aria-label="在新标签页打开完整设置"]')).not.toBeNull()
    expect(document.documentElement.lang).toBe('zh-CN')

    applyLanguageSetting('en')
    await settle()
    expect(root.querySelector('[aria-label="Open full settings in a new tab"]')).not.toBeNull()
    expect(root.querySelector('[aria-label="Language · 语言"]')).not.toBeNull()
    expect(document.documentElement.lang).toBe('en')
  })

  it('在语言菜单里选 English：保存设置并切换', async () => {
    mountHeader()
    await settle()
    const trigger = root.querySelector<HTMLButtonElement>('[aria-label="语言 · Language"]')!
    trigger.click()
    await settle()

    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(items.map((item) => item.textContent?.trim())).toEqual(['跟随浏览器（中文）', '中文', 'English'])
    expect(items[0].getAttribute('aria-checked')).toBe('true')

    items[2].click()
    await settle()
    expect(store.uiLanguage).toBe('en')
    expect(getLocale()).toBe('en')
    expect(localStorage.getItem('uiLanguage')).toBe('en')
  })
})

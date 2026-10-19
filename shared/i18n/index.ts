// 界面语言：弹窗、完整设置页、X 页面里注入的界面、后台共用。
// 语言设置存在 uiLanguage：auto（跟随浏览器）/ zh-CN / en。浏览器语言以 zh 开头时用中文，其余用英文。
import { KeyUiLanguage } from '../../storage-keys'
import { en } from './en'
import { zhCN } from './zh-CN'

export type Locale = 'zh-CN' | 'en'
export type LanguageSetting = 'auto' | Locale
export type MessageKey = keyof typeof zhCN
export type MessageParams = Record<string, string | number>

export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'zh-CN', 'en']

/** 语言名称用各自的语言写，不随界面语言变化 */
export const LANGUAGE_NAMES: Record<Locale, string> = { 'zh-CN': '中文', en: 'English' }

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { 'zh-CN': zhCN, en }

export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return value === 'zh-CN' || value === 'en' ? value : 'auto'
}

export function resolveLocale(setting: unknown, browserLanguage = getBrowserLanguage()): Locale {
  const normalized = normalizeLanguageSetting(setting)
  if (normalized !== 'auto') return normalized
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function getBrowserApi(): typeof browser | undefined {
  return typeof browser !== 'undefined' ? browser : undefined
}

/** 浏览器界面语言；拿不到时用 navigator.language */
export function getBrowserLanguage(): string {
  try {
    const language = getBrowserApi()?.i18n?.getUILanguage?.()
    if (language) return language
  } catch {}
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
}

let currentSetting: LanguageSetting = 'auto'
let currentLocale: Locale = resolveLocale('auto')
const listeners = new Set<(locale: Locale, setting: LanguageSetting) => void>()

export function getLocale(): Locale {
  return currentLocale
}

export function getLanguageSetting(): LanguageSetting {
  return currentSetting
}

/** 语言或语言设置变化时回调；返回取消订阅的函数 */
export function onLocaleChange(listener: (locale: Locale, setting: LanguageSetting) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 按语言设置切换当前语言（不写存储），用于读到存储值或收到变更时 */
export function applyLanguageSetting(value: unknown): Locale {
  const setting = normalizeLanguageSetting(value)
  const locale = resolveLocale(setting)
  if (setting === currentSetting && locale === currentLocale) return locale
  currentSetting = setting
  currentLocale = locale
  listeners.forEach((listener) => listener(locale, setting))
  return locale
}

/** 保存语言设置并立即切换 */
export async function saveLanguageSetting(value: LanguageSetting): Promise<void> {
  applyLanguageSetting(value)
  await getBrowserApi()?.storage?.local?.set({ [KeyUiLanguage]: value })
}

let initPromise: Promise<Locale> | null = null

/** 读取语言设置并监听变更；多次调用只执行一次 */
export function initI18n(): Promise<Locale> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const storage = getBrowserApi()?.storage
    if (!storage?.local) return currentLocale
    try {
      const data = await storage.local.get(KeyUiLanguage)
      applyLanguageSetting(data?.[KeyUiLanguage])
    } catch {}
    storage.onChanged?.addListener((changes, area) => {
      if (area === 'local' && KeyUiLanguage in changes) applyLanguageSetting(changes[KeyUiLanguage].newValue)
    })
    return currentLocale
  })()
  return initPromise
}

/** 文案表里有没有这个条目；用于按 id 拼出来的条目（如 feature.<id>.note 只有部分功能有） */
export function hasMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(zhCN, key)
}

/** 取文案；{name} 换成 params.name，参数缺失时保留原样 */
export function t(key: MessageKey, params?: MessageParams, locale: Locale = currentLocale): string {
  const template = MESSAGES[locale][key] ?? MESSAGES['zh-CN'][key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

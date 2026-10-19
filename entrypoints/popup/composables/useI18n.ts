import { ref } from 'vue'
import {
  applyLanguageSetting,
  getLanguageSetting,
  getLocale,
  initI18n,
  onLocaleChange,
  saveLanguageSetting,
  t,
  type LanguageSetting,
  type Locale,
  type MessageKey,
  type MessageParams,
} from '../../../shared/i18n'
import {
  featureText,
  moduleText,
  type FeatureModuleId,
  type FeatureTextField,
  type ModuleTextField,
} from '../../../shared/feature-registry'

// 弹窗和完整设置页同源，localStorage 里缓存一份语言设置：首屏直接用缓存的语言渲染，不等存储读取
const CACHE_KEY = 'uiLanguage'

function readCachedSetting(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY)
  } catch {
    return null
  }
}

applyLanguageSetting(readCachedSetting())

const locale = ref<Locale>(getLocale())
const setting = ref<LanguageSetting>(getLanguageSetting())
document.documentElement.lang = locale.value

onLocaleChange((nextLocale, nextSetting) => {
  locale.value = nextLocale
  setting.value = nextSetting
  document.documentElement.lang = nextLocale
  try {
    localStorage.setItem(CACHE_KEY, nextSetting)
  } catch {}
})

void initI18n()

export function useI18n() {
  return {
    locale,
    setting,
    // 下面几个函数都读取 locale.value，模板里调用时语言切换会触发重新渲染
    t: (key: MessageKey, params?: MessageParams) => t(key, params, locale.value),
    featureText: (id: string, field: FeatureTextField) => featureText(id, field, locale.value),
    moduleText: (id: FeatureModuleId, field: ModuleTextField) => moduleText(id, field, locale.value),
    setLanguage: (value: LanguageSetting) => saveLanguageSetting(value),
  }
}

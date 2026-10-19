<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, provide, nextTick } from 'vue'
import {
  DEFAULT_FEATURE_MODULE,
  FEATURE_MODULES,
  resolvePopupModule,
  type FeatureModuleId,
} from '../../shared/feature-registry'
import { KeyExtensionStatus } from '../../storage-keys'
import { moduleComponents, SettingsSurfaceKey } from '../popup/modules'
import FeatureSwitch from '../popup/components/ui/FeatureSwitch.vue'
import LanguageMenu from '../popup/components/ui/LanguageMenu.vue'
import { useI18n } from '../popup/composables/useI18n'
import pkg from '../../package.json'

// 完整设置页：与弹窗共用五个模块页，左侧切换模块，地址 #模块 id 可直接打开对应模块
provide(SettingsSurfaceKey, 'options')

const version = pkg.version
const { t, locale, moduleText } = useI18n()

function readHash(): FeatureModuleId | null {
  return resolvePopupModule(window.location.hash.replace(/^#/, ''))
}

const active = ref<FeatureModuleId>(readHash() ?? DEFAULT_FEATURE_MODULE)

const nav = ref<HTMLElement | null>(null)

// 窄屏下导航是横向滚动的一行，切换后把当前项滚到可见位置
function revealActiveNav() {
  void nextTick(() => {
    nav.value?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

function syncTitle(id: FeatureModuleId) {
  document.title = t('app.optionsTitle', { module: moduleText(id, 'title') })
}

watch(locale, () => syncTitle(active.value))

watch(active, (id) => {
  if (window.location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`)
  syncTitle(id)
  revealActiveNav()
  window.scrollTo({ top: 0 })
})

function onHashChange() {
  const id = readHash()
  if (id) active.value = id
}

onMounted(() => {
  syncTitle(active.value)
  if (window.location.hash !== `#${active.value}`) history.replaceState(null, '', `#${active.value}`)
  window.addEventListener('hashchange', onHashChange)
  revealActiveNav()
})

onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))
</script>

<template>
 <div class="app-glow min-h-screen bg-body-bg text-text font-sans">
  <div class="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10 flex flex-col md:flex-row gap-6 md:gap-12">
   <aside class="w-full md:w-52 shrink-0 md:sticky md:top-10 self-start flex flex-col gap-6">
    <div class="flex items-center gap-3">
     <img src="/icons/128.png" alt="" class="w-9 h-9" />
     <div class="flex-1">
      <p class="text-lg font-semibold tracking-tight leading-tight">oh-my-x</p>
      <p class="text-xs text-muted-text">{{ t('app.fullSettingsVersion', { version }) }}</p>
     </div>
     <LanguageMenu trigger-class="flex items-center justify-center w-8 h-8 rounded-full text-secondary-text hover:text-accent-text hover:bg-card-bg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
    </div>

    <nav ref="nav" :aria-label="t('app.modules')" class="flex md:flex-col gap-1 overflow-x-auto -mx-1 px-1 pb-1 md:pb-0">
     <button
      v-for="mod in FEATURE_MODULES"
      :key="mod.id"
      type="button"
      :aria-current="active === mod.id ? 'page' : undefined"
      class="shrink-0 md:shrink text-left rounded-control md:rounded-l-none md:border-l-2 px-3 py-2 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      :class="active === mod.id ? 'bg-card-bg md:border-accent text-accent-text' : 'md:border-transparent text-text hover:bg-card-bg'"
      @click="active = mod.id"
     >
      <span class="block text-sm font-semibold whitespace-nowrap">{{ moduleText(mod.id, 'title') }}</span>
      <span class="hidden md:block text-xs leading-normal text-muted-text mt-1">{{ moduleText(mod.id, 'description') }}</span>
     </button>
    </nav>

    <div class="flex items-center justify-between rounded-card bg-card-bg px-4 py-3">
     <span class="text-sm font-semibold">{{ t('app.enableExtension') }}</span>
     <FeatureSwitch :storage-key="KeyExtensionStatus" :label="t('app.enableExtension')" />
    </div>
    <p class="hidden md:block text-xs leading-normal text-muted-text">{{ t('app.autoSaveNote') }}</p>
   </aside>

   <main class="flex-1 min-w-0 max-w-xl">
    <component :is="moduleComponents[active]" :key="active" />
   </main>
  </div>
 </div>
</template>

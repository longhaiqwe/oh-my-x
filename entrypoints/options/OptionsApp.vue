<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, provide } from 'vue'
import {
  DEFAULT_FEATURE_MODULE,
  FEATURE_MODULES,
  getModule,
  resolvePopupModule,
  type FeatureModuleId,
} from '../../shared/feature-registry'
import { KeyExtensionStatus } from '../../storage-keys'
import { moduleComponents, SettingsSurfaceKey } from '../popup/modules'
import FeatureSwitch from '../popup/components/ui/FeatureSwitch.vue'
import pkg from '../../package.json'

// 完整设置页：与弹窗共用五个模块页，左侧切换模块，地址 #模块 id 可直接打开对应模块
provide(SettingsSurfaceKey, 'options')

const version = pkg.version

function readHash(): FeatureModuleId | null {
  return resolvePopupModule(window.location.hash.replace(/^#/, ''))
}

const active = ref<FeatureModuleId>(readHash() ?? DEFAULT_FEATURE_MODULE)

function syncTitle(id: FeatureModuleId) {
  document.title = `${getModule(id).title} · oh-my-x 设置`
}

watch(active, (id) => {
  if (window.location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`)
  syncTitle(id)
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
})

onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))
</script>

<template>
 <div class="min-h-screen bg-body-bg text-text font-sans">
  <div class="mx-auto max-w-[920px] px-4 py-6 sm:px-8 sm:py-10 flex flex-col md:flex-row gap-6 md:gap-10">
   <aside class="w-full md:w-52 shrink-0 md:sticky md:top-10 self-start flex flex-col gap-5">
    <div class="flex items-center gap-2.5">
     <img src="/icons/128.png" alt="" class="w-9 h-9" />
     <div>
      <p class="text-lg font-extrabold tracking-tight leading-tight">oh-my-x</p>
      <p class="text-[11px] text-secondary-text">完整设置 · v{{ version }}</p>
     </div>
    </div>

    <nav aria-label="功能模块" class="flex md:flex-col gap-1 overflow-x-auto -mx-1 px-1 pb-1 md:pb-0">
     <button
      v-for="mod in FEATURE_MODULES"
      :key="mod.id"
      type="button"
      :aria-current="active === mod.id ? 'page' : undefined"
      class="shrink-0 md:shrink text-left rounded-xl px-3 py-2 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      :class="active === mod.id ? 'bg-card-bg text-accent' : 'text-text hover:bg-card-bg/60'"
      @click="active = mod.id"
     >
      <span class="block text-sm font-semibold whitespace-nowrap">{{ mod.title }}</span>
      <span class="hidden md:block text-[11px] leading-snug text-secondary-text mt-0.5">{{ mod.description }}</span>
     </button>
    </nav>

    <div class="flex items-center justify-between rounded-xl bg-card-bg px-3 py-2.5">
     <span class="text-[13px] font-semibold">启用插件</span>
     <FeatureSwitch :storage-key="KeyExtensionStatus" label="启用插件" />
    </div>
    <p class="text-[11px] leading-relaxed text-secondary-text">修改后自动保存，和插件弹窗里的设置是同一份。</p>
   </aside>

   <main class="flex-1 min-w-0 max-w-[600px]">
    <component :is="moduleComponents[active]" :key="active" />
   </main>
  </div>
 </div>
</template>

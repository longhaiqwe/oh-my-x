<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { useStorageKey } from '../../composables/useStorageKey'
import { KeyExtensionStatus } from '../../../../storage-keys'

import pkg from '../../../../package.json'
import type { FeatureModuleId } from '../../../../shared/feature-registry'

const props = defineProps<{ currentModule?: FeatureModuleId }>()

const { value, loaded, setValue } = useStorageKey(KeyExtensionStatus)
const version = pkg.version

// 在新标签页打开完整设置页，并定位到弹窗当前所在的模块
async function openFullSettings() {
 const hash = props.currentModule ? `#${props.currentModule}` : ''
 await browser.tabs.create({ url: browser.runtime.getURL('/options.html') + hash })
 window.close()
}
</script>

<template>
 <header class="text-center">
  <div class="flex items-center justify-center relative min-h-[36px]">
   <!-- Left: mute/block settings -->
   <a
    href="https://twitter.com/settings/mute_and_block"
    target="_blank"
    rel="noreferrer"
    class="absolute left-0 flex items-center justify-center w-8 h-8 rounded-full hover:bg-card-bg transition-colors"
    aria-label="静音和屏蔽设置"
    title="静音和屏蔽设置"
   >
    <svg class="fill-accent" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
     <path d="M18 6.59V1.2L8.71 7H5.5A2.5 2.5 0 003 9.5v5A2.5 2.5 0 005.5 17h2.09l-2.3 2.29 1.42 1.42 15.5-15.5-1.42-1.42L18 6.59zm-8 8V8.55l6-3.75v3.79l-6 6zM5 9.5c0-.28.22-.5.5-.5H8v6H5.5c-.28 0-.5-.22-.5-.5v-5zm6.5 9.24l1.45-1.45L16 19.2V14l2 .02v8.78l-6.5-4.06z" />
    </svg>
   </a>

   <!-- Center: title with hover version badge above title -->
   <div class="group relative flex flex-col items-center cursor-pointer">
    <span
     class="absolute -top-2.5 text-[9px] font-mono font-semibold text-accent opacity-0 group-hover:opacity-100 transition-all duration-200 transform group-hover:-translate-y-0.5 pointer-events-none whitespace-nowrap bg-accent/15 px-1.5 py-0.2 rounded-full border border-accent/30 shadow-xs"
    >
     {{ version }}
    </span>
    <h1 class="flex items-center gap-2 text-xl font-extrabold tracking-tight">
     <img src="/icons/128.png" alt="" class="w-7 h-7" />
     <span>oh-my-x</span>
    </h1>
   </div>

   <!-- Right: full settings + extension toggle -->
   <div class="absolute right-0 flex items-center gap-1.5">
    <button
     type="button"
     class="flex items-center justify-center w-8 h-8 rounded-full text-secondary-text hover:text-accent hover:bg-card-bg transition-colors cursor-pointer"
     aria-label="在新标签页打开完整设置"
     title="完整设置"
     @click="openFullSettings"
    >
     <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
     </svg>
    </button>
    <SwitchRoot
     v-if="loaded"
     :id="KeyExtensionStatus"
     :model-value="value"
     aria-label="启用插件"
     @update:model-value="setValue"
     class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
     :class="value ? 'bg-accent' : 'bg-secondary-text/40'"
    >
     <SwitchThumb
      class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
      :class="value ? 'translate-x-[15px]' : 'translate-x-0.5'"
     />
    </SwitchRoot>
   </div>
  </div>
 </header>
</template>

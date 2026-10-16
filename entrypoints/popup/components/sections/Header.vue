<script setup lang="ts">
import { useStorageKey } from '../../composables/useStorageKey'
import { KeyExtensionStatus } from '../../../../storage-keys'
import SwitchToggle from '../ui/SwitchToggle.vue'

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

// 头部图标按钮：次要文字色，悬停变为强调色；点击区域 32px
const iconButton =
 'flex items-center justify-center w-8 h-8 rounded-full text-secondary-text hover:text-accent-text hover:bg-card-bg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring'
</script>

<template>
 <header class="flex items-center justify-between min-h-9">
  <!-- 左：X 的静音和屏蔽设置 -->
  <a
   href="https://twitter.com/settings/mute_and_block"
   target="_blank"
   rel="noreferrer"
   :class="iconButton"
   aria-label="X 的静音和屏蔽设置"
   title="X 的静音和屏蔽设置"
  >
   <svg class="fill-current" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M18 6.59V1.2L8.71 7H5.5A2.5 2.5 0 003 9.5v5A2.5 2.5 0 005.5 17h2.09l-2.3 2.29 1.42 1.42 15.5-15.5-1.42-1.42L18 6.59zm-8 8V8.55l6-3.75v3.79l-6 6zM5 9.5c0-.28.22-.5.5-.5H8v6H5.5c-.28 0-.5-.22-.5-.5v-5zm6.5 9.24l1.45-1.45L16 19.2V14l2 .02v8.78l-6.5-4.06z" />
   </svg>
  </a>

  <!-- 中：名称，悬停显示版本号 -->
  <div class="group relative flex flex-col items-center">
   <span
    class="absolute -top-3 px-2 rounded-full text-xs font-mono bg-accent-subtle text-accent-subtle-text opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap"
   >
    v{{ version }}
   </span>
   <h1 class="flex items-center gap-2 text-lg font-semibold leading-tight tracking-tight text-text">
    <img src="/icons/128.png" alt="" class="w-7 h-7" />
    <span>oh-my-x</span>
   </h1>
  </div>

  <!-- 右：完整设置 + 插件总开关 -->
  <div class="flex items-center gap-1">
   <button
    type="button"
    :class="iconButton"
    aria-label="在新标签页打开完整设置"
    title="完整设置"
    @click="openFullSettings"
   >
    <svg class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
     <path d="M15 3h6v6" />
     <path d="M10 14 21 3" />
     <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
   </button>
   <SwitchToggle v-if="loaded" :model-value="value" label="启用插件" @update:model-value="setValue" />
  </div>
 </header>
</template>

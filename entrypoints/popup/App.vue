<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import Header from './components/sections/Header.vue'
import { moduleComponents } from './modules'
import { useI18n } from './composables/useI18n'

import { KeyPopupActiveTab } from '../../storage-keys'
import { getStorage, setStorage } from '../../content-scripts/utilities/storage'
import {
  DEFAULT_FEATURE_MODULE,
  FEATURE_MODULES,
  resolvePopupModule,
  type FeatureModuleId,
} from '../../shared/feature-registry'

function readCachedTab(): FeatureModuleId | null {
  try {
    return resolvePopupModule(window?.localStorage?.getItem(KeyPopupActiveTab))
  } catch {
    return null
  }
}

// 同步从 localStorage 获取上次选中的模块，首屏即时渲染，杜绝异步 IPC 导致的闪烁与尺寸抖动；
// 旧版标签 id 会映射到对应的新模块
const activeTab = ref<FeatureModuleId>(readCachedTab() ?? DEFAULT_FEATURE_MODULE)
const { t, moduleText } = useI18n()

onMounted(async () => {
  // 仅在 localStorage 未命中缓存时回退异步从 chrome.storage.local 读取，消除每次打开的冗余 IPC
  if (readCachedTab()) return

  const saved = resolvePopupModule(await getStorage(KeyPopupActiveTab))
  if (saved) activeTab.value = saved
})

watch(
  activeTab,
  (tab) => {
    try {
      localStorage.setItem(KeyPopupActiveTab, tab)
    } catch {}
    void setStorage({ [KeyPopupActiveTab]: tab })
  },
)
</script>

<template>
 <div class="app-glow relative flex flex-col p-4 font-sans font-normal max-w-full w-100 bg-body-bg">
  <div class="flex flex-col gap-4">
   <Header :current-module="activeTab" />
   <main class="flex flex-col gap-4">
    <TabsRoot :model-value="activeTab" @update:model-value="(v) => activeTab = v as FeatureModuleId" class="flex flex-col gap-4">
     <TabsList
      class="flex gap-1 p-1 rounded-card bg-card-bg"
      :aria-label="t('app.modules')"
     >
      <TabsTrigger
       v-for="mod in FEATURE_MODULES"
       :key="mod.id"
       :value="mod.id"
       class="flex-1 min-h-8 px-2 text-sm font-semibold rounded-control transition-colors duration-150
        data-[state=active]:bg-accent-subtle data-[state=active]:text-accent-subtle-text data-[state=active]:shadow-sm
        data-[state=inactive]:text-secondary-text data-[state=inactive]:hover:text-text
        data-[state=inactive]:hover:bg-sunken-bg
        outline-none focus-visible:ring-2 focus-visible:ring-accent-ring cursor-pointer"
      >
       {{ moduleText(mod.id, 'tab') }}
      </TabsTrigger>
     </TabsList>

     <!-- v-if 懒加载：只有当前激活的模块才挂载组件并执行 onMounted -->
     <TabsContent
      v-for="mod in FEATURE_MODULES"
      :key="mod.id"
      :value="mod.id"
      tabindex="-1"
      class="outline-none"
     >
      <component :is="moduleComponents[mod.id]" v-if="activeTab === mod.id" />
     </TabsContent>
    </TabsRoot>
   </main>
  </div>
 </div>
</template>

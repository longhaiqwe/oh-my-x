<script setup lang="ts">
import { ref, onMounted, watch, type Component } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import Header from './components/sections/Header.vue'

// 同步导入各模块页：本地扩展没有网络下载延迟（打包总体积仅百余 KB），
// 同步导入消除 defineAsyncComponent 导致的异步挂载空白间隙与二次渲染瀑布流。
// 下方配合 v-if="activeTab === ..." 确保只有当前激活的模块才会实例化与挂载。
import LayoutModule from './components/modules/LayoutModule.vue'
import FilterModule from './components/modules/FilterModule.vue'
import InsightModule from './components/modules/InsightModule.vue'
import CreateModule from './components/modules/CreateModule.vue'
import EngageModule from './components/modules/EngageModule.vue'

import { KeyPopupActiveTab } from '../../storage-keys'
import { getStorage, setStorage } from '../../content-scripts/utilities/storage'
import {
  DEFAULT_FEATURE_MODULE,
  FEATURE_MODULES,
  resolvePopupModule,
  type FeatureModuleId,
} from '../../shared/feature-registry'

const moduleComponents: Record<FeatureModuleId, Component> = {
  layout: LayoutModule,
  filter: FilterModule,
  insight: InsightModule,
  create: CreateModule,
  engage: EngageModule,
}

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
 <div class="relative flex flex-col p-4 font-sans font-normal max-w-full w-100 bg-body-bg">
  <div class="flex flex-col gap-y-3">
   <Header />
   <main class="flex flex-col gap-y-3">
    <TabsRoot :model-value="activeTab" @update:model-value="(v) => activeTab = v as FeatureModuleId" class="flex flex-col gap-3">
     <TabsList
      class="flex gap-0.5 p-1.5 rounded-xl bg-card-bg"
      aria-label="功能模块"
     >
      <TabsTrigger
       v-for="mod in FEATURE_MODULES"
       :key="mod.id"
       :value="mod.id"
       class="flex-1 px-1.5 py-1 text-sm font-semibold rounded-lg transition-colors duration-150
        data-[state=active]:bg-body-bg data-[state=active]:text-accent
        data-[state=inactive]:text-color-text data-[state=inactive]:hover:text-text
        data-[state=inactive]:hover:bg-body-bg/50
        outline-none focus-visible:ring-2 focus-visible:ring-accent-ring cursor-pointer"
      >
       {{ mod.tabLabel }}
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

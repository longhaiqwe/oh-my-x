<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import Header from './components/sections/Header.vue'

// 同步导入各 Tab：本地扩展没有网络下载延迟（打包总体积仅百余 KB），
// 同步导入消除 defineAsyncComponent 导致的异步挂载空白间隙与二次渲染瀑布流。
// 下方配合 v-if="activeTab === '...'" 确保只有当前激活的 Tab 才会实例化与挂载。
import OverviewSection from './components/sections/OverviewSection.vue'
import TimelineSection from './components/sections/TimelineSection.vue'
import ViralRadarSection from './components/sections/ViralRadarSection.vue'
import RulesSection from './components/sections/RulesSection.vue'
import KeywordsSection from './components/sections/KeywordsSection.vue'
import ListsSection from './components/sections/ListsSection.vue'
import LogSection from './components/sections/LogSection.vue'

import { KeyPopupActiveTab } from '../../storage-keys'
import { getStorage, setStorage } from '../../content-scripts/utilities/storage'

const tabs = [
  { id: 'view', label: '视图' },
  { id: 'overview', label: '概览' },
  { id: 'viral', label: '爆款' },
  { id: 'rules', label: '规则' },
  { id: 'keywords', label: '词库' },
  { id: 'lists', label: '名单' },
  { id: 'log', label: '日志' },
] as const

type TabId = (typeof tabs)[number]['id']

// 同步从 localStorage 获取上次选中的 Tab，首屏即时渲染，杜绝异步 IPC 导致的闪烁与尺寸抖动
const getInitialTab = (): TabId => {
  try {
    const cached = window?.localStorage?.getItem(KeyPopupActiveTab)
    if (cached && tabs.some((t) => t.id === cached)) {
      return cached as TabId
    }
  } catch {}
  return 'overview'
}

const activeTab = ref<TabId>(getInitialTab())


onMounted(async () => {
  // 仅在 localStorage 未命中缓存时回退异步从 chrome.storage.local 读取，消除每次打开的冗余 IPC
  try {
    const cached = window?.localStorage?.getItem(KeyPopupActiveTab)
    if (cached && tabs.some((t) => t.id === cached)) return
  } catch {}

  const saved = await getStorage(KeyPopupActiveTab)
  if (typeof saved === 'string' && tabs.some((t) => t.id === saved)) {
    activeTab.value = saved as TabId
    try {
      localStorage.setItem(KeyPopupActiveTab, saved)
    } catch {}
  }
})

watch(activeTab, (tab) => {
  if (tab) {
    try {
      localStorage.setItem(KeyPopupActiveTab, tab)
    } catch {}
    void setStorage({ [KeyPopupActiveTab]: tab })
  }
})
</script>

<template>
 <div class="relative flex flex-col p-4 font-sans font-normal max-w-full w-100 bg-body-bg">
  <div class="flex flex-col gap-y-3">
   <Header />
   <main class="flex flex-col gap-y-3">
    <TabsRoot :model-value="activeTab" @update:model-value="(v) => activeTab = v as TabId" class="flex flex-col">
     <TabsList
      class="flex gap-0.5 p-1.5 rounded-t-xl bg-card-bg"
      aria-label="设置选项卡"
     >
      <TabsTrigger
       v-for="tab in tabs"
       :key="tab.id"
       :value="tab.id"
       class="flex-1 px-1.5 py-1 text-sm font-semibold rounded-lg transition-colors duration-150
        data-[state=active]:bg-body-bg data-[state=active]:text-accent
        data-[state=inactive]:text-color-text data-[state=inactive]:hover:text-text
        data-[state=inactive]:hover:bg-body-bg/50
        outline-none focus-visible:ring-2 focus-visible:ring-accent-ring cursor-pointer"
      >
       {{ tab.label }}
      </TabsTrigger>
     </TabsList>

     <!-- v-if 懒加载：只有当前激活的 Tab 才挂载组件并执行 onMounted -->
     <TabsContent value="view" tabindex="-1" class="outline-none"><TimelineSection v-if="activeTab === 'view'" /></TabsContent>
     <TabsContent value="overview" tabindex="-1" class="outline-none"><OverviewSection v-if="activeTab === 'overview'" /></TabsContent>
     <TabsContent value="viral" tabindex="-1" class="outline-none"><ViralRadarSection v-if="activeTab === 'viral'" /></TabsContent>
     <TabsContent value="rules" tabindex="-1" class="outline-none"><RulesSection v-if="activeTab === 'rules'" /></TabsContent>
     <TabsContent value="keywords" tabindex="-1" class="outline-none"><KeywordsSection v-if="activeTab === 'keywords'" /></TabsContent>
     <TabsContent value="lists" tabindex="-1" class="outline-none"><ListsSection v-if="activeTab === 'lists'" /></TabsContent>
     <TabsContent value="log" tabindex="-1" class="outline-none"><LogSection v-if="activeTab === 'log'" /></TabsContent>
    </TabsRoot>
   </main>
  </div>
 </div>
</template>

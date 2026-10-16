<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { getFeature, getModule } from '../../../../shared/feature-registry'
import ModuleHeader from '../ui/ModuleHeader.vue'
import SubPage from '../ui/SubPage.vue'
import SpamFilterCard from '../sections/SpamFilterCard.vue'
import TweetFilterCard from '../sections/TweetFilterCard.vue'
import AccountListsCard from '../sections/AccountListsCard.vue'
import SpamLogCard from '../sections/SpamLogCard.vue'
import SpamFilterDetail from '../sections/SpamFilterDetail.vue'
import TweetFilterDetail from '../sections/TweetFilterDetail.vue'
import ListsSection from '../sections/ListsSection.vue'
import LogSection from '../sections/LogSection.vue'

// 过滤页分两层：第一层是四张功能卡片，点「详细设置」等按钮进入对应的第二层页面
type FilterPage = 'spamFilter' | 'tweetFilter' | 'spamAccountLists' | 'spamLog'

const filterModule = getModule('filter')
const page = ref<FilterPage | null>(null)
const pageFeature = computed(() => (page.value ? getFeature(page.value) : null))

// 弹窗的滚动容器是 #app（见 style.css）
let overviewScrollTop = 0
function scroller() {
  return document.getElementById('app')
}

async function openPage(next: FilterPage) {
  overviewScrollTop = scroller()?.scrollTop ?? 0
  page.value = next
  await nextTick()
  const el = scroller()
  if (el) el.scrollTop = 0
}

async function back() {
  const from = page.value
  page.value = null
  await nextTick()
  const el = scroller()
  if (el) el.scrollTop = overviewScrollTop
  // 焦点回到进入前点击的按钮
  if (from) {
    document.querySelector<HTMLElement>(`[data-details-for="${from}"]`)?.focus({ preventScroll: true })
  }
}
</script>

<template>
 <SubPage
  v-if="page && pageFeature"
  :parent-title="filterModule.title"
  :title="pageFeature.label"
  :description="pageFeature.description"
  @back="back"
 >
  <SpamFilterDetail v-if="page === 'spamFilter'" />
  <TweetFilterDetail v-else-if="page === 'tweetFilter'" />
  <div v-else-if="page === 'spamAccountLists'" class="p-3 bg-card-bg rounded-xl">
   <ListsSection />
  </div>
  <div v-else class="p-3 bg-card-bg rounded-xl">
   <LogSection />
  </div>
 </SubPage>

 <section v-else class="flex flex-col gap-3">
  <ModuleHeader module-id="filter" />
  <SpamFilterCard @open="openPage('spamFilter')" />
  <TweetFilterCard @open="openPage('tweetFilter')" />
  <AccountListsCard @open="openPage('spamAccountLists')" />
  <SpamLogCard @open="openPage('spamLog')" />
 </section>
</template>

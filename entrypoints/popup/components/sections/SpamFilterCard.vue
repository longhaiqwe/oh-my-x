<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { KeySpamFilterEnabled, KeySpamThreshold, KeySpamDebugMode } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { SPAM_CATEGORY_LABEL, SPAM_RULES } from '../../../../shared/spam-types'
import type { SpamCategory } from '../../../../shared/spam-types'
import { getTodayStats } from '../../../../shared/spam-logger'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import SubRow from '../ui/SubRow.vue'
import RulesSection from './RulesSection.vue'
import KeywordsSection from './KeywordsSection.vue'

const enabled = ref(true)
const debug = ref(false)
const threshold = ref(55)
const detailsOpen = ref(false)

// 状态行数字由子组件上报，编辑详细设置时同步更新
const enabledRuleCount = ref(SPAM_RULES.length)
const keywordCount = ref(0)

const todayTotal = ref(0)
const todayByCategory = ref<Record<SpamCategory, number>>({
  porn_spam: 0,
  bot: 0,
  marketing: 0,
  low_quality: 0,
  normal: 0,
})
const order: SpamCategory[] = ['porn_spam', 'marketing', 'bot', 'low_quality']
const categoryRows = computed(() =>
  order
    .map((c) => ({ category: c, label: SPAM_CATEGORY_LABEL[c], count: todayByCategory.value[c] || 0 }))
    .filter((r) => r.count > 0),
)

async function toggleEnabled(v: boolean) {
  enabled.value = v
  await setStorage({ [KeySpamFilterEnabled]: v ? 'on' : 'off' })
}

async function toggleDebug(v: boolean) {
  debug.value = v
  await setStorage({ [KeySpamDebugMode]: v ? 'on' : 'off' })
}

async function setThreshold(v: number) {
  threshold.value = v
  await setStorage({ [KeySpamThreshold]: v })
}

onMounted(async () => {
  const [storageMap, today] = await Promise.all([
    getStorage([KeySpamFilterEnabled, KeySpamThreshold, KeySpamDebugMode]),
    getTodayStats(),
  ])
  enabled.value = storageMap[KeySpamFilterEnabled] === 'on'
  threshold.value = Number(storageMap[KeySpamThreshold]) || 55
  debug.value = storageMap[KeySpamDebugMode] === 'on'
  todayTotal.value = today.total
  todayByCategory.value = today.byCategory
})
</script>

<template>
 <FeatureCard v-model:open="detailsOpen" feature-id="spamFilter" :enabled="enabled" details-label="详细设置">
  <template #control>
   <SwitchToggle :model-value="enabled" label="垃圾回复过滤" @update:model-value="toggleEnabled" />
  </template>

  <!-- 今日拦截 -->
  <div class="flex items-center justify-between gap-2 rounded-lg bg-body-bg border border-border px-2.5 py-2">
   <p class="text-[11px] text-secondary-text">
    今日拦截 <span class="text-base font-bold text-accent align-middle ml-0.5">{{ todayTotal }}</span>
   </p>
   <div v-if="categoryRows.length" class="flex flex-wrap justify-end gap-1">
    <span
     v-for="row in categoryRows"
     :key="row.category"
     class="px-1.5 py-0.5 rounded border border-border text-[10px] text-secondary-text"
    >{{ row.label }} {{ row.count }}</span>
   </div>
   <p v-else class="text-[10px] text-secondary-text">今天还没有拦截</p>
  </div>

  <template #status>
   阈值 {{ threshold }} · 规则 {{ enabledRuleCount }}/{{ SPAM_RULES.length }} · 垃圾词库 {{ keywordCount }} 个
  </template>

  <template #details>
   <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
     <p class="text-[12px] font-medium text-text">隐藏阈值</p>
     <span class="text-[12px] font-mono text-accent">{{ threshold }}</span>
    </div>
    <p class="text-[10px] text-secondary-text -mt-0.5">得分达到这个值的回复会被隐藏。数值越低，隐藏的回复越多</p>
    <SliderRoot
     :model-value="[threshold]"
     @update:model-value="(v: number[] | undefined) => { if (v) { const val = v[0]; if (val !== undefined) setThreshold(val) } }"
     :min="20" :max="150" :step="5"
     aria-label="隐藏阈值"
     class="relative flex items-center select-none touch-none w-full h-4"
    >
     <SliderTrack class="bg-accent/30 relative flex-grow rounded-full h-1">
      <SliderRange class="absolute bg-accent rounded-full h-full" />
     </SliderTrack>
     <SliderThumb class="block w-3.5 h-3.5 bg-accent rounded-full" />
    </SliderRoot>
   </div>

   <SubRow title="调试模式" description="在每条回复下显示得分和命中的规则，不隐藏回复">
    <SwitchToggle :model-value="debug" label="调试模式" @update:model-value="toggleDebug" />
   </SubRow>

   <RulesSection @count="(n) => (enabledRuleCount = n)" />
   <KeywordsSection @count="(n) => (keywordCount = n)" />
  </template>
 </FeatureCard>
</template>

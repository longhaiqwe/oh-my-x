<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { KeySpamThreshold, KeySpamDebugMode } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { useI18n } from '../../composables/useI18n'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import RulesSection from './RulesSection.vue'
import KeywordsSection from './KeywordsSection.vue'
import SpamAiSection from './SpamAiSection.vue'

// 垃圾回复过滤的第二层页面：阈值、检测规则、垃圾词库、调试模式、AI 判断（试验）
const threshold = ref(55)
const { t } = useI18n()

async function setThreshold(v: number) {
  threshold.value = v
  await setStorage({ [KeySpamThreshold]: v })
}

onMounted(async () => {
  threshold.value = Number(await getStorage(KeySpamThreshold)) || 55
})
</script>

<template>
 <FeatureCard :title="t('spamFilter.thresholdTitle')" :description="t('spamFilter.thresholdDescription')">
  <template #control>
   <span class="text-sm font-mono font-semibold text-text">{{ threshold }}</span>
  </template>
  <SliderRoot
   :model-value="[threshold]"
   @update:model-value="(v: number[] | undefined) => { if (v) { const val = v[0]; if (val !== undefined) setThreshold(val) } }"
   :min="20" :max="150" :step="5"
   :aria-label="t('spamFilter.thresholdTitle')"
   class="relative flex items-center select-none touch-none w-full h-4"
  >
   <SliderTrack class="bg-accent-track relative flex-grow rounded-full h-1">
    <SliderRange class="absolute bg-accent rounded-full h-full" />
   </SliderTrack>
   <SliderThumb class="block w-4 h-4 rounded-full bg-accent shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card-bg" />
  </SliderRoot>
  <div class="flex justify-between text-xs font-mono text-muted-text">
   <span>20</span>
   <span>150</span>
  </div>
 </FeatureCard>

 <div class="p-4 bg-card-bg rounded-card">
  <RulesSection />
 </div>

 <div class="p-4 bg-card-bg rounded-card">
  <KeywordsSection />
 </div>

 <FeatureCard :title="t('spamFilter.debugTitle')" :description="t('spamFilter.debugDescription')">
  <template #control>
   <FeatureSwitch :storage-key="KeySpamDebugMode" :label="t('spamFilter.debugTitle')" />
  </template>
 </FeatureCard>

 <SpamAiSection />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { KeySpamThreshold, KeySpamDebugMode } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import RulesSection from './RulesSection.vue'
import KeywordsSection from './KeywordsSection.vue'

// 垃圾回复过滤的第二层页面：阈值、检测规则、垃圾词库、调试模式
const threshold = ref(55)

async function setThreshold(v: number) {
  threshold.value = v
  await setStorage({ [KeySpamThreshold]: v })
}

onMounted(async () => {
  threshold.value = Number(await getStorage(KeySpamThreshold)) || 55
})
</script>

<template>
 <FeatureCard title="隐藏阈值" description="得分达到这个值的回复会被隐藏。数值越低，隐藏的回复越多">
  <template #control>
   <span class="text-[13px] font-mono font-semibold text-accent">{{ threshold }}</span>
  </template>
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
  <div class="flex justify-between text-[10px] font-mono text-secondary-text">
   <span>20</span>
   <span>150</span>
  </div>
 </FeatureCard>

 <div class="p-3 bg-card-bg rounded-xl">
  <RulesSection />
 </div>

 <div class="p-3 bg-card-bg rounded-xl">
  <KeywordsSection />
 </div>

 <FeatureCard title="调试模式" description="在每条回复下显示得分和命中的规则，不隐藏回复">
  <template #control>
   <FeatureSwitch :storage-key="KeySpamDebugMode" label="调试模式" />
  </template>
 </FeatureCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import { KeyStatRatioTargetHandle, KeyStatRatioEnabled } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { useI18n } from '../../composables/useI18n'

const { t, featureText } = useI18n()
const statRatioEnabled = ref(true)
const statRatioHandle = ref('*')

// 评级颜色与 x.com 页面上的徽章一致（见 content-scripts/options/stat-ratio.ts）
const ratingTiers = computed(() => [
  { label: t('ratio.poor'), bar: 'bg-rating-poor', reach: '< 30%', engage: '< 0.5%' },
  { label: t('ratio.fair'), bar: 'bg-rating-fair', reach: '30–100%', engage: '0.5–2%' },
  { label: t('ratio.good'), bar: 'bg-rating-good', reach: t('ratio.multiple', { value: '1–5' }), engage: '2–5%' },
  { label: t('ratio.great'), bar: 'bg-rating-great', reach: t('ratio.multiple', { value: '5–20' }), engage: '5–20%' },
  { label: t('ratio.top'), bar: 'bg-rating-top', reach: t('ratio.multiple', { value: '≥ 20' }), engage: '≥ 20%' },
])

const scopeText = computed(() => {
  const handle = statRatioHandle.value.trim().replace(/^@/, '')
  return !handle || handle === '*' ? t('ratio.scopeAll') : t('ratio.scopeOne', { handle })
})

async function toggleStatRatioEnabled(v: boolean) {
  statRatioEnabled.value = v
  await setStorage({ [KeyStatRatioEnabled]: v ? 'on' : 'off' })
}

async function updateStatRatioHandle(val: string) {
  statRatioHandle.value = val
  await setStorage({ [KeyStatRatioTargetHandle]: val })
}

onMounted(async () => {
  const storageMap = await getStorage([KeyStatRatioEnabled, KeyStatRatioTargetHandle])
  statRatioEnabled.value = storageMap[KeyStatRatioEnabled] !== 'off'
  const ratioH = storageMap[KeyStatRatioTargetHandle]
  if (ratioH && typeof ratioH === 'string') {
    statRatioHandle.value = ratioH
  }
})
</script>

<template>
 <FeatureCard feature-id="statRatio" :enabled="statRatioEnabled" :details-label="t('ratio.settings')">
  <template #control>
   <SwitchToggle :model-value="statRatioEnabled" :label="featureText('statRatio', 'label')" @update:model-value="toggleStatRatioEnabled" />
  </template>

  <template #status>{{ t('ratio.status', { scope: scopeText }) }}</template>

  <template #details>
   <div class="flex flex-col gap-2">
    <div class="flex justify-between items-baseline gap-2">
     <label for="stat-ratio-handle" class="text-sm text-text">{{ t('ratio.accounts') }}</label>
     <span class="text-xs text-muted-text">{{ t('ratio.wildcardBefore') }} <code class="font-mono px-1 rounded-sm bg-sunken-bg">*</code> {{ t('ratio.wildcardAfter') }}</span>
    </div>
    <input
     id="stat-ratio-handle"
     type="text"
     class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs text-text font-mono placeholder:text-muted-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring"
     :value="statRatioHandle"
     @input="(e: Event) => updateStatRatioHandle((e.target as HTMLInputElement).value)"
     :placeholder="t('ratio.placeholder')"
    />
   </div>

   <!-- 评级标准对照表：颜色条标识档位，文字用中性色 -->
   <div class="flex flex-col gap-2">
    <p class="text-sm text-text">{{ t('ratio.scale') }}</p>
    <p class="text-xs leading-normal text-muted-text">{{ t('ratio.scaleHint') }}</p>
    <div class="grid grid-cols-5 gap-1 text-center">
     <div v-for="tier in ratingTiers" :key="tier.label" class="flex flex-col gap-1 rounded-control bg-sunken-bg px-1 pb-2 overflow-hidden">
      <span class="h-1 -mx-1 mb-1" :class="tier.bar" aria-hidden="true"></span>
      <p class="text-xs font-semibold text-text">{{ tier.label }}</p>
      <p class="text-xs text-muted-text whitespace-nowrap">{{ tier.reach }}</p>
      <p class="text-xs text-muted-text whitespace-nowrap">{{ tier.engage }}</p>
     </div>
    </div>
   </div>
  </template>
 </FeatureCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import { KeyStatRatioTargetHandle, KeyStatRatioEnabled } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'

const statRatioEnabled = ref(true)
const statRatioHandle = ref('*')

// 评级颜色与 x.com 页面上的徽章一致（见 content-scripts/options/stat-ratio.ts）
const ratingTiers = [
  { label: '差', bar: 'bg-rating-poor', reach: '< 30%', engage: '< 0.5%' },
  { label: '普通', bar: 'bg-rating-fair', reach: '30–100%', engage: '0.5–2%' },
  { label: '良好', bar: 'bg-rating-good', reach: '1–5 倍', engage: '2–5%' },
  { label: '优秀', bar: 'bg-rating-great', reach: '5–20 倍', engage: '5–20%' },
  { label: '爆火', bar: 'bg-rating-top', reach: '≥ 20 倍', engage: '≥ 20%' },
]

const scopeText = computed(() => {
  const handle = statRatioHandle.value.trim().replace(/^@/, '')
  return !handle || handle === '*' ? '所有博主主页' : `@${handle} 的主页`
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
 <FeatureCard feature-id="statRatio" :enabled="statRatioEnabled" details-label="范围与评级">
  <template #control>
   <SwitchToggle :model-value="statRatioEnabled" label="数据比例徽章" @update:model-value="toggleStatRatioEnabled" />
  </template>

  <template #status>生效范围：{{ scopeText }}</template>

  <template #details>
   <div class="flex flex-col gap-2">
    <div class="flex justify-between items-baseline gap-2">
     <label for="stat-ratio-handle" class="text-sm text-text">生效账号</label>
     <span class="text-xs text-muted-text">填 <code class="font-mono px-1 rounded-sm bg-sunken-bg">*</code> 对所有主页生效</span>
    </div>
    <input
     id="stat-ratio-handle"
     type="text"
     class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs text-text font-mono placeholder:text-muted-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring"
     :value="statRatioHandle"
     @input="(e: Event) => updateStatRatioHandle((e.target as HTMLInputElement).value)"
     placeholder="* 或一个用户名"
    />
   </div>

   <!-- 评级标准对照表：颜色条标识档位，文字用中性色 -->
   <div class="flex flex-col gap-2">
    <p class="text-sm text-text">评级标准</p>
    <p class="text-xs leading-normal text-muted-text">每格上一行是浏览量 ÷ 粉丝数，下一行是互动量 ÷ 粉丝数</p>
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

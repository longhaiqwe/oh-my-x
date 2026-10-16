<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import { KeyStatRatioTargetHandle, KeyStatRatioEnabled } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'

const statRatioEnabled = ref(true)
const statRatioHandle = ref('*')

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
   <div class="flex flex-col gap-1">
    <div class="flex justify-between items-center">
     <label class="text-[11px] font-medium text-text">生效账号</label>
     <span class="text-[10px] text-secondary-text">填 <code class="font-mono px-1 rounded bg-body-bg border border-border">*</code> 对所有主页生效</span>
    </div>
    <input
     type="text"
     class="w-full h-7 px-2 rounded-md border border-border bg-body-bg text-[11px] focus:border-accent outline-none font-mono"
     :value="statRatioHandle"
     @input="(e: Event) => updateStatRatioHandle((e.target as HTMLInputElement).value)"
     placeholder="* 或一个用户名"
    />
   </div>

   <!-- 评级标准对照表 -->
   <div class="rounded-lg bg-body-bg border border-border p-2 flex flex-col gap-1.5 text-[10px]">
    <div class="flex justify-between items-center">
     <span class="font-semibold text-text">评级标准</span>
     <span class="text-secondary-text">上行：浏览量 ÷ 粉丝数；下行：互动量 ÷ 粉丝数</span>
    </div>

    <div class="grid grid-cols-5 gap-1 text-center font-medium">
     <div class="py-1 rounded bg-[rgba(113,118,123,0.18)] text-[#71767b]">
      <p class="font-bold">差</p>
      <p class="text-[9px] opacity-80">&lt; 30%</p>
      <p class="text-[9px] opacity-80">&lt; 0.5%</p>
     </div>
     <div class="py-1 rounded bg-[rgba(29,155,240,0.18)] text-[#1d9bf0]">
      <p class="font-bold">普通</p>
      <p class="text-[9px] opacity-80">30%~100%</p>
      <p class="text-[9px] opacity-80">0.5%~2%</p>
     </div>
     <div class="py-1 rounded bg-[rgba(0,186,124,0.18)] text-[#00ba7c]">
      <p class="font-bold">良好</p>
      <p class="text-[9px] opacity-80">1~5 倍</p>
      <p class="text-[9px] opacity-80">2%~5%</p>
     </div>
     <div class="py-1 rounded bg-[rgba(255,122,0,0.18)] text-[#ff7a00]">
      <p class="font-bold">优秀</p>
      <p class="text-[9px] opacity-80">5~20 倍</p>
      <p class="text-[9px] opacity-80">5%~20%</p>
     </div>
     <div class="py-1 rounded bg-[rgba(249,24,128,0.18)] text-[#f91880]">
      <p class="font-bold">爆火</p>
      <p class="text-[9px] opacity-80">&ge; 20 倍</p>
      <p class="text-[9px] opacity-80">&ge; 20%</p>
     </div>
    </div>
   </div>
  </template>
 </FeatureCard>
</template>

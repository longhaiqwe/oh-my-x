<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { KeyStatRatioTargetHandle, KeyStatRatioEnabled } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'

const statRatioEnabled = ref(true)
const statRatioHandle = ref('*')

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
 <!-- 推文数据效果评估设置与评分标准说明 -->
 <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2.5">
   <div class="flex items-center justify-between">
     <div>
       <p class="text-[12px] font-semibold">推文数据比例徽章</p>
       <p class="text-[10px] text-secondary-text mt-0.5">自动在帖子下方追加对比粉丝数的评估徽章</p>
     </div>
     <SwitchRoot
       :model-value="statRatioEnabled"
       @update:model-value="(v) => toggleStatRatioEnabled(!!v)"
       class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
       :class="statRatioEnabled ? 'bg-accent' : 'bg-secondary-text/40'"
     >
       <SwitchThumb
         class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
         :class="statRatioEnabled ? 'translate-x-[15px]' : 'translate-x-0.5'"
       />
     </SwitchRoot>
   </div>

   <div v-if="statRatioEnabled" class="flex pt-1 flex-col gap-2 border-t border-border/60 ">
     <div class="flex flex-col gap-1">
       <div class="flex justify-between items-center">
         <label class="text-[11px] font-medium text-color-text">目标 X Handle</label>
         <span class="text-[10px] text-secondary-text">填 <code class="font-mono px-1 rounded bg-body-bg border border-border">*</code> 全主页生效</span>
       </div>
       <input
         type="text"
         class="w-full h-7 px-2 rounded-md border border-border bg-body-bg text-[11px] focus:border-accent outline-none font-mono"
         :value="statRatioHandle"
         @input="(e: Event) => updateStatRatioHandle((e.target as HTMLInputElement).value)"
         placeholder="* 或具体用户名（如 handle）"
       />
     </div>

     <!-- 评分标准对照表卡片 -->
     <div class="mt-1 rounded-lg bg-body-bg border border-border p-2 flex flex-col gap-1.5 text-[10px]">
       <div class="flex justify-between items-center">
         <span class="font-semibold text-color-text">评级标准</span>
         <span class="text-secondary-text">对比作者粉丝总数</span>
       </div>

       <div class="grid grid-cols-5 gap-1 text-center font-medium">
         <div class="py-1 rounded bg-[rgba(113,118,123,0.18)] text-[#71767b]">
           <p class="font-bold">差</p>
           <p class="text-[9px] opacity-80">&lt; 30% 曝光</p>
           <p class="text-[9px] opacity-80">&lt; 0.5% 互动</p>
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
   </div>
 </div>
</template>

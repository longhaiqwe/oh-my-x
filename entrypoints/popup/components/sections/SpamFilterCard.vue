<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb, SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { KeySpamFilterEnabled, KeySpamThreshold, KeySpamDebugMode } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'

const enabled = ref(true)
const debug = ref(false)
const threshold = ref(55)

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
  const storageMap = await getStorage([KeySpamFilterEnabled, KeySpamThreshold, KeySpamDebugMode])
  enabled.value = storageMap[KeySpamFilterEnabled] === 'on'
  threshold.value = Number(storageMap[KeySpamThreshold]) || 55
  debug.value = storageMap[KeySpamDebugMode] === 'on'
})
</script>

<template>
 <!-- 净化过滤设置组（净化模式、调试模式、隐藏阈值） -->
 <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-3">
  <div class="flex items-center justify-between">
   <label class="text-sm font-semibold">净化模式</label>
   <SwitchRoot
    :model-value="enabled"
    @update:model-value="(v) => toggleEnabled(!!v)"
    class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
    :class="enabled ? 'bg-accent' : 'bg-secondary-text/40'"
   >
    <SwitchThumb
     class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
     :class="enabled ? 'translate-x-[15px]' : 'translate-x-0.5'"
    />
   </SwitchRoot>
  </div>

  <div class="flex items-center justify-between border-t border-border/60 pt-2.5">
   <div>
    <p class="text-[12px] font-semibold">调试模式</p>
    <p class="text-[10px] text-secondary-text mt-0.5">显示评论打分明细，不实际隐藏</p>
   </div>
   <SwitchRoot
    :model-value="debug"
    @update:model-value="(v) => toggleDebug(!!v)"
    class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
    :class="debug ? 'bg-accent' : 'bg-secondary-text/40'"
   >
    <SwitchThumb
     class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
     :class="debug ? 'translate-x-[15px]' : 'translate-x-0.5'"
    />
   </SwitchRoot>
  </div>

  <div class="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
   <div class="flex items-center justify-between">
    <label class="text-[12px] font-medium">隐藏阈值</label>
    <span class="text-[12px] font-mono text-accent">{{ threshold }}</span>
   </div>
   <p class="text-[10px] text-secondary-text -mt-0.5">得分 ≥ 此值的评论会被隐藏</p>
   <SliderRoot
    :model-value="[threshold]"
    @update:model-value="(v: number[] | undefined) => { if (v) { const val = v[0]; if (val !== undefined) setThreshold(val) } }"
    :min="20" :max="150" :step="5"
    class="relative flex items-center select-none touch-none w-full h-4"
   >
    <SliderTrack class="bg-accent/30 relative flex-grow rounded-full h-1">
     <SliderRange class="absolute bg-accent rounded-full h-full" />
    </SliderTrack>
    <SliderThumb class="block w-3.5 h-3.5 bg-accent rounded-full" />
   </SliderRoot>
  </div>
 </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { KeyTimelineWidth } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'

function getInitialWidth(): number {
  try {
    const cached = window?.localStorage?.getItem(KeyTimelineWidth)
    if (cached) return Number(cached)
  } catch {}
  return 700
}

const userTrack = ref(getInitialWidth())
const trackDots = [600, 650, 700, 750, 800]

// 只读 computed，供 SliderRoot :model-value 绑定
const sliderValue = computed(() => [userTrack.value])

function onSliderUpdate(val: number[]) {
  if (val[0] !== undefined && val[0] !== userTrack.value) {
    userTrack.value = val[0]
    try {
      localStorage.setItem(KeyTimelineWidth, String(val[0]))
    } catch {}
    void setStorage({ [KeyTimelineWidth]: val[0] })
  }
}

onMounted(async () => {
  const stored = await getStorage(KeyTimelineWidth)
  if (stored !== undefined) {
    const num = Number(stored)
    if (userTrack.value !== num) {
      userTrack.value = num
    }
    try {
      localStorage.setItem(KeyTimelineWidth, String(num))
    } catch {}
  }
})
</script>

<template>
  <form>
   <div class="flex items-center gap-x-2">
    <SliderRoot
     :model-value="sliderValue"
     @update:model-value="onSliderUpdate"
     :min="600"
     :max="800"
     :step="50"
     aria-label="时间线宽度滑块"
     class="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
    >
     <SliderTrack class="bg-accent/30 relative flex-grow rounded-full h-1">
      <SliderRange class="absolute bg-accent rounded-full h-full" />
     </SliderTrack>
     <SliderThumb
      class="block w-4 h-4 bg-accent rounded-full focus:shadow-[0_0_0_5px_var(--color-accent-ring)] hover:shadow-[0_0_0_5px_var(--color-accent-ring)]"
      :style="{ boxShadow: 'rgb(101 119 134 / 20%) 0px 0px 7px, rgb(101 119 134 / 15%) 0px 1px 3px 1px' }"
      />
      <span class="absolute left-0 right-0 flex items-center justify-center w-full pointer-events-none">
       <span
        v-for="(track, key) in trackDots"
        :key="`track-${key}`"
        :title="`${track}px`"
         class="absolute w-3 h-3 rounded-full -translate-x-1/2"
        :style="{
         left: `${((track - 600) / 200) * 100}%`,
         backgroundColor: track === userTrack ? 'transparent' : (track > userTrack ? 'var(--color-accent-track)' : 'var(--color-accent)'),
        }"
       />
      </span>
     </SliderRoot>
    <span class="text-xs font-semibold text-accent whitespace-nowrap w-10 text-right">{{ userTrack }}px</span>
   </div>
  </form>
</template>

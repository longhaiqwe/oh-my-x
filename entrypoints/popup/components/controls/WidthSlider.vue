<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { defaultPreferences } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { useI18n } from '../../composables/useI18n'

// 宽度滑块（时间线宽度、导航栏宽度共用）。
// 值同时缓存到 localStorage，弹窗打开时先显示上次的值，不会从默认值跳过来
const props = defineProps<{
  storageKey: string
  min: number
  max: number
  step: number
  label: string
}>()
const { t } = useI18n()

function getInitialWidth(): number {
  try {
    const cached = window?.localStorage?.getItem(props.storageKey)
    if (cached) return Number(cached)
  } catch {}
  return Number(defaultPreferences[props.storageKey])
}

const userTrack = ref(getInitialWidth())
const trackDots = computed(() => {
  const dots: number[] = []
  for (let v = props.min; v <= props.max; v += props.step) dots.push(v)
  return dots
})

// 只读 computed，供 SliderRoot :model-value 绑定
const sliderValue = computed(() => [userTrack.value])

function onSliderUpdate(val: number[] | undefined) {
  if (!val) return
  if (val[0] !== undefined && val[0] !== userTrack.value) {
    userTrack.value = val[0]
    try {
      localStorage.setItem(props.storageKey, String(val[0]))
    } catch {}
    void setStorage({ [props.storageKey]: val[0] })
  }
}

onMounted(async () => {
  const stored = await getStorage(props.storageKey)
  if (stored !== undefined) {
    const num = Number(stored)
    if (userTrack.value !== num) {
      userTrack.value = num
    }
    try {
      localStorage.setItem(props.storageKey, String(num))
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
     :min="min"
     :max="max"
     :step="step"
     :aria-label="t('common.slider', { label })"
     class="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
    >
     <SliderTrack class="bg-accent-track relative flex-grow rounded-full h-1">
      <SliderRange class="absolute bg-accent rounded-full h-full" />
     </SliderTrack>
     <SliderThumb
      class="relative z-10 block w-4 h-4 rounded-full bg-accent shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card-bg"
      />
      <span class="absolute left-0 right-0 flex items-center justify-center w-full pointer-events-none">
       <span
        v-for="(track, key) in trackDots"
        :key="`track-${key}`"
        :title="`${track}px`"
         class="absolute w-3 h-3 rounded-full -translate-x-1/2"
        :style="{
         left: `${((track - min) / (max - min)) * 100}%`,
         backgroundColor: track === userTrack ? 'transparent' : (track > userTrack ? 'var(--color-accent-track)' : 'var(--color-accent)'),
        }"
       />
      </span>
     </SliderRoot>
    <span class="text-xs font-mono font-semibold text-text whitespace-nowrap w-12 text-right">{{ userTrack }}px</span>
   </div>
  </form>
</template>

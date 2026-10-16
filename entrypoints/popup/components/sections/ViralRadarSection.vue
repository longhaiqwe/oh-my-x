<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  SliderRoot,
  SliderTrack,
  SliderThumb,
  CheckboxRoot,
  CheckboxIndicator,
} from 'reka-ui'
import {
  KeyViralRadarEnabled,
  KeyViralPotentialThreshold,
  KeyViralViralThreshold,
  KeyViralShowNormalBadge,
  KeyViralEnableHighlight,
  KeyViralHighlightStyle,
  KeyViralShowLevels,
  KeyViralShowBadge,
} from '../../../../storage-keys'
import {
  parseViralShowLevels,
  parseViralHighlightStyle,
  parseViralShowBadge,
  type ViralHighlightStyle,
} from '../../../../shared/settings'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'

type LevelKey = 'normal' | 'potential' | 'viral'

const levelOptions: { key: LevelKey; label: string }[] = [
  { key: 'normal', label: '普通' },
  { key: 'potential', label: '潜力' },
  { key: 'viral', label: '爆款' },
]

const styleOptions: { value: 'border' | 'background'; label: string }[] = [
  { value: 'border', label: '边框' },
  { value: 'background', label: '背景' },
]

const enabled = ref(true)
const potentialThreshold = ref(1000)
const viralThreshold = ref(10000)

// 展示级别：normal / potential / viral
const showLevels = ref<Record<LevelKey, boolean>>({
  normal: false,
  potential: true,
  viral: true,
})

// 标签开关：控制标签展示 & 展示级别行可见性
const showBadge = ref(true)

// 高亮标识：两个独立 checkbox（边框 / 背景），组合映射到存储值
// border | background | both | none
const highlightStyle = ref<ViralHighlightStyle>('both')

function formatK(val: number): string {
  if (val >= 1000) {
    const k = (val / 1000).toFixed(1).replace(/\.0$/, '')
    return `${k}k`
  }
  return `${val}`
}

const potentialPercent = computed(() => (potentialThreshold.value / 50000) * 100)
const viralPercent = computed(() => (viralThreshold.value / 50000) * 100)

async function refresh() {
  const data = await getStorage([
    KeyViralRadarEnabled,
    KeyViralPotentialThreshold,
    KeyViralViralThreshold,
    KeyViralShowNormalBadge,
    KeyViralEnableHighlight,
    KeyViralShowLevels,
    KeyViralHighlightStyle,
    KeyViralShowBadge,
  ])

  enabled.value = data?.[KeyViralRadarEnabled] !== 'off'
  potentialThreshold.value = Number(data?.[KeyViralPotentialThreshold]) || 1000
  viralThreshold.value = Number(data?.[KeyViralViralThreshold]) || 10000

  // 解析逻辑统一收敛到 shared/settings，含旧键迁移
  showLevels.value = parseViralShowLevels(data)
  showBadge.value = parseViralShowBadge(data)
  highlightStyle.value = parseViralHighlightStyle(data)
}

async function toggleEnabled(v: boolean) {
  enabled.value = v
  await setStorage({ [KeyViralRadarEnabled]: v ? 'on' : 'off' })
}

async function handleSliderChange(val: number[] | undefined) {
  if (!val || val.length < 2) return
  let p = val[0] ?? 1000
  let v = val[1] ?? 10000

  // 保证 p < v
  if (p >= v) {
    p = Math.max(0, v - 500)
  }

  potentialThreshold.value = p
  viralThreshold.value = v

  await setStorage({
    [KeyViralPotentialThreshold]: p,
    [KeyViralViralThreshold]: v,
  })
}

async function handleReset() {
  potentialThreshold.value = 1000
  viralThreshold.value = 10000
  await setStorage({
    [KeyViralPotentialThreshold]: 1000,
    [KeyViralViralThreshold]: 10000,
  })
}

async function toggleShowLevel(level: LevelKey, v: boolean) {
  showLevels.value = { ...showLevels.value, [level]: v }
  const enabledList = levelOptions.filter((o) => showLevels.value[o.key]).map((o) => o.key)
  await setStorage({ [KeyViralShowLevels]: enabledList.join(',') })
}

async function toggleShowBadge(v: boolean) {
  showBadge.value = v
  await setStorage({ [KeyViralShowBadge]: v ? 'on' : 'off' })
}

function isStyleChecked(flag: 'border' | 'background'): boolean {
  return highlightStyle.value === flag || highlightStyle.value === 'both'
}

async function toggleStyleFlag(flag: 'border' | 'background', v: boolean) {
  const border = isStyleChecked('border')
  const background = isStyleChecked('background')
  const nextBorder = flag === 'border' ? v : border
  const nextBackground = flag === 'background' ? v : background
  const next =
    nextBorder && nextBackground
      ? 'both'
      : nextBorder
        ? 'border'
        : nextBackground
          ? 'background'
          : 'none'
  highlightStyle.value = next
  await setStorage({ [KeyViralHighlightStyle]: next })
}

onMounted(refresh)
</script>

<template>
  <FeatureCard feature-id="viralRadar" :enabled="enabled" details-label="阈值与样式">
    <template #control>
      <SwitchToggle :model-value="enabled" label="爆款雷达" @update:model-value="toggleEnabled" />
    </template>

    <template #status>
      潜力 ≥ {{ formatK(potentialThreshold) }}/h · 爆款 ≥ {{ formatK(viralThreshold) }}/h
    </template>

    <template #details>
      <!-- 标注方式：标签 / 边框 / 背景，可多选 -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-normal text-text whitespace-nowrap">标注方式</p>
          <p class="text-xs text-secondary-text mt-1 whitespace-nowrap">可多选</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <label class="flex items-center gap-1 cursor-pointer select-none">
            <CheckboxRoot
              :model-value="showBadge"
              @update:model-value="(v) => toggleShowBadge(!!v)"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              :class="showBadge ? 'bg-accent border-accent' : 'bg-sunken-bg border-border-strong'"
            >
              <CheckboxIndicator class="flex items-center justify-center text-on-accent">
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 6.5 4.5 9 10 3.5" />
                </svg>
              </CheckboxIndicator>
            </CheckboxRoot>
            <span class="text-xs whitespace-nowrap" :class="showBadge ? 'text-text' : 'text-secondary-text'">标签</span>
          </label>
          <label
            v-for="opt in styleOptions"
            :key="opt.value"
            class="flex items-center gap-1 cursor-pointer select-none"
          >
            <CheckboxRoot
              :model-value="isStyleChecked(opt.value)"
              @update:model-value="(v) => toggleStyleFlag(opt.value, !!v)"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              :class="isStyleChecked(opt.value) ? 'bg-accent border-accent' : 'bg-sunken-bg border-border-strong'"
            >
              <CheckboxIndicator class="flex items-center justify-center text-on-accent">
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 6.5 4.5 9 10 3.5" />
                </svg>
              </CheckboxIndicator>
            </CheckboxRoot>
            <span class="text-xs whitespace-nowrap" :class="isStyleChecked(opt.value) ? 'text-text' : 'text-secondary-text'">
              {{ opt.label }}
            </span>
          </label>
        </div>
      </div>

      <!-- 显示标签的级别（勾选「标签」后出现） -->
      <div v-if="showBadge" class="flex items-center justify-between gap-3 pl-3 border-l-2 border-border">
        <p class="text-xs font-normal text-text whitespace-nowrap">显示标签的级别</p>
        <div class="flex items-center gap-2 shrink-0">
          <label
            v-for="opt in levelOptions"
            :key="opt.key"
            class="flex items-center gap-1 cursor-pointer select-none"
          >
            <CheckboxRoot
              :model-value="showLevels[opt.key]"
              @update:model-value="(v) => toggleShowLevel(opt.key, !!v)"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              :class="showLevels[opt.key] ? 'bg-accent border-accent' : 'bg-sunken-bg border-border-strong'"
            >
              <CheckboxIndicator class="flex items-center justify-center text-on-accent">
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 6.5 4.5 9 10 3.5" />
                </svg>
              </CheckboxIndicator>
            </CheckboxRoot>
            <span class="text-xs whitespace-nowrap" :class="showLevels[opt.key] ? 'text-text' : 'text-secondary-text'">
              {{ opt.label }}
            </span>
          </label>
        </div>
      </div>

      <!-- 流速阈值 -->
      <div class="flex flex-col gap-2 pt-2 border-t border-border">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-normal text-text">流速阈值</p>
            <p class="text-xs text-secondary-text mt-1">流速 = 当前浏览量 ÷ 发布后的小时数</p>
          </div>
          <button
            type="button"
            @click="handleReset"
            class="min-h-6 px-2 text-xs text-secondary-text hover:text-accent-text border border-border-strong hover:border-accent rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          >
            恢复默认
          </button>
        </div>

        <div class="bg-sunken-bg rounded-control px-3 py-2 flex flex-col gap-2 text-xs">
          <div class="flex justify-between items-center">
            <span class="flex items-center gap-2 text-text">
              <span class="w-2 h-2 rounded-full bg-level-normal"></span> 普通推文
            </span>
            <span class="font-mono text-text">&lt; {{ formatK(potentialThreshold) }}/h</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="flex items-center gap-2 text-text">
              <span class="w-2 h-2 rounded-full bg-level-potential"></span> 潜力推文
            </span>
            <span class="font-mono text-text">
              {{ formatK(potentialThreshold) }} ~ {{ formatK(viralThreshold) }}/h
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="flex items-center gap-2 text-text">
              <span class="w-2 h-2 rounded-full bg-level-viral"></span> 爆款推文
            </span>
            <span class="font-mono text-text">&ge; {{ formatK(viralThreshold) }}/h</span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <SliderRoot
            :model-value="[potentialThreshold, viralThreshold]"
            @update:model-value="handleSliderChange"
            :min="0"
            :max="50000"
            :step="500"
            aria-label="潜力和爆款流速阈值"
            class="relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
          >
            <SliderTrack class="bg-border relative flex-grow rounded-full h-2 overflow-hidden flex">
              <div class="h-full bg-level-normal" :style="{ width: potentialPercent + '%' }" />
              <div class="h-full bg-level-potential" :style="{ width: Math.max(0, viralPercent - potentialPercent) + '%' }" />
              <div class="h-full bg-level-viral" :style="{ width: Math.max(0, 100 - viralPercent) + '%' }" />
            </SliderTrack>
            <SliderThumb class="block w-4 h-4 bg-switch-thumb border-2 border-level-potential rounded-full shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" :aria-label="`潜力推文阈值 ${formatK(potentialThreshold)}/h`" />
            <SliderThumb class="block w-4 h-4 bg-switch-thumb border-2 border-level-viral rounded-full shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" :aria-label="`爆款推文阈值 ${formatK(viralThreshold)}/h`" />
          </SliderRoot>
          <div class="flex justify-between text-xs font-mono text-muted-text">
            <span>0</span>
            <span>50k/h</span>
          </div>
        </div>
      </div>
    </template>
  </FeatureCard>
</template>

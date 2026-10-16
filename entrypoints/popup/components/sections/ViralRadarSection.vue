<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  SwitchRoot,
  SwitchThumb,
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
  <section class="flex flex-col gap-3">
    <!-- Card 1: 爆款雷达检测设置组 -->
    <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-3">
      <!-- 主开关：爆款推文检测 -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-color-text">爆款推文检测</h2>
          <p class="text-[11px] text-secondary-text mt-0.5">在浏览 X 时识别正在快速传播的推文。</p>
        </div>
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

      <!-- 高亮标识：标签 / 边框 / 背景（一行：左边文案，右边 3 个 checkbox，可多选） -->
      <div class="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
        <div class="min-w-0">
          <p class="text-[12px] font-semibold text-color-text whitespace-nowrap">流速高亮标识</p>
          <p class="text-[10px] text-secondary-text mt-0.5 whitespace-nowrap">勾选要展示的标识</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <label class="flex items-center gap-1 cursor-pointer select-none">
            <CheckboxRoot
              :model-value="showBadge"
              @update:model-value="(v) => toggleShowBadge(!!v)"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer outline-none"
              :class="showBadge ? 'bg-accent border-accent' : 'bg-white border-secondary-text/40'"
            >
              <CheckboxIndicator class="flex items-center justify-center text-white">
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 6.5 4.5 9 10 3.5" />
                </svg>
              </CheckboxIndicator>
            </CheckboxRoot>
            <span class="text-xs whitespace-nowrap" :class="showBadge ? 'text-color-text' : 'text-secondary-text'">标签</span>
          </label>
          <label
            v-for="opt in styleOptions"
            :key="opt.value"
            class="flex items-center gap-1 cursor-pointer select-none"
          >
            <CheckboxRoot
              :model-value="isStyleChecked(opt.value)"
              @update:model-value="(v) => toggleStyleFlag(opt.value, !!v)"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer outline-none"
              :class="isStyleChecked(opt.value) ? 'bg-accent border-accent' : 'bg-white border-secondary-text/40'"
            >
              <CheckboxIndicator class="flex items-center justify-center text-white">
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 6.5 4.5 9 10 3.5" />
                </svg>
              </CheckboxIndicator>
            </CheckboxRoot>
            <span class="text-xs whitespace-nowrap" :class="isStyleChecked(opt.value) ? 'text-color-text' : 'text-secondary-text'">
              {{ opt.label }}
            </span>
          </label>
        </div>
      </div>

      <!-- 展示级别：普通 / 潜力 / 爆款（仅勾选「标签」后出现） -->
      <div
        v-if="showBadge"
        class="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5"
      >
        <div class="min-w-0">
          <p class="text-[12px] font-semibold text-color-text whitespace-nowrap">展示标签级别</p>
          <p class="text-[10px] text-secondary-text mt-0.5 whitespace-nowrap">勾选要展示标签的级别</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <label
            v-for="opt in levelOptions"
            :key="opt.key"
            class="flex items-center gap-1 cursor-pointer select-none"
          >
            <CheckboxRoot
              :model-value="showLevels[opt.key]"
              @update:model-value="(v) => toggleShowLevel(opt.key, !!v)"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors cursor-pointer outline-none"
              :class="showLevels[opt.key] ? 'bg-accent border-accent' : 'bg-white border-secondary-text/40'"
            >
              <CheckboxIndicator class="flex items-center justify-center text-white">
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 6.5 4.5 9 10 3.5" />
                </svg>
              </CheckboxIndicator>
            </CheckboxRoot>
            <span class="text-xs whitespace-nowrap" :class="showLevels[opt.key] ? 'text-color-text' : 'text-secondary-text'">
              {{ opt.label }}
            </span>
          </label>
        </div>
      </div>
    </div>

    <!-- Card 2: 标签参数 -->
    <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-3">
      <!-- 头部与重置按钮 -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-color-text">流速阈值</h2>
        </div>
        <button
          type="button"
          @click="handleReset"
          class="px-2.5 py-1 text-[10px] text-secondary-text hover:text-accent border border-secondary-text/20 hover:border-accent/40 rounded-md hover:bg-body-bg transition-colors cursor-pointer font-medium"
        >
          重置
        </button>
      </div>

      <!-- 三级流速说明小卡片 -->
      <div class="bg-body-bg border border-border rounded-lg p-2.5 flex flex-col gap-1.5 text-xs">
        <div class="flex justify-between items-center">
          <span class="flex items-center gap-1.5 font-medium">
            <span>🌱</span> <span>普通推文</span>
          </span>
          <span class="font-mono text-secondary-text">&lt; {{ formatK(potentialThreshold) }}/h</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="flex items-center gap-1.5 font-medium">
            <span>🚀</span> <span>潜力推文</span>
          </span>
          <span class="font-mono text-amber-600 font-semibold">
            {{ formatK(potentialThreshold) }} ~ {{ formatK(viralThreshold) }}/h
          </span>
        </div>
        <div class="flex justify-between items-center">
          <span class="flex items-center gap-1.5 font-medium">
            <span>🔥</span> <span>爆款推文</span>
          </span>
          <span class="font-mono text-red-500 font-bold">
            &ge; {{ formatK(viralThreshold) }}/h
          </span>
        </div>
      </div>

      <!-- 双滑块 Slider 区域 -->
      <div class="flex flex-col gap-1.5 pt-2">
        <div class="flex justify-between text-[10px] font-mono text-secondary-text px-0.5">
          <span>0</span>
          <span>50000</span>
        </div>

        <SliderRoot
          :model-value="[potentialThreshold, viralThreshold]"
          @update:model-value="handleSliderChange"
          :min="0"
          :max="50000"
          :step="500"
          class="relative flex items-center select-none touch-none w-full h-8 cursor-pointer"
        >
          <SliderTrack class="bg-border relative flex-grow rounded-full h-2 overflow-hidden flex">
            <!-- 普通段 (绿) -->
            <div class="h-full bg-emerald-500" :style="{ width: potentialPercent + '%' }" />
            <!-- 潜力段 (橙) -->
            <div
              class="h-full bg-amber-500"
              :style="{ width: Math.max(0, viralPercent - potentialPercent) + '%' }"
            />
            <!-- 爆款段 (红) -->
            <div
              class="h-full bg-red-500"
              :style="{ width: Math.max(0, 100 - viralPercent) + '%' }"
            />
          </SliderTrack>

          <!-- 潜力阈值 Thumb -->
          <SliderThumb
            class="block w-4 h-4 bg-white border-2 border-amber-500 rounded-full shadow-md outline-none relative"
          >
            <span
              class="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300 whitespace-nowrap shadow-xs"
            >
              🚀 {{ formatK(potentialThreshold) }}
            </span>
          </SliderThumb>

          <!-- 爆款阈值 Thumb -->
          <SliderThumb
            class="block w-4 h-4 bg-white border-2 border-red-500 rounded-full shadow-md outline-none relative"
          >
            <span
              class="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-100 text-red-700 border border-red-300 whitespace-nowrap shadow-xs"
            >
              🔥 {{ formatK(viralThreshold) }}
            </span>
          </SliderThumb>
        </SliderRoot>

        <!-- 图例说明 -->
        <div class="flex justify-around items-center text-[10px] text-secondary-text pt-1">
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            普通推文
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            潜力推文
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
            爆款推文
          </span>
        </div>
      </div>

      <!-- 什么是流速 说明盒 -->
      <div class="bg-body-bg border border-border/70 rounded-lg p-2.5 flex flex-col gap-1 text-[11px] mt-1">
        <h3 class="font-semibold text-color-text">什么是流速？</h3>
        <p class="text-secondary-text">流速表示推文平均每小时获得的浏览量。</p>
        <p class="text-secondary-text">计算方式：当前浏览量 ÷ 发布时长（小时）。</p>
      </div>
    </div>
  </section>
</template>

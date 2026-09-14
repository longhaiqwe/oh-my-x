<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb, SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import {
  KeySpamFilterEnabled,
  KeySpamThreshold,
  KeySpamDebugMode,
  KeyProfileActivityStats,
  KeyStatRatioTargetHandle,
  KeyStatRatioEnabled,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { SPAM_CATEGORY_LABEL } from '../../../../shared/spam-types'
import type { SpamCategory, SpamLogEntry } from '../../../../shared/spam-types'
import type { ProfileActivitySummary } from '../../../../shared/profile-activity'
import { getTodayStats, readLog } from '../../../../shared/spam-logger'

const enabled = ref(true)
const debug = ref(false)
const threshold = ref(55)
const todayTotal = ref(0)
const todayByCategory = ref<Record<SpamCategory, number>>({
  porn_spam: 0,
  bot: 0,
  marketing: 0,
  low_quality: 0,
  normal: 0,
})
const recent = ref<SpamLogEntry[]>([])
const cleanupHint = ref<string | null>(null)
const profileActivity = ref<ProfileActivitySummary | null>(null)

const statRatioEnabled = ref(true)
const statRatioHandle = ref('*')

const order: SpamCategory[] = ['porn_spam', 'marketing', 'bot', 'low_quality']

const categoryRows = computed(() =>
  order
    .map((c) => ({ category: c, label: SPAM_CATEGORY_LABEL[c], count: todayByCategory.value[c] || 0 }))
    .filter((r) => r.count > 0),
)
const profileActivityDays = computed(() => profileActivity.value?.days.slice(0, 7) ?? [])

function parseProfileActivity(raw: unknown): ProfileActivitySummary | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as ProfileActivitySummary
    if (!parsed.profileHandle || !Array.isArray(parsed.days)) return null
    return parsed
  } catch {
    return null
  }
}

async function refresh() {
  const [today, log, storageMap] = await Promise.all([
    getTodayStats(),
    readLog(5),
    getStorage([
      KeySpamFilterEnabled,
      KeySpamThreshold,
      KeySpamDebugMode,
      KeyProfileActivityStats,
      KeyStatRatioEnabled,
      KeyStatRatioTargetHandle,
    ]),
  ])
  todayTotal.value = today.total
  todayByCategory.value = today.byCategory
  recent.value = log

  profileActivity.value = parseProfileActivity(storageMap[KeyProfileActivityStats])
  enabled.value = storageMap[KeySpamFilterEnabled] === 'on'
  threshold.value = Number(storageMap[KeySpamThreshold]) || 55
  debug.value = storageMap[KeySpamDebugMode] === 'on'
  statRatioEnabled.value = storageMap[KeyStatRatioEnabled] !== 'off'
  const ratioH = storageMap[KeyStatRatioTargetHandle]
  if (ratioH && typeof ratioH === 'string') {
    statRatioHandle.value = ratioH
  }
}

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

async function toggleStatRatioEnabled(v: boolean) {
  statRatioEnabled.value = v
  await setStorage({ [KeyStatRatioEnabled]: v ? 'on' : 'off' })
}

async function updateStatRatioHandle(val: string) {
  statRatioHandle.value = val
  await setStorage({ [KeyStatRatioTargetHandle]: val })
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

onMounted(refresh)
</script>

<template>
 <section class="flex flex-col gap-3">
  <!-- 1. 净化过滤设置组（净化模式、调试模式、隐藏阈值） -->
  <div class="p-3 bg-card-bg rounded-b-xl flex flex-col gap-3">
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

  <!-- 4. 今日净化统计 -->
  <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2">
   <div class="flex items-baseline justify-between">
    <p class="text-lg text-secondary-text">今日净化</p>
    <p class="text-2xl font-extrabold text-accent leading-none">{{ todayTotal }}</p>
   </div>
   <div v-if="categoryRows.length" class="grid grid-cols-4 gap-1.5">
    <div
     v-for="row in categoryRows"
     :key="row.category"
     class="rounded-lg bg-body-bg border border-border px-2 py-1.5"
    >
    <p class="text-base font-bold leading-tight mb-0.5">{{ row.count }}</p>
    <p class="text-[10px] text-secondary-text leading-tight ">{{ row.label }}</p>
    </div>
   </div>
   <p v-else class="text-[11px] text-secondary-text">今天还没遇到垃圾评论。</p>
  </div>

  <!-- 当前主页已加载的活动统计：由用户正常浏览时的 DOM 增量产生。 -->
  <div v-if="profileActivity" class="p-3 bg-card-bg rounded-xl flex flex-col gap-2">
   <div class="flex items-baseline justify-between">
    <div>
     <p class="text-lg text-secondary-text">已加载活动</p>
     <p class="text-[10px] text-secondary-text mt-0.5">@{{ profileActivity.profileHandle }} · 当前浏览会话</p>
    </div>
    <div class="flex gap-3 text-right">
     <div><p class="text-base font-extrabold leading-none">{{ profileActivity.posts }}</p><p class="text-[10px] text-secondary-text mt-0.5">帖子</p></div>
     <div><p class="text-base font-extrabold leading-none">{{ profileActivity.replies }}</p><p class="text-[10px] text-secondary-text mt-0.5">回复</p></div>
    </div>
   </div>
   <p v-if="!profileActivityDays.length" class="text-[11px] text-secondary-text">请在该博主的主页或回复页正常浏览以收集数据。</p>
   <div v-else class="rounded-lg bg-body-bg border border-border overflow-hidden">
    <div class="grid grid-cols-[1fr_48px_48px] gap-1 px-2 py-1 text-[10px] text-secondary-text border-b border-border">
     <span>日期</span><span class="text-right">帖子</span><span class="text-right">回复</span>
    </div>
    <div v-for="day in profileActivityDays" :key="day.date" class="grid grid-cols-[1fr_48px_48px] gap-1 px-2 py-1 text-[11px] border-b border-border/50 last:border-0">
     <span class="font-mono">{{ day.date }}</span><span class="text-right">{{ day.posts }}</span><span class="text-right">{{ day.replies }}</span>
    </div>
   </div>
  </div>

  <!-- 5. 最近拦截记录 -->
  <div v-if="recent.length" class="p-3 bg-card-bg rounded-xl flex flex-col gap-1.5">
   <p class="text-[11px] text-secondary-text">最近拦截</p>
   <ul class="flex flex-col gap-1">
    <li
     v-for="entry in recent"
     :key="entry.id"
     class="flex items-center gap-1.5 text-[11px]"
    >
     <span class="font-mono text-secondary-text shrink-0 w-9">{{ fmtTime(entry.timestamp) }}</span>
     <span class="font-mono shrink-0">@{{ entry.authorHandle || 'unknown' }}</span>
     <span class="px-1 py-0.5 rounded bg-body-bg border border-border shrink-0 text-[10px]">
      {{ SPAM_CATEGORY_LABEL[entry.category] }}
     </span>
     <span class="truncate text-secondary-text">{{ entry.text || '(空)' }}</span>
    </li>
   </ul>
  </div>

  <!-- 6. 推文数据效果评估设置与评分标准说明 -->
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
 </section>
</template>

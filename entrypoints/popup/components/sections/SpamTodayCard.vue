<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SPAM_CATEGORY_LABEL } from '../../../../shared/spam-types'
import type { SpamCategory, SpamLogEntry } from '../../../../shared/spam-types'
import { getTodayStats, readLog } from '../../../../shared/spam-logger'

const todayTotal = ref(0)
const todayByCategory = ref<Record<SpamCategory, number>>({
  porn_spam: 0,
  bot: 0,
  marketing: 0,
  low_quality: 0,
  normal: 0,
})
const recent = ref<SpamLogEntry[]>([])

const order: SpamCategory[] = ['porn_spam', 'marketing', 'bot', 'low_quality']

const categoryRows = computed(() =>
  order
    .map((c) => ({ category: c, label: SPAM_CATEGORY_LABEL[c], count: todayByCategory.value[c] || 0 }))
    .filter((r) => r.count > 0),
)

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

onMounted(async () => {
  const [today, log] = await Promise.all([getTodayStats(), readLog(5)])
  todayTotal.value = today.total
  todayByCategory.value = today.byCategory
  recent.value = log
})
</script>

<template>
 <div class="flex flex-col gap-3">
  <!-- 今日净化统计 -->
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

  <!-- 最近拦截记录 -->
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
 </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { clearLog, clearStats, readLog } from '../../../../shared/spam-logger'
import { SPAM_CATEGORY_LABEL } from '../../../../shared/spam-types'
import type { SpamCategory, SpamLogEntry } from '../../../../shared/spam-types'

const log = ref<SpamLogEntry[]>([])

// log 本身在存储时已按时间逆序插入（最新在前），无需在前端额外做 O(N log N) 排序
const sorted = computed(() => log.value)

async function refresh() {
  log.value = await readLog()
}

async function handleClearLog() {
  if (!confirm('清空全部拦截日志？')) return
  await clearLog()
  await refresh()
}

async function handleClearStats() {
  if (!confirm('清空统计数据？')) return
  await clearStats()
  await refresh()
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

onMounted(refresh)
</script>

<template>
 <section class="flex flex-col gap-2 bg-card-bg rounded-b-xl p-3">
  <div class="flex items-center justify-between gap-2 ">
   <p class="text-[10px] text-color-glyphs">共拦截 {{ sorted.length }} 条 · 仅本地存储 · 最近 50 条</p>
   <div class="flex items-center gap-1">
    <button
     type="button"
     class="px-2 py-1 text-[10px] font-semibold  rounded  hover:bg-gray-400/15"
     @click="refresh"
    >刷新</button>
    <button
     type="button"
     class="px-2 py-1 text-[10px] font-semibold rounded   text-red-500 hover:bg-red-500/15"
     @click="handleClearLog"
    >清日志</button>
    <button
     type="button"
     class="px-2 py-1 text-[10px] font-semibold rounded  text-red-500 hover:bg-red-500/15"
     @click="handleClearStats"
    >清统计</button>
   </div>
  </div>

  <p v-if="!sorted.length" class="p-6 text-center text-[12px] text-secondary-text rounded-xl border border-dashed border-border">
   还没有拦截记录。
  </p>

  <ul v-else class="flex flex-col gap-1.5">
   <li
    v-for="entry in sorted"
    :key="entry.id"
    class="rounded-lg border border-border bg-body-bg p-2 flex flex-col gap-1"
   >
    <div class="flex items-center justify-between gap-2 text-[10px] text-secondary-text">
     <div class="flex items-center gap-1 flex-wrap min-w-0">
      <span class="font-mono">@{{ entry.authorHandle || 'unknown' }}</span>
      <span class="px-1 py-0.5 rounded-md bg-body-bg border border-border">{{ SPAM_CATEGORY_LABEL[entry.category] }}</span>
      <span class="px-1 py-0.5 rounded-md bg-body-bg border border-border">分 {{ entry.score }}</span>
      <span class="px-1 py-0.5 rounded-md bg-body-bg border border-border uppercase">{{ entry.action }}</span>
     </div>
     <span class="shrink-0">{{ fmtTime(entry.timestamp) }}</span>
    </div>
    <div class="text-xs whitespace-pre-wrap wrap-break-word leading-snug">{{ entry.text || '(空)' }}</div>
    <div v-if="entry.hits.length" class="flex flex-wrap gap-1">
     <span
      v-for="(hit, idx) in entry.hits"
      :key="idx"
      class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-400/10 text-red-400"
     >✓ {{ hit.label }}</span>
    </div>
   </li>
  </ul>
 </section>
</template>

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
  if (!confirm('清空全部拦截记录？')) return
  await clearLog()
  await refresh()
}

async function handleClearStats() {
  if (!confirm('清空每天的拦截统计？')) return
  await clearStats()
  await refresh()
}

const ACTION_LABEL: Record<SpamLogEntry['action'], string> = { filter: '已隐藏', allow: '已放行' }

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

onMounted(refresh)
</script>

<template>
 <section class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
   <p class="text-xs text-muted-text">共 {{ sorted.length }} 条，最多保留 50 条</p>
   <div class="flex items-center gap-1">
    <button
     type="button"
     class="min-h-6 px-2 text-xs font-semibold rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring text-secondary-text hover:text-text hover:bg-sunken-bg"
     @click="refresh"
    >刷新</button>
    <button
     type="button"
     class="min-h-6 px-2 text-xs font-semibold rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring text-danger hover:bg-sunken-bg"
     @click="handleClearLog"
    >清空记录</button>
    <button
     type="button"
     class="min-h-6 px-2 text-xs font-semibold rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring text-danger hover:bg-sunken-bg"
     @click="handleClearStats"
    >清空统计</button>
   </div>
  </div>

  <p v-if="!sorted.length" class="p-6 text-center text-xs text-muted-text rounded-card border border-dashed border-border-strong">
   还没有拦截记录。
  </p>

  <ul v-else class="flex flex-col gap-2">
   <li
    v-for="entry in sorted"
    :key="entry.id"
    class="rounded-control bg-sunken-bg p-2 flex flex-col gap-1"
   >
    <div class="flex items-center justify-between gap-2 text-xs text-secondary-text">
     <div class="flex items-center gap-1 flex-wrap min-w-0">
      <span class="font-mono">@{{ entry.authorHandle || 'unknown' }}</span>
      <span class="px-2 py-0.5 rounded-full bg-card-bg">{{ SPAM_CATEGORY_LABEL[entry.category] }}</span>
      <span class="px-2 py-0.5 rounded-full bg-card-bg">{{ entry.score }} 分</span>
      <span class="px-2 py-0.5 rounded-full bg-card-bg">{{ ACTION_LABEL[entry.action] ?? entry.action }}</span>
     </div>
     <span class="shrink-0">{{ fmtTime(entry.timestamp) }}</span>
    </div>
    <div class="text-xs text-text whitespace-pre-wrap wrap-break-word leading-normal">{{ entry.text || '(空)' }}</div>
    <div v-if="entry.hits.length" class="flex flex-wrap gap-1">
     <span
      v-for="(hit, idx) in entry.hits"
      :key="idx"
      class="text-xs px-2 py-0.5 rounded-full bg-card-bg text-secondary-text"
     >命中：{{ hit.label }}</span>
    </div>
   </li>
  </ul>
 </section>
</template>

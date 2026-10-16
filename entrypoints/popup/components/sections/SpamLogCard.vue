<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SPAM_CATEGORY_LABEL } from '../../../../shared/spam-types'
import type { SpamLogEntry } from '../../../../shared/spam-types'
import { readLog } from '../../../../shared/spam-logger'
import FeatureCard from '../ui/FeatureCard.vue'
import LogSection from './LogSection.vue'

const recent = ref<SpamLogEntry[]>([])

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

async function loadRecent() {
  recent.value = await readLog(3)
}

onMounted(loadRecent)
</script>

<template>
 <FeatureCard feature-id="spamLog" details-label="全部记录">
  <ul v-if="recent.length" class="flex flex-col gap-1">
   <li
    v-for="entry in recent"
    :key="entry.id"
    class="flex items-center gap-1.5 text-[11px] min-w-0"
   >
    <span class="font-mono text-secondary-text shrink-0 w-9">{{ fmtTime(entry.timestamp) }}</span>
    <span class="px-1 py-0.5 rounded bg-body-bg border border-border shrink-0 text-[10px]">
     {{ SPAM_CATEGORY_LABEL[entry.category] }}
    </span>
    <span class="font-mono shrink-0">@{{ entry.authorHandle || 'unknown' }}</span>
    <span class="truncate text-secondary-text">{{ entry.text || '(空)' }}</span>
   </li>
  </ul>
  <p v-else class="text-[11px] text-secondary-text">还没有拦截记录</p>

  <template #details>
   <LogSection @changed="loadRecent" />
  </template>
 </FeatureCard>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { KeySpamLog } from '../../../../storage-keys'
import { spamCategoryLabel } from '../../../../shared/spam-types'
import type { SpamLogEntry } from '../../../../shared/spam-types'
import { readLog } from '../../../../shared/spam-logger'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import { useI18n } from '../../composables/useI18n'
import FeatureCard from '../ui/FeatureCard.vue'

defineEmits<{ open: [] }>()

const { t, locale } = useI18n()
const recent = ref<SpamLogEntry[]>([])
const snapshot = useStorageSnapshot([KeySpamLog])

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false })
}

async function loadRecent() {
  recent.value = await readLog(3)
}

onMounted(loadRecent)
// 弹窗打开期间页面继续拦截时，最近记录随之更新
watch(() => snapshot[KeySpamLog], () => void loadRecent())
</script>

<template>
 <FeatureCard feature-id="spamLog" :details-label="t('spamLog.all')" details-as="page" @open-details="$emit('open')">
  <ul v-if="recent.length" class="flex flex-col gap-1">
   <li
    v-for="entry in recent"
    :key="entry.id"
    class="flex items-center gap-2 text-xs min-w-0"
   >
    <span class="font-mono text-secondary-text shrink-0 w-9">{{ fmtTime(entry.timestamp) }}</span>
    <span class="px-2 py-0.5 rounded-full bg-sunken-bg text-secondary-text shrink-0 text-xs">
     {{ spamCategoryLabel(entry.category, locale) }}
    </span>
    <span class="font-mono shrink-0">@{{ entry.authorHandle || 'unknown' }}</span>
    <span class="truncate text-secondary-text">{{ entry.text || t('common.empty') }}</span>
   </li>
  </ul>
  <p v-else class="text-xs text-muted-text">{{ t('spamLog.none') }}</p>
 </FeatureCard>
</template>

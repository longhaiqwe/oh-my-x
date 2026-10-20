<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { clearLog, clearStats, readLog } from '../../../../shared/spam-logger'
import { ruleHitText, spamCategoryLabel } from '../../../../shared/spam-types'
import type { RuleHit, SpamLogEntry } from '../../../../shared/spam-types'
import type { MessageKey } from '../../../../shared/i18n'
import { useI18n } from '../../composables/useI18n'

const { t, locale } = useI18n()
const log = ref<SpamLogEntry[]>([])

// log 本身在存储时已按时间逆序插入（最新在前），无需在前端额外做 O(N log N) 排序
const sorted = computed(() => log.value)

async function refresh() {
  log.value = await readLog()
}


async function handleClearLog() {
  if (!confirm(t('spamLog.confirmClearLog'))) return
  await clearLog()
  await refresh()
}

async function handleClearStats() {
  if (!confirm(t('spamLog.confirmClearStats'))) return
  await clearStats()
  await refresh()
}

function actionLabel(action: SpamLogEntry['action']) {
  if (action === 'filter') return t('spamLog.actionFilter')
  if (action === 'allow') return t('spamLog.actionAllow')
  return action
}

// 新记录按命中细节用当前语言重拼；旧记录只有中文说明，非中文界面只显示规则名
function hitLabel(hit: RuleHit) {
  return ruleHitText(hit, locale.value)
}

// AI 折叠的记录：信号编号换成名称
function aiSignalsText(signals: string[]) {
  return signals.map((s) => t(`aiSignal.${s}` as MessageKey)).join(t('spamPage.aiSignalSeparator'))
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

onMounted(refresh)
</script>

<template>
 <section class="flex flex-col gap-2">
  <!-- 按钮文字不折行；和左边的条数放不下一行时，整组换到下一行靠右 -->
  <div class="flex flex-wrap items-center justify-between gap-2">
   <p class="text-xs text-muted-text">{{ t('spamLog.total', { count: sorted.length }) }}</p>
   <div class="flex items-center gap-1 ml-auto">
    <button
     type="button"
     class="min-h-6 px-2 text-xs font-semibold whitespace-nowrap rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring text-secondary-text hover:text-text hover:bg-sunken-bg"
     @click="refresh"
    >{{ t('common.refresh') }}</button>
    <button
     type="button"
     class="min-h-6 px-2 text-xs font-semibold whitespace-nowrap rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring text-danger hover:bg-sunken-bg"
     @click="handleClearLog"
    >{{ t('spamLog.clearLog') }}</button>
    <button
     type="button"
     class="min-h-6 px-2 text-xs font-semibold whitespace-nowrap rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring text-danger hover:bg-sunken-bg"
     @click="handleClearStats"
    >{{ t('spamLog.clearStats') }}</button>
   </div>
  </div>

  <p v-if="!sorted.length" class="p-6 text-center text-xs text-muted-text rounded-card border border-dashed border-border-strong">
   {{ t('spamLog.empty') }}
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
      <span class="px-2 py-0.5 rounded-full bg-card-bg">{{ spamCategoryLabel(entry.category, locale) }}</span>
      <template v-if="entry.source === 'ai' && entry.ai">
       <span v-if="entry.ai.score !== null" class="px-2 py-0.5 rounded-full bg-card-bg">{{ t('spamLog.aiScore', { score: entry.ai.score }) }}</span>
       <span v-if="entry.ai.label === 'bot'" class="px-2 py-0.5 rounded-full bg-card-bg">{{ t('spamLog.aiLabeledBot') }}</span>
      </template>
      <span v-else class="px-2 py-0.5 rounded-full bg-card-bg">{{ t('spamLog.score', { score: entry.score }) }}</span>
      <span class="px-2 py-0.5 rounded-full bg-card-bg">{{ actionLabel(entry.action) }}</span>
     </div>
     <span class="shrink-0">{{ fmtTime(entry.timestamp) }}</span>
    </div>
    <div class="text-xs text-text whitespace-pre-wrap wrap-break-word leading-normal">{{ entry.text || t('common.empty') }}</div>
    <div v-if="entry.hits.length" class="flex flex-wrap gap-1">
     <span
      v-for="(hit, idx) in entry.hits"
      :key="idx"
      class="text-xs px-2 py-0.5 rounded-full bg-card-bg text-secondary-text"
     >{{ t('spamLog.hit', { rule: hitLabel(hit) }) }}</span>
    </div>
    <div v-if="entry.source === 'ai' && entry.ai" class="flex flex-col gap-1">
     <span
      v-if="entry.ai.signals.length"
      class="self-start text-xs px-2 py-0.5 rounded-full bg-card-bg text-secondary-text"
     >{{ t('spamPage.aiSignals', { signals: aiSignalsText(entry.ai.signals) }) }}</span>
     <p v-if="entry.ai.reason" class="text-xs leading-normal text-muted-text">{{ entry.ai.reason }}</p>
    </div>
   </li>
  </ul>
 </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import {
  KeyAiRepostApiKey,
  KeyAiRepostBaseUrl,
  KeyAiRepostModel,
  KeySpamAiAutoScope,
  KeySpamAiDailyLimit,
  KeySpamAiEnabled,
  KeySpamAiModel,
  KeySpamAiThreshold,
  KeySpamAiUsage,
  defaultPreferences,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { aiPermissionOrigin, requestAiPermission, sendAiRequest } from '../../../../shared/ai-request'
import { REPLY_SCORE_SAMPLE_THREADS, summarizeSampleRun, type SampleRunSummary } from '../../../../shared/ai-reply-samples'
import type { ReplyScore } from '../../../../shared/ai-reply-score'
import { parseReplyScoreUsage } from '../../../../shared/reply-score-usage'
import { getTodayKey } from '../../../../shared/spam-logger'
import { errorText } from '../../../../shared/errors'
import { useI18n } from '../../composables/useI18n'
import { useStorageKey } from '../../composables/useStorageKey'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import SubRow from '../ui/SubRow.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'

// 回复区 AI 打分的设置（方案见 docs/plans/ai-reply-scoring.md 4.10）
const { t, featureText, locale } = useI18n()
const { value: enabled, setValue: setEnabled } = useStorageKey(KeySpamAiEnabled)

// 连接用「AI 总结转发」的设置；这里只读，用来提示没填 key、没授权
const snapshot = useStorageSnapshot([KeyAiRepostApiKey, KeyAiRepostBaseUrl, KeyAiRepostModel, KeySpamAiUsage])
const hasKey = computed(() => String(snapshot[KeyAiRepostApiKey] ?? '').trim() !== '')
const baseUrl = computed(() => String(snapshot[KeyAiRepostBaseUrl] || defaultPreferences[KeyAiRepostBaseUrl]))
const repostModel = computed(() => String(snapshot[KeyAiRepostModel] || defaultPreferences[KeyAiRepostModel]))
const granted = ref(true)

async function checkGranted() {
  try {
    granted.value = await browser.permissions.contains({ origins: [aiPermissionOrigin(baseUrl.value)] })
  } catch {
    granted.value = false
  }
}

/** 授权请求必须在点击事件里同步发出 */
function grant() {
  try {
    void requestAiPermission(baseUrl.value).then((ok) => { granted.value = ok }).catch(() => { granted.value = false })
  } catch {
    granted.value = false
  }
}

const scopeOptions = computed(() => [
  { value: 'own', label: t('spamFilter.aiScopeOwn') },
  { value: 'all', label: t('spamFilter.aiScopeAll') },
  { value: 'off', label: t('spamFilter.aiScopeOff') },
])

const threshold = ref(Number(defaultPreferences[KeySpamAiThreshold]))
const model = ref('')
const dailyLimit = ref(Number(defaultPreferences[KeySpamAiDailyLimit]))
let modelTimer: ReturnType<typeof setTimeout> | null = null

async function setThreshold(value: number) {
  threshold.value = value
  await setStorage({ [KeySpamAiThreshold]: value })
}

function saveModel() {
  if (modelTimer) clearTimeout(modelTimer)
  modelTimer = null
  void setStorage({ [KeySpamAiModel]: model.value.trim() })
}

function scheduleSaveModel() {
  if (modelTimer) clearTimeout(modelTimer)
  modelTimer = setTimeout(saveModel, 300)
}

async function saveDailyLimit() {
  const n = Math.floor(Number(dailyLimit.value))
  dailyLimit.value = Number.isFinite(n) ? Math.min(5000, Math.max(0, n)) : Number(defaultPreferences[KeySpamAiDailyLimit])
  await setStorage({ [KeySpamAiDailyLimit]: dailyLimit.value })
}

const today = computed(() => {
  const usage = parseReplyScoreUsage(snapshot[KeySpamAiUsage], getTodayKey())
  return { auto: usage.auto, manual: usage.manual, cached: usage.cached, folded: usage.folded, failed: usage.failed }
})

// ---------- 用样例集测试 ----------

const threads = REPLY_SCORE_SAMPLE_THREADS
const sampleCount = threads.reduce((n, thread) => n + thread.replies.length, 0)
const running = ref(false)
const progress = ref(0)
const summary = ref<SampleRunSummary | null>(null)
const usage = ref<{ prompt: number; completion: number } | null>(null)
const seconds = ref(0)
const sampleError = ref('')
const showDetails = ref(false)
let activeRun: AbortController | undefined

async function runSamples() {
  if (running.value) return
  const run = new AbortController()
  activeRun = run
  running.value = true
  progress.value = 0
  summary.value = null
  usage.value = null
  sampleError.value = ''
  showDetails.value = false
  const startedAt = Date.now()
  const scores = new Map<string, ReplyScore[]>()
  let prompt = 0
  let completion = 0
  let anyUsage = false
  try {
    for (let i = 0; i < threads.length; i++) {
      const res = await sendAiRequest({ type: 'XF_TEST_REPLY_SCORE_SAMPLES', threadIndex: i, locale: locale.value }, run.signal)
      if (activeRun !== run) return
      if (!res.ok) {
        sampleError.value = t('spamFilter.aiSampleError', { index: i + 1, error: errorText(res.error, 'error.aiFailed') })
        break
      }
      scores.set(threads[i].id, res.scores ?? [])
      if (res.usage) {
        anyUsage = true
        prompt += res.usage.promptTokens
        completion += res.usage.completionTokens
      }
      progress.value = i + 1
      summary.value = summarizeSampleRun(threads, scores)
    }
  } catch (error) {
    if (activeRun === run) sampleError.value = errorText(error, 'error.aiFailed')
  } finally {
    if (activeRun === run) {
      activeRun = undefined
      running.value = false
      seconds.value = Math.round((Date.now() - startedAt) / 1000)
      usage.value = anyUsage ? { prompt, completion } : null
    }
  }
}

function cancelSamples() {
  activeRun?.abort()
  activeRun = undefined
  running.value = false
}

onMounted(async () => {
  const stored = await getStorage([KeySpamAiThreshold, KeySpamAiModel, KeySpamAiDailyLimit])
  const th = Number(stored[KeySpamAiThreshold])
  if (Number.isFinite(th)) threshold.value = th
  model.value = String(stored[KeySpamAiModel] ?? '')
  const limit = Number(stored[KeySpamAiDailyLimit])
  if (Number.isFinite(limit)) dailyLimit.value = limit
  void checkGranted()
})
watch(baseUrl, () => void checkGranted())

onBeforeUnmount(() => {
  cancelSamples()
  if (modelTimer) saveModel()
})
</script>

<template>
 <FeatureCard feature-id="spamAi">
  <template #control>
   <SwitchToggle :model-value="enabled" :label="featureText('spamAi', 'label')" @update:model-value="setEnabled" />
  </template>

  <div v-if="enabled" class="flex flex-col gap-4">
   <p v-if="!hasKey" class="text-xs leading-normal text-warning">{{ t('spamFilter.aiNoKey') }}</p>
   <div v-else-if="!granted" class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-xs leading-normal text-warning">{{ t('spamFilter.aiNotGranted') }}</p>
    <button
     type="button"
     class="min-h-6 px-2 rounded-control text-xs font-semibold whitespace-nowrap bg-accent text-on-accent hover:bg-accent-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
     @click="grant"
    >{{ t('spamFilter.aiGrant') }}</button>
   </div>

   <SubRow :title="t('spamFilter.aiScopeTitle')" :description="t('spamFilter.aiScopeDescription')">
    <ToggleGroupControl :storage-key="KeySpamAiAutoScope" :options="scopeOptions" />
   </SubRow>

   <div class="flex flex-col gap-2 pl-3 border-l-2 border-border">
    <div class="flex items-center justify-between gap-4">
     <p class="text-sm leading-tight text-text">{{ t('spamFilter.aiThresholdTitle') }}</p>
     <span class="text-sm font-mono font-semibold text-text">{{ threshold }}</span>
    </div>
    <p class="text-xs leading-normal text-muted-text">{{ t('spamFilter.aiThresholdDescription') }}</p>
    <SliderRoot
     :model-value="[threshold]"
     @update:model-value="(v: number[] | undefined) => { if (v) { const val = v[0]; if (val !== undefined) setThreshold(val) } }"
     :min="0" :max="100" :step="5"
     :aria-label="t('spamFilter.aiThresholdTitle')"
     class="relative flex items-center select-none touch-none w-full h-4"
    >
     <SliderTrack class="bg-accent-track relative flex-grow rounded-full h-1">
      <SliderRange class="absolute bg-accent rounded-full h-full" />
     </SliderTrack>
     <SliderThumb class="block w-4 h-4 rounded-full bg-accent shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card-bg" />
    </SliderRoot>
   </div>

   <SubRow :title="t('spamFilter.aiModelTitle')" :description="t('spamFilter.aiModelDescription')">
    <input
     v-model="model"
     type="text"
     :aria-label="t('spamFilter.aiModelTitle')"
     :placeholder="t('spamFilter.aiModelPlaceholder', { model: repostModel })"
     class="w-40 h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs font-mono text-text placeholder:text-muted-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring"
     @input="scheduleSaveModel"
     @blur="saveModel"
    />
   </SubRow>

   <SubRow :title="t('spamFilter.aiLimitTitle')" :description="t('spamFilter.aiLimitDescription')">
    <input
     v-model="dailyLimit"
     type="number"
     min="0"
     max="5000"
     step="50"
     :aria-label="t('spamFilter.aiLimitTitle')"
     class="w-20 h-8 px-2 rounded-control border border-border-strong bg-sunken-bg text-xs font-mono text-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring"
     @change="saveDailyLimit"
    />
   </SubRow>

   <p class="text-xs leading-normal text-secondary-text">{{ t('spamFilter.aiToday', today) }}</p>

   <!-- 用样例集测试：用当前的模型和提示词跑样例，看相符条数和用量 -->
   <div class="flex flex-col gap-2 pt-4 border-t border-border">
    <p class="text-sm font-semibold text-text">{{ t('spamFilter.aiSampleTitle') }}</p>
    <p class="text-xs leading-normal text-muted-text">{{ t('spamFilter.aiSampleDescription', { count: sampleCount, threads: threads.length }) }}</p>
    <div class="flex flex-wrap items-center gap-2">
     <button
      type="button"
      :disabled="running || !hasKey"
      class="h-8 px-3 rounded-control text-xs font-semibold whitespace-nowrap bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      @click="runSamples"
     >{{ running ? t('spamFilter.aiSampleRunning', { done: progress, total: threads.length }) : t('spamFilter.aiSampleRun') }}</button>
     <button
      v-if="running"
      type="button"
      class="min-h-6 px-2 rounded-control text-xs text-secondary-text whitespace-nowrap hover:text-text hover:bg-sunken-bg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      @click="cancelSamples"
     >{{ t('common.cancel') }}</button>
    </div>

    <p v-if="sampleError" class="text-xs leading-normal text-danger">{{ sampleError }}</p>

    <div v-if="summary" class="flex flex-col gap-1 rounded-control bg-sunken-bg px-3 py-2">
     <p class="text-sm font-semibold text-text">{{ t('spamFilter.aiSampleMatched', { matched: summary.matched, total: summary.total }) }}</p>
     <p class="text-xs leading-normal text-secondary-text">
      {{ t('spamFilter.aiSampleBreakdown', { ai: summary.aiMatched, aiTotal: summary.aiTotal, human: summary.humanMatched, humanTotal: summary.humanTotal, unsure: summary.unsure, missing: summary.missing }) }}
     </p>
     <p v-if="!running" class="text-xs leading-normal text-muted-text">
      {{ usage ? t('spamFilter.aiSampleUsage', { prompt: usage.prompt, completion: usage.completion, seconds }) : t('spamFilter.aiSampleNoUsage', { seconds }) }}
     </p>
     <button
      type="button"
      class="self-start min-h-6 -ml-1 px-1 rounded-control text-xs font-semibold text-accent-text hover:bg-accent-subtle cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      :aria-expanded="showDetails"
      @click="showDetails = !showDetails"
     >{{ showDetails ? t('common.collapse') : t('spamFilter.aiSampleDetails') }}</button>
     <ul v-if="showDetails" class="flex flex-col gap-2">
      <li v-for="row in summary.rows" :key="row.id" class="flex flex-col gap-1 rounded-control bg-card-bg p-2">
       <div class="flex flex-wrap items-center gap-1 text-xs">
        <span class="font-semibold" :class="row.matched ? 'text-success' : 'text-danger'">{{ row.matched ? '✓' : '✗' }}</span>
        <span class="text-secondary-text">{{ row.expect === 'ai' ? t('spamFilter.aiSampleExpectAi') : t('spamFilter.aiSampleExpectHuman') }}</span>
        <span class="font-semibold text-text">{{ row.score === null ? t('spamFilter.aiSampleNoScore') : t('spamLog.aiScore', { score: row.score }) }}</span>
       </div>
       <p class="text-xs leading-normal text-text">{{ row.text }}</p>
       <p v-if="row.reason" class="text-xs leading-normal text-muted-text">{{ row.reason }}</p>
      </li>
     </ul>
    </div>
   </div>

   <p class="text-xs leading-normal text-muted-text">{{ t('spamFilter.aiPrivacy', { limit: dailyLimit }) }}</p>
  </div>
 </FeatureCard>
</template>

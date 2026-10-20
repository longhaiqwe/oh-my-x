<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  KeyCreatorRewardsCollapsed,
  KeyCreatorRewardsHistory,
  KeyCreatorRewardsStats,
  KeyImpressionsDaily,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import type { CreatorRewardsStats } from '../../../../shared/creator-rewards'
import { formatImpressionsCount, isCreatorRewardsStale } from '../../../../shared/creator-rewards'
import {
  buildDailyConversion,
  isImpressionsMissingYesterday,
  isRewardsHistoryMissingToday,
  parseImpressionsCache,
  parseRewardsHistory,
  shiftDateKey,
  utcDateKey,
  type DailyConversionRow,
  type ImpressionsDailyCache,
  type RewardsHistory,
} from '../../../../shared/creator-rewards-daily'
import { useI18n } from '../../composables/useI18n'
import { errorText, type TransferableError } from '../../../../shared/errors'
import FeatureCard from '../ui/FeatureCard.vue'
import HintTooltip from '../ui/HintTooltip.vue'

const { t, locale } = useI18n()

type RefreshResponse = {
  ok?: boolean
  stats?: CreatorRewardsStats | null
  error?: TransferableError
  impressionsError?: TransferableError
}

/** 账号分析的当天数据会持续变，超过一小时重新取 */
const IMPRESSIONS_MAX_AGE_MS = 60 * 60 * 1000
const IMPRESSIONS_RETRY_MS = 10 * 60 * 1000
/** 柱子最高 32px，与 h-8 的图区一致 */
const BAR_MAX_HEIGHT = 32

const stats = ref<CreatorRewardsStats | null>(null)
const history = ref<RewardsHistory>({})
const impressions = ref<ImpressionsDailyCache | null>(null)
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const impressionsError = ref<string | null>(null)
const pickedDate = ref<string | null>(null)

// 近 7 天，截至昨天（UTC）：今天的数据还没走完
const rows = computed(() =>
  buildDailyConversion(
    history.value,
    impressions.value?.days ?? {},
    shiftDateKey(utcDateKey(Date.now()), -1),
  ),
)

// 默认选最近一个三项都有的日子，没有就选最后一天
const selectedRow = computed<DailyConversionRow>(() => {
  const list = rows.value
  return (
    list.find((row) => row.date === pickedDate.value) ??
    [...list].reverse().find((row) => row.counted !== null) ??
    list[list.length - 1]
  )
})

const hasCounted = computed(() => rows.value.some((row) => row.counted !== null))
const countedMax = computed(() => Math.max(0, ...rows.value.map((row) => row.counted ?? 0)))

function ratioText(part: number | null, whole: number | null): string {
  if (part === null || whole === null || whole <= 0) return ''
  return `${((part / whole) * 100).toFixed(1)}%`
}

// 一排三个数；比例放在悬停提示里
const conversion = computed(() => {
  const row = selectedRow.value
  return {
    total: formatCount(row.total),
    verified: formatCount(row.verified),
    counted: formatCount(row.counted),
    verifiedOfTotal: ratioText(row.verified, row.total),
    countedOfTotal: ratioText(row.counted, row.total),
    countedOfVerified: ratioText(row.counted, row.verified),
  }
})

function formatCount(value: number | null): string {
  if (value === null) return '—'
  return value < 0 ? `−${formatImpressionsCount(-value)}` : formatImpressionsCount(value)
}

function barHeight(row: DailyConversionRow): number {
  if (row.counted === null) return 0
  if (row.counted <= 0 || countedMax.value <= 0) return 2
  return Math.max(2, Math.round((row.counted / countedMax.value) * BAR_MAX_HEIGHT))
}

function dayParts(date: string) {
  const [, month, day] = date.split('-').map(Number)
  return { month, day }
}

function shortDay(date: string): string {
  const { month, day } = dayParts(date)
  return `${month}/${day}`
}

// 日期按 UTC：中文「10月18日」，英文「October 18」
// 奖励计划每天 UTC 02:30 更新（北京时间 10:30），按用户所在时区显示；取当天日期换算，夏令时也对
const dailyUpdateTime = computed(() => {
  const now = new Date()
  const updateAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 30)
  return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(updateAt)
})

function longDay(date: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

const progressPercent = computed(() => {
  if (!stats.value) return 0
  return stats.value.progressPercent
})

const remainingText = computed(() => {
  if (!stats.value) return ''
  const diff = stats.value.targetImpressionsCount - stats.value.impressionsCount
  if (diff <= 0) return t('rewards.reached')
  return t('rewards.remaining', { count: formatImpressionsCount(diff) })
})

const lastUpdatedText = computed(() => {
  if (!stats.value?.updatedAt) return ''
  const d = new Date(stats.value.updatedAt)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  if (isSameDay) {
    return t('common.today', { time: timeStr })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  if (isYesterday) {
    return t('common.yesterday', { time: timeStr })
  }

  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`
})

async function readStorage() {
  try {
    const data = await getStorage([KeyCreatorRewardsStats, KeyCreatorRewardsHistory, KeyImpressionsDaily])
    const raw: unknown = data[KeyCreatorRewardsStats]
    if (typeof raw === 'string') {
      stats.value = JSON.parse(raw) as CreatorRewardsStats
    } else if (raw && typeof raw === 'object') {
      stats.value = raw as CreatorRewardsStats
    }
    history.value = parseRewardsHistory(data[KeyCreatorRewardsHistory])
    impressions.value = parseImpressionsCache(data[KeyImpressionsDaily])
  } catch {
    // ignore
  }
}

function needsRefresh(): boolean {
  // 进度过了每天 10:30 的分界线、还没记到当天的累计数，或账号分析数据超过一小时
  if (!stats.value || isCreatorRewardsStale(stats.value.updatedAt)) return true
  if (isRewardsHistoryMissingToday(history.value)) return true
  if (!impressions.value) return true
  const age = Date.now() - impressions.value.updatedAt
  // 账号分析还没出昨天的数：打开弹窗时补取，10 分钟内最多一次
  if (isImpressionsMissingYesterday(impressions.value) && age > IMPRESSIONS_RETRY_MS) return true
  return age > IMPRESSIONS_MAX_AGE_MS
}

// 收起状态：弹窗本地缓存一份，打开时直接按缓存渲染，不会先展开再收起；插件存储里的值为准
function readCachedCollapsed(): boolean {
  try {
    return localStorage.getItem(KeyCreatorRewardsCollapsed) === 'on'
  } catch {
    return false
  }
}

const collapsed = ref(readCachedCollapsed())

function cacheCollapsed(value: boolean) {
  try {
    localStorage.setItem(KeyCreatorRewardsCollapsed, value ? 'on' : 'off')
  } catch {}
}

async function loadFromStorage() {
  collapsed.value = (await getStorage(KeyCreatorRewardsCollapsed)) === 'on'
  cacheCollapsed(collapsed.value)
  await readStorage()
  // 收起时不刷新；后台仍按每天的节点自动读取
  if (!collapsed.value && needsRefresh()) void silentRefresh()
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  cacheCollapsed(collapsed.value)
  void setStorage({ [KeyCreatorRewardsCollapsed]: collapsed.value ? 'on' : 'off' })
  if (!collapsed.value && needsRefresh()) void silentRefresh()
}

async function requestRefresh(): Promise<RefreshResponse | undefined> {
  const response = (await browser.runtime.sendMessage({
    type: 'XF_FETCH_CREATOR_REWARDS',
  })) as RefreshResponse | undefined
  await readStorage()
  return response
}

async function silentRefresh() {
  if (loading.value) return
  try {
    const response = await requestRefresh()
    if (response?.ok) errorMsg.value = null
    // 静默刷新只在完全没有账号分析数据时提示
    impressionsError.value = impressions.value ? null : errorText(response?.impressionsError) || null
  } catch {
    // 静默刷新失败不打扰用户
  }
}

async function refreshData() {
  if (loading.value) return
  loading.value = true
  errorMsg.value = null

  try {
    const response = await requestRefresh()
    if (!response?.ok) {
      errorMsg.value = errorText(response?.error) || t('rewards.fetchFailed')
    }
    impressionsError.value = errorText(response?.impressionsError) || null
  } catch (e: any) {
    errorMsg.value = e?.message || t('rewards.requestFailed')
  } finally {
    loading.value = false
  }
}

function openRewardsPage() {
  window.open('https://x.com/i/jf/creators/original_content_rewards', '_blank')
}

onMounted(() => {
  void loadFromStorage()
})
</script>

<template>
  <FeatureCard feature-id="creatorRewards">
    <template #control>
      <div class="flex items-center gap-1">
        <template v-if="!collapsed">
          <span v-if="lastUpdatedText" class="text-xs text-muted-text mr-1" :title="t('rewards.updateSchedule')">
            {{ lastUpdatedText }}
          </span>
          <button
            type="button"
            :disabled="loading"
            @click="refreshData"
            :title="t('rewards.refresh')"
            :aria-label="t('rewards.refresh')"
            class="flex items-center justify-center w-7 h-7 rounded-control text-secondary-text hover:text-text hover:bg-sunken-bg transition-colors disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          >
            <svg
              class="w-3.5 h-3.5"
              :class="{ 'animate-spin': loading }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </button>
          <button
            type="button"
            @click="openRewardsPage"
            :title="t('rewards.openInX')"
            :aria-label="t('rewards.openInXLabel')"
            class="flex items-center justify-center w-7 h-7 rounded-control text-secondary-text hover:text-text hover:bg-sunken-bg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </template>
        <button
          type="button"
          @click="toggleCollapsed"
          :aria-expanded="!collapsed"
          :title="collapsed ? t('rewards.expandLabel') : t('rewards.collapseLabel')"
          :aria-label="collapsed ? t('rewards.expandLabel') : t('rewards.collapseLabel')"
          class="flex items-center justify-center w-7 h-7 rounded-control text-secondary-text hover:text-text hover:bg-sunken-bg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          <svg
            class="w-3.5 h-3.5 transition-transform duration-150"
            :class="collapsed ? '' : 'rotate-180'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
    </template>

    <!-- 收起时只剩标题和说明 -->
    <template v-if="!collapsed">

      <template v-if="stats">
        <!-- 进度：90 天累计 / 目标 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2" :title="t('rewards.progressTitle')">
              <span class="text-xl font-semibold tracking-tight text-text">{{ stats.impressionsText }}</span>
              <span class="text-xs text-muted-text">/ {{ stats.targetImpressionsText }}</span>
            </div>
            <span class="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-accent-subtle text-accent-subtle-text">
              {{ progressPercent }}%
            </span>
          </div>
          <div
            class="w-full bg-accent-track rounded-full h-2 overflow-hidden"
            role="progressbar"
            :aria-valuenow="progressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="t('rewards.progressLabel')"
          >
            <div class="bg-accent h-2 rounded-full transition-all duration-300" :style="{ width: `${progressPercent}%` }"></div>
          </div>
          <!-- 累计数一天只变一次，当天多次刷新数字不变 -->
          <div class="flex items-baseline justify-between gap-2 text-xs text-muted-text">
            <p>{{ t('rewards.dailyUpdate', { time: dailyUpdateTime }) }}</p>
            <p class="tabular-nums">{{ remainingText }}</p>
          </div>
        </div>

        <!-- 选中那天：整体曝光 → 蓝 V 曝光 → 计入奖励；下方是近 7 天计入奖励。用统计框底色和进度分开，不用分隔线；框内居中 -->
        <div class="flex flex-col gap-3 p-3 rounded-control bg-sunken-bg">
          <div class="flex flex-col gap-1">
            <p class="text-xs text-center text-muted-text" :title="t('rewards.dateInUtc')">{{ longDay(selectedRow.date) }}</p>
            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col items-center">
                <span class="text-xs text-secondary-text">{{ t('rewards.total') }}</span>
                <span class="text-base font-semibold tabular-nums text-text">{{ conversion.total }}</span>
              </div>

              <HintTooltip :disabled="!conversion.verifiedOfTotal">
                <div
                  tabindex="0"
                  class="flex flex-col items-center w-fit mx-auto rounded-control cursor-help outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                >
                  <span class="text-xs text-secondary-text underline decoration-dotted underline-offset-2">{{ t('rewards.verified') }}</span>
                  <span class="text-base font-semibold tabular-nums text-text">{{ conversion.verified }}</span>
                </div>
                <template #content>
                  <p>{{ t('rewards.shareOfTotal') }} <span class="font-semibold tabular-nums">{{ conversion.verifiedOfTotal }}</span></p>
                </template>
              </HintTooltip>

              <HintTooltip>
                <div
                  tabindex="0"
                  class="flex flex-col items-center w-fit mx-auto rounded-control cursor-help outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                >
                  <span class="text-xs text-secondary-text underline decoration-dotted underline-offset-2">{{ t('rewards.counted') }}</span>
                  <span
                    class="text-base font-semibold tabular-nums"
                    :class="selectedRow.counted === null ? 'text-muted-text' : 'text-text'"
                  >{{ conversion.counted }}</span>
                </div>
                <template #content>
                  <p v-if="conversion.countedOfTotal">{{ t('rewards.shareOfTotal') }} <span class="font-semibold tabular-nums">{{ conversion.countedOfTotal }}</span></p>
                  <p v-if="conversion.countedOfVerified">{{ t('rewards.shareOfVerified') }} <span class="font-semibold tabular-nums">{{ conversion.countedOfVerified }}</span></p>
                  <p class="text-tooltip-muted">{{ t('rewards.countedHint') }}</p>
                </template>
              </HintTooltip>
            </div>
            <!-- 账号分析出前一天的数比奖励计划晚，没出时说明一下，后台会补取 -->
            <p v-if="selectedRow.total === null" class="text-xs text-center text-muted-text">{{ t('rewards.analyticsPending') }}</p>
          </div>

          <!-- 近 7 天计入奖励，点柱子切换上面的日期；没有数据时不显示 -->
          <div v-if="hasCounted" class="flex flex-col gap-1">
            <div class="flex h-8 border-b border-border" role="group" :aria-label="t('rewards.last7')">
              <button
                v-for="row in rows"
                :key="row.date"
                type="button"
                :aria-pressed="row.date === selectedRow.date"
                :aria-label="t('rewards.bar', { date: longDay(row.date), count: formatCount(row.counted) })"
                :title="t('rewards.bar', { date: longDay(row.date), count: formatCount(row.counted) })"
                class="flex-1 flex items-end justify-center rounded-t-control cursor-pointer hover:bg-card-bg outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                @click="pickedDate = row.date"
              >
                <span
                  v-if="barHeight(row) > 0"
                  class="w-full max-w-6 rounded-t"
                  :class="row.date === selectedRow.date ? 'bg-accent' : 'bg-chart-muted'"
                  :style="{ height: `${barHeight(row)}px` }"
                ></span>
              </button>
            </div>
            <div class="flex justify-between text-xs tabular-nums text-muted-text">
              <span>{{ shortDay(rows[0].date) }}</span>
              <span>{{ t('rewards.perDay') }}</span>
              <span>{{ shortDay(rows[rows.length - 1].date) }}</span>
            </div>
          </div>
          <p v-else class="text-xs text-center text-muted-text">{{ t('rewards.needTwoDays') }}</p>
        </div>
      </template>

      <!-- 无数据 -->
      <div v-else class="flex flex-col items-center justify-center py-1 text-center">
        <p class="text-xs text-secondary-text mb-3">{{ t('rewards.noData') }}</p>
        <button
          type="button"
          :disabled="loading"
          @click="refreshData"
          class="inline-flex items-center gap-2 h-8 px-4 text-xs font-semibold rounded-control bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          {{ loading ? t('rewards.fetching') : t('rewards.fetch') }}
        </button>
      </div>

      <p v-if="errorMsg" class="text-xs text-danger pt-3 border-t border-border">
        {{ errorMsg }}
      </p>
      <p v-if="impressionsError" class="text-xs text-danger">
        {{ impressionsError }}
      </p>
    </template>
  </FeatureCard>
</template>

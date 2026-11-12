<!--
Refactoring UI §2.1 / §2.4 / §3.6：先分层，再着色。
主要：计入奖励的时段合计与上期比较。次要：每日分布、两个曝光合计。
辅助：当前 90 天门槛、数据覆盖和更新状态。唯一主要操作：导出图片。
沿用 theme.css 的文字/强调/状态色、12/14/16/20/24/48 字号与 4/8/12/16/24/32 间距。
月份仍一屏显示；数值与短条共同表达大小，缺失不编码成零。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { KeyCreatorRewardsHistory, KeyCreatorRewardsStats, KeyImpressionsDaily } from '../../storage-keys'
import { parseImpressionsCache, parseRewardsHistory, shiftDateKey, type RewardsHistory, type ImpressionsDailyCache } from '../../shared/creator-rewards-daily'
import { formatImpressionsCount, type CreatorRewardsStats } from '../../shared/creator-rewards'
import { calendarCells, dailyEmphasis, observedMetric, chartBuckets, chartGeometry, clipRange, comparisonPercent, dashboardBounds, periodRange, rangeRows, summarizeMetric, type RewardsMetric, type RewardsPeriod } from '../../shared/creator-rewards-dashboard'
import { exportRewardsImage } from '../../shared/creator-rewards-export'
import { errorText } from '../../shared/errors'
import { useI18n } from '../popup/composables/useI18n'
import LanguageMenu from '../popup/components/ui/LanguageMenu.vue'

const { t, locale } = useI18n()
const period = ref<RewardsPeriod>('week')
const offset = ref(0)
const now = ref(Date.now())
const bounds = computed(() => dashboardBounds(now.value))
const start = ref(shiftDateKey(bounds.value.end, -6))
const end = ref(bounds.value.end)
const metric = ref<RewardsMetric>('counted')
const weekly = ref(true)
const history = ref<RewardsHistory>({})
const impressions = ref<ImpressionsDailyCache | null>(null)
const stats = ref<CreatorRewardsStats | null>(null)
const loading = ref(false)
const ready = ref(false)
const error = ref('')
const exporting = ref(false)
const signature = ref('')
const shareDialog = ref<HTMLDialogElement | null>(null)
const picked = ref<string | null>(null)
const periods = ['week', 'month', '90', 'custom'] as const
const metrics = ['counted', 'total', 'verified'] as const
const supportingMetrics = ['total', 'verified'] as const
const names = computed(() => ({ total: t('rewards.total'), verified: t('rewards.verified'), counted: t('rewardsDashboard.net') }))
const rawRange = computed(() => period.value === 'custom' ? { start: start.value, end: end.value } : periodRange(period.value, offset.value, bounds.value))
const range = computed(() => {
  if (period.value === 'custom' && (start.value < bounds.value.start || end.value > bounds.value.end)) return null
  return clipRange(rawRange.value, bounds.value)
})
// 本周始终展示周一到周日；range 只负责已经结束的统计日。
const displayRange = computed(() => period.value === 'week' ? rawRange.value : range.value)
const rangeLabel = computed(() => displayRange.value ? `${displayRange.value.start} — ${displayRange.value.end}` : '—')
const clipped = computed(() => range.value && (range.value.start !== rawRange.value.start || range.value.end !== rawRange.value.end))
const rows = computed(() => range.value ? rangeRows(history.value, impressions.value?.days ?? {}, range.value) : [])
const summary = computed(() => Object.fromEntries(metrics.map(key => [key, observedMetric(rows.value, key)])) as Record<RewardsMetric, ReturnType<typeof observedMetric>>)
const hasAny = computed(() => metrics.some(key => summary.value[key].recorded > 0))
const buckets = computed(() => chartBuckets(rows.value, metric.value, period.value === '90' && weekly.value))
const showCalendar = computed(() => period.value === 'week' || (period.value !== '90' && rows.value.length > 0 && rows.value.length <= 31))
const calendar = computed(() => calendarCells(rows.value, period.value === 'week' || period.value === 'month' ? rawRange.value : undefined))
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`2026-11-${String(2 + i).padStart(2, '0')}T00:00:00Z`))))
function dayValue(value: number | null) { return `${metric.value === 'counted' && value !== null && value > 0 ? '+' : ''}${format(value)}` }
function calendarDate(date: string) { return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` }
const emphasis = computed(() => dailyEmphasis(rows.value, metric.value))
const geometry = computed(() => chartGeometry(buckets.value))
const selected = computed(() => buckets.value.find(b => b.start === picked.value) ?? buckets.value.at(-1))
const previous = computed(() => {
  if (!range.value || clipped.value || (period.value !== 'week' && period.value !== 'month')) return null
  const raw = periodRange(period.value, offset.value - 1, bounds.value)
  const valid = clipRange(raw, bounds.value)
  if (!valid || valid.start !== raw.start || valid.end !== raw.end) return null
  return rangeRows(history.value, impressions.value?.days ?? {}, valid)
})
const comparisons = computed(() => Object.fromEntries(metrics.map(key => [key, comparisonPercent(summary.value[key].value, previous.value ? summarizeMetric(previous.value, key).value : null)])) as Record<RewardsMetric, number | null>)
const updated = computed(() => {
  const time = Math.max(stats.value?.updatedAt ?? 0, impressions.value?.updatedAt ?? 0)
  return time ? new Intl.DateTimeFormat(locale.value, { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time) : ''
})
const progress = computed(() => stats.value ? Math.min(100, Math.max(0, stats.value.impressionsCount / stats.value.targetImpressionsCount * 100)) : 0)
function format(value: number | null) {
  return value === null ? '—' : `${value < 0 ? '−' : ''}${formatImpressionsCount(Math.abs(value))}`
}
function coverage(known: number, days: number) { return t('rewardsDashboard.coverage', { known, days }) }
function summaryNote(key: RewardsMetric) {
  const item = summary.value[key]
  if (!item.recorded) return t('rewardsDashboard.noRecords')
  return item.recorded < item.days ? t('rewardsDashboard.observedTotal', { known: item.recorded, days: item.days }) : ''
}
function changeText(value: number) {
  return t(value < 0 ? 'rewardsDashboard.decreased' : value > 0 ? 'rewardsDashboard.increased' : 'rewardsDashboard.unchanged', { value: Math.abs(value).toFixed(1) })
}
function canMove(direction: number) {
  if (period.value !== 'week' && period.value !== 'month') return false
  const nextOffset = offset.value + direction
  return nextOffset <= 0 && ((period.value === 'week' && nextOffset === 0) || clipRange(periodRange(period.value, nextOffset, bounds.value), bounds.value) !== null)
}
function choosePeriod(value: RewardsPeriod) { period.value = value; offset.value = 0; picked.value = null }
watch([range, metric, weekly], () => { picked.value = null })
watch(locale, () => { document.title = `${t('rewardsDashboard.dashboardTitle')} · oh-my-x` }, { immediate: true })

async function readData() {
  const data = await browser.storage.local.get([KeyCreatorRewardsHistory, KeyCreatorRewardsStats, KeyImpressionsDaily])
  history.value = parseRewardsHistory(data[KeyCreatorRewardsHistory])
  impressions.value = parseImpressionsCache(data[KeyImpressionsDaily])
  try {
    const raw = data[KeyCreatorRewardsStats]
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    stats.value = value && Number.isFinite(value.impressionsCount) && value.targetImpressionsCount > 0 ? value : null
  } catch { stats.value = null }
}
async function refresh() {
  if (loading.value) return
  loading.value = true; error.value = ''; now.value = Date.now()
  try {
    const response = await browser.runtime.sendMessage({ type: 'XF_FETCH_CREATOR_REWARDS', history: true })
    await readData()
    error.value = [errorText(response?.error), errorText(response?.impressionsError)].filter(Boolean).join(' · ')
    if (!response?.ok && !error.value) error.value = t('rewards.fetchFailed')
  } catch { error.value = t('rewards.requestFailed') }
  finally { loading.value = false }
}
async function download() {
  if (exporting.value || !hasAny.value || !displayRange.value) return
  exporting.value = true; error.value = ''
  try {
    // 点击时固定快照，导出过程中切换日期不会混入另一个时段。
    await exportRewardsImage({
      title: t('rewardsDashboard.dashboardTitle'), signature: signature.value.trim(), range: rangeLabel.value,
      metrics: metrics.map(key => ({ label: names.value[key], value: format(summary.value[key].observedValue), coverage: summaryNote(key), comparison: comparisons.value[key] === null ? '' : changeText(comparisons.value[key]!) })),
      chartTitle: `${names.value[metric.value]} · ${t(period.value === '90' && weekly.value ? 'rewardsDashboard.weekly' : 'rewardsDashboard.daily')}`,
      buckets: buckets.value.map(b => ({ ...b })),
      calendar: showCalendar.value ? { weekdays: [...weekdays.value], cells: calendar.value.map(cell => cell ? { date: cell.date, value: cell.row?.[metric.value] ?? null, active: cell.row !== null, ...emphasis.value[cell.date] } : null), signed: metric.value === 'counted', peakLabel: t('rewardsDashboard.peak') } : undefined,
      notes: [t('rewardsDashboard.sourceNote'), t('rewardsDashboard.netNote'), t('rewardsDashboard.missingNote'), t('rewardsDashboard.sourceShort')],
      filename: `oh-my-x-rewards-${displayRange.value.start}-${displayRange.value.end}.png`, format,
    })
    shareDialog.value?.close()
  } catch { error.value = t('rewardsDashboard.exportFailed') }
  finally { exporting.value = false }
}
function storageChanged(changes: Record<string, unknown>, area: string) {
  if (area === 'local' && [KeyCreatorRewardsHistory, KeyCreatorRewardsStats, KeyImpressionsDaily].some(key => key in changes)) {
    void readData().catch(() => { error.value = t('rewards.requestFailed') })
  }
}
onMounted(async () => {
  browser.storage.onChanged.addListener(storageChanged)
  try { await readData() } catch { error.value = t('rewards.requestFailed') }
  finally { ready.value = true }
  // 进入看板时一次补取，后续切换时段只读本地数据。
  if (!impressions.value || Date.now() - impressions.value.updatedAt > 3600000 || !impressions.value.days[bounds.value.start]) void refresh()
})
onBeforeUnmount(() => browser.storage.onChanged.removeListener(storageChanged))
</script>

<template>
  <div class="app-glow rewards-page">
    <main class="rewards-shell">
      <header class="page-header">
        <div class="heading-title"><a class="brand" href="options.html#insight" :title="t('rewardsDashboard.back')"><img src="/icons/32.png" alt="" />oh-my-x</a><h1>{{ t('rewardsDashboard.dashboardTitle') }}</h1></div>
        <div class="current-progress">
          <span>{{ t('rewardsDashboard.currentProgress') }}</span>
          <template v-if="stats"><strong>{{ format(stats.impressionsCount) }} <small>/ {{ format(stats.targetImpressionsCount) }}</small></strong><progress :value="progress" max="100" :aria-label="t('rewards.progressLabel')" /></template>
          <strong v-else>{{ t('rewardsDashboard.noStats') }}</strong>
        </div>
        <div class="page-actions"><button class="export-open export-button" type="button" :disabled="!hasAny || !range" @click="shareDialog?.showModal()">{{ t('rewardsDashboard.export') }} ↓</button><LanguageMenu /></div>
      </header>
      <section class="dashboard" :aria-label="t('rewardsDashboard.history')">
        <div class="toolbar">
          <div class="segments" :aria-label="t('rewardsDashboard.periodSummary')">
            <button v-for="p in periods" :key="p" type="button" :aria-pressed="period === p" @click="choosePeriod(p)">{{ t(p === '90' ? 'rewardsDashboard.ninety' : p === 'week' ? 'rewardsDashboard.week' : p === 'month' ? 'rewardsDashboard.month' : 'rewardsDashboard.custom') }}</button>
          </div>
          <div class="range-row">
            <div class="range-navigation">
              <button v-if="period === 'week' || period === 'month'" class="arrow" type="button" :disabled="!canMove(-1)" :aria-label="t('rewardsDashboard.previous')" @click="offset--">←</button>
              <h2>{{ rangeLabel }}</h2>
              <button v-if="period === 'week' || period === 'month'" class="arrow" type="button" :disabled="!canMove(1)" :aria-label="t('rewardsDashboard.next')" @click="offset++">→</button>
            </div>
            <button v-if="offset < 0" class="plain-button latest-button" type="button" @click="offset = 0">{{ t('rewardsDashboard.latest') }}</button>
          </div>
          <button class="plain-button refresh-button" type="button" :disabled="loading" @click="refresh">{{ loading ? t('rewards.fetching') : t('rewardsDashboard.refreshHistory') }}</button>
        </div>
        <div v-if="period === 'custom'" class="date-inputs">
          <label>{{ t('rewardsDashboard.start') }}<input v-model="start" type="date" :min="bounds.start" :max="bounds.end" /></label>
          <label>{{ t('rewardsDashboard.end') }}<input v-model="end" type="date" :min="bounds.start" :max="bounds.end" /></label>
        </div>
        <p v-if="clipped" class="notice">{{ t('rewardsDashboard.partial') }}</p>
        <p v-if="!displayRange" class="error" role="alert">{{ t('rewardsDashboard.rangeError') }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="!ready" class="empty-state" role="status">{{ t('rewardsDashboard.loading') }}</p>
        <template v-else-if="displayRange">
          <!-- §2.1：奖励合计为主，曝光合计为辅；标签与数字相邻（§3.6）。 -->
          <div class="metric-grid">
            <div class="reward-summary" :title="t('rewardsDashboard.netNote')">
              <span class="metric-label">{{ names.counted }} <span class="info-mark" aria-hidden="true">ⓘ</span></span>
              <div class="reward-value-line"><strong class="reward-value">{{ format(summary.counted.observedValue) }}</strong>
                <span v-if="comparisons.counted !== null" class="comparison reward-comparison" :class="{ decline: comparisons.counted < 0 }">{{ changeText(comparisons.counted) }}</span>
              </div>
              <span v-if="summaryNote('counted')" class="coverage partial-coverage">{{ summaryNote('counted') }}</span>
            </div>
            <div class="supporting-metrics">
              <div v-for="key in supportingMetrics" :key="key" class="supporting-metric">
                <span class="metric-label">{{ names[key] }}</span>
                <strong>{{ format(summary[key].observedValue) }}</strong>
                <span v-if="comparisons[key] !== null" class="comparison">{{ changeText(comparisons[key]!) }}</span>
                <span v-if="summaryNote(key)" class="coverage partial-coverage">{{ summaryNote(key) }}</span>
              </div>
            </div>
          </div>
          <p v-if="!hasAny" class="empty-state">{{ t('rewardsDashboard.noHistory') }}</p>
          <section class="chart-panel" :aria-label="t('rewardsDashboard.trend')">
            <div class="chart-top">
              <div class="chart-heading">
                <div class="metric-tabs" :aria-label="t('rewardsDashboard.selectMetric')">
                  <button v-for="key in metrics" :key="key" type="button" :aria-pressed="metric === key" @click="metric = key" :title="key === 'counted' ? t('rewardsDashboard.netNote') : undefined">{{ names[key] }}</button>
                </div>
                <div v-if="period === '90'" class="segments small"><button type="button" :aria-pressed="weekly" @click="weekly = true">{{ t('rewardsDashboard.weekly') }}</button><button type="button" :aria-pressed="!weekly" @click="weekly = false">{{ t('rewardsDashboard.daily') }}</button></div>
              </div>
              <div v-if="picked && selected" class="chart-readout" aria-live="polite"><span>{{ selected.start }}<template v-if="selected.end !== selected.start"> — {{ selected.end }}</template></span><strong>{{ dayValue(selected.value) }}</strong><span v-if="selected.recorded < selected.days">{{ coverage(selected.recorded, selected.days) }}</span></div>
              <span v-else-if="showCalendar" class="calendar-legend">{{ t('rewardsDashboard.magnitude') }} <i></i><i></i><i></i></span>
            </div>
            <div v-if="showCalendar" class="calendar" :class="{ 'week-calendar': calendar.length <= 7 }" :aria-label="t('rewardsDashboard.calendar')">
              <div class="calendar-weekdays"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
              <div class="calendar-grid">
                <template v-for="(cell, i) in calendar" :key="cell?.date ?? i">
                  <button v-if="cell" type="button" class="calendar-day" :class="{ unavailable: !cell.row, missing: cell.row && cell.row[metric] === null, negative: cell.row && (cell.row[metric] ?? 0) < 0, high: emphasis[cell.date]?.high, peak: emphasis[cell.date]?.peak }" :disabled="!cell.row" :aria-pressed="picked === cell.date" :aria-label="`${cell.date}: ${cell.row ? dayValue(cell.row[metric]) : t('rewardsDashboard.outsideRange')}${emphasis[cell.date]?.peak ? ` · ${t('rewardsDashboard.peak')}` : ''}`" @click="picked = cell.date" @focus="picked = cell.date">
                    <span class="calendar-date">{{ calendarDate(cell.date) }} <em v-if="emphasis[cell.date]?.peak" class="peak-marker">{{ t('rewardsDashboard.peak') }}</em></span>
                    <strong v-if="cell.row">{{ dayValue(cell.row[metric]) }}</strong>
                    <span v-if="cell.row && cell.row[metric] !== null" class="day-bar" aria-hidden="true"><i :style="{ width: `${emphasis[cell.date]?.percent ?? 0}%` }"></i></span>
                  </button>
                  <div v-else class="calendar-blank" aria-hidden="true"></div>
                </template>
              </div>
            </div>
            <template v-else>
            <div class="chart-scroll">
              <div class="chart-area" :class="{ dense: buckets.length > 35 }">
                <div class="scale-labels"><span>{{ format(geometry.max) }}</span><span>{{ format(geometry.min) }}</span></div>
                <svg viewBox="0 0 920 230" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" :y1="geometry.zero" x2="920" :y2="geometry.zero" class="zero-line" />
                  <g v-for="(bucket, i) in buckets" :key="bucket.start">
                    <rect v-if="bucket.value !== null" v-bind="geometry.bars[i]" rx="3" :class="[bucket.value < 0 ? 'negative-bar' : 'bar', { picked: picked === bucket.start }]" />
                    <text v-else :x="geometry.bars[i].x + geometry.bars[i].width / 2" :y="geometry.zero - 8" text-anchor="middle" class="missing-mark">·</text>
                  </g>
                </svg>
                <div class="chart-targets" :style="{ gridTemplateColumns: `repeat(${buckets.length}, 1fr)` }">
                  <button v-for="bucket in buckets" :key="bucket.start" type="button" :aria-pressed="picked === bucket.start" :aria-label="`${bucket.start}${bucket.end !== bucket.start ? ` — ${bucket.end}` : ''}: ${format(bucket.value)}, ${coverage(bucket.recorded, bucket.days)}`" @click="picked = bucket.start" @focus="picked = bucket.start" @mouseenter="picked = bucket.start" />
                </div>
              </div>
            </div>
            <div class="chart-axis"><span>{{ displayRange.start }}</span><span>{{ t('rewardsDashboard.selectDay') }}</span><span>{{ displayRange.end }}</span></div>
            </template>
            <p v-if="summary[metric].recorded === 0" class="notice">{{ t('rewardsDashboard.emptyMetric') }}</p>
          </section>
          <div class="dashboard-footer"><details class="daily-records"><summary>{{ t('rewardsDashboard.detail') }}</summary><div class="table-scroll"><table><thead><tr><th>{{ t('rewardsDashboard.date') }}</th><th v-for="key in metrics" :key="key">{{ names[key] }}</th></tr></thead><tbody><tr v-for="row in rows" :key="row.date"><th scope="row">{{ row.date }}</th><td v-for="key in metrics" :key="key">{{ row[key] === null ? '—' : row[key]!.toLocaleString(locale) }}</td></tr></tbody></table></div></details>
            <details class="dashboard-notes"><summary>{{ t('rewardsDashboard.notes') }}</summary><div><p>{{ t('rewardsDashboard.sourceNote') }}</p><p>{{ t('rewardsDashboard.netNote') }}</p><p>{{ t('rewardsDashboard.missingNote') }}</p></div></details>
            <span v-if="updated" class="updated">{{ t('rewardsDashboard.updated', { time: updated }) }}</span>
          </div>
        </template>
      </section>
      <dialog ref="shareDialog" class="share-dialog" aria-labelledby="share-title">
        <form class="share-row" @submit.prevent="download">
          <div class="dialog-heading"><h3 id="share-title">{{ t('rewardsDashboard.export') }}</h3><button type="button" class="plain-button" :aria-label="t('common.cancel')" @click="shareDialog?.close()">×</button></div>
          <p>{{ rangeLabel }}</p>
          <label>{{ t('rewardsDashboard.signature') }}<input v-model="signature" type="text" maxlength="60" :placeholder="t('rewardsDashboard.signaturePlaceholder')" /></label>
          <div class="export-actions"><button class="export-button export-save" type="submit" :disabled="!hasAny || !range || exporting">{{ exporting ? t('rewardsDashboard.exporting') : t('rewardsDashboard.export') }} ↓</button><p>{{ t('rewardsDashboard.exportNote') }}</p></div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
        </form>
      </dialog>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../entrypoints/popup/composables/useI18n'
import type { CreatorRewardsPageState } from '../creator-rewards'
import type { RewardsPayoutLedger } from '../creator-rewards-payouts'

const props = defineProps<{
  payout: Extract<CreatorRewardsPageState, { stage: 'active' }>
  ledger?: RewardsPayoutLedger
  compact?: boolean
}>()
const { t, locale } = useI18n()
const records = computed(() => props.compact ? props.ledger?.records.slice(0, 3) : props.ledger?.records)
const payoutDate = computed(() => {
  if (!props.payout.nextPayoutDate) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(`${props.payout.nextPayoutDate}T00:00:00Z`))
})
const recordedTime = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }))
const currency = computed(() => new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', signDisplay: 'always' }))
</script>

<template>
  <!-- 主信息是实发累计和下次日期，其次是变动金额列表，日期与来源为辅助。
       紧凑模式与历史页共用语义色、12/14/20 字号和现有间距。 -->
  <div class="rewards-payout flex flex-col gap-4">
    <dl class="grid grid-cols-2 gap-3">
      <div class="min-w-0">
        <dt class="text-xs text-secondary-text">{{ t('rewards.paidAmount') }}</dt>
        <dd class="mt-1 text-xl font-semibold tabular-nums break-words">{{ payout.paidAmount ?? '—' }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs text-secondary-text">{{ t('rewards.nextPayoutDate') }}</dt>
        <dd class="mt-1 text-sm font-semibold tabular-nums">
          <time v-if="payout.nextPayoutDate" :datetime="payout.nextPayoutDate">{{ payoutDate }}</time>
          <span v-else>—</span>
        </dd>
      </div>
    </dl>
    <div class="flex flex-col gap-2">
      <p class="text-sm font-semibold">{{ t(compact ? 'rewards.payoutRecent' : 'rewards.payoutChanges') }}</p>
      <ul v-if="records?.length" class="divide-y divide-border">
        <li v-for="record in records" :key="record.observedAt" class="flex items-baseline justify-between gap-3 py-2">
          <time class="min-w-0 text-xs text-secondary-text"
            :datetime="new Date(record.observedAt).toISOString()"
            :title="t('rewards.payoutObservedRange', { from: recordedTime.format(record.fromAt), to: recordedTime.format(record.observedAt) })"
          >{{ recordedTime.format(record.observedAt) }}</time>
          <span class="shrink-0 text-sm font-semibold tabular-nums">{{ currency.format(record.changeCents / 100) }}</span>
        </li>
      </ul>
      <p v-else class="text-xs leading-relaxed text-secondary-text">{{ t(ledger ? 'rewards.payoutEmpty' : 'rewards.payoutAwaitingBaseline') }}</p>
      <p v-if="records?.length" class="text-xs leading-relaxed text-secondary-text">{{ t('rewards.payoutSource') }}</p>
    </div>
  </div>
</template>

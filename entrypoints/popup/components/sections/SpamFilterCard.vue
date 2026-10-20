<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  KeySpamFilterEnabled,
  KeySpamThreshold,
  KeySpamRulesEnabled,
  KeySpamKeywordList,
  KeySpamStats,
} from '../../../../storage-keys'
import { SPAM_RULES, spamCategoryLabel } from '../../../../shared/spam-types'
import type { SpamCategory } from '../../../../shared/spam-types'
import { parseEnabledRules, parseKeywordList } from '../../../../shared/spam-rules'
import { getTodayStats } from '../../../../shared/spam-logger'
import { useStorageKey } from '../../composables/useStorageKey'
import { useI18n } from '../../composables/useI18n'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'

defineEmits<{ open: [] }>()

const { value: enabled, setValue: setEnabled } = useStorageKey(KeySpamFilterEnabled)
const { t, featureText, locale } = useI18n()

// 状态行只读展示；在详细设置页修改后，这里随存储变化更新
const snapshot = useStorageSnapshot([KeySpamThreshold, KeySpamRulesEnabled, KeySpamKeywordList, KeySpamStats])
const threshold = computed(() => Number(snapshot[KeySpamThreshold]) || 55)
const enabledRuleCount = computed(() => parseEnabledRules(String(snapshot[KeySpamRulesEnabled] ?? '')).size)
const keywordCount = computed(() => parseKeywordList(String(snapshot[KeySpamKeywordList] ?? '')).length)

const todayTotal = ref(0)
const todayByCategory = ref<Record<SpamCategory, number>>({
  porn_spam: 0,
  bot: 0,
  marketing: 0,
  low_quality: 0,
  normal: 0,
  ai: 0,
})
const order: SpamCategory[] = ['porn_spam', 'marketing', 'bot', 'low_quality', 'ai']
const categoryRows = computed(() =>
  order
    .map((c) => ({ category: c, label: spamCategoryLabel(c, locale.value), count: todayByCategory.value[c] || 0 }))
    .filter((r) => r.count > 0),
)

async function loadToday() {
  const today = await getTodayStats()
  todayTotal.value = today.total
  todayByCategory.value = today.byCategory
}

onMounted(loadToday)
// 弹窗打开期间页面继续拦截时，统计随之更新
watch(() => snapshot[KeySpamStats], () => void loadToday())
</script>

<template>
 <FeatureCard
  feature-id="spamFilter"
  :enabled="enabled"
  :details-label="t('spamFilter.settings')"
  details-as="page"
  @open-details="$emit('open')"
 >
  <template #control>
   <SwitchToggle :model-value="enabled" :label="featureText('spamFilter', 'label')" @update:model-value="setEnabled" />
  </template>

  <!-- 今日拦截 -->
  <div class="flex items-center justify-between gap-2 rounded-control bg-sunken-bg px-3 py-2">
   <p class="flex items-baseline gap-2 text-xs text-secondary-text whitespace-nowrap">
    {{ t('spamFilter.today') }} <span class="text-base font-semibold leading-none text-text">{{ todayTotal }}</span>
   </p>
   <div v-if="categoryRows.length" class="flex flex-wrap justify-end gap-1">
    <span
     v-for="row in categoryRows"
     :key="row.category"
     class="px-2 py-0.5 rounded-full bg-card-bg text-xs text-secondary-text"
    >{{ row.label }} {{ row.count }}</span>
   </div>
   <p v-else class="text-xs text-muted-text">{{ t('spamFilter.noneToday') }}</p>
  </div>

  <template #status>
   {{ t('spamFilter.status', { threshold, rules: enabledRuleCount, total: SPAM_RULES.length, words: keywordCount }) }}
  </template>
 </FeatureCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { KeyTweetFilterEnabled, KeyTweetFilterAction, KeyTweetFilterKeywords } from '../../../../storage-keys'
import { parseTweetFilterKeywords } from '../../../../shared/tweet-filter-rules'
import { useStorageKey } from '../../composables/useStorageKey'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import { useI18n } from '../../composables/useI18n'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'

defineEmits<{ open: [] }>()

const { t, featureText } = useI18n()
const { value: enabled, setValue: setEnabled } = useStorageKey(KeyTweetFilterEnabled)
const snapshot = useStorageSnapshot([KeyTweetFilterAction, KeyTweetFilterKeywords])
const actionText = computed(() => t(snapshot[KeyTweetFilterAction] === 'hide' ? 'tweetFilter.statusHide' : 'tweetFilter.statusCollapse'))
const keywordCount = computed(() => parseTweetFilterKeywords(String(snapshot[KeyTweetFilterKeywords] ?? '')).length)
</script>

<template>
 <FeatureCard
  feature-id="tweetFilter"
  :enabled="enabled"
  :details-label="t('tweetFilter.manage')"
  details-as="page"
  @open-details="$emit('open')"
 >
  <template #control>
   <SwitchToggle :model-value="enabled" :label="featureText('tweetFilter', 'label')" @update:model-value="setEnabled" />
  </template>

  <template #status>{{ t('tweetFilter.status', { action: actionText, count: keywordCount }) }}</template>
 </FeatureCard>
</template>

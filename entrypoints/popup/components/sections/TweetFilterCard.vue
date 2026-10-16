<script setup lang="ts">
import { computed } from 'vue'
import { KeyTweetFilterEnabled, KeyTweetFilterAction, KeyTweetFilterKeywords } from '../../../../storage-keys'
import { parseTweetFilterKeywords } from '../../../../shared/tweet-filter-rules'
import { useStorageKey } from '../../composables/useStorageKey'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'

defineEmits<{ open: [] }>()

const { value: enabled, setValue: setEnabled } = useStorageKey(KeyTweetFilterEnabled)
const snapshot = useStorageSnapshot([KeyTweetFilterAction, KeyTweetFilterKeywords])
const actionText = computed(() => (snapshot[KeyTweetFilterAction] === 'hide' ? '命中后隐藏' : '命中后折叠'))
const keywordCount = computed(() => parseTweetFilterKeywords(String(snapshot[KeyTweetFilterKeywords] ?? '')).length)
</script>

<template>
 <FeatureCard
  feature-id="tweetFilter"
  :enabled="enabled"
  details-label="管理屏蔽词"
  details-as="page"
  @open-details="$emit('open')"
 >
  <template #control>
   <SwitchToggle :model-value="enabled" label="正文关键词过滤" @update:model-value="setEnabled" />
  </template>

  <template #status>{{ actionText }} · 屏蔽词 {{ keywordCount }} 个</template>
 </FeatureCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { KeySpamWhitelist, KeySpamBlacklist } from '../../../../storage-keys'
import { parseHandleList } from '../../../../shared/spam-rules'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import FeatureCard from '../ui/FeatureCard.vue'

defineEmits<{ open: [] }>()

const snapshot = useStorageSnapshot([KeySpamWhitelist, KeySpamBlacklist])
const whitelistCount = computed(() => parseHandleList(String(snapshot[KeySpamWhitelist] ?? '')).length)
const blacklistCount = computed(() => parseHandleList(String(snapshot[KeySpamBlacklist] ?? '')).length)
</script>

<template>
 <FeatureCard
  feature-id="spamAccountLists"
  details-label="管理名单"
  details-as="page"
  @open-details="$emit('open')"
 >
  <template #status>
   白名单 {{ whitelistCount }} 个 · 黑名单 {{ blacklistCount }} 个
  </template>
 </FeatureCard>
</template>

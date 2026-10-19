<script setup lang="ts">
import { computed } from 'vue'
import { KeySpamWhitelist, KeySpamBlacklist } from '../../../../storage-keys'
import { parseHandleList } from '../../../../shared/spam-rules'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import { useI18n } from '../../composables/useI18n'
import FeatureCard from '../ui/FeatureCard.vue'

defineEmits<{ open: [] }>()

const { t } = useI18n()
const snapshot = useStorageSnapshot([KeySpamWhitelist, KeySpamBlacklist])
const whitelistCount = computed(() => parseHandleList(String(snapshot[KeySpamWhitelist] ?? '')).length)
const blacklistCount = computed(() => parseHandleList(String(snapshot[KeySpamBlacklist] ?? '')).length)
</script>

<template>
 <FeatureCard
  feature-id="spamAccountLists"
  :details-label="t('accountLists.manage')"
  details-as="page"
  @open-details="$emit('open')"
 >
  <template #status>
   {{ t('accountLists.status', { allow: whitelistCount, block: blacklistCount }) }}
  </template>
 </FeatureCard>
</template>

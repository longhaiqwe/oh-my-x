<script setup lang="ts">
import { KeyOwnPostAutoSync } from '../../../../storage-keys'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import SubRow from '../ui/SubRow.vue'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()
</script>

<template>
 <FeatureCard feature-id="ownPosts">
  <SubRow
   :title="t('ownPosts.autoSync')"
   :description="t('ownPosts.autoSyncDescription')"
  >
   <FeatureSwitch :storage-key="KeyOwnPostAutoSync" :label="t('ownPosts.autoSync')" />
  </SubRow>
 </FeatureCard>
</template>

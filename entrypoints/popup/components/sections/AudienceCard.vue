<script setup lang="ts">
import { KeyAudienceEnabled } from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
const { t } = useI18n()
defineEmits<{ open: [] }>()
</script>
<template>
  <FeatureCard
    feature-id="audience"
    :details-label="t('audience.details')"
    details-as="page"
    @open-details="$emit('open')"
    ><template #control
      ><FeatureSwitch
        :storage-key="KeyAudienceEnabled"
        :label="t('audience.record')" /></template
    ><template #status>{{ t('audience.local') }}</template></FeatureCard
  >
</template>

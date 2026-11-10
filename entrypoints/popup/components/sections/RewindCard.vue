<script setup lang="ts">
import { KeyRewindEnabled } from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import { useRewind } from '../../composables/useRewind'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
const { t } = useI18n()
const { status, enabled, error, busy, set, open } = useRewind()
defineEmits<{ open: [] }>()
</script>
<template>
  <FeatureCard
    feature-id="rewind"
    :details-label="t('rewind.details')"
    details-as="page"
    @open-details="$emit('open')"
  >
    <template #control
      ><div :inert="busy">
        <SwitchToggle
          :model-value="enabled"
          :label="t('rewind.record')"
          @update:model-value="(v) => set(KeyRewindEnabled, v)"
        /></div
    ></template>
    <template #status
      >{{ t(enabled ? 'rewind.local' : 'rewind.paused')
      }}<span v-if="status">
        · {{ t('rewind.count', { count: status.count }) }}</span
      ></template
    >
    <button
      type="button"
      class="self-start min-h-8 text-xs font-semibold text-accent-text rounded-control px-2 border border-border-strong outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      @click="open"
    >
      {{ t('rewind.open') }}
    </button>
    <p
      v-if="error"
      class="text-xs text-muted-text leading-normal"
      role="status"
    >
      {{ error }}
    </p>
  </FeatureCard>
</template>

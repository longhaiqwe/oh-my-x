<script setup lang="ts">
import type { FeatureModuleId } from '../../../../shared/feature-registry'
import { useI18n } from '../../composables/useI18n'

defineProps<{ moduleId: FeatureModuleId }>()
const { moduleText } = useI18n()
</script>

<template>
 <div class="flex flex-col gap-1 px-1">
  <h2 class="text-base font-semibold leading-tight text-text">{{ moduleText(moduleId, 'title') }}</h2>
  <p class="text-xs leading-normal text-secondary-text">{{ moduleText(moduleId, 'description') }}</p>
 </div>
</template>

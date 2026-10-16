<script setup lang="ts">
import { computed } from 'vue'
import { getModule, type FeatureModuleId } from '../../../../shared/feature-registry'

const props = defineProps<{ moduleId: FeatureModuleId }>()
const mod = computed(() => getModule(props.moduleId))
</script>

<template>
 <div class="px-1">
  <h2 class="text-base font-bold text-text">{{ mod.title }}</h2>
  <p class="text-xs text-secondary-text mt-0.5">{{ mod.description }}</p>
 </div>
</template>

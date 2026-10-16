<script setup lang="ts">
import { computed } from 'vue'
import { getModule, type FeatureModuleId } from '../../../../shared/feature-registry'

const props = defineProps<{ moduleId: FeatureModuleId }>()
const mod = computed(() => getModule(props.moduleId))
</script>

<template>
 <div class="flex flex-col gap-1 px-1">
  <h2 class="text-base font-semibold leading-tight text-text">{{ mod.title }}</h2>
  <p class="text-xs leading-normal text-secondary-text">{{ mod.description }}</p>
 </div>
</template>

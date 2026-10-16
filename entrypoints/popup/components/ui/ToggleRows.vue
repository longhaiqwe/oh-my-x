<script setup lang="ts">
import { getFeature } from '../../../../shared/feature-registry'
import type { ToggleRowItem } from '../../toggle-options'
import ToggleGroupControl from './ToggleGroupControl.vue'

defineProps<{ items: ToggleRowItem[] }>()
</script>

<template>
 <div class="flex flex-col gap-2.5 w-full">
  <div
   v-for="item in items"
   :key="item.storageKey"
   class="flex items-center justify-between w-full"
  >
   <span class="text-[12px] font-semibold text-color-text">{{ getFeature(item.featureId).label }}</span>
   <ToggleGroupControl :storage-key="item.storageKey" :options="item.options" />
  </div>
 </div>
</template>

<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

defineProps<{ modelValue: boolean; label?: string }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
 <SwitchRoot
  :model-value="modelValue"
  :aria-label="label"
  class="w-8 h-5 rounded-full relative flex items-center cursor-pointer shrink-0 transition-colors duration-150
   outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card-bg"
  :class="modelValue ? 'bg-accent' : 'bg-switch-off'"
  @update:model-value="(v) => $emit('update:modelValue', !!v)"
 >
  <SwitchThumb
   class="block w-4 h-4 rounded-full shadow-sm bg-switch-thumb transition-transform duration-150"
   :class="modelValue ? 'translate-x-3.5' : 'translate-x-0.5'"
  />
 </SwitchRoot>
</template>

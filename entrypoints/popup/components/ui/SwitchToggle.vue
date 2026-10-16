<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

defineProps<{ modelValue: boolean; label?: string }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
 <SwitchRoot
  :model-value="modelValue"
  :aria-label="label"
  class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
  :class="modelValue ? 'bg-accent' : 'bg-secondary-text/40'"
  @update:model-value="(v) => $emit('update:modelValue', !!v)"
 >
  <SwitchThumb
   class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
   :class="modelValue ? 'translate-x-[15px]' : 'translate-x-0.5'"
  />
 </SwitchRoot>
</template>

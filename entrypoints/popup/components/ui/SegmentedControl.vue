<script setup lang="ts">
import { ToggleGroupRoot, ToggleGroupItem } from 'reka-ui'
import type { ToggleOption } from '../../toggle-options'

defineProps<{ modelValue: string; options: ToggleOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// 单选组再次点击已选项会传出空值，此时保持原选择
function onUpdate(v: unknown) {
 if (typeof v === 'string' && v) emit('update:modelValue', v)
}
</script>

<template>
 <ToggleGroupRoot
  v-if="options.length"
  :model-value="modelValue"
  type="single"
  class="flex border border-secondary-text/30 rounded-lg overflow-hidden shrink-0"
  @update:model-value="onUpdate"
 >
  <ToggleGroupItem
   v-for="opt in options"
   :key="opt.value"
   :value="opt.value"
   class="flex-1 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-center transition-colors duration-150 outline-none
    data-[state=on]:bg-accent data-[state=on]:text-white
    data-[state=off]:text-gray-400 data-[state=off]:hover:text-text data-[state=off]:hover:bg-body-bg/50
    border-r border-secondary-text/30 last:border-r-0
    focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-inset cursor-pointer"
  >
   {{ opt.label }}
  </ToggleGroupItem>
 </ToggleGroupRoot>
</template>

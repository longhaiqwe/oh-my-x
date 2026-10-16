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
  class="flex p-0.5 gap-0.5 rounded-control bg-sunken-bg shrink-0"
  @update:model-value="onUpdate"
 >
  <ToggleGroupItem
   v-for="opt in options"
   :key="opt.value"
   :value="opt.value"
   class="flex-1 min-h-6 px-2 rounded-[calc(var(--radius-control)-2px)] text-xs font-semibold whitespace-nowrap text-center transition-colors duration-150 cursor-pointer
    data-[state=on]:bg-accent data-[state=on]:text-on-accent
    data-[state=off]:text-secondary-text data-[state=off]:hover:text-text data-[state=off]:hover:bg-card-bg
    outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
  >
   {{ opt.label }}
  </ToggleGroupItem>
 </ToggleGroupRoot>
</template>

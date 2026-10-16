<script setup lang="ts">
import { Toggle } from 'reka-ui'
import { useStorageKey } from '../../composables/useStorageKey'

const props = defineProps<{
 storageKey: string
 label: string
 iconHtml?: string
 viewBox?: string
}>()

const { value, setValue } = useStorageKey(props.storageKey)
</script>

<template>
 <div class="flex flex-col items-center gap-0.5 min-w-0">
  <Toggle
   :model-value="value"
   @update:model-value="setValue"
   :title="`${label}：${value ? '显示中，点击隐藏' : '已隐藏，点击显示'}`"
   :aria-label="`显示${label}`"
   class="bg-card-bg p-2 m-1 w-fit rounded-full border-2 border-accent cursor-pointer
    data-[state=off]:border-dashed data-[state=off]:border-secondary-text/60 data-[state=off]:opacity-50
    data-[state=off]:hover:opacity-80"
  >
   <svg
    v-if="iconHtml"
    width="22"
    height="22"
    aria-hidden="true"
    class="fill-current"
    :viewBox="viewBox ?? '0 0 24 24'"
    v-html="iconHtml"
   />
   <span v-else class="block w-[22px] h-[22px] rounded-full bg-secondary-text/20" aria-hidden="true" />
  </Toggle>
  <span
   class="w-full text-[11px] text-center tracking-tight truncate"
   :class="value ? 'text-text' : 'text-secondary-text'"
  >
   {{ label }}
  </span>
 </div>
</template>

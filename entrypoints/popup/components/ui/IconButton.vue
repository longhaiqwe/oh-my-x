<script setup lang="ts">
import { Toggle } from 'reka-ui'
import { useStorageKey } from '../../composables/useStorageKey'
import { useI18n } from '../../composables/useI18n'

const props = defineProps<{
 storageKey: string
 label: string
 iconHtml?: string
 viewBox?: string
}>()

const { value, setValue } = useStorageKey(props.storageKey)
const { t } = useI18n()
</script>

<template>
 <div class="flex flex-col items-center gap-1 min-w-0">
  <Toggle
   :model-value="value"
   @update:model-value="setValue"
   :title="t(value ? 'navItem.shownTitle' : 'navItem.hiddenTitle', { label })"
   :aria-label="t('navItem.toggleLabel', { label })"
   class="p-2 m-1 w-fit rounded-full border-2 cursor-pointer transition-colors duration-150
    outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card-bg
    data-[state=on]:border-accent data-[state=on]:bg-accent-subtle data-[state=on]:text-accent-subtle-text
    data-[state=off]:border-dashed data-[state=off]:border-border-strong data-[state=off]:text-muted-text
    data-[state=off]:hover:border-accent data-[state=off]:hover:text-secondary-text"
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
   <span v-else class="block w-5.5 h-5.5 rounded-full bg-border" aria-hidden="true" />
  </Toggle>
  <span
   class="w-full text-xs text-center tracking-tight truncate"
   :class="value ? 'text-text' : 'text-muted-text'"
  >
   {{ label }}
  </span>
 </div>
</template>

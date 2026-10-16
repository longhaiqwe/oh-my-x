<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ToggleGroupRoot, ToggleGroupItem } from 'reka-ui'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { defaultPreferences } from '../../../../storage-keys'

const props = defineProps<{
 options: { value: string; label: string }[]
 storageKey: string
 defaultValue?: string
}>()

const model = ref(
  props.defaultValue ||
  (props.storageKey in defaultPreferences ? String(defaultPreferences[props.storageKey]) : props.options[0]?.value) ||
  ''
)

onMounted(async () => {
 const stored = await getStorage(props.storageKey)
 if (stored !== undefined && stored !== '') {
  model.value = String(stored)
 } else if (props.storageKey in defaultPreferences) {
  model.value = String(defaultPreferences[props.storageKey])
 }
})

watch(model, async (newVal, oldVal) => {
 if (!newVal) {
  if (oldVal) {
   model.value = oldVal
  }
  return
 }
 await setStorage({ [props.storageKey]: newVal })
})
</script>

<template>
 <ToggleGroupRoot
  v-if="options.length"
  v-model="model"
  type="single"
  class="flex border border-secondary-text/30 rounded-lg overflow-hidden shrink-0"
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

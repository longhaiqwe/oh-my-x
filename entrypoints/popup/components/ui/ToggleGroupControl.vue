<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { defaultPreferences } from '../../../../storage-keys'
import type { ToggleOption } from '../../toggle-options'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps<{
 options: ToggleOption[]
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

async function onChange(value: string) {
 model.value = value
 await setStorage({ [props.storageKey]: value })
}
</script>

<template>
 <SegmentedControl :model-value="model" :options="options" @update:model-value="onChange" />
</template>

<script setup lang="ts">
import { useStorageKey } from '../../composables/useStorageKey'
import SwitchToggle from './SwitchToggle.vue'

const props = defineProps<{
 storageKey: string
 /** 存储值与开关含义相反（存 'on' 表示关闭该显示） */
 invert?: boolean
 label?: string
}>()

const { value, setValue } = useStorageKey(props.storageKey, { invert: props.invert })
</script>

<template>
 <SwitchToggle :model-value="value" :label="label" @update:model-value="setValue" />
</template>

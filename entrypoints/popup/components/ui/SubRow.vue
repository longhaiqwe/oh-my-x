<script setup lang="ts">
import { computed } from 'vue'
import { getFeature } from '../../../../shared/feature-registry'
import WhereLine from './WhereLine.vue'

// 从属设置：缩进挂在主功能下面
const props = defineProps<{
 featureId?: string
 title?: string
 description?: string
 where?: string
}>()

const feature = computed(() => (props.featureId ? getFeature(props.featureId) : undefined))
const title = computed(() => props.title ?? feature.value?.label ?? '')
const description = computed(() => props.description ?? feature.value?.description ?? '')
const where = computed(() => props.where ?? feature.value?.where)
</script>

<template>
 <div class="flex items-center justify-between gap-3 pl-3 border-l-2 border-border">
  <div class="min-w-0 flex flex-col gap-0.5">
   <p class="text-[12px] font-medium text-text">{{ title }}</p>
   <p v-if="description" class="text-[10px] leading-relaxed text-secondary-text">{{ description }}</p>
   <WhereLine v-if="where" :where="where" />
  </div>
  <div class="shrink-0">
   <slot />
  </div>
 </div>
</template>

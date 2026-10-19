<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import WhereLine from './WhereLine.vue'

// 从属设置：缩进挂在主功能下面。名称与主功能同为 14px，用常规字重区分层级
// 文字至少占 160px：控件较宽（如英文的分段选择）放不下时，控件换到文字下面一行
const props = defineProps<{
 featureId?: string
 title?: string
 description?: string
 where?: string
}>()

const { featureText } = useI18n()
const title = computed(() => props.title ?? (props.featureId ? featureText(props.featureId, 'label') : undefined) ?? '')
const description = computed(() => props.description ?? (props.featureId ? featureText(props.featureId, 'description') : undefined) ?? '')
const where = computed(() => props.where ?? (props.featureId ? featureText(props.featureId, 'where') : undefined))
</script>

<template>
 <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-3 border-l-2 border-border">
  <div class="grow basis-40 min-w-0 flex flex-col gap-1">
   <p class="text-sm leading-tight text-text">{{ title }}</p>
   <p v-if="description" class="text-xs leading-normal text-muted-text">{{ description }}</p>
   <WhereLine v-if="where" :where="where" />
  </div>
  <div class="shrink-0">
   <slot />
  </div>
 </div>
</template>

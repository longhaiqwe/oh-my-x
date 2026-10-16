<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { getFeature } from '../../../../shared/feature-registry'
import WhereLine from './WhereLine.vue'

// 功能卡片的统一写法：
// 1. 名称 + 右侧控件（开关、按钮或分段选择）
// 2. 一句说明，可选补充说明和「在哪用」
// 3. 分隔线下：当前状态 + 展开详细设置
const props = withDefaults(
 defineProps<{
  featureId?: string
  title?: string
  description?: string
  /** 功能关闭时隐藏状态行和详细设置 */
  enabled?: boolean
  /** 展开按钮的文字；不传则没有详细设置 */
  detailsLabel?: string
  /** card：独立卡片；row：放在 FeatureList 里的一行 */
  variant?: 'card' | 'row'
 }>(),
 { enabled: true, variant: 'card' },
)

const open = defineModel<boolean>('open', { default: false })
const slots = useSlots()

const feature = computed(() => (props.featureId ? getFeature(props.featureId) : undefined))
const title = computed(() => props.title ?? feature.value?.label ?? '')
const description = computed(() => props.description ?? feature.value?.description ?? '')
const showFooter = computed(() => props.enabled && (Boolean(slots.status) || Boolean(props.detailsLabel)))
</script>

<template>
 <div
  class="flex flex-col gap-2"
  :class="variant === 'card' ? 'p-3 bg-card-bg rounded-xl' : 'py-2.5'"
 >
  <div class="flex items-start justify-between gap-3">
   <div class="min-w-0 flex flex-col gap-0.5">
    <div class="flex items-center gap-1.5 min-w-0">
     <p class="text-[13px] font-semibold text-text">{{ title }}</p>
     <slot name="badge" />
    </div>
    <p v-if="description" class="text-[11px] leading-relaxed text-secondary-text">{{ description }}</p>
    <p v-if="feature?.note" class="text-[11px] leading-relaxed text-secondary-text/80">{{ feature.note }}</p>
    <WhereLine v-if="feature?.where" :where="feature.where" />
   </div>
   <div v-if="$slots.control" class="shrink-0 pt-0.5">
    <slot name="control" />
   </div>
  </div>

  <slot />

  <div v-if="showFooter" class="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
   <div class="min-w-0 text-[11px] text-secondary-text">
    <slot name="status" />
   </div>
   <button
    v-if="detailsLabel"
    type="button"
    class="inline-flex items-center gap-0.5 shrink-0 text-[11px] font-medium text-accent hover:underline cursor-pointer"
    :aria-expanded="open"
    @click="open = !open"
   >
    {{ open ? '收起' : detailsLabel }}
    <svg
     class="w-3 h-3 transition-transform duration-150"
     :class="open ? 'rotate-180' : ''"
     viewBox="0 0 24 24"
     fill="none"
     stroke="currentColor"
     stroke-width="2.4"
     stroke-linecap="round"
     stroke-linejoin="round"
     aria-hidden="true"
    >
     <path d="m6 9 6 6 6-6" />
    </svg>
   </button>
  </div>

  <!-- 用 v-show 收起：内容保持挂载，正在进行的操作（如连接测试）不会因收起中断 -->
  <div v-if="detailsLabel" v-show="open && enabled" class="flex flex-col gap-3 pt-1">
   <slot name="details" />
  </div>
 </div>
</template>

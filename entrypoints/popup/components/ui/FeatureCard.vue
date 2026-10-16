<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { getFeature } from '../../../../shared/feature-registry'
import WhereLine from './WhereLine.vue'

// 功能卡片的统一写法：
// 1. 名称 + 右侧控件（开关、按钮或分段选择）
// 2. 一句说明，可选补充说明和「在哪用」
// 3. 分隔线下：当前状态 + 详细设置入口（页内展开，或进入第二层页面）
// 层级：名称 14px/600/正文色；说明 12px/400/次要色；补充和位置 12px/400/弱化色
const props = withDefaults(
 defineProps<{
  featureId?: string
  title?: string
  description?: string
  /** 功能关闭时隐藏状态行和详细设置 */
  enabled?: boolean
  /** 详细设置按钮的文字；不传则没有详细设置 */
  detailsLabel?: string
  /** expand：在卡片内展开 details 插槽；page：触发 openDetails，由上层切换到第二层页面 */
  detailsAs?: 'expand' | 'page'
  /** card：独立卡片；row：放在 FeatureList 里的一行 */
  variant?: 'card' | 'row'
 }>(),
 { enabled: true, variant: 'card', detailsAs: 'expand' },
)

const emit = defineEmits<{ openDetails: [] }>()
const open = defineModel<boolean>('open', { default: false })
const slots = useSlots()

const feature = computed(() => (props.featureId ? getFeature(props.featureId) : undefined))
const title = computed(() => props.title ?? feature.value?.label ?? '')
const description = computed(() => props.description ?? feature.value?.description ?? '')
const showFooter = computed(() => props.enabled && (Boolean(slots.status) || Boolean(props.detailsLabel)))
const isPage = computed(() => props.detailsAs === 'page')

function onDetailsClick() {
 if (isPage.value) emit('openDetails')
 else open.value = !open.value
}
</script>

<template>
 <div
  class="flex flex-col gap-3"
  :class="variant === 'card' ? 'p-4 bg-card-bg rounded-card' : 'py-3'"
 >
  <div class="flex items-start justify-between gap-4">
   <div class="min-w-0 flex flex-col gap-1">
    <div class="flex items-center gap-2 min-w-0">
     <p class="text-sm font-semibold leading-tight text-text">{{ title }}</p>
     <slot name="badge" />
    </div>
    <p v-if="description" class="text-xs leading-normal text-secondary-text">{{ description }}</p>
    <p v-if="feature?.note" class="text-xs leading-normal text-muted-text">{{ feature.note }}</p>
    <WhereLine v-if="feature?.where" :where="feature.where" />
   </div>
   <div v-if="$slots.control" class="shrink-0">
    <slot name="control" />
   </div>
  </div>

  <slot />

  <div v-if="showFooter" class="flex items-center justify-between gap-2 pt-3 border-t border-border">
   <div class="min-w-0 text-xs text-muted-text">
    <slot name="status" />
   </div>
   <button
    v-if="detailsLabel"
    type="button"
    class="inline-flex items-center gap-1 shrink-0 min-h-6 -my-1 -mr-1 px-1 rounded-control text-xs font-semibold text-accent-text hover:bg-accent-subtle cursor-pointer
     outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
    :aria-expanded="isPage ? undefined : open"
    :data-details-for="featureId"
    @click="onDetailsClick"
   >
    {{ !isPage && open ? '收起' : detailsLabel }}
    <svg
     class="w-3 h-3 transition-transform duration-150"
     :class="!isPage && open ? 'rotate-180' : ''"
     viewBox="0 0 24 24"
     fill="none"
     stroke="currentColor"
     stroke-width="2.4"
     stroke-linecap="round"
     stroke-linejoin="round"
     aria-hidden="true"
    >
     <path v-if="isPage" d="m9 6 6 6-6 6" />
     <path v-else d="m6 9 6 6 6-6" />
    </svg>
   </button>
  </div>

  <!-- 用 v-show 收起：内容保持挂载，正在进行的操作（如连接测试）不会因收起中断 -->
  <div v-if="detailsLabel && !isPage" v-show="open && enabled" class="flex flex-col gap-4">
   <slot name="details" />
  </div>
 </div>
</template>

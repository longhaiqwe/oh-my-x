<script setup lang="ts">
import { ref, onMounted } from 'vue'

// 第二层页面：顶部是返回按钮和「上级 / 当前」路径，下面放该功能的详细设置
defineProps<{
 parentTitle: string
 title: string
 description?: string
}>()
defineEmits<{ back: [] }>()

const backButton = ref<HTMLButtonElement | null>(null)

// 进入后把焦点放到返回按钮，键盘用户可以直接按回车返回
onMounted(() => backButton.value?.focus({ preventScroll: true }))
</script>

<template>
 <section class="flex flex-col gap-3">
  <div class="flex flex-col gap-0.5 px-1">
   <div class="flex items-center gap-1.5 min-w-0">
    <button
     ref="backButton"
     type="button"
     class="inline-flex items-center gap-0.5 -ml-1 px-1 py-0.5 rounded-md text-xs text-secondary-text hover:text-text hover:bg-card-bg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring shrink-0"
     :aria-label="`返回${parentTitle}`"
     @click="$emit('back')"
    >
     <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
     </svg>
     {{ parentTitle }}
    </button>
    <span class="text-xs text-secondary-text" aria-hidden="true">/</span>
    <h2 class="text-base font-bold text-text truncate">{{ title }}</h2>
   </div>
   <p v-if="description" class="text-xs text-secondary-text">{{ description }}</p>
  </div>
  <slot />
 </section>
</template>

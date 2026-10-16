<script setup lang="ts">
defineProps<{ where: string }>()
</script>

<template>
 <p class="flex items-center gap-1 text-xs leading-normal text-muted-text">
  <!-- 图标比旁边的文字浅一档（§2.7.1） -->
  <svg class="w-3 h-3 shrink-0 text-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
   <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
   <circle cx="12" cy="9.5" r="2.5" />
  </svg>
  <span>在哪用：{{ where }}</span>
 </p>
</template>

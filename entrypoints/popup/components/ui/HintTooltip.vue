<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

// 悬停或键盘聚焦时显示的说明框。插件弹窗里不显示浏览器自带的 title 提示，需要说明时用这个。
// 默认插槽是触发元素（需要能聚焦），content 插槽是说明内容。
defineProps<{ disabled?: boolean }>()
</script>

<template>
 <TooltipProvider :delay-duration="200">
  <TooltipRoot :disabled="disabled">
   <TooltipTrigger as-child>
    <slot />
   </TooltipTrigger>
   <TooltipPortal>
    <TooltipContent
     side="top"
     :side-offset="4"
     :collision-padding="8"
     class="z-50 flex flex-col gap-1 max-w-56 px-3 py-2 rounded-control bg-tooltip-bg text-xs leading-normal text-tooltip-text shadow-md"
    >
     <slot name="content" />
    </TooltipContent>
   </TooltipPortal>
  </TooltipRoot>
 </TooltipProvider>
</template>

<script setup lang="ts">
import { KeyOwnPostAutoSync } from '../../../../storage-keys'
import ControlsWrapper from '../ui/ControlsWrapper.vue'
import SectionLabel from '../ui/SectionLabel.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'
import { ON_OFF_OPTIONS } from '../../toggle-options'
</script>

<template>
 <ControlsWrapper id="user-control-own-posts" class="rounded-xl">
  <SectionLabel>引用我的帖子</SectionLabel>
  <div class="flex items-center justify-between w-full gap-3">
   <span class="text-[12px] font-semibold text-color-text">自动同步我的帖子</span>
   <ToggleGroupControl :storage-key="KeyOwnPostAutoSync" :options="ON_OFF_OPTIONS" />
  </div>
  <p class="text-xs leading-5 text-secondary-text">
   默认开启，打开已登录的 X 后自动缓存，并定期更新。关闭后保留已有缓存，仍可搜索和手动同步。
  </p>
 </ControlsWrapper>
</template>

<script setup lang="ts">
import { KeyNavigationButtonsLabels } from '../../../../storage-keys'
import { STATIC_NAV_ITEMS } from '../../../../shared/staticNavIcons'
import ControlsWrapper from '../ui/ControlsWrapper.vue'
import SectionLabel from '../ui/SectionLabel.vue'
import Separator from '../ui/Separator.vue'
import IconButton from '../ui/IconButton.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'
</script>

<template>
 <ControlsWrapper id="user-control-navigation" class="rounded-xl">
  <SectionLabel>导航栏按钮</SectionLabel>

  <div class="grid grid-cols-5 gap-y-2 gap-x-4 mx-auto flex-wrap">
   <IconButton
    v-for="item in STATIC_NAV_ITEMS"
    :key="item.storageKey"
    :storage-key="item.storageKey"
    :label="item.label"
    :icon-html="item.innerHTML"
    :view-box="item.viewBox"
   />
  </div>

  <Separator />
  <div class="flex items-center justify-between w-full">
   <span class="text-[12px] font-semibold text-color-text whitespace-nowrap">显示导航文本</span>
   <ToggleGroupControl
    :storage-key="KeyNavigationButtonsLabels"
    :options="[
     { value: 'never', label: '从不' },
     { value: 'hover', label: '悬停' },
     { value: 'always', label: '始终' },
    ]"
   />
  </div>
 </ControlsWrapper>
</template>

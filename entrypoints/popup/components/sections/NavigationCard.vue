<script setup lang="ts">
import { KeyNavigationButtonsLabels } from '../../../../storage-keys'
import { STATIC_NAV_ITEMS } from '../../../../shared/staticNavIcons'
import FeatureCard from '../ui/FeatureCard.vue'
import SubRow from '../ui/SubRow.vue'
import IconButton from '../ui/IconButton.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'

const labelOptions = [
 { value: 'never', label: '从不' },
 { value: 'hover', label: '悬停' },
 { value: 'always', label: '始终' },
]
</script>

<template>
 <FeatureCard feature-id="navigationButtons">
  <div class="grid grid-cols-4 gap-y-1.5 gap-x-2">
   <IconButton
    v-for="item in STATIC_NAV_ITEMS"
    :key="item.storageKey"
    :storage-key="item.storageKey"
    :label="item.label"
    :icon-html="item.innerHTML"
    :view-box="item.viewBox"
   />
  </div>
  <SubRow feature-id="navigationLabels">
   <ToggleGroupControl :storage-key="KeyNavigationButtonsLabels" :options="labelOptions" />
  </SubRow>
 </FeatureCard>
</template>

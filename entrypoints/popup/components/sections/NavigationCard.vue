<script setup lang="ts">
import { computed } from 'vue'
import { KeyNavigationButtonsLabels } from '../../../../storage-keys'
import { STATIC_NAV_ITEMS, navItemName } from '../../../../shared/staticNavIcons'
import { useI18n } from '../../composables/useI18n'
import FeatureCard from '../ui/FeatureCard.vue'
import SubRow from '../ui/SubRow.vue'
import IconButton from '../ui/IconButton.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'

const { t, locale } = useI18n()

const labelOptions = computed(() => [
 { value: 'never', label: t('layout.labelsNever') },
 { value: 'hover', label: t('layout.labelsHover') },
 { value: 'always', label: t('layout.labelsAlways') },
])
</script>

<template>
 <FeatureCard feature-id="navigationButtons">
  <div class="grid grid-cols-4 gap-y-1.5 gap-x-2">
   <IconButton
    v-for="item in STATIC_NAV_ITEMS"
    :key="item.storageKey"
    :storage-key="item.storageKey"
    :label="navItemName(item.id, locale)"
    :icon-html="item.innerHTML"
    :view-box="item.viewBox"
   />
  </div>
  <!-- 图标网格最后一排是文字，和下面的从属设置拉开到 20px，看得出是两组 -->
  <SubRow feature-id="navigationLabels" class="mt-2">
   <ToggleGroupControl :storage-key="KeyNavigationButtonsLabels" :options="labelOptions" />
  </SubRow>
 </FeatureCard>
</template>

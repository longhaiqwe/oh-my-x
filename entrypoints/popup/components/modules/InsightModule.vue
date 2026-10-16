<script setup lang="ts">
import { KeyUserFollowerCount } from '../../../../storage-keys'
import ControlsWrapper from '../ui/ControlsWrapper.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import ToggleRows from '../ui/ToggleRows.vue'
import CreatorRewardsCard from '../sections/CreatorRewardsCard.vue'
import ProfileActivityCard from '../sections/ProfileActivityCard.vue'
import ViralRadarSection from '../sections/ViralRadarSection.vue'
import StatRatioCard from '../sections/StatRatioCard.vue'
import type { ToggleRowItem } from '../../toggle-options'

const annotationRows: ToggleRowItem[] = [
  {
    featureId: 'followerCount',
    storageKey: KeyUserFollowerCount,
    options: [
      { value: 'all', label: '全部' },
      { value: 'list', label: '仅列表' },
      { value: 'off', label: '隐藏' },
    ],
  },
]
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="insight" />
  <CreatorRewardsCard />
  <ProfileActivityCard />
  <ViralRadarSection />
  <StatRatioCard />
  <ControlsWrapper id="user-control-insight" class="rounded-xl">
   <ToggleRows :items="annotationRows" />
  </ControlsWrapper>
 </section>
</template>

<script setup lang="ts">
import { KeyUserFollowerCount, KeyBookmarkCount } from '../../../../storage-keys'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import CreatorRewardsCard from '../sections/CreatorRewardsCard.vue'
import ProfileActivityCard from '../sections/ProfileActivityCard.vue'
import ViralRadarSection from '../sections/ViralRadarSection.vue'
import StatRatioCard from '../sections/StatRatioCard.vue'

const followerCountOptions = [
  { value: 'all', label: '全部' },
  { value: 'list', label: '仅列表' },
  { value: 'off', label: '关闭' },
]
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="insight" />

  <GroupLabel>看板</GroupLabel>
  <CreatorRewardsCard />
  <ProfileActivityCard />

  <GroupLabel>页面标注</GroupLabel>
  <ViralRadarSection />
  <StatRatioCard />
  <FeatureCard feature-id="followerCount">
   <ToggleGroupControl :storage-key="KeyUserFollowerCount" :options="followerCountOptions" class="self-start" />
  </FeatureCard>
  <FeatureCard feature-id="bookmarkCount">
   <template #control>
    <FeatureSwitch :storage-key="KeyBookmarkCount" label="收藏量" />
   </template>
  </FeatureCard>
 </section>
</template>

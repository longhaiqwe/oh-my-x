<script setup lang="ts">
import { computed } from 'vue'
import { KeyUserFollowerCount, KeyBookmarkCount } from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import CreatorRewardsCard from '../sections/CreatorRewardsCard.vue'
import ProfileActivityCard from '../sections/ProfileActivityCard.vue'
import ViralRadarSection from '../sections/ViralRadarSection.vue'
import StatRatioCard from '../sections/StatRatioCard.vue'

const { t, featureText } = useI18n()

const followerCountOptions = computed(() => [
  { value: 'all', label: t('followerCount.all') },
  { value: 'list', label: t('followerCount.list') },
  { value: 'off', label: t('followerCount.off') },
])
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="insight" />

  <GroupLabel>{{ t('insight.groupDashboards') }}</GroupLabel>
  <CreatorRewardsCard />
  <ProfileActivityCard />

  <GroupLabel>{{ t('insight.groupBadges') }}</GroupLabel>
  <ViralRadarSection />
  <StatRatioCard />
  <FeatureCard feature-id="followerCount">
   <ToggleGroupControl :storage-key="KeyUserFollowerCount" :options="followerCountOptions" class="self-start" />
  </FeatureCard>
  <FeatureCard feature-id="bookmarkCount">
   <template #control>
    <FeatureSwitch :storage-key="KeyBookmarkCount" :label="featureText('bookmarkCount', 'label')" />
   </template>
  </FeatureCard>
 </section>
</template>

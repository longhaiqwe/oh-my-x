<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { getScrollContainer, useSettingsSurface } from '../../modules'
import SubPage from '../ui/SubPage.vue'
import AudienceCard from '../sections/AudienceCard.vue'
import AudienceDetail from '../sections/AudienceDetail.vue'
const surface = useSettingsSurface()
const audiencePage = ref(
  surface === 'options' && location.hash === '#insight/audience',
)
let overviewScroll = 0
const syncHash = () => {
  if (surface === 'options')
    audiencePage.value = location.hash === '#insight/audience'
}
onMounted(() => window.addEventListener('hashchange', syncHash))
onBeforeUnmount(() => window.removeEventListener('hashchange', syncHash))
async function openAudience() {
  overviewScroll = getScrollContainer()?.scrollTop ?? 0
  audiencePage.value = true
  if (surface === 'options') history.replaceState(null, '', '#insight/audience')
  await nextTick()
  const el = getScrollContainer()
  if (el) el.scrollTop = 0
}
async function back() {
  audiencePage.value = false
  if (surface === 'options') history.replaceState(null, '', '#insight')
  await nextTick()
  const el = getScrollContainer()
  if (el) el.scrollTop = overviewScroll
  document
    .querySelector<HTMLElement>('[data-details-for="audience"]')
    ?.focus({ preventScroll: true })
}
import {
  KeyUserFollowerCount,
  KeyBookmarkCount,
} from '../../../../storage-keys'
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

const { t, featureText, moduleText } = useI18n()

const followerCountOptions = computed(() => [
  { value: 'all', label: t('followerCount.all') },
  { value: 'list', label: t('followerCount.list') },
  { value: 'off', label: t('followerCount.off') },
])
</script>

<template>
  <SubPage
    v-if="audiencePage"
    :parent-title="moduleText('insight', 'title')"
    :title="t('feature.audience.label')"
    @back="back"
    ><AudienceDetail
  /></SubPage>
  <section v-else class="flex flex-col gap-4">
    <ModuleHeader module-id="insight" />

    <GroupLabel>{{ t('insight.groupDashboards') }}</GroupLabel>
    <CreatorRewardsCard />
    <ProfileActivityCard />
    <AudienceCard @open="openAudience" />

    <GroupLabel>{{ t('insight.groupBadges') }}</GroupLabel>
    <ViralRadarSection />
    <StatRatioCard />
    <FeatureCard feature-id="followerCount">
      <ToggleGroupControl
        :storage-key="KeyUserFollowerCount"
        :options="followerCountOptions"
        class="self-start"
      />
    </FeatureCard>
    <FeatureCard feature-id="bookmarkCount">
      <template #control>
        <FeatureSwitch
          :storage-key="KeyBookmarkCount"
          :label="featureText('bookmarkCount', 'label')"
        />
      </template>
    </FeatureCard>
  </section>
</template>

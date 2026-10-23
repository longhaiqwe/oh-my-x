<script setup lang="ts">
import {
 KeyTweetButton, KeySidebarColumn, KeyArticleToc, KeyTimelineWidth, KeyNavigationWidth,
 KeySearchDefaultLatest, KeySearchFilterBar,
} from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import WidthSlider from '../controls/WidthSlider.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureList from '../ui/FeatureList.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import NavigationCard from '../sections/NavigationCard.vue'

const { t, featureText } = useI18n()
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="layout" />

  <GroupLabel>{{ t('layout.groupLayout') }}</GroupLabel>
  <FeatureList>
   <FeatureCard feature-id="timelineWidth" variant="row">
    <WidthSlider :storage-key="KeyTimelineWidth" :min="600" :max="800" :step="50" :label="featureText('timelineWidth', 'label') ?? ''" />
   </FeatureCard>
   <FeatureCard feature-id="navigationWidth" variant="row">
    <WidthSlider :storage-key="KeyNavigationWidth" :min="200" :max="275" :step="25" :label="featureText('navigationWidth', 'label') ?? ''" />
   </FeatureCard>
   <FeatureCard feature-id="sidebarColumn" variant="row">
    <template #control>
     <!-- X 默认显示的元素，开关写成「隐藏…」，打开 = 隐藏；该设置存的就是“是否隐藏”：'on' 为隐藏 -->
     <FeatureSwitch :storage-key="KeySidebarColumn" :label="featureText('sidebarColumn', 'label')" />
    </template>
   </FeatureCard>
   <FeatureCard feature-id="tweetButton" variant="row">
    <template #control>
     <!-- 该设置存的是“是否显示”：'off' 为隐藏，所以反向绑定 -->
     <FeatureSwitch :storage-key="KeyTweetButton" invert :label="featureText('tweetButton', 'label')" />
    </template>
   </FeatureCard>
  </FeatureList>

  <GroupLabel>{{ t('layout.groupNavigation') }}</GroupLabel>
  <NavigationCard />

  <GroupLabel>{{ t('layout.groupReading') }}</GroupLabel>
  <FeatureList>
   <FeatureCard feature-id="articleToc" variant="row">
    <template #control>
     <FeatureSwitch :storage-key="KeyArticleToc" :label="featureText('articleToc', 'label')" />
    </template>
   </FeatureCard>
  </FeatureList>

  <GroupLabel>{{ t('layout.groupSearch') }}</GroupLabel>
  <FeatureList>
   <FeatureCard feature-id="searchLatest" variant="row">
    <template #control>
     <FeatureSwitch :storage-key="KeySearchDefaultLatest" :label="featureText('searchLatest', 'label')" />
    </template>
   </FeatureCard>
   <FeatureCard feature-id="searchFilters" variant="row">
    <template #control>
     <FeatureSwitch :storage-key="KeySearchFilterBar" :label="featureText('searchFilters', 'label')" />
    </template>
   </FeatureCard>
  </FeatureList>

  <p class="text-xs text-center leading-5 text-secondary-text">
   {{ t('layout.displayHint') }}
   <a href="https://twitter.com/i/display" target="_blank" rel="noreferrer" class="text-accent-text hover:underline">
    {{ t('layout.openDisplay') }}
   </a>
  </p>
 </section>
</template>

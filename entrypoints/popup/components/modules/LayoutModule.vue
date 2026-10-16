<script setup lang="ts">
import { KeyTweetButton, KeySidebarColumn, KeyArticleToc, KeyMediaDownload } from '../../../../storage-keys'
import TimelineWidthSlider from '../controls/TimelineWidthSlider.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureList from '../ui/FeatureList.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import NavigationCard from '../sections/NavigationCard.vue'
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="layout" />

  <GroupLabel>布局</GroupLabel>
  <FeatureList>
   <FeatureCard feature-id="timelineWidth" variant="row">
    <TimelineWidthSlider />
   </FeatureCard>
   <FeatureCard feature-id="sidebarColumn" variant="row">
    <template #control>
     <!-- 该设置存的是“是否隐藏”：'on' 为隐藏，所以反向绑定 -->
     <FeatureSwitch :storage-key="KeySidebarColumn" invert label="显示右侧边栏" />
    </template>
   </FeatureCard>
   <FeatureCard feature-id="tweetButton" variant="row">
    <template #control>
     <FeatureSwitch :storage-key="KeyTweetButton" label="显示发帖按钮" />
    </template>
   </FeatureCard>
  </FeatureList>

  <GroupLabel>导航栏</GroupLabel>
  <NavigationCard />

  <GroupLabel>阅读</GroupLabel>
  <FeatureList>
   <FeatureCard feature-id="articleToc" variant="row">
    <template #control>
     <FeatureSwitch :storage-key="KeyArticleToc" label="长文目录" />
    </template>
   </FeatureCard>
   <FeatureCard feature-id="mediaDownload" variant="row">
    <template #control>
     <FeatureSwitch :storage-key="KeyMediaDownload" label="媒体下载" />
    </template>
   </FeatureCard>
  </FeatureList>

  <p class="text-xs text-center leading-5 text-secondary-text">
   字号、配色等设置在 X 自带的显示设置中。
   <a href="https://twitter.com/i/display" target="_blank" rel="noreferrer" class="text-accent hover:underline">
    打开显示设置
   </a>
  </p>
 </section>
</template>

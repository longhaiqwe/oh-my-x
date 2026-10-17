<script setup lang="ts">
import {
 KeyTweetButton, KeySidebarColumn, KeyArticleToc, KeyTimelineWidth, KeyNavigationWidth,
} from '../../../../storage-keys'
import WidthSlider from '../controls/WidthSlider.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureList from '../ui/FeatureList.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import NavigationCard from '../sections/NavigationCard.vue'
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="layout" />

  <GroupLabel>布局</GroupLabel>
  <FeatureList>
   <FeatureCard feature-id="timelineWidth" variant="row">
    <WidthSlider :storage-key="KeyTimelineWidth" :min="600" :max="800" :step="50" label="时间线宽度" />
   </FeatureCard>
   <FeatureCard feature-id="navigationWidth" variant="row">
    <WidthSlider :storage-key="KeyNavigationWidth" :min="200" :max="275" :step="25" label="导航栏宽度" />
   </FeatureCard>
   <FeatureCard feature-id="sidebarColumn" variant="row">
    <template #control>
     <!-- X 默认显示的元素，开关写成「隐藏…」，打开 = 隐藏；该设置存的就是“是否隐藏”：'on' 为隐藏 -->
     <FeatureSwitch :storage-key="KeySidebarColumn" label="隐藏右侧边栏" />
    </template>
   </FeatureCard>
   <FeatureCard feature-id="tweetButton" variant="row">
    <template #control>
     <!-- 该设置存的是“是否显示”：'off' 为隐藏，所以反向绑定 -->
     <FeatureSwitch :storage-key="KeyTweetButton" invert label="隐藏发帖按钮" />
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
  </FeatureList>

  <p class="text-xs text-center leading-5 text-secondary-text">
   字号、配色等设置在 X 自带的显示设置中。
   <a href="https://twitter.com/i/display" target="_blank" rel="noreferrer" class="text-accent-text hover:underline">
    打开显示设置
   </a>
  </p>
 </section>
</template>

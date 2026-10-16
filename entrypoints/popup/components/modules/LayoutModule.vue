<script setup lang="ts">
import { KeyTweetButton, KeySidebarColumn, KeyArticleToc } from '../../../../storage-keys'
import TimelineWidthSlider from '../controls/TimelineWidthSlider.vue'
import ControlsWrapper from '../ui/ControlsWrapper.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import Separator from '../ui/Separator.vue'
import ToggleRows from '../ui/ToggleRows.vue'
import NavigationCard from '../sections/NavigationCard.vue'
import { SHOW_HIDE_OPTIONS, type ToggleRowItem } from '../../toggle-options'

const layoutRows: ToggleRowItem[] = [
  { featureId: 'tweetButton', storageKey: KeyTweetButton, options: SHOW_HIDE_OPTIONS },
  {
    featureId: 'sidebarColumn',
    storageKey: KeySidebarColumn,
    // 该设置存的是“是否隐藏”：'on' 为隐藏
    options: [
      { value: 'off', label: '显示' },
      { value: 'on', label: '隐藏' },
    ],
  },
]

const readingRows: ToggleRowItem[] = [
  { featureId: 'articleToc', storageKey: KeyArticleToc, options: SHOW_HIDE_OPTIONS },
]
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="layout" />

  <ControlsWrapper id="user-control-timeline" class="rounded-xl">
   <TimelineWidthSlider />
   <Separator />
   <ToggleRows :items="layoutRows" />
  </ControlsWrapper>

  <NavigationCard />

  <ControlsWrapper id="user-control-reading" class="rounded-xl">
   <ToggleRows :items="readingRows" />
  </ControlsWrapper>

  <p class="text-xs text-center font-medium leading-5 text-secondary-text">
   更多 𝕏 显示设置
   <a href="https://twitter.com/i/display" target="_blank" rel="noreferrer" class="text-accent hover:underline">
    查看
   </a>。
  </p>
 </section>
</template>

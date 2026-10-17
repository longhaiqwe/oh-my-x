<script setup lang="ts">
import {
  KeyQuickInteraction,
  KeyQuickInteractionDock,
  KeyJumpToReplies,
  KeyAutoLikeOnReply,
  KeyHighlightNonFollowers,
  KeyMediaDownload,
} from '../../../../storage-keys'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import SubRow from '../ui/SubRow.vue'
import QuickListCard from '../sections/QuickListCard.vue'

const shortcutKeys = [
  { key: '1', action: '回复' },
  { key: '2', action: '引用' },
  { key: '3', action: '点赞' },
  { key: '4', action: '收藏' },
]
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="engage" />

  <GroupLabel>互动</GroupLabel>
  <FeatureCard feature-id="quickInteraction">
   <template #control>
    <FeatureSwitch :storage-key="KeyQuickInteraction" label="快捷键" />
   </template>
   <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-secondary-text">
    <span v-for="item in shortcutKeys" :key="item.key" class="inline-flex items-center gap-1">
     <kbd class="min-w-4 px-1 rounded-sm bg-sunken-bg font-mono text-xs text-center text-text">{{ item.key }}</kbd>
     {{ item.action }}
    </span>
   </div>
   <SubRow feature-id="quickInteractionDock">
    <FeatureSwitch :storage-key="KeyQuickInteractionDock" label="底部悬浮条" />
   </SubRow>
  </FeatureCard>

  <FeatureCard feature-id="jumpToReplies">
   <template #control>
    <FeatureSwitch :storage-key="KeyJumpToReplies" label="直达回复区" />
   </template>
  </FeatureCard>

  <FeatureCard feature-id="autoLikeOnReply">
   <template #control>
    <FeatureSwitch :storage-key="KeyAutoLikeOnReply" label="回复自动点赞" />
   </template>
  </FeatureCard>

  <FeatureCard feature-id="mediaDownload">
   <template #control>
    <FeatureSwitch :storage-key="KeyMediaDownload" label="媒体下载" />
   </template>
  </FeatureCard>

  <GroupLabel>列表与关系</GroupLabel>
  <FeatureCard feature-id="nonFollowers">
   <template #control>
    <FeatureSwitch :storage-key="KeyHighlightNonFollowers" label="未互关标记" />
   </template>
  </FeatureCard>

  <QuickListCard />
 </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  KeyQuickInteraction,
  KeyQuickInteractionDock,
  KeyJumpToReplies,
  KeyAutoLikeOnReply,
  KeyHighlightNonFollowers,
  KeyMediaDownload,
} from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import ModuleHeader from '../ui/ModuleHeader.vue'
import GroupLabel from '../ui/GroupLabel.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import SubRow from '../ui/SubRow.vue'
import QuickListCard from '../sections/QuickListCard.vue'

const { t, featureText } = useI18n()

const shortcutKeys = computed(() => [
  { key: '1', action: t('engage.reply') },
  { key: '2', action: t('engage.quote') },
  { key: '3', action: t('engage.like') },
  { key: '4', action: t('engage.bookmark') },
])
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="engage" />

  <GroupLabel>{{ t('engage.groupInteract') }}</GroupLabel>
  <FeatureCard feature-id="quickInteraction">
   <template #control>
    <FeatureSwitch :storage-key="KeyQuickInteraction" :label="featureText('quickInteraction', 'label')" />
   </template>
   <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-secondary-text">
    <span v-for="item in shortcutKeys" :key="item.key" class="inline-flex items-center gap-1">
     <kbd class="min-w-4 px-1 rounded-sm bg-sunken-bg font-mono text-xs text-center text-text">{{ item.key }}</kbd>
     {{ item.action }}
    </span>
   </div>
   <SubRow feature-id="quickInteractionDock">
    <FeatureSwitch :storage-key="KeyQuickInteractionDock" :label="featureText('quickInteractionDock', 'label')" />
   </SubRow>
  </FeatureCard>

  <FeatureCard feature-id="jumpToReplies">
   <template #control>
    <FeatureSwitch :storage-key="KeyJumpToReplies" :label="featureText('jumpToReplies', 'label')" />
   </template>
  </FeatureCard>

  <FeatureCard feature-id="autoLikeOnReply">
   <template #control>
    <FeatureSwitch :storage-key="KeyAutoLikeOnReply" :label="featureText('autoLikeOnReply', 'label')" />
   </template>
  </FeatureCard>

  <FeatureCard feature-id="mediaDownload">
   <template #control>
    <FeatureSwitch :storage-key="KeyMediaDownload" :label="featureText('mediaDownload', 'label')" />
   </template>
  </FeatureCard>

  <GroupLabel>{{ t('engage.groupLists') }}</GroupLabel>
  <FeatureCard feature-id="nonFollowers">
   <template #control>
    <FeatureSwitch :storage-key="KeyHighlightNonFollowers" :label="featureText('nonFollowers', 'label')" />
   </template>
  </FeatureCard>

  <QuickListCard />
 </section>
</template>

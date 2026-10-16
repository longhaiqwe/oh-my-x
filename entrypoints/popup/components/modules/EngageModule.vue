<script setup lang="ts">
import {
  KeyQuickInteraction,
  KeyQuickInteractionDock,
  KeyJumpToReplies,
  KeyAutoLikeOnReply,
  KeyHighlightNonFollowers,
} from '../../../../storage-keys'
import ControlsWrapper from '../ui/ControlsWrapper.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import ToggleRows from '../ui/ToggleRows.vue'
import QuickListCard from '../sections/QuickListCard.vue'
import { ON_OFF_OPTIONS, SHOW_HIDE_OPTIONS, type ToggleRowItem } from '../../toggle-options'

const interactionRows: ToggleRowItem[] = [
  { featureId: 'quickInteraction', storageKey: KeyQuickInteraction, options: ON_OFF_OPTIONS },
  { featureId: 'quickInteractionDock', storageKey: KeyQuickInteractionDock, options: SHOW_HIDE_OPTIONS },
  { featureId: 'jumpToReplies', storageKey: KeyJumpToReplies, options: SHOW_HIDE_OPTIONS },
  { featureId: 'autoLikeOnReply', storageKey: KeyAutoLikeOnReply, options: ON_OFF_OPTIONS },
]

const relationRows: ToggleRowItem[] = [
  { featureId: 'nonFollowers', storageKey: KeyHighlightNonFollowers, options: SHOW_HIDE_OPTIONS },
]
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="engage" />
  <ControlsWrapper id="user-control-interaction" class="rounded-xl">
   <ToggleRows :items="interactionRows" />
  </ControlsWrapper>
  <ControlsWrapper id="user-control-relation" class="rounded-xl">
   <ToggleRows :items="relationRows" />
  </ControlsWrapper>
  <QuickListCard />
 </section>
</template>

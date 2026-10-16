<script setup lang="ts">
import { KeyScheduledPanorama } from '../../../../storage-keys'
import ControlsWrapper from '../ui/ControlsWrapper.vue'
import ModuleHeader from '../ui/ModuleHeader.vue'
import ToggleRows from '../ui/ToggleRows.vue'
import OwnPostsCard from '../sections/OwnPostsCard.vue'
import AiRepostCard from '../sections/AiRepostCard.vue'
import { SHOW_HIDE_OPTIONS, type ToggleRowItem } from '../../toggle-options'

const scheduleRows: ToggleRowItem[] = [
  { featureId: 'scheduledPanorama', storageKey: KeyScheduledPanorama, options: SHOW_HIDE_OPTIONS },
]
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="create" />
  <OwnPostsCard />
  <AiRepostCard />
  <ControlsWrapper id="user-control-schedule" class="rounded-xl">
   <ToggleRows :items="scheduleRows" />
  </ControlsWrapper>
 </section>
</template>

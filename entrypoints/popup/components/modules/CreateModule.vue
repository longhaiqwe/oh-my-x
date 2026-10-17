<script setup lang="ts">
import { KeyScheduledPanorama, KeyScheduledSidebar } from '../../../../storage-keys'
import ModuleHeader from '../ui/ModuleHeader.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import SubRow from '../ui/SubRow.vue'
import OwnPostsCard from '../sections/OwnPostsCard.vue'
import AiRepostCard from '../sections/AiRepostCard.vue'
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="create" />
  <OwnPostsCard />
  <AiRepostCard />
  <FeatureCard feature-id="scheduledPanorama">
   <template #control>
    <FeatureSwitch :storage-key="KeyScheduledPanorama" label="排期全景" />
   </template>
   <SubRow feature-id="scheduledSidebar">
    <FeatureSwitch :storage-key="KeyScheduledSidebar" label="右侧栏面板" />
   </SubRow>
  </FeatureCard>
 </section>
</template>

<script setup lang="ts">
import { KeyScheduledPanorama } from '../../../../storage-keys'
import ModuleHeader from '../ui/ModuleHeader.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
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
  </FeatureCard>
 </section>
</template>

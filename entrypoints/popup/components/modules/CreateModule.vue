<script setup lang="ts">
import { KeyScheduledPanorama, KeyScheduledSidebar } from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import ModuleHeader from '../ui/ModuleHeader.vue'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import SubRow from '../ui/SubRow.vue'
import OwnPostsCard from '../sections/OwnPostsCard.vue'
import AiRepostCard from '../sections/AiRepostCard.vue'

const { featureText } = useI18n()
</script>

<template>
 <section class="flex flex-col gap-4">
  <ModuleHeader module-id="create" />
  <OwnPostsCard />
  <AiRepostCard />
  <FeatureCard feature-id="scheduledPanorama">
   <template #control>
    <FeatureSwitch :storage-key="KeyScheduledPanorama" :label="featureText('scheduledPanorama', 'label')" />
   </template>
   <SubRow feature-id="scheduledSidebar">
    <FeatureSwitch :storage-key="KeyScheduledSidebar" :label="featureText('scheduledSidebar', 'label')" />
   </SubRow>
  </FeatureCard>
 </section>
</template>

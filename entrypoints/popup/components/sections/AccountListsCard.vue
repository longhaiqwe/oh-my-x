<script setup lang="ts">
import { ref } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import ListsSection from './ListsSection.vue'

const counts = ref({ whitelist: 0, blacklist: 0 })
</script>

<template>
 <FeatureCard feature-id="spamAccountLists" details-label="管理名单">
  <template #status>
   白名单 {{ counts.whitelist }} 个 · 黑名单 {{ counts.blacklist }} 个
  </template>
  <template #details>
   <ListsSection @counts="(c) => (counts = c)" />
  </template>
 </FeatureCard>
</template>

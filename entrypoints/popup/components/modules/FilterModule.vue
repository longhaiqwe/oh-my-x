<script setup lang="ts">
import ModuleHeader from '../ui/ModuleHeader.vue'
import SpamFilterCard from '../sections/SpamFilterCard.vue'
import SpamTodayCard from '../sections/SpamTodayCard.vue'
import TweetFilterCard from '../sections/TweetFilterCard.vue'
import RulesSection from '../sections/RulesSection.vue'
import KeywordsSection from '../sections/KeywordsSection.vue'
import ListsSection from '../sections/ListsSection.vue'
import LogSection from '../sections/LogSection.vue'
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="filter" />
  <SpamFilterCard />
  <SpamTodayCard />
  <TweetFilterCard />
  <RulesSection />
  <KeywordsSection />
  <ListsSection />
  <LogSection />
 </section>
</template>

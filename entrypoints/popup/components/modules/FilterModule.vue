<script setup lang="ts">
import ModuleHeader from '../ui/ModuleHeader.vue'
import SpamFilterCard from '../sections/SpamFilterCard.vue'
import TweetFilterCard from '../sections/TweetFilterCard.vue'
import AccountListsCard from '../sections/AccountListsCard.vue'
import SpamLogCard from '../sections/SpamLogCard.vue'
</script>

<template>
 <section class="flex flex-col gap-3">
  <ModuleHeader module-id="filter" />
  <SpamFilterCard />
  <TweetFilterCard />
  <AccountListsCard />
  <SpamLogCard />
 </section>
</template>

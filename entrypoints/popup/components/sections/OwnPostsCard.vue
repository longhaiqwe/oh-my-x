<script setup lang="ts">
import { KeyOwnPostAutoSync } from '../../../../storage-keys'
import FeatureCard from '../ui/FeatureCard.vue'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
import SubRow from '../ui/SubRow.vue'
</script>

<template>
 <FeatureCard feature-id="ownPosts">
  <SubRow
   title="打开 X 时自动同步"
   description="打开已登录的 X 后缓存你的帖子，之后定期检查新帖。关闭后保留已缓存的帖子，仍可在编辑器中搜索和手动同步"
  >
   <FeatureSwitch :storage-key="KeyOwnPostAutoSync" label="打开 X 时自动同步" />
  </SubRow>
 </FeatureCard>
</template>

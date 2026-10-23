<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MIGRATE_AI_SERVICE } from '../../../../shared/ai-service'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()
const ready = ref(false)
const failed = ref(false)
async function prepare() {
  failed.value = false
  try {
    const result = await browser.runtime.sendMessage({ type: MIGRATE_AI_SERVICE })
    if (!result?.ok) throw new Error('migration failed')
    ready.value = true
  } catch { failed.value = true }
}
onMounted(prepare)
</script>

<template>
 <slot v-if="ready" />
 <div v-else class="p-4 text-sm text-secondary-text bg-body-bg">
  <p>{{ failed ? t('aiService.loadFailed') : t('aiService.loading') }}</p>
  <button v-if="failed" type="button" class="min-h-8 px-2 text-sm rounded-control text-accent-text hover:bg-accent-subtle cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" @click="prepare">{{ t('aiService.retry') }}</button>
 </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { KeyAiServiceApiKey, KeyAiServiceBaseUrl } from '../../../../storage-keys'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import { useI18n } from '../../composables/useI18n'
import { useModuleNavigation } from '../../module-navigation'

defineProps<{ model: string }>()
const { t } = useI18n()
const navigate = useModuleNavigation()
const service = useStorageSnapshot([KeyAiServiceBaseUrl, KeyAiServiceApiKey])
const configured = computed(() => Boolean(String(service[KeyAiServiceApiKey] ?? '').trim()))
const host = computed(() => {
  try { return new URL(String(service[KeyAiServiceBaseUrl])).host } catch { return '—' }
})
</script>

<template>
 <div class="flex flex-col items-start gap-1">
  <p v-if="configured" class="text-xs text-muted-text break-all">{{ t('aiService.current', { service: host, model }) }}</p>
  <button type="button" class="min-h-6 text-xs font-semibold text-accent-text rounded-control hover:bg-accent-subtle cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" @click="navigate('settings')">
   {{ configured ? t('aiService.configure') : t('aiService.setup') }}
  </button>
 </div>
</template>

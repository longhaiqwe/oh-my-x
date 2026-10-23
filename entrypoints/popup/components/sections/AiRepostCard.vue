<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import AiServiceLink from '../ui/AiServiceLink.vue'
import { useStorageSnapshot } from '../../composables/useStorageSnapshot'
import { parseStyleSamples } from '../../../../shared/ai-repost'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import {
  KeyAiRepostEnabled,
  KeyAiServiceBaseUrl,
  KeyAiServiceApiKey,
  KeyAiServiceModel,
  KeyAiRepostModel,
  KeyAiRepostCustomPrompt,
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { useI18n } from '../../composables/useI18n'

const { t, featureText } = useI18n()
const enabled = ref(true)
const model = ref('')
const service = useStorageSnapshot([KeyAiServiceBaseUrl, KeyAiServiceApiKey, KeyAiServiceModel])
const effectiveModel = computed(() => model.value.trim() || String(service[KeyAiServiceModel] ?? ''))
const customPrompt = ref('')
const stylePrompt = ref('')
const styleSamples = ref('')
const sampleCount = computed(() => parseStyleSamples(styleSamples.value).length)
const hasCustomStyle = computed(() => Boolean(stylePrompt.value.trim() || sampleCount.value))
const detailsOpen = ref(false)
const configured = computed(() => Boolean(String(service[KeyAiServiceApiKey] ?? '').trim()))
let disposed = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  const stored = await getStorage([
    KeyAiRepostEnabled,
    KeyAiRepostModel,
    KeyAiRepostCustomPrompt,
    KeyAiRepostStylePrompt,
    KeyAiRepostStyleSamples,
  ])
  if (disposed) return
  enabled.value = stored[KeyAiRepostEnabled] !== 'off'
  if (typeof stored[KeyAiRepostModel] === 'string' && stored[KeyAiRepostModel]) {
    model.value = stored[KeyAiRepostModel] as string
  }
  if (typeof stored[KeyAiRepostCustomPrompt] === 'string') {
    customPrompt.value = stored[KeyAiRepostCustomPrompt] as string
  }
  if (typeof stored[KeyAiRepostStylePrompt] === 'string') {
    stylePrompt.value = stored[KeyAiRepostStylePrompt] as string
  }
  if (typeof stored[KeyAiRepostStyleSamples] === 'string') {
    styleSamples.value = stored[KeyAiRepostStyleSamples] as string
  }
  // 还没填 API Key 时直接展开配置
  detailsOpen.value = !configured.value
})

async function toggleEnabled(val: boolean) {
  enabled.value = val
  await setStorage({ [KeyAiRepostEnabled]: val ? 'on' : 'off' })
}

function saveSettings() {
  return setStorage({
    [KeyAiRepostModel]: model.value.trim(),
    [KeyAiRepostCustomPrompt]: customPrompt.value.trim(),
    [KeyAiRepostStylePrompt]: stylePrompt.value.trim(),
    [KeyAiRepostStyleSamples]: styleSamples.value.trim(),
  })
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void saveSettings()
  }, 250)
}

onBeforeUnmount(() => {
  disposed = true
  if (saveTimer) { clearTimeout(saveTimer); void saveSettings() }
})
</script>

<template>
  <FeatureCard
    v-model:open="detailsOpen"
    feature-id="aiRepost"
    :enabled="enabled"
    :details-label="t('ai.settings')"
  >
    <template #control>
      <SwitchToggle :model-value="enabled" :label="featureText('aiRepost', 'label')" @update:model-value="toggleEnabled" />
    </template>

    <template #status>
      <span v-if="configured" class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-success shrink-0" aria-hidden="true"></span>
        <span class="truncate">{{ t('ai.status', { model: effectiveModel, style: hasCustomStyle ? t('ai.styleCustom') : t('ai.styleDefault') }) }}</span>
      </span>
      <span v-else class="text-warning">{{ t('ai.noKey') }}</span>
    </template>

    <template #details>
      <p class="text-xs text-muted-text leading-normal">
        {{ t('ai.privacy') }}
      </p>
      <AiServiceLink :model="effectiveModel" />
      <div class="flex flex-col gap-1">
        <label for="ai-repost-model" class="text-xs font-semibold text-secondary-text">{{ t('ai.model') }}</label>
        <input id="ai-repost-model" v-model="model" type="text"
          class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs font-mono text-text placeholder:text-muted-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring"
          :placeholder="String(service[KeyAiServiceModel] ?? '')" @input="scheduleSave" />
        <p class="text-xs text-muted-text">{{ t('aiService.modelHint') }}</p>
      </div>

      <!-- 转发风格：留空用默认风格；与模型设置分开成一组 -->
      <div class="flex flex-col gap-3 pt-4 border-t border-border">
        <div class="flex flex-col gap-1">
          <p class="text-sm font-semibold text-text">{{ t('ai.styleTitle') }}</p>
          <p class="text-xs leading-normal text-muted-text">{{ t('ai.styleHint') }}</p>
        </div>
        <div class="flex flex-col gap-1">
          <label for="ai-style" class="text-xs font-semibold text-secondary-text">{{ t('ai.styleDescription') }}</label>
          <textarea
            id="ai-style"
            v-model="stylePrompt"
            rows="3"
            class="w-full px-3 py-2 rounded-control border border-border-strong bg-sunken-bg text-xs leading-normal text-text placeholder:text-muted-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring resize-y"
            :placeholder="t('ai.stylePlaceholder')"
            @input="scheduleSave"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="ai-samples" class="text-xs font-semibold text-secondary-text">{{ t('ai.samples') }}</label>
          <textarea
            id="ai-samples"
            v-model="styleSamples"
            rows="4"
            class="w-full px-3 py-2 rounded-control border border-border-strong bg-sunken-bg text-xs leading-normal text-text placeholder:text-muted-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring resize-y"
            :placeholder="t('ai.samplesPlaceholder')"
            @input="scheduleSave"
          />
          <p class="text-xs text-muted-text">{{ sampleCount > 0 ? t('ai.samplesCount', { count: sampleCount }) : t('ai.samplesHint') }}</p>
        </div>
        <div class="flex flex-col gap-1">
          <label for="ai-prompt" class="text-xs font-semibold text-secondary-text">{{ t('ai.extra') }}</label>
          <input
            id="ai-prompt"
            v-model="customPrompt"
            type="text"
            class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none text-text"
            :placeholder="t('ai.extraPlaceholder')"
            @input="scheduleSave"
          />
        </div>
      </div>
    </template>
  </FeatureCard>
</template>

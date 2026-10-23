<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { requestAiPermission, sendAiRequest } from '../../../../shared/ai-request'
import FeatureCard from '../ui/FeatureCard.vue'
import {
  KeyAiServiceBaseUrl,
  KeyAiServiceApiKey,
  KeyAiServiceModel,
  defaultPreferences,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { useI18n } from '../../composables/useI18n'
import { errorText } from '../../../../shared/errors'

const { t } = useI18n()
const baseUrl = ref(String(defaultPreferences[KeyAiServiceBaseUrl]))
const apiKey = ref('')
const model = ref(String(defaultPreferences[KeyAiServiceModel]))
const showApiKey = ref(false)
const isTesting = ref(false)
const statusText = ref('')
const statusIsError = ref(false)

let disposed = false
let activeTest: AbortController | undefined
let saveTimer: ReturnType<typeof setTimeout> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(msg: string, isErr = false) {
  statusText.value = msg
  statusIsError.value = isErr
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    statusText.value = ''
  }, 3000)
}

onMounted(async () => {
  const stored = await getStorage([
    KeyAiServiceBaseUrl,
    KeyAiServiceApiKey,
    KeyAiServiceModel,
  ])
  if (disposed) return
  if (typeof stored[KeyAiServiceBaseUrl] === 'string') {
    baseUrl.value = stored[KeyAiServiceBaseUrl] as string
  }
  if (typeof stored[KeyAiServiceApiKey] === 'string') {
    apiKey.value = stored[KeyAiServiceApiKey] as string
  }
  if (typeof stored[KeyAiServiceModel] === 'string') {
    model.value = stored[KeyAiServiceModel] as string
  }
})

function saveSettings() {
  return setStorage({
    [KeyAiServiceBaseUrl]: baseUrl.value.trim(),
    [KeyAiServiceApiKey]: apiKey.value.trim(),
    [KeyAiServiceModel]: model.value.trim(),
  })
}

function scheduleSave() {
  cancelTest()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void saveSettings()
  }, 250)
}

function cancelTest() {
  activeTest?.abort()
  activeTest = undefined
  isTesting.value = false
}

onBeforeUnmount(() => {
  disposed = true
  cancelTest()
  if (noticeTimer) clearTimeout(noticeTimer)
  if (saveTimer) { clearTimeout(saveTimer); void saveSettings() }
})

async function testConnection() {
  if (isTesting.value) return
  if (!apiKey.value.trim()) {
    showNotice(t('ai.needKey'), true)
    return
  }
  if (!model.value.trim()) {
    showNotice(t('error.aiModelRequired'), true)
    return
  }
  const config = {
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: model.value.trim(),
  }
  const request = new AbortController()
  activeTest = request
  const isCurrent = () => !disposed && activeTest === request && !request.signal.aborted
  isTesting.value = true
  if (noticeTimer) clearTimeout(noticeTimer)
  statusText.value = t('ai.authorizing')
  statusIsError.value = false

  try {
    // Must be the first asynchronous call from the click: preserve the user gesture.
    const granted = await requestAiPermission(config.baseUrl)
    if (!isCurrent()) return
    if (!granted) throw new Error(t('ai.notGranted'))
    if (!await saveSettings()) throw new Error(t('ai.saveFailed'))
    if (!isCurrent()) return
    const res = await sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config }, request.signal)
    if (!isCurrent()) return
    if (res.ok) showNotice(t('ai.connected', { model: res.model || config.model }))
    else showNotice(errorText(res.error) || t('ai.failed'), true)
  } catch (error) {
    if (isCurrent()) showNotice(errorText(error) || t('ai.failed'), true)
  } finally {
    if (isCurrent()) { isTesting.value = false; activeTest = undefined }
  }
}
</script>

<template>
  <FeatureCard feature-id="aiService">
      <p class="text-xs text-muted-text leading-normal">{{ t('aiService.privacy') }}</p>
      <div class="flex flex-col gap-1">
        <label for="ai-base-url" class="text-xs font-semibold text-secondary-text">{{ t('ai.baseUrl') }}</label>
        <input
          id="ai-base-url"
          v-model="baseUrl"
          type="text"
          class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none font-mono text-text"
          placeholder="https://api.openai.com/v1"
          @input="scheduleSave"
        />
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label for="ai-api-key" class="text-xs font-semibold text-secondary-text">API Key</label>
          <button
            type="button"
            class="min-h-6 px-1 rounded-control text-xs text-secondary-text hover:text-text hover:bg-sunken-bg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            @click="showApiKey = !showApiKey"
          >
            {{ showApiKey ? t('common.hide') : t('common.show') }}
          </button>
        </div>
        <input
          id="ai-api-key"
          v-model="apiKey"
          :type="showApiKey ? 'text' : 'password'"
          class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none font-mono text-text"
          placeholder="sk-..."
          @input="scheduleSave"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="ai-model" class="text-xs font-semibold text-secondary-text">{{ t('aiService.defaultModel') }}</label>
        <input
          id="ai-model"
          v-model="model"
          type="text"
          class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none font-mono text-text"
          placeholder="gpt-4o-mini / deepseek-chat"
          @input="scheduleSave"
        />
      </div>


      <div class="flex items-center gap-3 pt-1">
        <button
          type="button"
          :disabled="isTesting"
          class="h-8 px-3 rounded-control text-xs font-semibold bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          @click="testConnection"
        >
          {{ isTesting ? t('ai.testing') : t('ai.test') }}
        </button>
        <button v-if="isTesting" type="button" class="min-h-6 px-2 rounded-control text-xs text-secondary-text hover:text-text hover:bg-sunken-bg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          @click="cancelTest(); statusText = t('ai.testCancelled')">{{ t('common.cancel') }}</button>
        <span
          v-if="statusText"
          class="text-xs truncate min-w-0"
          :class="statusIsError ? 'text-danger' : 'text-success'"
        >
          {{ statusText }}
        </span>
      </div>

  </FeatureCard>
</template>

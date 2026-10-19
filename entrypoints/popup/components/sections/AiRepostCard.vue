<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { requestAiPermission, sendAiRequest } from '../../../../shared/ai-request'
import { parseStyleSamples } from '../../../../shared/ai-repost'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import {
  KeyAiRepostEnabled,
  KeyAiRepostBaseUrl,
  KeyAiRepostApiKey,
  KeyAiRepostModel,
  KeyAiRepostCustomPrompt,
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
  defaultPreferences,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { useI18n } from '../../composables/useI18n'
import { errorText } from '../../../../shared/errors'

const { t, featureText } = useI18n()
const enabled = ref(true)
const baseUrl = ref(String(defaultPreferences[KeyAiRepostBaseUrl]))
const apiKey = ref('')
const model = ref(String(defaultPreferences[KeyAiRepostModel]))
const customPrompt = ref('')
const stylePrompt = ref('')
const styleSamples = ref('')
const sampleCount = computed(() => parseStyleSamples(styleSamples.value).length)
const hasCustomStyle = computed(() => Boolean(stylePrompt.value.trim() || sampleCount.value))
const showApiKey = ref(false)
const isTesting = ref(false)
const statusText = ref('')
const statusIsError = ref(false)
const detailsOpen = ref(false)

const configured = computed(() => Boolean(apiKey.value.trim()))

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
    KeyAiRepostEnabled,
    KeyAiRepostBaseUrl,
    KeyAiRepostApiKey,
    KeyAiRepostModel,
    KeyAiRepostCustomPrompt,
    KeyAiRepostStylePrompt,
    KeyAiRepostStyleSamples,
  ])
  if (disposed) return
  enabled.value = stored[KeyAiRepostEnabled] !== 'off'
  if (typeof stored[KeyAiRepostBaseUrl] === 'string' && stored[KeyAiRepostBaseUrl]) {
    baseUrl.value = stored[KeyAiRepostBaseUrl] as string
  }
  if (typeof stored[KeyAiRepostApiKey] === 'string') {
    apiKey.value = stored[KeyAiRepostApiKey] as string
  }
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
  if (!val) cancelTest()
  enabled.value = val
  await setStorage({ [KeyAiRepostEnabled]: val ? 'on' : 'off' })
}

function saveSettings() {
  return setStorage({
    [KeyAiRepostBaseUrl]: baseUrl.value.trim() || String(defaultPreferences[KeyAiRepostBaseUrl]),
    [KeyAiRepostApiKey]: apiKey.value.trim(),
    [KeyAiRepostModel]: model.value.trim() || String(defaultPreferences[KeyAiRepostModel]),
    [KeyAiRepostCustomPrompt]: customPrompt.value.trim(),
    [KeyAiRepostStylePrompt]: stylePrompt.value.trim(),
    [KeyAiRepostStyleSamples]: styleSamples.value.trim(),
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
  const config = {
    baseUrl: baseUrl.value.trim() || String(defaultPreferences[KeyAiRepostBaseUrl]),
    apiKey: apiKey.value.trim(),
    model: model.value.trim() || String(defaultPreferences[KeyAiRepostModel]),
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
        <span class="truncate">{{ t('ai.status', { model, style: hasCustomStyle ? t('ai.styleCustom') : t('ai.styleDefault') }) }}</span>
      </span>
      <span v-else class="text-warning">{{ t('ai.noKey') }}</span>
    </template>

    <template #details>
      <p class="text-xs text-muted-text leading-normal">
        {{ t('ai.privacy') }}
      </p>
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
        <label for="ai-model" class="text-xs font-semibold text-secondary-text">{{ t('ai.model') }}</label>
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

      <!-- 转发风格：留空用默认风格；与上面的连接设置分开成一组 -->
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

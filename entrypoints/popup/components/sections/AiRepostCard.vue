<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { requestAiPermission, sendAiRequest } from '../../../../shared/ai-request'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import {
  KeyAiRepostEnabled,
  KeyAiRepostBaseUrl,
  KeyAiRepostApiKey,
  KeyAiRepostModel,
  KeyAiRepostCustomPrompt,
  defaultPreferences,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'

const enabled = ref(true)
const baseUrl = ref(String(defaultPreferences[KeyAiRepostBaseUrl]))
const apiKey = ref('')
const model = ref(String(defaultPreferences[KeyAiRepostModel]))
const customPrompt = ref('')
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
    showNotice('请先填写 API Key', true)
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
  statusText.value = '正在授权并测试连接…'
  statusIsError.value = false

  try {
    // Must be the first asynchronous call from the click: preserve the user gesture.
    const granted = await requestAiPermission(config.baseUrl)
    if (!isCurrent()) return
    if (!granted) throw new Error('未授权该 AI 服务地址，未发送测试请求')
    if (!await saveSettings()) throw new Error('设置保存失败，请重试')
    if (!isCurrent()) return
    const res = await sendAiRequest({ type: 'XF_TEST_AI_CONNECTION', config }, request.signal)
    if (!isCurrent()) return
    if (res.ok) showNotice(`连接可用 (${res.model || config.model})`)
    else showNotice(res.error || '连接失败', true)
  } catch (error) {
    if (isCurrent()) showNotice(error instanceof Error ? error.message : '连接失败', true)
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
    details-label="配置服务"
  >
    <template #control>
      <SwitchToggle :model-value="enabled" label="AI 总结转发" @update:model-value="toggleEnabled" />
    </template>

    <template #status>
      <span v-if="configured" class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-success shrink-0" aria-hidden="true"></span>
        <span class="truncate">已填写 API Key · 模型 {{ model }}</span>
      </span>
      <span v-else class="text-warning">还没有填写 API Key</span>
    </template>

    <template #details>
      <p class="text-xs text-muted-text leading-normal">
        生成时会把原文、作者信息和补充要求发送到你配置的服务，API Key 只用于该服务的认证。
        首次使用或更换地址时需要授权；测试连接只发送一段测试文本。
      </p>
      <div class="flex flex-col gap-1">
        <label for="ai-base-url" class="text-xs font-semibold text-secondary-text">接口地址 (Base URL)</label>
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
            {{ showApiKey ? '隐藏' : '显示' }}
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
        <label for="ai-model" class="text-xs font-semibold text-secondary-text">模型名称 (Model)</label>
        <input
          id="ai-model"
          v-model="model"
          type="text"
          class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none font-mono text-text"
          placeholder="gpt-4o-mini / deepseek-chat"
          @input="scheduleSave"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="ai-prompt" class="text-xs font-semibold text-secondary-text">补充要求（可选）</label>
        <input
          id="ai-prompt"
          v-model="customPrompt"
          type="text"
          class="w-full h-8 px-3 rounded-control border border-border-strong bg-sunken-bg text-xs placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none text-text"
          placeholder="例如：字数控制在 120 字以内"
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
          {{ isTesting ? '测试中…' : '授权并测试连接' }}
        </button>
        <button v-if="isTesting" type="button" class="min-h-6 px-2 rounded-control text-xs text-secondary-text hover:text-text hover:bg-sunken-bg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          @click="cancelTest(); statusText = '已取消测试'">取消</button>
        <span
          v-if="statusText"
          class="text-xs truncate min-w-0"
          :class="statusIsError ? 'text-danger' : 'text-success'"
        >
          {{ statusText }}
        </span>
      </div>
    </template>
  </FeatureCard>
</template>

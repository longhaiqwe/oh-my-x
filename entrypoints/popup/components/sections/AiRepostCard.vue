<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
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
})

async function toggleEnabled(val: boolean) {
  enabled.value = val
  await setStorage({ [KeyAiRepostEnabled]: val ? 'on' : 'off' })
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void setStorage({
      [KeyAiRepostBaseUrl]: baseUrl.value.trim() || String(defaultPreferences[KeyAiRepostBaseUrl]),
      [KeyAiRepostApiKey]: apiKey.value.trim(),
      [KeyAiRepostModel]: model.value.trim() || String(defaultPreferences[KeyAiRepostModel]),
      [KeyAiRepostCustomPrompt]: customPrompt.value.trim(),
    })
  }, 250)
}

async function testConnection() {
  if (isTesting.value) return
  if (!apiKey.value.trim()) {
    showNotice('请先填写 API Key', true)
    return
  }
  isTesting.value = true
  statusText.value = '正在测试接口连接...'
  statusIsError.value = false

  try {
    await setStorage({
      [KeyAiRepostBaseUrl]: baseUrl.value.trim() || String(defaultPreferences[KeyAiRepostBaseUrl]),
      [KeyAiRepostApiKey]: apiKey.value.trim(),
      [KeyAiRepostModel]: model.value.trim() || String(defaultPreferences[KeyAiRepostModel]),
      [KeyAiRepostCustomPrompt]: customPrompt.value.trim(),
    })

    const res = await browser.runtime.sendMessage({
      type: 'XF_TEST_AI_CONNECTION',
      config: {
        baseUrl: baseUrl.value.trim(),
        apiKey: apiKey.value.trim(),
        model: model.value.trim(),
      },
    })

    if (res?.ok) {
      showNotice(`连接可用 (${res.model || model.value})`, false)
    } else {
      showNotice(res?.error || '连接失败', true)
    }
  } catch (e: any) {
    showNotice(e?.message || '连接失败', true)
  } finally {
    isTesting.value = false
  }
}
</script>

<template>
  <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2.5">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-[12px] font-semibold">AI 总结转发</p>
        <p class="text-[10px] text-secondary-text mt-0.5">
          在发帖/引用弹窗「每个人」右侧注入按钮，生成两个转发总结选项
        </p>
      </div>
      <SwitchRoot
        :model-value="enabled"
        @update:model-value="(v) => toggleEnabled(!!v)"
        class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
        :class="enabled ? 'bg-accent' : 'bg-secondary-text/40'"
      >
        <SwitchThumb
          class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
          :class="enabled ? 'translate-x-[15px]' : 'translate-x-0.5'"
        />
      </SwitchRoot>
    </div>

    <div v-if="enabled" class="flex flex-col gap-2 pt-2 border-t border-border/60">
      <div class="flex flex-col gap-1">
        <label class="text-[11px] font-medium text-color-text">接口地址 (Base URL)</label>
        <input
          v-model="baseUrl"
          type="text"
          class="w-full h-7 px-2 rounded-md border border-border bg-body-bg text-[11px] focus:border-accent outline-none font-mono"
          placeholder="https://api.openai.com/v1"
          @input="scheduleSave"
        />
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-medium text-color-text">API Key</label>
          <button
            type="button"
            class="text-[10px] text-secondary-text hover:text-accent cursor-pointer"
            @click="showApiKey = !showApiKey"
          >
            {{ showApiKey ? '隐藏' : '显示' }}
          </button>
        </div>
        <input
          v-model="apiKey"
          :type="showApiKey ? 'text' : 'password'"
          class="w-full h-7 px-2 rounded-md border border-border bg-body-bg text-[11px] focus:border-accent outline-none font-mono"
          placeholder="sk-..."
          @input="scheduleSave"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-[11px] font-medium text-color-text">模型名称 (Model)</label>
        <input
          v-model="model"
          type="text"
          class="w-full h-7 px-2 rounded-md border border-border bg-body-bg text-[11px] focus:border-accent outline-none font-mono"
          placeholder="gpt-4o-mini / deepseek-chat"
          @input="scheduleSave"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-[11px] font-medium text-color-text">补充要求（可选）</label>
        <input
          v-model="customPrompt"
          type="text"
          class="w-full h-7 px-2 rounded-md border border-border bg-body-bg text-[11px] focus:border-accent outline-none"
          placeholder="例如：字数控制在 120 字以内"
          @input="scheduleSave"
        />
      </div>

      <div class="flex items-center justify-between pt-0.5">
        <button
          type="button"
          :disabled="isTesting"
          class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-accent text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
          @click="testConnection"
        >
          {{ isTesting ? '测试中...' : '测试连接' }}
        </button>
        <span
          v-if="statusText"
          class="text-[11px] truncate max-w-[210px]"
          :class="statusIsError ? 'text-red-500' : 'text-accent'"
        >
          {{ statusText }}
        </span>
      </div>
    </div>
  </div>
</template>

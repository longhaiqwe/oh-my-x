<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import ToggleGroupControl from '../ui/ToggleGroupControl.vue'
import {
  KeyTweetFilterEnabled,
  KeyTweetFilterAction,
  KeyTweetFilterKeywords,
  defaultTweetFilterKeywords,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { parseTweetFilterKeywords } from '../../../../shared/tweet-filter-rules'

const enabled = ref(true)
const keywords = ref(defaultTweetFilterKeywords.join('\n'))
const newKeyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const noticeMessage = ref('')

const actionOptions = [
  { value: 'collapse', label: '折叠占位' },
  { value: 'hide', label: '直接隐藏' },
]

const parsedKeywords = computed(() => parseTweetFilterKeywords(keywords.value))
const keywordCount = computed(() => parsedKeywords.value.length)

let saveTimer: ReturnType<typeof setTimeout> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(msg: string) {
  noticeMessage.value = msg
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    noticeMessage.value = ''
  }, 2500)
}

onMounted(async () => {
  const stored = await getStorage([KeyTweetFilterEnabled, KeyTweetFilterKeywords])
  enabled.value = stored[KeyTweetFilterEnabled] !== 'off'
  if (typeof stored[KeyTweetFilterKeywords] === 'string') {
    keywords.value = stored[KeyTweetFilterKeywords] as string
  }
})

async function toggleEnabled(val: boolean) {
  enabled.value = val
  await setStorage({ [KeyTweetFilterEnabled]: val ? 'on' : 'off' })
}

function updateKeywords(val: string) {
  keywords.value = val
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void setStorage({ [KeyTweetFilterKeywords]: keywords.value })
  }, 300)
}

function addWord(word: string) {
  const trimmed = word.trim()
  if (!trimmed) return
  const list = [...parsedKeywords.value]
  if (!list.some((w) => w.toLowerCase() === trimmed.toLowerCase())) {
    list.push(trimmed)
    updateKeywords(list.join('\n'))
  }
}

function removeWord(index: number) {
  const list = [...parsedKeywords.value]
  list.splice(index, 1)
  updateKeywords(list.join('\n'))
}

function submitKeyword() {
  if (newKeyword.value.trim()) {
    const parts = newKeyword.value.split(/[,，\n]/)
    parts.forEach((p) => addWord(p))
    newKeyword.value = ''
  }
}

function handleInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  if (value.includes(',') || value.includes('，') || value.includes('\n')) {
    const parts = value.split(/[,，\n]/)
    const lastPart = parts.pop() || ''
    parts.forEach((part) => addWord(part))
    newKeyword.value = lastPart
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    submitKeyword()
  } else if (e.key === 'Backspace' && !newKeyword.value) {
    if (parsedKeywords.value.length > 0) {
      removeWord(parsedKeywords.value.length - 1)
    }
  }
}

function handlePaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text') || ''
  if (!text) return
  const parts = text.split(/[\n,，]/)
  parts.forEach((part) => addWord(part))
}

function resetToDefaults() {
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  updateKeywords(defaultTweetFilterKeywords.join('\n'))
  showNotice('已恢复默认词库')
}

function clearAll() {
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  updateKeywords('')
  showNotice('已清空词库')
}

function focusInput() {
  inputRef.value?.focus()
}
</script>

<template>
  <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2.5">
    <!-- 头部开关 -->
    <div class="flex items-center justify-between">
      <div>
        <p class="text-[12px] font-semibold text-color-text">推文内容过滤</p>
        <p class="text-[10px] text-secondary-text mt-0.5">过滤信息流中包含“说个暴论”等噪音推文</p>
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

    <!-- 过滤配置子项（开关开启时展示） -->
    <div v-if="enabled" class="flex flex-col gap-2.5 pt-2 border-t border-border/60">
      <!-- 过滤展示动作 -->
      <div class="flex items-center justify-between w-full">
        <div>
          <span class="text-[11px] font-medium text-color-text">过滤展示</span>
          <p class="text-[9px] text-secondary-text">折叠占位可随时展开查看</p>
        </div>
        <ToggleGroupControl
          :storage-key="KeyTweetFilterAction"
          :options="actionOptions"
          default-value="collapse"
        />
      </div>

      <!-- 词库管理 -->
      <div class="flex flex-col gap-1.5 pt-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium text-color-text">推文过滤词库</span>
            <span class="text-[10px] font-bold text-accent">({{ keywordCount }} 词)</span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="noticeMessage" class="text-[10px] text-accent animate-pulse">{{ noticeMessage }}</span>
            <button
              type="button"
              class="text-[10px] text-secondary-text hover:text-accent rounded transition-colors cursor-pointer"
              title="恢复为默认暴论词库"
              @click="resetToDefaults"
            >
              重置默认
            </button>
            <button
              v-if="keywordCount > 0"
              type="button"
              class="text-[10px] text-red-400 hover:text-red-500 rounded transition-colors cursor-pointer"
              @click="clearAll"
            >
              清空
            </button>
          </div>
        </div>

        <!-- 标签编辑器 -->
        <div
          class="w-full max-h-36 overflow-y-auto rounded-lg border border-border bg-body-bg p-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent outline-none flex flex-wrap gap-1.5 content-start transition-all cursor-text"
          @click="focusInput"
        >
          <TransitionGroup name="tag-list">
            <span
              v-for="(word, idx) in parsedKeywords"
              :key="word + '-' + idx"
              class="group inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-400 border border-red-500/20 dark:border-red-400/20 transition-all hover:bg-red-500/15"
            >
              <span>{{ word }}</span>
              <button
                type="button"
                class="w-0 opacity-0 ml-0 group-hover:w-3.5 group-hover:opacity-100 group-hover:ml-1 h-3.5 flex items-center justify-center rounded-full hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 font-bold focus:outline-none cursor-pointer text-[10px] transition-all duration-150 overflow-hidden"
                @click.stop="removeWord(idx)"
              >
                ✕
              </button>
            </span>
          </TransitionGroup>

          <input
            ref="inputRef"
            type="text"
            v-model="newKeyword"
            class="flex-1 min-w-[100px] bg-transparent border-none outline-none text-[11px] p-0.5 placeholder:text-secondary-text/50"
            :placeholder="keywordCount === 0 ? '输入关键词按 Enter 添加...' : '添加关键词...'"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handlePaste"
            @blur="submitKeyword"
          />
        </div>

        <p class="text-[9px] text-secondary-text leading-tight mt-0.5">
          💡 支持按回车或逗号添加，默认已内置“说个暴论”系列词汇。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-list-enter-active,
.tag-list-leave-active {
  transition: all 0.15s ease-out;
}

.tag-list-enter-from,
.tag-list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>

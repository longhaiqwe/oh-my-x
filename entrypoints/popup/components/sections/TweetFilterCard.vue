<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import SubRow from '../ui/SubRow.vue'
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

const action = ref<'collapse' | 'hide'>('collapse')
const actionOptions = [
  { value: 'collapse', label: '折叠' },
  { value: 'hide', label: '隐藏' },
]
const actionText = computed(() => (action.value === 'hide' ? '命中后隐藏' : '命中后折叠'))

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
  const stored = await getStorage([KeyTweetFilterEnabled, KeyTweetFilterKeywords, KeyTweetFilterAction])
  enabled.value = stored[KeyTweetFilterEnabled] !== 'off'
  action.value = stored[KeyTweetFilterAction] === 'hide' ? 'hide' : 'collapse'
  if (typeof stored[KeyTweetFilterKeywords] === 'string') {
    keywords.value = stored[KeyTweetFilterKeywords] as string
  }
})

async function setAction(value: string) {
  action.value = value === 'hide' ? 'hide' : 'collapse'
  await setStorage({ [KeyTweetFilterAction]: action.value })
}

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
  showNotice('已恢复默认屏蔽词')
}

function clearAll() {
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  updateKeywords('')
  showNotice('已清空屏蔽词')
}

function focusInput() {
  inputRef.value?.focus()
}
</script>

<template>
  <FeatureCard feature-id="tweetFilter" :enabled="enabled" details-label="管理屏蔽词">
    <template #control>
      <SwitchToggle :model-value="enabled" label="正文关键词过滤" @update:model-value="toggleEnabled" />
    </template>

    <template #status>{{ actionText }} · 屏蔽词 {{ keywordCount }} 个</template>

    <template #details>
      <SubRow title="处理方式" description="折叠后显示一行提示，点击可以展开查看">
        <SegmentedControl :model-value="action" :options="actionOptions" @update:model-value="setAction" />
      </SubRow>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-[12px] font-medium text-text">屏蔽词</span>
            <span class="text-[11px] font-semibold text-accent">{{ keywordCount }} 个</span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="noticeMessage" class="text-[10px] text-accent">{{ noticeMessage }}</span>
            <button
              type="button"
              class="text-[10px] text-secondary-text hover:text-accent rounded transition-colors cursor-pointer"
              title="恢复为默认屏蔽词"
              @click="resetToDefaults"
            >
              恢复默认
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
                :aria-label="`删除 ${word}`"
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
            :placeholder="keywordCount === 0 ? '输入屏蔽词，按回车添加' : '添加屏蔽词'"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handlePaste"
            @blur="submitKeyword"
          />
        </div>

        <p class="text-[10px] text-secondary-text leading-tight">
          按回车或逗号添加。默认包含「说个暴论」等 {{ defaultTweetFilterKeywords.length }} 个词。和垃圾词库分开管理。
        </p>
      </div>
    </template>
  </FeatureCard>
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

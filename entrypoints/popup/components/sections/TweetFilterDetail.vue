<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import {
  KeyTweetFilterAction,
  KeyTweetFilterKeywords,
  getDefaultTweetFilterKeywords,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { parseTweetFilterKeywords } from '../../../../shared/tweet-filter-rules'
import { useI18n } from '../../composables/useI18n'

// 正文关键词过滤的第二层页面：处理方式、屏蔽词
const { t, locale } = useI18n()
// 「恢复默认」和提示里的默认词按当前界面语言
const defaultKeywords = computed(() => getDefaultTweetFilterKeywords(locale.value))
const keywords = ref(defaultKeywords.value.join('\n'))
const newKeyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const noticeMessage = ref('')

const action = ref<'collapse' | 'hide'>('collapse')
const actionOptions = computed(() => [
  { value: 'collapse', label: t('tweetFilter.collapse') },
  { value: 'hide', label: t('tweetFilter.hide') },
])

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
  const stored = await getStorage([KeyTweetFilterKeywords, KeyTweetFilterAction])
  action.value = stored[KeyTweetFilterAction] === 'hide' ? 'hide' : 'collapse'
  if (typeof stored[KeyTweetFilterKeywords] === 'string') {
    keywords.value = stored[KeyTweetFilterKeywords] as string
  }
})

async function setAction(value: string) {
  action.value = value === 'hide' ? 'hide' : 'collapse'
  await setStorage({ [KeyTweetFilterAction]: action.value })
}

function updateKeywords(val: string) {
  keywords.value = val
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void setStorage({ [KeyTweetFilterKeywords]: keywords.value })
  }, 300)
}

// 离开页面时立即写入尚未保存的修改，返回第一层后状态行能读到最新词数
onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer)
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  void setStorage({ [KeyTweetFilterKeywords]: keywords.value })
})

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
  updateKeywords(defaultKeywords.value.join('\n'))
  showNotice(t('tweetFilter.resetDone'))
}

function clearAll() {
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  updateKeywords('')
  showNotice(t('tweetFilter.cleared'))
}

function focusInput() {
  inputRef.value?.focus()
}
</script>

<template>
  <FeatureCard :title="t('tweetFilter.actionTitle')" :description="t('tweetFilter.actionDescription')">
    <template #control>
      <SegmentedControl :model-value="action" :options="actionOptions" @update:model-value="setAction" />
    </template>
  </FeatureCard>

  <div class="p-4 bg-card-bg rounded-card">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-text">{{ t('tweetFilter.words') }}</span>
            <span class="text-xs text-muted-text">{{ t('common.count', { count: keywordCount }) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="noticeMessage" class="text-xs text-success" role="status">{{ noticeMessage }}</span>
            <button
              type="button"
              class="text-xs text-secondary-text hover:text-text hover:bg-sunken-bg min-h-6 px-1 rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              :title="t('tweetFilter.resetTitle')"
              @click="resetToDefaults"
            >
              {{ t('common.resetDefaults') }}
            </button>
            <button
              v-if="keywordCount > 0"
              type="button"
              class="text-xs text-danger hover:bg-sunken-bg min-h-6 px-1 rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
              @click="clearAll"
            >
              {{ t('common.clear') }}
            </button>
          </div>
        </div>

        <!-- 标签编辑器 -->
        <div
          class="w-full max-h-36 overflow-y-auto rounded-control border border-border-strong bg-sunken-bg p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-ring flex flex-wrap gap-1 content-start transition-colors cursor-text"
          @click="focusInput"
        >
          <TransitionGroup name="tag-list">
            <span
              v-for="(word, idx) in parsedKeywords"
              :key="word + '-' + idx"
              class="group inline-flex items-center text-xs leading-normal px-2 py-0.5 rounded-full bg-card-bg text-text transition-colors"
            >
              <span>{{ word }}</span>
              <button
                type="button"
                class="w-0 opacity-0 ml-0 group-hover:w-4 group-hover:opacity-100 group-hover:ml-1 focus-visible:w-4 focus-visible:opacity-100 focus-visible:ml-1 h-4 flex items-center justify-center rounded-full text-muted-text hover:text-danger cursor-pointer text-xs transition-all duration-150 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                :aria-label="t('common.remove', { name: word })"
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
            class="flex-1 min-w-24 bg-transparent border-none outline-none text-xs text-text px-1 py-0.5 placeholder:text-muted-text"
            :placeholder="keywordCount === 0 ? t('tweetFilter.placeholderEmpty') : t('tweetFilter.placeholder')"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handlePaste"
            @blur="submitKeyword"
          />
        </div>

        <p class="text-xs text-secondary-text leading-tight">
          {{ t('tweetFilter.hint', { count: defaultKeywords.length }) }}
        </p>
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

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  KeySpamKeywordList,
  defaultSpamKeywords,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { parseKeywordList } from '../../../../shared/spam-rules'
import {
  migrateSpamStorage,
  mergeDefaultKeywords,
} from '../../../../shared/spam-migration'
import { getFeature } from '../../../../shared/feature-registry'
import WhereLine from '../ui/WhereLine.vue'

const feature = getFeature('spamKeywords')

let migrationChecked = false

function getInitialKeywords(): string {
  try {
    return window?.localStorage?.getItem(KeySpamKeywordList) ?? ''
  } catch {
    return ''
  }
}

const keywords = ref(getInitialKeywords())
const newKeyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const syncMessage = ref('')

const parsedKeywords = computed(() => parseKeywordList(keywords.value))
const keywordCount = computed(() => parsedKeywords.value.length)

const placeholderText = computed(() => {
  return parsedKeywords.value.length === 0
    ? '输入词，按回车或逗号添加，也可以粘贴多行'
    : '添加'
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let syncMsgTimer: ReturnType<typeof setTimeout> | null = null

function showSyncMsg(msg: string) {
  syncMessage.value = msg
  if (syncMsgTimer) clearTimeout(syncMsgTimer)
  syncMsgTimer = setTimeout(() => {
    syncMessage.value = ''
  }, 3000)
}

onMounted(async () => {
  // 单次会话守卫：不在每次打开词库 Tab 时重复触发重量级存储版本比对与迁移
  if (!migrationChecked) {
    migrationChecked = true
    await migrateSpamStorage()
  }
  const kw = await getStorage(KeySpamKeywordList)
  const val = String(kw ?? '')
  if (keywords.value !== val) keywords.value = val
  try {
    localStorage.setItem(KeySpamKeywordList, val)
  } catch {}
})

async function updateKeywords(value: string) {
  keywords.value = value
  try {
    localStorage.setItem(KeySpamKeywordList, value)
  } catch {}
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void setStorage({ [KeySpamKeywordList]: keywords.value })
  }, 350)
}

// 离开页面时立即写入尚未保存的修改，返回第一层后状态行能读到最新词数
onBeforeUnmount(() => {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  void setStorage({ [KeySpamKeywordList]: keywords.value })
})

function syncOfficialKeywords() {
  const currentList = [...parsedKeywords.value]
  const { merged, added } = mergeDefaultKeywords(currentList)
  if (added.length === 0) {
    showSyncMsg('已包含全部默认词')
    return
  }
  void updateKeywords(merged.join('\n'))
  showSyncMsg(`已补充 ${added.length} 个默认词`)
}

function resetToDefaults() {
  if (!confirm(`恢复为默认词库（共 ${defaultSpamKeywords.length} 个词）？你添加的词会被删除。`)) return
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  void updateKeywords(defaultSpamKeywords.join('\n'))
  showSyncMsg('已恢复默认词库')
}

function addWord(word: string) {
  const trimmed = word.trim()
  if (!trimmed) return
  const currentList = [...parsedKeywords.value]
  const exists = currentList.some((w) => w.toLowerCase() === trimmed.toLowerCase())
  if (!exists) {
    currentList.push(trimmed)
    void updateKeywords(currentList.join('\n'))
  }
}

function removeWord(index: number) {
  const currentList = [...parsedKeywords.value]
  currentList.splice(index, 1)
  void updateKeywords(currentList.join('\n'))
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

function submitKeyword() {
  if (newKeyword.value.trim()) {
    const parts = newKeyword.value.split(/[,，\n]/)
    parts.forEach((part) => addWord(part))
    newKeyword.value = ''
  }
}

function focusInput() {
  inputRef.value?.focus()
}

function clearAll() {
  if (!confirm(`清空全部 ${keywordCount.value} 个词？`)) return
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  void updateKeywords('')
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-semibold text-text">{{ feature.label }}</p>
      <div class="flex items-center gap-2">
        <span v-if="syncMessage" class="text-xs text-success" role="status">{{ syncMessage }}</span>
        <span class="text-xs text-muted-text">{{ keywordCount }} 个词</span>
      </div>
    </div>
    <p class="text-xs text-secondary-text">回复命中第一个词加 35 分，多个词累加，最多 65 分。和正文屏蔽词分开管理。</p>
    <WhereLine v-if="feature.where" :where="feature.where" />
    <div class="flex items-center justify-end gap-1">
      <button type="button"
        class="text-xs text-accent-text hover:bg-accent-subtle min-h-6 px-1 rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        title="把新版本加入的默认词补进来，保留你添加的词"
        @click="syncOfficialKeywords">补充默认词</button>
      <button type="button"
        class="text-xs text-secondary-text hover:text-text hover:bg-sunken-bg min-h-6 px-1 rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        title="把词库恢复为默认词"
        @click="resetToDefaults">恢复默认</button>
      <button v-if="keywordCount > 0" type="button"
        class="text-xs text-danger hover:bg-sunken-bg min-h-6 px-1 rounded-control transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        @click="clearAll">清空</button>
    </div>

    <!-- 标签编辑器 -->
    <div
      class="w-full max-h-48 min-h-20 overflow-y-auto rounded-control border border-border-strong bg-sunken-bg p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-ring flex flex-wrap gap-1 content-start transition-colors cursor-text"
      @click="focusInput">
      <TransitionGroup name="list">
        <span v-for="(word, idx) in parsedKeywords" :key="word + '-' + idx"
          class="group inline-flex items-center text-xs leading-normal px-2 py-0.5 rounded-full bg-card-bg text-text transition-colors">
          <span>{{ word }}</span>
          <button type="button"
            class="w-0 opacity-0 ml-0 group-hover:w-4 group-hover:opacity-100 group-hover:ml-1 focus-visible:w-4 focus-visible:opacity-100 focus-visible:ml-1 h-4 flex items-center justify-center rounded-full text-muted-text hover:text-danger cursor-pointer text-xs transition-all duration-150 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            :aria-label="`删除 ${word}`"
            @click.stop="removeWord(idx)">
            ✕
          </button>
        </span>
      </TransitionGroup>

      <input ref="inputRef" type="text" v-model="newKeyword"
        class="flex-1 min-w-30 bg-transparent border-none outline-none text-xs text-text px-1 py-0.5 placeholder:text-muted-text"
        :placeholder="placeholderText" @input="handleInput" @keydown="handleKeydown" @paste="handlePaste"
        @blur="submitKeyword" />
    </div>

    <p class="text-xs text-secondary-text leading-relaxed">
      选词按钮的样式是
      <span class="inline-flex items-center justify-center bg-sunken-bg rounded-sm p-0.5 align-middle mx-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h8q.425 0 .713.288T14 4t-.288.713T13 5H5v14h14v-8q0-.425.288-.712T20 10t.713.288T21 11v8q0 .825-.587 1.413T19 21zm4-4q-.425 0-.712-.288T8 16t.288-.712T9 15h6q.425 0 .713.288T16 16t-.288.713T15 17zm0-3q-.425 0-.712-.288T8 13t.288-.712T9 12h6q.425 0 .713.288T16 13t-.288.713T15 14zm0-3q-.425 0-.712-.288T8 10t.288-.712T9 9h6q.425 0 .713.288T16 10t-.288.713T15 11zm9-2q-.425 0-.712-.288T17 8V7h-1q-.425 0-.712-.288T15 6t.288-.712T16 5h1V4q0-.425.288-.712T18 3t.713.288T19 4v1h1q.425 0 .713.288T21 6t-.288.713T20 7h-1v1q0 .425-.288.713T18 9"/></svg>
      </span>
      ，点击后可以从昵称或回复中选词加入词库。
    </p>
  </div>
</template>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.15s ease-out;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>

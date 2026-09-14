<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
    ? '输入关键词并按 Enter / 逗号添加，或直接粘贴词列表...'
    : '添加...'
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
    void setStorage({ [KeySpamKeywordList]: keywords.value })
  }, 350)
}

function syncOfficialKeywords() {
  const currentList = [...parsedKeywords.value]
  const { merged, added } = mergeDefaultKeywords(currentList)
  if (added.length === 0) {
    showSyncMsg('已包含所有最新官方词汇')
    return
  }
  void updateKeywords(merged.join('\n'))
  showSyncMsg(`已补充 ${added.length} 个最新词汇`)
}

function resetToDefaults() {
  if (!confirm(`确定要恢复为官方默认词库（共 ${defaultSpamKeywords.length} 词）吗？\n当前自定义词汇将被重置。`)) return
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  void updateKeywords(defaultSpamKeywords.join('\n'))
  showSyncMsg('已重置为官方默认词库')
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
  if (!confirm(`确定要清空所有 ${keywordCount.value} 个关键词吗？`)) return
  if (saveTimer) clearTimeout(saveTimer)
  newKeyword.value = ''
  void updateKeywords('')
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="p-3 bg-card-bg rounded-b-xl flex flex-col gap-2">
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[12px] font-semibold">自定义营销词库</p>
          <div class="flex items-center gap-2">
            <span v-if="syncMessage" class="text-[10px] text-accent font-medium animate-pulse">{{ syncMessage }}</span>
            <span class="text-[12px] font-bold text-accent">{{ keywordCount }} 词</span>
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <p class="text-[10px] text-secondary-text">首词 +35，多词累加最高 65。按回车添加或粘贴</p>
          <div class="flex items-center gap-2">
            <button type="button"
              class="text-[10px] text-accent hover:underline rounded py-0.5 transition-colors cursor-pointer"
              title="补充官方新词，保留现有自定义词"
              @click="syncOfficialKeywords">补全新词</button>
            <button type="button"
              class="text-[10px] text-secondary-text hover:text-primary-text rounded py-0.5 transition-colors cursor-pointer"
              title="重置为全部官方默认词库"
              @click="resetToDefaults">重置默认</button>
            <button v-if="keywordCount > 0" type="button"
              class="text-[10px] text-red-400 hover:text-red-500 rounded py-0.5 transition-colors cursor-pointer"
              @click="clearAll">清空</button>
          </div>
        </div>
      </div>

      <!-- Tag Editor Container -->
      <div
        class="w-full h-80 overflow-y-auto rounded-md border border-border bg-body-bg p-2.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent outline-none flex flex-wrap gap-1.5 content-start transition-all cursor-text"
        @click="focusInput">
        <TransitionGroup name="list">
          <span v-for="(word, idx) in parsedKeywords" :key="word + '-' + idx"
            class="group inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-400 border border-red-500/20 dark:border-red-400/20 transition-all hover:bg-red-500/15">
            <span>{{ word }}</span>
            <button type="button"
              class="w-0 opacity-0 ml-0 group-hover:w-3.5 group-hover:opacity-100 group-hover:ml-1 h-3.5 flex items-center justify-center rounded-full hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-300 font-bold focus:outline-none cursor-pointer text-[10px] transition-all duration-150 overflow-hidden"
              @click.stop="removeWord(idx)">
              ✕
            </button>
          </span>
        </TransitionGroup>

        <input ref="inputRef" type="text" v-model="newKeyword"
          class="flex-1 min-w-[120px] bg-transparent border-none outline-none text-[12px] p-0.5 placeholder:text-secondary-text/50"
          :placeholder="placeholderText" @input="handleInput" @keydown="handleKeydown" @paste="handlePaste"
          @blur="submitKeyword" />
      </div>

      <p class="text-[10px] text-secondary-text leading-relaxed">
        💡 在推文右上角点击
        <span class="inline-flex items-center justify-center bg-body-bg border border-border rounded p-0.5 align-middle mx-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h8q.425 0 .713.288T14 4t-.288.713T13 5H5v14h14v-8q0-.425.288-.712T20 10t.713.288T21 11v8q0 .825-.587 1.413T19 21zm4-4q-.425 0-.712-.288T8 16t.288-.712T9 15h6q.425 0 .713.288T16 16t-.288.713T15 17zm0-3q-.425 0-.712-.288T8 13t.288-.712T9 12h6q.425 0 .713.288T16 13t-.288.713T15 14zm0-3q-.425 0-.712-.288T8 10t.288-.712T9 9h6q.425 0 .713.288T16 10t-.288.713T15 11zm9-2q-.425 0-.712-.288T17 8V7h-1q-.425 0-.712-.288T15 6t.288-.712T16 5h1V4q0-.425.288-.712T18 3t.713.288T19 4v1h1q.425 0 .713.288T21 6t-.288.713T20 7h-1v1q0 .425-.288.713T18 9"/></svg>
        </span>
        按钮，可快速从昵称/评论中选词添加
      </p>
    </div>
  </section>
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

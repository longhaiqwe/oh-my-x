<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { KeySpamWhitelist, KeySpamBlacklist } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { parseHandleList } from '../../../../shared/spam-rules'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()

function getInitialList(key: string): string {
  try {
    return window?.localStorage?.getItem(key) ?? ''
  } catch {
    return ''
  }
}

const whitelist = ref(getInitialList(KeySpamWhitelist))
const blacklist = ref(getInitialList(KeySpamBlacklist))

const parsedWhitelist = computed(() => parseHandleList(whitelist.value))
const parsedBlacklist = computed(() => parseHandleList(blacklist.value))

type ListKey = typeof KeySpamWhitelist | typeof KeySpamBlacklist
const SAVE_DELAY_MS = 350
const saveTimers = new Map<ListKey, ReturnType<typeof setTimeout>>()
const pendingValues = new Map<ListKey, string>()

function flushList(key: ListKey) {
  const timer = saveTimers.get(key)
  if (timer) clearTimeout(timer)
  saveTimers.delete(key)
  const value = pendingValues.get(key)
  if (value === undefined) return
  pendingValues.delete(key)
  try {
    localStorage.setItem(key, value)
  } catch {}
  void setStorage({ [key]: value })
}

function scheduleListSave(key: ListKey, value: string) {
  pendingValues.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {}
  const timer = saveTimers.get(key)
  if (timer) clearTimeout(timer)
  saveTimers.set(key, setTimeout(() => flushList(key), SAVE_DELAY_MS))
}

onMounted(async () => {
  // 单次批量 IPC 查询，代替之前的两个独立 getStorage 请求
  const data = await getStorage([KeySpamWhitelist, KeySpamBlacklist])
  const wl = String(data?.[KeySpamWhitelist] ?? '')
  const bl = String(data?.[KeySpamBlacklist] ?? '')
  if (whitelist.value !== wl) whitelist.value = wl
  if (blacklist.value !== bl) blacklist.value = bl
  try {
    localStorage.setItem(KeySpamWhitelist, wl)
    localStorage.setItem(KeySpamBlacklist, bl)
  } catch {}
})

function updateWhitelist(value: string) {
  whitelist.value = value
  scheduleListSave(KeySpamWhitelist, value)
}

function updateBlacklist(value: string) {
  blacklist.value = value
  scheduleListSave(KeySpamBlacklist, value)
}

onBeforeUnmount(() => {
  flushList(KeySpamWhitelist)
  flushList(KeySpamBlacklist)
})
</script>

<template>
 <div class="flex flex-col gap-2">
  <div>
   <p class="text-sm font-semibold text-text flex justify-between">
    {{ t('accountLists.allow') }}
    <span class="font-normal text-secondary-text">{{ t('common.count', { count: parsedWhitelist.length }) }}</span>
   </p>
   <p class="text-xs text-muted-text mt-1">{{ t('accountLists.allowHint') }}</p>
  </div>
  <textarea
   class="w-full min-h-20 rounded-control border border-border-strong bg-sunken-bg p-2 text-xs font-mono focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none resize-y text-text"
   :value="whitelist"
   :aria-label="t('accountLists.allow')"
   @input="(e: Event) => updateWhitelist((e.target as HTMLTextAreaElement).value)"
   @blur="flushList(KeySpamWhitelist)"
   placeholder="@example"
  />
  <div v-if="parsedWhitelist.length" class="flex flex-wrap gap-1">
   <span
    v-for="handle in parsedWhitelist"
    :key="handle"
    class="inline-flex items-center px-2 py-0.5 rounded-full bg-sunken-bg text-success text-xs font-mono"
   >@{{ handle }}</span>
  </div>

  <div class="pt-4 border-t border-border">
   <p class="text-sm font-semibold text-text flex justify-between">
    {{ t('accountLists.block') }}
    <span class="font-normal text-secondary-text">{{ t('common.count', { count: parsedBlacklist.length }) }}</span>
   </p>
   <p class="text-xs text-muted-text mt-1">{{ t('accountLists.blockHint') }}</p>
  </div>
  <textarea
   class="w-full min-h-20 rounded-control border border-border-strong bg-sunken-bg p-2 text-xs font-mono focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none resize-y text-text"
   :value="blacklist"
   :aria-label="t('accountLists.block')"
   @input="(e: Event) => updateBlacklist((e.target as HTMLTextAreaElement).value)"
   @blur="flushList(KeySpamBlacklist)"
   placeholder="@example"
  />
  <div v-if="parsedBlacklist.length" class="flex flex-wrap gap-1">
   <span
    v-for="handle in parsedBlacklist"
    :key="handle"
    class="inline-flex items-center px-2 py-0.5 rounded-full bg-sunken-bg text-danger text-xs font-mono"
   >@{{ handle }}</span>
  </div>
 </div>
</template>

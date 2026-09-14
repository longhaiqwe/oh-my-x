<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { KeySpamWhitelist, KeySpamBlacklist } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { parseHandleList } from '../../../../shared/spam-rules'

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
 <section class="flex flex-col gap-3">
  <div class="p-3 bg-card-bg rounded-b-xl flex flex-col gap-2">
   <div>
    <p class="text-[12px] font-semibold flex justify-between">白名单
      <span class="text-accent!">{{ parsedWhitelist.length }}</span>
    </p>
    <p class="text-[10px] text-secondary-text mt-0.5">永不过滤这些作者</p>
   </div>
   <textarea
    class="w-full min-h-[100px] rounded-md border border-border bg-body-bg p-2 text-[12px] font-mono focus:border-accent outline-none resize-y"
    :value="whitelist"
    @input="(e: Event) => updateWhitelist((e.target as HTMLTextAreaElement).value)"
    @blur="flushList(KeySpamWhitelist)"
    placeholder="@antfu7&#10;yyx990803"
   />
   <div v-if="parsedWhitelist.length" class="flex flex-wrap gap-1">
    <span
     v-for="handle in parsedWhitelist"
     :key="handle"
     class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-mono"
    >@{{ handle }}</span>
   </div>
   <div>
    <p class="text-[12px] font-semibold pt-1.5 flex justify-between border-t border-border">
      黑名单
      <span class="text-red-500!">{{ parsedBlacklist.length }}</span>
    </p>
    <p class="text-[10px] text-secondary-text mt-0.5">强制隐藏这些作者的全部评论</p>
   </div>
   <textarea
    class="w-full min-h-[100px] rounded-md border border-border bg-body-bg p-2 text-[12px] font-mono focus:border-accent outline-none resize-y"
    :value="blacklist"
    @input="(e: Event) => updateBlacklist((e.target as HTMLTextAreaElement).value)"
    @blur="flushList(KeySpamBlacklist)"
    placeholder="@spam123"
   />
   <div v-if="parsedBlacklist.length" class="flex flex-wrap gap-1">
    <span
     v-for="handle in parsedBlacklist"
     :key="handle"
     class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-mono"
    >@{{ handle }}</span>
   </div>
  </div>

  <!-- <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2">
  
  </div> -->
 </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import {
  KeyQuickListAdderEnabled,
  KeyQuickListNavEnabled,
  KeyQuickListNavPosition,
  KeyQuickLists,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { extractListId, toPlainQuickLists, sortQuickLists, type QuickListItem } from '../../../../shared/quick-list'

const adderEnabled = ref(true)
const navEnabled = ref(true)
const navPosition = ref<'top' | 'sidebar'>('top')
const lists = ref<QuickListItem[]>([])
const manualInput = ref('')
const isSyncing = ref(false)
const noticeMessage = ref('')
const noticeIsError = ref(false)
const filterTab = ref<'all' | 'pinned' | 'owned' | 'followed'>('all')

let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(msg: string, isErr = false) {
  noticeMessage.value = msg
  noticeIsError.value = isErr
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    noticeMessage.value = ''
  }, 2800)
}

onMounted(async () => {
  const stored = await getStorage([
    KeyQuickListAdderEnabled,
    KeyQuickListNavEnabled,
    KeyQuickListNavPosition,
    KeyQuickLists,
  ])
  adderEnabled.value = stored[KeyQuickListAdderEnabled] !== 'off'
  navEnabled.value = stored[KeyQuickListNavEnabled] !== 'off'
  navPosition.value = (stored[KeyQuickListNavPosition] === 'sidebar' ? 'sidebar' : 'top')

  lists.value = toPlainQuickLists(stored[KeyQuickLists])
})

async function toggleAdder(val: boolean) {
  adderEnabled.value = val
  await setStorage({ [KeyQuickListAdderEnabled]: val ? 'on' : 'off' })
}

async function toggleNav(val: boolean) {
  navEnabled.value = val
  await setStorage({ [KeyQuickListNavEnabled]: val ? 'on' : 'off' })
}

async function setNavPos(pos: 'top' | 'sidebar') {
  navPosition.value = pos
  await setStorage({ [KeyQuickListNavPosition]: pos })
}

async function syncListsFromX() {
  if (isSyncing.value) return
  isSyncing.value = true
  showNotice('正在拉取 Lists…')

  try {
    const res = await browser.runtime.sendMessage({ type: 'XF_FETCH_OWNED_LISTS' })
    if (res?.ok && Array.isArray(res.lists)) {
      const fetched: QuickListItem[] = res.lists
      // 合并去重（保留已有项的 isPinned 置顶状态）
      const map = new Map<string, QuickListItem>()
      lists.value.forEach((l) => map.set(l.id, l))
      fetched.forEach((item) => {
        const prev = map.get(item.id)
        map.set(item.id, {
          ...item,
          isPinned: prev ? Boolean(prev.isPinned) : false,
        })
      })
      const plain = toPlainQuickLists(Array.from(map.values()))
      lists.value = plain

      const ok = await setStorage({ [KeyQuickLists]: plain })
      if (ok) {
        const owned = plain.filter((l) => l.isOwned !== false).length
        const followed = plain.filter((l) => l.isOwned === false).length
        showNotice(`已同步 ${plain.length} 个 Lists (${owned} 个创建，${followed} 个关注)`)
      } else {
        showNotice('保存失败，请检查浏览器存储权限', true)
      }
    } else {
      showNotice(res?.error || '拉取失败，请确认已在当前浏览器登录 x.com', true)
    }
  } catch (e: any) {
    showNotice(e?.message || '同步失败', true)
  } finally {
    isSyncing.value = false
  }
}

async function togglePin(item: QuickListItem) {
  item.isPinned = !item.isPinned
  const plain = toPlainQuickLists(lists.value)
  lists.value = plain
  const ok = await setStorage({ [KeyQuickLists]: plain })
  if (ok) {
    showNotice(item.isPinned ? `已置顶「${item.name}」` : `已取消置顶「${item.name}」`)
  }
}

async function addManualList() {
  const input = manualInput.value.trim()
  if (!input) return

  const listId = extractListId(input)
  if (!listId) {
    showNotice('无法识别 List 链接或数字 ID', true)
    return
  }

  if (lists.value.some((l) => l.id === listId)) {
    showNotice('该 List 已存在于列表中', true)
    return
  }

  const newItem: QuickListItem = {
    id: listId,
    name: `List ${listId}`,
    isOwned: true,
  }
  const plain = toPlainQuickLists([...lists.value, newItem])
  lists.value = plain
  const ok = await setStorage({ [KeyQuickLists]: plain })
  if (ok) {
    manualInput.value = ''
    showNotice(`已添加 List (${listId})`)
  } else {
    showNotice('添加失败：存储写入失败', true)
  }
}

async function removeListById(id: string) {
  const target = lists.value.find((l) => l.id === id)
  const plain = toPlainQuickLists(lists.value.filter((l) => l.id !== id))
  lists.value = plain
  const ok = await setStorage({ [KeyQuickLists]: plain })
  if (ok && target) {
    showNotice(`已移除「${target.name}」`)
  }
}

const listCount = computed(() => lists.value.length)
const pinnedCount = computed(() => lists.value.filter((l) => l.isPinned).length)
const ownedCount = computed(() => lists.value.filter((l) => l.isOwned !== false).length)
const followedCount = computed(() => lists.value.filter((l) => l.isOwned === false).length)

const displayLists = computed(() => {
  const sorted = sortQuickLists(lists.value)
  if (filterTab.value === 'pinned') return sorted.filter((l) => l.isPinned)
  if (filterTab.value === 'owned') return sorted.filter((l) => l.isOwned !== false)
  if (filterTab.value === 'followed') return sorted.filter((l) => l.isOwned === false)
  return sorted
})
</script>

<template>
  <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2.5">
    <!-- 头部与总开关 -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <span class="text-accent flex items-center">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>
          </svg>
        </span>
        <span class="text-[13px] font-semibold text-color-text">X Lists 快捷助手</span>
        <span
          v-if="listCount > 0"
          class="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-accent/15 text-accent"
        >
          {{ listCount }}
        </span>
      </div>

      <button
        @click="syncListsFromX"
        :disabled="isSyncing"
        class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border border-accent/40 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 cursor-pointer"
        title="从 X 网页端读取当前登录账号拥有的 Lists"
      >
        <span v-if="isSyncing" class="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin"></span>
        {{ isSyncing ? '同步中…' : '从 X 同步' }}
      </button>
    </div>

    <!-- 提示条 -->
    <div
      v-if="noticeMessage"
      :class="[
        'px-2 py-1 rounded text-[11px] font-medium transition-all',
        noticeIsError ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'
      ]"
    >
      {{ noticeMessage }}
    </div>

    <!-- 子开关：卡片加 List & 导航栏入口 -->
    <div class="grid grid-cols-2 gap-2 pt-0.5">
      <div class="flex items-center justify-between px-2 py-1.5 rounded-lg bg-body-bg/60 border border-border/40">
        <span class="text-[11px] font-medium text-color-text">资料卡加 List</span>
        <SwitchRoot
          :model-value="adderEnabled"
          @update:model-value="(v) => toggleAdder(!!v)"
          class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
          :class="adderEnabled ? 'bg-accent' : 'bg-secondary-text/40'"
        >
          <SwitchThumb
            class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
            :class="adderEnabled ? 'translate-x-[15px]' : 'translate-x-0.5'"
          />
        </SwitchRoot>
      </div>

      <div class="flex items-center justify-between px-2 py-1.5 rounded-lg bg-body-bg/60 border border-border/40">
        <span class="text-[11px] font-medium text-color-text">导航栏快捷入口</span>
        <SwitchRoot
          :model-value="navEnabled"
          @update:model-value="(v) => toggleNav(!!v)"
          class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
          :class="navEnabled ? 'bg-accent' : 'bg-secondary-text/40'"
        >
          <SwitchThumb
            class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
            :class="navEnabled ? 'translate-x-[15px]' : 'translate-x-0.5'"
          />
        </SwitchRoot>
      </div>
    </div>

    <!-- 入口位置选择 -->
    <div v-if="navEnabled" class="flex items-center justify-between px-2 py-1 rounded-lg bg-body-bg/40 border border-border/30 text-[11px]">
      <span class="text-secondary-text">入口位置</span>
      <div class="flex gap-1">
        <button
          @click="setNavPos('top')"
          :class="[
            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer',
            navPosition === 'top' ? 'bg-accent text-white' : 'text-color-text hover:bg-card-bg'
          ]"
        >
          顶部 (Home上方)
        </button>
        <button
          @click="setNavPos('sidebar')"
          :class="[
            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer',
            navPosition === 'sidebar' ? 'bg-accent text-white' : 'text-color-text hover:bg-card-bg'
          ]"
        >
          列表区 (常规位置)
        </button>
      </div>
    </div>

    <!-- 手动添加输入框 -->
    <div class="flex gap-1.5">
      <input
        v-model="manualInput"
        @keydown.enter="addManualList"
        type="text"
        placeholder="粘贴 List 链接或纯数字 ID"
        class="flex-1 px-2.5 py-1 text-[12px] rounded-lg border border-border bg-body-bg text-color-text placeholder:text-secondary-text/60 focus:border-accent outline-none"
      />
      <button
        @click="addManualList"
        class="px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
      >
        添加
      </button>
    </div>

    <!-- 分类筛选 Tab -->
    <div v-if="lists.length && (pinnedCount > 0 || followedCount > 0)" class="flex gap-1 overflow-x-auto pb-0.5">
      <button
        @click="filterTab = 'all'"
        :class="[
          'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer shrink-0',
          filterTab === 'all' ? 'bg-accent text-white' : 'bg-body-bg text-secondary-text hover:text-color-text'
        ]"
      >
        全部 ({{ lists.length }})
      </button>
      <button
        v-if="pinnedCount > 0"
        @click="filterTab = 'pinned'"
        :class="[
          'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer shrink-0',
          filterTab === 'pinned' ? 'bg-accent text-white' : 'bg-body-bg text-secondary-text hover:text-color-text'
        ]"
      >
        置顶 ({{ pinnedCount }})
      </button>
      <button
        @click="filterTab = 'owned'"
        :class="[
          'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer shrink-0',
          filterTab === 'owned' ? 'bg-accent text-white' : 'bg-body-bg text-secondary-text hover:text-color-text'
        ]"
      >
        创建 ({{ ownedCount }})
      </button>
      <button
        v-if="followedCount > 0"
        @click="filterTab = 'followed'"
        :class="[
          'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors cursor-pointer shrink-0',
          filterTab === 'followed' ? 'bg-accent text-white' : 'bg-body-bg text-secondary-text hover:text-color-text'
        ]"
      >
        关注 ({{ followedCount }})
      </button>
    </div>

    <!-- Lists 列表 -->
    <div v-if="displayLists.length" class="max-h-[170px] overflow-y-auto flex flex-col gap-1 pr-0.5">
      <div
        v-for="l in displayLists"
        :key="l.id"
        class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-body-bg border border-border/50 text-[12px] group hover:border-border transition-colors"
      >
        <!-- 置顶切换按钮 -->
        <button
          @click="togglePin(l)"
          :class="[
            'mr-2 text-[13px] transition-all cursor-pointer p-0.5 shrink-0',
            l.isPinned ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-100'
          ]"
          :title="l.isPinned ? '点击取消置顶' : '点击置顶此列表'"
        >
          {{ l.isPinned ? '📌' : '📍' }}
        </button>

        <div class="flex flex-col min-w-0 flex-1 mr-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-medium text-color-text truncate" :title="l.name">{{ l.name }}</span>
            <span
              v-if="l.isPinned"
              class="px-1 py-0.2 rounded text-[9px] font-semibold bg-accent/15 text-accent shrink-0"
            >
              置顶
            </span>
            <span
              v-if="l.isOwned === false"
              class="px-1 py-0.2 rounded text-[9px] font-medium border border-border text-secondary-text shrink-0"
              :title="l.ownerHandle ? '创建者: @' + l.ownerHandle : '关注的列表'"
            >
              关注
            </span>
          </div>
          <div class="flex items-center gap-1 text-[10px] text-secondary-text font-mono truncate">
            <span>id: {{ l.id }}</span>
            <span v-if="l.ownerHandle" class="text-secondary-text/80 truncate">· @{{ l.ownerHandle }}</span>
          </div>
        </div>

        <button
          @click="removeListById(l.id)"
          class="text-secondary-text hover:text-red-500 transition-colors px-1 text-[14px] leading-none cursor-pointer shrink-0"
          title="移除此 List"
        >
          ×
        </button>
      </div>
    </div>
    <div
      v-else
      class="text-center py-3 text-[11px] text-secondary-text bg-body-bg/40 rounded-lg border border-border/30"
    >
      {{ lists.length ? '当前分类下暂无 List' : '暂无配置的 List，可点击右上角「从 X 同步」拉取您的列表' }}
    </div>
  </div>
</template>

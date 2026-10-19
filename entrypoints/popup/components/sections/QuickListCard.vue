<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import FeatureCard from '../ui/FeatureCard.vue'
import SubRow from '../ui/SubRow.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import {
  KeyQuickListAdderEnabled,
  KeyQuickListNavEnabled,
  KeyQuickListNavPosition,
  KeyQuickLists,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { extractListId, toPlainQuickLists, sortQuickLists, type QuickListItem } from '../../../../shared/quick-list'
import { useI18n } from '../../composables/useI18n'
import { errorText } from '../../../../shared/errors'

const { t } = useI18n()

const adderEnabled = ref(true)
const navEnabled = ref(true)
const navPosition = ref<'top' | 'sidebar'>('top')
const lists = ref<QuickListItem[]>([])
const manualInput = ref('')
const isSyncing = ref(false)
const noticeMessage = ref('')
const noticeIsError = ref(false)
const filterTab = ref<'all' | 'pinned' | 'owned' | 'followed'>('all')

const navPositionOptions = computed(() => [
  { value: 'top', label: t('quickLists.positionTop') },
  { value: 'sidebar', label: t('quickLists.positionSidebar') },
])

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

async function setNavPos(value: string) {
  const pos = value === 'sidebar' ? 'sidebar' : 'top'
  navPosition.value = pos
  await setStorage({ [KeyQuickListNavPosition]: pos })
}

async function syncListsFromX() {
  if (isSyncing.value) return
  isSyncing.value = true
  showNotice(t('quickLists.reading'))

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
        showNotice(t('quickLists.synced', { total: plain.length, owned, followed }))
      } else {
        showNotice(t('quickLists.saveFailed'), true)
      }
    } else {
      showNotice(errorText(res?.error) || t('quickLists.readFailed'), true)
    }
  } catch (e: any) {
    showNotice(e?.message || t('quickLists.syncFailed'), true)
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
    showNotice(t(item.isPinned ? 'quickLists.pinned' : 'quickLists.unpinned', { name: item.name }))
  }
}

async function addManualList() {
  const input = manualInput.value.trim()
  if (!input) return

  const listId = extractListId(input)
  if (!listId) {
    showNotice(t('quickLists.badLink'), true)
    return
  }

  if (lists.value.some((l) => l.id === listId)) {
    showNotice(t('quickLists.exists'), true)
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
    showNotice(t('quickLists.addedList', { id: listId }))
  } else {
    showNotice(t('quickLists.addFailed'), true)
  }
}

async function removeListById(id: string) {
  const target = lists.value.find((l) => l.id === id)
  const plain = toPlainQuickLists(lists.value.filter((l) => l.id !== id))
  lists.value = plain
  const ok = await setStorage({ [KeyQuickLists]: plain })
  if (ok && target) {
    showNotice(t('quickLists.removed', { name: target.name }))
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
  <FeatureCard feature-id="quickLists" :details-label="t('quickLists.manage')">
    <SubRow :title="t('quickLists.adder')" :where="t('quickLists.adderWhere')">
      <SwitchToggle :model-value="adderEnabled" :label="t('quickLists.adder')" @update:model-value="toggleAdder" />
    </SubRow>
    <SubRow :title="t('quickLists.navEntry')" :where="t('quickLists.navEntryWhere')">
      <SwitchToggle :model-value="navEnabled" :label="t('quickLists.navEntry')" @update:model-value="toggleNav" />
    </SubRow>
    <SubRow v-if="navEnabled" :title="t('quickLists.position')">
      <SegmentedControl :model-value="navPosition" :options="navPositionOptions" @update:model-value="setNavPos" />
    </SubRow>

    <template #status>
      {{ listCount > 0 ? t('quickLists.saved', { count: listCount }) : t('quickLists.noneSaved') }}
    </template>

    <template #details>
      <!-- 提示条 -->
      <div
        v-if="noticeMessage"
        :class="[
          'px-3 py-2 rounded-control text-xs',
          noticeIsError ? 'bg-sunken-bg text-danger' : 'bg-accent-subtle text-accent-subtle-text'
        ]"
      >
        {{ noticeMessage }}
      </div>

      <!-- 同步与手动添加 -->
      <div class="flex gap-2">
        <input
          v-model="manualInput"
          @keydown.enter="addManualList"
          type="text"
          :placeholder="t('quickLists.inputPlaceholder')"
          class="flex-1 min-w-0 h-8 px-3 text-xs rounded-control border border-border-strong bg-sunken-bg text-text placeholder:text-muted-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring outline-none"
        />
        <button
          @click="addManualList"
          class="h-8 px-3 text-xs font-semibold rounded-control bg-accent text-on-accent hover:bg-accent-hover transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        >
          {{ t('common.add') }}
        </button>
        <button
          @click="syncListsFromX"
          :disabled="isSyncing"
          class="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-control border border-border-strong text-accent-text hover:border-accent hover:bg-accent-subtle transition-colors disabled:opacity-50 cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          :title="t('quickLists.syncTitle')"
        >
          <span v-if="isSyncing" class="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin"></span>
          {{ isSyncing ? t('quickLists.syncing') : t('quickLists.syncFromX') }}
        </button>
      </div>

      <!-- 分类筛选 -->
      <div v-if="lists.length && (pinnedCount > 0 || followedCount > 0)" class="flex gap-1 overflow-x-auto pb-1">
        <button
          @click="filterTab = 'all'"
          :class="[
            'min-h-6 px-3 rounded-full text-xs transition-colors cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring',
            filterTab === 'all' ? 'bg-accent-subtle text-accent-subtle-text font-semibold' : 'bg-sunken-bg text-secondary-text hover:text-text'
          ]"
        >
          {{ t('quickLists.filterAll', { count: lists.length }) }}
        </button>
        <button
          v-if="pinnedCount > 0"
          @click="filterTab = 'pinned'"
          :class="[
            'min-h-6 px-3 rounded-full text-xs transition-colors cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring',
            filterTab === 'pinned' ? 'bg-accent-subtle text-accent-subtle-text font-semibold' : 'bg-sunken-bg text-secondary-text hover:text-text'
          ]"
        >
          {{ t('quickLists.filterPinned', { count: pinnedCount }) }}
        </button>
        <button
          @click="filterTab = 'owned'"
          :class="[
            'min-h-6 px-3 rounded-full text-xs transition-colors cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring',
            filterTab === 'owned' ? 'bg-accent-subtle text-accent-subtle-text font-semibold' : 'bg-sunken-bg text-secondary-text hover:text-text'
          ]"
        >
          {{ t('quickLists.filterOwned', { count: ownedCount }) }}
        </button>
        <button
          v-if="followedCount > 0"
          @click="filterTab = 'followed'"
          :class="[
            'min-h-6 px-3 rounded-full text-xs transition-colors cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring',
            filterTab === 'followed' ? 'bg-accent-subtle text-accent-subtle-text font-semibold' : 'bg-sunken-bg text-secondary-text hover:text-text'
          ]"
        >
          {{ t('quickLists.filterFollowed', { count: followedCount }) }}
        </button>
      </div>

      <!-- Lists 列表 -->
      <div v-if="displayLists.length" class="max-h-44 overflow-y-auto flex flex-col gap-1 pr-1">
        <div
          v-for="l in displayLists"
          :key="l.id"
          class="flex items-center justify-between gap-2 px-3 py-2 rounded-control bg-sunken-bg text-xs"
        >
          <div class="flex flex-col min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-normal text-text truncate" :title="l.name">{{ l.name }}</span>
              <span
                v-if="l.isOwned === false"
                class="px-2 py-0.5 rounded-full text-xs bg-card-bg text-secondary-text shrink-0"
                :title="l.ownerHandle ? t('quickLists.ownerTitle', { handle: l.ownerHandle }) : t('quickLists.followedTitle')"
              >
                {{ t('quickLists.followedBadge') }}
              </span>
            </div>
            <div class="flex items-center gap-1 text-xs text-muted-text font-mono truncate">
              <span>id: {{ l.id }}</span>
              <span v-if="l.ownerHandle" class="text-muted-text truncate">· @{{ l.ownerHandle }}</span>
            </div>
          </div>

          <button
            @click="togglePin(l)"
            :class="[
              'min-h-6 px-2 rounded-control text-xs border transition-colors cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring',
              l.isPinned ? 'border-accent text-accent-subtle-text bg-accent-subtle' : 'border-border-strong text-secondary-text hover:text-text'
            ]"
            :title="l.isPinned ? t('quickLists.unpinTitle') : t('quickLists.pinTitle')"
          >
            {{ l.isPinned ? t('quickLists.pinnedButton') : t('quickLists.pin') }}
          </button>
          <button
            @click="removeListById(l.id)"
            class="flex items-center justify-center w-6 h-6 rounded-control text-muted-text hover:text-danger hover:bg-card-bg transition-colors text-sm leading-none cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            :title="t('quickLists.removeTitle')"
            :aria-label="t('quickLists.removeLabel', { name: l.name })"
          >
            ×
          </button>
        </div>
      </div>
      <div
        v-else
        class="text-center px-3 py-4 text-xs text-muted-text bg-sunken-bg rounded-control"
      >
        {{ lists.length ? t('quickLists.emptyFilter') : t('quickLists.emptyAll') }}
      </div>
    </template>
  </FeatureCard>
</template>

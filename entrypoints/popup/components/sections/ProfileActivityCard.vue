<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { KeyProfileActivityStats } from '../../../../storage-keys'
import { getStorage } from '../../../../content-scripts/utilities/storage'
import type { ProfileActivitySummary } from '../../../../shared/profile-activity'
import FeatureCard from '../ui/FeatureCard.vue'

const profileActivity = ref<ProfileActivitySummary | null>(null)
const scanning = ref(false)
const scanFeedback = ref<string | null>(null)
const currentTabHandle = ref<string | null>(null)

const isCurrentProfileActive = computed(() => {
  return Boolean(
    currentTabHandle.value &&
    profileActivity.value &&
    profileActivity.value.profileHandle.toLowerCase() === currentTabHandle.value.toLowerCase(),
  )
})

const profileActivityDays = computed(() => {
  if (!isCurrentProfileActive.value) return []
  return profileActivity.value?.days.slice(0, 7) ?? []
})

async function detectCurrentTabHandle() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const url = tabs[0]?.url
    if (url) {
      const parsed = new URL(url)
      if (
        parsed.hostname.includes('x.com') ||
        parsed.hostname.includes('twitter.com') ||
        parsed.hostname.includes('pro.x.com')
      ) {
        const parts = parsed.pathname.toLowerCase().split('/').filter(Boolean)
        const SYSTEM_ROUTES = new Set([
          'home',
          'explore',
          'notifications',
          'messages',
          'settings',
          'search',
          'i',
          'compose',
          'intent',
          'tos',
          'privacy',
          'jobs',
          'bookmarks',
        ])
        if (parts[0] && !SYSTEM_ROUTES.has(parts[0])) {
          currentTabHandle.value = parts[0]
        }
      }
    }
  } catch {}
}

async function triggerProfileScan() {
  if (scanning.value) return
  scanning.value = true
  scanFeedback.value = null
  profileActivity.value = null
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const activeTab = tabs[0]
    if (!activeTab?.id) {
      scanFeedback.value = '没有找到当前标签页'
      return
    }
    const res = (await browser.tabs.sendMessage(activeTab.id, {
      type: 'XF_SCAN_PROFILE_ACTIVITY',
      days: 7,
    })) as { ok?: boolean; error?: string; stats?: ProfileActivitySummary } | undefined

    if (res?.ok && res.stats) {
      profileActivity.value = res.stats
      scanFeedback.value = '已更新近 7 天活动'
      setTimeout(() => {
        scanFeedback.value = null
      }, 3000)
    } else {
      scanFeedback.value = res?.error || '扫描未完成，请确认当前页面是博主主页'
    }
  } catch {
    scanFeedback.value = '无法连接当前页面，请刷新后重试'
  } finally {
    scanning.value = false
  }
}

function parseProfileActivity(raw: unknown): ProfileActivitySummary | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as ProfileActivitySummary
    if (!parsed.profileHandle || !Array.isArray(parsed.days)) return null
    return parsed
  } catch {
    return null
  }
}

onMounted(async () => {
  void detectCurrentTabHandle()
  profileActivity.value = parseProfileActivity(await getStorage(KeyProfileActivityStats))
})
</script>

<template>
 <!-- 博主活动度：只显示当前标签页对应博主的数据 -->
 <FeatureCard feature-id="profileActivity">
  <template #control>
   <button
    v-if="currentTabHandle"
    type="button"
    @click="triggerProfileScan"
    :disabled="scanning"
    class="px-2.5 py-1 text-[11px] rounded bg-accent text-white font-medium hover:opacity-90 disabled:opacity-40 transition cursor-pointer"
   >
    {{ scanning ? '扫描中…' : '扫描近 7 天' }}
   </button>
  </template>

  <div class="flex items-center justify-between gap-3">
   <p class="text-[11px] text-secondary-text">
    <template v-if="currentTabHandle">@{{ currentTabHandle }} · {{ isCurrentProfileActive ? '近 7 天' : '未扫描' }}</template>
    <template v-else>当前页面不是博主主页</template>
   </p>
   <div v-if="!scanning && isCurrentProfileActive && profileActivity" class="flex gap-3 text-right">
    <div><p class="text-base font-extrabold leading-none">{{ profileActivity.posts }}</p><p class="text-[10px] text-secondary-text mt-0.5">帖子</p></div>
    <div><p class="text-base font-extrabold leading-none">{{ profileActivity.replies }}</p><p class="text-[10px] text-secondary-text mt-0.5">回复</p></div>
   </div>
  </div>

  <p v-if="scanFeedback" class="text-[10px] text-accent leading-tight">{{ scanFeedback }}</p>

  <div v-if="!scanning && isCurrentProfileActive && profileActivityDays.length" class="rounded-lg bg-body-bg border border-border overflow-hidden">
   <div class="grid grid-cols-[1fr_48px_48px] gap-1 px-2 py-1 text-[10px] text-secondary-text border-b border-border">
    <span>日期</span><span class="text-right">帖子</span><span class="text-right">回复</span>
   </div>
   <div v-for="day in profileActivityDays" :key="day.date" class="grid grid-cols-[1fr_48px_48px] gap-1 px-2 py-1 text-[11px] border-b border-border/50 last:border-0">
    <span class="font-mono">{{ day.date }}</span><span class="text-right">{{ day.posts }}</span><span class="text-right">{{ day.replies }}</span>
   </div>
  </div>
  <p v-else-if="scanning" class="text-[11px] text-secondary-text">正在读取近 7 天的帖子和回复…</p>
  <p v-else-if="currentTabHandle" class="text-[11px] text-secondary-text">点击「扫描近 7 天」统计这位博主的帖子数和回复数。</p>
  <p v-else class="text-[11px] text-secondary-text">打开一位博主的主页后可以扫描。</p>
 </FeatureCard>
</template>

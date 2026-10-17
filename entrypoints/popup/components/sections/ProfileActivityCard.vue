<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { KeyProfileActivityStats } from '../../../../storage-keys'
import { getStorage } from '../../../../content-scripts/utilities/storage'
import { saveProfileActivityScan } from '../../../../content-scripts/options/profile-activity'
import { getProfileActivityRoute, type ProfileActivitySummary } from '../../../../shared/profile-activity'
import {
  createProfileActivityBridgeOptions,
  requestProfileActivityFromPage,
} from '../../../../shared/profile-activity-bridge'
import FeatureCard from '../ui/FeatureCard.vue'
import { useSettingsSurface } from '../../modules'

// 扫描依赖“当前标签页是博主主页”，只能在弹窗里使用
const inPopup = useSettingsSurface() === 'popup'

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

type ScanResponse = { ok?: boolean; error?: string; stats?: ProfileActivitySummary }

// 插件更新或重新加载后，已打开页面里的旧内容脚本收不到弹窗消息，但页面里的拦截器还在：
// 直接把抓取请求注入页面，用户不用手动刷新
async function scanViaInjectedRequest(tabId: number, url: string | undefined, days: number): Promise<ScanResponse> {
  const route = url ? getProfileActivityRoute(new URL(url).pathname) : null
  if (!route) return { ok: false, error: '请在博主个人主页使用此功能' }
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    func: requestProfileActivityFromPage,
    args: [createProfileActivityBridgeOptions(route.profileHandle, days)],
  })
  if (!injection?.result) throw new Error('注入的抓取请求没有返回结果')
  return saveProfileActivityScan(route.profileHandle, injection.result, days)
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
    let res: ScanResponse | undefined
    try {
      res = (await browser.tabs.sendMessage(activeTab.id, {
        type: 'XF_SCAN_PROFILE_ACTIVITY',
        days: 7,
      })) as ScanResponse | undefined
    } catch {
      res = await scanViaInjectedRequest(activeTab.id, activeTab.url, 7)
    }

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
  if (inPopup) void detectCurrentTabHandle()
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
    class="h-8 px-3 text-xs font-semibold rounded-control border border-border-strong text-accent-text hover:border-accent hover:bg-accent-subtle disabled:opacity-50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
   >
    {{ scanning ? '扫描中…' : '扫描近 7 天' }}
   </button>
  </template>

  <p v-if="!inPopup" class="text-xs text-secondary-text">在博主主页打开插件弹窗，就可以扫描这位博主近 7 天的活动。</p>

  <div v-else class="flex items-center justify-between gap-3">
   <p class="text-xs text-secondary-text">
    <template v-if="currentTabHandle">@{{ currentTabHandle }} · {{ isCurrentProfileActive ? '近 7 天' : '未扫描' }}</template>
    <template v-else>当前页面不是博主主页</template>
   </p>
   <div v-if="!scanning && isCurrentProfileActive && profileActivity" class="flex gap-3 text-right">
    <div><p class="text-base font-semibold leading-none text-text">{{ profileActivity.posts }}</p><p class="text-xs text-muted-text mt-1">帖子</p></div>
    <div><p class="text-base font-semibold leading-none text-text">{{ profileActivity.replies }}</p><p class="text-xs text-muted-text mt-1">回复</p></div>
   </div>
  </div>

  <p v-if="inPopup && scanFeedback" class="text-xs text-secondary-text leading-normal" role="status">{{ scanFeedback }}</p>

  <template v-if="inPopup">
  <div v-if="!scanning && isCurrentProfileActive && profileActivityDays.length" class="rounded-control bg-sunken-bg overflow-hidden">
   <div class="grid grid-cols-[1fr_3rem_3rem] gap-1 px-3 py-1 text-xs text-muted-text border-b border-border">
    <span>日期</span><span class="text-right">帖子</span><span class="text-right">回复</span>
   </div>
   <div v-for="day in profileActivityDays" :key="day.date" class="grid grid-cols-[1fr_3rem_3rem] gap-1 px-3 py-1 text-xs text-text border-b border-border last:border-0">
    <span class="font-mono">{{ day.date }}</span><span class="text-right">{{ day.posts }}</span><span class="text-right">{{ day.replies }}</span>
   </div>
  </div>
  <p v-else-if="scanning" class="text-xs text-secondary-text">正在读取近 7 天的帖子和回复…</p>
  <p v-else-if="currentTabHandle" class="text-xs text-secondary-text">点击「扫描近 7 天」统计这位博主的帖子数和回复数。</p>
  <p v-else class="text-xs text-secondary-text">打开一位博主的主页后可以扫描。</p>
  </template>
 </FeatureCard>
</template>

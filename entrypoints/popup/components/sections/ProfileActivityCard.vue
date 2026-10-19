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
import { useI18n } from '../../composables/useI18n'
import { errorText, type TransferableError } from '../../../../shared/errors'

const { t } = useI18n()

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

type ScanResponse = { ok?: boolean; error?: TransferableError; stats?: ProfileActivitySummary }

// 插件更新或重新加载后，已打开页面里的旧内容脚本收不到弹窗消息，但页面里的拦截器还在：
// 直接把抓取请求注入页面，用户不用手动刷新
// 只往 X 页面注入；授权过的 AI 服务网址也能拿到 url，要排除
const X_HOSTS = new Set(['x.com', 'pro.x.com', 'twitter.com', 'mobile.twitter.com'])

async function scanViaInjectedRequest(tabId: number, url: string | undefined, days: number): Promise<ScanResponse> {
  const parsed = url ? new URL(url) : null
  const route = parsed && parsed.protocol === 'https:' && X_HOSTS.has(parsed.hostname)
    ? getProfileActivityRoute(parsed.pathname)
    : null
  if (!route) return { ok: false, error: { code: 'error.useOnProfile' } }
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    func: requestProfileActivityFromPage,
    args: [createProfileActivityBridgeOptions(route.profileHandle, days)],
  })
  if (!injection?.result) throw new Error(t('activity.noInjectionResult'))
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
      scanFeedback.value = t('activity.noTab')
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
      scanFeedback.value = t('activity.updated')
      setTimeout(() => {
        scanFeedback.value = null
      }, 3000)
    } else {
      scanFeedback.value = errorText(res?.error) || t('activity.incomplete')
    }
  } catch {
    scanFeedback.value = t('activity.cannotConnect')
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
    {{ scanning ? t('activity.scanning') : t('activity.scan') }}
   </button>
  </template>

  <p v-if="!inPopup" class="text-xs text-secondary-text">{{ t('activity.optionsHint') }}</p>

  <div v-else class="flex items-center justify-between gap-3">
   <p class="text-xs text-secondary-text">
    <template v-if="currentTabHandle">@{{ currentTabHandle }} · {{ isCurrentProfileActive ? t('activity.last7') : t('activity.notScanned') }}</template>
    <template v-else>{{ t('activity.notProfile') }}</template>
   </p>
   <div v-if="!scanning && isCurrentProfileActive && profileActivity" class="flex gap-3 text-right">
    <div><p class="text-base font-semibold leading-none text-text">{{ profileActivity.posts }}</p><p class="text-xs text-muted-text mt-1">{{ t('activity.posts') }}</p></div>
    <div><p class="text-base font-semibold leading-none text-text">{{ profileActivity.replies }}</p><p class="text-xs text-muted-text mt-1">{{ t('activity.replies') }}</p></div>
   </div>
  </div>

  <p v-if="inPopup && scanFeedback" class="text-xs text-secondary-text leading-normal" role="status">{{ scanFeedback }}</p>

  <template v-if="inPopup">
  <div v-if="!scanning && isCurrentProfileActive && profileActivityDays.length" class="rounded-control bg-sunken-bg overflow-hidden">
   <div class="grid grid-cols-[1fr_3rem_3rem] gap-1 px-3 py-1 text-xs text-muted-text border-b border-border">
    <span>{{ t('activity.date') }}</span><span class="text-right">{{ t('activity.posts') }}</span><span class="text-right">{{ t('activity.replies') }}</span>
   </div>
   <div v-for="day in profileActivityDays" :key="day.date" class="grid grid-cols-[1fr_3rem_3rem] gap-1 px-3 py-1 text-xs text-text border-b border-border last:border-0">
    <span class="font-mono">{{ day.date }}</span><span class="text-right">{{ day.posts }}</span><span class="text-right">{{ day.replies }}</span>
   </div>
  </div>
  <p v-else-if="scanning" class="text-xs text-secondary-text">{{ t('activity.reading') }}</p>
  <p v-else-if="currentTabHandle" class="text-xs text-secondary-text">{{ t('activity.clickScan') }}</p>
  <p v-else class="text-xs text-secondary-text">{{ t('activity.openProfile') }}</p>
  </template>
 </FeatureCard>
</template>

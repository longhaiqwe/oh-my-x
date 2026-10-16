<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { KeyCreatorRewardsStats } from '../../../../storage-keys'
import { getStorage } from '../../../../content-scripts/utilities/storage'
import type { CreatorRewardsStats } from '../../../../shared/creator-rewards'
import { isCreatorRewardsStale } from '../../../../shared/creator-rewards'

const stats = ref<CreatorRewardsStats | null>(null)
const loading = ref(false)
const errorMsg = ref<string | null>(null)

const progressPercent = computed(() => {
  if (!stats.value) return 0
  return stats.value.progressPercent
})

const remainingText = computed(() => {
  if (!stats.value) return ''
  const diff = stats.value.targetImpressionsCount - stats.value.impressionsCount
  if (diff <= 0) return '已达成 50 万次目标'
  if (diff >= 1000) {
    return `还差 ${(diff / 1000).toFixed(1)}K 达成目标`
  }
  return `还差 ${diff} 达成目标`
})

const lastUpdatedText = computed(() => {
  if (!stats.value?.updatedAt) return ''
  const d = new Date(stats.value.updatedAt)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  if (isSameDay) {
    return `今日 ${timeStr}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  if (isYesterday) {
    return `昨日 ${timeStr}`
  }

  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timeStr}`
})

async function loadFromStorage() {
  try {
    const raw = await getStorage(KeyCreatorRewardsStats)
    if (typeof raw === 'string') {
      stats.value = JSON.parse(raw) as CreatorRewardsStats
    } else if (raw && typeof raw === 'object') {
      stats.value = raw as CreatorRewardsStats
    }
  } catch {
    // ignore
  }

  // 若尚未有数据，或数据在今天 10:30 分界线前已过期，静默在后台触发同步
  if (!stats.value || isCreatorRewardsStale(stats.value.updatedAt)) {
    void silentRefresh()
  }
}

async function silentRefresh() {
  if (loading.value) return
  try {
    const response = await browser.runtime.sendMessage({
      type: 'XF_FETCH_CREATOR_REWARDS',
    })
    if (response?.ok && response?.stats) {
      stats.value = response.stats as CreatorRewardsStats
      errorMsg.value = null
    }
  } catch {
    // 静默刷新失败不打扰用户
  }
}

async function refreshData() {
  if (loading.value) return
  loading.value = true
  errorMsg.value = null

  try {
    const response = await browser.runtime.sendMessage({
      type: 'XF_FETCH_CREATOR_REWARDS',
    })

    if (response?.ok && response?.stats) {
      stats.value = response.stats as CreatorRewardsStats
    } else {
      errorMsg.value = response?.error || '获取数据失败，请确认已在当前浏览器登录 X'
    }
  } catch (e: any) {
    errorMsg.value = e?.message || '请求失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function openRewardsPage() {
  window.open('https://x.com/i/jf/creators/original_content_rewards', '_blank')
}

onMounted(() => {
  void loadFromStorage()
})
</script>

<template>
  <div class="flex flex-col gap-2.5 p-3.5 rounded-xl border border-border-color/30 bg-card-bg">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <svg class="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 18V6" />
        </svg>
        <span class="text-sm font-semibold text-text">原创内容奖励计划</span>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="lastUpdatedText" class="text-xs text-color-text" title="每日北京时间 10:30 自动同步">
          {{ lastUpdatedText }}
        </span>

        <!-- 刷新按钮 -->
        <button
          type="button"
          :disabled="loading"
          @click="refreshData"
          title="刷新数据"
          class="p-1 rounded text-color-text hover:text-text hover:bg-body-bg/60 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <svg
            class="w-3.5 h-3.5"
            :class="{ 'animate-spin': loading }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </button>

        <!-- 跳转官方页面按钮 -->
        <button
          type="button"
          @click="openRewardsPage"
          title="在网页中打开"
          class="p-1 rounded text-color-text hover:text-text hover:bg-body-bg/60 transition-colors cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 已有数据状态 -->
    <template v-if="stats">
      <!-- 曝光量与进度对比 -->
      <div class="flex items-baseline justify-between mt-0.5">
        <div class="flex items-baseline gap-1.5">
          <span class="text-xl font-bold tracking-tight text-text">
            {{ stats.impressionsText }}
          </span>
          <span class="text-xs text-color-text">
            / {{ stats.targetImpressionsText }}
          </span>
        </div>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
          {{ progressPercent }}%
        </span>
      </div>

      <!-- 进度条 -->
      <div class="w-full bg-border-color/30 rounded-full h-2 overflow-hidden">
        <div
          class="bg-accent h-2 rounded-full transition-all duration-300"
          :style="{ width: `${progressPercent}%` }"
        ></div>
      </div>

      <!-- 说明与差额 -->
      <div class="flex items-center justify-between text-xs text-color-text -mt-1">
        <span>回复不计入曝光</span>
        <span>{{ remainingText }}</span>
      </div>

      <!-- 4项准入条件状态清单 -->
      <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border-color/20 text-xs">
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.premium ? 'text-emerald-500' : 'text-color-text'">
            {{ stats.requirements.premium ? '✓' : '⊗' }}
          </span>
          <span class="text-color-text">Premium 订阅</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.age18 ? 'text-emerald-500' : 'text-color-text'">
            {{ stats.requirements.age18 ? '✓' : '⊗' }}
          </span>
          <span class="text-color-text">年满 18 岁</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.verifiedFollowers ? 'text-emerald-500' : 'text-color-text'">
            {{ stats.requirements.verifiedFollowers ? '✓' : '⊗' }}
          </span>
          <span class="text-color-text">500 验证粉丝</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.impressionsMet ? 'text-emerald-500' : 'text-amber-500'">
            {{ stats.requirements.impressionsMet ? '✓' : '⊗' }}
          </span>
          <span :class="stats.requirements.impressionsMet ? 'text-color-text' : 'text-text font-medium'">
            50 万验证曝光
          </span>
        </div>
      </div>

      <!-- 每日刷新说明 -->
      <div class="flex items-center justify-between text-[11px] text-color-text/70 pt-1 border-t border-border-color/15">
        <span>每日 10:30 自动刷新</span>
        <span>按天结算统计</span>
      </div>
    </template>

    <!-- 无数据状态 -->
    <template v-else>
      <div class="flex flex-col items-center justify-center py-2 text-center">
        <p class="text-xs text-color-text mb-2.5">
          尚未同步收益计划数据，点击下方按钮从接口静默拉取。
        </p>
        <button
          type="button"
          :disabled="loading"
          @click="refreshData"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <svg
            class="w-3.5 h-3.5"
            :class="{ 'animate-spin': loading }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
          {{ loading ? '正在从接口获取...' : '获取最新进度' }}
        </button>
      </div>
    </template>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="text-xs text-rose-500 pt-1 border-t border-border-color/20">
      {{ errorMsg }}
    </div>
  </div>
</template>

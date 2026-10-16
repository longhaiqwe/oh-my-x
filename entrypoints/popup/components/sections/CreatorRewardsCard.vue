<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { KeyCreatorRewardsStats } from '../../../../storage-keys'
import { getStorage } from '../../../../content-scripts/utilities/storage'
import type { CreatorRewardsStats } from '../../../../shared/creator-rewards'
import { isCreatorRewardsStale } from '../../../../shared/creator-rewards'
import FeatureCard from '../ui/FeatureCard.vue'

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
    return `今天 ${timeStr}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()

  if (isYesterday) {
    return `昨天 ${timeStr}`
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
  <FeatureCard feature-id="creatorRewards">
    <template #control>
      <div class="flex items-center gap-1">
        <span v-if="lastUpdatedText" class="text-[10px] text-secondary-text mr-0.5" title="每天北京时间 10:30 自动更新">
          {{ lastUpdatedText }}
        </span>
        <button
          type="button"
          :disabled="loading"
          @click="refreshData"
          title="刷新数据"
          aria-label="刷新数据"
          class="p-1 rounded text-secondary-text hover:text-text hover:bg-body-bg/60 transition-colors disabled:opacity-50 cursor-pointer"
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
        <button
          type="button"
          @click="openRewardsPage"
          title="在 X 中打开"
          aria-label="在 X 中打开奖励计划页面"
          class="p-1 rounded text-secondary-text hover:text-text hover:bg-body-bg/60 transition-colors cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>
    </template>

    <template v-if="stats">
      <!-- 曝光量与进度 -->
      <div class="flex items-baseline justify-between">
        <div class="flex items-baseline gap-1.5">
          <span class="text-xl font-bold tracking-tight text-text">{{ stats.impressionsText }}</span>
          <span class="text-xs text-secondary-text">/ {{ stats.targetImpressionsText }}</span>
        </div>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
          {{ progressPercent }}%
        </span>
      </div>
      <div class="w-full bg-border rounded-full h-2 overflow-hidden">
        <div class="bg-accent h-2 rounded-full transition-all duration-300" :style="{ width: `${progressPercent}%` }"></div>
      </div>
      <div class="flex items-center justify-between text-[11px] text-secondary-text -mt-0.5">
        <span>回复不计入曝光</span>
        <span>{{ remainingText }}</span>
      </div>

      <!-- 4 项准入条件 -->
      <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border/60 text-[11px]">
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.premium ? 'text-emerald-500' : 'text-secondary-text'">
            {{ stats.requirements.premium ? '✓' : '⊗' }}
          </span>
          <span class="text-secondary-text">Premium 订阅</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.age18 ? 'text-emerald-500' : 'text-secondary-text'">
            {{ stats.requirements.age18 ? '✓' : '⊗' }}
          </span>
          <span class="text-secondary-text">年满 18 岁</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.verifiedFollowers ? 'text-emerald-500' : 'text-secondary-text'">
            {{ stats.requirements.verifiedFollowers ? '✓' : '⊗' }}
          </span>
          <span class="text-secondary-text">500 验证粉丝</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span :class="stats.requirements.impressionsMet ? 'text-emerald-500' : 'text-amber-500'">
            {{ stats.requirements.impressionsMet ? '✓' : '⊗' }}
          </span>
          <span :class="stats.requirements.impressionsMet ? 'text-secondary-text' : 'text-text font-medium'">
            50 万验证曝光
          </span>
        </div>
      </div>

      <div class="flex items-center justify-between text-[10px] text-secondary-text/80">
        <span>每天 10:30 自动更新</span>
        <span>按天统计</span>
      </div>
    </template>

    <!-- 无数据 -->
    <div v-else class="flex flex-col items-center justify-center py-1 text-center">
      <p class="text-[11px] text-secondary-text mb-2">还没有数据。点击下方按钮从 X 获取。</p>
      <button
        type="button"
        :disabled="loading"
        @click="refreshData"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors cursor-pointer"
      >
        {{ loading ? '获取中…' : '获取数据' }}
      </button>
    </div>

    <p v-if="errorMsg" class="text-[11px] text-rose-500 pt-1 border-t border-border/60">
      {{ errorMsg }}
    </p>
  </FeatureCard>
</template>

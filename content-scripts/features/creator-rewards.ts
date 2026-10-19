import { ACCOUNT_OVERVIEW_QUERY_TYPE, CREATOR_REWARDS_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { KeyAccountOverviewQueryId } from '../../storage-keys'
import { getStorage, setStorage } from '../utilities/storage'
import { persistCreatorRewardsStats } from '../../shared/creator-rewards-daily'
import {
  parseCreatorRewardsPayload,
  parseNumberWithUnit,
  REWARDS_PAGE_MARKERS,
  TARGET_IMPRESSIONS_COUNT,
  TARGET_IMPRESSIONS_TEXT,
  type CreatorRewardsStats,
} from '../../shared/creator-rewards'

let isListening = false

function saveStats(stats: CreatorRewardsStats) {
  persistCreatorRewardsStats(stats).catch(() => {
    // 扩展上下文失效等情况下忽略
  })
}

async function saveAccountOverviewQueryId(queryId: unknown) {
  if (typeof queryId !== 'string' || !/^[A-Za-z0-9_-]{10,64}$/.test(queryId)) return
  if ((await getStorage(KeyAccountOverviewQueryId)) === queryId) return
  await setStorage({ [KeyAccountOverviewQueryId]: queryId })
}

/**
 * 监听来自 MAIN world 拦截器广播的创作者奖励指标数据并写入本地存储
 */
export function listenForCreatorRewardsApi() {
  if (isListening) return
  isListening = true

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!event.data || event.data.__xf !== XF_BRIDGE_MARKER) return

    if (event.data.type === ACCOUNT_OVERVIEW_QUERY_TYPE) {
      void saveAccountOverviewQueryId(event.data.queryId)
      return
    }
    if (event.data.type !== CREATOR_REWARDS_TYPE) return

    try {
      const stats = event.data.payload as CreatorRewardsStats
      if (stats && typeof stats === 'object' && typeof stats.impressionsCount === 'number') {
        saveStats(stats)
      }
    } catch {
      // 忽略落库异常
    }
  })
}

/**
 * 在页面 DOM 渲染时，若当前处于创作者奖励页面，直接从 DOM 中提取进度与指标作为双重保险
 */
export function scanCreatorRewardsFromDom(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.location.pathname.includes('creators/original_content_rewards')) {
    return false
  }

  try {
    // 页面上要有曝光数字旁的说明文字（中文或英文界面）
    const bodyText = document.body.innerText || ''
    if (!REWARDS_PAGE_MARKERS.some((marker) => bodyText.includes(marker))) {
      return false
    }

    // 匹配页面中紧邻进度条的曝光数值（例如 "219.6K", "217.6K"）
    const match = bodyText.match(
      /(?:已验证首页时间线曝光|时间线曝光|回复不计入曝光|Verified Home Timeline impressions)[\s\S]{0,100}?(\d+(?:\.\d+)?\s*[KM万])/,
    ) || bodyText.match(/(\d+(?:\.\d+)?\s*[KM万])[\s\S]{0,80}?(?:回复不计入曝光|Does not include replies)/)

    if (match && match[1]) {
      const impressionsText = match[1].trim()
      const impressionsCount = parseNumberWithUnit(impressionsText)

      // 仅在合法且不是目标值 500K 时采纳
      if (impressionsCount > 0 && impressionsCount !== TARGET_IMPRESSIONS_COUNT) {
        const progressPercent = Math.min(
          100,
          Math.max(
            0,
            Math.round((impressionsCount / TARGET_IMPRESSIONS_COUNT) * 1000) / 10,
          ),
        )

        const impressionsMet = impressionsCount >= TARGET_IMPRESSIONS_COUNT

        const stats: CreatorRewardsStats = {
          impressionsText,
          impressionsCount,
          targetImpressionsCount: TARGET_IMPRESSIONS_COUNT,
          targetImpressionsText: TARGET_IMPRESSIONS_TEXT,
          progressPercent,
          requirements: {
            premium: true,
            age18: true,
            verifiedFollowers: true,
            impressionsMet,
          },
          updatedAt: Date.now(),
        }

        saveStats(stats)
        return true
      }
    }

    // 若未通过正则直接提取到，尝试通用 payload 解析器从 bodyText 中提取
    const fallbackStats = parseCreatorRewardsPayload(bodyText)
    if (fallbackStats && fallbackStats.impressionsCount > 0) {
      saveStats(fallbackStats)
      return true
    }
  } catch {
    // 忽略 DOM 解析异常
  }

  return false
}

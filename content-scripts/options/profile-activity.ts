import {
  collectProfileActivity,
  getOldestActivityTimestamp,
  getProfileActivityRoute,
  summarizeProfileActivity,
  type ProfileActivitySummary,
} from '../../shared/profile-activity'
import {
  createProfileActivityBridgeOptions,
  requestProfileActivityFromPage,
  type ProfileActivityBridgeResult,
} from '../../shared/profile-activity-bridge'
import { KeyProfileActivityStats } from '../../storage-keys'
import { setStorage } from '../utilities/storage'

const MAX_SEEN_ENTRIES = 500
let activeProfileHandle = ''
let lastSnapshot = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
const seenEntries = new Map<string, ReturnType<typeof collectProfileActivity>[number]>()

function pruneSeenEntries() {
  while (seenEntries.size > MAX_SEEN_ENTRIES) {
    const firstKey = seenEntries.keys().next().value
    if (firstKey) seenEntries.delete(firstKey)
    else break
  }
}

/**
 * 累计当前会话中已加载的主页条目。仅供单元测试和只读查询，不自动向 storage 写入零散 DOM 数据。
 */
export function updateProfileActivityStats(days = 7): ProfileActivitySummary | null {
  const route = getProfileActivityRoute(window.location.pathname)
  if (!route) return null

  if (route.profileHandle !== activeProfileHandle) {
    activeProfileHandle = route.profileHandle
    lastSnapshot = ''
    seenEntries.clear()
  }

  for (const entry of collectProfileActivity(document, route)) {
    seenEntries.set(`${entry.type}:${entry.id}`, entry)
  }
  pruneSeenEntries()

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
  return summarizeProfileActivity(route.profileHandle, seenEntries.values(), {
    cutoffTimestamp: cutoffMs,
  })
}

/**
 * 主动执行近期活动度扫描（后台静默拉取，界面零滚动）
 */
export async function scanProfileActivity(
  days = 7,
): Promise<{ ok: boolean; error?: string; stats?: ProfileActivitySummary }> {
  const route = getProfileActivityRoute(window.location.pathname)
  if (!route) {
    return { ok: false, error: '请在博主个人主页使用此功能' }
  }

  const bgResult = await requestProfileActivityFromPage(
    createProfileActivityBridgeOptions(route.profileHandle, days),
  )
  return saveProfileActivityScan(route.profileHandle, bgResult, days)
}

/**
 * 把拦截器返回的抓取结果汇总成近 N 天统计并保存。弹窗绕过内容脚本直接抓取时也用它。
 */
export async function saveProfileActivityScan(
  profileHandle: string,
  bgResult: ProfileActivityBridgeResult,
  days: number,
): Promise<{ ok: boolean; error?: string; stats?: ProfileActivitySummary }> {
  if (bgResult.ok && bgResult.entries) {
    // 纯粹以完整的后台数据为准，不与局部 DOM 碎片混合
    const summary = summarizeProfileActivity(profileHandle, bgResult.entries, {
      cutoffTimestamp: Date.now() - days * 24 * 60 * 60 * 1000,
    })

    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await setStorage({ [KeyProfileActivityStats]: JSON.stringify(summary) })

    return { ok: true, stats: summary }
  }

  // 后台未成功返回时不滚动页面，直接向用户返回清晰说明
  const errorMsg = bgResult.error || '后台数据请求未响应，请按 F5 刷新网页后重试'
  console.warn('[oh-my-x] 后台抓取未成功:', errorMsg)
  return { ok: false, error: errorMsg }
}

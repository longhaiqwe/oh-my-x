import {
  collectProfileActivity,
  getOldestActivityTimestamp,
  getProfileActivityRoute,
  summarizeProfileActivity,
  type ProfileActivityEntry,
  type ProfileActivitySummary,
} from '../../shared/profile-activity'
import {
  XF_BRIDGE_MARKER,
  PROFILE_ACTIVITY_FETCH_REQ_TYPE,
  PROFILE_ACTIVITY_FETCH_RES_TYPE,
} from '../../shared/bridge'
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

function fetchProfileActivityInBackground(
  profileHandle: string,
  days: number,
  timeoutMs = 120000,
): Promise<{ ok: boolean; entries?: ProfileActivityEntry[]; error?: string }> {
  return new Promise((resolve) => {
    const requestId = `paf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let timer: ReturnType<typeof setTimeout> | null = null

    const listener = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (
        data &&
        typeof data === 'object' &&
        data.__xf === XF_BRIDGE_MARKER &&
        data.type === PROFILE_ACTIVITY_FETCH_RES_TYPE &&
        data.requestId === requestId
      ) {
        cleanup()
        resolve({
          ok: data.ok === true,
          entries: Array.isArray(data.entries) ? (data.entries as ProfileActivityEntry[]) : undefined,
          error: typeof data.error === 'string' ? data.error : undefined,
        })
      }
    }

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      window.removeEventListener('message', listener)
    }

    window.addEventListener('message', listener)
    timer = setTimeout(() => {
      cleanup()
      resolve({ ok: false, error: '后台抓取响应超时' })
    }, timeoutMs)

    window.postMessage(
      {
        type: PROFILE_ACTIVITY_FETCH_REQ_TYPE,
        profileHandle,
        days,
        requestId,
        __xf: XF_BRIDGE_MARKER,
      },
      '*',
    )
  })
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

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000

  // 1. 后台无感静默拉取（零滚动，同时采集原创帖子与回复）
  let bgResult: { ok: boolean; entries?: ProfileActivityEntry[]; error?: string }
  try {
    bgResult = await fetchProfileActivityInBackground(route.profileHandle, days)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    bgResult = { ok: false, error: msg }
  }

  if (bgResult.ok && bgResult.entries) {
    // 纯粹以完整的后台数据为准，不与局部 DOM 碎片混合
    const summary = summarizeProfileActivity(route.profileHandle, bgResult.entries, {
      cutoffTimestamp: cutoffMs,
    })

    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await setStorage({ [KeyProfileActivityStats]: JSON.stringify(summary) })

    return { ok: true, stats: summary }
  }

  // 2. 若后台未成功返回，不再滚动页面，而是直接向用户返回清晰说明
  const errorMsg = bgResult.error || '后台数据请求未响应，请按 F5 刷新网页后重试'
  console.warn('[oh-my-x] 后台抓取未成功:', errorMsg)
  return { ok: false, error: errorMsg }
}

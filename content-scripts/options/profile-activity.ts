import { collectProfileActivity, getProfileActivityRoute, summarizeProfileActivity } from '../../shared/profile-activity'
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
 * 累计当前会话中已加载的主页条目。只观察 DOM，不驱动页面滚动。
 */
export function updateProfileActivityStats() {
  const route = getProfileActivityRoute(window.location.pathname)
  if (!route) return

  if (route.profileHandle !== activeProfileHandle) {
    activeProfileHandle = route.profileHandle
    lastSnapshot = ''
    seenEntries.clear()
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  for (const entry of collectProfileActivity(document, route)) {
    seenEntries.set(`${entry.type}:${entry.id}`, entry)
  }
  pruneSeenEntries()

  const snapshot = JSON.stringify(summarizeProfileActivity(route.profileHandle, seenEntries.values()))
  if (snapshot === lastSnapshot) return
  lastSnapshot = snapshot

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void setStorage({ [KeyProfileActivityStats]: snapshot })
  }, 1500)
}

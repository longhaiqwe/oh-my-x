import {
  KeyCommunitiesButton,
  KeyListsButton, KeyNavigationButtonsLabels,
  KeyTopicsButton, KeyTweetButton,
  KeyXPremiumButton,
  KeyStatRatioTargetHandle,
  KeyStatRatioEnabled,
  KeyHighlightNonFollowers,
  KeyScheduledPanorama,
} from '../../storage-keys'
import {
  addCommunitiesButton, addListsButton,
  addTopicsButton, addXPremiumButton,
  changeNavigationButtonsLabels,
} from '../options/navigation'
import {
  addMediaDownloadButtons,
  syncAccountAnalyticsPageMarker,
} from '../options/timeline'
import { addComposerInsertLinkButton } from '../options/composer'
import { addScheduledRelativeTimes, maintainScheduledPostsCache, removeScheduledPanorama } from '../options/scheduled-time'
import { addStatRatioBadges } from '../options/stat-ratio'
import { updateProfileActivityStats } from '../options/profile-activity'
import { changeTweetButton, changeHighlightNonFollowers } from '../options/interface'
import { getStorage } from '../utilities/storage'
import throttle from '../utilities/throttle'
import type { ExtensionSettings } from '../../shared/settings'

import { runViralRadar } from './viral-radar'
import { injectKeywordButton } from '../spam/keyword-picker'
import { updateArticleToc } from './article-toc'

export type DynamicFeatureScope = 'tweet' | 'composer' | 'scheduled' | 'navigation' | 'all'

// 单飞期间到达的新任务会合并到 pendingScopes，并在本轮结束后补跑，避免遗漏最后一次变更。
let generalInFlight = false
const pendingScopes = new Set<DynamicFeatureScope>()

function includesScope(scopes: ReadonlySet<DynamicFeatureScope>, scope: DynamicFeatureScope) {
  return scopes.has('all') || scopes.has(scope)
}

let cachedTweetSettings: {
  targetHandle: string
  ratioEnabled: boolean
  highlightNonFollowers: string
} | null = null

export function invalidateDynamicSettingsCache() {
  cachedTweetSettings = null
}

async function getCachedTweetSettings() {
  if (!cachedTweetSettings) {
    const data = await getStorage([
      KeyStatRatioTargetHandle,
      KeyStatRatioEnabled,
      KeyHighlightNonFollowers,
    ])
    const ratioEnabled = !data || data[KeyStatRatioEnabled] !== 'off'
    const targetHandle = (data && typeof data[KeyStatRatioTargetHandle] === 'string' && (data[KeyStatRatioTargetHandle] as string).trim())
      ? (data[KeyStatRatioTargetHandle] as string).trim()
      : '*'
    const highlightNonFollowers = String(data?.[KeyHighlightNonFollowers] ?? 'on')
    cachedTweetSettings = { targetHandle, ratioEnabled, highlightNonFollowers }
  }
  return cachedTweetSettings
}

export const dynamicFeatures = {
  general: async (requestedScopes: Iterable<DynamicFeatureScope> = ['all']) => {
    for (const scope of requestedScopes) pendingScopes.add(scope)
    if (generalInFlight) return
    generalInFlight = true

    try {
      while (pendingScopes.size > 0) {
        const scopes = new Set(pendingScopes)
        pendingScopes.clear()

        if (includesScope(scopes, 'tweet')) {
          addMediaDownloadButtons()
          // 推文操作按钮（选词/名单）独立于 spam 过滤器生命周期注入：
          // dynamic observer 总是运行，即使用户关闭净化，新推文上仍会出现这些按钮。
          // injectKeywordButton 自身幂等（KW_BTN_ATTR 标记），与 scanner 内的调用不冲突。
          document
            .querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
            .forEach(injectKeywordButton)
          updateProfileActivityStats()
          void runViralRadar()
          updateArticleToc()
          const s = await getCachedTweetSettings()
          if (s.ratioEnabled) {
            addStatRatioBadges(s.targetHandle)
          } else {
            document.querySelectorAll('.xf-stat-ratio-badge').forEach((el) => el.remove())
          }
          changeHighlightNonFollowers(s.highlightNonFollowers)
        }

        if (includesScope(scopes, 'composer')) {
          addComposerInsertLinkButton()
          updateArticleToc()
        }
        if (includesScope(scopes, 'scheduled')) {
          const schedState = await getStorage(KeyScheduledPanorama)
          if (schedState !== 'off') {
            await addScheduledRelativeTimes('on')
          } else {
            removeScheduledPanorama()
          }
          maintainScheduledPostsCache()
        }
        if (includesScope(scopes, 'navigation')) {
          syncAccountAnalyticsPageMarker()
        }
      }
    } finally {
      generalInFlight = false
    }
  },
  navigation: (data: Record<string, string | number | boolean | undefined>) => {
    changeNavigationButtonsLabels(data[KeyNavigationButtonsLabels] ?? 'always')
  },
  sidebarButtons: async () => {
    const data = await getStorage([KeyListsButton, KeyCommunitiesButton, KeyTopicsButton, KeyXPremiumButton])
    if (!data) return
    if (data[KeyListsButton] === 'on') addListsButton()
    if (data[KeyCommunitiesButton] === 'on') addCommunitiesButton()
    if (data[KeyTopicsButton] === 'on') addTopicsButton()
    if (data[KeyXPremiumButton] === 'on') addXPremiumButton()
  },
}

async function loadDynamicSettings(): Promise<Pick<ExtensionSettings,
  typeof KeyNavigationButtonsLabels |
  typeof KeyTweetButton |
  typeof KeyListsButton |
  typeof KeyCommunitiesButton |
  typeof KeyTopicsButton |
  typeof KeyXPremiumButton
>> {
  return await getStorage([
    KeyNavigationButtonsLabels,
    KeyTweetButton,
    KeyListsButton,
    KeyCommunitiesButton,
    KeyTopicsButton,
    KeyXPremiumButton,
  ]) as Pick<ExtensionSettings,
    typeof KeyNavigationButtonsLabels |
    typeof KeyTweetButton |
    typeof KeyListsButton |
    typeof KeyCommunitiesButton |
    typeof KeyTopicsButton |
    typeof KeyXPremiumButton
  >
}

const queuedRunScopes = new Set<DynamicFeatureScope>()
let queuedSettings: Partial<ExtensionSettings> | undefined

const flushDynamicFeatures = throttle(async () => {
  const scopeSet = new Set(queuedRunScopes)
  queuedRunScopes.clear()
  const settings = queuedSettings
  queuedSettings = undefined

  void dynamicFeatures.general(scopeSet)

  const shouldUpdateNavigation = Boolean(settings) || includesScope(scopeSet, 'navigation')
  if (!shouldUpdateNavigation) return

  const data = settings ?? await loadDynamicSettings()

  if (data) {
    if (settings) {
      if (data[KeyListsButton] === 'on') addListsButton()
      if (data[KeyCommunitiesButton] === 'on') addCommunitiesButton()
      if (data[KeyTopicsButton] === 'on') addTopicsButton()
      if (data[KeyXPremiumButton] === 'on') addXPremiumButton()
    } else {
      await dynamicFeatures.sidebarButtons()
    }
    changeTweetButton(data[KeyTweetButton] ?? 'off', data[KeyNavigationButtonsLabels])
    dynamicFeatures.navigation(data)
  }
}, 50)

export function runDynamicFeatures(
  settings?: Partial<ExtensionSettings>,
  scopes: Iterable<DynamicFeatureScope> = ['all'],
) {
  for (const scope of scopes) queuedRunScopes.add(scope)
  if (settings) queuedSettings = { ...queuedSettings, ...settings }
  flushDynamicFeatures()
}

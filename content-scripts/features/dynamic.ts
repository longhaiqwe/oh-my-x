import {
  KeyCommunitiesButton,
  KeyListsButton, KeyNavigationButtonsLabels,
  KeyTopicsButton, KeyTweetButton,
  KeyXPremiumButton,
  KeyStatRatioTargetHandle,
  KeyStatRatioEnabled,
  KeyHighlightNonFollowers,
  KeyScheduledPanorama,
  KeyBookmarkCount,
  KeyMediaDownload,
} from '../../storage-keys'
import {
  addCommunitiesButton, addListsButton,
  addTopicsButton, addXPremiumButton,
  changeNavigationButtonsLabels,
} from '../options/navigation'
import {
  addMediaDownloadButtons,
  setMediaDownloadEnabled,
  syncAccountAnalyticsPageMarker,
} from '../options/timeline'
import { syncRadarPageMarker } from '../options/radar'
import { addComposerInsertLinkButton } from '../options/composer'
import { addScheduledRelativeTimes, maintainScheduledPostsCache, removeScheduledPanorama } from '../options/scheduled-time'
import { addStatRatioBadges } from '../options/stat-ratio'
import { changeTweetButton, changeHighlightNonFollowers } from '../options/interface'
import { getStorage } from '../utilities/storage'
import { syncXAccentColor } from '../utilities/colors'
import throttle from '../utilities/throttle'
import type { ExtensionSettings } from '../../shared/settings'

import { runViralRadar } from './viral-radar'
import { runTweetFilter } from './tweet-filter'
import { injectKeywordButton } from '../spam/keyword-picker'
import { updateArticleToc } from './article-toc'
import { runQuickListFeature } from './quick-list'
import { updateReplyAssistant } from './reply-assistant'
import { setBookmarkCountEnabled, updateBookmarkCounters } from './bookmark-counter'
import { updateQuickInteraction } from './quick-interaction'
import { updateUserFollowerBadges } from './user-followers'
import { updateAiRepostComposerButton } from './ai-repost'
import { scanCreatorRewardsFromDom } from './creator-rewards'
import { updateScheduledSidebar } from './scheduled-sidebar'

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
  bookmarkCount: boolean
  mediaDownload: boolean
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
      KeyBookmarkCount,
      KeyMediaDownload,
    ])
    const ratioEnabled = !data || data[KeyStatRatioEnabled] !== 'off'
    const targetHandle = (data && typeof data[KeyStatRatioTargetHandle] === 'string' && (data[KeyStatRatioTargetHandle] as string).trim())
      ? (data[KeyStatRatioTargetHandle] as string).trim()
      : '*'
    const highlightNonFollowers = String(data?.[KeyHighlightNonFollowers] ?? 'on')
    const bookmarkCount = data?.[KeyBookmarkCount] !== 'off'
    const mediaDownload = data?.[KeyMediaDownload] !== 'off'
    cachedTweetSettings = { targetHandle, ratioEnabled, highlightNonFollowers, bookmarkCount, mediaDownload }
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

        // 用户在 X 设置里换了强调色后，页面上的浮层跟着变
        syncXAccentColor()

        if (includesScope(scopes, 'tweet')) {
          // 先读开关再注入，关闭状态下不会先画出来再移除
          const s = await getCachedTweetSettings()
          setMediaDownloadEnabled(s.mediaDownload)
          setBookmarkCountEnabled(s.bookmarkCount)
          addMediaDownloadButtons()
          // 推文操作按钮（选词/名单）独立于 spam 过滤器生命周期注入：
          // dynamic observer 总是运行，即使用户关闭净化，新推文上仍会出现这些按钮。
          // injectKeywordButton 自身幂等（KW_BTN_ATTR 标记），与 scanner 内的调用不冲突。
          document
            .querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
            .forEach(injectKeywordButton)
          void runViralRadar()
          void runTweetFilter()
          updateArticleToc()
          updateReplyAssistant()
          updateBookmarkCounters()
          updateQuickInteraction()
          void updateUserFollowerBadges()
          if (s.ratioEnabled) {
            addStatRatioBadges(s.targetHandle)
          } else {
            document.querySelectorAll('.xf-stat-ratio-badge').forEach((el) => el.remove())
          }
          changeHighlightNonFollowers(s.highlightNonFollowers)
          void runQuickListFeature()
        }

        if (includesScope(scopes, 'composer')) {
          addComposerInsertLinkButton()
          void updateAiRepostComposerButton()
          updateArticleToc()
          updateBookmarkCounters()
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
          syncRadarPageMarker()
          void runQuickListFeature()
        }

        // 若当前处于创作者奖励页面，从页面 DOM 实时同步指标
        scanCreatorRewardsFromDom()
        // 右侧栏里的变动不会触发动态功能（isMutationSkippable 跳过了），
        // 每轮都检查一次面板是否还在搜索框下面；没有变化时只做几次 DOM 查询
        void updateScheduledSidebar()
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
    if (data[KeyListsButton] === 'on') {
      addListsButton()
    } else {
      document
        .querySelectorAll('.xf-sidebar-button[aria-label="Lists"], .xf-sidebar-button[aria-label="lists"]')
        .forEach((el) => el.remove())
    }
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
      if (data[KeyListsButton] === 'on') {
        addListsButton()
      } else {
        document
          .querySelectorAll('.xf-sidebar-button[aria-label="Lists"], .xf-sidebar-button[aria-label="lists"]')
          .forEach((el) => el.remove())
      }
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

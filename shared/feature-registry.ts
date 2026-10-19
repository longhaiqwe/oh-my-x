// 功能清单：弹窗按模块分组、功能名称与说明的唯一来源。
// 默认值仍以 storage-keys.ts 的 defaultPreferences 为准，这里只记录归属与文案。
import {
  KeyAiRepostApiKey,
  KeyAiRepostBaseUrl,
  KeyAiRepostCustomPrompt,
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
  KeyAiRepostEnabled,
  KeyAiRepostModel,
  KeyArticleToc,
  KeyArticlesButton,
  KeyAutoLikeOnReply,
  KeyBookmarkCount,
  KeyBookmarksButton,
  KeyChatMoneyButton,
  KeyCommunitiesButton,
  KeyCreatorRewardsStats,
  KeyCreatorRewardsHistory,
  KeyImpressionsDaily,
  KeyAccountOverviewQueryId,
  KeyCreatorRewardsCollapsed,
  KeyExploreButton,
  KeyExtensionStatus,
  KeyGrokButton,
  KeyHighlightNonFollowers,
  KeyHomeButton,
  KeyJobsButton,
  KeyJumpToReplies,
  KeyJumpRepliesPosition,
  KeyListsButton,
  KeyMediaDownload,
  KeyMessagesButton,
  KeyMoreMenuButton,
  KeyNavigationButtonsLabels,
  KeyNavigationWidth,
  KeyNotificationsButton,
  KeyOwnPostAutoSync,
  KeyComposerMediaGrid,
  KeyProfileActivityStats,
  KeyProfileButton,
  KeyQuickInteraction,
  KeyQuickInteractionDock,
  KeyQuickListAdderEnabled,
  KeyQuickListNavEnabled,
  KeyQuickListNavPosition,
  KeyQuickLists,
  KeyRadarWidth,
  KeyRepliesSortOrder,
  KeyScheduledPanorama,
  KeyScheduledPostsCache,
  KeyScheduledSidebar,
  KeyScheduledSidebarCollapsed,
  KeySidebarColumn,
  KeySortRepliesByTime,
  KeySpamBlacklist,
  KeySpamDebugMode,
  KeySpamFilterEnabled,
  KeySpamKeywordList,
  KeySpamLog,
  KeySpamRulesEnabled,
  KeySpamStats,
  KeySpamThreshold,
  KeySpamWhitelist,
  KeyStatRatioEnabled,
  KeyStatRatioTargetHandle,
  KeyTimelineWidth,
  KeyTopicsButton,
  KeyTweetButton,
  KeyTweetFilterAction,
  KeyTweetFilterEnabled,
  KeyTweetFilterKeywords,
  KeyUiLanguage,
  KeyUserFollowerCount,
  KeyVerifiedOrgsButton,
  KeyViralEnableHighlight,
  KeyViralHighlightStyle,
  KeyViralPotentialThreshold,
  KeyViralRadarEnabled,
  KeyViralShowBadge,
  KeyViralShowLevels,
  KeyViralShowNormalBadge,
  KeyViralViralThreshold,
  KeyXPremiumButton,
} from '../storage-keys'
import { hasMessage, t, type Locale, type MessageKey } from './i18n'

export type FeatureModuleId = 'layout' | 'filter' | 'insight' | 'create' | 'engage'

// 模块和功能的文字在 shared/i18n 的文案表里，按 id 取：
// module.<id>.tab（弹窗顶部标签上的短名）/ .title（模块页标题）/ .description（标题下的一句说明）
// feature.<id>.label / .description / .note（补充说明，限制条件或注意事项）/ .where（在 X 页面上的使用位置）
export interface FeatureModule {
  id: FeatureModuleId
}

export interface FeatureDefinition {
  id: string
  module: FeatureModuleId
  /** 该功能读写的存储项（设置项和缓存数据都算） */
  storageKeys: readonly string[]
  /** 从属的主功能 id；弹窗中缩进显示在主功能下面 */
  parent?: string
}

export type ModuleTextField = 'tab' | 'title' | 'description'
export type FeatureTextField = 'label' | 'description' | 'note' | 'where'

export const FEATURE_MODULES: readonly FeatureModule[] = [
  { id: 'layout' },
  { id: 'filter' },
  { id: 'insight' },
  { id: 'create' },
  { id: 'engage' },
]

export const FEATURES: readonly FeatureDefinition[] = [
  // 界面与阅读
  {
    id: 'timelineWidth',
    module: 'layout',
    storageKeys: [KeyTimelineWidth],
  },
  {
    id: 'navigationWidth',
    module: 'layout',
    storageKeys: [KeyNavigationWidth],
  },
  {
    id: 'sidebarColumn',
    module: 'layout',
    storageKeys: [KeySidebarColumn],
  },
  {
    id: 'tweetButton',
    module: 'layout',
    storageKeys: [KeyTweetButton],
  },
  {
    id: 'navigationButtons',
    module: 'layout',
    storageKeys: [
      KeyHomeButton,
      KeyExploreButton,
      KeyNotificationsButton,
      KeyMessagesButton,
      KeyGrokButton,
      KeyXPremiumButton,
      KeyListsButton,
      KeyBookmarksButton,
      KeyJobsButton,
      KeyCommunitiesButton,
      KeyArticlesButton,
      KeyTopicsButton,
      KeyVerifiedOrgsButton,
      KeyProfileButton,
      KeyChatMoneyButton,
      KeyMoreMenuButton,
    ],
  },
  {
    id: 'navigationLabels',
    module: 'layout',
    storageKeys: [KeyNavigationButtonsLabels],
    parent: 'navigationButtons',
  },
  {
    id: 'articleToc',
    module: 'layout',
    storageKeys: [KeyArticleToc],
  },

  // 内容过滤
  {
    id: 'spamFilter',
    module: 'filter',
    storageKeys: [KeySpamFilterEnabled, KeySpamThreshold, KeySpamDebugMode],
  },
  {
    id: 'spamRules',
    module: 'filter',
    storageKeys: [KeySpamRulesEnabled],
    parent: 'spamFilter',
  },
  {
    id: 'spamKeywords',
    module: 'filter',
    storageKeys: [KeySpamKeywordList],
    parent: 'spamFilter',
  },
  {
    id: 'spamAccountLists',
    module: 'filter',
    storageKeys: [KeySpamWhitelist, KeySpamBlacklist],
  },
  {
    id: 'spamLog',
    module: 'filter',
    storageKeys: [KeySpamLog, KeySpamStats],
  },
  {
    id: 'tweetFilter',
    module: 'filter',
    storageKeys: [KeyTweetFilterEnabled, KeyTweetFilterAction, KeyTweetFilterKeywords],
  },

  // 数据洞察
  {
    id: 'creatorRewards',
    module: 'insight',
    storageKeys: [KeyCreatorRewardsStats, KeyCreatorRewardsHistory, KeyImpressionsDaily, KeyAccountOverviewQueryId, KeyCreatorRewardsCollapsed],
  },
  {
    id: 'profileActivity',
    module: 'insight',
    storageKeys: [KeyProfileActivityStats],
  },
  {
    id: 'viralRadar',
    module: 'insight',
    storageKeys: [
      KeyViralRadarEnabled,
      KeyViralPotentialThreshold,
      KeyViralViralThreshold,
      KeyViralShowNormalBadge,
      KeyViralEnableHighlight,
      KeyViralHighlightStyle,
      KeyViralShowLevels,
      KeyViralShowBadge,
    ],
  },
  {
    id: 'statRatio',
    module: 'insight',
    storageKeys: [KeyStatRatioEnabled, KeyStatRatioTargetHandle],
  },
  {
    id: 'followerCount',
    module: 'insight',
    storageKeys: [KeyUserFollowerCount],
  },
  {
    id: 'bookmarkCount',
    module: 'insight',
    storageKeys: [KeyBookmarkCount],
  },

  // 创作与发布
  {
    id: 'ownPosts',
    module: 'create',
    storageKeys: [KeyOwnPostAutoSync],
  },
  {
    id: 'composerMedia',
    module: 'create',
    storageKeys: [KeyComposerMediaGrid],
  },
  {
    id: 'aiRepost',
    module: 'create',
    storageKeys: [
      KeyAiRepostEnabled,
      KeyAiRepostBaseUrl,
      KeyAiRepostApiKey,
      KeyAiRepostModel,
      KeyAiRepostCustomPrompt,
      KeyAiRepostStylePrompt,
      KeyAiRepostStyleSamples,
    ],
  },
  {
    id: 'scheduledPanorama',
    module: 'create',
    storageKeys: [KeyScheduledPanorama, KeyScheduledPostsCache],
  },
  {
    id: 'scheduledSidebar',
    module: 'create',
    storageKeys: [KeyScheduledSidebar, KeyScheduledSidebarCollapsed],
    parent: 'scheduledPanorama',
  },

  // 互动与列表
  {
    id: 'quickInteraction',
    module: 'engage',
    storageKeys: [KeyQuickInteraction],
  },
  {
    id: 'quickInteractionDock',
    module: 'engage',
    storageKeys: [KeyQuickInteractionDock],
    parent: 'quickInteraction',
  },
  {
    id: 'jumpToReplies',
    module: 'engage',
    storageKeys: [KeyJumpToReplies, KeyJumpRepliesPosition],
  },
  {
    id: 'autoLikeOnReply',
    module: 'engage',
    storageKeys: [KeyAutoLikeOnReply],
  },
  {
    id: 'mediaDownload',
    module: 'engage',
    storageKeys: [KeyMediaDownload],
  },
  {
    id: 'nonFollowers',
    module: 'engage',
    storageKeys: [KeyHighlightNonFollowers],
  },
  {
    id: 'quickLists',
    module: 'engage',
    storageKeys: [KeyQuickListAdderEnabled, KeyQuickListNavEnabled, KeyQuickListNavPosition, KeyQuickLists],
  },
]

/** 不属于任何单个功能的全局设置 */
export const GLOBAL_STORAGE_KEYS: readonly string[] = [KeyExtensionStatus, KeyUiLanguage]

/** 已有存储和读取逻辑、但弹窗里暂无入口的设置项 */
export const UNLISTED_STORAGE_KEYS: readonly string[] = [
  KeyRadarWidth, // X Radar 页宽度
  KeySortRepliesByTime, // 回复按时间排序
  KeyRepliesSortOrder,
]

export const DEFAULT_FEATURE_MODULE: FeatureModuleId = 'layout'

const FEATURE_BY_ID = new Map(FEATURES.map((f) => [f.id, f]))

export function getFeature(id: string): FeatureDefinition {
  const feature = FEATURE_BY_ID.get(id)
  if (!feature) throw new Error(`Unknown feature: ${id}`)
  return feature
}

export function getModule(id: FeatureModuleId): FeatureModule {
  const mod = FEATURE_MODULES.find((m) => m.id === id)
  if (!mod) throw new Error(`Unknown feature module: ${id}`)
  return mod
}

export function moduleText(id: FeatureModuleId, field: ModuleTextField, locale?: Locale): string {
  return t(`module.${id}.${field}` as MessageKey, undefined, locale)
}

/** 功能的文字；note / where 只有部分功能有，没有时返回 undefined */
export function featureText(id: string, field: FeatureTextField, locale?: Locale): string | undefined {
  const key = `feature.${id}.${field}`
  return hasMessage(key) ? t(key, undefined, locale) : undefined
}

export function getFeaturesByModule(id: FeatureModuleId): FeatureDefinition[] {
  return FEATURES.filter((f) => f.module === id)
}

export function isFeatureModuleId(value: unknown): value is FeatureModuleId {
  return typeof value === 'string' && FEATURE_MODULES.some((m) => m.id === value)
}

// 旧版弹窗的标签 id → 新模块，让升级用户打开时落在对应模块
const LEGACY_TAB_TO_MODULE: Record<string, FeatureModuleId> = {
  view: 'layout',
  overview: 'insight',
  viral: 'insight',
  rules: 'filter',
  keywords: 'filter',
  lists: 'filter',
  log: 'filter',
}

export function resolvePopupModule(saved: unknown): FeatureModuleId | null {
  if (isFeatureModuleId(saved)) return saved
  if (typeof saved === 'string' && saved in LEGACY_TAB_TO_MODULE) return LEGACY_TAB_TO_MODULE[saved] ?? null
  return null
}

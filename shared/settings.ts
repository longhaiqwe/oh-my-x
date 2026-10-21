import {
  KeyArticlesButton,
  KeyBookmarksButton,
  KeyCommunitiesButton,
  KeyChatMoneyButton,
  KeyExploreButton,
  KeyExtensionStatus,
  KeyUiLanguage,
  KeyGrokButton,
  KeyHomeButton,
  KeyJobsButton,
  KeyListsButton,
  KeyMessagesButton,
  KeyMoreMenuButton,
  KeyNavigationButtonsLabels,
  KeyNavigationWidth,
  KeyNotificationsButton,
  KeyProfileButton,
  KeySidebarColumn,
  KeySpamBlacklist,
  KeySpamDebugMode,
  KeySpamFilterEnabled,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
  KeySpamThreshold,
  KeySpamWhitelist,
  KeyTimelineWidth,
  KeyTopicsButton,
  KeyTweetButton,
  KeyVerifiedOrgsButton,
  KeyXPremiumButton,
  KeyStatRatioTargetHandle,
  KeyStatRatioEnabled,
  KeyHighlightNonFollowers,
  KeyViralRadarEnabled,
  KeyViralPotentialThreshold,
  KeyViralViralThreshold,
  KeyViralShowNormalBadge,
  KeyViralEnableHighlight,
  KeyViralHighlightStyle,
  KeyViralShowLevels,
  KeyViralShowBadge,
  KeyArticleToc,
  KeyScheduledPanorama,
  KeyScheduledSidebar,
  KeyOwnPostAutoSync,
  KeyComposerMediaGrid,
  KeyMentionByName,
  KeyRadarWidth,
  KeyTweetFilterEnabled,
  KeyTweetFilterAction,
  KeyTweetFilterKeywords,
  KeyJumpToReplies,
  KeySortRepliesByTime,
  KeyRepliesSortOrder,
  KeyAutoLikeOnReply,
  KeyQuickInteraction,
  KeyQuickInteractionDock,
  KeyUserFollowerCount,
  KeyBookmarkCount,
  KeyMediaDownload,
  KeyAiRepostEnabled,
  KeyAiRepostBaseUrl,
  KeyAiRepostApiKey,
  KeyAiRepostModel,
  KeyAiRepostCustomPrompt,
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
  allSettingsKeys,
  defaultPreferences,
} from '../storage-keys'
import { normalizeLanguageSetting, type LanguageSetting } from './i18n'

export type ToggleValue = 'on' | 'off'
export type NavigationLabelMode = 'always' | 'hover' | 'never'
export type ViralHighlightStyle = 'border' | 'background' | 'both' | 'none'
export type ViralLevels = { normal: boolean; potential: boolean; viral: boolean }
export type RadarWidthValue = 'off' | 'wide' | 'full'
export type TweetFilterAction = 'collapse' | 'hide'
export type UserFollowerCountMode = 'all' | 'list' | 'off'

export interface ExtensionSettings {
  [KeyExtensionStatus]: ToggleValue
  [KeyUiLanguage]: LanguageSetting
  [KeyTimelineWidth]: number
  [KeyNavigationButtonsLabels]: NavigationLabelMode
  [KeyNavigationWidth]: number
  [KeyTweetButton]: ToggleValue
  [KeyHomeButton]: ToggleValue
  [KeyExploreButton]: ToggleValue
  [KeyNotificationsButton]: ToggleValue
  [KeyMessagesButton]: ToggleValue
  [KeyGrokButton]: ToggleValue
  [KeyXPremiumButton]: ToggleValue
  [KeyListsButton]: ToggleValue
  [KeyBookmarksButton]: ToggleValue
  [KeyJobsButton]: ToggleValue
  [KeyCommunitiesButton]: ToggleValue
  [KeyArticlesButton]: ToggleValue
  [KeyTopicsButton]: ToggleValue
  [KeyVerifiedOrgsButton]: ToggleValue
  [KeyProfileButton]: ToggleValue
  [KeyChatMoneyButton]: ToggleValue
  [KeyMoreMenuButton]: ToggleValue
  [KeySpamFilterEnabled]: ToggleValue
  [KeySpamThreshold]: number
  [KeySpamDebugMode]: ToggleValue
  [KeySpamRulesEnabled]: string
  [KeySpamKeywordList]: string
  [KeySpamWhitelist]: string
  [KeySpamBlacklist]: string
  [KeySidebarColumn]: ToggleValue
  [KeyStatRatioTargetHandle]: string
  [KeyStatRatioEnabled]: ToggleValue
  [KeyHighlightNonFollowers]: ToggleValue
  [KeyViralRadarEnabled]: ToggleValue
  [KeyViralPotentialThreshold]: number
  [KeyViralViralThreshold]: number
  [KeyViralShowNormalBadge]: ToggleValue
  [KeyViralEnableHighlight]: ToggleValue
  [KeyViralHighlightStyle]: ViralHighlightStyle
  [KeyViralShowLevels]: string
  [KeyViralShowBadge]: ToggleValue
  [KeyArticleToc]: ToggleValue
  [KeyScheduledPanorama]: ToggleValue
  [KeyScheduledSidebar]: ToggleValue
  [KeyOwnPostAutoSync]: ToggleValue
  [KeyComposerMediaGrid]: ToggleValue
  [KeyMentionByName]: ToggleValue
  [KeyRadarWidth]: RadarWidthValue
  [KeyTweetFilterEnabled]: ToggleValue
  [KeyTweetFilterAction]: TweetFilterAction
  [KeyTweetFilterKeywords]: string
  [KeyJumpToReplies]: ToggleValue
  [KeySortRepliesByTime]: ToggleValue
  [KeyRepliesSortOrder]: 'default' | 'newest' | 'oldest'
  [KeyAutoLikeOnReply]: ToggleValue
  [KeyQuickInteraction]: ToggleValue
  [KeyQuickInteractionDock]: ToggleValue
  [KeyBookmarkCount]: ToggleValue
  [KeyMediaDownload]: ToggleValue
  [KeyUserFollowerCount]: UserFollowerCountMode
  [KeyAiRepostEnabled]: ToggleValue
  [KeyAiRepostBaseUrl]: string
  [KeyAiRepostApiKey]: string
  [KeyAiRepostModel]: string
  [KeyAiRepostCustomPrompt]: string
  [KeyAiRepostStylePrompt]: string
  [KeyAiRepostStyleSamples]: string
}

export type SettingsPatch = Partial<Record<keyof ExtensionSettings, unknown>>

const TOGGLE_KEYS = new Set<string>([
  KeyExtensionStatus,
  KeyTweetButton,
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
  KeySpamFilterEnabled,
  KeySpamDebugMode,
  KeySidebarColumn,
  KeyStatRatioEnabled,
  KeyHighlightNonFollowers,
  KeyViralRadarEnabled,
  KeyViralShowNormalBadge,
  KeyViralEnableHighlight,
  KeyViralShowBadge,
  KeyArticleToc,
  KeyScheduledPanorama,
  KeyScheduledSidebar,
  KeyOwnPostAutoSync,
  KeyComposerMediaGrid,
  KeyMentionByName,
  KeyTweetFilterEnabled,
  KeyJumpToReplies,
  KeySortRepliesByTime,
  KeyAutoLikeOnReply,
  KeyQuickInteraction,
  KeyQuickInteractionDock,
  KeyBookmarkCount,
  KeyMediaDownload,
  KeyAiRepostEnabled,
])

function normalizeToggle(value: unknown, fallback: ToggleValue): ToggleValue {
  if (value === 'on' || value === true || value === 'show') return 'on'
  if (value === 'off' || value === false || value === 'hide') return 'off'
  return fallback
}

/** 数值类设置的业务范围，用于 clamp 损坏/越界的 storage 值（对齐各 UI 滑块边界） */
const NUMERIC_RANGES: Partial<Record<string, { min: number; max: number }>> = {
  [KeyTimelineWidth]: { min: 600, max: 800 },
  [KeyNavigationWidth]: { min: 200, max: 275 },
  [KeySpamThreshold]: { min: 20, max: 150 },
  [KeyViralPotentialThreshold]: { min: 0, max: 50000 },
  [KeyViralViralThreshold]: { min: 0, max: 50000 },
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  range?: { min: number; max: number },
): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (!range) return n
  return Math.min(range.max, Math.max(range.min, n))
}

function normalizeNavLabels(value: unknown, fallback: NavigationLabelMode): NavigationLabelMode {
  return value === 'hover' || value === 'always' || value === 'never' ? value : fallback
}

function normalizeViralHighlightStyle(value: unknown, fallback: ViralHighlightStyle): ViralHighlightStyle {
  return value === 'border' || value === 'background' || value === 'both' || value === 'none'
    ? value
    : fallback
}

const VIRAL_LEVELS = ['normal', 'potential', 'viral']

/**
 * 归一化展示级别列表：只保留合法级别、去重、保持 fixed 顺序，非法/空则回退默认。
 */
function normalizeViralLevels(value: unknown, fallback: string): string {
  const tokens = typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
  const set = new Set(tokens.filter((t) => (VIRAL_LEVELS as string[]).includes(t)))
  if (set.size === 0) return fallback
  return VIRAL_LEVELS.filter((l) => set.has(l)).join(',')
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeRadarWidth(value: unknown, fallback: RadarWidthValue): RadarWidthValue {
  return value === 'off' || value === 'wide' || value === 'full' ? value : fallback
}

function normalizeTweetFilterAction(value: unknown, fallback: TweetFilterAction): TweetFilterAction {
  return value === 'collapse' || value === 'hide' ? value : fallback
}

/**
 * 爆款雷达「展示标签级别」解析（单一事实源，content script 与 popup 共用）。
 * 优先读新键 viralShowLevels（逗号分隔）；缺失时按旧键迁移：
 *   normal        ← viralShowNormalBadge === 'on'
 *   potential/viral ← viralEnableHighlight !== 'off'
 */
export function parseViralShowLevels(data: Record<string, unknown> | undefined): ViralLevels {
  // 仅当新键真正缺失时才走旧键迁移；新键存在（含空串）则尊重用户选择，
  // 避免用户清空全部级别后，空串被当作「缺失」而重新启用旧配置。
  if (data && typeof data[KeyViralShowLevels] !== 'undefined') {
    const normalized = normalizeViralLevels(data[KeyViralShowLevels], '')
    const set = new Set(normalized.split(','))
    return {
      normal: set.has('normal'),
      potential: set.has('potential'),
      viral: set.has('viral'),
    }
  }
  return {
    normal: data?.[KeyViralShowNormalBadge] === 'on',
    potential: data?.[KeyViralEnableHighlight] !== 'off',
    viral: data?.[KeyViralEnableHighlight] !== 'off',
  }
}

/**
 * 爆款雷达「高亮样式」解析（单一事实源）。
 * 新键存在则归一化；缺失时按旧键迁移：viralEnableHighlight === 'off' → 'none'，否则 'both'。
 */
export function parseViralHighlightStyle(data: Record<string, unknown> | undefined): ViralHighlightStyle {
  if (data && typeof data[KeyViralHighlightStyle] !== 'undefined') {
    return normalizeViralHighlightStyle(data[KeyViralHighlightStyle], 'both')
  }
  return data?.[KeyViralEnableHighlight] === 'off' ? 'none' : 'both'
}

/**
 * 爆款雷达「是否展示标签」解析（默认开）。'off' 视为关闭，其余（含缺失）为开。
 */
export function parseViralShowBadge(data: Record<string, unknown> | undefined): boolean {
  return data?.[KeyViralShowBadge] !== 'off'
}

export function normalizeSettings(raw: Partial<Record<string, unknown>> = {}): ExtensionSettings {
  const result: Record<string, unknown> = {}

  for (const key of allSettingsKeys) {
    const fallback = defaultPreferences[key]
    const value = raw[key] ?? fallback

    if (TOGGLE_KEYS.has(key)) {
      result[key] = normalizeToggle(value, fallback as ToggleValue)
    } else if (
      key === KeyTimelineWidth ||
      key === KeyNavigationWidth ||
      key === KeySpamThreshold ||
      key === KeyViralPotentialThreshold ||
      key === KeyViralViralThreshold
    ) {
      result[key] = normalizeNumber(value, fallback as number, NUMERIC_RANGES[key])
    } else if (key === KeyUiLanguage) {
      result[key] = normalizeLanguageSetting(value)
    } else if (key === KeyNavigationButtonsLabels) {
      result[key] = normalizeNavLabels(value, fallback as NavigationLabelMode)
    } else if (key === KeyViralHighlightStyle) {
      result[key] = normalizeViralHighlightStyle(value, fallback as ViralHighlightStyle)
    } else if (key === KeyViralShowLevels) {
      result[key] = normalizeViralLevels(value, fallback as string)
    } else if (key === KeyRadarWidth) {
      result[key] = normalizeRadarWidth(value, fallback as RadarWidthValue)
    } else if (key === KeyTweetFilterAction) {
      result[key] = normalizeTweetFilterAction(value, fallback as TweetFilterAction)
    } else if (key === KeyRepliesSortOrder) {
      result[key] = value === 'default' || value === 'newest' || value === 'oldest' ? value : 'newest'
    } else if (key === KeyUserFollowerCount) {
      result[key] =
        value === 'all' || value === 'list' || value === 'off'
          ? value
          : value === 'on'
            ? 'all'
            : fallback
    } else {
      result[key] = normalizeString(value, String(fallback ?? ''))
    }
  }

  // 跨字段约束：potential 阈值必须严格小于 viral 阈值；
  // 旧版本/手动修改/损坏的 storage 可能产生非法组合，此时整体回退默认。
  if ((result[KeyViralPotentialThreshold] as number) >= (result[KeyViralViralThreshold] as number)) {
    result[KeyViralPotentialThreshold] = defaultPreferences[KeyViralPotentialThreshold]
    result[KeyViralViralThreshold] = defaultPreferences[KeyViralViralThreshold]
  }

  return result as unknown as ExtensionSettings
}

export function mergeSettings(base: ExtensionSettings, patch: SettingsPatch): ExtensionSettings {
  return normalizeSettings({ ...base, ...patch })
}

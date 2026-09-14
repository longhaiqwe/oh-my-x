// Individual key exports (matching original storage-keys.js)
export const KeyExtensionStatus = 'extensionStatus'
export const KeyListsButton = 'listsButton'
export const KeyCommunitiesButton = 'communitiesButton'
export const KeyTopicsButton = 'topicsButton'
export const KeyXPremiumButton = 'xPremiumButton'
export const KeyVerifiedOrgsButton = 'verifiedOrgsButton'

export const KeyGrokButton = 'grokButton'

export const KeyTimelineWidth = 'timelineWidth'
export const KeyHomeButton = 'homeButton'
export const KeyExploreButton = 'exploreButton'
export const KeyNotificationsButton = 'notificationsButton'
export const KeyMessagesButton = 'messagesButton'
export const KeyBookmarksButton = 'bookmarksButton'
export const KeyJobsButton = 'jobsButton'
export const KeyArticlesButton = 'articles'
export const KeyProfileButton = 'profileButton'
export const KeyCreatorStudioButton = 'creatorStudioButton'
export const KeyMoreMenuButton = 'moreMenuButton'
export const KeyNavigationButtonsLabels = 'navigationButtonsLabels'
export const KeyTweetButton = 'tweetButton'
export const KeySidebarColumn = 'sidebarColumn'
export const KeyHighlightNonFollowers = 'highlightNonFollowers'
export const KeyArticleToc = 'articleToc'
export const KeyScheduledPanorama = 'scheduledPanorama'

// Spam filter storage keys
export const KeySpamFilterEnabled = 'spamFilterEnabled'
export const KeySpamThreshold = 'spamThreshold'
export const KeySpamDebugMode = 'spamDebugMode'
export const KeySpamRulesEnabled = 'spamRulesEnabled' // per-rule toggles
export const KeySpamKeywordList = 'spamKeywordList' // user-defined marketing keywords
export const KeySpamWhitelist = 'spamWhitelist' // @user
export const KeySpamBlacklist = 'spamBlacklist' // @user
export const KeySpamLog = 'spamLog' // recent intercepts
export const KeySpamStats = 'spamStats' // aggregated daily stats
export const KeyPopupActiveTab = 'popupActiveTab' // last active tab

// Stat ratio storage keys
export const KeyStatRatioTargetHandle = 'statRatioTargetHandle'
export const KeyStatRatioEnabled = 'statRatioEnabled'
export const KeyProfileActivityStats = 'profileActivityStats'
export const KeyScheduledPostsCache = 'scheduledPostsCache'

// Viral Tweet Radar storage keys
export const KeyViralRadarEnabled = 'viralRadarEnabled'
export const KeyViralPotentialThreshold = 'viralPotentialThreshold'
export const KeyViralViralThreshold = 'viralViralThreshold'
export const KeyViralShowNormalBadge = 'viralShowNormalBadge'
export const KeyViralEnableHighlight = 'viralEnableHighlight'
export const KeyViralHighlightStyle = 'viralHighlightStyle' // 'border' | 'background' | 'both' | 'none'
export const KeyViralShowLevels = 'viralShowLevels' // comma-separated: normal,potential,viral
export const KeyViralShowBadge = 'viralShowBadge' // 'on' | 'off'：是否展示标签

export const allSettingsKeys = [
  KeyExtensionStatus,
  KeyTimelineWidth,
  KeyNavigationButtonsLabels,
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
  KeyCreatorStudioButton,
  KeyMoreMenuButton,
  KeySpamFilterEnabled,
  KeySpamThreshold,
  KeySpamDebugMode,
  KeySpamRulesEnabled,
  KeySpamKeywordList,
  KeySpamWhitelist,
  KeySpamBlacklist,
  KeySidebarColumn,
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
] as const

export type SettingKey = (typeof allSettingsKeys)[number]

// 触发 spam filter 重扫的 key 集合
export const SPAM_RELEVANT_KEYS = new Set<string>([
  KeySpamDebugMode,
  KeySpamFilterEnabled,
  KeySpamThreshold,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
  KeySpamWhitelist,
  KeySpamBlacklist,
])

// 触发 爆款雷达 重新处理的 key 集合
export const VIRAL_RELEVANT_KEYS = new Set<string>([
  KeyViralRadarEnabled,
  KeyViralPotentialThreshold,
  KeyViralViralThreshold,
  KeyViralShowNormalBadge,
  KeyViralEnableHighlight,
  KeyViralHighlightStyle,
  KeyViralShowLevels,
  KeyViralShowBadge,
])

// 默认关键词（用户可在 options 页面增删）
export const defaultSpamKeywords = [
  '点击主页',
  '主页见',
  '主页有惊喜',
  '查看主页',
  '个人主页',
  '主页获取',
  '主页领取',
  '私信',
  '私信我',
  '联系我',
  '加我',
  '找我',
  '约会',
  '同城',
  '空降',
  '福利',
  '兼职',
  '固炮',
  '寻固炮',
  '打✈️',
  '打飞机',
  '打胶',
  '主页能打',
  '能打✈️',
  '看她主页',
  '看我主页',
  '看主页',
  '比她骚',
  '没她骚',
  '比我骚',
  '没我骚',
  '玩的开',
  '玩得开',
  '不信你看',
  '福不黑',
  '粉不黑',
  '微密圈',
  '反差',
  '无门槛',
  '低门槛',
  '吃瓜',
  '无偿约',
  '选妃',
  '线下选妃',
  '同城上门',
  '同城约',
  'sao货',
  '没人比她sao',
  '没人比我sao',
  '太涩了',
  '真顶不住',
]

export const defaultPreferences: Record<string, string | number | boolean> = {
  [KeyExtensionStatus]: 'on',
  [KeyTimelineWidth]: 700,
  [KeyNavigationButtonsLabels]: 'always',
  [KeyTweetButton]: 'on',
  [KeyHomeButton]: 'on',
  [KeyExploreButton]: 'on',
  [KeyNotificationsButton]: 'on',
  [KeyMessagesButton]: 'on',
  [KeyGrokButton]: 'on',
  [KeyXPremiumButton]: 'on',
  [KeyListsButton]: 'on',
  [KeyBookmarksButton]: 'on',
  [KeyJobsButton]: 'on',
  [KeyCommunitiesButton]: 'on',
  [KeyArticlesButton]: 'on',
  [KeyTopicsButton]: 'on',
  [KeyVerifiedOrgsButton]: 'on',
  [KeyProfileButton]: 'on',
  [KeyCreatorStudioButton]: 'on',
  [KeyMoreMenuButton]: 'on',
  [KeySpamFilterEnabled]: 'on',
  [KeySpamThreshold]: 55,
  [KeySpamDebugMode]: 'off',
  [KeySpamRulesEnabled]: 'marketing_nickname:on,emoji_ratio:on,short_text:on,random_username:on,marketing_keyword:on,pure_emoji:on,decorated_nickname:on,repeated_chars:on,mention_referral:on',
  [KeySpamKeywordList]: defaultSpamKeywords.join('\n'),
  [KeySpamWhitelist]: '',
  [KeySpamBlacklist]: '',
  [KeySidebarColumn]: 'off',
  [KeyStatRatioTargetHandle]: '*',
  [KeyStatRatioEnabled]: 'on',
  [KeyHighlightNonFollowers]: 'on',
  [KeyViralRadarEnabled]: 'on',
  [KeyViralPotentialThreshold]: 1000,
  [KeyViralViralThreshold]: 10000,
  [KeyViralShowNormalBadge]: 'off',
  [KeyViralEnableHighlight]: 'on',
  [KeyViralHighlightStyle]: 'both',
  [KeyViralShowLevels]: 'potential,viral',
  [KeyViralShowBadge]: 'on',
  [KeyArticleToc]: 'on',
  [KeyScheduledPanorama]: 'on',
}

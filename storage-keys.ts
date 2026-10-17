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
// 已停用：X 把创作者工作室收进了「更多」菜单，弹窗不再提供显隐开关。保留常量供导航图标识别（shared/navItems.ts）使用
export const KeyCreatorStudioButton = 'creatorStudioButton'
export const KeyChatMoneyButton = 'chatMoneyButton'
export const KeyMoreMenuButton = 'moreMenuButton'
export const KeyNavigationButtonsLabels = 'navigationButtonsLabels'
export const KeyTweetButton = 'tweetButton'
export const KeySidebarColumn = 'sidebarColumn'
export const KeyHighlightNonFollowers = 'highlightNonFollowers'
export const KeyArticleToc = 'articleToc'
export const KeyOwnPostAutoSync = 'ownPostAutoSync'
export const KeyScheduledPanorama = 'scheduledPanorama'
export const KeyRadarWidth = 'radarWidth'
export const KeyUserFollowerCount = 'userFollowerCount' // 'all' | 'list' | 'off'
export const KeyBookmarkCount = 'bookmarkCount' // 书签按钮旁显示收藏数
export const KeyMediaDownload = 'mediaDownload' // 分享菜单中的媒体下载选项

// Reply assistant storage keys
export const KeyJumpToReplies = 'jumpToReplies'
export const KeySortRepliesByTime = 'sortRepliesByTime'
export const KeyRepliesSortOrder = 'repliesSortOrder' // 'default' | 'newest' | 'oldest'
export const KeyAutoLikeOnReply = 'autoLikeOnReply'

// Quick interaction storage keys
export const KeyQuickInteraction = 'quickInteraction'
export const KeyQuickInteractionDock = 'quickInteractionDock'

// Quick List storage keys
export const KeyQuickListAdderEnabled = 'quickListAdderEnabled'
export const KeyQuickListNavEnabled = 'quickListNavEnabled'
export const KeyQuickListNavPosition = 'quickListNavPosition' // 'top' | 'sidebar'
export const KeyQuickLists = 'quickLists'

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
export const KeyCreatorRewardsStats = 'creatorRewardsStats'
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

// Tweet filter storage keys
export const KeyTweetFilterEnabled = 'tweetFilterEnabled'
export const KeyTweetFilterAction = 'tweetFilterAction' // 'collapse' | 'hide'
export const KeyTweetFilterKeywords = 'tweetFilterKeywords'

// AI Repost summary storage keys
export const KeyAiRepostEnabled = 'aiRepostEnabled'
export const KeyAiRepostBaseUrl = 'aiRepostBaseUrl'
export const KeyAiRepostApiKey = 'aiRepostApiKey'
export const KeyAiRepostModel = 'aiRepostModel'
export const KeyAiRepostCustomPrompt = 'aiRepostCustomPrompt'

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
  KeyChatMoneyButton,
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
  KeyOwnPostAutoSync,
  KeyRadarWidth,
  KeyTweetFilterEnabled,
  KeyTweetFilterAction,
  KeyTweetFilterKeywords,
  KeyQuickListAdderEnabled,
  KeyQuickListNavEnabled,
  KeyQuickListNavPosition,
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
] as const

export type SettingKey = (typeof allSettingsKeys)[number]

// 触发 tweet filter 重扫的 key 集合
export const TWEET_FILTER_RELEVANT_KEYS = new Set<string>([
  KeyTweetFilterEnabled,
  KeyTweetFilterAction,
  KeyTweetFilterKeywords,
])

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

// 默认推文过滤关键词（第一阶段重点过滤"说个暴论"及相关表达）
export const defaultTweetFilterKeywords = [
  '说个暴论',
  '发个暴论',
  '提个暴论',
  '分享个暴论',
  '来个暴论',
  '一个暴论',
  '暴论：',
  '暴论:',
  '暴论一下',
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
  [KeyListsButton]: 'off',
  [KeyBookmarksButton]: 'on',
  [KeyJobsButton]: 'on',
  [KeyCommunitiesButton]: 'on',
  [KeyArticlesButton]: 'on',
  [KeyTopicsButton]: 'on',
  [KeyVerifiedOrgsButton]: 'on',
  [KeyProfileButton]: 'on',
  [KeyChatMoneyButton]: 'on',
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
  [KeyOwnPostAutoSync]: 'on',
  [KeyRadarWidth]: 'wide',
  [KeyTweetFilterEnabled]: 'on',
  [KeyTweetFilterAction]: 'collapse',
  [KeyTweetFilterKeywords]: defaultTweetFilterKeywords.join('\n'),
  [KeyQuickListAdderEnabled]: 'on',
  [KeyQuickListNavEnabled]: 'on',
  [KeyQuickListNavPosition]: 'top',
  [KeyJumpToReplies]: 'on',
  [KeySortRepliesByTime]: 'on',
  [KeyRepliesSortOrder]: 'newest',
  [KeyAutoLikeOnReply]: 'on',
  [KeyQuickInteraction]: 'on',
  [KeyQuickInteractionDock]: 'on',
  [KeyUserFollowerCount]: 'all',
  [KeyBookmarkCount]: 'on',
  [KeyMediaDownload]: 'on',
  [KeyAiRepostEnabled]: 'on',
  [KeyAiRepostBaseUrl]: 'https://api.openai.com/v1',
  [KeyAiRepostApiKey]: '',
  [KeyAiRepostModel]: 'gpt-4o-mini',
  [KeyAiRepostCustomPrompt]: '',
}

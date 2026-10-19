// Individual key exports (matching original storage-keys.js)
export const KeyExtensionStatus = 'extensionStatus'
export const KeyUiLanguage = 'uiLanguage' // 界面语言：auto（跟随浏览器）/ zh-CN / en
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
export const KeyNavigationWidth = 'navigationWidth' // 左侧导航栏宽度（px），显示导航文字时生效
export const KeyTweetButton = 'tweetButton'
export const KeySidebarColumn = 'sidebarColumn'
export const KeyHighlightNonFollowers = 'highlightNonFollowers'
export const KeyArticleToc = 'articleToc'
export const KeyOwnPostAutoSync = 'ownPostAutoSync'
export const KeyComposerMediaGrid = 'composerMediaGrid' // 发帖框多图两列排版 + 拖动排序
export const KeyScheduledPanorama = 'scheduledPanorama'
export const KeyScheduledSidebar = 'scheduledSidebar' // 右侧栏搜索框下的排期面板
export const KeyScheduledSidebarCollapsed = 'scheduledSidebarCollapsed' // 右侧栏排期面板是否收起（'on' = 收起），属于数据，不是设置项
export const KeyRadarWidth = 'radarWidth'
export const KeyUserFollowerCount = 'userFollowerCount' // 'all' | 'list' | 'off'
export const KeyBookmarkCount = 'bookmarkCount' // 书签按钮旁显示收藏数
export const KeyMediaDownload = 'mediaDownload' // 分享菜单中的媒体下载选项

// Reply assistant storage keys
export const KeyJumpToReplies = 'jumpToReplies'
export const KeyJumpRepliesPosition = 'jumpRepliesPosition' // 直达回复胶囊被拖动后的位置 { right, bottom }，属于数据，不是设置项
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
export const KeyCreatorRewardsHistory = 'creatorRewardsHistory' // 奖励计划 90 天累计曝光的每日记录
export const KeyImpressionsDaily = 'impressionsDaily' // 账号分析的每日整体 / 蓝 V 曝光
export const KeyAccountOverviewQueryId = 'accountOverviewQueryId' // 账号分析接口编号，X 页面里抓到的
export const KeyCreatorRewardsCollapsed = 'creatorRewardsCollapsed' // 弹窗里奖励计划看板是否收起（'on' = 收起），属于数据，不是设置项
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
export const KeyAiRepostStylePrompt = 'aiRepostStylePrompt' // 转发风格描述；留空用默认风格
export const KeyAiRepostStyleSamples = 'aiRepostStyleSamples' // 自己写过的转发样本，每条之间用单独一行 --- 隔开（单段样本也可只空一行）

export const allSettingsKeys = [
  KeyExtensionStatus,
  KeyUiLanguage,
  KeyTimelineWidth,
  KeyNavigationButtonsLabels,
  KeyNavigationWidth,
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
  KeyScheduledSidebar,
  KeyOwnPostAutoSync,
  KeyComposerMediaGrid,
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
  KeyAiRepostStylePrompt,
  KeyAiRepostStyleSamples,
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

// 英文界面的默认垃圾词：英文引流号常用的说法。词会先去掉空格和标点再匹配，
// 所以不收太短或去掉标点后会变成纯数字的词（如 18+ 会变成 18）
export const defaultSpamKeywordsEn = [
  'check my bio',
  'link in bio',
  'link in my bio',
  'in my bio',
  'check my profile',
  'see my profile',
  'visit my profile',
  'click my profile',
  'my pinned post',
  'dm me',
  'dm for',
  'send me a dm',
  'message me on',
  'add me on',
  'whatsapp me',
  'telegram me',
  'onlyfans',
  'only fans',
  'nudes',
  'sexting',
  'hookup',
  'hook up tonight',
  'lonely tonight',
  'horny',
  '🔞',
  'free crypto',
  'crypto signals',
  'trading signals',
  'forex signals',
  'claim your reward',
  'claim your airdrop',
  'earn daily',
  'guaranteed profit',
]

// 英文界面的默认推文屏蔽词，对应中文的「说个暴论」
export const defaultTweetFilterKeywordsEn = [
  'hot take',
  'unpopular opinion',
  'controversial take',
  'spicy take',
]

/** 按插件界面语言取默认垃圾词库；locale 由调用方传（本文件不能引用 shared/i18n，会循环引用） */
export function getDefaultSpamKeywords(locale: string): string[] {
  return locale === 'en' ? defaultSpamKeywordsEn : defaultSpamKeywords
}

/** 按插件界面语言取默认推文屏蔽词 */
export function getDefaultTweetFilterKeywords(locale: string): string[] {
  return locale === 'en' ? defaultTweetFilterKeywordsEn : defaultTweetFilterKeywords
}

// 存储里还没有词库时的兜底值是中文；英文界面的新用户在安装时由 shared/spam-migration.ts 写入英文词库
export const defaultPreferences: Record<string, string | number | boolean> = {
  [KeyExtensionStatus]: 'on',
  [KeyUiLanguage]: 'auto',
  [KeyTimelineWidth]: 700,
  [KeyNavigationButtonsLabels]: 'always',
  [KeyNavigationWidth]: 275,
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
  [KeyScheduledSidebar]: 'on',
  [KeyOwnPostAutoSync]: 'on',
  [KeyComposerMediaGrid]: 'on',
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
  [KeyAiRepostStylePrompt]: '',
  [KeyAiRepostStyleSamples]: '',
}

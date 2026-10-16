// 功能清单：弹窗按模块分组、功能名称与说明的唯一来源。
// 默认值仍以 storage-keys.ts 的 defaultPreferences 为准，这里只记录归属与文案。
import {
  KeyAiRepostApiKey,
  KeyAiRepostBaseUrl,
  KeyAiRepostCustomPrompt,
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
  KeyCreatorStudioButton,
  KeyExploreButton,
  KeyExtensionStatus,
  KeyGrokButton,
  KeyHighlightNonFollowers,
  KeyHomeButton,
  KeyJobsButton,
  KeyJumpToReplies,
  KeyListsButton,
  KeyMediaDownload,
  KeyMessagesButton,
  KeyMoreMenuButton,
  KeyNavigationButtonsLabels,
  KeyNotificationsButton,
  KeyOwnPostAutoSync,
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

export type FeatureModuleId = 'layout' | 'filter' | 'insight' | 'create' | 'engage'

export interface FeatureModule {
  id: FeatureModuleId
  /** 弹窗顶部标签上的短名 */
  tabLabel: string
  /** 模块页标题 */
  title: string
  /** 模块页标题下的一句说明 */
  description: string
}

export interface FeatureDefinition {
  id: string
  module: FeatureModuleId
  label: string
  description: string
  /** 说明下方的补充说明，用于限制条件或注意事项 */
  note?: string
  /** 该功能读写的存储项（设置项和缓存数据都算） */
  storageKeys: readonly string[]
  /** 功能在 X 页面上的使用位置，只有页面内有入口的功能才填写 */
  where?: string
  /** 从属的主功能 id；弹窗中缩进显示在主功能下面 */
  parent?: string
}

export const FEATURE_MODULES: readonly FeatureModule[] = [
  { id: 'layout', tabLabel: '界面', title: '界面与阅读', description: '调整页面布局、导航栏和长文阅读' },
  { id: 'filter', tabLabel: '过滤', title: '内容过滤', description: '隐藏垃圾回复和含屏蔽词的推文' },
  { id: 'insight', tabLabel: '数据', title: '数据洞察', description: '查看创作者奖励进度，在推文和用户旁标注数据' },
  { id: 'create', tabLabel: '创作', title: '创作与发布', description: '在编辑器中引用旧帖、生成转发草稿、查看排期' },
  { id: 'engage', tabLabel: '互动', title: '互动与列表', description: '用快捷键互动，标记未回关账号，管理 Lists' },
]

export const FEATURES: readonly FeatureDefinition[] = [
  // 界面与阅读
  {
    id: 'timelineWidth',
    module: 'layout',
    label: '时间线宽度',
    description: '在 600 到 800 像素之间调整主时间线的宽度',
    storageKeys: [KeyTimelineWidth],
  },
  {
    id: 'sidebarColumn',
    module: 'layout',
    label: '显示右侧边栏',
    description: '右侧的搜索、推荐关注和趋势栏',
    storageKeys: [KeySidebarColumn],
  },
  {
    id: 'tweetButton',
    module: 'layout',
    label: '显示发帖按钮',
    description: '左侧导航栏里的发帖按钮。隐藏后可以按 N 发帖',
    storageKeys: [KeyTweetButton],
  },
  {
    id: 'navigationButtons',
    module: 'layout',
    label: '导航栏按钮',
    description: '点击图标切换是否显示，虚线框表示已隐藏',
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
      KeyCreatorStudioButton,
      KeyChatMoneyButton,
      KeyMoreMenuButton,
    ],
  },
  {
    id: 'navigationLabels',
    module: 'layout',
    label: '导航文字',
    description: '设置导航按钮旁的文字何时显示',
    storageKeys: [KeyNavigationButtonsLabels],
    parent: 'navigationButtons',
  },
  {
    id: 'articleToc',
    module: 'layout',
    label: '长文目录',
    description: '提取长文的一级和二级标题生成目录，点击跳到对应位置',
    storageKeys: [KeyArticleToc],
    where: '长文页和长文编辑器侧边',
  },
  {
    id: 'mediaDownload',
    module: 'layout',
    label: '媒体下载',
    description: '在推文分享菜单中加入下载图片、GIF 和视频的选项',
    storageKeys: [KeyMediaDownload],
    where: '推文的分享菜单',
  },

  // 内容过滤
  {
    id: 'spamFilter',
    module: 'filter',
    label: '垃圾回复过滤',
    description: '按规则给回复打分，分数达到阈值的回复会被隐藏',
    storageKeys: [KeySpamFilterEnabled, KeySpamThreshold, KeySpamDebugMode],
  },
  {
    id: 'spamRules',
    module: 'filter',
    label: '检测规则',
    description: '关闭的规则不参与打分',
    storageKeys: [KeySpamRulesEnabled],
    parent: 'spamFilter',
  },
  {
    id: 'spamKeywords',
    module: 'filter',
    label: '垃圾词库',
    description: '回复命中词库中的词时加分。和正文屏蔽词分开管理',
    storageKeys: [KeySpamKeywordList],
    where: '推文右上角「更多」按钮旁的选词按钮',
    parent: 'spamFilter',
  },
  {
    id: 'spamAccountLists',
    module: 'filter',
    label: '账号例外',
    description: '白名单作者的回复不隐藏，黑名单作者的回复全部隐藏',
    storageKeys: [KeySpamWhitelist, KeySpamBlacklist],
    where: '推文右上角「更多」按钮旁的名单按钮',
  },
  {
    id: 'spamLog',
    module: 'filter',
    label: '拦截记录',
    description: '最近被隐藏的回复，只保存在本机',
    storageKeys: [KeySpamLog, KeySpamStats],
  },
  {
    id: 'tweetFilter',
    module: 'filter',
    label: '正文关键词过滤',
    description: '信息流中正文含屏蔽词的推文会被折叠或隐藏',
    storageKeys: [KeyTweetFilterEnabled, KeyTweetFilterAction, KeyTweetFilterKeywords],
  },

  // 数据洞察
  {
    id: 'creatorRewards',
    module: 'insight',
    label: '原创内容奖励计划',
    description: '显示创作者奖励计划的曝光进度和准入条件',
    storageKeys: [KeyCreatorRewardsStats],
  },
  {
    id: 'profileActivity',
    module: 'insight',
    label: '博主活动度',
    description: '统计当前博主近 7 天的帖子数和回复数',
    storageKeys: [KeyProfileActivityStats],
    where: '博主主页',
  },
  {
    id: 'viralRadar',
    module: 'insight',
    label: '爆款雷达',
    description: '按每小时浏览量把推文分为普通、潜力和爆款，并在信息流中标注',
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
    label: '数据比例徽章',
    description: '在推文下显示浏览量、互动量与作者粉丝数的比值',
    storageKeys: [KeyStatRatioEnabled, KeyStatRatioTargetHandle],
    where: '博主主页的推文下方',
  },
  {
    id: 'followerCount',
    module: 'insight',
    label: '用户粉丝数',
    description: '全部：推文作者和用户列表都显示；仅列表：只在关注、粉丝、搜索等用户列表中显示',
    storageKeys: [KeyUserFollowerCount],
  },
  {
    id: 'bookmarkCount',
    module: 'insight',
    label: '收藏量',
    description: '在推文的书签按钮旁显示收藏数',
    storageKeys: [KeyBookmarkCount],
  },

  // 创作与发布
  {
    id: 'ownPosts',
    module: 'create',
    label: '引用我的帖子',
    description: '在编辑器中搜索自己的帖子和长文，插入链接',
    storageKeys: [KeyOwnPostAutoSync],
    where: '发帖、引用和回复编辑器',
  },
  {
    id: 'aiRepost',
    module: 'create',
    label: 'AI 总结转发',
    description: '引用转发时读取原帖，用你配置的模型生成两条转发草稿',
    storageKeys: [
      KeyAiRepostEnabled,
      KeyAiRepostBaseUrl,
      KeyAiRepostApiKey,
      KeyAiRepostModel,
      KeyAiRepostCustomPrompt,
    ],
    where: '发帖和引用编辑器，「每个人」右侧的按钮',
  },
  {
    id: 'scheduledPanorama',
    module: 'create',
    label: '排期全景',
    description: '列出所有定时帖的发布时间和间隔，间隔过短时提示',
    storageKeys: [KeyScheduledPanorama, KeyScheduledPostsCache],
    where: '定时发布弹窗和草稿箱',
  },

  // 互动与列表
  {
    id: 'quickInteraction',
    module: 'engage',
    label: '快捷键',
    description: '在推文详情页用数字键操作',
    storageKeys: [KeyQuickInteraction],
    where: '推文详情页',
  },
  {
    id: 'quickInteractionDock',
    module: 'engage',
    label: '底部悬浮条',
    description: '在推文详情页底部显示这四个操作的按钮',
    storageKeys: [KeyQuickInteractionDock],
    parent: 'quickInteraction',
  },
  {
    id: 'jumpToReplies',
    module: 'engage',
    label: '直达回复区',
    description: '点击按钮跳到评论区，再点一次回到正文',
    storageKeys: [KeyJumpToReplies],
    where: '长文和长推文页右下角',
  },
  {
    id: 'autoLikeOnReply',
    module: 'engage',
    label: '回复自动点赞',
    description: '回复别人的推文后，给这条推文点赞',
    note: '点赞前随机等待 0.3 到 0.7 秒；已赞过的推文和自己的推文不点',
    storageKeys: [KeyAutoLikeOnReply],
  },
  {
    id: 'nonFollowers',
    module: 'engage',
    label: '未互关标记',
    description: '把没有关注你的账号标红',
    storageKeys: [KeyHighlightNonFollowers],
    where: '你的「正在关注」列表',
  },
  {
    id: 'quickLists',
    module: 'engage',
    label: 'X Lists',
    description: '在头像资料卡和左侧导航栏加入 Lists 入口',
    storageKeys: [KeyQuickListAdderEnabled, KeyQuickListNavEnabled, KeyQuickListNavPosition, KeyQuickLists],
  },
]

/** 不属于任何单个功能的全局设置 */
export const GLOBAL_STORAGE_KEYS: readonly string[] = [KeyExtensionStatus]

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

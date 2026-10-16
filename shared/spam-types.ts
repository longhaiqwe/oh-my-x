// 共享类型定义
export type SpamCategory = 'porn_spam' | 'bot' | 'marketing' | 'low_quality' | 'normal'

export interface RuleHit {
  id: SpamRuleId
  label: string
  score: number
}

export interface SpamEvaluation {
  score: number
  hits: RuleHit[]
  category: SpamCategory
  text: string
  authorHandle: string
}

export type SpamRuleId =
  | 'marketing_nickname'
  | 'emoji_ratio'
  | 'short_text'
  | 'random_username'
  | 'marketing_keyword'
  | 'pure_emoji'
  | 'decorated_nickname'
  | 'repeated_chars'
  | 'mention_referral'

export interface SpamRuleMeta {
  id: SpamRuleId
  label: string
  description: string
  defaultScore: number
  category: Exclude<SpamCategory, 'normal'>
}

export const SPAM_RULES: SpamRuleMeta[] = [
  {
    id: 'marketing_nickname',
    label: '营销昵称',
    description: '昵称包含"点击主页/同城/约会/空降/固炮"等营销词',
    defaultScore: 40,
    category: 'porn_spam',
  },
  {
    id: 'emoji_ratio',
    label: 'Emoji 占比',
    description: '回复中 emoji 数量超过文字长度的一定比例',
    defaultScore: 20,
    category: 'low_quality',
  },
  {
    id: 'short_text',
    label: '评论过短',
    description: '回复少于 8 个字符',
    defaultScore: 10,
    category: 'low_quality',
  },
  {
    id: 'random_username',
    label: '随机用户名',
    description: '用户名是字母和数字的随机组合（特征明显时最高 +25）',
    defaultScore: 10,
    category: 'bot',
  },
  {
    id: 'marketing_keyword',
    label: '垃圾词库',
    description: '回复命中垃圾词库（首词 +35，多词累加最高 65）',
    defaultScore: 35,
    category: 'marketing',
  },
  {
    id: 'pure_emoji',
    label: '纯 Emoji 评论',
    description: '去掉 emoji 后内容为空',
    defaultScore: 40,
    category: 'low_quality',
  },
  {
    id: 'decorated_nickname',
    label: '装饰昵称',
    description: '昵称包含 2 个以上 emoji 图片装饰',
    defaultScore: 15,
    category: 'low_quality',
  },
  {
    id: 'repeated_chars',
    label: '重复字符',
    description: '同字符连续重复 4 次以上',
    defaultScore: 20,
    category: 'low_quality',
  },
  {
    id: 'mention_referral',
    label: '矩阵引流',
    description: '回复中 @ 其他账号，并带随机字符或表情',
    defaultScore: 20,
    category: 'porn_spam',
  },
]

export interface SpamLogEntry {
  id: string
  timestamp: number
  authorHandle: string
  authorName: string
  text: string
  score: number
  category: SpamCategory
  hits: RuleHit[]
  action: 'filter' | 'allow'
}

export interface SpamCategoryStat {
  category: SpamCategory
  label: string
  count: number
}

export interface DailyStats {
  date: string // YYYY-MM-DD
  total: number
  byCategory: Record<SpamCategory, number>
}

export const SPAM_CATEGORY_LABEL: Record<SpamCategory, string> = {
  porn_spam: '色情引流',
  bot: '机器人评论',
  marketing: '营销广告',
  low_quality: '低质量评论',
  normal: '正常评论',
}
